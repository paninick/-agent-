/**
 * swarm/agents/reconciliation-scorer.ts — Reconciliation Scorer Agent
 *
 * 角色：评估 10 个供应链维度的一致性，产出对账健康评分。
 *
 * 10 个维度（对齐 reconciliation/types.ts 的 ReconciliationDimension）：
 *   product / quantity / price / delivery / quality /
 *   inventory / financial / tax / demand / capacity
 *
 * 评分依据：evidence 中的值与 pack.knownRanges 的一致性。
 * 无对账文档时也能评分（基于宏观证据的健康度估算）。
 */

import type {
  AgentRunResult,
  SwarmTask,
  ReconciliationDimensionScore,
  ReconciliationScorerOutput,
} from "../../spine/types";
import type { EvidenceEntry } from "../../types";
import type { IndustryPack } from "../../core/industry-pack";
import type { ReconciliationResult } from "../../reconciliation/types";

export interface ReconciliationScorerInput {
  task: SwarmTask;
  evidenceList: EvidenceEntry[];
  pack?: IndustryPack;
  /** 可选：已有的对账结果（来自交易文档级对账） */
  reconciliations?: ReconciliationResult[];
}

/** 10 个供应链维度及其关联的 evidence subject 关键词 */
const DIMENSION_KEYWORDS: Record<string, string[]> = {
  product: ["product", "fabric", "fiber", "cotton", "yarn", "material", "style", "sku"],
  quantity: ["quantity", "volume", "production", "output", "shipment", "export", "import"],
  price: ["price", "cost", "wage", "salary", "rate", "fee", "tariff", "exchange"],
  delivery: ["delivery", "lead_time", "transit", "logistics", "shipping", "freight"],
  quality: ["quality", "defect", "return", "complaint", "yield", "pass_rate", "rework"],
  inventory: ["inventory", "stock", "warehouse", "in_transit", "sell_through", "reorder"],
  financial: ["financial", "revenue", "profit", "margin", "dso", "dpo", "receivable", "payable"],
  tax: ["tax", "hs_code", "customs", "duty", "refund", "vat", "tariff_code"],
  demand: ["demand", "forecast", "sales", "order", "consumer", "retail", "sell"],
  capacity: ["capacity", "utilization", "worker", "equipment", "daily_output", "factory"],
};

/**
 * 执行 Reconciliation Scorer agent。
 */
export function executeReconciliationScorer(input: ReconciliationScorerInput): AgentRunResult {
  const { task, evidenceList, pack, reconciliations } = input;

  if (evidenceList.length === 0) {
    return {
      taskId: task.id,
      role: "reconciliation_scorer",
      status: "failed",
      error: "no evidence to score",
    };
  }

  const dimensions: ReconciliationDimensionScore[] = [];
  const criticalMismatches: string[] = [];

  for (const [dimension, keywords] of Object.entries(DIMENSION_KEYWORDS)) {
    const score = scoreDimension(dimension, keywords, evidenceList, pack, reconciliations);
    dimensions.push(score);

    if (score.status === "mismatch") {
      criticalMismatches.push(`${dimension}: ${score.details}`);
    }
  }

  const scoredDimensions = dimensions.filter((d) => d.status !== "insufficient_data");
  const overallHealth = scoredDimensions.length > 0
    ? Math.round(scoredDimensions.reduce((sum, d) => sum + d.score, 0) / scoredDimensions.length)
    : 0;

  const output: ReconciliationScorerOutput = {
    dimensions,
    overallHealth,
    criticalMismatches,
  };

  return {
    taskId: task.id,
    role: "reconciliation_scorer",
    status: "completed",
    reconciliationScores: output,
  };
}

function scoreDimension(
  dimension: string,
  keywords: string[],
  evidenceList: EvidenceEntry[],
  pack?: IndustryPack,
  reconciliations?: ReconciliationResult[],
): ReconciliationDimensionScore {
  // 如果有交易文档级对账结果，直接使用
  if (reconciliations) {
    const match = reconciliations.find((r) => r.dimension === dimension);
    if (match) {
      return {
        dimension,
        score: match.status === "matched" ? 90 : match.status === "warning" ? 60 : 30,
        status: match.status,
        details: `From transaction reconciliation: ${match.variances.length} variance(s) found`,
      };
    }
  }

  // 基于 evidence 的宏观评分
  const relatedEvidence = evidenceList.filter((ev) => {
    const text = `${ev.subject} ${ev.claim}`.toLowerCase();
    return keywords.some((kw) => text.includes(kw));
  });

  if (relatedEvidence.length === 0) {
    return {
      dimension,
      score: 0,
      status: "insufficient_data",
      details: `No evidence matching ${dimension} dimension keywords`,
    };
  }

  // 评分逻辑：检查 evidence 值是否在 pack.knownRanges 范围内
  let inRangeCount = 0;
  let warningCount = 0;
  let mismatchCount = 0;
  let totalChecked = 0;

  if (pack) {
    for (const ev of relatedEvidence) {
      const numericValue = typeof ev.value === "number" ? ev.value : parseFloat(String(ev.value));
      if (isNaN(numericValue)) continue;

      const rangeEntry = findMatchingRange(ev.subject, pack);
      if (!rangeEntry) continue;

      totalChecked++;
      const { range } = rangeEntry;
      const span = range.max - range.min;

      if (numericValue >= range.min && numericValue <= range.max) {
        inRangeCount++;
      } else if (span > 0 && Math.max(0, numericValue - range.max, range.min - numericValue) / span <= 0.2) {
        warningCount++;
      } else {
        mismatchCount++;
      }
    }
  }

  if (totalChecked === 0) {
    // 无法做范围检查，基于证据数量给一个基线分
    const baseScore = Math.min(70, relatedEvidence.length * 15);
    return {
      dimension,
      score: baseScore,
      status: baseScore >= 50 ? "warning" : "insufficient_data",
      details: `${relatedEvidence.length} evidence item(s) found but no range data available for scoring`,
    };
  }

  const inRangeRate = inRangeCount / totalChecked;
  const mismatchRate = mismatchCount / totalChecked;
  const score = Math.round(inRangeRate * 80 + (1 - mismatchRate) * 20);

  let status: ReconciliationDimensionScore["status"];
  if (mismatchRate > 0.3) {
    status = "mismatch";
  } else if (warningCount > 0 || mismatchRate > 0.1) {
    status = "warning";
  } else {
    status = "matched";
  }

  return {
    dimension,
    score: Math.min(100, Math.max(0, score)),
    status,
    details: `${totalChecked} value(s) checked: ${inRangeCount} in-range, ${warningCount} warning, ${mismatchCount} mismatch`,
  };
}

function findMatchingRange(
  subject: string,
  pack: IndustryPack,
): { key: string; range: { min: number; max: number; unit?: string } } | undefined {
  const ranges = pack.knownRanges;
  if (ranges[subject]) return { key: subject, range: ranges[subject] };
  for (const [key, range] of Object.entries(ranges)) {
    if (subject.toLowerCase().includes(key.toLowerCase()) || key.toLowerCase().includes(subject.toLowerCase())) {
      return { key, range };
    }
  }
  return undefined;
}
