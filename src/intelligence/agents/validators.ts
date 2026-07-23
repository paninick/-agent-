/**
 * validators.ts — v3 6 道数据真实性验证门（行业无关核心）
 *
 * 每道门返回 0-1 分数，0 = FAIL, 0.4/0.7/1.0 = WARN/PASS/STRONG
 * 综合 authenticityScore = geometricMean(6 门)
 *
 * 6 门名称（对齐 docs/AGENT_ARCHITECTURE.md §三）：
 *   provenance / schema_match / range_plausibility / freshness / cross_source / historical
 *
 * ⚠️ 本文件不持有任何行业数据。所有行业配置（值域 / 时效 / 受信来源）
 *    通过 IndustryPack 注入（见 core/industry-pack.ts + analysis/industryPacks/apparel/）。
 *    不提供 pack 时，gates 使用通用默认（空 ranges → 非阻断 0.7，30d 默认时效）。
 *
 * 两层 API：
 *   - 低层：validateProvenance / validateScope / validateRange / validateFreshness
 *           / validateCrossSource / validateHistorical —— 返回 0-1 分数（向后兼容）
 *   - 高层：runGate_* / computeAuthenticityResult —— 返回 ValidationGateResult +
 *           AuthenticityResult（被 validation/authenticity.ts 编排）
 */

import { z } from "zod";
import type { EvidenceEntry, IntelligenceSource } from "../types";
import type { ValidationGateResult } from "../validation/types";
import type { Range, FreshnessConfig } from "../core/industry-pack";
import { GENERIC_FRESHNESS_CONFIG, DEFAULT_FRESHNESS_MAX_AGE_DAYS } from "../core/industry-pack";

// === 门 1: provenance 来源溯源 ===
// 规则：source 在 registry 中 + tier 为 S/A+ → 受信
//       或 sourceId 在 pack.trustedSourceIds 中 → 受信
//       其他 → 0.4（可疑）
//       source 不在 registry → 0（拒绝）
// 本文件不硬编码任何受信来源 ID。

export function validateProvenance(
  evidence: EvidenceEntry,
  registrySources: IntelligenceSource[],
  trustedSourceIds?: Set<string>
): number {
  const source = registrySources.find((s) => s.id === evidence.sourceId);
  if (!source) return 0;  // source_id 不在 registry = 拒绝
  const isTrustedByTier = source.tier === "S" || source.tier === "A+";
  const isTrustedByPack = trustedSourceIds?.has(source.id) ?? false;
  if (!isTrustedByTier && !isTrustedByPack) {
    return 0.4;  // B/C 级来源且不在 pack 受信列表，可疑
  }
  if (source.requiresAuth === true && !evidence.rawRef) {
    return 0.4;  // 需要凭据但无 response 引用
  }
  return 1.0;
}

export function runProvenanceGate(
  evidence: EvidenceEntry,
  registrySources: IntelligenceSource[],
  trustedSourceIds?: Set<string>
): ValidationGateResult {
  const score = validateProvenance(evidence, registrySources, trustedSourceIds);
  const reasons: string[] = [];
  const source = registrySources.find((s) => s.id === evidence.sourceId);
  if (!source) reasons.push(`source "${evidence.sourceId}" not in registry`);
  else if (!(source.tier === "S" || source.tier === "A+") && !(trustedSourceIds?.has(source.id) ?? false)) {
    reasons.push(`source tier ${source.tier} is below A+ and not in pack trusted list (suspect provenance)`);
  } else if (source.requiresAuth === true && !evidence.rawRef) {
    reasons.push("auth-required source has no rawRef");
  } else {
    reasons.push(`trusted source ${source.id} (tier ${source.tier})`);
  }
  return {
    gate: "provenance",
    pass: score > 0,
    blocking: score === 0,
    score,
    reasons,
    affectedDataPointIds: [evidence.id]
  };
}

// === 门 2: scope 字段完整性 ===

export function validateScope(
  evidence: EvidenceEntry,
  zodSchema?: z.ZodTypeAny
): number {
  const required: Array<keyof EvidenceEntry> = ["id", "sourceId", "kind", "subject", "claim", "observedAt"];
  const missing = required.filter((f) => {
    const v = evidence[f];
    return v === undefined || v === null || v === "";
  });
  if (missing.length > 0) return 0;
  if (zodSchema) {
    const result = zodSchema.safeParse(evidence);
    if (!result.success) return 0.4;
  }
  return 1.0;
}

/** Alias for validateScope (schema_match gate). */
export const validateSchemaGate = validateScope;

export function runSchemaGate(
  evidence: EvidenceEntry,
  zodSchema?: z.ZodTypeAny
): ValidationGateResult {
  const required: Array<keyof EvidenceEntry> = ["id", "sourceId", "kind", "subject", "claim", "observedAt"];
  const missing = required.filter((f) => {
    const v = evidence[f];
    return v === undefined || v === null || v === "";
  });
  const reasons: string[] = [];
  let score = 1.0;
  if (missing.length > 0) {
    reasons.push(`missing required fields: ${missing.join(", ")}`);
    score = 0;
  } else if (zodSchema) {
    const result = zodSchema.safeParse(evidence);
    if (!result.success) {
      reasons.push(`zod schema parse failed: ${result.error.issues.map((i) => i.path.join(".")).join("; ")}`);
      score = 0.4;
    } else {
      reasons.push("required fields present + zod schema passes");
    }
  } else {
    reasons.push("required fields present (no zod schema provided)");
  }
  return {
    gate: "schema_match",
    pass: score > 0,
    blocking: score === 0,
    score,
    reasons,
    affectedDataPointIds: [evidence.id]
  };
}

// === 门 3: range 值域合理性 ===
// 值域表从 IndustryPack.knownRanges 注入。不提供时 ranges 为空 → 非阻断 0.7。
// 本文件不硬编码任何行业指标 range。

export function validateRange(
  evidence: EvidenceEntry,
  ranges: Record<string, Range> = {}
): number {
  return runRangeGate(evidence, ranges).score;
}

/** Alias for validateRange (range_plausibility gate). */
export const validateRangeGate = validateRange;

export function runRangeGate(
  evidence: EvidenceEntry,
  ranges: Record<string, Range> = {}
): ValidationGateResult {
  const subject = evidence.subject.toLowerCase();
  let matchedRange: Range | null = null;
  let matchedKey = "";
  for (const [key, range] of Object.entries(ranges)) {
    if (subject.includes(key.replace(/_/g, " ")) || subject.includes(key)) {
      matchedRange = range;
      matchedKey = key;
      break;
    }
  }
  if (!matchedRange) {
    return {
      gate: "range_plausibility",
      pass: true,
      blocking: false,
      score: 0.7,
      reasons: ["no known range matched subject (non-blocking)"],
      affectedDataPointIds: [evidence.id]
    };
  }
  const value = Number(evidence.value);
  if (isNaN(value)) {
    return {
      gate: "range_plausibility",
      pass: false,
      blocking: true,
      score: 0,
      reasons: [`matched range ${matchedKey} but value is non-numeric: ${String(evidence.value)}`],
      affectedDataPointIds: [evidence.id]
    };
  }
  let score: number;
  let reason: string;
  if (value >= matchedRange.min && value <= matchedRange.max) {
    score = 1.0;
    reason = `value ${value} within ${matchedKey} [${matchedRange.min}, ${matchedRange.max}]`;
  } else if (value >= matchedRange.min * 0.8 && value <= matchedRange.max * 1.2) {
    score = 0.7;
    reason = `value ${value} within ±20% boundary of ${matchedKey}`;
  } else if (value >= matchedRange.min * 0.5 && value <= matchedRange.max * 1.5) {
    score = 0.4;
    reason = `value ${value} deviates ±50% from ${matchedKey}`;
  } else {
    score = 0;
    reason = `value ${value} exceeds ±50% of ${matchedKey} [${matchedRange.min}, ${matchedRange.max}]`;
  }
  return {
    gate: "range_plausibility",
    pass: score > 0,
    blocking: score === 0,
    score,
    reasons: [reason],
    affectedDataPointIds: [evidence.id]
  };
}

// === 门 4: freshness 新鲜度 ===
// maxLag 从 IndustryPack.freshnessMaxAgeDays + defaultFreshnessMaxAgeDays 注入。
// 不提供 config 时使用 GENERIC_FRESHNESS_CONFIG（默认 30 天）。
// 本文件不硬编码任何行业 nodeId 的时效规则。

export function validateFreshness(
  evidence: EvidenceEntry,
  nodeId?: string,
  freshnessConfig?: FreshnessConfig
): number {
  return runFreshnessGate(evidence, nodeId, freshnessConfig).score;
}

/** Alias for validateFreshness (freshness gate). */
export const validateFreshnessGate = validateFreshness;

export function runFreshnessGate(
  evidence: EvidenceEntry,
  nodeId?: string,
  freshnessConfig?: FreshnessConfig,
  /** 注入 now 以保证测试可复现（修复原 Date.now() 非确定性 bug）。默认 new Date()。 */
  now: Date = new Date()
): ValidationGateResult {
  const config = freshnessConfig ?? GENERIC_FRESHNESS_CONFIG;
  const ageDays = (now.getTime() - new Date(evidence.observedAt).getTime()) / 86_400_000;
  if (isNaN(ageDays) || ageDays < 0) {
    return {
      gate: "freshness",
      pass: false,
      blocking: true,
      score: 0,
      reasons: [`observedAt "${evidence.observedAt}" is invalid or in the future`],
      affectedDataPointIds: [evidence.id]
    };
  }
  const maxLag = (nodeId && config.maxAgeDays[nodeId]) || config.defaultMaxAgeDays;
  let score: number;
  let reason: string;
  if (ageDays <= maxLag) {
    score = 1.0;
    reason = `age ${ageDays.toFixed(1)}d <= maxLag ${maxLag}d (node=${nodeId ?? "default"})`;
  } else if (ageDays <= maxLag * 2) {
    score = 0.7;
    reason = `age ${ageDays.toFixed(1)}d within 2× maxLag ${maxLag}d`;
  } else if (ageDays <= maxLag * 5) {
    score = 0.4;
    reason = `age ${ageDays.toFixed(1)}d within 5× maxLag ${maxLag}d`;
  } else {
    score = 0;
    reason = `age ${ageDays.toFixed(1)}d exceeds 5× maxLag ${maxLag}d`;
  }
  return {
    gate: "freshness",
    pass: score > 0,
    blocking: score === 0,
    score,
    reasons: [reason],
    affectedDataPointIds: [evidence.id]
  };
}

// === 门 5: crossSource 跨源一致性 ===

export function validateCrossSource(
  evidence: EvidenceEntry,
  ledger: EvidenceEntry[]
): number {
  return runCrossSourceGate(evidence, ledger).score;
}

/** Alias for validateCrossSource (cross_source gate). */
export const validateCrossSourceGate = validateCrossSource;

export function runCrossSourceGate(
  evidence: EvidenceEntry,
  ledger: EvidenceEntry[]
): ValidationGateResult {
  const peers = ledger.filter(
    (e) =>
      e.id !== evidence.id &&
      e.subject === evidence.subject &&
      e.unit === evidence.unit &&
      e.sourceId !== evidence.sourceId
  );
  if (peers.length === 0) {
    return {
      gate: "cross_source",
      pass: true,
      blocking: false,
      score: 0.7,
      reasons: ["no independent cross-source peer available (non-blocking)"],
      affectedDataPointIds: [evidence.id]
    };
  }
  const currentValue = Number(evidence.value);
  if (isNaN(currentValue)) {
    return {
      gate: "cross_source",
      pass: false,
      blocking: false,
      score: 0.5,
      reasons: ["current value non-numeric; cannot compare to peers"],
      affectedDataPointIds: [evidence.id]
    };
  }
  const deviations = peers.map((p) => {
    const v = Number(p.value);
    if (isNaN(v) || (v + currentValue) === 0) return 1;
    return Math.abs(v - currentValue) / ((v + currentValue) / 2);
  });
  const maxDeviation = Math.max(...deviations);
  let score: number;
  let reason: string;
  if (maxDeviation <= 0.05) {
    score = 1.0;
    reason = `max peer deviation ${(maxDeviation * 100).toFixed(1)}% (<=5%)`;
  } else if (maxDeviation <= 0.15) {
    score = 0.7;
    reason = `max peer deviation ${(maxDeviation * 100).toFixed(1)}% (<=15%)`;
  } else if (maxDeviation <= 0.30) {
    score = 0.4;
    reason = `max peer deviation ${(maxDeviation * 100).toFixed(1)}% (<=30%)`;
  } else {
    score = 0;
    reason = `max peer deviation ${(maxDeviation * 100).toFixed(1)}% (>30% — significant cross-source conflict)`;
  }
  return {
    gate: "cross_source",
    pass: score > 0,
    blocking: score === 0,
    score,
    reasons: [reason, `compared against ${peers.length} independent peer(s)`],
    affectedDataPointIds: [evidence.id, ...peers.map((p) => p.id)]
  };
}

// === 门 6: historical 历史正常性 ===

export function validateHistorical(
  evidence: EvidenceEntry,
  ledger: EvidenceEntry[]
): number {
  return runHistoricalGate(evidence, ledger).score;
}

/** Alias for validateHistorical (historical gate). */
export const validateHistoricalGate = validateHistorical;

export function runHistoricalGate(
  evidence: EvidenceEntry,
  ledger: EvidenceEntry[]
): ValidationGateResult {
  const history = ledger
    .filter((e) => e.id !== evidence.id && e.subject === evidence.subject)
    .map((e) => Number(e.value))
    .filter((v) => !isNaN(v))
    .slice(-365);  // 最多 1 年
  if (history.length < 30) {
    return {
      gate: "historical",
      pass: true,
      blocking: false,
      score: 0.7,
      reasons: [`only ${history.length} historical point(s) (<30 required for z-score) — non-blocking`],
      affectedDataPointIds: [evidence.id]
    };
  }
  const mean = history.reduce((a, b) => a + b, 0) / history.length;
  const std = Math.sqrt(history.reduce((sum, v) => sum + (v - mean) ** 2, 0) / history.length);
  if (std === 0) {
    return {
      gate: "historical",
      pass: true,
      blocking: false,
      score: 1.0,
      reasons: ["historical std=0 (constant series); current value matches"],
      affectedDataPointIds: [evidence.id]
    };
  }
  const currentValue = Number(evidence.value);
  if (isNaN(currentValue)) {
    return {
      gate: "historical",
      pass: false,
      blocking: false,
      score: 0.5,
      reasons: ["current value non-numeric; cannot compute z-score"],
      affectedDataPointIds: [evidence.id]
    };
  }
  const zScore = Math.abs((currentValue - mean) / std);
  let score: number;
  let reason: string;
  if (zScore <= 2) {
    score = 1.0;
    reason = `z=${zScore.toFixed(2)} (<=2, normal)`;
  } else if (zScore <= 3) {
    score = 0.7;
    reason = `z=${zScore.toFixed(2)} (<=3, elevated)`;
  } else {
    score = 0;
    reason = `z=${zScore.toFixed(2)} (>3, anomaly)`;
  }
  return {
    gate: "historical",
    pass: score > 0,
    blocking: score === 0,
    score,
    reasons: [reason, `mean=${mean.toFixed(2)}, std=${std.toFixed(2)}, n=${history.length}`],
    affectedDataPointIds: [evidence.id]
  };
}

// === 综合 authenticityScore ===

/**
 * 6 门分数聚合 helper。
 *
 * 规则（对齐 docs/AGENT_ARCHITECTURE.md §四 决策矩阵）：
 *   - 任一门 score = 0（blocking FAIL）→ 整体 0（rejected）
 *   - 否则取几何平均（任一门低分会强力拉低总分）
 *
 * 返回 { score, blockingGates } 供 AuthenticityResult 使用。
 */
export function aggregateGateScores(
  gateResults: ValidationGateResult[]
): { score: number; blockingGates: ValidationGateResult[] } {
  const blockingGates = gateResults.filter((g) => g.blocking);
  if (blockingGates.length > 0) {
    return { score: 0, blockingGates };
  }
  const scores = gateResults.map((g) => g.score);
  if (scores.length === 0) return { score: 0, blockingGates };
  const product = scores.reduce((acc, s) => acc * s, 1);
  return { score: Math.pow(product, 1 / scores.length), blockingGates };
}

export function computeAuthenticity(
  evidence: EvidenceEntry,
  ledger: EvidenceEntry[],
  registrySources: IntelligenceSource[],
  nodeId?: string,
  zodSchema?: z.ZodTypeAny
): number {
  const { score } = computeAuthenticityResult(evidence, ledger, registrySources, { nodeId, zodSchema });
  return score;
}

/** computeAuthenticityResult 的可选配置 */
export interface AuthenticityOptions {
  nodeId?: string;
  zodSchema?: z.ZodTypeAny;
  /** IndustryPack — 提供时 ranges/freshness/trustedSources/schema 从 pack 读取 */
  pack?: import("../core/industry-pack").IndustryPack;
  now?: Date;
}

/**
 * 高层 API：跑完整 6 门，返回 AuthenticityResult。
 * 与 computeAuthenticity 共享同一实现。
 *
 * 不提供 pack 时：ranges 为空（非阻断 0.7），freshness 用通用 30d 默认，
 * trustedSources 只认 S/A+ tier。这是行业无关的默认行为。
 *
 * 提供 pack 时：ranges = pack.knownRanges, freshness = pack.freshnessMaxAgeDays,
 * trustedSources = pack.trustedSourceIds, zodSchema = pack.evidenceSchema。
 */
export function computeAuthenticityResult(
  evidence: EvidenceEntry,
  ledger: EvidenceEntry[],
  registrySources: IntelligenceSource[],
  options: AuthenticityOptions = {}
): { score: number; gateResults: ValidationGateResult[]; blockingReasons: string[] } {
  const pack = options.pack;
  const ranges = pack?.knownRanges ?? {};
  const freshnessConfig: FreshnessConfig | undefined = pack
    ? { maxAgeDays: pack.freshnessMaxAgeDays, defaultMaxAgeDays: pack.defaultFreshnessMaxAgeDays }
    : undefined;
  const trustedSourceIds = pack?.trustedSourceIds;
  const zodSchema = options.zodSchema ?? pack?.evidenceSchema;

  const gateResults: ValidationGateResult[] = [
    runProvenanceGate(evidence, registrySources, trustedSourceIds),
    runSchemaGate(evidence, zodSchema),
    runRangeGate(evidence, ranges),
    runFreshnessGate(evidence, options.nodeId, freshnessConfig),
    runCrossSourceGate(evidence, ledger),
    runHistoricalGate(evidence, ledger)
  ];
  const { score, blockingGates } = aggregateGateScores(gateResults);
  const blockingReasons = blockingGates.flatMap((g) => g.reasons.map((r) => `[${g.gate}] ${r}`));
  return { score: round(score), gateResults, blockingReasons };
}

/**
 * Legacy 4 级 AuthFlag - 保留向后兼容。
 * 新代码应使用 validation/types.ts 的 3 级 AuthenticityFlag (verified/degraded/rejected)。
 * 两者通过各自的 scoreTo* 函数从同一 authenticityScore 映射，不冲突。
 */
export type AuthFlag = "high_authenticity" | "normal" | "low_authenticity" | "rejected";

export function scoreToFlag(score: number): AuthFlag {
  if (score >= 0.85) return "high_authenticity";
  if (score >= 0.70) return "normal";
  if (score >= 0.40) return "low_authenticity";
  return "rejected";
}

/**
 * 跑 6 门并把 AuthenticityResult 写回 evidence（非破坏性：返回新对象）。
 * ledger 不含 evidence 本身时，cross-source / historical 门以"无对照源"非阻断通过。
 *
 * 提供 pack 时，ranges/freshness/trustedSources 从 pack 读取。
 */
export function stampAuthenticity(
  evidence: EvidenceEntry,
  ledger: EvidenceEntry[],
  registrySources: IntelligenceSource[],
  options: AuthenticityOptions = {}
): EvidenceEntry & { authenticity: import("../validation/types").AuthenticityResult } {
  const { score, gateResults, blockingReasons } = computeAuthenticityResult(
    evidence,
    ledger,
    registrySources,
    options
  );
  const flag = scoreToAuthenticityFlag(score);
  const result: import("../validation/types").AuthenticityResult = {
    authenticityScore: round(score),
    flag,
    gateResults,
    blockingReasons,
    checkedAt: (options.now ?? new Date()).toISOString()
  };
  return { ...evidence, authenticity: result };
}

/**
 * 把 0-1 分数映射到三档 AuthenticityFlag（verified / degraded / rejected）。
 * 阈值对齐 docs/AGENT_ARCHITECTURE.md §四 决策矩阵：
 *   >=0.70 verified | 0.40-0.70 degraded | <0.40 rejected
 */
export function scoreToAuthenticityFlag(
  score: number
): import("../validation/types").AuthenticityFlag {
  if (score >= 0.70) return "verified";
  if (score >= 0.40) return "degraded";
  return "rejected";
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}

// 显式导出（避免 TS tree-shake 误删）
export const ALL_VALIDATORS = {
  validateProvenance,
  validateScope,
  validateSchemaGate,
  validateRange,
  validateRangeGate,
  validateFreshness,
  validateFreshnessGate,
  validateCrossSource,
  validateCrossSourceGate,
  validateHistorical,
  validateHistoricalGate,
  computeAuthenticity,
  computeAuthenticityResult,
  stampAuthenticity,
  scoreToFlag,
  scoreToAuthenticityFlag,
  aggregateGateScores,
  runProvenanceGate,
  runSchemaGate,
  runRangeGate,
  runFreshnessGate,
  runCrossSourceGate,
  runHistoricalGate
} as const;

// Range / FreshnessConfig 已从 core/industry-pack 统一导出，此处不再重复导出
// 避免三重导出冲突（core -> validation -> agents 均有导出）
