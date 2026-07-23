/**
 * swarm/escalation.ts - 四态处理 + 升级阶梯 + 两阶段审查
 *
 * 吸收 superpowers 的三个核心模式：
 *   - 模式 6：四态状态机 + 4 步升级阶梯
 *   - 模式 4：两阶段审查（规格符合性 -> 质量审查）
 *   - 模式 11/12：执行门 + 系统化调试的停止规则
 *
 * "Never ignore an escalation or force the same model to retry without changes.
 *  If the implementer said it's stuck, something needs to change."
 */

import type {
  AgentRunResult,
  AgentRole,
  SwarmWorkflow,
  ReviewResult,
  ReviewPhase,
  ReviewIssue,
  EscalationAction,
  AgentRoleProfile,
} from "../spine/types";
import { validateContract, verifyCompletion, checkRedFlags } from "./contract";
import { getRoleProfile } from "./profiles";

// === 1. 四态处理（模式 6） ===

/** 状态处理动作 - orchestrator 根据此决定下一步 */
export type StatusAction =
  | { action: "proceed" }
  | { action: "retry_with_context"; context: Record<string, unknown> }
  | { action: "escalate"; escalation: EscalationAction }
  | { action: "record_concerns_and_proceed"; concerns: string[] }
  | { action: "abort"; reason: string };

/**
 * 处理四态结果 - 返回下一步动作。
 *
 * 吸收 superpowers subagent-driven-development 的四态处理逻辑：
 *   completed          -> proceed（进入审查）
 *   done_with_concerns -> 读取 concerns，correctness 问题需修复，observations 记录后继续
 *   needs_context      -> 补充缺失上下文，重试（≤ maxRetries）
 *   blocked            -> 升级阶梯
 *   failed             -> abort
 *
 * @param result     - Agent 执行结果
 * @param workflow   - 工作流声明（含 maxRetries）
 * @param retryCount - 当前重试次数
 * @returns 下一步动作
 */
export function handleAgentStatus(
  result: AgentRunResult,
  workflow: SwarmWorkflow,
  retryCount: number
): StatusAction {
  const maxRetries = workflow.maxRetries ?? 2;

  switch (result.status) {
    case "completed":
      return { action: "proceed" };

    case "done_with_concerns": {
      const concerns = result.concerns ?? [];
      // 区分 correctness 问题和 observation
      // correctness 问题：包含 "missing" / "incorrect" / "wrong" / "fail" 关键词
      const correctnessConcerns = concerns.filter((c) =>
        /missing|incorrect|wrong|fail|error|invalid/i.test(c)
      );

      if (correctnessConcerns.length > 0 && retryCount < maxRetries) {
        // 有 correctness 问题且可重试 -> 重试
        return {
          action: "retry_with_context",
          context: { _correctnessConcerns: correctnessConcerns },
        };
      }

      // 无 correctness 问题或重试次数耗尽 -> 记录后继续
      return {
        action: "record_concerns_and_proceed",
        concerns,
      };
    }

    case "needs_context": {
      if (retryCount < maxRetries) {
        // 补充缺失上下文，重试
        const missingContext = result.missingContext ?? [];
        const context: Record<string, unknown> = {};
        for (const ctx of missingContext) {
          context[ctx] = undefined; // 标记需要 orchestrator 填充
        }
        return { action: "retry_with_context", context };
      }
      // 重试次数耗尽 -> 升级
      return {
        action: "escalate",
        escalation: escalateBlocker(result, retryCount, maxRetries),
      };
    }

    case "blocked":
      return {
        action: "escalate",
        escalation: escalateBlocker(result, retryCount, maxRetries),
      };

    case "failed":
      return {
        action: "abort",
        reason: result.error ?? `Agent ${result.role} failed`,
      };

    default:
      return { action: "proceed" };
  }
}

// === 2. 升级阶梯（模式 6/12） ===

/**
 * 升级阶梯 - blocked 时的 4 步递进式升级。
 *
 * 吸收 superpowers 的 BLOCKED 处理逻辑：
 *   1. Context problem -> provide more context, re-dispatch same model
 *   2. Task requires more reasoning -> re-dispatch with more capable model
 *   3. Task too large -> break into smaller pieces
 *   4. Plan itself is wrong -> escalate to the human
 *
 * "Never ignore an escalation or force the same model to retry without changes."
 *
 * @param result     - Agent 执行结果（blocked 状态）
 * @param retryCount - 当前重试次数
 * @param maxRetries - 最大重试次数
 * @returns 升级动作
 */
export function escalateBlocker(
  result: AgentRunResult,
  retryCount: number,
  maxRetries: number
): EscalationAction {
  const profile = getRoleProfile(result.role);
  const currentTier = profile.modelTier ?? "standard";

  // 阶梯 1：第一次阻塞 -> 补充上下文
  if (retryCount === 0) {
    return {
      type: "provide_context",
      context: {
        _blockerReason: result.blockerReason ?? "unknown blocker",
        _missingContext: result.missingContext ?? [],
      },
    };
  }

  // 阶梯 2：第二次阻塞 -> 升级模型
  if (retryCount === 1) {
    const tierOrder: Array<"fast" | "standard" | "capable"> = ["fast", "standard", "capable"];
    const currentIdx = tierOrder.indexOf(currentTier as "fast" | "standard" | "capable");
    const nextTier = currentIdx < tierOrder.length - 1
      ? tierOrder[currentIdx + 1]
      : currentTier;

    if (nextTier !== currentTier) {
      return {
        type: "escalate_model",
        fromTier: currentTier,
        toTier: nextTier,
      };
    }
    // 已经是最高层级 -> 继续到阶梯 3
  }

  // 阶梯 3：第三次阻塞或模型已是最高 -> 拆分任务
  if (retryCount < maxRetries) {
    return {
      type: "split_task",
      subObjectives: [
        `${result.role} sub-task 1: handle first half of objective`,
        `${result.role} sub-task 2: handle second half of objective`,
      ],
    };
  }

  // 阶梯 4：重试次数耗尽 -> 上报人类
  return {
    type: "escalate_human",
    reason: `Agent ${result.role} blocked after ${retryCount} retries. Blocker: ${result.blockerReason ?? result.error ?? "unknown"}`,
  };
}

// === 3. 两阶段审查（模式 4） ===

/**
 * 两阶段审查调度。
 *
 * 吸收 superpowers 的 spec-reviewer + code-quality-reviewer：
 *   阶段 1：规格符合性审查 - 产出是否符合角色 permittedOutputs + verificationChecklist
 *   阶段 2：质量审查（仅阶段 1 通过后）- 产出质量（confidence、完整性、无越界）
 *
 * "Starting code quality review before spec compliance passes is a red flag."
 *
 * @param role    - 角色名
 * @param result  - 执行结果
 * @param inputs  - 任务输入（供审查参考）
 * @returns 审查结果
 */
export function runTwoPhaseReview(
  role: AgentRole,
  result: AgentRunResult,
  _inputs: Record<string, unknown>
): ReviewResult {
  const profile = getRoleProfile(role);

  // === 阶段 1：规格符合性审查 ===
  const specPhase = runSpecComplianceReview(profile, result);

  // 阶段 1 未通过 -> 不执行阶段 2
  if (specPhase.status === "issues_found") {
    return { specCompliance: specPhase };
  }

  // === 阶段 2：质量审查 ===
  const qualityPhase = runQualityReview(profile, result);

  return {
    specCompliance: specPhase,
    quality: qualityPhase,
  };
}

/**
 * 阶段 1：规格符合性审查。
 *
 * 吸收 superpowers spec-reviewer-prompt.md 的检查逻辑：
 *   - Missing requirements（遗漏的产出）
 *   - Extra/unneeded work（越界产出）
 *   - Misunderstandings（错误的产出）
 *
 * "The implementer finished suspiciously quickly. Verify everything independently."
 */
function runSpecComplianceReview(
  profile: AgentRoleProfile,
  result: AgentRunResult
): ReviewPhase {
  const issues: ReviewIssue[] = [];

  // 检查 1：遗漏的产出 - profile 声明了 permittedOutputs，但 result 中缺失
  for (const expectedOutput of profile.permittedOutputs) {
    if (!hasOutput(result, expectedOutput)) {
      issues.push({
        severity: "critical",
        location: `result.${expectedOutput}`,
        description: `Expected output "${expectedOutput}" is missing from result`,
        why: `Role "${profile.role}" must produce "${expectedOutput}" per permittedOutputs declaration`,
        suggestion: `Ensure the agent produces "${expectedOutput}" before reporting completion`,
      });
    }
  }

  // 检查 2：越界产出 - result 中有不在 permittedOutputs 中的字段
  const actualOutputs = getActualOutputFields(result);
  for (const actual of actualOutputs) {
    if (!profile.permittedOutputs.includes(actual)) {
      issues.push({
        severity: "important",
        location: `result.${actual}`,
        description: `Unexpected output "${actual}" not in permittedOutputs`,
        why: `Role "${profile.role}" should not produce "${actual}" - possible boundary violation`,
        suggestion: `Check if this output belongs to a different role`,
      });
    }
  }

  // 检查 3：验证门 - verificationChecklist 是否满足
  const verification = verifyCompletion(profile, result);
  if (!verification.passed) {
    for (const missing of verification.missingChecks) {
      issues.push({
        severity: "critical",
        location: `verificationChecklist`,
        description: `Verification check failed: ${missing}`,
        why: "NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE",
        suggestion: "Fix the issue or provide explicit verificationEvidence",
      });
    }
  }

  // 检查 4：契约违反
  const violations = validateContract(profile, result, "post");
  for (const v of violations) {
    issues.push({
      severity: v.severity === "critical" ? "critical" : "important",
      location: v.profileField,
      description: v.description,
      why: `Contract violation on ${v.dimension}`,
      suggestion: `Align result with profile.${v.profileField}`,
    });
  }

  // 检查 5：红旗
  const flags = checkRedFlags(profile, result);
  for (const flag of flags) {
    issues.push({
      severity: "critical",
      location: "redFlags",
      description: `Red flag triggered: ${flag}`,
      why: "Red flags indicate the agent should stop and re-evaluate",
      suggestion: "Investigate the flagged condition before proceeding",
    });
  }

  return {
    status: issues.length === 0 ? "approved" : "issues_found",
    issues: issues.length > 0 ? issues : undefined,
    summary: issues.length === 0
      ? "Spec compliance verified: all expected outputs present, no boundary violations, verification checks passed"
      : `${issues.length} issue(s) found: ${issues.filter((i) => i.severity === "critical").length} critical, ${issues.filter((i) => i.severity === "important").length} important, ${issues.filter((i) => i.severity === "minor").length} minor`,
  };
}

/**
 * 阶段 2：质量审查。
 *
 * 吸收 superpowers code-quality-reviewer-prompt.md 的检查逻辑：
 *   - 产出质量（confidence 合理性、完整性）
 *   - 是否有结构性问题
 *
 * 仅在阶段 1 通过后执行。
 */
function runQualityReview(
  profile: AgentRoleProfile,
  result: AgentRunResult
): ReviewPhase {
  const issues: ReviewIssue[] = [];

  // Verifier 质量检查：authenticityScore 是否合理（0-1 范围）
  if (profile.role === "verifier" && result.authenticity) {
    const score = result.authenticity.authenticityScore;
    if (score < 0 || score > 1) {
      issues.push({
        severity: "critical",
        location: "authenticity.authenticityScore",
        description: `authenticityScore ${score} is out of range [0, 1]`,
        why: "Score must be between 0 and 1",
        suggestion: "Check geometricMean calculation",
      });
    }
  }

  // Analyst 质量检查：confidence 是否与 signals 数量匹配
  if (profile.role === "analyst" && result.finding) {
    if (result.finding.confidence > 0 && result.finding.signals.length === 0) {
      issues.push({
        severity: "important",
        location: "finding.signals",
        description: "Finding has confidence > 0 but no signals",
        why: "Confidence should be backed by detected signals",
        suggestion: "Either add signals or lower confidence to 0",
      });
    }
  }

  // Synthesizer 质量检查：brief 是否非空
  if (profile.role === "synthesizer" && result.synthesis) {
    if (!result.synthesis.brief || result.synthesis.brief.trim().length === 0) {
      issues.push({
        severity: "critical",
        location: "synthesis.brief",
        description: "Synthesis brief is empty",
        why: "Brief is the core output of the Synthesizer",
        suggestion: "Generate a non-empty brief summarizing the findings",
      });
    }
  }

  // Memory 质量检查：followUp 是否有 rationale
  if (profile.role === "memory" && result.followUp) {
    const noRationale = result.followUp.filter((f) => !f.rationale || f.rationale.trim().length === 0);
    if (noRationale.length > 0) {
      issues.push({
        severity: "minor",
        location: "followUp.rationale",
        description: `${noRationale.length} follow-up task(s) missing rationale`,
        why: "Rationale explains why the follow-up is needed",
        suggestion: "Add rationale to each follow-up task",
      });
    }
  }

  return {
    status: issues.length === 0 ? "approved" : "issues_found",
    issues: issues.length > 0 ? issues : undefined,
    summary: issues.length === 0
      ? "Quality review passed: outputs meet quality standards"
      : `${issues.length} quality issue(s) found`,
  };
}

// === 辅助函数 ===

/** 检查 result 是否有某个产出字段 */
function hasOutput(result: AgentRunResult, outputName: string): boolean {
  switch (outputName) {
    case "candidateSourceIds":
      return result.candidateSourceIds !== undefined;
    case "evidence":
      return result.evidence !== undefined || result.evidenceList !== undefined;
    case "authenticity":
      return result.authenticity !== undefined;
    case "finding":
      return result.finding !== undefined;
    case "synthesis":
      return result.synthesis !== undefined;
    case "memoryEntry":
      return result.memoryEntry !== undefined;
    case "followUp":
      return result.followUp !== undefined;
    default:
      return true; // 未知字段不阻塞
  }
}

/** 获取 result 中实际产出的字段名列表 */
function getActualOutputFields(result: AgentRunResult): string[] {
  const outputs: string[] = [];
  if (result.candidateSourceIds !== undefined) outputs.push("candidateSourceIds");
  if (result.evidence !== undefined || result.evidenceList !== undefined) outputs.push("evidence");
  if (result.authenticity !== undefined) outputs.push("authenticity");
  if (result.finding !== undefined) outputs.push("finding");
  if (result.synthesis !== undefined) outputs.push("synthesis");
  if (result.memoryEntry !== undefined) outputs.push("memoryEntry");
  if (result.followUp !== undefined) outputs.push("followUp");
  return outputs;
}
