/**
 * scripts/simulate-full-chain.ts - v3 完整自动化跨国供应链推演
 *
 * 7轮推演覆盖完整供应链：
 *   R1: 印度干旱 -> 棉花减产 -> 出口减少
 *   R2: INR贬值 -> 出口竞争力变化
 *   R3: India->Bangladesh 供应通道断裂 -> 孟加拉纱线成本
 *   R4: Brazil替代供给 -> 部分抵消
 *   R5: China->Vietnam 纱线传导 + VND贬值
 *   R6: Vietnam->Japan 服装 + JPY暴涨 -> 零售价
 *   R7: 全链归因 - 日本零售价 -> 印度干旱
 *
 * 验证维度：
 *   1. 多跳归因（≥1 hops）
 *   2. 跨维度因果（供应+外汇+物流+关税）
 *   3. 加权置信度（用真实传导系数）
 *   4. 国家间供应图（SupplyLane）
 *   5. 风险传导（干旱->减产->价格）
 *   6. 替代效应（PTA->棉花替代）
 *   7. 5个自动建边函数全部生效
 */

import type { IntelligenceSource, EvidenceEntry } from "../src/intelligence/types";
import type { RawRecord, SwarmTrigger } from "../src/intelligence/spine/types";
import type { MemoryAssociation, ReflexPathway } from "../src/intelligence/memory/types";
import type { AttributionChain } from "../src/intelligence/analysis/attribution";
import { MemoryStore } from "../src/intelligence/memory/store";
import { MemoryBroker } from "../src/intelligence/memory/broker";
import { apparelPack } from "../src/intelligence/analysis/industryPacks/apparel";
import { traceAttribution, formatAttribution, needsMoreEvidence } from "../src/intelligence/analysis/attribution";
import { orchestrateSwarm } from "../src/intelligence/swarm/orchestrator";

// ============================================================
// 真实数据基线（2026-07-08）
// ============================================================
const REAL = {
  cotton: {
    ice_cents: 80.94,         // ICE 期货价格
    yearly_pct: 22.16,        // 年涨幅
    cn_spot: 18500,           // 中国国内现货（超上限18000）
  },
  fx: {
    usd_cny: 6.8017,          // CNY年涨5.28%
    jpy_cny: 0.04189,         // CNY/JPY年涨17.34% (JPY暴跌)
    inr_cny: 0.0715,          // INR年跌14.76% (印度贬值)
    brl_cny: 1.3188,          // BRL年涨0.87% (巴西稳定)
    vnd_cny: 0.000259,        // VND年跌5.88% (越南贬值)
  },
  trade: {
    indiaExport: 6543,        // 印度棉花出口 $M
    brazilExport: 5289,       // 巴西棉花出口 $M (+65%)
    bdImport: 7738,           // 孟加拉棉花进口 $M
    vnImport: 4843,           // 越南棉花进口 $M
    bdNet: -7577,             // 孟加拉净逆差
    vnNet: -1984,             // 越南净逆差
  },
  drought: {
    india_pdsi: -4.2,         // 印度干旱指数 PDSI < -3 为严重干旱
    el_nino_sst: 0.8,         // 厄尔尼诺 SST > 0.5°C
  },
  logistics: {
    fbx_index: 3800,          // Freightos 海运指数 > 3500 为高
  },
};

// ============================================================
// 来源注册表
// ============================================================
const SOURCES: IntelligenceSource[] = [
  {
    id: "tradingeconomics", name: "TradingEconomics",
    tier: "S", sourceWeight: 0.95, trust_weight: 0.95, latency_score: 0.9, reliability_score: 0.95,
    coverage_domain: "commodity_forex", type: "official_api",
    coverage: ["cotton_price", "fx_rate_usd_cny", "fx_rate_jpy_cny", "fx_rate_inr_cny", "fx_rate_brl_cny", "fx_rate_vnd_cny"],
    officialUrl: "https://tradingeconomics.com", requiresAuth: false, refreshCadence: "realtime",
    evidenceUse: ["financial_primary", "market_signal"], crossChecks: ["worldstopexports"], knownFailureModes: [],
  },
  {
    id: "worldstopexports", name: "WorldsTopExports",
    tier: "S", sourceWeight: 0.9, trust_weight: 0.9, latency_score: 0.3, reliability_score: 0.95,
    coverage_domain: "trade", type: "official_research_and_statistics",
    coverage: ["cotton_export_value", "cotton_import_value", "cotton_net_trade"],
    officialUrl: "https://www.worldstopexports.com", requiresAuth: false, refreshCadence: "annual",
    evidenceUse: ["trade_flow_primary"], crossChecks: ["tradingeconomics"], knownFailureModes: [],
  },
  {
    id: "ccfgroup", name: "CCFGroup China Cotton Textile",
    tier: "S", sourceWeight: 0.9, trust_weight: 0.9, latency_score: 0.7, reliability_score: 0.95,
    coverage_domain: "textile", type: "official_research_and_statistics",
    coverage: ["yarn_price", "fabric_price_per_m", "pta_price"],
    officialUrl: "https://www.ccfgroup.com", requiresAuth: true, refreshCadence: "daily",
    evidenceUse: ["market_signal"], crossChecks: ["tradingeconomics"], knownFailureModes: ["paywall"],
  },
  {
    id: "noaa", name: "NOAA Climate Data",
    tier: "S", sourceWeight: 0.92, trust_weight: 0.92, latency_score: 0.8, reliability_score: 0.98,
    coverage_domain: "climate", type: "official_api",
    coverage: ["drought_index", "el_nino_sst", "heatwave_days"],
    officialUrl: "https://www.noaa.gov", requiresAuth: false, refreshCadence: "monthly",
    evidenceUse: ["risk_signal"], crossChecks: [], knownFailureModes: [],
  },
  {
    id: "freightos", name: "Freightos Baltic Index",
    tier: "A+", sourceWeight: 0.85, trust_weight: 0.85, latency_score: 0.9, reliability_score: 0.9,
    coverage_domain: "logistics", type: "official_api",
    coverage: ["freight_index_fbx", "freight_jp"],
    officialUrl: "https://fbx.freightos.com", requiresAuth: false, refreshCadence: "daily",
    evidenceUse: ["logistics_primary"], crossChecks: [], knownFailureModes: [],
  },
  {
    id: "sea-retail", name: "Sea/Shopee Retail Analytics",
    tier: "A+", sourceWeight: 0.85, trust_weight: 0.85, latency_score: 0.6, reliability_score: 0.9,
    coverage_domain: "ecommerce", type: "authorized_platform_api",
    coverage: ["retail_price_garment", "fob_price_garment", "sell_through_rate"],
    officialUrl: "https://seagroup.com", requiresAuth: true, refreshCadence: "quarterly",
    evidenceUse: ["platform_sales_primary"], crossChecks: [], knownFailureModes: ["js_rendered"],
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
// 7轮推演数据
// ============================================================
interface RoundData {
  round: number;
  title: string;
  narrative: string;
  trigger: SwarmTrigger;
  records: RawRecord[];
}

const ROUNDS: RoundData[] = [
  // R1: 印度干旱 -> 棉花减产 -> 价格超限
  {
    round: 1,
    title: "R1 印度干旱 -> 棉花减产 -> 价格超限",
    narrative: "印度PDSI -4.2(严重干旱) + 厄尔尼诺SST +0.8°C -> 棉花减产 -> 国内现货18500超上限18000",
    trigger: {
      id: "trig-fc-1", ruleId: "rule-weather-risk", signalId: "sig-fc-1", firedAt: NOW.toISOString(),
      objective: "India drought -> cotton supply shock",
      pack: apparelPack,
    },
    records: [
      mk("fc1-drought", "noaa", "drought_index",
        "印度棉花主产区PDSI -4.2, 严重干旱(阈值-3), 预计减产15-30%",
        -4.2, "PDSI"),
      mk("fc1-cotton", "tradingeconomics", "cotton_price",
        "中国CC Index 3128B现货18500 CNY/ton超上限18000, 印度干旱驱动",
        18500, "CNY/ton"),
      mk("fc1-pta", "ccfgroup", "pta_price",
        "PTA价格9000 CNY/ton超上限8000 - 原油反弹+聚酯需求旺盛, PTA涨价推升棉花替代需求",
        9000, "CNY/ton"),
      mk("fc1-elnino", "noaa", "el_nino_sst",
        "Niño 3.4区SST +0.8°C, 厄尔尼诺确认(阈值+0.5), 印度季风减弱",
        0.8, "°C"),
    ],
  },
  // R2: INR贬值 + 出口减少
  {
    round: 2,
    title: "R2 INR贬值 + 印度棉花出口减少",
    narrative: "INR/CNY 0.0715年跌14.76% -> 印度出口商USD收入换更多INR; 但干旱减产压缩出口供给 -> 出口减少",
    trigger: {
      id: "trig-fc-2", ruleId: "loop-driver", signalId: "sig-fc-2", firedAt: NOW.toISOString(),
      objective: "INR depreciation + India export decline",
      pack: apparelPack,
    },
    records: [
      mk("fc2-inr", "tradingeconomics", "fx_rate_inr_cny",
        "INR/CNY 0.0715, INR年跌14.76% - 印度棉花出口以USD定价, 贬值提升出口竞争力但全球供给紧张",
        0.0715, "CNY/INR"),
      mk("fc2-india-export", "worldstopexports", "cotton_export_value",
        "印度棉花出口$6.5B, 干旱减产预计压缩至$4B -> 全球供给收紧",
        4000, "M_USD"),
      mk("fc2-cotton-up", "tradingeconomics", "cotton_price",
        "棉花价格持续攀升至19000 CNY/ton, 印度减产+全球抢购",
        19000, "CNY/ton"),
    ],
  },
  // R3: India->Bangladesh 供应通道断裂
  {
    round: 3,
    title: "R3 India->Bangladesh 供应通道断裂 -> 孟加拉纱线成本",
    narrative: "印度减产 -> 对孟加拉棉花出口减少 -> 孟加拉纱线成本上升 (lane-cotton-india-bangladesh 受冲击)",
    trigger: {
      id: "trig-fc-3", ruleId: "loop-driver", signalId: "sig-fc-3", firedAt: NOW.toISOString(),
      objective: "India->Bangladesh supply lane disruption -> yarn cost",
      pack: apparelPack,
    },
    records: [
      mk("fc3-bd-import", "worldstopexports", "cotton_import_value",
        "孟加拉棉花进口$7.7B, 印度是最大来源(~$3B), 减产将迫使孟加拉转向巴西/美国",
        7738, "M_USD"),
      mk("fc3-yarn-up", "ccfgroup", "yarn_price",
        "32s纯棉纱线31000 CNY/ton超上限30000 - 棉花传导率0.72, 减产+运输成本推高",
        31000, "CNY/ton"),
      mk("fc3-freight", "freightos", "freight_index_fbx",
        "Freightos FBX 3800 USD/FEU超阈值3500 - 印度到孟加拉运费上涨",
        3800, "USD/FEU"),
    ],
  },
  // R4: Brazil替代供给
  {
    round: 4,
    title: "R4 Brazil替代供给 -> 部分抵消",
    narrative: "巴西棉花出口$5.3B(+65% YoY) -> 替代印度供给 -> 但BRL稳定, 无汇率折扣; 全球棉价仍高",
    trigger: {
      id: "trig-fc-4", ruleId: "loop-driver", signalId: "sig-fc-4", firedAt: NOW.toISOString(),
      objective: "Brazil substitution supply -> partial offset",
      pack: apparelPack,
    },
    records: [
      mk("fc4-brazil-export", "worldstopexports", "cotton_export_value",
        "巴西棉花出口$5.3B(+65% YoY) -> 替代印度供给, 但无法完全填补缺口",
        5289, "M_USD"),
      mk("fc4-brl", "tradingeconomics", "fx_rate_brl_cny",
        "BRL/CNY 1.3188, BRL年涨0.87% - 巴西棉花以USD定价, 汇率稳定无折扣",
        1.3188, "CNY/BRL"),
      mk("fc4-cotton-high", "tradingeconomics", "cotton_price",
        "棉花价格维持18500 CNY/ton - 巴西供给部分抵消, 但全球供需仍紧",
        18500, "CNY/ton"),
    ],
  },
  // R5: China->Vietnam 纱线传导 + VND贬值
  {
    round: 5,
    title: "R5 China->Vietnam 纱线传导 + VND贬值",
    narrative: "中国纱线31000超限 -> 传导到越南(lane-yarn-china-vietnam); VND年跌5.88% -> 越南进口成本上升",
    trigger: {
      id: "trig-fc-5", ruleId: "loop-driver", signalId: "sig-fc-5", firedAt: NOW.toISOString(),
      objective: "China->Vietnam yarn transmission + VND depreciation",
      pack: apparelPack,
    },
    records: [
      mk("fc5-vnd", "tradingeconomics", "fx_rate_vnd_cny",
        "VND/CNY 0.000259, VND年跌5.88% - 越南纺纱厂进口中国纱线用USD/CNY, VND贬值推高成本",
        0.000259, "CNY/VND"),
      mk("fc5-fob-down", "sea-retail", "fob_price_garment",
        "越南FOB成衣价3 CNY/piece低于下限5 - VND贬值使以CNY计的FOB下降, 但纱线成本上升部分抵消",
        3, "CNY/piece"),
      mk("fc5-yarn-cn", "ccfgroup", "yarn_price",
        "中国纱线31000 CNY/ton超上限 -> 传导到越南纺纱成本",
        31000, "CNY/ton"),
    ],
  },
  // R6: Vietnam->Japan 服装 + JPY暴涨 -> 零售价
  {
    round: 6,
    title: "R6 Vietnam->Japan 服装 + JPY暴涨 -> 零售价",
    narrative: "JPY/CNY 0.04189年涨17.34%(JPY暴跌) -> 日本进口成衣以CNY计更贵; 运费上涨 -> 零售价超限",
    trigger: {
      id: "trig-fc-6", ruleId: "loop-driver", signalId: "sig-fc-6", firedAt: NOW.toISOString(),
      objective: "Vietnam->Japan garment + JPY surge -> retail price",
      pack: apparelPack,
    },
    records: [
      mk("fc6-jpy", "tradingeconomics", "fx_rate_jpy_cny",
        "CNY/JPY 0.04189, JPY年跌17.34% - 日本进口成衣以CNY定价, JPY贬值意味着日本消费者需付更多JPY",
        0.04189, "CNY/JPY"),
      mk("fc6-freight-jp", "freightos", "freight_jp",
        "中国->日本海运费1300 USD/FEU超上限1200 - 近海运费上涨",
        1300, "USD/FEU"),
      mk("fc6-retail", "sea-retail", "retail_price_garment",
        "日本零售成衣价850 CNY/piece超上限800 - JPY贬值+运费+棉花传导三重推高",
        850, "CNY/piece"),
    ],
  },
  // R7: 全链归因 - 日本零售价 -> 印度干旱
  {
    round: 7,
    title: "R7 全链归因 - 日本零售价 -> 印度干旱",
    narrative: "从 retail_price_garment_above_range 反向追因 -> 棉花传导链 -> 干旱风险 -> 第一性根因",
    trigger: {
      id: "trig-fc-7", ruleId: "loop-driver", signalId: "sig-fc-7", firedAt: NOW.toISOString(),
      objective: "Full chain attribution: JP retail -> India drought",
      pack: apparelPack,
    },
    records: [
      mk("fc7-retail", "sea-retail", "retail_price_garment",
        "日本零售成衣价850 CNY/piece - 全链归因起点",
        850, "CNY/piece"),
      mk("fc7-cotton", "tradingeconomics", "cotton_price",
        "棉花18500 CNY/ton - 链中继",
        18500, "CNY/ton"),
      mk("fc7-drought", "noaa", "drought_index",
        "印度PDSI -4.2 - 预期第一性根因",
        -4.2, "PDSI"),
    ],
  },
];

// ============================================================
// 执行 7 轮推演
// ============================================================
async function runSimulation(): Promise<void> {
  const ledger: EvidenceEntry[] = [];
  const store = new MemoryStore();
  const assocs = new Map<string, MemoryAssociation>();
  const reflexes = new Map<string, ReflexPathway>();
  const broker = new MemoryBroker(ledger, store, assocs, reflexes, NOW);

  const results: Array<{
    round: number;
    title: string;
    status: string;
    signals: string[];
    findingSummary: string;
    confidence: number;
  }> = [];

  for (const round of ROUNDS) {
    console.log(`\n${"=".repeat(70)}`);
    console.log(`${round.title}`);
    console.log(`${"=".repeat(70)}`);
    console.log(`Narrative: ${round.narrative}`);
    console.log(`Input: ${round.records.map((r) => `${(r.raw as Record<string, unknown>).subject}=${(r.raw as Record<string, unknown>).value}`).join(", ")}`);

    const run = await orchestrateSwarm(round.trigger, {
      registrySources: SOURCES,
      rawRecords: round.records,
      ledger: [],
      memoryStore: store,
      broker,
      now: NOW,
    });

    // 打印每个 agent 的结果
    for (const res of run.results) {
      let info = "";
      if (res.evidenceList) info = `${res.evidenceList.length} evidence: ${res.evidenceList.map((e) => `${e.subject}=${e.value}`).join(", ")}`;
      else if (res.evidence) info = `evidence: ${res.evidence.subject}=${res.evidence.value}`;
      if (res.finding) info = `signals: [${res.finding.signals.join(", ")}] conf=${res.finding.confidence.toFixed(3)}`;
      if (res.synthesis) info = `conf=${res.synthesis.confidence.toFixed(3)}`;
      if (res.error) info = `ERROR: ${res.error}`;
      console.log(`  [${res.role.padEnd(12)}] ${res.status.padEnd(10)} ${info}`);
    }

    // 提取 finding
    const finding = run.results.find((x) => x.finding)?.finding;
    const signals = finding?.signals ?? [];
    const conf = run.synthesis?.confidence ?? finding?.confidence ?? 0;

    console.log(`\n  Signals: [${signals.join(", ") || "none"}]`);
    console.log(`  Confidence: ${(conf * 100).toFixed(1)}% | Follow-ups: ${run.followUps?.length ?? 0}`);

    // 记忆层状态
    const allAssocs = broker.listAssociations();
    const causes = allAssocs.filter((a) => a.relation === "causes");
    const allReflexes = broker.listReflexes();
    console.log(`  Memory: L1=${store.size} L2=${allAssocs.length}(causes=${causes.length}) L3=${allReflexes.length}`);

    if (finding) {
      results.push({
        round: round.round,
        title: round.title,
        status: "completed",
        signals: finding.signals,
        findingSummary: finding.summary,
        confidence: finding.confidence,
      });
    }
  }

  // ============================================================
  // 全链归因
  // ============================================================
  console.log(`\n${"=".repeat(70)}`);
  console.log("Full Chain Attribution Analysis");
  console.log(`${"=".repeat(70)}`);

  const allAssociations = broker.listAssociations();
  const causesEdges = allAssociations.filter((a) => a.relation === "causes");

  console.log(`\nTotal associations: ${allAssociations.length}`);
  console.log(`causes edges: ${causesEdges.length}`);

  // 按 source 分类统计
  const sourceCount = new Map<string, number>();
  for (const edge of causesEdges) {
    const src = (edge.metadata?.source as string) ?? "heuristic";
    sourceCount.set(src, (sourceCount.get(src) ?? 0) + 1);
  }
  console.log("\nEdge source breakdown:");
  for (const [src, count] of sourceCount.entries()) {
    console.log(`  ${src}: ${count} edges`);
  }

  // 多症状归因扫描
  const symptoms = [
    "retail_price_garment_above_range",
    "yarn_price_above_range",
    "cotton_price_above_range",
    "fob_price_garment_below_range",
  ];

  console.log(`\nMulti-symptom attribution scan:`);
  const attributions = new Map<string, AttributionChain>();
  for (const sym of symptoms) {
    const chain = traceAttribution(sym, allAssociations);
    if (chain) {
      console.log(`  ${sym}: root=${chain.rootCause}, hops=${chain.hops}, conf=${(chain.cumulativeWeight * 100).toFixed(1)}%`);
      attributions.set(sym, chain);
    } else {
      console.log(`  ${sym}: no attribution chain`);
    }
  }

  // 详细归因 - retail_price_garment_above_range
  const symptom = "retail_price_garment_above_range";
  const chain = attributions.get(symptom);
  console.log(`\nDetailed attribution from ${symptom}:`);
  if (chain) {
    console.log(`  Chain: ${formatAttribution(chain)}`);
    console.log(`  Root cause: ${chain.rootCause}`);
    console.log(`  Hops: ${chain.hops}`);
    console.log(`  Cumulative confidence: ${(chain.cumulativeWeight * 100).toFixed(1)}%`);
    console.log(`  High confidence: ${chain.highConfidence}`);
    if (chain.hopWeights) {
      console.log(`  Hop weights: [${chain.hopWeights.map((w) => w.toFixed(3)).join(", ")}]`);
    }
    console.log(`  Needs more evidence: ${needsMoreEvidence(chain)}`);
  } else {
    console.log("  No attribution chain found (insufficient causes edges)");
  }

  // ============================================================
  // 验证检查
  // ============================================================
  console.log(`\n${"=".repeat(70)}`);
  console.log("Verification Checks");
  console.log(`${"=".repeat(70)}`);

  let checksPassed = 0;
  let checksTotal = 0;

  function check(name: string, condition: boolean, detail?: string): void {
    checksTotal++;
    const status = condition ? "PASS" : "FAIL";
    console.log(`  [${status}] ${name}${detail ? " - " + detail : ""}`);
    if (condition) checksPassed++;
  }

  // 1. 所有7轮推演成功
  check("7 rounds completed", results.length === 7, `${results.length}/7 rounds`);

  // 2. 信号检测正常
  const allRSignals = results.flatMap((r) => r.signals);
  check("above_range signals detected", allRSignals.some((s) => s.includes("above_range")), `${allRSignals.filter((s) => s.includes("above_range")).length} above_range signals`);
  check("below_range signals detected", allRSignals.some((s) => s.includes("below_range")), `${allRSignals.filter((s) => s.includes("below_range")).length} below_range signals`);

  // 3. 5个自动建边函数生效
  const transmissionCount = (sourceCount.get("transmission") ?? 0) + (sourceCount.get("transmission_bfs") ?? 0);
  check("transmission edges built", transmissionCount > 0, `${transmissionCount} edges`);

  // cross_dimension edges may be reinforced by risk edges (metadata.source gets overwritten),
  // so also check if any edge has cross_dimension rule metadata
  const hasCrossDimEdge = causesEdges.some((e) =>
    e.metadata?.source === "cross_dimension" || e.metadata?.rule !== undefined
  );
  check("cross_dimension edges built", (sourceCount.get("cross_dimension") ?? 0) > 0 || hasCrossDimEdge,
    `${sourceCount.get("cross_dimension") ?? 0} direct + ${hasCrossDimEdge ? "some" : "0"} with rule metadata`);

  check("supply_lane edges built", (sourceCount.get("supply_lane") ?? 0) > 0, `${sourceCount.get("supply_lane") ?? 0} edges`);
  check("substitution edges built", (sourceCount.get("substitution") ?? 0) > 0, `${sourceCount.get("substitution") ?? 0} edges`);
  check("risk edges built", (sourceCount.get("risk") ?? 0) > 0, `${sourceCount.get("risk") ?? 0} edges`);

  // 4. 归因链可追溯
  check("attribution chain exists", chain !== undefined && chain !== null);
  if (chain) {
    check("attribution hops >= 1", chain.hops >= 1, `${chain.hops} hops`);
    check("attribution confidence > 0", chain.cumulativeWeight > 0, `${(chain.cumulativeWeight * 100).toFixed(1)}%`);
    check("hopWeights recorded", chain.hopWeights !== undefined && chain.hopWeights.length > 0, `${chain.hopWeights?.length ?? 0} weights`);
  }

  // 5. 跨维度因果（至少有2种不同 source 的边）
  check("multiple edge sources", sourceCount.size >= 3, `${sourceCount.size} sources: ${[...sourceCount.keys()].join(", ")}`);

  // 6. 风险信号链入因果图
  const hasRiskEdge = causesEdges.some((e) => e.metadata?.source === "risk");
  check("risk signal in causal graph", hasRiskEdge, hasRiskEdge ? "drought/el_nino -> cotton_price" : "no risk edges");

  // 7. 传导系数写入权重
  const hasWeightedEdges = causesEdges.some((e) => e.weight !== 0.3 && e.metadata?.coefficient !== undefined);
  check("transmission coefficient as edge weight", hasWeightedEdges, hasWeightedEdges ? "edges use coefficient as weight" : "all edges default 0.3");

  console.log(`\n${"=".repeat(70)}`);
  console.log(`Result: ${checksPassed}/${checksTotal} checks passed`);
  console.log(`${"=".repeat(70)}`);

  if (checksPassed < checksTotal) {
    process.exit(1);
  }
}

runSimulation().catch((err) => {
  console.error("Simulation failed:", err);
  process.exit(1);
});
