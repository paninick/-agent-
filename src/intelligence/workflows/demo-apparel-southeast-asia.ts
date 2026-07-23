/**
 * workflows/demo-apparel-southeast-asia.ts — 端到端 Demo
 *
 * 场景：东南亚夏季女装机会监控
 *
 * 完整闭环（纯内存 fixture，不调外部 API — 遵守"不付费"约束）：
 *   1. 注册 probe：监控 Shopee 东南亚女装品类销量
 *   2. runProbe → ProbeSignal（payload 含销量数据）
 *   3. TriggerEngine.evaluate → SwarmTrigger（threshold 规则命中）
 *   4. SwarmOrchestrator → 6 角色 SwarmTask（scout→collector→verifier→analyst→synthesizer→memory）
 *   5. Scout → 候选源（shopee-open-platform / alibaba-open-platform / mckinsey-bof）
 *   6. Collector → RawRecord → ExtractedFact → EvidenceEntry
 *   7. Verifier → 调 6 门（用 apparelPack）→ AnnotatedEvidence
 *   8. Analyst → AnalysisFinding（夏季女装需求上升 + 棉纱成本传导）
 *   9. Synthesizer → SynthesisOutput 简报
 *  10. Memory → 写入 MemoryEntry
 *  11. Feedback → 生成 FollowUpTask（后续 probe 棉纱价格 / 验证供应链）
 *
 * 服装是验证自动化闭环的演示镜头，不是系统边界。
 * apparelPack 通过 trigger.pack 注入 — core engine 行业无关。
 */

import type { Probe, ProbeSignal, SwarmTrigger } from "../spine/types";
import type { IntelligenceSource } from "../types";
import type { RawRecord } from "../spine/types";
import { ProbeRegistry } from "../probes/registry";
import { runProbe, buildSignal } from "../probes/runner";
import { TriggerEngine, thresholdRule } from "../triggers";
import { orchestrateSwarm } from "../swarm/orchestrator";
import type { SwarmRunResult } from "../swarm/orchestrator";
import { MemoryStore } from "../memory/store";
import { apparelPack } from "../analysis/industryPacks/apparel";

/** Demo 完整运行结果快照 */
export interface DemoResult {
  probe: Probe;
  signal: ProbeSignal;
  trigger: SwarmTrigger;
  swarmRun: SwarmRunResult;
  memoryEntries: number;
  /** 是否闭环成功（synthesis + followUp 都存在） */
  loopClosed: boolean;
}

/**
 * 运行东南亚夏季女装机会监控 Demo。
 *
 * @param registrySources 来源注册表（调用方从 seed JSON 加载）
 * @param now 注入时间以保证测试可复现
 */
export async function runApparelSoutheastAsiaDemo(
  registrySources: IntelligenceSource[],
  now: Date = new Date()
): Promise<DemoResult> {
  // === 1. 注册 probe ===
  const registry = new ProbeRegistry();
  const probe: Probe = {
    id: "probe-shopee-sea-womenswear",
    name: "Shopee SEA Womenswear Sales Monitor",
    kind: "threshold",
    sourceId: "shopee-open-platform",
    params: {
      metric: "sales_volume",
      threshold: 10000,
      operator: "gt",
    },
    enabled: true,
  };
  registry.register(probe);

  // === 2. runProbe → ProbeSignal ===
  // 模拟 Shopee 返回的销量数据（超过阈值 10000）
  const run = await runProbe(probe, {
    payload: {
      sales_volume: 18500,
      category: "womenswear",
      region: "Southeast Asia",
      period: "2026-07",
    },
    now,
  });

  // 构造完整信号（runProbe 返回的 run 只含 signalId）
  const signal: ProbeSignal = buildSignal(
    probe,
    run,
    {
      sales_volume: 18500,
      category: "womenswear",
      region: "Southeast Asia",
      period: "2026-07",
    },
    now
  );

  // === 3. TriggerEngine.evaluate → SwarmTrigger ===
  const triggerEngine = new TriggerEngine({ pack: apparelPack, now });
  triggerEngine.addRule(
    thresholdRule("rule-sales-threshold", "Sales Volume Threshold", "sales_volume", 10000, "gt")
  );
  const trigger = triggerEngine.evaluate(
    signal,
    { ledger: [], now },
    "Monitor Southeast Asia summer womenswear opportunity: rising demand + cotton yarn cost transmission"
  );

  if (!trigger) {
    throw new Error("Demo failed: trigger engine did not fire");
  }

  // === 4. SwarmOrchestrator → 6 角色执行 ===
  // 构造 RawRecord fixture（模拟从 Shopee 采集的原始数据）
  // fetchedAt = now.toISOString() — freshness gate 接收注入的 now，ageDays=0 → 确定性通过
  const fetchedAt = now.toISOString();
  const rawRecords: RawRecord[] = [
    {
      id: "raw-shopee-womenswear-001",
      sourceId: "shopee-open-platform",
      fetchedAt,
      contentType: "application/json",
      raw: {
        subject: "cotton_price",
        claim: "Shopee SEA womenswear sales volume reached 18500 units in 2026-07, indicating summer demand surge",
        value: 18500,
        unit: "units",
        period: "2026-07",
        geography: "Southeast Asia",
      },
    },
  ];

  const memoryStore = new MemoryStore();
  const swarmRun = await orchestrateSwarm(trigger, {
    registrySources,
    rawRecords,
    ledger: [],
    memoryStore,
    now,
  });

  // === 结果快照 ===
  const loopClosed =
    swarmRun.synthesis !== undefined &&
    swarmRun.followUps !== undefined &&
    swarmRun.followUps.length > 0;

  return {
    probe,
    signal,
    trigger,
    swarmRun,
    memoryEntries: memoryStore.size,
    loopClosed,
  };
}
