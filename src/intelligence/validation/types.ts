/**
 * validation/types.ts — 统一真实性验证类型
 *
 * 6 道门名称对齐 docs/AGENT_ARCHITECTURE.md §三：
 *   provenance / schema_match / range_plausibility / freshness / cross_source / historical
 */

export type ValidationGateName =
  | "provenance"
  | "schema_match"
  | "range_plausibility"
  | "freshness"
  | "cross_source"
  | "historical";

export type ValidationGateResult = {
  gate: ValidationGateName;
  pass: boolean;
  score: number;
  blocking: boolean;
  reasons: string[];
  affectedDataPointIds: string[];
};

export type AuthenticityFlag = "verified" | "degraded" | "rejected";

export type AuthenticityResult = {
  authenticityScore: number;
  flag: AuthenticityFlag;
  gateResults: ValidationGateResult[];
  blockingReasons: string[];
  checkedAt: string;
};

/**
 * EvidenceEntry 增强视图 — 附带 authenticity 结果。
 * 不修改 EvidenceEntry 原类型（types.ts），用交叉类型非破坏性扩展。
 */
export type AnnotatedEvidence = import("../types").EvidenceEntry & {
  authenticity: AuthenticityResult;
};
