/**
 * swarm/orchestrator.ts - 情报蜂群编排器
 *
 * ⚠️ 命名歧义说明：
 *   本文件导出 `orchestrateSwarm` 函数，用于 Intelligence Swarm 的 10 角色管道。
 *   另有 `runtime/swarmOrchestrator.ts` 导出 `SwarmOrchestrator` 类，
 *   用于 Launch Desk 的 DAG 审批工作流。两者共享零类型，完全独立。
 *
 * 接收 SwarmTrigger -> 读取 SwarmWorkflow 声明 -> 顺序创建 SwarmTask -> 执行 agents -> 收集结果。
 *
 * 吸收 ArkClaw AGENTS.md 思想：执行序列从 DEFAULT_SWARM_WORKFLOW 读取，
 * 而非硬编码 if/else 链。workflow 可替换，orchestrator 代码不变。
 *
 * 吸收 ArkClaw SOUL.md 思想：执行前后对照 AgentRoleProfile 做契约校验。
 *
 * v1 最小实现：顺序执行（不并行）。后续 v2 可加并行调度。
 * v2 已实现：Verifier 步骤内多证据并行验证（Promise.all）。
 */

import type {
  SwarmTrigger,
  SwarmTask,
  AgentRunResult,
  AgentRole,
  RawRecord,
} from "../spine/types";
import type { EvidenceEntry, IntelligenceSource } from "../types";
import type { AuthenticityResult } from "../validation/types";
import type { MemoryStore } from "../memory/store";
import type { MemoryBroker } from "../memory/broker";
import type { ReflexPathway } from "../memory/types";
import { DEFAULT_SWARM_WORKFLOW, getRoleProfile } from "./profiles";
import { executeScout } from "./agents/scout";
import { executeCollector } from "./agents/collector";
import { executeDataJanitor } from "./agents/data-janitor";
import { executeVerifier } from "./agents/verifier";
import { executeAnalyst } from "./agents/analyst";
import { executeDevilsAdvocate } from "./agents/devils-advocate";
import { executeAdjudicator } from "./agents/adjudicator";
import { executeReconciliationScorer } from "./agents/reconciliation-scorer";
import { executeSynthesizer } from "./agents/synthesizer";
import { executeMemory } from "./agents/memory";
import { validateContract, verifyCompletion, checkRedFlags, createVerificationEvidence } from "./contract";
import { handleAgentStatus, runTwoPhaseReview } from "./escalation";
import type { SwarmWorkflow } from "../spine/types";
import type { CostEngine } from "../../services/cost-engine";
import type { CostRecord } from "../../domain/cost";
import { defaultModelProfiles } from "../../models/modelProfiles";
import { WorkflowValidator } from "../../services/workflow-validator";

export interface OrchestratorContext {
  registrySources: IntelligenceSource[];
  /** 原始记录（由调用方注入 — demo 用 fixture，生产环境由 adapter 采集） */
  rawRecords: RawRecord[];
  /** 证据账本（供 cross-source / historical 门参考） */
  ledger?: EvidenceEntry[];
  /** 记忆存储（Memory agent 写入） */
  memoryStore: MemoryStore;
  /** 可选 MemoryBroker — 注入后各 agent 可通过 broker 读写 4 层神经记忆 */
  broker?: MemoryBroker;
  /** 注入 now 以保证测试可复现 */
  now?: Date;
  /**
   * 可选工作流覆盖（模式 1/2）- 不传则用 DEFAULT_SWARM_WORKFLOW。
   * 允许调用方指定精简模式（跳过 scout）或自定义序列。
   */
  workflow?: SwarmWorkflow;
  /**
   * 可选对账结果（Step 3 扩展）- 注入后传递给 analyst 和 synthesizer。
   * 解锁 Analyst 的 Phase F reconciliation edges。
   */
  reconciliations?: import("../reconciliation/types").ReconciliationResult[];
  /**
   * 可选异常列表（Step 3 扩展）- 注入后传递给 analyst 和 synthesizer。
   */
  anomalies?: import("../reconciliation/types").Anomaly[];
  /**
   * 可选成本引擎 - 注入后每步执行记录模型成本到 CostRecord。
   * 不传则不记录成本（向后兼容）。
   */
  costEngine?: CostEngine;
  /**
   * 可选步骤完成回调（流式模式）- 每个步骤执行完毕后调用。
   * 用于 SSE 流式响应，让前端逐步看到 Agent 的执行进度。
   */
  onStepComplete?: (step: number, total: number, role: AgentRole, result: AgentRunResult) => void;
}

export interface SwarmRunResult {
  triggerId: string;
  tasks: SwarmTask[];
  results: AgentRunResult[];
  /** 最终简报（若有） */
  synthesis?: import("../spine/types").SynthesisOutput;
  /** 后续任务（若有） */
  followUps?: import("../spine/types").FollowUpTask[];
  /** 本次运行触发或提取的反射通路（若有 broker） */
  reflexes?: ReflexPathway[];
  /** 成本记录（若注入了 costEngine） */
  costRecord?: CostRecord;
}

let taskCounter = 0;

function nextTaskId(role: AgentRole): string {
  taskCounter += 1;
  return `task-${role}-${taskCounter}`;
}

/**
 * 编排蜂群执行。
 * 按 workflow.steps 顺序创建任务并执行，每步的输出作为下一步的输入。
 */
export async function orchestrateSwarm(
  trigger: SwarmTrigger,
  context: OrchestratorContext
): Promise<SwarmRunResult> {
  const { registrySources, rawRecords, ledger = [], memoryStore, broker, now } = context;
  const pack = trigger.pack;
  const workflow = context.workflow ?? DEFAULT_SWARM_WORKFLOW;
  const costEngine = context.costEngine;

  // v3: 执行前校验工作流结构（NP3 WorkflowValidator 模式）
  const workflowValidator = new WorkflowValidator();
  const validation = workflowValidator.validate(workflow);
  if (!validation.valid) {
    return {
      triggerId: trigger.id,
      tasks: [],
      results: [],
      costRecord: costEngine?.getRecord(trigger.id),
    };
  }

  const tasks: SwarmTask[] = [];
  const results: AgentRunResult[] = [];
  const createdAt = (now ?? new Date()).toISOString();

  // 运行时状态 — 在步骤间传递
  let candidateSourceIds: string[] = [];
  let currentEvidence: EvidenceEntry | undefined;
  let currentEvidenceList: EvidenceEntry[] = [];
  let annotatedEvidence: EvidenceEntry | undefined;
  let annotatedEvidenceList: EvidenceEntry[] = [];
  let findings: import("../spine/types").AnalysisFinding[] = [];
  let challenges: import("../spine/types").DevilsAdvocateOutput | undefined;
  let verdict: import("../spine/types").AdjudicatorOutput | undefined;
  let synthesis: import("../spine/types").SynthesisOutput | undefined;
  let followUps: import("../spine/types").FollowUpTask[] | undefined;
  const triggeredReflexes: ReflexPathway[] = [];

  // v3 性能优化：预计算 modelTier -> ModelProfile 映射，避免每步循环内重复 find()
  const tierToCost: Record<string, "low" | "medium" | "high"> = {
    fast: "low",
    standard: "medium",
    capable: "high",
  };
  const enabledProfiles = defaultModelProfiles.filter((m) => m.enabled);
  const fallbackProfile = enabledProfiles[0];
  const profileByTier = new Map<string, typeof defaultModelProfiles[number]>();
  for (const tier of ["low", "medium", "high"]) {
    profileByTier.set(tier, enabledProfiles.find((m) => m.costTier === tier) ?? fallbackProfile);
  }

  for (const role of workflow.steps) {
    const task: SwarmTask = {
      id: nextTaskId(role),
      triggerId: trigger.id,
      role,
      objective: trigger.objective,
      status: "running",
      inputs: {},
      createdAt,
    };
    tasks.push(task);

    let result: AgentRunResult;

    switch (role) {
      case "scout":
        result = executeScout({ task, registrySources, broker });
        candidateSourceIds = result.candidateSourceIds ?? [];
        break;

      case "collector": {
        // 用 scout 选出的来源过滤 rawRecords；若 scout 没选或过滤后为空，用全部
        const filteredRaw = candidateSourceIds.length > 0
          ? rawRecords.filter((r) => candidateSourceIds.includes(r.sourceId))
          : rawRecords;
        // fallback: 如果 scout 选了来源但 rawRecords 中无匹配，退回使用全部 rawRecords
        const effectiveRaw = filteredRaw.length > 0 ? filteredRaw : rawRecords;
        result = executeCollector({ task, registrySources, rawRecords: effectiveRaw });
        currentEvidence = result.evidence;
        currentEvidenceList = result.evidenceList ?? (currentEvidence ? [currentEvidence] : []);
        break;
      }

      case "data_janitor": {
        if (currentEvidenceList.length === 0) {
          result = { taskId: task.id, role, status: "failed", error: "no evidence from collector" };
          break;
        }
        result = executeDataJanitor({
          task,
          evidenceList: currentEvidenceList,
          pack,
        });
        // Update evidence with cleaned/normalized versions
        if (result.evidenceList && result.evidenceList.length > 0) {
          currentEvidenceList = result.evidenceList;
          currentEvidence = result.evidence;
        }
        break;
      }

      case "verifier": {
        if (currentEvidenceList.length === 0) {
          result = { taskId: task.id, role, status: "failed", error: "no evidence from collector" };
          break;
        }
        // v2 并行验证：每条证据独立跑 6 门（executeVerifier 是纯函数，只读 ledger/registry，无副作用）
        const verifyResults = await Promise.all(
          currentEvidenceList.map((ev) =>
            Promise.resolve(executeVerifier({ task, evidence: ev, ledger, registrySources, pack, now })),
          ),
        );
        annotatedEvidenceList = verifyResults
          .filter((vr) => vr.evidence)
          .map((vr) => vr.evidence as EvidenceEntry);
        // 兼容：annotatedEvidence = 第一条
        annotatedEvidence = annotatedEvidenceList[0];
        // verifier 的 result 取最后一条（状态汇总）
        const lastAuth = (annotatedEvidence as EvidenceEntry & { authenticity?: AuthenticityResult }).authenticity;
        result = {
          taskId: task.id,
          role,
          status: annotatedEvidenceList.length > 0 ? "completed" : "failed",
          evidence: annotatedEvidence,
          authenticity: lastAuth,
        };
        break;
      }

      case "analyst": {
        const evidenceToAnalyze = annotatedEvidenceList.length > 0
          ? annotatedEvidenceList
          : (annotatedEvidence ? [annotatedEvidence] : []);
        result = executeAnalyst({
          task,
          evidence: evidenceToAnalyze,
          pack,
          broker,
          now,
          // Step 3: 传递对账结果，解锁 Analyst Phase F reconciliation edges
          reconciliations: context.reconciliations,
        });
        if (result.finding) findings = [result.finding];
        break;
      }

      case "devils_advocate": {
        if (findings.length === 0) {
          result = { taskId: task.id, role, status: "failed", error: "no findings to challenge" };
          break;
        }
        result = executeDevilsAdvocate({
          task,
          findings,
          evidenceList: annotatedEvidenceList.length > 0
            ? annotatedEvidenceList
            : (annotatedEvidence ? [annotatedEvidence] : []),
          pack,
        });
        if (result.challenges) challenges = result.challenges;
        break;
      }

      case "adjudicator": {
        if (findings.length === 0) {
          result = { taskId: task.id, role, status: "failed", error: "no findings to adjudicate" };
          break;
        }
        result = executeAdjudicator({
          task,
          findings,
          challenges,
          evidenceList: annotatedEvidenceList.length > 0
            ? annotatedEvidenceList
            : (annotatedEvidence ? [annotatedEvidence] : []),
        });
        if (result.verdict) {
          verdict = result.verdict;
          // Update finding confidence based on adjudicator verdicts
          for (const v of result.verdict.verdicts) {
            const finding = findings.find((f) => f.id === v.findingId);
            if (finding) {
              finding.confidence = v.adjustedConfidence;
            }
          }
        }
        break;
      }

      case "reconciliation_scorer": {
        const evidenceToScore = annotatedEvidenceList.length > 0
          ? annotatedEvidenceList
          : (annotatedEvidence ? [annotatedEvidence] : []);
        result = executeReconciliationScorer({
          task,
          evidenceList: evidenceToScore,
          pack,
          reconciliations: context.reconciliations,
        });
        break;
      }

      case "synthesizer": {
        const evidenceIds = annotatedEvidenceList.length > 0
          ? annotatedEvidenceList.map((e) => e.id)
          : (annotatedEvidence ? [annotatedEvidence.id] : []);
        result = executeSynthesizer({
          task,
          trigger,
          findings,
          evidenceIds,
          now,
          // v3: 注入已验证证据 + 行业包，让 Synthesizer 计算供应链真实值推算
          evidence: annotatedEvidenceList.length > 0
            ? annotatedEvidenceList
            : (annotatedEvidence ? [annotatedEvidence] : []),
          pack,
        });
        synthesis = result.synthesis;
        break;
      }

      case "memory": {
        if (!synthesis) {
          result = { taskId: task.id, role, status: "failed", error: "no synthesis to persist" };
          break;
        }
        result = executeMemory({
          task,
          synthesis,
          findings,
          memoryStore,
          broker,
          now,
          // 从 pack 动态读取 industry，修复原硬编码 "apparel"
          industry: pack?.industryId ?? "default",
        });
        followUps = result.followUp;
        break;
      }

      default:
        result = { taskId: task.id, role, status: "failed", error: `unknown role: ${role}` };
    }

    // --- Superpowers 融合：验证门 + 两阶段审查 + 契约校验（模式 1/2/4/13） ---

    const profile = getRoleProfile(role);

    // 模式 5：记录模型选择层级
    task.inputs["_modelTier"] = profile.modelTier ?? "standard";

    // 模式 13：验证门 - 声明 completed 前必须通过验证
    if (result.status === "completed" && workflow.enableVerificationGate !== false) {
      // 生成新鲜验证证据
      const evidence = createVerificationEvidence(role, result, now ?? new Date());
      if (evidence) {
        result.verificationEvidence = evidence;
      }
      // 对照 verificationChecklist 做结构性检查
      const verification = verifyCompletion(profile, result);
      if (!verification.passed) {
        result.status = "done_with_concerns";
        result.concerns = verification.missingChecks;
      }
    }

    // 模式 4：两阶段审查 - 仅 completed 状态执行
    if (result.status === "completed" && workflow.enableReview !== false) {
      const review = runTwoPhaseReview(role, result, task.inputs);
      result.reviewResult = review;
      // 如果规格审查有 critical issues，降级为 done_with_concerns
      if (review.specCompliance.status === "issues_found") {
        const criticalIssues = review.specCompliance.issues?.filter((i) => i.severity === "critical") ?? [];
        if (criticalIssues.length > 0) {
          result.status = "done_with_concerns";
          result.concerns = [...(result.concerns ?? []), ...criticalIssues.map((i) => i.description)];
        }
      }
    }

    // 模式 1/2：契约校验 - 执行后检查
    if (result.status === "completed") {
      const violations = validateContract(profile, result, "post");
      const criticalViolations = violations.filter((v) => v.severity === "critical");
      if (criticalViolations.length > 0) {
        result.status = "done_with_concerns";
        result.concerns = [...(result.concerns ?? []), ...criticalViolations.map((v) => v.description)];
      }
    }

    // 模式 8：红旗检查
    if (result.status === "completed") {
      const flags = checkRedFlags(profile, result);
      if (flags.length > 0) {
        result.status = "done_with_concerns";
        result.concerns = [...(result.concerns ?? []), ...flags];
      }
    }

    // 模式 6：四态处理
    // completed / done_with_concerns (observations) -> 继续
    // done_with_concerns (correctness) -> 记录 concerns，继续（v1 不自动重试）
    // needs_context -> 记录缺失上下文，继续（v1 不自动重试，保持顺序执行）
    // blocked / failed -> 中止（非 memory）
    task.status = result.status === "completed"
      || result.status === "done_with_concerns"
      || result.status === "needs_context"
      ? "completed"
      : "failed";
    results.push(result);

    // D4: 流式回调 — 每步完成后通知调用方（SSE 端点用此逐步推送）
    context.onStepComplete?.(results.length, workflow.steps.length, role, result);

    // 成本追踪：每步执行后记录估算模型成本
    if (costEngine) {
      // 复用上方已获取的 profile（避免重复调用 getRoleProfile）
      // 使用预计算的 profileByTier 映射，避免每步重复 find()
      const targetCostTier = tierToCost[profile.modelTier ?? "standard"];
      const modelProfile = profileByTier.get(targetCostTier) ?? fallbackProfile;
      const stepCost = costEngine.estimateModelCost(
        modelProfile?.inputCostPer1k,
        modelProfile?.outputCostPer1k,
        { inputTokens: 2000, outputTokens: 1000 }, // 默认估算
      );
      costEngine.addCost({
        taskId: trigger.id,
        category: "modelCost",
        amountUsd: stepCost,
        sourceId: `${role}:${modelProfile?.modelId ?? "unknown"}`,
      });

      // 预算守卫：超预算后中止后续步骤（memory 除外，允许持久化已有结果）
      if (!costEngine.assertWithinBudget(trigger.id) && role !== "memory") {
        const budget = costEngine.getBudget(trigger.id);
        const total = costEngine.getRecord(trigger.id)?.totalCost ?? 0;
        // result 已在上方 push（line 328），此处仅修改状态（引用语义，无需再次 push）
        result.status = "done_with_concerns";
        result.concerns = [
          ...(result.concerns ?? []),
          `budget overrun: $${total.toFixed(6)} exceeds $${(budget ?? 0).toFixed(6)} after ${role}`,
        ];
        break;
      }
    }

    // 任一关键步骤失败或阻塞则中止后续（但 memory 失败不影响已完成的 synthesis）
    if ((result.status === "failed" || result.status === "blocked") && role !== "memory") {
      break;
    }
  }

  // 若注入了 broker，尝试从本次运行的 trigger→followUp 模式提取反射通路（肌肉记忆）
  if (broker && followUps && followUps.length > 0) {
    for (const fu of followUps) {
      const reflex = broker.extractReflex(trigger.objective, fu.objective);
      if (reflex && reflex.hitCount === 1) {
        // 只收集本次新建的反射（hitCount===1 表示刚创建）
        triggeredReflexes.push(reflex);
      }
    }
  }

  return {
    triggerId: trigger.id,
    tasks,
    results,
    synthesis,
    followUps,
    reflexes: triggeredReflexes.length > 0 ? triggeredReflexes : undefined,
    costRecord: costEngine?.getRecord(trigger.id),
  };
}
