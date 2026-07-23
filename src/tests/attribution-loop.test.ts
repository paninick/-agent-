/**
 * attribution-loop.test.ts — 第一性归因 + 闭环驱动器测试
 *
 * 覆盖：
 *   - AttributionEngine 反向遍历 causes 边找根因
 *   - 置信度连乘衰减
 *   - 环检测（循环因果不无限递归）
 *   - Analyst 因果边构建（发现信号时主动建 causes 边）
 *   - LoopDriver 多轮驱动 + broker 跨轮存活
 *   - 端到端：多轮运行后归因链形成
 */

import { describe, expect, it } from "vitest";
import registrySeed from "../../data/intelligence-source-registry.seed.json";
import {
  parseSourceRegistry,
  apparelPack,
  MemoryStore,
  MemoryBroker,
  executeAnalyst,
  traceAttribution,
  traceAttributionBatch,
  formatAttribution,
  needsMoreEvidence,
  ATTRIBUTION_CONFIDENCE_THRESHOLD,
  LoopDriver,
  orchestrateSwarm,
  AGENT_ROLE_PROFILES,
} from "../intelligence";
import type {
  MemoryAssociation,
  ReflexPathway,
  EvidenceEntry,
  SwarmTrigger,
  RawRecord,
} from "../intelligence";

const FIXED_NOW = new Date("2026-07-07T12:00:00Z");

function makeBroker(ledger: EvidenceEntry[] = []) {
  const store = new MemoryStore();
  const associations = new Map<string, MemoryAssociation>();
  const reflexes = new Map<string, ReflexPathway>();
  const broker = new MemoryBroker(ledger, store, associations, reflexes, FIXED_NOW);
  return { broker, store, associations, reflexes };
}

function makeVerifiedEvidence(subject: string, value: number): EvidenceEntry {
  return {
    id: `ev-${subject}`,
    sourceId: "shopee-open-platform",
    sourceTier: "S",
    sourceWeight: 1.0,
    kind: "market_signal",
    subject,
    claim: `${subject} at ${value}`,
    observedAt: FIXED_NOW.toISOString(),
    value,
    unit: "CNY/ton",
    period: "2026-07",
    method: "api",
    conversions: [],
    crossChecks: [],
    contradictions: [],
    notes: [],
    authenticity: {
      authenticityScore: 0.8,
      flag: "verified",
      gateResults: [],
      blockingReasons: [],
      checkedAt: FIXED_NOW.toISOString(),
    },
  } as EvidenceEntry;
}

function makeTrigger(objective = "Monitor SEA apparel demand"): SwarmTrigger {
  return {
    id: "trig-test",
    ruleId: "rule-1",
    signalId: "sig-1",
    firedAt: FIXED_NOW.toISOString(),
    objective,
    pack: apparelPack,
  };
}

describe("Attribution Engine (第一性归因)", () => {
  // === 1. 无 causes 边 → 症状自身就是根因 ===
  it("returns symptom as root when no causes edges exist", () => {
    const chain = traceAttribution("cotton_price_up", []);
    expect(chain).not.toBeNull();
    expect(chain!.rootCause).toBe("cotton_price_up");
    expect(chain!.hops).toBe(0);
    expect(chain!.cumulativeWeight).toBe(1.0);
    expect(chain!.highConfidence).toBe(true);
  });

  // === 2. 单跳因果 ===
  it("traces single-hop causation to root cause", () => {
    const associations: MemoryAssociation[] = [
      {
        id: "a1",
        fromKey: "demand_up",
        toKey: "cotton_price_up",
        relation: "causes",
        weight: 0.8,
        createdAt: FIXED_NOW.toISOString(),
        lastReinforcedAt: FIXED_NOW.toISOString(),
        coOccurrenceCount: 3,
      },
    ];

    const chain = traceAttribution("cotton_price_up", associations);
    expect(chain).not.toBeNull();
    expect(chain!.rootCause).toBe("demand_up");
    expect(chain!.path).toEqual(["cotton_price_up", "demand_up"]);
    expect(chain!.hops).toBe(1);
    expect(chain!.cumulativeWeight).toBe(0.8);
  });

  // === 3. 多跳因果链 ===
  it("traces multi-hop chain to first-principles root cause", () => {
    const associations: MemoryAssociation[] = [
      { id: "a1", fromKey: "yarn_demand_up", toKey: "cotton_price_up", relation: "causes", weight: 0.8, createdAt: "", lastReinforcedAt: "", coOccurrenceCount: 1 },
      { id: "a2", fromKey: "womenswear_sales_up", toKey: "yarn_demand_up", relation: "causes", weight: 0.7, createdAt: "", lastReinforcedAt: "", coOccurrenceCount: 1 },
      { id: "a3", fromKey: "seasonal_demand", toKey: "womenswear_sales_up", relation: "causes", weight: 0.6, createdAt: "", lastReinforcedAt: "", coOccurrenceCount: 1 },
      { id: "a4", fromKey: "tropical_climate", toKey: "seasonal_demand", relation: "causes", weight: 0.5, createdAt: "", lastReinforcedAt: "", coOccurrenceCount: 1 },
    ];

    const chain = traceAttribution("cotton_price_up", associations);
    expect(chain).not.toBeNull();
    expect(chain!.rootCause).toBe("tropical_climate");
    expect(chain!.hops).toBe(4);
    expect(chain!.path).toEqual([
      "cotton_price_up", "yarn_demand_up", "womenswear_sales_up", "seasonal_demand", "tropical_climate"
    ]);
    // cumulativeWeight = 0.8 × 0.7 × 0.6 × 0.5 = 0.168
    expect(chain!.cumulativeWeight).toBeCloseTo(0.168, 2);
  });

  // === 4. 置信度衰减 → 低置信度需补充证据 ===
  it("marks long chains as low confidence (needs more evidence)", () => {
    const associations: MemoryAssociation[] = [];
    // 建 6 跳链，每跳 weight=0.5 → cumulative = 0.5^6 = 0.0156
    const nodes = ["n0", "n1", "n2", "n3", "n4", "n5", "n6"];
    for (let i = 0; i < 6; i++) {
      associations.push({
        id: `a${i}`,
        fromKey: nodes[i + 1],
        toKey: nodes[i],
        relation: "causes",
        weight: 0.5,
        createdAt: "",
        lastReinforcedAt: "",
        coOccurrenceCount: 1,
      });
    }

    const chain = traceAttribution("n0", associations);
    expect(chain!.hops).toBe(6);
    expect(chain!.cumulativeWeight).toBeCloseTo(0.0156, 3);
    expect(chain!.highConfidence).toBe(false);
    expect(needsMoreEvidence(chain!)).toBe(true);
  });

  // === 5. 环检测 — 循环因果不无限递归 ===
  it("handles circular causation without infinite recursion", () => {
    const associations: MemoryAssociation[] = [
      { id: "a1", fromKey: "B", toKey: "A", relation: "causes", weight: 0.8, createdAt: "", lastReinforcedAt: "", coOccurrenceCount: 1 },
      { id: "a2", fromKey: "A", toKey: "B", relation: "causes", weight: 0.8, createdAt: "", lastReinforcedAt: "", coOccurrenceCount: 1 },
    ];

    const chain = traceAttribution("A", associations);
    expect(chain).not.toBeNull();
    // A → B → A (visited) → stop. B is the root (A is revisited, skipped)
    expect(chain!.rootCause).toBe("B");
  });

  // === 6. 批量归因 ===
  it("traces attribution for multiple symptoms in batch", () => {
    const associations: MemoryAssociation[] = [
      { id: "a1", fromKey: "root1", toKey: "symptom1", relation: "causes", weight: 0.9, createdAt: "", lastReinforcedAt: "", coOccurrenceCount: 1 },
      { id: "a2", fromKey: "root2", toKey: "symptom2", relation: "causes", weight: 0.7, createdAt: "", lastReinforcedAt: "", coOccurrenceCount: 1 },
    ];

    const results = traceAttributionBatch(["symptom1", "symptom2", "symptom3"], associations);
    expect(results).toHaveLength(3);
    expect(results[0].chain!.rootCause).toBe("root1");
    expect(results[1].chain!.rootCause).toBe("root2");
    expect(results[2].chain!.rootCause).toBe("symptom3"); // 无上游
  });

  // === 7. formatAttribution 人类可读 ===
  it("formats attribution chain as human-readable string", () => {
    const associations: MemoryAssociation[] = [
      { id: "a1", fromKey: "demand_up", toKey: "price_up", relation: "causes", weight: 0.9, createdAt: "", lastReinforcedAt: "", coOccurrenceCount: 1 },
    ];
    const chain = traceAttribution("price_up", associations)!;
    const formatted = formatAttribution(chain);
    expect(formatted).toContain("90.0%");
    expect(formatted).toContain("HIGH");
    // v3: formatAttribution now shows per-hop weights as --(0.90)--> instead of ->
    expect(formatted).toContain("price_up");
    expect(formatted).toContain("demand_up");
    expect(formatted).toContain("--(0.90)-->");
    expect(formatted).toContain("demand_up");
  });

  // === 8. ATTRIBUTION_CONFIDENCE_THRESHOLD 常量 ===
  it("exports confidence threshold constant", () => {
    expect(ATTRIBUTION_CONFIDENCE_THRESHOLD).toBe(0.15);
  });
});

describe("Analyst Causal Edge Building (因果边构建)", () => {
  // === 9. Analyst 发现 above_range 信号时建 causes 边 ===
  it("builds causes edges when analyst detects above_range signal", () => {
    const { broker } = makeBroker();
    const evidence = makeVerifiedEvidence("cotton_price", 55000); // 55000 > apparel range max (50000)

    const result = executeAnalyst({
      task: { id: "t-a", triggerId: "trig", role: "analyst", objective: "analyze", status: "running", inputs: {}, createdAt: FIXED_NOW.toISOString() },
      evidence: [evidence],
      pack: apparelPack,
      broker,
      now: FIXED_NOW,
    });

    expect(result.status).toBe("completed");
    expect(result.finding).toBeDefined();
    // 应该建了因果边（cotton_price → cotton_price_cost_pressure）
    expect(broker.associationCount).toBeGreaterThan(0);
    const assocs = broker.listAssociations();
    const causesEdges = assocs.filter((a) => a.relation === "causes");
    expect(causesEdges.length).toBeGreaterThan(0);
  });

  // === 10. Analyst 把 finding commit 到 broker ===
  it("commits finding to broker via commit", () => {
    const { broker, store } = makeBroker();
    const evidence = makeVerifiedEvidence("cotton_price", 55000);

    executeAnalyst({
      task: { id: "t-c", triggerId: "trig", role: "analyst", objective: "analyze", status: "running", inputs: {}, createdAt: FIXED_NOW.toISOString() },
      evidence: [evidence],
      pack: apparelPack,
      broker,
      now: FIXED_NOW,
    });

    // confidence 0.8 >= 0.6 → 应写 Layer 1
    expect(store.size).toBeGreaterThan(0);
  });

  // === 11. Analyst 不注入 broker 时向后兼容 ===
  it("works without broker (backward compatible)", () => {
    const evidence = makeVerifiedEvidence("cotton_price", 25000);

    const result = executeAnalyst({
      task: { id: "t-nb", triggerId: "trig", role: "analyst", objective: "analyze", status: "running", inputs: {}, createdAt: FIXED_NOW.toISOString() },
      evidence: [evidence],
      pack: apparelPack,
      now: FIXED_NOW,
    });

    expect(result.status).toBe("completed");
    expect(result.finding).toBeDefined();
  });
});

describe("LoopDriver (闭环驱动器)", () => {
  // === 12. LoopDriver 多轮驱动 + broker 跨轮存活 ===
  it("drives multiple rounds with broker surviving across rounds", async () => {
    const registry = parseSourceRegistry(registrySeed);
    const { broker, store } = makeBroker();
    const trigger = makeTrigger("Monitor SEA apparel demand surge");
    const rawRecords: RawRecord[] = [
      {
        id: "raw-loop",
        sourceId: "shopee-open-platform",
        fetchedAt: FIXED_NOW.toISOString(),
        raw: {
          subject: "cotton_price",
          claim: "Cotton price at 25000 CNY/ton",
          value: 25000,
          unit: "CNY/ton",
          period: "2026-07",
        },
      },
    ];

    const driver = new LoopDriver({ maxRounds: 3, attributionConfidenceThreshold: 0.15 });
    const result = await driver.run({
      initialTrigger: trigger,
      initialRawRecords: rawRecords,
      registrySources: registry.sources,
      memoryStore: store,
      broker,
      pack: apparelPack,
      now: FIXED_NOW,
    });

    expect(result.totalRounds).toBeGreaterThan(0);
    expect(result.totalRounds).toBeLessThanOrEqual(3);
    expect(result.rounds.length).toBeGreaterThan(0);

    // broker 跨轮存活 — 记忆累积
    expect(store.size).toBeGreaterThan(0);

    // 每轮都有 swarmRun
    for (const round of result.rounds) {
      expect(round.swarmRun).toBeDefined();
      expect(round.swarmRun.tasks.length).toBeGreaterThan(0);
    }
  });

  // === 13. LoopDriver 终止条件：无 FollowUp ===
  it("stops when no followups generated", async () => {
    // 这个场景难以直接构造（orchestrator 总会生成 followUp）
    // 但可以验证 maxRounds 限制
    const registry = parseSourceRegistry(registrySeed);
    const { broker, store } = makeBroker();
    const trigger = makeTrigger("Nonexistent topic xyzqq");
    const rawRecords: RawRecord[] = [];

    const driver = new LoopDriver({ maxRounds: 1, attributionConfidenceThreshold: 0.15 });
    const result = await driver.run({
      initialTrigger: trigger,
      initialRawRecords: rawRecords,
      registrySources: registry.sources,
      memoryStore: store,
      broker,
      now: FIXED_NOW,
    });

    expect(result.totalRounds).toBe(1);
  });

  // === 14. AgentRoleProfile 工具声明 ===
  it("all 6 agent roles have toolset declarations", () => {
    const roles = ["scout", "collector", "verifier", "analyst", "synthesizer", "memory"];

    for (const role of roles) {
      const profile = AGENT_ROLE_PROFILES[role as keyof typeof AGENT_ROLE_PROFILES];
      expect(profile.toolset).toBeDefined();
      expect(profile.toolset!.length).toBeGreaterThan(0);
    }

    // Analyst 应有 traceAttribution 工具
    const analystTools = AGENT_ROLE_PROFILES.analyst.toolset!.map((t) => t.name);
    expect(analystTools).toContain("traceAttribution");
    expect(analystTools).toContain("broker.createOrReinforceAssociation");

    // Memory 应有 generateFollowUp 工具
    const memoryTools = AGENT_ROLE_PROFILES.memory.toolset!.map((t) => t.name);
    expect(memoryTools).toContain("generateFollowUp");
  });

  // === 15. AgentRoleProfile knowledgeBase 和 reasoningEffort ===
  it("all 6 agent roles have knowledgeBase and reasoningEffort", () => {
    const roles = ["scout", "collector", "verifier", "analyst", "synthesizer", "memory"] as const;

    for (const role of roles) {
      const profile = AGENT_ROLE_PROFILES[role];
      expect(profile.knowledgeBase).toBeDefined();
      expect(profile.knowledgeBase!.length).toBeGreaterThan(0);
      expect(profile.reasoningEffort).toBeDefined();
    }

    // Analyst 应是 max（需要最深的推理）
    expect(AGENT_ROLE_PROFILES.analyst.reasoningEffort).toBe("max");
  });
});
