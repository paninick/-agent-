/**
 * reconciliation/data-trust.ts - 数据可信度分层
 *
 * 将对账数据按来源分为 4 个可信度层级，每层有权重区间：
 *
 *   factual (事实层)    90-100：订单/发货/入库/付款/发票/质检/销售/库存
 *     - method: filing/api, kind: financial_primary/trade_flow_primary/material_quantity
 *
 *   commitment (承诺层) 70-85：报价/交期承诺/产能承诺/补货计划/预测
 *     - kind: market_signal + 特定 subject
 *
 *   external (外部层)   80-95：原料价格/运价/汇率/海关/招聘/工商/社媒
 *     - method: web/api, tier S/A+
 *
 *   subjective (主观层) 20-50：口头反馈/传闻
 *     - method: manual
 *
 * 权重 = 层级基础分 × SourceTier 调整因子
 */

import type { EvidenceEntry, SourceTier, EvidenceKind } from "../types";
import type { DataTrustLayer, ReconciliationResult } from "./types";

// ============================================================================
// 层级分类
// ============================================================================

/** 事实类 EvidenceKind */
const FACTUAL_KINDS: EvidenceKind[] = [
  "financial_primary",
  "trade_flow_primary",
  "material_quantity",
];

/** 事实类 method */
const FACTUAL_METHODS = ["filing", "api", "authorized_platform"] as const;

/** 承诺类 subject 关键词 */
const COMMITMENT_SUBJECTS = [
  "quote", "quotation", "promise", "commitment", "capacity_claim",
  "reorder_plan", "forecast", "demand_forecast", "lead_time",
];

/** 外部类 method */
const EXTERNAL_METHODS = ["web", "api"] as const;

/**
 * 将 EvidenceEntry 分类到对应的可信度层级。
 */
export function classifyDataTrust(evidence: EvidenceEntry): DataTrustLayer {
  // 1. 事实层：financial_primary / trade_flow_primary / material_quantity + filing/api method
  if (FACTUAL_KINDS.includes(evidence.kind) && FACTUAL_METHODS.includes(evidence.method as typeof FACTUAL_METHODS[number])) {
    return "factual";
  }

  // 2. 承诺层：market_signal + 承诺类 subject
  if (evidence.kind === "market_signal") {
    const subjectLower = evidence.subject.toLowerCase();
    if (COMMITMENT_SUBJECTS.some((kw) => subjectLower.includes(kw))) {
      return "commitment";
    }
  }

  // 3. 外部层：web/api method + 高 tier
  if (EXTERNAL_METHODS.includes(evidence.method as typeof EXTERNAL_METHODS[number])) {
    return "external";
  }

  // 4. 主观层：manual method 或其他
  if (evidence.method === "manual") {
    return "subjective";
  }

  // 5. 默认：report 归入外部层
  if (evidence.method === "report") {
    return "external";
  }

  return "subjective";
}

// ============================================================================
// 权重计算
// ============================================================================

/** 层级基础权重 */
const LAYER_BASE_WEIGHT: Record<DataTrustLayer, number> = {
  factual: 95,
  commitment: 75,
  external: 85,
  subjective: 35,
};

/** SourceTier 调整因子 */
const TIER_FACTOR: Record<SourceTier, number> = {
  S: 1.0,
  "A+": 0.95,
  A: 0.90,
  B: 0.80,
  C: 0.70,
};

/**
 * 计算数据可信度权重（0-100）。
 *
 * 权重 = 层级基础分 × SourceTier 因子
 * 限制在层级权重区间内：
 *   factual: 90-100
 *   external: 80-95
 *   commitment: 70-85
 *   subjective: 20-50
 */
export function getTrustWeight(layer: DataTrustLayer, tier: SourceTier): number {
  const base = LAYER_BASE_WEIGHT[layer];
  const factor = TIER_FACTOR[tier];
  let weight = base * factor;

  // 限制在层级区间内
  const range = LAYER_WEIGHT_RANGE[layer];
  weight = Math.max(range.min, Math.min(range.max, weight));

  return Math.round(weight * 100) / 100;
}

/** 层级权重区间 */
const LAYER_WEIGHT_RANGE: Record<DataTrustLayer, { min: number; max: number }> = {
  factual: { min: 90, max: 100 },
  external: { min: 80, max: 95 },
  commitment: { min: 70, max: 85 },
  subjective: { min: 20, max: 50 },
};

// ============================================================================
// 对账结果置信度调整
// ============================================================================

/**
 * 根据数据可信度调整对账结果的置信度。
 *
 * 置信度 = 原始置信度 × (trustWeight / 100)
 * 如果对账结果状态为 mismatch，且数据来自低可信度层级，
 * 则降低 mismatch 的严重性（可能是数据本身的问题，而非真实差异）。
 */
export function applyTrustWeight<T>(
  reconciliation: ReconciliationResult<T>,
  trustLayer: DataTrustLayer,
  tier: SourceTier = "A",
): ReconciliationResult<T> {
  const trustWeight = getTrustWeight(trustLayer, tier);
  const confidence = trustWeight / 100;

  return {
    ...reconciliation,
    trustLayer,
    confidence: Math.round(confidence * 100) / 100,
  };
}

/**
 * 批量标注对账结果的可信度层级。
 * 接受 EvidenceEntry 列表，按 subject 匹配对账结果并标注。
 */
export function annotateTrustLayers<T>(
  reconciliations: ReconciliationResult<T>[],
  evidence: EvidenceEntry[],
): ReconciliationResult<T>[] {
  // 构建 subject -> { layer, tier } 映射
  const subjectTrust = new Map<string, { layer: DataTrustLayer; tier: SourceTier }>();
  for (const ev of evidence) {
    subjectTrust.set(ev.subject, {
      layer: classifyDataTrust(ev),
      tier: ev.sourceTier,
    });
  }

  return reconciliations.map((r) => {
    // 尝试从 transactionRef 或 dimension 匹配 subject
    const ref = r.transactionRef;
    const subjectKey = ref.poId ?? ref.soId ?? ref.quoteId ?? ref.invoiceId ?? r.dimension;
    const trust = subjectTrust.get(subjectKey);

    if (trust) {
      return applyTrustWeight(r, trust.layer, trust.tier);
    }

    // 无匹配证据时，按维度默认分层
    const defaultLayer: DataTrustLayer =
      r.dimension === "product" || r.dimension === "quantity" || r.dimension === "financial" || r.dimension === "tax"
        ? "factual"
        : r.dimension === "delivery" || r.dimension === "quality" || r.dimension === "inventory"
          ? "commitment"
          : "external";

    return applyTrustWeight(r, defaultLayer, "A");
  });
}
