/**
 * neural-memory.test.ts — 神经记忆架构测试 (Phase 2)
 *
 * 覆盖：
 *   - Layer 2: MemoryAssociation 创建/强化/权重上限
 *   - Layer 3: ReflexPathway 提取（3 次共现触发）
 *   - MemoryBroker.preload/query/commit
 *   - commit 置信度路由（≥0.6 写 Layer1，<0.6 不写）
 *   - query 跨层检索排序
 *   - AgentRoleProfile.memoryAccess 契约声明
 *   - Orchestrator + Broker 集成（reflexes 输出）
 */

import { describe, expect, it } from "vitest";
import registrySeed from "../../data/intelligence-source-registry.seed.json";
import {
  MemoryStore,
  MemoryBroker,
  parseSourceRegistry,
  apparelPack,
  orchestrateSwarm,
  AGENT_ROLE_PROFILES,
  DEFAULT_SWARM_WORKFLOW,
  COMMIT_CONFIDENCE_THRESHOLD,
  ASSOCIATION_REINFORCE_STEP,
  REFLEX_EXTRACTION_THRESHOLD,
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

describe("Neural Memory Architecture (Phase 2)", () => {
  // === 1. MemoryAssociation 创建与强化 ===
  it("creates association with initial weight 0.3 and reinforces +0.1 per co-occurrence", () => {
    const { broker } = makeBroker();

    // 首次创建
    const assoc1 = broker.createOrReinforceAssociation("key-a", "key-b", "semantic");
    expect(assoc1).not.toBeNull();
    expect(assoc1!.weight).toBe(0.3);
    expect(assoc1!.coOccurrenceCount).toBe(1);

    // 第二次共现 → 强化
    const assoc2 = broker.createOrReinforceAssociation("key-a", "key-b", "semantic");
    expect(assoc2!.id).toBe(assoc1!.id);
    expect(assoc2!.weight).toBe(0.3 + ASSOCIATION_REINFORCE_STEP);
    expect(assoc2!.coOccurrenceCount).toBe(2);

    // 第三次共现
    broker.createOrReinforceAssociation("key-a", "key-b", "semantic");
    expect(broker.listAssociations()).toHaveLength(1);
    expect(broker.listAssociations()[0].weight).toBe(0.3 + ASSOCIATION_REINFORCE_STEP * 2);
  });

  // === 2. Association weight 上限 1.0 ===
  it("caps association weight at 1.0 after many reinforcements", () => {
    const { broker } = makeBroker();

    // 强化 20 次（远超 1.0 所需）
    for (let i = 0; i < 20; i++) {
      broker.createOrReinforceAssociation("key-x", "key-y", "causes");
    }
    const assoc = broker.listAssociations()[0];
    expect(assoc.weight).toBeLessThanOrEqual(1.0);
    expect(assoc.weight).toBe(1.0);
    expect(assoc.coOccurrenceCount).toBe(20);
  });

  // === 3. ReflexPathway 提取 — 3 次共现触发 ===
  it("extracts ReflexPathway after 3 co-occurrences via commit", () => {
    const { broker, reflexes } = makeBroker();

    // 前 2 次 commit — 不应提取反射
    for (let i = 0; i < 2; i++) {
      broker.commit({
        kind: "finding",
        key: `finding-${i}`,
        value: "cotton price rising",
        confidence: 0.8,
        tags: ["cost_rising"],
        reflexTrigger: "cotton_price above 20000",
        reflexAction: "probe yarn_price",
      });
    }
    expect(reflexes.size).toBe(0);
    expect(broker.getReflexCount("cotton_price above 20000", "probe yarn_price")).toBe(2);

    // 第 3 次 commit — 应提取反射
    const result = broker.commit({
      kind: "finding",
      key: "finding-3",
      value: "cotton price rising again",
      confidence: 0.8,
      tags: ["cost_rising"],
      reflexTrigger: "cotton_price above 20000",
      reflexAction: "probe yarn_price",
    });

    expect(result.newReflex).toBeDefined();
    expect(result.newReflex!.trigger).toBe("cotton_price above 20000");
    expect(result.newReflex!.action).toBe("probe yarn_price");
    expect(result.newReflex!.confidence).toBe(0.5);
    expect(result.newReflex!.hitCount).toBe(1);
    expect(result.layersWritten).toContain(3);
    expect(reflexes.size).toBe(1);
  });

  // === 4. ReflexPathway 命中强化 ===
  it("reinforces existing ReflexPathway on repeat extraction", () => {
    const { broker } = makeBroker();

    // 先触发 3 次形成反射
    for (let i = 0; i < 3; i++) {
      broker.commit({
        kind: "finding",
        key: `f-${i}`,
        value: "test",
        confidence: 0.8,
        reflexTrigger: "demand_up",
        reflexAction: "verify supply chain",
      });
    }
    expect(broker.reflexCount).toBe(1);
    const firstReflex = broker.listReflexes()[0];
    expect(firstReflex.hitCount).toBe(1);
    expect(firstReflex.confidence).toBe(0.5);

    // 再次 extractReflex → hitCount +1, confidence +0.1
    const reinforced = broker.extractReflex("demand_up", "verify supply chain");
    expect(reinforced!.hitCount).toBe(2);
    expect(reinforced!.confidence).toBe(0.6);
  });

  // === 5. commit 置信度路由 — ≥0.6 写 Layer 1 ===
  it("commits to Layer 1 (MemoryStore) when confidence >= threshold", () => {
    const { broker, store } = makeBroker();

    const result = broker.commit({
      kind: "synthesis",
      key: "synth:trigger-1",
      value: "SEA apparel demand surging",
      confidence: 0.85,
      tags: ["demand_up", "apparel"],
    });

    expect(result.persisted).toBe(true);
    expect(result.layersWritten).toContain(1);
    expect(result.entry).toBeDefined();
    expect(result.entry!.key).toBe("synth:trigger-1");
    expect(store.size).toBe(1);
    expect(store.recall("synth:trigger-1")).toBeDefined();
  });

  // === 6. commit 置信度路由 — <0.6 不写持久层 ===
  it("does NOT persist when confidence < threshold (only preloads)", () => {
    const { broker, store } = makeBroker();

    const result = broker.commit({
      kind: "finding",
      key: "low-conf-finding",
      value: "uncertain signal",
      confidence: 0.4,
      tags: ["weak"],
    });

    expect(result.persisted).toBe(false);
    expect(result.layersWritten).toContain(0);
    expect(result.layersWritten).not.toContain(1);
    expect(result.entry).toBeUndefined();
    expect(store.size).toBe(0);
    expect(result.reason).toContain("confidence");
    expect(broker.preloadCount).toBe(1); // 进了 preload 工作区
  });

  // === 7. commit 建 Layer 2 关联边 ===
  it("creates Layer 2 associations when relatedKeys provided", () => {
    const { broker } = makeBroker();

    // 先写两条 entry
    broker.commit({ kind: "finding", key: "f-1", value: "finding A", confidence: 0.8 });
    broker.commit({ kind: "finding", key: "f-2", value: "finding B", confidence: 0.7 });

    // 第三条关联到前两条
    const result = broker.commit({
      kind: "synthesis",
      key: "s-1",
      value: "synthesis combining A and B",
      confidence: 0.9,
      relatedKeys: ["f-1", "f-2"],
    });

    expect(result.newAssociations).toHaveLength(2);
    expect(result.layersWritten).toContain(2);
    expect(broker.associationCount).toBe(2);
  });

  // === 8. query 跨层检索 ===
  it("queries across layers with text and tag matching", () => {
    const ledger: EvidenceEntry[] = [
      {
        id: "ev-1",
        sourceId: "shopee-open-platform",
        sourceTier: "S",
        sourceWeight: 1.0,
        kind: "market_signal",
        subject: "cotton_price",
        claim: "Cotton price rising to 25000 CNY/ton",
        observedAt: FIXED_NOW.toISOString(),
        method: "api",
        conversions: [],
        crossChecks: [],
        contradictions: [],
        notes: [],
      },
    ];
    const { broker } = makeBroker(ledger);

    // 写一条 Layer 1 记忆
    broker.commit({
      kind: "synthesis",
      key: "synth-1",
      value: "Cotton cost transmission affects apparel pricing",
      confidence: 0.85,
      tags: ["cotton", "apparel"],
    });

    // 搜 "cotton" — 应命中 Layer 0 (evidence) + Layer 1 (memory)
    const results = broker.query({ text: "cotton" });
    expect(results.length).toBeGreaterThanOrEqual(2);
    const layers = results.map((r) => r.layer);
    expect(layers).toContain(0);
    expect(layers).toContain(1);

    // 按 score 降序
    for (let i = 1; i < results.length; i++) {
      expect(results[i].score).toBeLessThanOrEqual(results[i - 1].score);
    }
  });

  // === 9. query tag 匹配 ===
  it("queries by tag matching Layer 1 entries", () => {
    const { broker } = makeBroker();

    broker.commit({
      kind: "signal",
      key: "sig-1",
      value: "demand surge in SEA",
      confidence: 0.8,
      tags: ["demand_up", "apparel"],
    });
    broker.commit({
      kind: "signal",
      key: "sig-2",
      value: "cost pressure from cotton",
      confidence: 0.75,
      tags: ["cost_rising", "apparel"],
    });

    const results = broker.query({ tags: ["demand_up"] });
    expect(results).toHaveLength(1);
    expect(results[0].key).toBe("sig-1");
    expect(results[0].matchedOn).toContain("tag");
  });

  // === 10. preload 推送到工作区 ===
  it("preload adds to working area without persisting", () => {
    const { broker, store } = makeBroker();

    broker.preload({ kind: "fact", value: "temporary context", tags: ["ctx"] });

    expect(broker.preloadCount).toBe(1);
    expect(store.size).toBe(0); // 不写持久层

    // 但 query 能搜到
    const results = broker.query({ text: "temporary" });
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some((r) => r.text === "temporary context")).toBe(true);
  });

  // === 11. AgentRoleProfile.memoryAccess 契约 ===
  it("all 6 agent roles have memoryAccess declarations", () => {
    const roles = ["scout", "collector", "verifier", "analyst", "synthesizer", "memory"] as const;

    for (const role of roles) {
      const profile = AGENT_ROLE_PROFILES[role];
      expect(profile.memoryAccess).toBeDefined();
      expect(profile.memoryAccess!.modes.length).toBeGreaterThan(0);
    }

    // 验证具体角色的访问模式
    expect(AGENT_ROLE_PROFILES.scout.memoryAccess!.modes).toContain("query");
    expect(AGENT_ROLE_PROFILES.scout.memoryAccess!.modes).not.toContain("commit");

    expect(AGENT_ROLE_PROFILES.collector.memoryAccess!.modes).toContain("commit");
    expect(AGENT_ROLE_PROFILES.collector.memoryAccess!.writableKinds).toContain("fact");

    expect(AGENT_ROLE_PROFILES.analyst.memoryAccess!.modes).toEqual(
      expect.arrayContaining(["query", "commit"])
    );
    expect(AGENT_ROLE_PROFILES.analyst.memoryAccess!.readableLayers).toEqual(
      expect.arrayContaining([1, 2, 3])
    );

    expect(AGENT_ROLE_PROFILES.memory.memoryAccess!.writableKinds).toHaveLength(4);
  });

  // === 12. Orchestrator + Broker 集成 — reflexes 输出 ===
  it("orchestrator with broker extracts reflexes on repeat runs", async () => {
    const registry = parseSourceRegistry(registrySeed);
    const trigger = makeTrigger("Monitor SEA apparel demand surge");
    const rawRecords: RawRecord[] = [
      {
        id: "raw-1",
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

    const { broker, store } = makeBroker();

    // 第一次运行 — 不应有反射（首次）
    const run1 = await orchestrateSwarm(trigger, {
      registrySources: registry.sources,
      rawRecords,
      ledger: [],
      memoryStore: store,
      broker,
      now: FIXED_NOW,
    });

    expect(run1.tasks).toHaveLength(DEFAULT_SWARM_WORKFLOW.steps.length);
    expect(run1.synthesis).toBeDefined();
    // 第一次运行：reflexes 可能为空（需 ≥3 次共现才提取）
    // 但 broker 内部 reflexCounts 已开始累计

    // 再运行 2 次（共 3 次）— 第三次应触发反射提取
    for (let i = 0; i < 2; i++) {
      await orchestrateSwarm(
        { ...trigger, id: `trig-${i + 2}` },
        {
          registrySources: registry.sources,
          rawRecords,
          ledger: [],
          memoryStore: store,
          broker,
          now: FIXED_NOW,
        }
      );
    }

    // 3 次后应有反射通路
    expect(broker.reflexCount).toBeGreaterThanOrEqual(1);
    const reflexes = broker.listReflexes();
    expect(reflexes.length).toBeGreaterThanOrEqual(1);
    expect(reflexes[0].hitCount).toBeGreaterThanOrEqual(1);
  });

  // === 13. Orchestrator 不注入 broker 时向后兼容 ===
  it("orchestrator works without broker (backward compatible)", async () => {
    const registry = parseSourceRegistry(registrySeed);
    const trigger = makeTrigger();
    const rawRecords: RawRecord[] = [
      {
        id: "raw-bc",
        sourceId: "shopee-open-platform",
        fetchedAt: FIXED_NOW.toISOString(),
        raw: {
          subject: "cotton_price",
          claim: "Cotton price at 25000",
          value: 25000,
          unit: "CNY/ton",
          period: "2026-07",
        },
      },
    ];
    const store = new MemoryStore();

    const result = await orchestrateSwarm(trigger, {
      registrySources: registry.sources,
      rawRecords,
      ledger: [],
      memoryStore: store,
      now: FIXED_NOW,
      // 不注入 broker
    });

    expect(result.tasks).toHaveLength(DEFAULT_SWARM_WORKFLOW.steps.length);
    expect(result.synthesis).toBeDefined();
    expect(result.reflexes).toBeUndefined(); // 无 broker → 无 reflexes
    expect(store.size).toBeGreaterThan(0); // 直接写 MemoryStore
  });

  // === 14. COMMIT_CONFIDENCE_THRESHOLD 常量 ===
  it("exports correct threshold constants", () => {
    expect(COMMIT_CONFIDENCE_THRESHOLD).toBe(0.6);
    expect(ASSOCIATION_REINFORCE_STEP).toBe(0.1);
    expect(REFLEX_EXTRACTION_THRESHOLD).toBe(3);
  });
});
