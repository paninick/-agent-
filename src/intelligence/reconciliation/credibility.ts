/**
 * reconciliation/credibility.ts - 需求真实性 + 供应真实性 + 价格合理性评分
 *
 * 三大评分引擎：
 *
 * 1. assessDemandCredibility - 买方需求真实性评分
 *    公式：历史采购兑现率×25% + 当前销售增长×20% + 库存健康度×20%
 *         + 补单频率×15% + 付款稳定性×10% + 渠道热度×10%
 *    等级：80+高可信 / 60-80可接单 / 40-60谨慎 / 40-高危
 *
 * 2. assessSupplyCredibility - 卖方供应真实性评分
 *    公式：历史准交率×25% + 产量稳定性×20% + 原料库存匹配×15%
 *         + 工人设备匹配×15% + 质量稳定性×15% + 现金流×10%
 *    等级：80+核心供应商 / 60-80可合作 / 40-60小单测试 / 40-高危
 *
 * 3. assessPriceReasonableness - 价格合理性拆解
 *    拆解报价 = 面料 + 辅料 + 损耗 + 人工 + 制造费 + 包装 + 物流 + 税费 + 利润
 *    预警：报价涨幅 > 原料涨幅 + 合理加工费涨幅；或报价低于行业成本线
 */

import type {
  CredibilityScore,
  CredibilityGrade,
  PriceCostBreakdown,
  PriceAnalysis,
} from "./types";

// ============================================================================
// 工具函数
// ============================================================================

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

function gradeFromScore(score: number, labels: [string, string, string, string]): CredibilityGrade {
  if (score >= 80) return "high";
  if (score >= 60) return "acceptable";
  if (score >= 40) return "cautious";
  return "high_risk";
}

function buildFactors(
  factors: Array<{ name: string; weight: number; rawScore: number }>,
): { factors: CredibilityScore["factors"]; total: number } {
  let total = 0;
  const result = factors.map((f) => {
    const raw = clamp(f.rawScore);
    const weighted = Math.round(raw * f.weight * 100) / 100;
    total += weighted;
    return {
      name: f.name,
      weight: f.weight,
      rawScore: Math.round(raw * 100) / 100,
      weightedScore: weighted,
    };
  });
  return { factors: result, total: Math.round(total * 100) / 100 };
}

// ============================================================================
// 1. 需求真实性评分（买方）
// ============================================================================

export interface DemandCredibilityInput {
  /** 历史采购兑现率 0-1（下单后实际提货的比例） */
  historicalFulfillmentRate: number;
  /** 当前销售增长率 0-1（同比） */
  currentSalesGrowth: number;
  /** 库存健康度 0-1（周销比在合理范围内的程度） */
  inventoryHealth: number;
  /** 补单频率 0-1（近90天补单次数 / 下单次数） */
  reorderFrequency: number;
  /** 付款稳定性 0-1（按时付款的比例） */
  paymentStability: number;
  /** 渠道热度 0-1（社媒/搜索/平台流量增长） */
  channelHeat: number;
}

export function assessDemandCredibility(input: DemandCredibilityInput): CredibilityScore {
  const { factors, total } = buildFactors([
    { name: "历史采购兑现率", weight: 0.25, rawScore: input.historicalFulfillmentRate * 100 },
    { name: "当前销售增长", weight: 0.20, rawScore: clamp(input.currentSalesGrowth * 100, 0, 100) },
    { name: "库存健康度", weight: 0.20, rawScore: input.inventoryHealth * 100 },
    { name: "补单频率", weight: 0.15, rawScore: clamp(input.reorderFrequency * 100, 0, 100) },
    { name: "付款稳定性", weight: 0.10, rawScore: input.paymentStability * 100 },
    { name: "渠道热度", weight: 0.10, rawScore: clamp(input.channelHeat * 100, 0, 100) },
  ]);

  const score = Math.round(total);
  const grade = gradeFromScore(score, ["高可信", "可接单", "谨慎", "高危"]);

  const recommendedAction =
    score >= 80 ? "可接大单，正常备料" :
    score >= 60 ? "可接单，适度备料" :
    score >= 40 ? "谨慎接单，要求定金，不备料" :
    "高危客户，要求全额预付，不备料";

  return { score, grade, factors, recommendedAction };
}

// ============================================================================
// 2. 供应真实性评分（卖方）
// ============================================================================

export interface SupplyCredibilityInput {
  /** 历史准交率 0-1 */
  historicalOnTimeRate: number;
  /** 产量稳定性 0-1（日产量标准差的逆） */
  outputStability: number;
  /** 原料库存匹配度 0-1（当前原料库存可支撑生产天数 / 交期） */
  rawMaterialMatch: number;
  /** 工人设备匹配度 0-1 */
  workerEquipmentMatch: number;
  /** 质量稳定性 0-1（历史一次合格率） */
  qualityStability: number;
  /** 现金流健康度 0-1 */
  cashFlowHealth: number;
}

export function assessSupplyCredibility(input: SupplyCredibilityInput): CredibilityScore {
  const { factors, total } = buildFactors([
    { name: "历史准交率", weight: 0.25, rawScore: input.historicalOnTimeRate * 100 },
    { name: "产量稳定性", weight: 0.20, rawScore: input.outputStability * 100 },
    { name: "原料库存匹配", weight: 0.15, rawScore: input.rawMaterialMatch * 100 },
    { name: "工人设备匹配", weight: 0.15, rawScore: input.workerEquipmentMatch * 100 },
    { name: "质量稳定性", weight: 0.15, rawScore: input.qualityStability * 100 },
    { name: "现金流", weight: 0.10, rawScore: input.cashFlowHealth * 100 },
  ]);

  const score = Math.round(total);
  const grade = gradeFromScore(score, ["核心供应商", "可合作", "小单测试", "高危"]);

  const recommendedAction =
    score >= 80 ? "核心供应商，可大单长协" :
    score >= 60 ? "可合作，正常下单" :
    score >= 40 ? "小单测试，跟单生产" :
    "高危供应商，不建议合作";

  return { score, grade, factors, recommendedAction };
}

// ============================================================================
// 3. 价格合理性拆解
// ============================================================================

export interface PriceReasonablenessInput {
  /** 报价（单价） */
  quotePrice: number;
  /** 成本拆解 */
  costs: {
    fabric: number;
    accessories: number;
    wasteAllowance: number;
    labor: number;
    manufacturingOverhead: number;
    packaging: number;
    logistics: number;
    tax: number;
    profit: number;
  };
  /** 报价涨幅 0-1（与上次报价对比） */
  quoteChangeRate: number;
  /** 原料涨幅 0-1（同期原料价格变化） */
  materialChangeRate: number;
  /** 行业平均成本线（可选，用于判断是否低于成本） */
  industryCostFloor?: number;
}

export function assessPriceReasonableness(input: PriceReasonablenessInput): PriceAnalysis {
  const c = input.costs;
  const totalEstimated = c.fabric + c.accessories + c.wasteAllowance + c.labor
    + c.manufacturingOverhead + c.packaging + c.logistics + c.tax + c.profit;

  const varianceRate = totalEstimated > 0
    ? Math.abs(input.quotePrice - totalEstimated) / totalEstimated
    : 0;

  const warnings: string[] = [];
  const alerts: string[] = [];

  // 拆解总价与报价差异超 10%
  if (varianceRate > 0.1) {
    warnings.push(`报价与成本拆解差异 ${varianceRate > 0 ? "+" : ""}${(varianceRate * 100).toFixed(1)}%`);
  }

  // 报价涨幅 > 原料涨幅 + 5%（合理加工费涨幅）
  if (input.quoteChangeRate > input.materialChangeRate + 0.05) {
    alerts.push(`报价涨幅(${(input.quoteChangeRate * 100).toFixed(1)}%)远超原料涨幅(${(input.materialChangeRate * 100).toFixed(1)}%)，需核实加工费上涨原因`);
  }

  // 报价低于行业成本线
  if (input.industryCostFloor !== undefined && input.quotePrice < input.industryCostFloor) {
    alerts.push(`报价 ${input.quotePrice} 低于行业成本线 ${input.industryCostFloor}，可能存在偷工减料风险`);
  }

  // 利润率异常
  const profitRate = totalEstimated > 0 ? c.profit / totalEstimated : 0;
  if (profitRate > 0.3) {
    warnings.push(`利润率 ${(profitRate * 100).toFixed(1)}% 偏高，行业平均 15-25%`);
  } else if (profitRate < 0.05 && profitRate >= 0) {
    warnings.push(`利润率 ${(profitRate * 100).toFixed(1)}% 偏低，可能存在隐性成本`);
  }

  const breakdown: PriceCostBreakdown = {
    fabric: c.fabric,
    accessories: c.accessories,
    wasteAllowance: c.wasteAllowance,
    labor: c.labor,
    manufacturingOverhead: c.manufacturingOverhead,
    packaging: c.packaging,
    logistics: c.logistics,
    tax: c.tax,
    profit: c.profit,
    totalEstimated: Math.round(totalEstimated * 100) / 100,
    varianceRate: Math.round(varianceRate * 10000) / 10000,
    warnings,
  };

  const isReasonable = alerts.length === 0 && varianceRate <= 0.15;

  return {
    breakdown,
    quoteChangeRate: input.quoteChangeRate,
    materialChangeRate: input.materialChangeRate,
    isReasonable,
    alerts,
  };
}

// ============================================================================
// 4. 库存责任划分
// ============================================================================

export type InventoryResponsibilityResult = "buyer" | "seller" | "shared" | "designer";

export interface InventoryResponsibilityInput {
  /** 退货率 0-1 */
  returnRate: number;
  /** 卖方成品库存积压率 0-1 */
  sellerFinishedRatio: number;
  /** 设计变更次数 */
  designChangeCount: number;
  /** 买方预测准确率 0-1 */
  forecastAccuracy: number;
  /** 质量退货占比 0-1 */
  qualityReturnRatio: number;
}

/**
 * 库存责任划分：
 *   - quality_return: 买方退货因质量问题 -> 卖方责任
 *   - forecast_error: 买方预测偏差导致积压 -> 买方责任
 *   - over_production: 卖方超产 -> 卖方责任
 *   - design_change: 设计频繁变更 -> 设计师/买方责任
 *   - shared: 双方共同原因
 */
export function classifyInventoryResponsibility(input: InventoryResponsibilityInput): InventoryResponsibilityResult {
  // 质量退货占比高 -> 卖方责任
  if (input.qualityReturnRatio > 0.5) {
    return "seller";
  }

  // 设计变更频繁 -> 设计师责任
  if (input.designChangeCount >= 3) {
    return "designer";
  }

  // 预测准确率低 + 退货率高 -> 买方责任
  if (input.forecastAccuracy < 0.6 && input.returnRate > 0.15) {
    return "buyer";
  }

  // 卖方成品积压严重 -> 卖方责任
  if (input.sellerFinishedRatio > 0.5) {
    return "seller";
  }

  // 退货率和积压都存在 -> 共同责任
  if (input.returnRate > 0.1 && input.sellerFinishedRatio > 0.3) {
    return "shared";
  }

  // 默认买方责任（买方下单，库存自然归属买方）
  return "buyer";
}
