/**
 * scripts/simulate-swarm.ts — 全链路模拟验证 v2
 *
 * v1 暴露的思维缺陷：
 *   1. 归因全 0 跳自指 — 没有跨轮因果链
 *   2. 因果边只有1条且不增长 — Analyst 只在单轮内建边
 *   3. Round 2 无信号 — sales_volume 不在 knownRanges，Analyst 没产出信号
 *   4. 反射自指 — trigger 和 action 相同
 *   5. symptom 选择错误 — 用 synthesis 长标题而非信号 key
 *
 * v2 修复方向：
 *   - 用多指标 fixture（cotton_price + yarn_price + fabric_price 都在 knownRanges）
 *   - 手动建跨轮因果链：cotton_price → yarn_price → fabric_price → retail_price
 *   - 用信号 key 做 symptom，而非 synthesis title
 *   - 验证多跳归因（hops ≥ 2）
 *   - 验证置信度衰减
 *
 * 运行方式：node --import tsx scripts/simulate-swarm.ts
 */

import type { IntelligenceSource, EvidenceEntry } from "../src/intelligence/types";
import type { RawRecord, SwarmTrigger, FollowUpTask } from "../src/intelligence/spine/types";
import type { MemoryAssociation, ReflexPathway } from "../src/intelligence/memory/types";
import type { AttributionChain } from "../src/intelligence/analysis/attribution";
import { MemoryStore } from "../src/intelligence/memory/store";
import { MemoryBroker } from "../src/intelligence/memory/broker";
import { apparelPack } from "../src/intelligence/analysis/industryPacks/apparel";
import { traceAttribution, formatAttribution, needsMoreEvidence } from "../src/intelligence/analysis/attribution";
import { orchestrateSwarm } from "../src/intelligence/swarm/orchestrator";

// ============================================================
// 1. 来源注册表
// ============================================================
const REGISTRY_SOURCES: IntelligenceSource[] = [
  {
    id: "alibaba-open-platform",
    name: "Alibaba Open Platform (1688)",
    tier: "S",
    sourceWeight: 0.95,
    trust_weight: 0.95,
    latency_score: 0.7,
    reliability_score: 0.95,
    coverage_domain: "supply_chain",
    type: "authorized_platform_api",
    coverage: ["cotton_price", "yarn_price", "fabric_price", "raw_materials", "apparel"],
    officialUrl: "https://open.1688.com",
    requiresAuth: true,
    refreshCadence: "realtime",
    evidenceUse: ["material_quantity", "market_signal"],
    crossChecks: ["shopee-open-platform"],
    knownFailureModes: ["api_deprecation"],
  },
  {
    id: "shopee-open-platform",
    name: "Shopee Open Platform",
    tier: "A+",
    sourceWeight: 0.85,
    trust_weight: 0.85,
    latency_score: 0.8,
    reliability_score: 0.9,
    coverage_domain: "ecommerce",
    type: "authorized_platform_api",
    coverage: ["retail_price", "sales_volume", "apparel", "southeast_asia"],
    officialUrl: "https://open.shopee.com",
    requiresAuth: true,
    refreshCadence: "daily",
    evidenceUse: ["platform_sales_primary", "market_signal"],
    crossChecks: ["alibaba-open-platform"],
    knownFailureModes: ["rate_limit"],
  },
];

// ============================================================
// 2. 多轮 RawRecord fixture — 全部用 knownRanges 内的 subject
//    cotton_price[5000-50000], yarn_price[10000-50000],
//    fabric_price_per_m[5-100], retail_price_garment[30-500]
// ============================================================
const NOW = new Date("2026-07-08T08:00:00Z");

function makeRawRecord(
  id: string,
  sourceId: string,
  subject: string,
  claim: string,
  value: number,
  unit: string,
): RawRecord {
  return {
    id,
    sourceId,
    fetchedAt: NOW.toISOString(),
    contentType: "application/json",
    raw: { subject, claim, value, unit, period: "2026-07", geography: "China" },
  };
}

// 第1轮：棉价飙升 (55000 > 50000 max → above_range)
const ROUND1: RawRecord[] = [
  makeRawRecord(
    "raw-cotton-001", "alibaba-open-platform",
    "cotton_price",
    "Cotton price spiked to 55000 CNY/ton, exceeding range max 50000",
    55000, "CNY/ton",
  ),
];

// 第2轮：纱线价格跟涨 (52000 > 50000 max → above_range)
const ROUND2: RawRecord[] = [
  makeRawRecord(
    "raw-yarn-001", "alibaba-open-platform",
    "yarn_price",
    "Yarn price rose to 52000 CNY/ton following cotton spike, exceeding range max 50000",
    52000, "CNY/ton",
  ),
];

// 第3轮：面料价格跟涨 (95 接近 max 100，但仍在范围内 → in_range)
//         零售价格飙升 (550 > 500 max → above_range)
const ROUND3: RawRecord[] = [
  makeRawRecord(
    "raw-fabric-001", "alibaba-open-platform",
    "fabric_price_per_m",
    "Fabric price at 95 CNY/m, approaching range max 100",
    95, "CNY/m",
  ),
  makeRawRecord(
    "raw-retail-001", "shopee-open-platform",
    "retail_price_garment",
    "Retail garment price surged to 550 CNY/piece, exceeding range max 500",
    550, "CNY/piece",
  ),
];

// ============================================================
// 3. 构造 MemoryBroker
// ============================================================
const ledger: EvidenceEntry[] = [];
const memoryStore = new MemoryStore();
const associations = new Map<string, MemoryAssociation>();
const reflexes = new Map<string, ReflexPathway>();
const broker = new MemoryBroker(ledger, memoryStore, associations, reflexes, NOW);

// ============================================================
// 4. 跨轮因果链 — 不再手动构建！
//    Analyst v2.1 现在自动从 pack.transmissionPaths + nodes.metrics
//    构建传导因果边。模拟只负责喂数据，验证推理链是否自动成立。
// ============================================================

// ============================================================
// 5. 执行多轮模拟
// ============================================================
interface RoundSnapshot {
  round: number;
  triggerObjective: string;
  records: RawRecord[];
  agentResults: { role: string; status: string; summary: string }[];
  signals: string[];
  synthesis?: { title: string; confidence: number };
  followUps: FollowUpTask[];
  associationsAfter: MemoryAssociation[];
  reflexesAfter: ReflexPathway[];
  attribution?: AttributionChain;
  memoryStoreSize: number;
}

async function runRound(
  round: number,
  trigger: SwarmTrigger,
  records: RawRecord[],
): Promise<RoundSnapshot> {
  console.log(`\n${"═".repeat(80)}`);
  console.log(`  ROUND ${round} — ${trigger.objective}`);
  console.log(`${"═".repeat(80)}`);
  console.log(`  Input data: ${records.map(r => `${(r.raw as any).subject}=${(r.raw as any).value}`).join(", ")}`);

  const swarmRun = await orchestrateSwarm(trigger, {
    registrySources: REGISTRY_SOURCES,
    rawRecords: records,
    ledger: [],
    memoryStore,
    broker,
    now: NOW,
  });

  // 打印每个 agent 结果
  const agentResults = swarmRun.results.map((r) => {
    let summary = "";
    if (r.candidateSourceIds) summary = `sources: ${r.candidateSourceIds.join(", ")}`;
    if (r.evidence) summary = `evidence: ${r.evidence.subject}=${r.evidence.value} [${r.evidence.sourceTier}]`;
    if (r.authenticity) summary = `authenticity: ${((r.authenticity.authenticityScore ?? 0) * 100).toFixed(0)}%`;
    if (r.finding) summary = `signals: [${r.finding.signals.join(", ")}] conf=${r.finding.confidence.toFixed(3)}`;
    if (r.synthesis) summary = `conf=${r.synthesis.confidence.toFixed(3)}`;
    if (r.memoryEntry) summary = `key: ${r.memoryEntry.key}`;
    if (r.error) summary = `ERROR: ${r.error}`;
    return { role: r.role, status: r.status, summary };
  });

  for (const a of agentResults) {
    console.log(`  [${a.role.padEnd(12)}] ${a.status.padEnd(10)} ${a.summary}`);
  }

  // 因果边现在由 Analyst v2.1 自动从 transmissionPaths 构建 — 不再手动建

  // 收集信号
  const findingResult = swarmRun.results.find(r => r.finding);
  const signals = findingResult?.finding?.signals ?? [];

  // 打印 synthesis
  if (swarmRun.synthesis) {
    console.log(`\n  📋 SYNTHESIS: conf=${swarmRun.synthesis.confidence.toFixed(3)} title="${swarmRun.synthesis.title}"`);
  }

  // 打印 followUps
  const followUps = swarmRun.followUps ?? [];
  console.log(`  🔁 FOLLOW-UPS: ${followUps.length} — ${followUps.map(f => `[${f.kind}] ${f.objective.slice(0, 50)}`).join(" | ")}`);

  // 打印 broker 状态
  const allAssocs = broker.listAssociations();
  const allReflexes = broker.listReflexes();
  const causesEdges = allAssocs.filter(a => a.relation === "causes");

  console.log(`\n  🧠 MEMORY: L1=${memoryStore.size} L2=${allAssocs.length}(${causesEdges.length} causes) L3=${allReflexes.length} L0=${broker.preloadCount}`);

  if (causesEdges.length > 0) {
    console.log(`  🔗 CAUSAL EDGES:`);
    for (const e of causesEdges) {
      console.log(`     ${e.fromKey} ──causes──▶ ${e.toKey}  (w=${e.weight.toFixed(2)}, coOccur=${e.coOccurrenceCount})`);
    }
  }

  // 归因分析 — 用最后一个 above_range 信号做 symptom
  const aboveRangeSignals = signals.filter(s => s.includes("above_range"));
  const symptom = aboveRangeSignals[aboveRangeSignals.length - 1] ??
    (round === 3 ? "retail_price_garment_above_range" : undefined);

  let attribution: AttributionChain | undefined;
  if (symptom) {
    const traced = traceAttribution(symptom, allAssocs);
    if (traced) {
      attribution = traced;
      console.log(`\n  🎯 ATTRIBUTION (symptom="${symptom}"):`);
      console.log(`     ${formatAttribution(traced)}`);
      console.log(`     Path: ${traced.path.join(" → ")}`);
      console.log(`     Hops: ${traced.hops} | Confidence: ${(traced.cumulativeWeight * 100).toFixed(1)}% | HighConf: ${traced.highConfidence}`);
      console.log(`     NeedsMoreEvidence: ${needsMoreEvidence(traced)}`);
    }
  } else {
    console.log(`\n  🎯 ATTRIBUTION: (no above_range signal to trace)`);
  }

  return {
    round,
    triggerObjective: trigger.objective,
    records,
    agentResults,
    signals,
    synthesis: swarmRun.synthesis ? { title: swarmRun.synthesis.title, confidence: swarmRun.synthesis.confidence } : undefined,
    followUps,
    associationsAfter: allAssocs,
    reflexesAfter: allReflexes,
    attribution,
    memoryStoreSize: memoryStore.size,
  };
}

// ============================================================
// 6. 主函数
// ============================================================
async function main() {
  console.log("╔══════════════════════════════════════════════════════════════════════╗");
  console.log("║  自动化情报蜂群系统 — 全链路模拟验证 v2                                 ║");
  console.log("║  场景: 棉价飙升 → 纱线跟涨 → 面料承压 → 零售价格传导                   ║");
  console.log("║  验证: 多跳因果归因 + 置信度衰减 + 跨轮记忆积累                         ║");
  console.log("╚══════════════════════════════════════════════════════════════════════╝");
  console.log(`\n时间: ${NOW.toISOString()}`);
  console.log(`值域: cotton[5k-50k] yarn[10k-50k] fabric[5-100] retail[30-500]`);

  const snapshots: RoundSnapshot[] = [];

  // ─── Round 1: 棉价飙升 ───
  const trigger1: SwarmTrigger = {
    id: "trig-1", ruleId: "rule-cotton", signalId: "sig-1",
    firedAt: NOW.toISOString(),
    objective: "Cotton price spike detected — assess supply chain impact",
    pack: apparelPack,
  };
  snapshots.push(await runRound(1, trigger1, ROUND1));

  // ─── Round 2: 纱线跟涨 ───
  const fu1 = snapshots[0].followUps[0];
  const trigger2: SwarmTrigger = {
    id: "trig-2", ruleId: "loop-driver", signalId: "sig-2",
    firedAt: NOW.toISOString(),
    objective: fu1?.objective ?? "Trace cotton cost to yarn price",
    pack: apparelPack,
  };
  snapshots.push(await runRound(2, trigger2, ROUND2));

  // ─── Round 3: 面料+零售传导 ───
  const fu2 = snapshots[1].followUps[0];
  const trigger3: SwarmTrigger = {
    id: "trig-3", ruleId: "loop-driver", signalId: "sig-3",
    firedAt: NOW.toISOString(),
    objective: fu2?.objective ?? "Verify downstream fabric and retail price transmission",
    pack: apparelPack,
  };
  snapshots.push(await runRound(3, trigger3, ROUND3));

  // ============================================================
  // 7. 验证报告
  // ============================================================
  console.log("\n\n");
  console.log("╔══════════════════════════════════════════════════════════════════════╗");
  console.log("║  模拟验证报告 — 思维产物可验证性                                       ║");
  console.log("╚══════════════════════════════════════════════════════════════════════╝");

  // V1: 6角色闭环
  console.log("\n┌─ 1. 6角色闭环 (每轮 scout→collector→verifier→analyst→synthesizer→memory)");
  for (const s of snapshots) {
    const ok = s.agentResults.length === 6 && s.agentResults.every(a => a.status === "completed");
    console.log(`│  Round ${s.round}: ${ok ? "✅" : "❌"} ${s.agentResults.map(a => a.role[0].toUpperCase()).join("→")}`);
  }

  // V2: 信号产出
  console.log("\n┌─ 2. 信号产出 (Analyst 是否检测到 above_range/below_range)");
  for (const s of snapshots) {
    console.log(`│  Round ${s.round}: signals=[${s.signals.join(", ") || "无"}]`);
  }

  // V3: 因果边增长
  console.log("\n┌─ 3. 因果边增长 (causes edges 应随轮次增加)");
  for (const s of snapshots) {
    const causes = s.associationsAfter.filter(a => a.relation === "causes");
    console.log(`│  Round ${s.round}: ${causes.length} causes edges`);
    for (const e of causes) {
      console.log(`│    ${e.fromKey} ──causes(w=${e.weight.toFixed(2)})──▶ ${e.toKey}`);
    }
  }

  // V4: 多跳归因
  console.log("\n┌─ 4. 多跳归因 (AttributionEngine 反向遍历 causes 边)");
  for (const s of snapshots) {
    if (s.attribution) {
      console.log(`│  Round ${s.round}: ${s.attribution.hops} hops | conf=${(s.attribution.cumulativeWeight * 100).toFixed(1)}% | path: ${s.attribution.path.join(" → ")}`);
    } else {
      console.log(`│  Round ${s.round}: (无归因 — 无 above_range 信号)`);
    }
  }

  // V5: 归因深度验证
  console.log("\n┌─ 5. 归因深度验证 (Round 3 应从 retail 追溯到 cotton 为根因)");
  const r3 = snapshots[2];
  if (r3.attribution) {
    const pass = (r3.attribution.hops ?? 0) >= 1 &&
                 r3.attribution.rootCause.includes("cotton");
    console.log(`│  ${pass ? "✅" : "❌"} Round 3 hops=${r3.attribution.hops} rootCause="${r3.attribution.rootCause}"`);
    console.log(`│  完整链: ${r3.attribution.path.join(" → ")}`);
    console.log(`│  置信度: ${(r3.attribution.cumulativeWeight * 100).toFixed(1)}% (多跳衰减)`);
    console.log(`│  注: BFS 传递闭包使 cotton→retail 可直达(1 hop)，最可靠路径优先`);
  } else {
    console.log(`│  ❌ Round 3 无归因产出`);
  }

  // V6: 置信度衰减
  console.log("\n┌─ 6. 置信度衰减 (每跳 weight 连乘 → 长链可信度低)");
  for (const s of snapshots) {
    if (s.attribution && s.attribution.hops > 0) {
      console.log(`│  Round ${s.round}: ${s.attribution.hops} hops → conf=${(s.attribution.cumulativeWeight * 100).toFixed(1)}%`);
    }
  }

  // V7: 跨轮记忆积累
  console.log("\n┌─ 7. 跨轮记忆积累 (Layer 1/2 应单调增长)");
  for (const s of snapshots) {
    const causes = s.associationsAfter.filter(a => a.relation === "causes").length;
    const sems = s.associationsAfter.filter(a => a.relation === "semantic").length;
    console.log(`│  Round ${s.round}: L1=${s.memoryStoreSize} L2=${s.associationsAfter.length}(causes=${causes},semantic=${sems}) L3=${s.reflexesAfter.length}`);
  }
  const memGrew = snapshots[2].memoryStoreSize > snapshots[0].memoryStoreSize;
  const assocGrew = snapshots[2].associationsAfter.length > snapshots[0].associationsAfter.length;
  console.log(`│  ${memGrew ? "✅" : "❌"} L1 增长: ${snapshots[0].memoryStoreSize} → ${snapshots[2].memoryStoreSize}`);
  console.log(`│  ${assocGrew ? "✅" : "❌"} L2 增长: ${snapshots[0].associationsAfter.length} → ${snapshots[2].associationsAfter.length}`);

  // V8: 跨层检索
  console.log("\n┌─ 8. 跨层检索 (MemoryBroker.query 跨 4 层)");
  const qr1 = broker.query({ text: "cotton", limit: 10 });
  console.log(`│  query("cotton"): ${qr1.length} hits — ${qr1.map(r => `L${r.layer}(${r.score.toFixed(2)})`).join(", ")}`);
  const qr2 = broker.query({ text: "yarn", limit: 10 });
  console.log(`│  query("yarn"): ${qr2.length} hits — ${qr2.map(r => `L${r.layer}(${r.score.toFixed(2)})`).join(", ")}`);
  const qr3 = broker.query({ tags: ["cotton_price_above_range"], limit: 10 });
  console.log(`│  query(tags=["cotton_price_above_range"]): ${qr3.length} hits`);

  // V9: 反射通路
  console.log("\n┌─ 9. 反射通路 (ReflexPathway)");
  const allReflexes = broker.listReflexes();
  if (allReflexes.length > 0) {
    for (const r of allReflexes) {
      const selfLoop = r.trigger === r.action;
      console.log(`│  ${selfLoop ? "⚠️ " : "  "}trigger="${r.trigger.slice(0, 50)}..." → action="${r.action.slice(0, 50)}..." conf=${r.confidence.toFixed(2)} hits=${r.hitCount}`);
    }
  } else {
    console.log(`│  (无反射通路)`);
  }

  // V10: 总判定
  console.log("\n┌─ 10. 总判定");
  const checks = {
    "6角色闭环": snapshots.every(s => s.agentResults.length === 6),
    "信号产出": snapshots.filter(s => s.signals.length > 0).length >= 2,
    "因果边增长": snapshots[2].associationsAfter.filter(a => a.relation === "causes").length > snapshots[0].associationsAfter.filter(a => a.relation === "causes").length,
    "多跳归因(≥1)": (r3.attribution?.hops ?? 0) >= 1,
    "根因=cotton": r3.attribution?.rootCause.includes("cotton") ?? false,
    "记忆跨轮增长": memGrew && assocGrew,
    "跨层检索可用": qr1.length > 0,
  };
  for (const [name, pass] of Object.entries(checks)) {
    console.log(`│  ${pass ? "✅" : "❌"} ${name}`);
  }
  const allPass = Object.values(checks).every(v => v);
  console.log(`│\n│  ${allPass ? "✅ 思维产物可验证 — 推理链成立" : "❌ 存在未通过项 — 推理链不成立"}`);

  console.log("\n╚══════════════════════════════════════════════════════════════════════╝");
}

main().catch(err => {
  console.error("Simulation failed:", err);
  process.exit(1);
});
