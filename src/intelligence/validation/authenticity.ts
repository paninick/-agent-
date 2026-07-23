/**
 * validation/authenticity.ts — 真实性验证门编排器
 *
 * 把 agents/validators.ts 里 6 个 runGate_* 函数串成一条 pipeline：
 *   evidence + ledger + registry
 *     → runValidationGates(...)
 *     → computeAuthenticityFromGates(...)
 *     → AuthenticityResult
 *
 * 这是 v3 intelligence pipeline 调用 6 道门的统一入口。
 * validators.ts 提供原子门函数；本文件提供"跑一遍 + 聚合"的便利层。
 *
 * 行业无关：不提供 pack 时 gates 使用通用默认。
 * 提供 pack 时 ranges/freshness/trustedSources/schema 从 pack 注入。
 */

import type { EvidenceEntry, IntelligenceSource } from "../types";
import type { IndustryPack, FreshnessConfig, Range } from "../core/industry-pack";
import {
  runProvenanceGate,
  runSchemaGate,
  runRangeGate,
  runFreshnessGate,
  runCrossSourceGate,
  runHistoricalGate,
  aggregateGateScores,
  scoreToAuthenticityFlag
} from "../agents/validators";
import type {
  AuthenticityFlag,
  AuthenticityResult,
  ValidationGateName,
  ValidationGateResult
} from "./types";

export interface ValidationPipelineInput {
  evidence: EvidenceEntry;
  ledger: EvidenceEntry[];
  registrySources: IntelligenceSource[];
  nodeId?: string;
  /** 可选 zod schema，传给 schema_match 门做精确解析（pack.evidenceSchema 的覆盖） */
  zodSchema?: import("zod").ZodTypeAny;
  /** IndustryPack — 提供时 ranges/freshness/trustedSources/schema 从 pack 读取 */
  pack?: IndustryPack;
  /** 注入 now 以保证测试可复现 */
  now?: Date;
}

/**
 * 跑 6 道门，返回每道门的 ValidationGateResult。
 * 门顺序固定（对齐 docs/AGENT_ARCHITECTURE.md §三）：
 *   provenance → schema_match → range_plausibility → freshness → cross_source → historical
 *
 * 提供 pack 时：ranges = pack.knownRanges, freshness = pack.freshnessMaxAgeDays,
 * trustedSources = pack.trustedSourceIds, zodSchema = pack.evidenceSchema（除非被 zodSchema 覆盖）。
 */
export function runValidationGates(input: ValidationPipelineInput): ValidationGateResult[] {
  const { evidence, ledger, registrySources, nodeId, zodSchema, pack, now } = input;
  const ranges: Record<string, Range> = pack?.knownRanges ?? {};
  const freshnessConfig: FreshnessConfig | undefined = pack
    ? { maxAgeDays: pack.freshnessMaxAgeDays, defaultMaxAgeDays: pack.defaultFreshnessMaxAgeDays }
    : undefined;
  const trustedSourceIds = pack?.trustedSourceIds;
  const schema = zodSchema ?? pack?.evidenceSchema;

  return [
    runProvenanceGate(evidence, registrySources, trustedSourceIds),
    runSchemaGate(evidence, schema),
    runRangeGate(evidence, ranges),
    runFreshnessGate(evidence, nodeId, freshnessConfig, now),
    runCrossSourceGate(evidence, ledger),
    runHistoricalGate(evidence, ledger)
  ];
}

/**
 * 从 6 道 ValidationGateResult 聚合成 AuthenticityResult。
 * 任一 blocking 门 → score 0 / flag rejected。
 */
export function computeAuthenticityFromGates(
  gateResults: ValidationGateResult[],
  now: Date = new Date()
): AuthenticityResult {
  const { score, blockingGates } = aggregateGateScores(gateResults);
  const blockingReasons = blockingGates.flatMap((g) =>
    g.reasons.map((r) => `[${g.gate}] ${r}`)
  );
  const flag: AuthenticityFlag = scoreToAuthenticityFlag(score);
  return {
    authenticityScore: round(score),
    flag,
    gateResults,
    blockingReasons,
    checkedAt: now.toISOString()
  };
}

/**
 * 便利函数：一条调用同时跑 6 门 + 聚合。
 * 等价于 computeAuthenticityFromGates(runValidationGates(input), input.now)。
 */
export function evaluateAuthenticity(input: ValidationPipelineInput): AuthenticityResult {
  const gateResults = runValidationGates(input);
  return computeAuthenticityFromGates(gateResults, input.now ?? new Date());
}

/**
 * 批量：对 ledger 中每条 evidence 跑 authenticity。
 * 每条 evidence 的 cross-source / historical 门会看到 ledger 中其它同 subject 的条目。
 * 返回 { evidenceId, result } 数组，方便调用方写回。
 *
 * 提供 pack 时所有 evidence 共用同一 pack 的 ranges/freshness/trustedSources。
 */
export function evaluateAuthenticityBatch(input: {
  ledger: EvidenceEntry[];
  registrySources: IntelligenceSource[];
  nodeId?: string;
  zodSchema?: import("zod").ZodTypeAny;
  pack?: IndustryPack;
  now?: Date;
}): Array<{ evidenceId: string; result: AuthenticityResult }> {
  const { ledger, registrySources, nodeId, zodSchema, pack, now } = input;
  return ledger.map((evidence) => ({
    evidenceId: evidence.id,
    result: evaluateAuthenticity({
      evidence,
      ledger,
      registrySources,
      nodeId,
      zodSchema,
      pack,
      now
    })
  }));
}

/**
 * 按门名取结果（找不到返回 undefined）。
 */
export function getGateResult(
  results: ValidationGateResult[],
  gate: ValidationGateName
): ValidationGateResult | undefined {
  return results.find((r) => r.gate === gate);
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}
