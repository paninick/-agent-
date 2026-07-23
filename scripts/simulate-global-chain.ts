/**
 * scripts/simulate-global-chain.ts — 跨国产业链真实推演
 *
 * 真实数据基线（2026-07-08）：
 *
 * 【棉花】 ICE 80.94¢/lb, 年涨22%, 两年高点87.77¢(5月11日)
 *         印度干旱+厄尔尼诺+美国热浪 → 减产预期
 *         原油下跌 → 涤纶替代压力
 *
 * 【外汇】 TradingEconomics 实时：
 *         USD/CNY 6.8017 (CNY年涨5.28%)
 *         JPY/CNY 0.04189 (CNYJPY年涨17.34% — 日元大幅贬值)
 *         INR/CNY 0.0715 (INR年跌14.76% — 印度卢比贬值)
 *         BRL/CNY 1.3188 (BRL年涨0.87% — 巴西雷亚尔稳定)
 *         VND/CNY 0.000259 (VND年跌5.88% — 越南盾贬值)
 *         IDR/CNY 0.000378 (IDR年跌14.42% — 印尼盾贬值)
 *
 * 【贸易流】 WorldsTopExports 2024：
 *         出口：中国$10.8B(20.6%), 印度$6.5B(12.4%), 美国$6.2B(11.7%), 巴西$5.3B(+65%)
 *         进口：中国$9.3B(19.6%), 孟加拉$7.7B(16.2%), 越南$4.8B(10.2%)
 *         净逆差：孟加拉-$7.6B, 越南-$2.0B, 印尼-$1.1B
 *         净顺差：美国+$5.4B, 印度+$5.3B, 巴西+$5.1B
 *
 * 【Shopee/Sea】 Sea Limited FY2025 营收$22.9B(+36%), Q1 2026 $7.1B(+47%)
 *         Shopee+TikTok Shop 东南亚双寡头格局
 *
 * 推演场景：
 *   R1: 印度干旱+INR贬值 → 棉花出口国供应冲击 + 价格信号
 *   R2: 中国进口成本传导 → USD/CNY + 棉花进口 → 纱线成本
 *   R3: 东南亚制造端 → VND/IDR贬值 + 越南/印尼净逆差 → 面料成本
 *   R4: 日本消费端 → JPY暴跌17% → 零售价格 + 消费者购买力
 *   R5: 全链归因 — 从日本零售价追到印度干旱
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
// 真实数据
// ============================================================
const REAL = {
  cotton: { ice: 80.94, monthly: 7.49, yearly: 22.16, peak: 87.77, peakDate: "2026-05-11", pullback: -13 },
  fx: {
    usd_cny: { rate: 6.8017, cnyYearly: 5.28 },       // CNY年涨5.28%
    jpy_cny: { rate: 0.04189, jpyYearly: -17.34 },    // JPY年跌17.34%（暴跌）
    inr_cny: { rate: 0.0715, inrYearly: -14.76 },     // INR年跌14.76%（贬值）
    brl_cny: { rate: 1.3188, brlYearly: 0.87 },       // BRL稳定
    vnd_cny: { rate: 0.000259, vndYearly: -5.88 },    // VND年跌5.88%
    idr_cny: { rate: 0.000378, idrYearly: -14.42 },   // IDR年跌14.42%（贬值）
  },
  trade: {
    // 出口 (M USD)
    chinaExport: 10840, indiaExport: 6543, usExport: 6177, brazilExport: 5289,
    // 进口 (M USD)
    chinaImport: 9336, bdImport: 7738, vnImport: 4843, idImport: 1493,
    // 净贸易
    chinaNet: 1504, usNet: 5362, indiaNet: 5326, brazilNet: 5075,
    bdNet: -7577, vnNet: -1984, idNet: -1057,
  },
  sea: { fy2025: 22939, q1_2026: 7097, yoyGrowth: 46.61 },
};

// ============================================================
// 来源注册表 — 真实数据提供方
// ============================================================
const SOURCES: IntelligenceSource[] = [
  {
    id: "tradingeconomics",
    name: "TradingEconomics",
    tier: "S", sourceWeight: 0.95, trust_weight: 0.95, latency_score: 0.9, reliability_score: 0.95,
    coverage_domain: "commodity_forex", type: "official_api",
    coverage: ["cotton_price", "fx_rate_usd_cny", "fx_rate_jpy_cny", "fx_rate_inr_cny", "fx_rate_brl_cny", "fx_rate_vnd_cny", "fx_rate_idr_cny"],
    officialUrl: "https://tradingeconomics.com", requiresAuth: false, refreshCadence: "realtime",
    evidenceUse: ["financial_primary", "market_signal"], crossChecks: ["worldstopexports"], knownFailureModes: [],
  },
  {
    id: "worldstopexports",
    name: "WorldsTopExports",
    tier: "S", sourceWeight: 0.9, trust_weight: 0.9, latency_score: 0.3, reliability_score: 0.95,
    coverage_domain: "trade", type: "official_research_and_statistics",
    coverage: ["cotton_export_value", "cotton_import_value", "cotton_net_trade"],
    officialUrl: "https://www.worldstopexports.com", requiresAuth: false, refreshCadence: "annual",
    evidenceUse: ["trade_flow_primary"], crossChecks: ["tradingeconomics"], knownFailureModes: [],
  },
  {
    id: "shopee-sea",
    name: "Shopee / Sea Limited",
    tier: "A+", sourceWeight: 0.85, trust_weight: 0.85, latency_score: 0.6, reliability_score: 0.9,
    coverage_domain: "ecommerce", type: "authorized_platform_api",
    coverage: ["retail_price_garment", "sales_volume", "southeast_asia"],
    officialUrl: "https://seagroup.com", requiresAuth: true, refreshCadence: "quarterly",
    evidenceUse: ["platform_sales_primary"], crossChecks: [], knownFailureModes: ["js_rendered"],
  },
  {
    id: "ccfgroup",
    name: "CCFGroup China Cotton Textile",
    tier: "S", sourceWeight: 0.9, trust_weight: 0.9, latency_score: 0.7, reliability_score: 0.95,
    coverage_domain: "textile", type: "official_research_and_statistics",
    coverage: ["yarn_price", "fabric_price_per_m", "pta_price"],
    officialUrl: "https://www.ccfgroup.com", requiresAuth: true, refreshCadence: "daily",
    evidenceUse: ["market_signal"], crossChecks: ["tradingeconomics"], knownFailureModes: ["paywall"],
  },
];

const NOW = new Date("2026-07-08T08:00:00Z");

function mk(id: string, src: string, subject: string, claim: string, value: number, unit: string): RawRecord {
  return { id, sourceId: src, fetchedAt: NOW.toISOString(), contentType: "application/json",
    raw: { subject, claim, value, unit, period: "2026-07", geography: "global" } };
}

// ============================================================
// 5轮推演数据
// ============================================================
const ROUNDS = [
  {
    round: 1,
    title: "R1 印度棉花供应冲击 + INR贬值",
    narrative: "印度干旱+厄尔尼诺 → 棉花减产; INR年跌14.76% → 出口竞争力上升但国内采购成本上升",
    trigger: {
      id: "trig-g-1", ruleId: "rule-supply-shock", signalId: "sig-g-1", firedAt: NOW.toISOString(),
      objective: "India cotton supply shock: drought + El Niño + INR depreciation -14.76% YoY",
      pack: apparelPack,
    } as SwarmTrigger,
    records: [
      mk("g1-cotton", "tradingeconomics", "cotton_price",
        "ICE棉花80.94¢/lb年涨22%, 印度干旱+厄尔尼诺驱动减产; 国内现货18500超限",
        18500, "CNY/ton"),
      mk("g1-inr", "tradingeconomics", "fx_rate_inr_cny",
        "INR/CNY 0.0715, 印度卢比年跌14.76% — 印度棉花出口商以USD定价但成本以INR计, 汇率贬值提升出口竞争力",
        0.0715, "CNY/INR"),
      mk("g1-india-export", "worldstopexports", "cotton_export_value",
        "印度棉花出口$6.5B占全球12.4%, 干旱减产将压缩出口供给",
        6543, "M_USD"),
    ],
  },
  {
    round: 2,
    title: "R2 中国进口成本传导",
    narrative: "中国净进口$1.5B棉花; USD/CNY 6.80 CNY年涨5.28% → 进口成本上升 → 纱线跟涨",
    trigger: {
      id: "trig-g-2", ruleId: "loop-driver", signalId: "sig-g-2", firedAt: NOW.toISOString(),
      objective: "China import cost transmission: CNY appreciation + cotton import dependence → yarn cost",
      pack: apparelPack,
    } as SwarmTrigger,
    records: [
      mk("g2-usd", "tradingeconomics", "fx_rate_usd_cny",
        "USD/CNY 6.8017, CNY年涨5.28% — 中国棉花进口以USD定价, CNY升值理论上降低进口成本, 但全球棉价涨22%抵消汇率红利",
        6.8017, "CNY/USD"),
      mk("g2-china-import", "worldstopexports", "cotton_import_value",
        "中国棉花进口$9.3B占全球19.6%, 净进口$1.5B — 对国际棉价高度敏感",
        9336, "M_USD"),
      mk("g2-yarn", "ccfgroup", "yarn_price",
        "32s纯棉纱线31000 CNY/ton超限 — 棉花涨22%+传导率0.72→纱线应涨~16%, 叠加纺纱利润修复",
        31000, "CNY/ton"),
    ],
  },
  {
    round: 3,
    title: "R3 东南亚制造端 — VND/IDR贬值+净逆差",
    narrative: "越南净逆差$2.0B, 印尼净逆差$1.1B; VND年跌5.88%, IDR年跌14.42% → 进口棉花成本飙升",
    trigger: {
      id: "trig-g-3", ruleId: "loop-driver", signalId: "sig-g-3", firedAt: NOW.toISOString(),
      objective: "SEA manufacturing: Vietnam -$2.0B + Indonesia -$1.1B cotton deficit, VND -5.88% IDR -14.42% depreciation",
      pack: apparelPack,
    } as SwarmTrigger,
    records: [
      mk("g3-vnd", "tradingeconomics", "fx_rate_vnd_cny",
        "VND/CNY 0.000259, VND年跌5.88% — 越南纺织厂进口棉花用USD, VND贬值推高本币采购成本",
        0.000259, "CNY/VND"),
      mk("g3-idr", "tradingeconomics", "fx_rate_idr_cny",
        "IDR/CNY 0.000378, IDR年跌14.42% — 印尼盾暴跌, 印尼服装制造商进口棉花成本飙升",
        0.000378, "CNY/IDR"),
      mk("g3-vn-deficit", "worldstopexports", "cotton_net_trade",
        "越南棉花净逆差-$1984M, 印尼-$1057M — 东南亚制造国高度依赖进口原料",
        -1984, "M_USD"),
      mk("g3-fabric", "ccfgroup", "fabric_price_per_m",
        "纯棉面料52 CNY/m超限 — 东南亚纺纱厂原料成本传导, VND/IDR贬值放大涨幅",
        52, "CNY/m"),
    ],
  },
  {
    round: 4,
    title: "R4 日本消费端 — JPY暴跌17%",
    narrative: "JPY/CNY年跌17.34% → 日本进口服装成本飙升; Shopee SEA Q1营收$7.1B(+47%)",
    trigger: {
      id: "trig-g-4", ruleId: "loop-driver", signalId: "sig-g-4", firedAt: NOW.toISOString(),
      objective: "Japan consumer end: JPY -17.34% depreciation → apparel import cost surge + retail price spike",
      pack: apparelPack,
    } as SwarmTrigger,
    records: [
      mk("g4-jpy", "tradingeconomics", "fx_rate_jpy_cny",
        "JPY/CNY 0.04189, CNYJPY年涨17.34% — 日元暴跌, 日本从东南亚进口服装成本飙升17%+",
        0.04189, "CNY/JPY"),
      mk("g4-retail", "shopee-sea", "retail_price_garment",
        "Shopee东南亚服装零售价850 CNY/piece超限 — 全链传导+JPY贬值推高日本市场定价",
        850, "CNY/piece"),
    ],
  },
  {
    round: 5,
    title: "R5 巴西替代供给 + 全链归因",
    narrative: "巴西棉花出口+65% YoY ($5.3B), BRL稳定 → 替代供给源; 全链归因验证",
    trigger: {
      id: "trig-g-5", ruleId: "loop-driver", signalId: "sig-g-5", firedAt: NOW.toISOString(),
      objective: "Brazil alternative supply: +65% YoY export growth, BRL stable - can Brazil offset India shortfall?",
      pack: apparelPack,
    } as SwarmTrigger,
    records: [
      mk("g5-brazil", "worldstopexports", "cotton_export_value",
        "巴西棉花出口$5289M, 年增65% — 全球最快增长, 净顺差$5.1B, 可能部分抵消印度减产",
        5289, "M_USD"),
      mk("g5-brl", "tradingeconomics", "fx_rate_brl_cny",
        "BRL/CNY 1.3188, BRL年涨0.87% — 巴西雷亚尔稳定, 出口定价优势不受汇率侵蚀",
        1.3188, "CNY/BRL"),
      mk("g5-cotton-2", "tradingeconomics", "cotton_price",
        "棉花现货维持18500 CNY/ton超限 — 巴西增量尚未完全抵消印度干旱影响",
        18500, "CNY/ton"),
    ],
  },
];

// ============================================================
// MemoryBroker
// ============================================================
const ledger: EvidenceEntry[] = [];
const store = new MemoryStore();
const assocs = new Map<string, MemoryAssociation>();
const reflexes = new Map<string, ReflexPathway>();
const broker = new MemoryBroker(ledger, store, assocs, reflexes, NOW);

// 手动补充跨维度因果边 — 外汇→进口成本→原料价格→纱线→面料→零售
// （当前 transmissionPaths 只覆盖产业链节点, 不覆盖外汇和贸易流维度）
function buildCrossDimensionEdges(round: number): void {
  const edges: Array<[string, string]> = [
    // 外汇 → 进口成本
    ["fx_rate_inr_cny_below_range", "cotton_export_value_above_range", ], // INR贬值→印度出口竞争力↑
    ["fx_rate_usd_cny_below_range", "cotton_import_value_above_range", ], // CNY升值→进口量↑(但价格也↑)
    ["fx_rate_vnd_cny_below_range", "cotton_net_trade_below_range",     ], // VND贬值→逆差扩大
    ["fx_rate_idr_cny_below_range", "cotton_net_trade_below_range",     ], // IDR贬值→逆差扩大
    ["fx_rate_jpy_cny_below_range", "retail_price_garment_above_range", ], // JPY暴跌→零售价↑
    // 进出口 → 原料供给
    ["cotton_export_value_above_range", "cotton_price_above_range",     ], // 出口激增→价格↑
    ["cotton_net_trade_below_range",    "cotton_price_above_range",     ], // 逆差→国内供给紧→价格↑
    // 巴西替代
    ["cotton_export_value_above_range", "cotton_price_above_range",     ], // (强化)
  ];
  for (const [from, to] of edges) {
    broker.createOrReinforceAssociation(from, to, "causes");
  }
}

// ============================================================
// 推演主函数
// ============================================================
async function main() {
  console.log("╔══════════════════════════════════════════════════════════════════════╗");
  console.log("║  跨国产业链真实推演 — 外汇×进出口×原料×渠道 全维度                      ║");
  console.log("║  数据源: TradingEconomics + WorldsTopExports + Sea Limited            ║");
  console.log("╚══════════════════════════════════════════════════════════════════════╝");

  console.log("\n📊 真实数据基线 (2026-07-08):");
  console.log(`   棉花: ICE ${REAL.cotton.ice}¢/lb, 年涨${REAL.cotton.yearly}%, 峰值${REAL.cotton.peak}¢(${REAL.cotton.peakDate})`);
  console.log(`\n   外汇 (6国/地区):`);
  for (const [pair, data] of Object.entries(REAL.fx)) {
    const d = data as { rate: number; cnyYearly: number; jpyYearly: number; inrYearly: number; brlYearly: number; vndYearly: number; idrYearly: number };
    const trend = pair.includes("usd") ? `CNY年涨${d.cnyYearly}%` :
                  pair.includes("jpy") ? `JPY年跌${Math.abs(d.jpyYearly)}%` :
                  pair.includes("inr") ? `INR年跌${Math.abs(d.inrYearly)}%` :
                  pair.includes("brl") ? `BRL年涨${d.brlYearly}%` :
                  pair.includes("vnd") ? `VND年跌${Math.abs(d.vndYearly)}%` :
                  `IDR年跌${Math.abs(d.idrYearly)}%`;
    console.log(`     ${pair}: ${d.rate} (${trend})`);
  }
  console.log(`\n   贸易流 (2024, WorldsTopExports):`);
  console.log(`     出口TOP: 中国$${REAL.trade.chinaExport}M, 印度$${REAL.trade.indiaExport}M, 美国$${REAL.trade.usExport}M, 巴西$${REAL.trade.brazilExport}M(+65%)`);
  console.log(`     进口TOP: 中国$${REAL.trade.chinaImport}M, 孟加拉$${REAL.trade.bdImport}M, 越南$${REAL.trade.vnImport}M`);
  console.log(`     净逆差: 孟加拉-$${Math.abs(REAL.trade.bdNet)}M, 越南-$${Math.abs(REAL.trade.vnNet)}M, 印尼-$${Math.abs(REAL.trade.idNet)}M`);
  console.log(`\n   Shopee/Sea: FY2025 $${REAL.sea.fy2025}M(+36%), Q1'26 $${REAL.sea.q1_2026}M(+${REAL.sea.yoyGrowth}%)`);

  const snapshots: {
    round: number; title: string; narrative: string;
    signals: string[]; confidence: number;
    followUpCount: number;
    causesCount: number; L1: number; L3: number;
    attribution?: AttributionChain;
  }[] = [];

  for (const r of ROUNDS) {
    console.log(`\n${"═".repeat(80)}`);
    console.log(`  ${r.title}`);
    console.log(`  ${r.narrative}`);
    console.log(`${"═".repeat(80)}`);
    console.log(`  输入: ${r.records.map(rec => `${(rec.raw as any).subject}=${(rec.raw as any).value}`).join(", ")}`);

    const run = await orchestrateSwarm(r.trigger, {
      registrySources: SOURCES, rawRecords: r.records, ledger: [], memoryStore: store, broker, now: NOW,
    });

    // 跨维度因果边
    buildCrossDimensionEdges(r.round);

    for (const res of run.results) {
      let info = "";
      if (res.candidateSourceIds) info = `sources: ${res.candidateSourceIds.length}`;
      if (res.evidenceList) info = `${res.evidenceList.length} evidence: ${res.evidenceList.map(e => `${e.subject}=${e.value}`).join(", ")}`;
      else if (res.evidence) info = `evidence: ${res.evidence.subject}=${res.evidence.value}`;
      if (res.finding) info = `signals: [${res.finding.signals.join(", ")}] conf=${res.finding.confidence.toFixed(3)}`;
      if (res.synthesis) info = `conf=${res.synthesis.confidence.toFixed(3)}`;
      if (res.error) info = `ERROR: ${res.error}`;
      console.log(`  [${res.role.padEnd(12)}] ${res.status.padEnd(10)} ${info}`);
    }

    const finding = run.results.find(x => x.finding);
    const signals = finding?.finding?.signals ?? [];
    const conf = run.synthesis?.confidence ?? 0;
    const followUps = run.followUps ?? [];

    console.log(`\n  信号: [${signals.join(", ") || "无"}]`);
    console.log(`  置信度: ${(conf * 100).toFixed(1)}% | 后续任务: ${followUps.length}`);

    const allAssocs = broker.listAssociations();
    const causes = allAssocs.filter(a => a.relation === "causes");
    const allReflexes = broker.listReflexes();
    console.log(`  记忆: L1=${store.size} L2=${allAssocs.length}(causes=${causes.length}) L3=${allReflexes.length}`);

    // 归因 — 优先用 above_range 信号
    const aboveRange = signals.filter(s => s.includes("above_range"));
    const symptom = aboveRange[aboveRange.length - 1];
    let attribution: AttributionChain | undefined;
    if (symptom) {
      const traced = traceAttribution(symptom, allAssocs);
      if (traced) {
        attribution = traced;
        console.log(`\n  🎯 归因 (symptom="${symptom}"):`);
        console.log(`     ${formatAttribution(traced)}`);
        console.log(`     路径: ${traced.path.join(" → ")}`);
        console.log(`     根因: ${traced.rootCause}`);
        console.log(`     需补充: ${needsMoreEvidence(traced)}`);
      }
    } else {
      console.log(`\n  🎯 归因: 无 above_range 信号`);
    }

    snapshots.push({
      round: r.round, title: r.title, narrative: r.narrative,
      signals, confidence: conf, followUpCount: followUps.length,
      causesCount: causes.length, L1: store.size, L3: allReflexes.length,
      attribution,
    });
  }

  // ============================================================
  // 验证报告
  // ============================================================
  console.log("\n\n");
  console.log("╔══════════════════════════════════════════════════════════════════════╗");
  console.log("║  跨国产业链推演验证报告                                                ║");
  console.log("╚══════════════════════════════════════════════════════════════════════╝");

  console.log("\n┌─ 1. 信号检测 (多维度价格/汇率/贸易是否触发 above/below_range)");
  for (const s of snapshots) {
    console.log(`│  R${s.round}: ${s.signals.length > 0 ? "✅" : "❌"} [${s.signals.join(", ") || "无"}]`);
  }

  console.log("\n┌─ 2. 因果边积累 (产业链+外汇+贸易流多维度)");
  for (const s of snapshots) {
    console.log(`│  R${s.round}: ${s.causesCount} causes | L1=${s.L1} L3=${s.L3}`);
  }

  console.log("\n┌─ 3. 跨维度归因 (从终端价格追到供应端+外汇端)");
  for (const s of snapshots) {
    if (s.attribution) {
      console.log(`│  R${s.round}: ${s.attribution.hops} hops | conf=${(s.attribution.cumulativeWeight * 100).toFixed(1)}%`);
      console.log(`│    ${s.attribution.path.join(" → ")}`);
      console.log(`│    根因: ${s.attribution.rootCause}`);
    } else {
      console.log(`│  R${s.round}: (无归因)`);
    }
  }

  console.log("\n┌─ 4. 最终归因 — 零售价格飙升的第一性根因");
  const lastAttr = [...snapshots].reverse().find(s => s.attribution);
  if (lastAttr?.attribution) {
    const a = lastAttr.attribution;
    const isSupplyShock = a.rootCause.includes("cotton_price") || a.path.some(p => p.includes("cotton_price"));
    const isFX = a.rootCause.includes("fx_rate") || a.path.some(p => p.includes("fx_rate"));
    const isTrade = a.rootCause.includes("trade") || a.path.some(p => p.includes("trade"));
    console.log(`│  完整链: ${a.path.join(" → ")}`);
    console.log(`│  根因: ${a.rootCause}`);
    console.log(`│  跳数: ${a.hops} | 置信度: ${(a.cumulativeWeight * 100).toFixed(1)}%`);
    console.log(`│  维度: ${isSupplyShock ? "✅" : "❌"}棉花供应  ${isFX ? "✅" : "❌"}外汇  ${isTrade ? "✅" : "❌"}贸易流`);
  }

  console.log("\n┌─ 5. 跨层检索 (多维度关键词)");
  const qr = [
    broker.query({ text: "cotton", limit: 5 }),
    broker.query({ text: "fx_rate", limit: 5 }),
    broker.query({ text: "export", limit: 5 }),
    broker.query({ text: "india", limit: 5 }),
    broker.query({ text: "japan", limit: 5 }),
  ];
  const labels = ["cotton", "fx_rate", "export", "india", "japan"];
  for (let i = 0; i < qr.length; i++) {
    console.log(`│  query("${labels[i]}"): ${qr[i].length} hits — ${qr[i].map(r => `L${r.layer}(${r.score.toFixed(2)})`).join(", ")}`);
  }

  console.log("\n┌─ 6. 反射通路");
  const allR = broker.listReflexes();
  for (const r of allR) {
    const selfLoop = r.trigger.trim().toLowerCase() === r.action.trim().toLowerCase();
    console.log(`│  ${selfLoop ? "⚠️" : "✅"} "${r.trigger.slice(0, 55)}..." → "${r.action.slice(0, 55)}..." hits=${r.hitCount}`);
  }
  if (allR.length === 0) console.log(`│  (无反射)`);

  console.log("\n┌─ 7. 总判定");
  const checks = {
    "多维度信号检测": snapshots.filter(s => s.signals.length > 0).length >= 3,
    "因果边积累": snapshots[4].causesCount > snapshots[0].causesCount,
    "跨维度归因": lastAttr?.attribution !== undefined,
    "归因含供应端": lastAttr?.attribution?.path.some(p => p.includes("cotton")) ?? false,
    "归因含外汇端": lastAttr?.attribution?.path.some(p => p.includes("fx_rate")) ?? false,
    "记忆跨轮增长": snapshots[4].L1 > snapshots[0].L1,
    "跨层检索可用": qr.every(q => q.length > 0),
  };
  for (const [name, pass] of Object.entries(checks)) {
    console.log(`│  ${pass ? "✅" : "❌"} ${name}`);
  }
  const allPass = Object.values(checks).every(v => v);
  console.log(`│\n│  ${allPass ? "✅ 跨国产业链推演通过 — 外汇×贸易×原料×渠道全链推理成立" : "❌ 存在未通过项"}`);

  console.log("\n╚══════════════════════════════════════════════════════════════════════╝");
}

main().catch(err => { console.error("Failed:", err); process.exit(1); });
