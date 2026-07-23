/**
 * swarm/cso.ts - CSO (Claude Search Optimization) 描述验证
 *
 * 吸收 superpowers writing-skills 的 CSO 规则：
 *   "Descriptions that summarize workflow cause agents to follow the description
 *    and skip reading the skill body - a documented failure mode."
 *
 * 规则：
 *   1. 描述必须以 "Use when..." 开头（描述触发条件，不描述工作流）
 *   2. 描述不得包含工作流步骤（如 "first do X, then do Y"）
 *   3. 描述必须用第三人称
 *   4. 描述应包含关键词以辅助搜索匹配
 *   5. 描述长度 <= 1024 字符
 */

import type { AgentRole } from "../spine/types";

// === CSO 元数据类型 ===

/** CSO 元数据 - 描述一个 agent/技能的搜索优化信息 */
export interface CSOMetadata {
  /** 名称 */
  name: string;
  /** 描述 - 必须以 "Use when..." 开头，只写触发条件 */
  description: string;
  /** 搜索关键词 */
  keywords: string[];
}

// === CSO 验证 ===

/** CSO 验证结果 */
export interface CSOValidationResult {
  /** 是否通过验证 */
  valid: boolean;
  /** 发现的问题列表 */
  issues: string[];
}

/** 工作流描述的模式 - 出现这些词意味着描述包含了工作流 */
const WORKFLOW_PATTERNS = [
  /\bfirst\b.*\bthen\b/i,
  /\bstep \d/i,
  /\bphase \d/i,
  /\bstage \d/i,
  /\b步骤\s*\d/i,
  /\b阶段\s*\d/i,
  /\b先.*再/i,
  /\b首先.*然后/i,
];

/**
 * 验证 CSO 描述是否符合规范。
 *
 * 检查项：
 *   1. 是否以 "Use when..." 开头
 *   2. 是否包含工作流描述（禁止）
 *   3. 是否第三人称
 *   4. 关键词是否覆盖
 *   5. 长度是否 <= 1024 字符
 *
 * @param metadata - CSO 元数据
 * @returns 验证结果
 */
export function validateCSODescription(metadata: CSOMetadata): CSOValidationResult {
  const issues: string[] = [];
  const desc = metadata.description.trim();

  // 检查 1：以 "Use when..." 开头
  if (!/^use when/i.test(desc) && !/^当.*时/i.test(desc)) {
    issues.push('Description must start with "Use when..." (describing trigger conditions, not workflow)');
  }

  // 检查 2：不包含工作流描述
  for (const pattern of WORKFLOW_PATTERNS) {
    if (pattern.test(desc)) {
      issues.push(`Description contains workflow description (matched /${pattern.source}/) - descriptions should only contain trigger conditions, not workflow steps`);
      break;
    }
  }

  // 检查 3：第三人称（不应出现 "I" / "you" / "we" 作为主语）
  if (/\b(I|you|we)\b/i.test(desc.split("Use when")[0])) {
    issues.push('Description should be third-person - avoid "I/you/we" pronouns');
  }

  // 检查 4：关键词覆盖
  if (!metadata.keywords || metadata.keywords.length === 0) {
    issues.push("Keywords array is empty - add keywords to improve search matching");
  }

  // 检查 5：长度限制
  if (desc.length > 1024) {
    issues.push(`Description is ${desc.length} characters - must be <= 1024`);
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

// === CSO 元数据构建器 ===

/**
 * 构建 CSO 元数据。
 *
 * @param name             - 名称
 * @param triggerConditions - 触发条件描述（不含 "Use when" 前缀，函数自动添加）
 * @param keywords         - 搜索关键词
 * @returns CSO 元数据
 */
export function buildCSOMetadata(
  name: string,
  triggerConditions: string,
  keywords: string[]
): CSOMetadata {
  return {
    name,
    description: `Use when ${triggerConditions}`,
    keywords,
  };
}

// === 6 个 Agent 角色的 CSO 元数据 ===

/**
 * 为 6 个 Agent 角色生成 CSO 元数据。
 *
 * 描述只写触发条件（何时需要该角色），不写工作流。
 */
export const AGENT_CSO_METADATA: Record<AgentRole, CSOMetadata> = {
  scout: buildCSOMetadata(
    "scout",
    "a swarm trigger needs to identify which data sources are relevant to the objective",
    ["source matching", "candidate sources", "registry", "source discovery"]
  ),
  collector: buildCSOMetadata(
    "collector",
    "raw records need to be transformed into structured evidence entries with source attribution",
    ["evidence", "raw record", "extraction", "structured data"]
  ),
  data_janitor: buildCSOMetadata(
    "data_janitor",
    "collected evidence needs deduplication, normalization, range positioning, or anomaly detection",
    ["data quality", "normalization", "deduplication", "anomaly detection"]
  ),
  verifier: buildCSOMetadata(
    "verifier",
    "evidence entries need authenticity validation through 6 gates (provenance/schema/range/freshness/cross-source/historical)",
    ["authenticity", "validation", "gates", "verification", "trust score"]
  ),
  analyst: buildCSOMetadata(
    "analyst",
    "verified evidence needs interpretation to detect signals and build causal associations",
    ["analysis", "signals", "causal", "attribution", "findings"]
  ),
  devils_advocate: buildCSOMetadata(
    "devils_advocate",
    "analysis findings need adversarial challenge for alternative explanations, conflicts, or weak causal support",
    ["challenge", "counter-evidence", "causality", "robustness"]
  ),
  adjudicator: buildCSOMetadata(
    "adjudicator",
    "analysis findings and adversarial challenges need a confidence-adjusted final verdict",
    ["adjudication", "verdict", "confidence", "decision"]
  ),
  reconciliation_scorer: buildCSOMetadata(
    "reconciliation_scorer",
    "evidence and adjudicated findings need cross-dimension consistency and health scoring",
    ["reconciliation", "consistency", "health score", "mismatch"]
  ),
  synthesizer: buildCSOMetadata(
    "synthesizer",
    "analysis findings need to be aggregated into a single intelligence brief with chain estimation",
    ["synthesis", "brief", "aggregation", "chain health", "summary"]
  ),
  memory: buildCSOMetadata(
    "memory",
    "synthesis output needs to be persisted to long-term memory and follow-up tasks generated",
    ["memory", "persistence", "follow-up", "feedback loop", "reflex"]
  ),
};
