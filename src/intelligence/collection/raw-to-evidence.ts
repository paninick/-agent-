/**
 * collection/raw-to-evidence.ts — 原始记录 → 事实 → 证据条目
 *
 * 两步转换：
 *   1. rawRecordToExtractedFact(raw): 从 RawRecord 提取结构化 ExtractedFact
 *   2. extractedFactToEvidence(fact, source): 把 ExtractedFact 转成 EvidenceEntry
 *
 * 复用 evidenceLedger.ts 的 createEvidenceEntry（保证字段完整 + ID 稳定）。
 */

import type { RawRecord, ExtractedFact } from "../spine/types";
import type { EvidenceEntry, EvidenceKind, IntelligenceSource } from "../types";
import { createEvidenceEntry } from "../evidenceLedger";

/**
 * 从 RawRecord 提取结构化事实。
 * v1 最小实现：raw 期望是 { subject, claim, value?, unit?, period?, geography? } 结构。
 * 若 raw 结构不符，提供 fallback 字段。
 */
export function rawRecordToExtractedFact(
  raw: RawRecord,
  now: Date = new Date()
): ExtractedFact {
  const data = (raw.raw ?? {}) as Record<string, unknown>;
  const factId = `fact-${raw.id}-${now.getTime().toString(36)}`;
  return {
    id: factId,
    rawRecordId: raw.id,
    subject: String(data.subject ?? "unknown"),
    claim: String(data.claim ?? "no claim extracted"),
    value: (data.value as number | string | boolean) ?? undefined,
    unit: (data.unit as string) ?? undefined,
    period: (data.period as string) ?? undefined,
    geography: (data.geography as string) ?? undefined,
  };
}

/**
 * 把 ExtractedFact 转成 EvidenceEntry。
 * 需要提供对应的 IntelligenceSource（从 registry 查询）。
 * kind 由调用方指定（默认 market_signal）。
 */
export function extractedFactToEvidence(
  fact: ExtractedFact,
  source: IntelligenceSource,
  kind: EvidenceKind = "market_signal",
  observedAt: string = new Date().toISOString()
): EvidenceEntry {
  return createEvidenceEntry({
    source,
    kind,
    subject: fact.subject,
    claim: fact.claim,
    value: fact.value,
    unit: fact.unit,
    period: fact.period,
    geography: fact.geography,
    method: "api",
    observedAt,
    notes: [`extracted from raw record ${fact.rawRecordId}`],
  });
}

/**
 * 便利函数：一步从 RawRecord 直达 EvidenceEntry。
 */
export function rawRecordToEvidence(
  raw: RawRecord,
  source: IntelligenceSource,
  kind?: EvidenceKind,
  observedAt?: string
): EvidenceEntry {
  const fact = rawRecordToExtractedFact(raw);
  return extractedFactToEvidence(fact, source, kind, observedAt);
}
