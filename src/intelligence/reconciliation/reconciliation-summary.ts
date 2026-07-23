/**
 * reconciliation/reconciliation-summary.ts - 买卖双方协同看板
 *
 * 三视角看板：
 *   - buyerView: 供应商报价变化/交期风险/质量风险/在途库存/补货建议/供应商信用评分
 *   - sellerView: 客户订单稳定性/付款风险/买方库存压力/实际动销/退货风险/补单概率
 *   - sharedView: 订单状态/生产进度/质检状态/发货状态/到货状态/结算状态/异常列表
 *
 * 同时提供 ReconciliationSummary 供 ChainHealth 集成。
 */

import type {
  ReconciliationResult,
  Anomaly,
  CredibilityScore,
  BuyerSellerDashboard,
  BuyerDashboardView,
  SellerDashboardView,
  SharedDashboardView,
  ReconciliationSummary,
  ReconciliationDimension,
} from "./types";
import type { QuantityReconciliationData, PriceReconciliationData, DeliveryReconciliationData, QualityReconciliationData, InventoryReconciliationData, FinancialReconciliationData } from "./types";

// ============================================================================
// 对账摘要（供 ChainHealth 集成）
// ============================================================================

/**
 * 从对账结果列表生成摘要。
 */
export function computeReconciliationSummary(
  reconciliations: ReconciliationResult[],
  anomalies: Anomaly[] = [],
): ReconciliationSummary {
  const totalItems = reconciliations.length;
  const matchedCount = reconciliations.filter((r) => r.status === "matched").length;
  const warningCount = reconciliations.filter((r) => r.status === "warning").length;
  const mismatchCount = reconciliations.filter((r) => r.status === "mismatch").length;
  const mismatchRate = totalItems > 0 ? mismatchCount / totalItems : 0;
  const warningRate = totalItems > 0 ? warningCount / totalItems : 0;
  const dimensions = [...new Set(reconciliations.map((r) => r.dimension))] as ReconciliationDimension[];
  const activeAnomalies = anomalies.filter((a) => a.status !== "closed").length;

  // 健康分 = 100 - mismatchRate×100 - warningRate×30
  const healthScore = Math.max(0, Math.round(100 - mismatchRate * 100 - warningRate * 30));

  return {
    totalItems,
    matchedCount,
    warningCount,
    mismatchCount,
    mismatchRate: Math.round(mismatchRate * 10000) / 10000,
    dimensions,
    activeAnomalies,
    healthScore,
  };
}

// ============================================================================
// 买卖双方协同看板
// ============================================================================

export interface DashboardInput {
  reconciliations: ReconciliationResult[];
  anomalies: Anomaly[];
  /** 供应商信用评分 */
  supplierCredibilityScores?: Array<{ sellerId: string; score: number; grade: CredibilityScore["grade"] }>;
  /** 客户需求真实性评分 */
  buyerCredibilityScores?: Array<{ buyerId: string; score: number; grade: CredibilityScore["grade"] }>;
}

export function computeReconciliationDashboard(input: DashboardInput): BuyerSellerDashboard {
  const { reconciliations, anomalies } = input;

  // 按维度分组
  const byDimension = groupByDimension(reconciliations);

  // 买方视角
  const buyerView = buildBuyerView(byDimension, anomalies, input.supplierCredibilityScores);

  // 卖方视角
  const sellerView = buildSellerView(byDimension, anomalies, input.buyerCredibilityScores);

  // 共享视角
  const sharedView = buildSharedView(reconciliations, anomalies);

  // 整体健康度
  const summary = computeReconciliationSummary(reconciliations, anomalies);

  return {
    buyerView,
    sellerView,
    sharedView,
    reconciliationHealthScore: summary.healthScore,
    generatedAt: new Date().toISOString(),
  };
}

// ============================================================================
// 辅助函数
// ============================================================================

function groupByDimension(reconciliations: ReconciliationResult[]): Record<string, ReconciliationResult[]> {
  const groups: Record<string, ReconciliationResult[]> = {};
  for (const r of reconciliations) {
    if (!groups[r.dimension]) groups[r.dimension] = [];
    groups[r.dimension].push(r);
  }
  return groups;
}

function buildBuyerView(
  byDimension: Record<string, ReconciliationResult[]>,
  anomalies: Anomaly[],
  supplierScores?: Array<{ sellerId: string; score: number; grade: CredibilityScore["grade"] }>,
): BuyerDashboardView {
  // 供应商报价变化
  const supplierPriceChanges: BuyerDashboardView["supplierPriceChanges"] = [];
  const priceResults = byDimension["price"] ?? [];
  for (const r of priceResults) {
    const data = r.data as unknown as PriceReconciliationData;
    const changeRate = data.varianceRate;
    supplierPriceChanges.push({
      sellerId: (r.transactionRef.poId ?? "unknown").replace("po-", "seller-"),
      productId: r.transactionRef.poId ?? "unknown",
      changeRate: Math.round(changeRate * 10000) / 10000,
      trend: changeRate > 0.02 ? "up" : changeRate < -0.02 ? "down" : "stable",
    });
  }

  // 交期风险
  const deliveryRisks: BuyerDashboardView["deliveryRisks"] = [];
  const deliveryResults = byDimension["delivery"] ?? [];
  for (const r of deliveryResults) {
    const data = r.data as unknown as DeliveryReconciliationData;
    const delayDays = data.delayDays;
    deliveryRisks.push({
      orderId: r.transactionRef.poId ?? "unknown",
      delayDays,
      risk: delayDays > 7 ? "high" : delayDays > 3 ? "medium" : "low",
    });
  }

  // 质量风险
  const qualityRisks: BuyerDashboardView["qualityRisks"] = [];
  const qualityResults = byDimension["quality"] ?? [];
  for (const r of qualityResults) {
    const data = r.data as unknown as QualityReconciliationData;
    qualityRisks.push({
      sellerId: r.transactionRef.poId ?? "unknown",
      defectRate: 1 - data.firstPassYield,
      trend: data.reworkRate > 0.05 ? "worsening" : data.reworkRate < 0.02 ? "improving" : "stable",
    });
  }

  // 在途库存
  const inventoryResults = byDimension["inventory"] ?? [];
  let inTransitInventory = 0;
  for (const r of inventoryResults) {
    const data = r.data as unknown as InventoryReconciliationData;
    inTransitInventory += data.buyerInTransit;
  }

  // 补货建议
  const reorderSuggestions: BuyerDashboardView["reorderSuggestions"] = [];
  for (const r of inventoryResults) {
    const data = r.data as unknown as InventoryReconciliationData;
    if (data.reorderPoint !== undefined) {
      const currentStock = data.buyerWarehouse + data.buyerStore + data.buyerPlatform;
      if (currentStock < data.reorderPoint) {
        reorderSuggestions.push({
          productId: r.transactionRef.poId ?? "unknown",
          currentStock,
          reorderPoint: data.reorderPoint,
          suggestedQty: data.reorderPoint - currentStock,
        });
      }
    }
  }

  return {
    supplierPriceChanges,
    deliveryRisks,
    qualityRisks,
    inTransitInventory,
    reorderSuggestions,
    supplierCredibilityScores: supplierScores ?? [],
  };
}

function buildSellerView(
  byDimension: Record<string, ReconciliationResult[]>,
  anomalies: Anomaly[],
  buyerScores?: Array<{ buyerId: string; score: number; grade: CredibilityScore["grade"] }>,
): SellerDashboardView {
  // 客户订单稳定性（从需求对账推算）
  const customerOrderStability: SellerDashboardView["customerOrderStability"] = [];
  const demandResults = byDimension["demand"] ?? [];
  for (const r of demandResults) {
    const data = r.data as unknown as { forecastAccuracy: number; orderedQuantity: number; soldQuantity: number };
    const stabilityScore = Math.round(data.forecastAccuracy * 100);
    customerOrderStability.push({
      buyerId: r.transactionRef.poId ?? "unknown",
      stabilityScore,
      trend: data.soldQuantity > data.orderedQuantity * 0.8 ? "growing" : data.soldQuantity < data.orderedQuantity * 0.5 ? "declining" : "stable",
    });
  }

  // 付款风险
  const paymentRisks: SellerDashboardView["paymentRisks"] = [];
  const financialResults = byDimension["financial"] ?? [];
  for (const r of financialResults) {
    const data = r.data as unknown as FinancialReconciliationData;
    paymentRisks.push({
      buyerId: r.transactionRef.poId ?? "unknown",
      dsoDays: data.dsoDays ?? 0,
      overdueRate: data.overdueRate ?? 0,
      risk: (data.overdueRate ?? 0) > 0.15 ? "high" : (data.dsoDays ?? 0) > 60 ? "medium" : "low",
    });
  }

  // 买方库存压力
  const buyerInventoryPressure: SellerDashboardView["buyerInventoryPressure"] = [];
  const inventoryResults = byDimension["inventory"] ?? [];
  for (const r of inventoryResults) {
    const data = r.data as unknown as InventoryReconciliationData;
    const sellThrough = data.weeklySellThrough ?? 0;
    buyerInventoryPressure.push({
      buyerId: r.transactionRef.poId ?? "unknown",
      weeklySellThrough: sellThrough,
      pressure: sellThrough < 0.3 ? "high" : sellThrough < 0.6 ? "medium" : "low",
    });
  }

  // 实际动销
  let actualSellThrough = 0;
  const demandData = demandResults.map((r) => r.data as unknown as { sellThroughRate: number });
  if (demandData.length > 0) {
    actualSellThrough = demandData.reduce((sum, d) => sum + d.sellThroughRate, 0) / demandData.length;
  }

  // 退货风险
  const returnRisks: SellerDashboardView["returnRisks"] = [];
  for (const r of qualityResults(byDimension)) {
    const data = r.data as unknown as QualityReconciliationData;
    returnRisks.push({
      buyerId: r.transactionRef.poId ?? "unknown",
      returnRate: data.returnRate,
      trend: data.returnRate > 0.05 ? "worsening" : data.returnRate < 0.02 ? "improving" : "stable",
    });
  }

  // 补单概率（简化：基于售罄率和库存压力）
  const reorderProbability: SellerDashboardView["reorderProbability"] = [];
  for (const r of inventoryResults) {
    const data = r.data as unknown as InventoryReconciliationData;
    const sellThrough = data.weeklySellThrough ?? 0;
    const prob = sellThrough > 0.7 ? 0.8 : sellThrough > 0.5 ? 0.5 : 0.2;
    reorderProbability.push({
      buyerId: r.transactionRef.poId ?? "unknown",
      probability: prob,
    });
  }

  return {
    customerOrderStability,
    paymentRisks,
    buyerInventoryPressure,
    actualSellThrough: Math.round(actualSellThrough * 10000) / 10000,
    returnRisks,
    reorderProbability,
  };
}

function qualityResults(byDimension: Record<string, ReconciliationResult[]>): ReconciliationResult[] {
  return byDimension["quality"] ?? [];
}

function buildSharedView(
  reconciliations: ReconciliationResult[],
  anomalies: Anomaly[],
): SharedDashboardView {
  // 订单状态汇总
  const orderStatusSummary: Record<string, number> = {};
  for (const r of reconciliations) {
    const key = `${r.dimension}:${r.status}`;
    orderStatusSummary[key] = (orderStatusSummary[key] ?? 0) + 1;
  }

  // 生产进度（从 capacity 对账推算）
  const productionProgress: SharedDashboardView["productionProgress"] = [];
  const capacityResults = reconciliations.filter((r) => r.dimension === "capacity");
  for (const r of capacityResults) {
    const data = r.data as unknown as { claimedDailyOutput: number; actualDailyOutput: number; currentOrderLoad: number };
    const progress = data.claimedDailyOutput > 0 ? Math.min(100, (data.actualDailyOutput / data.claimedDailyOutput) * 100) : 0;
    productionProgress.push({
      orderId: r.transactionRef.poId ?? "unknown",
      stage: "production",
      progress: Math.round(progress),
    });
  }

  // 质检状态
  const qcStatus: SharedDashboardView["qcStatus"] = [];
  const qualityResults = reconciliations.filter((r) => r.dimension === "quality");
  for (const r of qualityResults) {
    const data = r.data as unknown as QualityReconciliationData;
    qcStatus.push({
      orderId: r.transactionRef.poId ?? "unknown",
      passRate: data.firstPassYield,
      status: r.status,
    });
  }

  // 发货状态
  const shipmentStatus: SharedDashboardView["shipmentStatus"] = [];
  const deliveryResults = reconciliations.filter((r) => r.dimension === "delivery");
  for (const r of deliveryResults) {
    const data = r.data as unknown as DeliveryReconciliationData;
    shipmentStatus.push({
      orderId: r.transactionRef.poId ?? "unknown",
      shipped: data.shippedDate !== "",
      trackingNo: r.transactionRef.shipmentId,
    });
  }

  // 到货状态
  const arrivalStatus: SharedDashboardView["arrivalStatus"] = [];
  for (const r of deliveryResults) {
    const data = r.data as unknown as DeliveryReconciliationData;
    arrivalStatus.push({
      orderId: r.transactionRef.poId ?? "unknown",
      arrived: data.arrivedDate !== "",
      arrivedAt: data.arrivedDate !== "" ? data.arrivedDate : undefined,
    });
  }

  // 结算状态
  const settlementStatus: SharedDashboardView["settlementStatus"] = [];
  const financialResults = reconciliations.filter((r) => r.dimension === "financial");
  for (const r of financialResults) {
    const data = r.data as unknown as FinancialReconciliationData;
    settlementStatus.push({
      orderId: r.transactionRef.poId ?? "unknown",
      invoiced: data.invoiceAmount > 0,
      paid: data.collectedAmount >= data.invoiceAmount,
      outstandingAmount: Math.max(0, data.invoiceAmount - data.collectedAmount),
    });
  }

  return {
    orderStatusSummary,
    productionProgress,
    qcStatus,
    shipmentStatus,
    arrivalStatus,
    settlementStatus,
    anomalyList: anomalies,
  };
}

// ============================================================================
// 格式化
// ============================================================================

export function formatDashboard(dashboard: BuyerSellerDashboard): string {
  const lines: string[] = [];
  lines.push("=".repeat(60));
  lines.push(`买卖双方协同看板 | 健康度: ${dashboard.reconciliationHealthScore}/100`);
  lines.push(`生成时间: ${dashboard.generatedAt}`);
  lines.push("=".repeat(60));

  // 买方视角
  lines.push("");
  lines.push("【买方视角】");
  if (dashboard.buyerView.supplierPriceChanges.length > 0) {
    lines.push("  供应商报价变化:");
    for (const c of dashboard.buyerView.supplierPriceChanges) {
      lines.push(`    ${c.sellerId}: ${c.productId} 趋势=${c.trend} 变化率=${(c.changeRate * 100).toFixed(1)}%`);
    }
  }
  if (dashboard.buyerView.deliveryRisks.length > 0) {
    lines.push("  交期风险:");
    for (const d of dashboard.buyerView.deliveryRisks) {
      lines.push(`    ${d.orderId}: 延误${d.delayDays}天 风险=${d.risk}`);
    }
  }
  if (dashboard.buyerView.qualityRisks.length > 0) {
    lines.push("  质量风险:");
    for (const q of dashboard.buyerView.qualityRisks) {
      lines.push(`    ${q.sellerId}: 缺陷率=${(q.defectRate * 100).toFixed(1)}% 趋势=${q.trend}`);
    }
  }
  lines.push(`  在途库存: ${dashboard.buyerView.inTransitInventory}`);
  if (dashboard.buyerView.reorderSuggestions.length > 0) {
    lines.push("  补货建议:");
    for (const r of dashboard.buyerView.reorderSuggestions) {
      lines.push(`    ${r.productId}: 当前${r.currentStock} 补货点${r.reorderPoint} 建议补${r.suggestedQty}`);
    }
  }
  if (dashboard.buyerView.supplierCredibilityScores.length > 0) {
    lines.push("  供应商信用评分:");
    for (const s of dashboard.buyerView.supplierCredibilityScores) {
      lines.push(`    ${s.sellerId}: ${s.score}/100 (${s.grade})`);
    }
  }

  // 卖方视角
  lines.push("");
  lines.push("【卖方视角】");
  if (dashboard.sellerView.customerOrderStability.length > 0) {
    lines.push("  客户订单稳定性:");
    for (const c of dashboard.sellerView.customerOrderStability) {
      lines.push(`    ${c.buyerId}: ${c.stabilityScore}/100 趋势=${c.trend}`);
    }
  }
  if (dashboard.sellerView.paymentRisks.length > 0) {
    lines.push("  付款风险:");
    for (const p of dashboard.sellerView.paymentRisks) {
      lines.push(`    ${p.buyerId}: DSO=${p.dsoDays}天 逾期率=${(p.overdueRate * 100).toFixed(1)}% 风险=${p.risk}`);
    }
  }
  lines.push(`  实际动销: ${(dashboard.sellerView.actualSellThrough * 100).toFixed(1)}%`);
  if (dashboard.sellerView.reorderProbability.length > 0) {
    lines.push("  补单概率:");
    for (const r of dashboard.sellerView.reorderProbability) {
      lines.push(`    ${r.buyerId}: ${(r.probability * 100).toFixed(0)}%`);
    }
  }

  // 共享视角
  lines.push("");
  lines.push("【共享视角】");
  lines.push("  订单状态汇总:");
  for (const [key, count] of Object.entries(dashboard.sharedView.orderStatusSummary)) {
    lines.push(`    ${key}: ${count}`);
  }
  if (dashboard.sharedView.anomalyList.length > 0) {
    lines.push(`  异常列表: ${dashboard.sharedView.anomalyList.length} 项`);
    for (const a of dashboard.sharedView.anomalyList.slice(0, 5)) {
      lines.push(`    [${a.status}] ${a.type} | ${a.orderId} | ${a.description.substring(0, 60)}`);
    }
  }

  return lines.join("\n");
}
