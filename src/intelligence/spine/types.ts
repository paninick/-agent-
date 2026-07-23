/**
 * spine/types.ts — Automation Spine v1 核心类型
 *
 * 定义自动化情报蜂群系统的全链路类型：
 *   Probe → Trigger → Swarm → Information → Verification → Analysis → Synthesis → Memory → Feedback
 *
 * 复用已有类型（不重声明）：
 *   - EvidenceEntry        (../types)
 *   - ValidationGateResult (../validation/types)
 *   - AuthenticityResult   (../validation/types)
 *   - IndustryPack         (../core/industry-pack)
 *
 * 14 个新类型 + AgentRole 枚举在此声明。
 * 所有时间字段用 ISO string（对齐项目约定：observedAt / checkedAt / timestamp）。
 */

import type { EvidenceEntry } from "../types";
import type { ValidationGateResult, AuthenticityResult } from "../validation/types";
import type { IndustryPack } from "../core/industry-pack";
import type { MemoryAccessDeclaration } from "../memory/types";
// === 1. Probe 探针 ===

/** 探针触发方式 */
export type ProbeKind = "schedule" | "event" | "threshold";

/** 探针 — 监控某个数据源/信号源，定期或事件驱动地采样 */
export interface Probe {
  id: string;
  name: string;
  kind: ProbeKind;
  /** 监控的数据源 ID（对应 IntelligenceSource.id） */
  sourceId: string;
  /** schedule kind 用的 cron 表达式（v1 仅记录，不实际调度） */
  scheduleCron?: string;
  /** 探针参数 — threshold kind 用 { metric, threshold, operator } */
  params: Record<string, unknown>;
  enabled: boolean;
}

/** 探针执行记录 */
export interface ProbeRun {
  id: string;
  probeId: string;
  startedAt: string;
  endedAt?: string;
  status: "running" | "completed" | "failed" | "skipped";
  /** 执行后产生的信号 ID（若 status=completed 且有信号） */
  signalId?: string;
  error?: string;
}

// === 2. Signal 信号 ===

/** 探针产生的信号 — 携带原始 payload，等待 TriggerEngine 判断 */
export interface ProbeSignal {
  id: string;
  probeId: string;
  runId: string;
  emittedAt: string;
  /** 信号载荷 — 结构由 probe.kind 决定 */
  payload: Record<string, unknown>;
}

// === 3. Trigger 触发 ===

/** 触发规则的上下文 — 供 evaluate() 使用 */
export interface TriggerContext {
  /** 已知的证据账本（供规则参考历史） */
  ledger: EvidenceEntry[];
  /** 当前时间（注入以保证测试可复现） */
  now?: Date;
}

/** 触发规则 — 判断一个 ProbeSignal 是否值得启动蜂群 */
export interface TriggerRule {
  id: string;
  name: string;
  /** 返回 true 则触发蜂群，false 则忽略 */
  evaluate: (signal: ProbeSignal, context: TriggerContext) => boolean;
  /** 人类可读的触发原因说明 */
  reason: string;
}

/** 蜂群触发 — 一个被命中的触发，携带目标描述 */
export interface SwarmTrigger {
  id: string;
  ruleId: string;
  signalId: string;
  firedAt: string;
  /** 蜂群目标 — 描述本次情报采集要回答的问题 */
  objective: string;
  /** 可选行业包 — 提供时验证门和分析使用该行业配置 */
  pack?: IndustryPack;
}

// === 4. Swarm 蜂群 ===

/**
 * Agent 角色 — 10 类通用角色（行业无关），分 3 阶段执行：
 *   Phase 1 (Collection+Cleaning): scout → collector → data_janitor
 *   Phase 2 (Analysis+Debate):     verifier → analyst → devils_advocate
 *   Phase 3 (Adjudication+Synth):  adjudicator → reconciliation_scorer → synthesizer → memory
 */
export type AgentRole =
  | "scout" | "collector" | "data_janitor"
  | "verifier" | "analyst" | "devils_advocate"
  | "adjudicator" | "reconciliation_scorer" | "synthesizer" | "memory";

/**
 * Agent 角色行为声明 — 吸收 ArkClaw SOUL.md + IDENTITY.md 思想。
 *
 * 声明式而非注释式：orchestrator 在执行前后可对照 profile 做契约校验，
 * 确保角色不越界（如 Verifier 不可跳过任何验证门）。
 *
 * - identity  = IDENTITY.md：角色自描述（"我是谁"）
 * - boundaries = SOUL.md：行为底线（"绝对不能做什么"）
 * - permittedInputs / permittedOutputs = 契约面
 *
 * 吸收 DeepSeek 提示库四段式 scaffold：
 * - knowledgeBase = 知识储备：角色知道什么（行业配置/值域/时效等）
 * - outputSchema  = 使用说明的输出契约：LLM 驱动时的 JSON Schema 约束
 *
 * 吸收 DeepSeek thinking_mode：
 * - reasoningEffort = 思考深度 high/max（不同角色需要不同推理深度）
 *
 * 吸收 DeepSeek tool_calls：
 * - toolset = 可用工具声明：LLM 驱动时映射为 tools 数组（控制变量之"能用什么"）
 */
export interface AgentRoleProfile {
  role: AgentRole;
  /** IDENTITY: 角色身份描述 */
  identity: string;
  /** SOUL: 行为底线 - 绝对不能做什么 */
  boundaries: string[];
  /** 该角色允许接收的输入字段名 */
  permittedInputs: string[];
  /** 该角色允许产出的输出字段名 */
  permittedOutputs: string[];
  /** 记忆访问声明 - 运行时 MemoryBroker 据此控制读写权限 */
  memoryAccess?: MemoryAccessDeclaration;
  /** 知识储备 - 角色知道什么（吸收 DeepSeek 四段式之"知识储备"）。LLM 驱动时注入 system prompt。 */
  knowledgeBase?: string[];
  /**
   * 输出格式契约 - LLM 驱动时的 JSON Schema 约束（吸收 DeepSeek strict mode）。
   * 用 Zod schema 定义，运行时可 .parse() 校验输出。
   */
  outputSchema?: import("zod").ZodTypeAny;
  /** 思考深度 - 吸收 DeepSeek thinking_mode 的 reasoning_effort。默认 "high"。 */
  reasoningEffort?: "high" | "max";
  /** 可用工具声明 - 吸收 DeepSeek tool_calls。LLM 驱动时映射为 tools 数组。 */
  toolset?: AgentToolDeclaration[];

  // --- Superpowers 融合字段（模式 1/2/5/8） ---

  /**
   * 模型选择层级（模式 5）- 控制器据此选择模型。
   * "fast" = 机械性任务（scout, collector, memory）
   * "standard" = 集成判断任务（verifier, synthesizer）
   * "capable" = 架构/推理任务（analyst）
   */
  modelTier?: "fast" | "standard" | "capable";

  /**
   * 技能优先级类型（模式 1）- rigid 角色必须严格遵循流程，flexible 可适配。
   * Verifier = rigid（不可跳过任何门），Analyst = flexible（因果推理可适配）。
   */
  skillType?: "rigid" | "flexible";

  /**
   * 反合理化表（模式 8）- 每个角色常见的偷懒借口及反驳。
   * orchestrator 在执行前后可参考，LLM 驱动时注入 system prompt。
   */
  antiRationalizations?: AntiRationalizationEntry[];

  /**
   * 红旗列表（模式 8）- 触发时应停止并重新评估的信号。
   * contract.ts 的 checkRedFlags 据此逐项检查。
   */
  redFlags?: string[];

  /**
   * 验证清单（模式 13）- 该角色声明完成前必须通过的检查项。
   * orchestrator 的验证门据此逐项校验。
   */
  verificationChecklist?: string[];
}

/** 反合理化条目（模式 8）- 吸收 superpowers persuasion-principles 的结构化反驳 */
export interface AntiRationalizationEntry {
  /** 借口/合理化思维 */
  excuse: string;
  /** 反驳 - 为什么这个借口不成立 */
  rebuttal: string;
}

/**
 * Agent 工具声明 — 描述一个 agent 可调用的外部能力。
 *
 * 吸收 DeepSeek tool_calls 的 tool 定义格式：
 *   { type: "function", function: { name, description, parameters } }
 *
 * 在纯 TypeScript 模式下，toolset 是声明性的（实际函数由 orchestrator 直接调用）。
 * 在 LLM 驱动模式下，toolset 被序列化为 tools 数组传给 LLM，
 * LLM 返回 tool_calls 后由调度器执行对应函数。
 */
export interface AgentToolDeclaration {
  /** 工具名（对应函数名） */
  name: string;
  /** 工具描述 — 告诉 LLM 这个工具做什么 */
  description: string;
  /** 参数 JSON Schema — 告诉 LLM 怎么调用（吸收 DeepSeek strict mode） */
  parameters: Record<string, unknown>;
}

/**
 * 蜂群工作流声明 — 吸收 ArkClaw AGENTS.md 思想。
 *
 * 把角色执行序列从 orchestrator 硬编码提升为声明式定义。
 * orchestrator 读取 workflow.steps 顺序执行，而非硬编码 if/else 链。
 * v2 可支持不同 workflow（如跳过 scout 的精简模式），无需改 orchestrator 代码。
 */
export interface SwarmWorkflow {
  id: string;
  name: string;
  /** 按顺序执行的角色序列 */
  steps: AgentRole[];
  /** 工作流描述 */
  description?: string;

  // --- Superpowers 融合字段（模式 1/2/4/6/13） ---

  /**
   * 是否启用两阶段审查（模式 4）。
   * 默认 true - 每个角色执行后进行规格审查 + 质量审查。
   * 可关闭以用于精简模式。
   */
  enableReview?: boolean;

  /**
   * 是否启用验证门（模式 13）。
   * 默认 true - 声明 completed 前必须附带 verificationEvidence。
   */
  enableVerificationGate?: boolean;

  /**
   * 最大重试次数 - 四态协议中 needs_context/blocked 的重试上限（模式 6）。
   * 默认 2。
   */
  maxRetries?: number;
}

/** 蜂群任务 — 一个角色的一次执行 */
export interface SwarmTask {
  id: string;
  triggerId: string;
  role: AgentRole;
  /** 任务目标描述 */
  objective: string;
  status: "pending" | "running" | "completed" | "failed" | "blocked" | "needs_context";
  /** 任务输入 — 各角色不同（scout 收 objective，collector 收 RawRecord，etc.） */
  inputs: Record<string, unknown>;
  createdAt: string;
}

/** Agent 执行结果 — 统一返回结构，各角色填充不同字段 */
export interface AgentRunResult {
  taskId: string;
  role: AgentRole;
  /** 四态状态（模式 6） */
  status: AgentStatus;
  /** Collector 产出 — 第一条 evidence（向后兼容） */
  evidence?: EvidenceEntry;
  /** Collector 产出 — 全部 evidence（多指标轮次） */
  evidenceList?: EvidenceEntry[];
  /** Verifier 产出 */
  authenticity?: AuthenticityResult;
  /** Analyst 产出 */
  finding?: AnalysisFinding;
  /** Synthesizer 产出 */
  synthesis?: SynthesisOutput;
  /** Memory agent 产出 */
  memoryEntry?: MemoryEntry;
  /** Memory / Feedback 产出 */
  followUp?: FollowUpTask[];
  /** Scout 产出 — 候选来源 ID 列表 */
  candidateSourceIds?: string[];
  /** Data Janitor 产出 — 数据清洗结果 */
  janitorOutput?: DataJanitorOutput;
  /** Devil's Advocate 产出 — 挑战列表 */
  challenges?: DevilsAdvocateOutput;
  /** Adjudicator 产出 — 裁决结果 */
  verdict?: AdjudicatorOutput;
  /** Reconciliation Scorer 产出 — 对账评分 */
  reconciliationScores?: ReconciliationScorerOutput;
  error?: string;

  // --- Superpowers 融合字段（模式 4/6/13） ---

  /** 实现者的自检结果 - 对应 implementer-prompt 的四维自审（模式 6） */
  selfReview?: AgentSelfReview;
  /** 审查结果 - 两阶段审查输出（模式 4） */
  reviewResult?: ReviewResult;
  /** 验证证据 - 声明完成时必须附带新鲜验证证据（模式 13） */
  verificationEvidence?: VerificationEvidence;
  /** 顾虑说明 - done_with_concerns 时必填 */
  concerns?: string[];
  /** 缺失上下文 - needs_context 时必填 */
  missingContext?: string[];
  /** 阻塞原因 - blocked 时必填 */
  blockerReason?: string;
}

/**
 * Agent 执行状态 - 四态协议（模式 6）。
 * 吸收 superpowers subagent-driven-development 的状态机：
 *   completed          -> DONE：执行成功，进入审查
 *   failed             -> 不可恢复的失败，中止后续步骤
 *   done_with_concerns -> 完成但有顾虑，correctness 问题需修复，observations 可继续
 *   needs_context      -> 缺少必要上下文，补充后重试（≤ maxRetries）
 *   blocked            -> 无法完成，进入升级阶梯
 */
export type AgentStatus =
  | "completed"
  | "failed"
  | "done_with_concerns"
  | "needs_context"
  | "blocked";

/**
 * Agent 自审结果（模式 6）- 吸收 superpowers implementer-prompt 的四维自审。
 * Agent 在声明完成前，应自审四个维度。
 */
export interface AgentSelfReview {
  /** 完整性：是否覆盖了全部输入、有无遗漏 */
  completeness: "pass" | "fail";
  /** 质量性：命名清晰、可维护 */
  quality: "pass" | "fail";
  /** 纪律性：没有过度构建（YAGNI）、遵守角色边界 */
  discipline: "pass" | "fail";
  /** 可验证性：产出可通过外部验证确认 */
  verifiability: "pass" | "fail";
  /** 发现的问题（自审中自己发现并已修复的不计） */
  issues?: string[];
}

/**
 * 两阶段审查结果（模式 4）- 吸收 superpowers 的 spec-reviewer + code-quality-reviewer。
 * 阶段 1 规格符合性 -> 阶段 2 质量审查（仅阶段 1 通过后执行）。
 */
export interface ReviewResult {
  /** 阶段 1：规格符合性审查 */
  specCompliance: ReviewPhase;
  /** 阶段 2：质量审查（仅在阶段 1 通过后执行） */
  quality?: ReviewPhase;
}

/** 单阶段审查 */
export interface ReviewPhase {
  status: "approved" | "issues_found";
  /** 问题列表 - 按严重度分级 */
  issues?: ReviewIssue[];
  /** 审查摘要 */
  summary: string;
}

/** 审查问题 - 吸收 superpowers code-reviewer.md 的严重度分级 */
export interface ReviewIssue {
  severity: "critical" | "important" | "minor";
  /** 问题位置（如 evidenceId、signal name） */
  location: string;
  description: string;
  /** 为什么重要 */
  why: string;
  /** 修复建议 */
  suggestion: string;
}

/**
 * 验证证据（模式 13）- 吸收 superpowers verification-before-completion 的 Iron Law。
 * "NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE"
 * 声明 completed 时必须附带此字段，证明产出经过了新鲜验证。
 */
export interface VerificationEvidence {
  /** 验证方法描述（如 "ran 6 authenticity gates" / "matched 3 sources against registry"） */
  method: string;
  /** 验证命令/操作的标识 */
  checkId: string;
  /** 实际输出摘要 */
  output: string;
  /** 是否通过 */
  passed: boolean;
  /** 验证时间戳 */
  verifiedAt: string;
}

/**
 * 升级动作（模式 6）- 吸收 superpowers 的 4 步升级阶梯。
 * 处理 blocked 状态时的递进式升级。
 */
export type EscalationAction =
  | { type: "provide_context"; context: Record<string, unknown> }
  | { type: "escalate_model"; fromTier: string; toTier: string }
  | { type: "split_task"; subObjectives: string[] }
  | { type: "escalate_human"; reason: string };

// === 5. Information 信息收集 ===

/** 原始记录 — 从数据源获取的未加工数据 */
export interface RawRecord {
  id: string;
  sourceId: string;
  fetchedAt: string;
  /** 原始数据（结构因来源而异） */
  raw: unknown;
  contentType?: string;
}

/** 提取的事实 — 从 RawRecord 中结构化提取的关键信息 */
export interface ExtractedFact {
  id: string;
  rawRecordId: string;
  subject: string;
  claim: string;
  value?: number | string | boolean;
  unit?: string;
  period?: string;
  geography?: string;
}

// === 6. Analysis 分析 ===

/** 分析发现 — Analyst agent 对证据的解读 */
export interface AnalysisFinding {
  id: string;
  taskId: string;
  /** 关联的证据 ID */
  evidenceIds: string[];
  /** 发现摘要 */
  summary: string;
  /** 发现置信度 0-1 */
  confidence: number;
  /** 提取的信号标签（如 "demand_up" / "cost_rising"） */
  signals: string[];
}

// === 6b. Data Janitor 数据清洗 ===

/** 清洗日志条目 — Data Janitor 记录每次数据变换 */
export interface CleaningLogEntry {
  evidenceId: string;
  field: string;
  transform: "unit_conversion" | "anomaly_flagged" | "range_positioned" | "outlier_removed" | "duplicate_merged";
  originalValue?: number | string;
  normalizedValue?: number | string;
  originalUnit?: string;
  normalizedUnit?: string;
  note: string;
  severity?: "info" | "warning" | "critical";
}

/** Data Janitor 输出 — 数据清洗后的结构化结果 */
export interface DataJanitorOutput {
  cleaningLog: CleaningLogEntry[];
  normalizedEvidence: import("../types").EvidenceEntry[];
  anomalyCount: number;
  outlierCount: number;
}

// === 6c. Devil's Advocate 魔鬼代言人 ===

/** 挑战类型 */
export type ChallengeType =
  | "alternative_explanation"
  | "conflicting_evidence"
  | "insufficient_data"
  | "correlation_not_causation";

/** 挑战条目 — Devil's Advocate 对每个 finding 的质疑 */
export interface ChallengeEntry {
  findingId: string;
  signal: string;
  challengeType: ChallengeType;
  counterEvidence: string[];
  alternativeExplanation: string;
  impactScore: number; // 0-1: 该挑战对原 finding 的削弱程度
}

/** Devil's Advocate 输出 */
export interface DevilsAdvocateOutput {
  challenges: ChallengeEntry[];
  overallWeakness: number; // 0-1: 所有 finding 的聚合弱点
}

// === 6d. Adjudicator 裁决者 ===

/** 裁决决定 */
export type VerdictDecision = "upheld" | "modified" | "rejected";

/** 裁决条目 — Adjudicator 对每个 finding 的最终裁决 */
export interface VerdictEntry {
  findingId: string;
  signal: string;
  originalConfidence: number;
  challengeCount: number;
  decision: VerdictDecision;
  adjustedConfidence: number;
  reasoning: string;
}

/** Adjudicator 输出 */
export interface AdjudicatorOutput {
  verdicts: VerdictEntry[];
  overallVerdict: "strong" | "moderate" | "weak" | "insufficient";
  summary: string;
}

// === 6e. Reconciliation Scorer 对账评分器 ===

/** 对账维度评分 */
export interface ReconciliationDimensionScore {
  dimension: string;
  score: number; // 0-100
  status: "matched" | "warning" | "mismatch" | "insufficient_data";
  details: string;
}

/** Reconciliation Scorer 输出 */
export interface ReconciliationScorerOutput {
  dimensions: ReconciliationDimensionScore[];
  overallHealth: number; // 0-100
  criticalMismatches: string[];
}

// === 7. Synthesis 汇总 ===

/** 汇总输出 — Synthesizer agent 产出的情报简报 */
export interface SynthesisOutput {
  id: string;
  triggerId: string;
  title: string;
  /** 简报正文 */
  brief: string;
  /** 关联的发现 */
  findings: AnalysisFinding[];
  /** 关联的证据 ID */
  evidenceIds: string[];
  /** 综合置信度 0-1 */
  confidence: number;
  generatedAt: string;
  /**
   * v3: 供应链真实值推算结果。
   * 可选 - 只有当 Synthesizer 接收到 evidence + pack 时才计算。
   * 包含健康度、偏差、瓶颈节点等整体指标。
   */
  chainEstimate?: import("../analysis/chain-health").ChainHealth;
}

// === 8. Memory 记忆 ===

/** 记忆条目 — 沉淀到长期记忆的知识 */
export interface MemoryEntry {
  id: string;
  /** 记忆键 — 用于 recall */
  key: string;
  /** 记忆类型 */
  kind: "finding" | "synthesis" | "signal" | "fact";
  /** 记忆值（序列化内容） */
  value: string;
  /** 来源任务 ID */
  sourceTaskId?: string;
  createdAt: string;
  tags?: string[];
}

// === 9. Feedback 反馈 ===

/** 后续任务 — Feedback 生成，驱动下一轮 Probe 或 Task */
export interface FollowUpTask {
  id: string;
  /** 来源任务 ID */
  originTaskId: string;
  /** 后续类型：启动新探针 或 新任务 */
  kind: "probe" | "task";
  /** 后续目标 */
  objective: string;
  /** 生成此后续任务的理由 */
  rationale: string;
}

// ValidationGateResult 已在 ../validation/types 声明，此处仅重导出方便 spine 消费者
export type { ValidationGateResult, AuthenticityResult };
