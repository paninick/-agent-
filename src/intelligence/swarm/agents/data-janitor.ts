/**
 * swarm/agents/data-janitor.ts — Data Janitor Agent
 *
 * 角色：清洗、规范化、验证原始证据，使其可被后续分析消化。
 *
 * 三项核心任务：
 *   1. Unit normalization — 统一单位（如 FRED "JPY per USD" → 数值型）
 *   2. Anomaly detection  — 对比 pack.knownRanges 标记异常值
 *   3. Range positioning  — 计算值在已知范围内的百分位
 *
 * 约束：不丢弃证据，只标记；不捏造值；所有变换记录到 cleaningLog。
 */

import type { AgentRunResult, SwarmTask, CleaningLogEntry, DataJanitorOutput } from "../../spine/types";
import type { EvidenceEntry } from "../../types";
import type { IndustryPack } from "../../core/industry-pack";

export interface DataJanitorInput {
  task: SwarmTask;
  /** Collector 产出的证据列表 */
  evidenceList: EvidenceEntry[];
  /** 可选行业包 — 提供 knownRanges 用于异常检测和范围定位 */
  pack?: IndustryPack;
}

/**
 * 执行 Data Janitor agent。
 * 遍历 evidenceList，对每条证据做单位规范化、异常检测、范围定位。
 */
export function executeDataJanitor(input: DataJanitorInput): AgentRunResult {
  const { task, evidenceList, pack } = input;

  if (evidenceList.length === 0) {
    return {
      taskId: task.id,
      role: "data_janitor",
      status: "failed",
      error: "no evidence from collector",
    };
  }

  const cleaningLog: CleaningLogEntry[] = [];
  const normalizedEvidence: EvidenceEntry[] = [];
  let anomalyCount = 0;
  let outlierCount = 0;

  // 重复检测缓存：subject+period → index
  const seen = new Map<string, number>();

  for (const ev of evidenceList) {
    const normalized = { ...ev };
    const numericValue = extractNumericValue(ev.value);

    // 1. 重复检测
    const dedupeKey = `${ev.subject}::${ev.period ?? ""}`;
    const existingIdx = seen.get(dedupeKey);
    if (existingIdx !== undefined) {
      const existingEvidence = normalizedEvidence[existingIdx];
      if (!existingEvidence) continue;
      cleaningLog.push({
        evidenceId: ev.id,
        field: "duplicate",
        transform: "duplicate_merged",
        originalValue: toLogValue(ev.value),
        normalizedValue: toLogValue(existingEvidence.value),
        note: `Duplicate of evidence ${existingEvidence.id} (same subject+period)`,
        severity: "warning",
      });
      continue;
    }

    // 2. 范围定位 + 异常检测（需要 pack + numeric value）
    if (numericValue !== undefined && pack) {
      const rangeEntry = findMatchingRange(ev.subject, pack);

      if (rangeEntry) {
        const { key, range } = rangeEntry;
        const rangeSpan = range.max - range.min;
        const percentile = rangeSpan > 0
          ? Math.round(((numericValue - range.min) / rangeSpan) * 100)
          : 50;

        cleaningLog.push({
          evidenceId: ev.id,
          field: key,
          transform: "range_positioned",
          originalValue: numericValue,
          normalizedValue: `${percentile}th percentile in [${range.min}-${range.max} ${range.unit ?? ""}]`,
          note: `Value ${numericValue} is at ${percentile}% of known range`,
          severity: "info",
        });

        // 异常检测：值超出范围 50% 以上
        const overflow = rangeSpan > 0
          ? Math.max(0, numericValue - range.max, range.min - numericValue) / rangeSpan
          : 0;

        if (overflow > 0.5) {
          anomalyCount++;
          cleaningLog.push({
            evidenceId: ev.id,
            field: key,
            transform: "anomaly_flagged",
            originalValue: numericValue,
            note: `Value ${numericValue} is ${Math.round(overflow * 100)}% outside known range [${range.min}-${range.max}]`,
            severity: overflow > 1.0 ? "critical" : "warning",
          });
        }

        // 极端离群值：超出范围 200% → 标记为 outlier
        if (overflow > 2.0) {
          outlierCount++;
          cleaningLog.push({
            evidenceId: ev.id,
            field: key,
            transform: "outlier_removed",
            originalValue: numericValue,
            note: `Extreme outlier: ${Math.round(overflow * 100)}% outside range, flagged for review`,
            severity: "critical",
          });
        }
      }
    }

    // 3. 单位规范化
    if (ev.unit && numericValue !== undefined) {
      const normalized = normalizeUnit(ev);
      if (normalized.changed) {
        cleaningLog.push({
          evidenceId: ev.id,
          field: "unit",
          transform: "unit_conversion",
          originalUnit: ev.unit,
          normalizedUnit: normalized.unit,
          originalValue: numericValue,
          normalizedValue: normalized.value,
          note: normalized.note ?? `Unit converted from ${ev.unit}`,
          severity: "info",
        });
      }
    }

    seen.set(dedupeKey, normalizedEvidence.length);
    normalizedEvidence.push(normalized);
  }

  const janitorOutput: DataJanitorOutput = {
    cleaningLog,
    normalizedEvidence,
    anomalyCount,
    outlierCount,
  };

  return {
    taskId: task.id,
    role: "data_janitor",
    status: "completed",
    evidence: normalizedEvidence[0],
    evidenceList: normalizedEvidence,
    janitorOutput,
  };
}

// === Helper functions ===

function extractNumericValue(value: number | string | boolean | undefined): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return undefined;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? undefined : parsed;
}

function toLogValue(value: number | string | boolean | undefined): number | string | undefined {
  return typeof value === "boolean" ? undefined : value;
}

function findMatchingRange(
  subject: string,
  pack: IndustryPack,
): { key: string; range: { min: number; max: number; unit?: string } } | undefined {
  const ranges = pack.knownRanges;
  // 精确匹配
  if (ranges[subject]) return { key: subject, range: ranges[subject] };
  // 模糊匹配：subject 包含 range key 或反之
  for (const [key, range] of Object.entries(ranges)) {
    if (subject.toLowerCase().includes(key.toLowerCase()) || key.toLowerCase().includes(subject.toLowerCase())) {
      return { key, range };
    }
  }
  return undefined;
}

interface NormalizedUnit {
  changed: boolean;
  value?: number;
  unit?: string;
  note?: string;
}

function normalizeUnit(ev: EvidenceEntry): NormalizedUnit {
  const unit = ev.unit ?? "";
  const numericValue = extractNumericValue(ev.value);
  if (numericValue === undefined) return { changed: false };

  // FRED series: "FRED series native unit (JPY per USD)" → "JPY/USD"
  if (unit.includes("FRED series native unit")) {
    const match = unit.match(/\((.+)\)/);
    const extractedUnit = match?.[1];
    if (extractedUnit) {
      return {
        changed: true,
        value: numericValue,
        unit: extractedUnit,
        note: `Extracted unit from FRED native unit string: "${extractedUnit}"`,
      };
    }
  }

  return { changed: false };
}
