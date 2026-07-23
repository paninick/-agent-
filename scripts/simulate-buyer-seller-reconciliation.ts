/**
 * scripts/simulate-buyer-seller-reconciliation.ts - 买卖双方链路协同核对仿真
 *
 * 6 个场景验证全量实现的 Phase F 系统：
 *
 *   场景1：正常对账 - 买方 PO = 卖方 SO，数量/价格/交期全匹配
 *   场景2：数量差异 - 买方 PO 10000 件，卖方发货 9600 件（差异 4% > 3% 阈值）
 *   场景3：价格异常 - 卖方报价涨幅远超原料涨幅（价格合理性拆解预警）
 *   场景4：需求真实性评估 - 买方预测 vs 实际销售，预测准确率低
 *   场景5：买卖共振 - 需求高 + 产能低 + 质量降 + 交期延误（多节点共振）
 *   场景6：异常闭环 - 从发现数量差异到结案的全流程
 */

import type { EvidenceEntry } from "../src/intelligence/types";
import type { RawRecord, SwarmTrigger } from "../src/intelligence/spine/types";
import type { TransactionDocument, ReconciliationResult, Anomaly } from "../src/intelligence/reconciliation/types";
import { apparelPack } from "../src/intelligence/analysis/industryPacks/apparel";
import {
  reconcileProduct,
  reconcileQuantity,
  reconcilePrice,
  reconcileDelivery,
  reconcileQuality,
  reconcileInventory,
  reconcileFinancial,
  reconcileTax,
  reconcileDemand,
  reconcileCapacity,
  summarizeReconciliations,
} from "../src/intelligence/reconciliation/reconcile";
import {
  assessDemandCredibility,
  assessSupplyCredibility,
  assessPriceReasonableness,
  classifyInventoryResponsibility,
} from "../src/intelligence/reconciliation/credibility";
import { classifyDataTrust, getTrustWeight, applyTrustWeight } from "../src/intelligence/reconciliation/data-trust";
import {
  trackAnomaly,
  attributeResponsibility,
  collectEvidence,
  attributeAnomaly,
  resolveAnomaly,
  closeAnomaly,
  summarizeAnomalies,
  formatAnomalyForAgent,
} from "../src/intelligence/reconciliation/anomaly-tracker";
import {
  computeReconciliationDashboard,
  computeReconciliationSummary,
  formatDashboard,
} from "../src/intelligence/reconciliation/reconciliation-summary";
import { computeChainHealth, formatChainHealth } from "../src/intelligence/analysis/chain-health";
import { detectResonance, formatResonance } from "../src/intelligence/analysis/resonance-detector";
import { generateFollowUp } from "../src/intelligence/workflows/feedback";

const NOW = new Date("2026-07-08T00:00:00Z");

// 便利构造器
function ev(
  id: string, sourceId: string, tier: EvidenceEntry["sourceTier"], sw: number,
  kind: EvidenceEntry["kind"], subject: string, claim: string, value: number, unit: string,
  method: EvidenceEntry["method"] = "api", auth = 0.9,
): EvidenceEntry & { authenticity: { authenticityScore: number; gateResults: unknown[] } } {
  return {
    id, sourceId, sourceTier: tier, sourceWeight: sw,
    kind, subject, claim, observedAt: NOW.toISOString(), value, unit,
    method, conversions: [], crossChecks: [], contradictions: [], notes: [],
    authenticity: { authenticityScore: auth, gateResults: [] },
  } as EvidenceEntry & { authenticity: { authenticityScore: number; gateResults: unknown[] } };
}

function makeTrigger(objective: string): SwarmTrigger {
  return {
    id: `trigger-${Date.now()}`,
    ruleId: "reconciliation-rule",
    signalId: "signal-recon",
    firedAt: NOW.toISOString(),
    objective,
    pack: apparelPack,
  };
}

let scenarioCount = 0;
let passCount = 0;

function scenario(name: string, fn: () => boolean) {
  scenarioCount++;
  console.log(`\n${"=".repeat(60)}`);
  console.log(`场景 ${scenarioCount}: ${name}`);
  console.log("=".repeat(60));
  try {
    const pass = fn();
    console.log(pass ? "✓ PASS" : "✗ FAIL");
    if (pass) passCount++;
  } catch (e) {
    console.log(`✗ ERROR: ${(e as Error).message}`);
  }
}

// ============================================================================
// 场景1：正常对账 - 买方 PO = 卖方 SO，数量/价格/交期全匹配
// ============================================================================

scenario("正常对账 - 全匹配", () => {
  const buyerDoc: TransactionDocument = {
    docId: "po-001",
    docType: "po",
    party: "buyer",
    timestamp: NOW.toISOString(),
    poId: "po-001",
    soId: "so-001",
    buyerId: "buyer-A",
    sellerId: "seller-B",
    productId: "prod-tee-001",
    styleId: "ST-001",
    sku: "SKU-001",
    quantity: 10000,
    unit: "pcs",
    unitPrice: 35,
    currency: "CNY",
    totalAmount: 350000,
    requestedDeliveryDate: "2026-08-15",
    fabricComposition: "100% cotton",
    fabricWeight: "180gsm",
    colorSize: "Black M/L/XL",
    packaging: "polybag + carton",
  };

  const sellerDoc: TransactionDocument = {
    ...buyerDoc,
    docId: "so-001",
    docType: "so",
    party: "seller",
    promisedDeliveryDate: "2026-08-10",
  };

  // 商品核对
  const productRecon = reconcileProduct({ buyerDoc, sellerDoc });
  console.log(`  商品核对: ${productRecon.status} (mismatches: ${productRecon.data.mismatches.length})`);

  // 数量核对
  const qtyRecon = reconcileQuantity({
    poId: "po-001",
    soId: "so-001",
    poQuantity: 10000,
    soQuantity: 10000,
    productionQuantity: 10000,
    shippedQuantity: 10000,
    receivedQuantity: 10000,
  });
  console.log(`  数量核对: ${qtyRecon.status} (varianceRate: ${(qtyRecon.data.varianceRate * 100).toFixed(2)}%)`);

  // 价格核对
  const priceRecon = reconcilePrice({
    quoteId: "quote-001",
    poId: "po-001",
    quotePrice: 35,
    poPrice: 35,
    contractPrice: 35,
    invoicePrice: 35,
    paymentPrice: 35,
  });
  console.log(`  价格核对: ${priceRecon.status} (varianceRate: ${(priceRecon.data.varianceRate * 100).toFixed(2)}%)`);

  // 交期核对
  const deliveryRecon = reconcileDelivery({
    poId: "po-001",
    shipmentId: "ship-001",
    requestedDate: "2026-08-15",
    promisedDate: "2026-08-10",
    completedDate: "2026-08-08",
    shippedDate: "2026-08-09",
    arrivedDate: "2026-08-12",
    onShelfDate: "2026-08-14",
  });
  console.log(`  交期核对: ${deliveryRecon.status} (delayDays: ${deliveryRecon.data.delayDays})`);

  // 汇总
  const allRecs = [productRecon, qtyRecon, priceRecon, deliveryRecon];
  const summary = computeReconciliationSummary(allRecs);
  console.log(`  汇总: healthScore=${summary.healthScore} matched=${summary.matchedCount} warning=${summary.warningCount} mismatch=${summary.mismatchCount}`);

  return summary.matchedCount === 4 && summary.mismatchCount === 0 && summary.healthScore === 100;
});

// ============================================================================
// 场景2：数量差异 - 买方 PO 10000 件，卖方发货 9600 件
// ============================================================================

scenario("数量差异 - 4% > 3% 阈值", () => {
  const qtyRecon = reconcileQuantity({
    poId: "po-002",
    soId: "so-002",
    poQuantity: 10000,
    soQuantity: 10000,
    productionQuantity: 9500,
    shippedQuantity: 9600,
    receivedQuantity: 9600,
  });
  console.log(`  数量核对: ${qtyRecon.status}`);
  console.log(`  最终差异率: ${(qtyRecon.data.varianceRate * 100).toFixed(2)}%`);
  console.log(`  差异明细:`);
  for (const v of qtyRecon.variances) {
    console.log(`    ${v.field}: ${v.status} (rate=${(v.varianceRate * 100).toFixed(2)}%) ${v.note}`);
  }

  // 生成异常
  const anomaly = trackAnomaly(qtyRecon);
  console.log(`  异常: ${anomaly?.id ?? "none"} type=${anomaly?.type} status=${anomaly?.status}`);

  // 责任归因
  if (anomaly) {
    const resp = attributeResponsibility({
      type: anomaly.type,
      buyerData: { confirmedQuantity: 10000 },
      sellerData: { shippedQuantity: 9600 },
    });
    console.log(`  责任归因: ${resp}`);

    // 推进闭环
    const withEvidence = collectEvidence(anomaly, ["ev-001", "ev-002"]);
    const attributed = attributeAnomaly(withEvidence, resp);
    const resolved = resolveAnomaly(attributed, "卖方少发400件，协商折价退款");
    const closed = closeAnomaly(resolved);
    console.log(`  闭环: ${closed.status} scoreImpact=${closed.scoreImpact}`);
    console.log(`  Agent 格式:`);
    console.log(formatAnomalyForAgent(closed).split("\n").map((l) => `    ${l}`).join("\n"));
  }

  return qtyRecon.status === "mismatch" && anomaly?.type === "quantity";
});

// ============================================================================
// 场景3：价格异常 - 卖方报价涨幅远超原料涨幅
// ============================================================================

scenario("价格异常 - 报价涨幅远超原料涨幅", () => {
  const priceAnalysis = assessPriceReasonableness({
    quotePrice: 52,
    costs: {
      fabric: 18,
      accessories: 3,
      wasteAllowance: 2,
      labor: 8,
      manufacturingOverhead: 5,
      packaging: 1.5,
      logistics: 3,
      tax: 2.5,
      profit: 9,  // 利润 9 元，利润率 ~17%
    },
    quoteChangeRate: 0.25,  // 报价涨 25%
    materialChangeRate: 0.08,  // 原料涨 8%
    industryCostFloor: 40,
  });

  console.log(`  报价: ${priceAnalysis.breakdown.totalEstimated} (拆解) vs 52 (报价)`);
  console.log(`  差异率: ${(priceAnalysis.breakdown.varianceRate * 100).toFixed(1)}%`);
  console.log(`  报价涨幅: ${(priceAnalysis.quoteChangeRate * 100).toFixed(1)}%`);
  console.log(`  原料涨幅: ${(priceAnalysis.materialChangeRate * 100).toFixed(1)}%`);
  console.log(`  合理性: ${priceAnalysis.isReasonable ? "合理" : "不合理"}`);
  console.log(`  预警:`);
  for (const a of priceAnalysis.alerts) {
    console.log(`    ⚠ ${a}`);
  }
  for (const w of priceAnalysis.breakdown.warnings) {
    console.log(`    · ${w}`);
  }

  // 同时做价格核对
  const priceRecon = reconcilePrice({
    quoteId: "quote-003",
    poId: "po-003",
    quotePrice: 52,
    poPrice: 49,
    contractPrice: 49,
    invoicePrice: 52,
    paymentPrice: 52,
  });
  console.log(`  价格核对: ${priceRecon.status}`);

  return !priceAnalysis.isReasonable && priceAnalysis.alerts.length > 0;
});

// ============================================================================
// 场景4：需求真实性评估 - 买方预测 vs 实际销售
// ============================================================================

scenario("需求真实性评估", () => {
  // 需求核对
  const demandRecon = reconcileDemand({
    poId: "po-004",
    forecastQuantity: 20000,
    orderedQuantity: 18000,
    soldQuantity: 10000,
    returnRate: 0.12,
    discountRate: 0.35,
  });
  console.log(`  需求核对: ${demandRecon.status}`);
  console.log(`  预测准确率: ${(demandRecon.data.forecastAccuracy * 100).toFixed(1)}%`);
  console.log(`  售罄率: ${(demandRecon.data.sellThroughRate * 100).toFixed(1)}%`);

  // 需求真实性评分
  const demandCred = assessDemandCredibility({
    historicalFulfillmentRate: 0.75,  // 历史兑现率低
    currentSalesGrowth: 0.05,
    inventoryHealth: 0.4,  // 库存健康度差
    reorderFrequency: 0.3,
    paymentStability: 0.7,
    channelHeat: 0.5,
  });
  console.log(`  需求真实性: ${demandCred.score}/100 (${demandCred.grade})`);
  console.log(`  建议: ${demandCred.recommendedAction}`);
  console.log(`  因子明细:`);
  for (const f of demandCred.factors) {
    console.log(`    ${f.name}: ${f.rawScore} × ${f.weight} = ${f.weightedScore}`);
  }

  // 供应真实性评分
  const supplyCred = assessSupplyCredibility({
    historicalOnTimeRate: 0.85,
    outputStability: 0.7,
    rawMaterialMatch: 0.8,
    workerEquipmentMatch: 0.9,
    qualityStability: 0.88,
    cashFlowHealth: 0.6,
  });
  console.log(`  供应真实性: ${supplyCred.score}/100 (${supplyCred.grade})`);
  console.log(`  建议: ${supplyCred.recommendedAction}`);

  return demandCred.score < 60 && demandRecon.data.forecastAccuracy < 0.6;
});

// ============================================================================
// 场景5：买卖共振 - 需求高 + 产能低 + 质量降 + 交期延误
// ============================================================================

scenario("买卖共振 - 多维度异常叠加", () => {
  // 构建对账结果
  const qtyRecon = reconcileQuantity({
    poId: "po-005",
    poQuantity: 20000,
    soQuantity: 20000,
    productionQuantity: 15000,
    shippedQuantity: 14000,
    receivedQuantity: 14000,
  });

  const deliveryRecon = reconcileDelivery({
    poId: "po-005",
    requestedDate: "2026-08-15",
    promisedDate: "2026-08-20",
    completedDate: "2026-08-25",
    shippedDate: "2026-08-26",
  });

  const qualityRecon = reconcileQuality({
    poId: "po-005",
    factoryPassRate: 0.88,
    reworkRate: 0.08,
    customerComplaintRate: 0.04,
    returnRate: 0.06,
  });

  const capacityRecon = reconcileCapacity({
    poId: "po-005",
    sellerId: "seller-B",
    claimedDailyOutput: 2000,
    actualDailyOutput: 1400,
    workerCount: 80,
    equipmentCount: 60,
    historicalOnTimeRate: 0.75,
    currentOrderLoad: 2500,
  });

  const allRecs = [qtyRecon, deliveryRecon, qualityRecon, capacityRecon];
  console.log(`  对账结果:`);
  for (const r of allRecs) {
    console.log(`    ${r.dimension}: ${r.status} (${r.variances.filter((v) => v.status === "mismatch").length} mismatches)`);
  }

  // 共振检测（传入对账结果）
  const signals = [
    "fob_price_garment_above_range",
    "utilization_pct_below_range",
    "first_pass_yield_below_range",
    "on_time_delivery_rate_below_range",
  ];
  const resonance = detectResonance(signals, apparelPack, allRecs);
  console.log(`  共振检测: ${resonance.maxLevel.toUpperCase()} (${resonance.totalResonatingNodes} nodes)`);
  console.log(`  共振模式:`);
  for (const p of resonance.patterns) {
    console.log(`    [${p.level.toUpperCase()}] ${p.patternType}`);
    console.log(`      nodes: ${p.resonatingNodes.join(", ")}`);
  }

  // 看板
  const anomalies = allRecs.map((r: ReconciliationResult<any>) => trackAnomaly<any>(r)).filter((a): a is Anomaly => a !== null);
  const dashboard = computeReconciliationDashboard({
    reconciliations: allRecs,
    anomalies,
  });
  console.log(`  看板健康度: ${dashboard.reconciliationHealthScore}/100`);
  console.log(`  活跃异常: ${dashboard.sharedView.anomalyList.length}`);

  // ChainHealth 集成
  // 构建 mock estimates 和 propagation（简化）
  const chainHealth = computeChainHealth(
    [], // estimates（空，简化）
    {
      nodeResults: [],
      bottleneckNodeId: null,
      chainDeviation: 0.15,
      coverage: 0.8,
    } as never, // propagation（简化，仅测试 reconciliation 集成）
    signals,
    apparelPack,
    allRecs,
    anomalies,
  );
  console.log(`  ChainHealth: ${chainHealth.healthScore}/100 [${chainHealth.pressureLevel.toUpperCase()}]`);
  console.log(`  riskSignals: ${chainHealth.riskSignals.join(", ")}`);

  return resonance.hasAlert && dashboard.reconciliationHealthScore < 60;
});

// ============================================================================
// 场景6：异常闭环 - 从发现数量差异到结案的全流程
// ============================================================================

scenario("异常闭环 - 7步全流程", () => {
  // Step 1: 对账发现差异
  const qtyRecon = reconcileQuantity({
    poId: "po-006",
    poQuantity: 5000,
    soQuantity: 5000,
    productionQuantity: 4800,
    shippedQuantity: 4700,
    receivedQuantity: 4650,
  });
  console.log(`  Step 1 - 对账: ${qtyRecon.status} (varianceRate=${(qtyRecon.data.varianceRate * 100).toFixed(1)}%)`);

  // Step 2: 生成异常
  const anomaly = trackAnomaly(qtyRecon);
  console.log(`  Step 2 - 异常生成: ${anomaly?.id} status=${anomaly?.status}`);

  if (!anomaly) return false;

  // Step 3: 收集证据
  const withEvidence = collectEvidence(anomaly, ["ev-recon-1", "ev-recon-2", "ev-recon-3"]);
  console.log(`  Step 3 - 证据收集: status=${withEvidence.status} evidence=${withEvidence.evidenceIds.length}`);

  // Step 4: 责任归因
  const resp = attributeResponsibility({
    type: withEvidence.type,
    buyerData: { confirmedQuantity: 5000 },
    sellerData: { shippedQuantity: 4700 },
  });
  const attributed = attributeAnomaly(withEvidence, resp);
  console.log(`  Step 4 - 责任归因: status=${attributed.status} party=${attributed.responsibleParty}`);

  // Step 5: 解决
  const resolved = resolveAnomaly(attributed, "卖方少发300件，协商按实际数量结算，退款差额");
  console.log(`  Step 5 - 解决: status=${resolved.status} resolution=${resolved.resolution?.substring(0, 40)}...`);

  // Step 6: 结案
  const closed = closeAnomaly(resolved);
  console.log(`  Step 6 - 结案: status=${closed.status} scoreImpact=${closed.scoreImpact}`);

  // Step 7: 评分影响
  console.log(`  Step 7 - 评分影响: ${closed.scoreImpact} 分`);
  console.log(`  Agent 输出:`);
  console.log(formatAnomalyForAgent(closed).split("\n").map((l) => `    ${l}`).join("\n"));

  // 验证全流程
  const allAnomalies = [closed];
  const dashboard = summarizeAnomalies(allAnomalies);
  console.log(`  异常看板: total=${dashboard.total} active=${dashboard.activeCount} byStatus=${JSON.stringify(dashboard.byStatus)}`);

  return closed.status === "closed" && closed.responsibleParty === "seller" && closed.scoreImpact === -5;
});

// ============================================================================
// 数据可信度分层验证
// ============================================================================

scenario("数据可信度分层验证", () => {
  // factual: 订单/发货/入库/付款
  const orderEv = ev("ev-1", "erp-system", "A+", 90, "financial_primary", "po-001", "PO record", 350000, "CNY", "api");
  const layer1 = classifyDataTrust(orderEv);
  const weight1 = getTrustWeight(layer1, "A+");
  console.log(`  订单数据: layer=${layer1} weight=${weight1}`);

  // commitment: 报价/承诺
  const quoteEv = ev("ev-2", "supplier-portal", "B", 60, "market_signal", "quote-001", "Quote", 52, "CNY", "manual");
  const layer2 = classifyDataTrust(quoteEv);
  const weight2 = getTrustWeight(layer2, "B");
  console.log(`  报价数据: layer=${layer2} weight=${weight2}`);

  // external: 原料价格
  const marketEv = ev("ev-3", "tradingeconomics", "S", 100, "research_context", "cotton_price", "Cotton price", 80.94, "cents/lb", "web");
  const layer3 = classifyDataTrust(marketEv);
  const weight3 = getTrustWeight(layer3, "S");
  console.log(`  市场数据: layer=${layer3} weight=${weight3}`);

  // subjective: 口头反馈
  const verbalEv = ev("ev-4", "sales-rep", "C", 30, "market_signal", "verbal_feedback", "Verbal", 1, "boolean", "manual");
  const layer4 = classifyDataTrust(verbalEv);
  const weight4 = getTrustWeight(layer4, "C");
  console.log(`  口头数据: layer=${layer4} weight=${weight4}`);

  // 验证可信度排序
  return weight1 > weight3 && weight3 > weight2 && weight2 > weight4;
});

// ============================================================================
// 库存责任划分验证
// ============================================================================

scenario("库存责任划分", () => {
  // 质量退货 -> 卖方责任
  const r1 = classifyInventoryResponsibility({
    returnRate: 0.15,
    sellerFinishedRatio: 0.2,
    designChangeCount: 0,
    forecastAccuracy: 0.8,
    qualityReturnRatio: 0.6,
  });
  console.log(`  质量退货为主: ${r1}`);

  // 设计变更 -> 设计师责任
  const r2 = classifyInventoryResponsibility({
    returnRate: 0.05,
    sellerFinishedRatio: 0.2,
    designChangeCount: 4,
    forecastAccuracy: 0.8,
    qualityReturnRatio: 0.1,
  });
  console.log(`  设计变更频繁: ${r2}`);

  // 预测偏差 -> 买方责任
  const r3 = classifyInventoryResponsibility({
    returnRate: 0.2,
    sellerFinishedRatio: 0.2,
    designChangeCount: 0,
    forecastAccuracy: 0.4,
    qualityReturnRatio: 0.1,
  });
  console.log(`  预测偏差大: ${r3}`);

  // 卖方积压 -> 卖方责任
  const r4 = classifyInventoryResponsibility({
    returnRate: 0.05,
    sellerFinishedRatio: 0.6,
    designChangeCount: 0,
    forecastAccuracy: 0.8,
    qualityReturnRatio: 0.1,
  });
  console.log(`  卖方积压: ${r4}`);

  return r1 === "seller" && r2 === "designer" && r3 === "buyer" && r4 === "seller";
});

// ============================================================================
// 协同看板验证
// ============================================================================

scenario("协同看板", () => {
  const recs: ReconciliationResult<any>[] = [
    reconcileQuantity({ poId: "po-d1", poQuantity: 10000, soQuantity: 10000, shippedQuantity: 9800, receivedQuantity: 9800 }),
    reconcilePrice({ poId: "po-d1", quotePrice: 35, poPrice: 36, contractPrice: 36, invoicePrice: 36, paymentPrice: 36 }),
    reconcileDelivery({ poId: "po-d1", requestedDate: "2026-08-15", promisedDate: "2026-08-18", completedDate: "2026-08-20" }),
    reconcileQuality({ poId: "po-d1", factoryPassRate: 0.96 }),
  ];
  const anomalies = recs.map((r) => trackAnomaly(r)).filter((a): a is Anomaly => a !== null);

  const dashboard = computeReconciliationDashboard({
    reconciliations: recs,
    anomalies,
    supplierCredibilityScores: [{ sellerId: "seller-B", score: 75, grade: "acceptable" }],
  });

  console.log(formatDashboard(dashboard));

  return dashboard.reconciliationHealthScore > 0 && dashboard.sharedView.anomalyList.length > 0;
});

// ============================================================================
// Feedback 规则验证
// ============================================================================

scenario("Feedback 规则 14-19 验证", () => {
  const recs: ReconciliationResult<any>[] = [
    reconcileQuantity({ poId: "po-f1", poQuantity: 10000, soQuantity: 10000, shippedQuantity: 9000, receivedQuantity: 9000 }),
  ];
  const anomalies = recs.map((r) => trackAnomaly(r)).filter((a): a is Anomaly => a !== null);
  const summary = computeReconciliationSummary(recs, anomalies);

  // 构建 mock chainEstimate
  const chainHealth = computeChainHealth(
    [],
    { nodeResults: [], bottleneckNodeId: null, chainDeviation: 0.1, coverage: 0.8 } as never,
    ["reconciliation_quantity_mismatch"],
    apparelPack,
    recs,
    anomalies,
  );

  // 生成 Feedback
  const followUps = generateFollowUp(
    {
      id: "syn-1",
      triggerId: "trigger-1",
      title: "Reconciliation mismatch detected",
      brief: "Quantity mismatch",
      findings: [],
      evidenceIds: [],
      confidence: 0.8,
      generatedAt: NOW.toISOString(),
      chainEstimate: chainHealth,
    },
    [],
    "task-1",
    NOW,
  );

  console.log(`  Follow-up tasks: ${followUps.length}`);
  for (const fu of followUps) {
    console.log(`    [${fu.kind}] ${fu.objective.substring(0, 70)}`);
  }

  // 应该有冻结结算的任务
  const hasFreezeTask = followUps.some((f) => f.objective.includes("Freeze settlement"));
  return hasFreezeTask;
});

// ============================================================================
// 汇总
// ============================================================================

console.log(`\n${"=".repeat(60)}`);
console.log(`总计: ${scenarioCount} 场景, ${passCount} 通过, ${scenarioCount - passCount} 失败`);
console.log("=".repeat(60));

if (passCount < scenarioCount) {
  process.exit(1);
}
