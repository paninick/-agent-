/**
 * scripts/simulate-full-data-map.ts - 全链路经营与数据地图仿真
 *
 * 5 个场景验证全量实现的 Phase E 系统：
 *
 *   场景1：原油涨价 -> 全链正向传导（含辅料节点）
 *     原油 -> PTA -> 涤纶 -> 纱线 -> 面料 -> 辅料 -> 成衣 -> 贸易 -> 品牌 -> 渠道 -> 消费者 -> 回收 -> 二批
 *
 *   场景2：TikTok趋势爆发 -> 信息流传导
 *     社媒热度 -> 搜索增长 -> 电商上新 -> 工厂询盘 -> 产能紧张 -> 交期延长
 *
 *   场景3：多节点共振检测
 *     利率+汇率+工资同时上涨 -> 制造业危机 -> 共振告警
 *
 *   场景4：品牌零售价反馈 -> 反向逆推（含新节点）
 *     品牌涨价 -> 逆推全链应有值 -> 检测不一致
 *
 *   场景5：趋势衰退 -> 清仓信号
 *     趋势饱和 -> 衰退 -> 库存积压 -> 二批/二手/回收
 */

import type { EvidenceEntry } from "../src/intelligence/types";
import type { RawRecord, SwarmTrigger } from "../src/intelligence/spine/types";
import type { ReflexPathway } from "../src/intelligence/memory/types";
import { MemoryStore } from "../src/intelligence/memory/store";
import { MemoryBroker } from "../src/intelligence/memory/broker";
import { apparelPack } from "../src/intelligence/analysis/industryPacks/apparel";
import { estimateNodeValues, findConsensusValue } from "../src/intelligence/analysis/chain-estimator";
import { propagateChain, formatPropagation, formatReversePropagation } from "../src/intelligence/analysis/chain-propagator";
import { computeChainHealth, formatChainHealth } from "../src/intelligence/analysis/chain-health";
import { detectResonance, formatResonance } from "../src/intelligence/analysis/resonance-detector";
import { synthesizeBrief } from "../src/intelligence/synthesis/brief";
import { generateFollowUp } from "../src/intelligence/workflows/feedback";
import { orchestrateSwarm } from "../src/intelligence/swarm/orchestrator";

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
// 场景1: 原油涨价 -> 全链正向传导（含辅料节点）
// ============================================================
function scenario1(): void {
  console.log("\n" + "=".repeat(70));
  console.log("Scenario 1: Crude oil spike -> full chain (with accessories node)");
  console.log("=".repeat(70));

  const evidence: EvidenceEntry[] = [
    ev("ev1-oil", "tradingeconomics", "S", 0.95, "financial_primary", "crude_oil_price",
      "Brent crude 110 USD/bbl, up 37.5%", 110, "USD/bbl"),
    ev("ev1-pta", "ccfgroup", "S", 0.9, "financial_primary", "pta_price",
      "PTA 7200 CNY/ton, up 30.9%", 7200, "CNY/ton"),
    ev("ev1-polyester", "ccfgroup", "S", 0.9, "financial_primary", "polyester_staple_price",
      "Polyester staple 11500 CNY/ton", 11500, "CNY/ton"),
    ev("ev1-cotton", "tradingeconomics", "S", 0.95, "financial_primary", "cotton_price",
      "Cotton 16200 CNY/ton (substitution effect)", 16200, "CNY/ton"),
    ev("ev1-yarn", "ccfgroup", "S", 0.9, "financial_primary", "yarn_price",
      "Yarn 28000 CNY/ton", 28000, "CNY/ton"),
    ev("ev1-dye", "ccfgroup", "S", 0.9, "financial_primary", "dye_price",
      "Dye price 65 CNY/kg (energy-driven)", 65, "CNY/kg"),
    ev("ev1-fabric", "ccfgroup", "S", 0.9, "financial_primary", "fabric_price_per_m",
      "Fabric 38 CNY/m", 38, "CNY/m"),
  ];

  const estimates = estimateNodeValues(evidence, apparelPack);
  console.log(`\nEstimates: ${estimates.length} nodes`);
  for (const est of estimates) {
    const subj = est.subjects[0];
    if (subj) {
      console.log(`  ${est.nodeId.padEnd(16)} ${subj.subject}=${subj.consensusValue.toFixed(1)} (conf=${est.confidence.toFixed(2)})`);
    }
  }

  const propagation = propagateChain(estimates, apparelPack);
  console.log("\n" + formatPropagation(propagation));

  // 验证辅料节点出现在传导结果中
  const accessoriesNode = propagation.nodeResults.find((n) => n.nodeId === "accessories");
  if (accessoriesNode) {
    console.log(`\n✓ Accessories node in propagation: position=${accessoriesNode.position}, observed=${accessoriesNode.observed ?? "null"}`);
  } else {
    console.log("\n✗ Accessories node NOT in propagation");
  }

  // 验证全链覆盖
  const chainNodes = propagation.nodeResults.filter((n) => n.position > 0);
  console.log(`\nChain nodes covered: ${chainNodes.length}/${apparelPack.nodes.filter((n) => n.position > 0).length}`);
  const pass = chainNodes.length >= 14;
  console.log(pass ? "PASS" : "FAIL");
}

// ============================================================
// 场景2: TikTok趋势爆发 -> 信息流传导
// ============================================================
function scenario2(): void {
  console.log("\n" + "=".repeat(70));
  console.log("Scenario 2: TikTok trend explosion -> information flow propagation");
  console.log("=".repeat(70));

  const evidence: EvidenceEntry[] = [
    ev("ev2-tiktok", "tiktok", "A+", 0.85, "market_signal", "tiktok_views",
      "TikTok #cottagecore 500M views/week, up 500%", 500_000_000, "views/week", "web", 0.8),
    ev("ev2-social", "instagram", "A+", 0.85, "market_signal", "social_media_mentions",
      "Social media mentions 800K/day", 800_000, "mentions/day", "web", 0.8),
    ev("ev2-search", "google", "A+", 0.85, "market_signal", "search_index",
      "Search index 8500 (baseline max 10000)", 8500, "index", "web", 0.8),
    ev("ev2-pinterest", "pinterest", "A", 0.8, "market_signal", "pinterest_saves",
      "Pinterest saves 350K/week", 350_000, "saves/week", "web", 0.8),
    ev("ev2-inquiries", "alibaba", "A", 0.8, "market_signal", "supplier_inquiries",
      "Supplier inquiries 35K/week (factory response)", 35_000, "inquiries/week", "web", 0.8),
    ev("ev2-samples", "alibaba", "A", 0.8, "market_signal", "sample_requests",
      "Sample requests 8K/week", 8_000, "requests/week", "web", 0.8),
    ev("ev2-listings", "taobao", "A", 0.8, "market_signal", "ecommerce_new_listings",
      "E-commerce new listings 400K/week", 400_000, "listings/week", "web", 0.8),
  ];

  const estimates = estimateNodeValues(evidence, apparelPack);
  console.log(`\nEstimates: ${estimates.length} nodes`);
  for (const est of estimates) {
    const subj = est.subjects[0];
    if (subj) {
      console.log(`  ${est.nodeId.padEnd(16)} ${subj.subject}=${subj.consensusValue.toFixed(1)}`);
    }
  }

  // 验证 trend_signal 节点被估计
  const trendEstimate = estimates.find((e) => e.nodeId === "trend_signal");
  if (trendEstimate) {
    console.log(`\n✓ trend_signal node estimated: ${trendEstimate.subjects.length} subjects, confidence=${trendEstimate.confidence.toFixed(2)}`);
  } else {
    console.log("\n✗ trend_signal node NOT estimated");
  }

  // 验证信息流数据存在
  console.log(`\nInformation flows: ${apparelPack.informationFlows?.length ?? 0}`);
  if (apparelPack.informationFlows) {
    for (const flow of apparelPack.informationFlows) {
      console.log(`  ${flow.id}: buzz=${flow.buzzMetric}, validation=${flow.validationMetric ?? "-"}, supply=${flow.supplyResponseMetric ?? "-"}`);
    }
  }

  // 测试共振检测（趋势信号 + 制造 + 渠道）
  const signals = [
    "tiktok_views_above_range",
    "social_media_mentions_above_range",
    "search_index_above_range",
    "supplier_inquiries_above_range",
    "utilization_pct_above_range",    // manufacturing
    "sell_through_rate_above_range",  // channel
  ];
  const resonance = detectResonance(signals, apparelPack);
  console.log(`\nResonance detection for trend signals:`);
  console.log(formatResonance(resonance));

  console.log(`\n${resonance.hasAlert ? "✓" : "✗"} Resonance alert: ${resonance.hasAlert}`);
}

// ============================================================
// 场景3: 多节点共振检测（利率+汇率+工资同时上涨 -> 制造业危机）
// ============================================================
function scenario3(): void {
  console.log("\n" + "=".repeat(70));
  console.log("Scenario 3: Multi-node resonance (interest + FX + wage -> manufacturing crisis)");
  console.log("=".repeat(70));

  // 模拟多节点同时异常的信号
  const signals = [
    "loan_interest_rate_above_range",       // financial_risk: 利率上升
    "fx_rate_usd_cny_above_range",          // financial_risk: CNY贬值
    "sewer_wage_above_range",               // manufacturing: 工资上涨
    "fob_price_garment_above_range",        // manufacturing: FOB涨价
    "utilization_pct_below_range",          // manufacturing: 产能下降
    "fabric_price_per_m_above_range",       // fabric: 面料涨价
    "gross_margin_below_range",             // brand: 毛利率下降
  ];

  const resonance = detectResonance(signals, apparelPack);
  console.log(`\nSignals (${signals.length}): ${signals.join(", ")}`);
  console.log(`\n${formatResonance(resonance)}`);

  console.log(`\nResults:`);
  console.log(`  Max level: ${resonance.maxLevel}`);
  console.log(`  Total resonating nodes: ${resonance.totalResonatingNodes}`);
  console.log(`  Overall confidence: ${(resonance.overallConfidence * 100).toFixed(0)}%`);
  console.log(`  Has alert: ${resonance.hasAlert}`);
  console.log(`  Patterns detected: ${resonance.patterns.length}`);

  // 验证 cost_push_crisis 模式被触发
  const costPushPattern = resonance.patterns.find((p) => p.id === "cost_push_crisis");
  if (costPushPattern) {
    console.log(`\n✓ Cost push crisis pattern detected: ${costPushPattern.resonatingNodes.join(", ")}`);
    console.log(`  Recommended action: ${costPushPattern.recommendedAction}`);
  } else {
    console.log("\n✗ Cost push crisis pattern NOT detected");
  }

  // 验证中等及以上共振
  if (resonance.maxLevel === "moderate" || resonance.maxLevel === "strong" || resonance.maxLevel === "critical") {
    console.log(`✓ Resonance level is ${resonance.maxLevel} (>= moderate)`);
  } else {
    console.log(`✗ Resonance level is only ${resonance.maxLevel} (expected >= moderate)`);
  }
}

// ============================================================
// 场景4: 品牌零售价反馈 -> 反向逆推（含新节点）
// ============================================================
function scenario4(): void {
  console.log("\n" + "=".repeat(70));
  console.log("Scenario 4: Brand retail price feedback -> reverse propagation (with new nodes)");
  console.log("=".repeat(70));

  const evidence: EvidenceEntry[] = [
    ev("ev4-retail", "brandq", "A+", 0.85, "financial_primary", "retail_price_garment",
      "Brand retail price 650 CNY (up 30% from baseline 500)", 650, "CNY/piece", "report", 0.85),
    ev("ev4-fob", "customs", "S", 0.9, "trade_flow_primary", "fob_price_garment",
      "FOB price 85 CNY (up 20%)", 85, "CNY/piece", "filing", 0.95),
    ev("ev4-cotton", "tradingeconomics", "S", 0.95, "financial_primary", "cotton_price",
      "Cotton 15500 CNY/ton", 15500, "CNY/ton"),
  ];

  const estimates = estimateNodeValues(evidence, apparelPack);
  const propagation = propagateChain(estimates, apparelPack);

  // 反向逆推
  const rp = propagation.reversePropagation;
  if (rp) {
    console.log(`\n${formatReversePropagation(rp)}`);
    console.log(`\nReverse propagation coverage: ${(rp.coverage * 100).toFixed(0)}%`);
    console.log(`Consistency: ${(rp.consistency * 100).toFixed(0)}%`);

    // 验证逆推到达新节点
    const newNodeIds = ["accessories", "trading_co", "competition"];
    for (const nodeId of newNodeIds) {
      const node = rp.nodeResults.find((n) => n.nodeId === nodeId);
      const implied = node?.impliedValue !== null && node?.impliedValue !== undefined ? node.impliedValue.toFixed(1) : "no baseline";
      const delta = node && node.impliedDeltaPct !== null ? `${(node.impliedDeltaPct * 100).toFixed(1)}%` : "-";
      console.log(`  ${nodeId.padEnd(20)} implied=${implied}  impliedDelta=${delta}`);
    }
  } else {
    console.log("\n✗ No reverse propagation result");
  }

  // 测试完整 ChainHealth（含共振）
  const allSignals = [
    "retail_price_garment_above_range",
    "fob_price_garment_above_range",
    "cotton_price_above_range",
  ];
  const health = computeChainHealth(estimates, propagation, allSignals, apparelPack);
  console.log(`\n${formatChainHealth(health)}`);

  console.log(`\n✓ ChainHealth computed with resonance: ${health.resonance ? health.resonance.maxLevel : "none"}`);
}

// ============================================================
// 场景5: 趋势衰退 -> 清仓信号 -> 二批/二手/回收
// ============================================================
function scenario5(): void {
  console.log("\n" + "=".repeat(70));
  console.log("Scenario 5: Trend decline -> clearance -> secondhand/recycling");
  console.log("=".repeat(70));

  const evidence: EvidenceEntry[] = [
    ev("ev5-saturation", "tiktok", "A+", 0.85, "market_signal", "trend_saturation",
      "Trend saturation 92% (entering decline)", 92, "%", "web", 0.8),
    ev("ev5-velocity", "google", "A+", 0.85, "market_signal", "trend_velocity",
      "Trend velocity -35%/week (declining)", -35, "%/week", "web", 0.8),
    ev("ev5-stage", "editorial", "A", 0.8, "research_context", "trend_lifecycle_stage",
      "Trend lifecycle stage 3 (declining)", 3, "stage", "report", 0.85),
    ev("ev5-inventory", "brandq", "A+", 0.85, "financial_primary", "retail_inventory",
      "Retail inventory 8M pieces (overstock)", 8_000_000, "pieces", "report", 0.85),
    ev("ev5-secondhand", "grailed", "A", 0.8, "market_signal", "secondhand_price",
      "Secondhand price dropping to 15 CNY/piece", 15, "CNY/piece", "web", 0.8),
    ev("ev5-surplus", "offprice", "A", 0.8, "market_signal", "surplus_inventory",
      "Surplus inventory 30M pieces", 30_000_000, "pieces", "web", 0.8),
  ];

  const estimates = estimateNodeValues(evidence, apparelPack);
  console.log(`\nEstimates: ${estimates.length} nodes`);

  const propagation = propagateChain(estimates, apparelPack);
  console.log(`\nPropagation coverage: ${(propagation.coverage * 100).toFixed(0)}%`);

  // 验证 secondhand 和 recycling 节点出现
  for (const nodeId of ["secondhand", "recycling", "trend_signal"]) {
    const node = propagation.nodeResults.find((n) => n.nodeId === nodeId);
    console.log(`  ${nodeId.padEnd(16)} ${node ? "✓ in propagation" : "✗ NOT in propagation"}`);
  }

  // 测试趋势衰退共振
  const signals = [
    "trend_saturation_above_range",
    "trend_velocity_below_range",
    "retail_inventory_above_range",
    "surplus_inventory_above_range",
    "social_media_mentions_below_range",
    "consumer_confidence_below_range",      // consumer: 消费者信心下降
  ];
  const resonance = detectResonance(signals, apparelPack);
  console.log(`\nResonance for trend decline:`);
  console.log(formatResonance(resonance));

  // 测试反馈生成
  const trigger: SwarmTrigger = {
    id: "trigger-test",
    ruleId: "rule-trend-decline",
    signalId: "signal-trend-decline",
    firedAt: NOW.toISOString(),
    objective: "Assess trend decline impact and clearance strategy",
  };
  const synthesis = synthesizeBrief({
    trigger,
    findings: [{
      id: "finding-1",
      taskId: "task-test",
      summary: "Trend declining: saturation 92%, velocity -35%, inventory overstock",
      confidence: 0.85,
      signals,
      evidenceIds: ["ev5-saturation", "ev5-velocity", "ev5-stage", "ev5-inventory"],
    }],
    evidenceIds: ["ev5-saturation", "ev5-velocity", "ev5-stage", "ev5-inventory"],
    evidence,
    pack: apparelPack,
  });

  const followUps = generateFollowUp(synthesis, [{
    id: "finding-1",
    taskId: "task-test",
    summary: "Trend declining",
    confidence: 0.85,
    signals,
    evidenceIds: [],
  }], "task-test");

  console.log(`\nFollow-up tasks (${followUps.length}):`);
  for (const fu of followUps) {
    console.log(`  [${fu.kind}] ${fu.objective}`);
  }

  // 验证反馈包含共振相关任务
  const resonanceFollowUps = followUps.filter((f) => f.objective.includes("RESONANCE") || f.objective.includes("resonance") || f.objective.includes("Monitor resonance"));
  console.log(`\n${resonanceFollowUps.length > 0 ? "✓" : "✗"} Resonance-related follow-ups: ${resonanceFollowUps.length}`);
}

// ============================================================
// 主函数
// ============================================================
function main(): void {
  console.log("╔" + "═".repeat(68) + "╗");
  console.log("║  Full Data Map Simulation - Phase E Full Implementation    ║");
  console.log("╚" + "═".repeat(68) + "╝");

  console.log(`\nApparel Pack Summary:`);
  console.log(`  Nodes: ${apparelPack.nodes.length} (${apparelPack.nodes.filter((n) => n.position > 0).length} chain + ${apparelPack.nodes.filter((n) => n.position === 0).length} signal/risk)`);
  console.log(`  knownRanges: ${Object.keys(apparelPack.knownRanges).length}`);
  console.log(`  transmissionPaths: ${apparelPack.transmissionPaths?.length ?? 0}`);
  console.log(`  crossDimensionRules: ${apparelPack.crossDimensionRules?.length ?? 0}`);
  console.log(`  supplyLanes: ${apparelPack.supplyLanes?.length ?? 0}`);
  console.log(`  capitalFlows: ${apparelPack.capitalFlows?.length ?? 0}`);
  console.log(`  workforceFlows: ${apparelPack.workforceFlows?.length ?? 0}`);
  console.log(`  businessDimensions: ${apparelPack.businessDimensions?.length ?? 0}`);
  console.log(`  informationFlows: ${apparelPack.informationFlows?.length ?? 0}`);

  scenario1();
  scenario2();
  scenario3();
  scenario4();
  scenario5();

  console.log("\n" + "=".repeat(70));
  console.log("All scenarios completed.");
  console.log("=".repeat(70));
}

main();
