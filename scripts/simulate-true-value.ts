/**
 * scripts/simulate-true-value.ts - 供应链真实值推算验证
 *
 * 验证场景：
 *   场景1：单点观测推算全链
 *     - 只观测到 cotton_price=18500（超基线 14000）
 *     - 系统应推算出 yarn/fabric/retail 的应有值
 *     - 与实际观测比较，找出偏差
 *
 *   场景2：瓶颈节点检测
 *     - 棉花涨22%但纱线只涨3%（利润挤压）
 *     - 系统应检测到 yarn 节点有大偏差
 *
 *   场景3：整体健康度 + 反应
 *     - 多节点偏差汇聚成 healthScore
 *     - Feedback 根据 pressureLevel 生成不同后续任务
 */

import type { IntelligenceSource, EvidenceEntry } from "../src/intelligence/types";
import type { RawRecord, SwarmTrigger } from "../src/intelligence/spine/types";
import type { ReflexPathway } from "../src/intelligence/memory/types";
import { MemoryStore } from "../src/intelligence/memory/store";
import { MemoryBroker } from "../src/intelligence/memory/broker";
import { apparelPack } from "../src/intelligence/analysis/industryPacks/apparel";
import { estimateNodeValues, findConsensusValue } from "../src/intelligence/analysis/chain-estimator";
import { propagateChain, formatPropagation, formatReversePropagation } from "../src/intelligence/analysis/chain-propagator";
import { computeChainHealth, formatChainHealth } from "../src/intelligence/analysis/chain-health";
import { synthesizeBrief } from "../src/intelligence/synthesis/brief";
import { generateFollowUp } from "../src/intelligence/workflows/feedback";
import { orchestrateSwarm } from "../src/intelligence/swarm/orchestrator";

// ============================================================
// 来源注册表
// ============================================================
const SOURCES: IntelligenceSource[] = [
  {
    id: "tradingeconomics", name: "TradingEconomics",
    tier: "S", sourceWeight: 0.95, trust_weight: 0.95, latency_score: 0.9, reliability_score: 0.95,
    coverage_domain: "commodity", type: "official_api",
    coverage: ["cotton_price", "yarn_price", "fabric_price_per_m", "fob_price_garment", "retail_price_garment"],
    officialUrl: "https://tradingeconomics.com", requiresAuth: false, refreshCadence: "realtime",
    evidenceUse: ["financial_primary", "market_signal"], crossChecks: [], knownFailureModes: [],
  },
  {
    id: "ccfgroup", name: "CCFGroup",
    tier: "S", sourceWeight: 0.9, trust_weight: 0.9, latency_score: 0.7, reliability_score: 0.95,
    coverage_domain: "textile", type: "official_research_and_statistics",
    coverage: ["yarn_price", "fabric_price_per_m", "pta_price"],
    officialUrl: "https://www.ccfgroup.com", requiresAuth: true, refreshCadence: "daily",
    evidenceUse: ["market_signal"], crossChecks: ["tradingeconomics"], knownFailureModes: ["paywall"],
  },
  {
    id: "sea-retail", name: "Sea/Shopee Retail",
    tier: "A+", sourceWeight: 0.85, trust_weight: 0.85, latency_score: 0.6, reliability_score: 0.9,
    coverage_domain: "ecommerce", type: "authorized_platform_api",
    coverage: ["retail_price_garment", "fob_price_garment"],
    officialUrl: "https://seagroup.com", requiresAuth: true, refreshCadence: "quarterly",
    evidenceUse: ["platform_sales_primary"], crossChecks: [], knownFailureModes: [],
  },
];

const NOW = new Date("2026-07-08T08:00:00Z");

function mk(id: string, src: string, subject: string, claim: string, value: number, unit: string): RawRecord {
  return {
    id, sourceId: src, fetchedAt: NOW.toISOString(), contentType: "application/json",
    raw: { subject, claim, value, unit, period: "2026-07", geography: "global" },
  };
}

// ============================================================
// 场景1: 单点观测推算全链
// 只观测到棉花价格，推算下游应有值
// ============================================================
function scenario1(): void {
  console.log("\n" + "=".repeat(70));
  console.log("Scenario 1: Single-point observation -> full chain estimation");
  console.log("=".repeat(70));

  // 基线值（knownRanges 中点）：
  // cotton_price: (10000+18000)/2 = 14000
  // yarn_price: (15000+30000)/2 = 22500
  // fabric_price_per_m: (5+50)/2 = 27.5
  // fob_price_garment: (5+120)/2 = 62.5
  // retail_price_garment: (30+800)/2 = 415

  // 只观测到棉花价格 18500（超基线 14000，涨了 32%）
  const evidence: EvidenceEntry[] = [
    {
      id: "ev-tv-cotton", sourceId: "tradingeconomics", sourceTier: "S", sourceWeight: 0.95,
      kind: "financial_primary", subject: "cotton_price",
      claim: "Cotton CC Index 18500 CNY/ton, up 32% from baseline",
      observedAt: NOW.toISOString(), value: 18500, unit: "CNY/ton",
      method: "api", conversions: [], crossChecks: [], contradictions: [], notes: [],
      authenticity: { authenticityScore: 0.95, gateResults: [] },
    } as EvidenceEntry & { authenticity: { authenticityScore: number; gateResults: unknown[] } },
  ];

  const estimates = estimateNodeValues(evidence, apparelPack);
  console.log("\nNode Estimates:");
  for (const est of estimates) {
    for (const s of est.subjects) {
      console.log(`  ${est.nodeId}.${s.subject}: consensus=${s.consensusValue} (sources=${s.sourceCount}, disagreement=${(s.disagreement * 100).toFixed(1)}%, conf=${(s.confidence * 100).toFixed(0)}%)`);
    }
  }

  const propagation = propagateChain(estimates, apparelPack);
  console.log("\n" + formatPropagation(propagation));

  const health = computeChainHealth(estimates, propagation);
  console.log("\n" + formatChainHealth(health));

  // 验证
  console.log("\n--- Verification ---");
  const cottonBaseline = (10000 + 18000) / 2; // 14000
  const yarnBaseline = (15000 + 30000) / 2;   // 22500
  const cottonObserved = 18500;
  const cottonDeltaPct = (cottonObserved - cottonBaseline) / cottonBaseline; // ~0.321
  const yarnExpected = yarnBaseline * (1 + cottonDeltaPct * 0.72); // 22500 * (1 + 0.321 * 0.72)
  console.log(`Cotton baseline: ${cottonBaseline}, observed: ${cottonObserved}, delta: ${(cottonDeltaPct * 100).toFixed(1)}%`);
  console.log(`Yarn baseline: ${yarnBaseline}, expected (coeff=0.72): ${yarnExpected.toFixed(1)}`);

  const yarnProp = propagation.nodeResults.find((n) => n.nodeId === "yarn");
  if (yarnProp && yarnProp.expected !== null) {
    const match = Math.abs(yarnProp.expected - yarnExpected) < 1;
    console.log(`Propagator computed yarn expected: ${yarnProp.expected.toFixed(1)} (match: ${match})`);
  }

  console.log(`\nHealth Score: ${health.healthScore} [${health.pressureLevel.toUpperCase()}]`);
  console.log(`Coverage: ${(health.coverage * 100).toFixed(0)}% (only 1 of 9 nodes observed)`);
}

// ============================================================
// 场景2: 瓶颈节点检测
// 棉花涨22%但纱线只涨3% -> 利润挤压
// ============================================================
function scenario2(): void {
  console.log("\n" + "=".repeat(70));
  console.log("Scenario 2: Bottleneck detection (profit squeeze at yarn)");
  console.log("=".repeat(70));

  // 棉花 18500（涨32%），但纱线只 23000（基线22500，只涨2.2%）
  // 传导系数0.72 -> 纱线应涨 32%×0.72 = 23% -> 应有 22500×1.23 = 27675
  // 实际只有 23000 -> 偏差 = 23000 - 27675 = -4675 -> 偏差率 16.9%
  const evidence: EvidenceEntry[] = [
    {
      id: "ev-tv2-cotton", sourceId: "tradingeconomics", sourceTier: "S", sourceWeight: 0.95,
      kind: "financial_primary", subject: "cotton_price",
      claim: "Cotton 18500 CNY/ton, +32% from baseline",
      observedAt: NOW.toISOString(), value: 18500, unit: "CNY/ton",
      method: "api", conversions: [], crossChecks: [], contradictions: [], notes: [],
      authenticity: { authenticityScore: 0.95, gateResults: [] },
    } as EvidenceEntry & { authenticity: { authenticityScore: number; gateResults: unknown[] } },
    {
      id: "ev-tv2-yarn", sourceId: "ccfgroup", sourceTier: "S", sourceWeight: 0.9,
      kind: "market_signal", subject: "yarn_price",
      claim: "Yarn 23000 CNY/ton, only +2.2% - mills absorbing cost, profit squeeze",
      observedAt: NOW.toISOString(), value: 23000, unit: "CNY/ton",
      method: "api", conversions: [], crossChecks: [], contradictions: [], notes: [],
      authenticity: { authenticityScore: 0.9, gateResults: [] },
    } as EvidenceEntry & { authenticity: { authenticityScore: number; gateResults: unknown[] } },
  ];

  const estimates = estimateNodeValues(evidence, apparelPack);
  const propagation = propagateChain(estimates, apparelPack);
  const health = computeChainHealth(estimates, propagation);

  console.log("\n" + formatPropagation(propagation));
  console.log("\n" + formatChainHealth(health));

  // 验证瓶颈节点
  console.log("\n--- Verification ---");
  const yarnProp = propagation.nodeResults.find((n) => n.nodeId === "yarn");
  if (yarnProp) {
    console.log(`Yarn: observed=${yarnProp.observed}, expected=${yarnProp.expected?.toFixed(1)}, deviation=${yarnProp.deviation?.toFixed(1)}, rate=${yarnProp.deviationRate !== null ? (yarnProp.deviationRate * 100).toFixed(1) + "%" : "?"}, severity=${yarnProp.severity}`);
  }
  console.log(`Bottleneck node: ${health.bottleneckNode}`);
  console.log(`Health Score: ${health.healthScore} [${health.pressureLevel.toUpperCase()}]`);

  // 验证纱线是瓶颈
  if (health.bottleneckNode === "yarn") {
    console.log("PASS: yarn correctly identified as bottleneck (profit squeeze detected)");
  } else {
    console.log(`FAIL: expected bottleneck=yarn, got ${health.bottleneckNode}`);
  }
}

// ============================================================
// 场景3: 整体健康度 + 反应
// 多节点偏差 -> Feedback 生成不同后续任务
// ============================================================
async function scenario3(): Promise<void> {
  console.log("\n" + "=".repeat(70));
  console.log("Scenario 3: Full pipeline -> chainEstimate -> feedback reaction");
  console.log("=".repeat(70));

  const ledger: EvidenceEntry[] = [];
  const store = new MemoryStore();
  const assocs = new Map<string, import("../src/intelligence/memory/types").MemoryAssociation>();
  const reflexes = new Map<string, ReflexPathway>();
  const broker = new MemoryBroker(ledger, store, assocs, reflexes, NOW);

  // 棉花暴涨 + 纱线跟涨不足 + 零售价滞后
  const records: RawRecord[] = [
    mk("tv3-cotton", "tradingeconomics", "cotton_price",
      "Cotton 18500 CNY/ton, +32% from baseline, India drought driven",
      18500, "CNY/ton"),
    mk("tv3-yarn", "ccfgroup", "yarn_price",
      "Yarn 23000 CNY/ton, only +2.2% - mills absorbing cost",
      23000, "CNY/ton"),
    mk("tv3-retail", "sea-retail", "retail_price_garment",
      "Retail 420 CNY/piece, +1.2% from baseline - price lag",
      420, "CNY/piece"),
  ];

  const trigger: SwarmTrigger = {
    id: "trig-tv3", ruleId: "loop-driver", signalId: "sig-tv3", firedAt: NOW.toISOString(),
    objective: "True value estimation: cotton spike with yarn profit squeeze and retail lag",
    pack: apparelPack,
  };

  const run = await orchestrateSwarm(trigger, {
    registrySources: SOURCES, rawRecords: records, ledger: [], memoryStore: store, broker, now: NOW,
  });

  console.log("\nAgent Results:");
  for (const res of run.results) {
    let info = "";
    if (res.evidence) info = `${res.evidence.subject}=${res.evidence.value}`;
    if (res.finding) info = `signals: [${res.finding.signals.join(", ")}]`;
    if (res.synthesis) info = `conf=${res.synthesis.confidence.toFixed(3)}`;
    if (res.error) info = `ERROR: ${res.error}`;
    console.log(`  [${res.role.padEnd(12)}] ${res.status.padEnd(10)} ${info}`);
  }

  // 检查 chainEstimate 是否生成
  const synthesis = run.synthesis;
  if (synthesis?.chainEstimate) {
    console.log("\n" + formatChainHealth(synthesis.chainEstimate));
    console.log("\nChain Estimate generated successfully!");
    console.log(`Health Score: ${synthesis.chainEstimate.healthScore}`);
    console.log(`Pressure Level: ${synthesis.chainEstimate.pressureLevel}`);
    console.log(`Bottleneck: ${synthesis.chainEstimate.bottleneckNode}`);
    console.log(`Risk Signals: ${synthesis.chainEstimate.riskSignals.join(", ")}`);
  } else {
    console.log("\nFAIL: No chainEstimate in synthesis output");
  }

  // 检查 follow-ups 是否基于 chainEstimate 生成
  console.log(`\nFollow-ups (${run.followUps?.length ?? 0}):`);
  for (const fu of run.followUps ?? []) {
    console.log(`  [${fu.kind}] ${fu.objective}`);
    console.log(`    rationale: ${fu.rationale}`);
  }

  // 验证
  console.log("\n--- Verification ---");
  const hasChainEstimate = synthesis?.chainEstimate !== undefined;
  console.log(`chainEstimate present: ${hasChainEstimate}`);

  if (hasChainEstimate && synthesis) {
    const chainFu = (run.followUps ?? []).filter(
      (fu) => fu.rationale.includes("deviation") || fu.rationale.includes("chain") || fu.rationale.includes("health") || fu.rationale.includes("bottleneck") || fu.rationale.includes("disagreement"),
    );
    console.log(`chainEstimate-driven follow-ups: ${chainFu.length}`);
  }
}

// ============================================================
// 场景4: 品牌反馈逆推全链 - 从单一零售价推算上游应有值
// 品牌方说"零售价850" -> 逆推棉花/纱线/面料/FOB 应有值
// ============================================================
function scenario4(): void {
  console.log("\n" + "=".repeat(70));
  console.log("Scenario 4: Brand feedback -> reverse propagate full chain");
  console.log("=".repeat(70));

  // 品牌方只反馈了一个零售价 850 CNY/piece
  // 基线 retail = 415, 所以 retail 涨了 (850-415)/415 = 104.8%
  // 逆推：brand <- manufacturing(coeff=0.286), manufacturing <- design(coeff=0.90), design <- fabric(0.60), fabric <- yarn(0.85), yarn <- cotton(0.72)
  // retail_delta / brand_coeff = 104.8% / 0.75 = 139.8% -> brand implied delta
  // brand_delta / manufacturing_coeff = 139.8% / 0.286 = 489% -> manufacturing implied delta
  // ...逐级逆推到棉花

  const evidence: EvidenceEntry[] = [
    {
      id: "ev-tv4-retail", sourceId: "sea-retail", sourceTier: "A+", sourceWeight: 0.85,
      kind: "platform_sales_primary", subject: "retail_price_garment",
      claim: "Brand feedback: retail price 850 CNY/piece, up 105% from baseline 415",
      observedAt: NOW.toISOString(), value: 850, unit: "CNY/piece",
      method: "authorized_platform", conversions: [], crossChecks: [], contradictions: [], notes: [],
      authenticity: { authenticityScore: 0.85, gateResults: [] },
    } as EvidenceEntry & { authenticity: { authenticityScore: number; gateResults: unknown[] } },
  ];

  const estimates = estimateNodeValues(evidence, apparelPack);
  const propagation = propagateChain(estimates, apparelPack);

  console.log("\nForward propagation (from retail, no upstream observed):");
  console.log(formatPropagation(propagation));

  if (propagation.reversePropagation) {
    console.log("\n" + formatReversePropagation(propagation.reversePropagation));

    const rp = propagation.reversePropagation;
    console.log("\n--- Reverse Propagation Verification ---");
    console.log(`Anchor: ${rp.anchorNodeId}.${rp.anchorSubject} = ${rp.anchorValue}`);

    // 手动验证逆推
    const retailBaseline = 415;
    const retailDelta = (850 - retailBaseline) / retailBaseline; // 1.048

    // brand: delta = retailDelta / 0.75
    const brandImpliedDelta = retailDelta / 0.75;
    const brandBaseline = (5 + 120) / 2; // fob_price_garment baseline = 62.5 (using manufacturing's metric)
    // Actually brand node's metric is brand_health, gross_margin - no price metric
    // The channel -> brand uses coefficient 0.75, but brand's primary subject is brand_health
    // This means the reverse propagation uses whatever subject the node has

    console.log(`\nManual check: retail delta = ${(retailDelta * 100).toFixed(1)}%`);
    console.log(`  -> brand implied delta = ${(brandImpliedDelta * 100).toFixed(1)}% (÷0.75)`);

    // 找到 cotton 的逆推值
    const cottonReverse = rp.nodeResults.find((n) => n.nodeId === "raw_material");
    if (cottonReverse?.impliedValue) {
      const cottonBaseline = 14000;
      console.log(`\n  -> cotton implied = ${cottonReverse.impliedValue.toFixed(1)} (baseline=${cottonBaseline})`);
      console.log(`     cotton implied delta = ${((cottonReverse.impliedDeltaPct ?? 0) * 100).toFixed(1)}%`);
      console.log(`     If retail went up 105%, cotton should have gone up ${((cottonReverse.impliedDeltaPct ?? 0) * 100).toFixed(1)}% to justify it`);
    }

    console.log(`\nReverse consistency: ${(rp.consistency * 100).toFixed(0)}%`);
    console.log(`  (low consistency = brand price not fully explained by upstream cost structure)`);
  }

  // 带上更多观测值，看逆推一致性变化
  console.log("\n--- With multiple observations (retail + cotton) ---");
  const evidence2: EvidenceEntry[] = [
    ...evidence,
    {
      id: "ev-tv4-cotton", sourceId: "tradingeconomics", sourceTier: "S", sourceWeight: 0.95,
      kind: "financial_primary", subject: "cotton_price",
      claim: "Cotton 18500 CNY/ton, up 32% from baseline",
      observedAt: NOW.toISOString(), value: 18500, unit: "CNY/ton",
      method: "api", conversions: [], crossChecks: [], contradictions: [], notes: [],
      authenticity: { authenticityScore: 0.95, gateResults: [] },
    } as EvidenceEntry & { authenticity: { authenticityScore: number; gateResults: unknown[] } },
  ];

  const estimates2 = estimateNodeValues(evidence2, apparelPack);
  const propagation2 = propagateChain(estimates2, apparelPack);

  if (propagation2.reversePropagation) {
    const rp2 = propagation2.reversePropagation;
    console.log(`\nAnchor: ${rp2.anchorNodeId} = ${rp2.anchorValue}`);
    console.log(`Consistency with 2 observations: ${(rp2.consistency * 100).toFixed(0)}%`);

    // 比较：只有零售价 vs 有零售价+棉花价
    for (const nr of rp2.nodeResults) {
      const obsStr = nr.observed !== null ? nr.observed.toFixed(1) : "-";
      const implStr = nr.impliedValue !== null ? nr.impliedValue.toFixed(1) : "-";
      const devStr = nr.deviationRate !== null ? `${(nr.deviationRate * 100).toFixed(1)}%` : "-";
      console.log(`  ${nr.nodeId.padEnd(16)} observed=${obsStr.padStart(10)}  implied=${implStr.padStart(10)}  devRate=${devStr.padStart(6)}`);
    }

    // 关键洞察：零售价涨105%，但棉花只涨32% -> 中间环节吃掉了差价
    console.log("\n  Key insight: retail +105% but cotton only +32%");
    console.log("  -> The gap implies massive margin expansion somewhere in the chain");
    console.log("  -> Or the retail price increase is not cost-driven (brand premium / demand surge)");
  }
}

// ============================================================
// 主函数
// ============================================================
async function main(): Promise<void> {
  console.log("Supply Chain True Value Estimation Engine - Simulation");
  console.log("Date: 2026-07-08");
  console.log("Baseline: cotton=14000, yarn=22500, fabric=27.5, fob=62.5, retail=415");

  scenario1();
  scenario2();
  await scenario3();
  scenario4();

  console.log("\n" + "=".repeat(70));
  console.log("All scenarios completed.");
  console.log("=".repeat(70));
}

main().catch((err) => {
  console.error("Simulation failed:", err);
  process.exit(1);
});
