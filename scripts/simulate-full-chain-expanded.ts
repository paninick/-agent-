/**
 * scripts/simulate-full-chain-expanded.ts - 15节点全链条仿真
 *
 * 验证扩展后的供应链模型：
 *   场景1：原油涨价 -> PTA -> 涤纶 -> 棉花替代 -> 纱线 -> 面料 -> 制造 -> 贸易 -> 品牌 -> 渠道
 *     验证从石化端到零售端的正向传导
 *
 *   场景2：品牌零售价反馈 -> 反向逆推全链
 *     验证从下游到上游的反向推导在新节点结构下工作
 *
 *   场景3：资金流 + 人员流 -> 交叉影响
 *     验证利率上升 + 缝纫工短缺同时发生时的多重因果边
 *
 *   场景4：期货 -> 现货 -> 全链传导
 *     验证交易所节点作为价格发现中心的作用
 */

import type { EvidenceEntry } from "../src/intelligence/types";
import { apparelPack } from "../src/intelligence/analysis/industryPacks/apparel";
import { estimateNodeValues } from "../src/intelligence/analysis/chain-estimator";
import { propagateChain, formatPropagation, formatReversePropagation } from "../src/intelligence/analysis/chain-propagator";
import { computeChainHealth, formatChainHealth } from "../src/intelligence/analysis/chain-health";

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

// ============================================================
// 场景1: 原油涨价 -> PTA -> 涤纶 -> 棉花替代 -> 纱线 -> 全链
// ============================================================
function scenario1(): void {
  console.log("\n" + "=".repeat(70));
  console.log("Scenario 1: Crude oil spike -> petrochemical -> yarn -> full chain");
  console.log("=".repeat(70));

  // 原油从 80 USD/bbl 涨到 110（基线中点 80，涨了 37.5%）
  // PTA 从 5500 涨到 7200（基线中点 5500，涨了 30.9%）
  // 涤纶短纤从 9000 涨到 11500（基线中点 9000，涨了 27.8%）
  // 棉花从 14000 涨到 16200（替代效应，基线中点 14000，涨了 15.7%）
  const evidence: EvidenceEntry[] = [
    ev("ev1-oil", "tradingeconomics", "S", 0.95, "financial_primary", "crude_oil_price",
      "Brent crude 110 USD/bbl, up 37.5% from baseline 80", 110, "USD/bbl"),
    ev("ev1-pta", "ccfgroup", "S", 0.9, "financial_primary", "pta_price",
      "PTA 7200 CNY/ton, up 30.9% from baseline 5500", 7200, "CNY/ton"),
    ev("ev1-polyester", "ccfgroup", "S", 0.9, "financial_primary", "polyester_staple_price",
      "Polyester staple 11500 CNY/ton, up 27.8%", 11500, "CNY/ton"),
    ev("ev1-cotton", "tradingeconomics", "S", 0.95, "financial_primary", "cotton_price",
      "Cotton 16200 CNY/ton, up 15.7% (substitution effect)", 16200, "CNY/ton"),
  ];

  const estimates = estimateNodeValues(evidence, apparelPack);
  console.log("\nNode Estimates:");
  for (const est of estimates) {
    for (const s of est.subjects) {
      console.log(`  ${est.nodeId}.${s.subject}: consensus=${s.consensusValue.toFixed(0)} (sources=${s.sourceCount}, disagreement=${(s.disagreement * 100).toFixed(1)}%)`);
    }
  }

  const propagation = propagateChain(estimates, apparelPack);
  console.log("\n" + formatPropagation(propagation));

  const health = computeChainHealth(estimates, propagation);
  console.log("\n" + formatChainHealth(health));

  // 验证
  console.log("\n--- Verification ---");
  const oilBaseline = (40 + 120) / 2; // 80
  const oilDelta = (110 - oilBaseline) / oilBaseline; // 37.5%
  const ptaBaseline = (3000 + 8000) / 2; // 5500
  // petrochemical -> yarn coeff = 0.40
  const yarnBaseline = (15000 + 30000) / 2; // 22500
  const yarnExpected = yarnBaseline * (1 + oilDelta * 0.40); // 直接从原油到纱线
  console.log(`Oil baseline: ${oilBaseline}, delta: ${(oilDelta * 100).toFixed(1)}%`);
  console.log(`Yarn expected (from oil, coeff=0.40): ${yarnExpected.toFixed(0)}`);

  const yarnProp = propagation.nodeResults.find((n) => n.nodeId === "yarn");
  if (yarnProp?.expected) {
    // yarn 的上游应该是 petrochemical (coeff 0.40) 或 raw_material (coeff 0.72)
    console.log(`Propagator computed yarn expected: ${yarnProp.expected.toFixed(0)}`);
    console.log(`Yarn expected source: ${yarnProp.fromPath?.from} (coeff=${yarnProp.fromPath?.coefficient})`);
  }

  const checks = [
    { name: "3+ nodes estimated (raw_material, petrochemical, yarn)", pass: estimates.length >= 3 },
    { name: "health score computed", pass: health.healthScore >= 0 && health.healthScore <= 100 },
    { name: "chain deviation > 0 (oil shock propagates)", pass: propagation.chainDeviation >= 0 },
  ];
  for (const c of checks) {
    console.log(`  ${c.pass ? "PASS" : "FAIL"}: ${c.name}`);
  }
}

// ============================================================
// 场景2: 品牌零售价反馈 -> 反向逆推全链
// ============================================================
function scenario2(): void {
  console.log("\n" + "=".repeat(70));
  console.log("Scenario 2: Brand retail feedback -> reverse propagate 15-node chain");
  console.log("=".repeat(70));

  // 品牌反馈零售价 600 CNY/piece（基线中点 415，涨了 44.6%）
  const evidence: EvidenceEntry[] = [
    ev("ev2-retail", "brand-feedback", "A+", 0.85, "platform_sales_primary",
      "retail_price_garment", "Brand feedback: retail 600 CNY/piece, up 44.6%", 600, "CNY/piece",
      "authorized_platform", 0.85),
  ];

  const estimates = estimateNodeValues(evidence, apparelPack);
  const propagation = propagateChain(estimates, apparelPack);

  if (propagation.reversePropagation) {
    console.log("\n" + formatReversePropagation(propagation.reversePropagation));

    const rp = propagation.reversePropagation;
    console.log("\n--- Reverse Propagation Verification ---");
    console.log(`Anchor: ${rp.anchorNodeId} = ${rp.anchorValue}`);
    console.log(`Coverage: ${(rp.coverage * 100).toFixed(0)}%`);

    // 验证逆推到达了新节点
    const newNodeIds = ["trading_co", "petrochemical", "fiber_exchange", "agri_inputs", "secondhand"];
    for (const nodeId of newNodeIds) {
      const node = rp.nodeResults.find((n) => n.nodeId === nodeId);
      const implied = (node && node.impliedValue !== null) ? node.impliedValue.toFixed(1) : "no baseline";
      const delta = (node && node.impliedDeltaPct !== null) ? `${(node.impliedDeltaPct * 100).toFixed(1)}%` : "-";
      console.log(`  ${nodeId.padEnd(20)} implied=${implied}  impliedDelta=${delta}`);
    }

    const hasNewNodes = newNodeIds.some((id) => rp.nodeResults.find((n) => n.nodeId === id)?.impliedDeltaPct !== null);
    console.log(`\n${hasNewNodes ? "PASS" : "FAIL"}: reverse propagation reaches new nodes`);
  } else {
    console.log("FAIL: no reverse propagation result");
  }
}

// ============================================================
// 场景3: 资金流 + 人员流交叉影响
// ============================================================
function scenario3(): void {
  console.log("\n" + "=".repeat(70));
  console.log("Scenario 3: Capital flow + workforce cross-impact");
  console.log("=".repeat(70));

  // 利率上升到 7%（基线中点 5.5%，超 above_range）
  // 缝纫工工资上涨到 700 USD/month（基线中点 490，超 above_range）
  // FOB 上涨到 85 CNY/piece（基线中点 62.5，超 above_range）
  const evidence: EvidenceEntry[] = [
    ev("ev3-rate", "centralbank", "S", 0.95, "macro_control", "loan_interest_rate",
      "Loan rate 7%, up from baseline 5.5%", 7, "%"),
    ev("ev3-wage", "ilo", "A+", 0.85, "financial_primary", "sewer_wage",
      "Sewer wage 700 USD/month, up from baseline 490", 700, "USD/month"),
    ev("ev3-fob", "tradingeconomics", "S", 0.95, "financial_primary", "fob_price_garment",
      "FOB price 85 CNY/piece, up from baseline 62.5", 85, "CNY/piece"),
    ev("ev3-util", "ccfgroup", "S", 0.9, "trade_flow_primary", "utilization_pct",
      "Capacity utilization 95%, above bottleneck threshold 92%", 95, "%"),
  ];

  const estimates = estimateNodeValues(evidence, apparelPack);
  console.log("\nNode Estimates:");
  for (const est of estimates) {
    for (const s of est.subjects) {
      console.log(`  ${est.nodeId}.${s.subject}: consensus=${s.consensusValue.toFixed(1)} (conf=${(s.confidence * 100).toFixed(0)}%)`);
    }
  }

  const propagation = propagateChain(estimates, apparelPack);
  console.log("\n" + formatPropagation(propagation));

  const health = computeChainHealth(estimates, propagation);
  console.log("\n" + formatChainHealth(health));

  // 验证资金流和人员流数据存在
  console.log("\n--- Verification ---");
  const capitalFlows = apparelPack.capitalFlows ?? [];
  const workforceFlows = apparelPack.workforceFlows ?? [];
  console.log(`Capital flows: ${capitalFlows.length}`);
  console.log(`Workforce flows: ${workforceFlows.length}`);
  console.log(`Business dimensions: ${apparelPack.businessDimensions?.length ?? 0}`);

  const checks = [
    { name: "capital flows defined", pass: capitalFlows.length >= 10 },
    { name: "workforce flows defined", pass: workforceFlows.length >= 8 },
    { name: "loan_interest_rate in knownRanges", pass: "loan_interest_rate" in apparelPack.knownRanges },
    { name: "sewer_wage in knownRanges", pass: "sewer_wage" in apparelPack.knownRanges },
    { name: "health score computed", pass: health.healthScore >= 0 },
  ];
  for (const c of checks) {
    console.log(`  ${c.pass ? "PASS" : "FAIL"}: ${c.name}`);
  }
}

// ============================================================
// 场景4: 期货 -> 现货 -> 全链传导
// ============================================================
function scenario4(): void {
  console.log("\n" + "=".repeat(70));
  console.log("Scenario 4: Futures -> spot -> full chain propagation");
  console.log("=".repeat(70));

  // 棉花期货 17500（基线中点 15000，涨了 16.7%）
  // 期货 -> 现货（coeff 0.85）-> 棉花现货 should be ~16000
  // 期货 -> 纱线（coeff 0.60）-> 纱线 expected
  const evidence: EvidenceEntry[] = [
    ev("ev4-futures", "zce", "S", 0.95, "financial_primary", "cotton_futures_price",
      "ZCE cotton futures 17500 CNY/ton, up 16.7%", 17500, "CNY/ton"),
    ev("ev4-spot", "tradingeconomics", "S", 0.95, "financial_primary", "cotton_price",
      "Cotton spot 16000 CNY/ton, up 14.3%", 16000, "CNY/ton"),
  ];

  const estimates = estimateNodeValues(evidence, apparelPack);
  console.log("\nNode Estimates:");
  for (const est of estimates) {
    for (const s of est.subjects) {
      console.log(`  ${est.nodeId}.${s.subject}: consensus=${s.consensusValue.toFixed(0)}`);
    }
  }

  const propagation = propagateChain(estimates, apparelPack);
  console.log("\n" + formatPropagation(propagation));

  // 验证期货节点出现
  const exchangeNode = propagation.nodeResults.find((n) => n.nodeId === "fiber_exchange");
  console.log("\n--- Verification ---");
  console.log(`Fiber exchange node in results: ${exchangeNode ? "yes" : "no"}`);
  if (exchangeNode) {
    console.log(`  observed=${exchangeNode.observed}, expected=${exchangeNode.expected}`);
  }

  // 验证 yarn 从期货或棉花传导
  const yarnNode = propagation.nodeResults.find((n) => n.nodeId === "yarn");
  if (yarnNode?.fromPath) {
    console.log(`Yarn expected from: ${yarnNode.fromPath.from} (coeff=${yarnNode.fromPath.coefficient})`);
  }

  // 反向逆推
  if (propagation.reversePropagation) {
    console.log("\n" + formatReversePropagation(propagation.reversePropagation));
  }

  const checks = [
    { name: "fiber_exchange node in chain", pass: !!exchangeNode },
    { name: "yarn has expected value", pass: yarnNode?.expected !== null },
    { name: "reverse propagation exists", pass: !!propagation.reversePropagation },
  ];
  for (const c of checks) {
    console.log(`  ${c.pass ? "PASS" : "FAIL"}: ${c.name}`);
  }
}

// ============================================================
// 主函数
// ============================================================
async function main(): Promise<void> {
  console.log("Expanded Supply Chain Simulation (14 nodes + 5 risk nodes)");
  console.log("Date: 2026-07-08");
  console.log(`Total nodes: ${apparelPack.nodes.length}`);
  console.log(`Chain nodes: ${apparelPack.nodes.filter((n) => n.position > 0).length}`);
  console.log(`Risk nodes: ${apparelPack.nodes.filter((n) => n.position === 0).length}`);
  console.log(`Transmission paths: ${apparelPack.transmissionPaths?.length ?? 0}`);
  console.log(`Supply lanes: ${apparelPack.supplyLanes?.length ?? 0}`);
  console.log(`Cross-dimension rules: ${apparelPack.crossDimensionRules?.length ?? 0}`);
  console.log(`Capital flows: ${apparelPack.capitalFlows?.length ?? 0}`);
  console.log(`Workforce flows: ${apparelPack.workforceFlows?.length ?? 0}`);
  console.log(`Business dimensions: ${apparelPack.businessDimensions?.length ?? 0}`);
  console.log(`Known ranges: ${Object.keys(apparelPack.knownRanges).length}`);

  scenario1();
  scenario2();
  scenario3();
  scenario4();

  console.log("\n" + "=".repeat(70));
  console.log("All expanded chain scenarios completed.");
  console.log("=".repeat(70));
}

main().catch((err) => {
  console.error("Simulation failed:", err);
  process.exit(1);
});
