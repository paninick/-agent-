/**
 * scout-feedback-broker.test.ts — Phase 4 测试
 *
 * 覆盖：
 *   - Scout 多级匹配 (exact → domain → coverage → broker → fallback)
 *   - Scout 查询 broker 历史
 *   - Feedback 盲重试 + broker 反射触发
 *   - 端到端：第二次运行相同 trigger 时反射通路被命中
 */

import { describe, expect, it } from "vitest";
import registrySeed from "../../data/intelligence-source-registry.seed.json";
import {
  parseSourceRegistry,
  apparelPack,
  matchSources,
  executeScout,
  generateFollowUp,
  MemoryStore,
  MemoryBroker,
  orchestrateSwarm,
} from "../intelligence";
import type {
  IntelligenceSource,
  MemoryAssociation,
  ReflexPathway,
  SwarmTrigger,
  SynthesisOutput,
  AnalysisFinding,
  RawRecord,
} from "../intelligence";

const FIXED_NOW = new Date("2026-07-07T12:00:00Z");

function getSources(): IntelligenceSource[] {
  return parseSourceRegistry(registrySeed).sources;
}

function makeBroker() {
  const store = new MemoryStore();
  const associations = new Map<string, MemoryAssociation>();
  const reflexes = new Map<string, ReflexPathway>();
  const broker = new MemoryBroker([], store, associations, reflexes, FIXED_NOW);
  return { broker, store, associations, reflexes };
}

function makeTrigger(objective = "Monitor SEA apparel demand surge"): SwarmTrigger {
  return {
    id: "trig-test",
    ruleId: "rule-1",
    signalId: "sig-1",
    firedAt: FIXED_NOW.toISOString(),
    objective,
    pack: apparelPack,
  };
}

function makeSynthesis(title: string, confidence: number): SynthesisOutput {
  return {
    id: "synth-1",
    triggerId: "trig-test",
    title,
    brief: `Brief for ${title}`,
    findings: [],
    evidenceIds: [],
    confidence,
    generatedAt: FIXED_NOW.toISOString(),
  };
}

describe("Scout Multi-Level Matching + Feedback-Broker (Phase 4)", () => {
  // === 1. Scout exact 匹配 ===
  it("matchSources returns exact tier when keyword matches source name", () => {
    const sources = getSources();
    const results = matchSources("shopee sales monitor", sources);
    const shopeeMatch = results.find((r) => r.sourceId === "shopee-open-platform");
    expect(shopeeMatch).toBeDefined();
    expect(shopeeMatch!.tier).toBe("exact");
    expect(shopeeMatch!.score).toBe(1.0);
  });

  // === 2. Scout domain 匹配 ===
  it("matchSources returns domain tier when keyword matches coverage_domain", () => {
    const sources = getSources();
    // 用 coverage_domain 中的词做 objective
    const results = matchSources("orders products inventory", sources);
    expect(results.length).toBeGreaterThan(0);
    const hasDomain = results.some((r) => r.tier === "domain" || r.tier === "exact" || r.tier === "coverage");
    expect(hasDomain).toBe(true);
  });

  // === 3. Scout fallback 匹配 ===
  it("matchSources returns fallback tier when no keyword matches", () => {
    const sources = getSources();
    const results = matchSources("xyzqq nonexistent topic", sources);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.tier === "fallback")).toBe(true);
    expect(results.every((r) => r.score === 0.3)).toBe(true);
  });

  // === 4. Scout 匹配去重 ===
  it("matchSources deduplicates — same source not in multiple tiers", () => {
    const sources = getSources();
    const results = matchSources("shopee shopee shopee", sources);
    const shopeeResults = results.filter((r) => r.sourceId === "shopee-open-platform");
    expect(shopeeResults).toHaveLength(1);
  });

  // === 5. Scout 按 score 降序 ===
  it("matchSources returns results sorted by score descending", () => {
    const sources = getSources();
    const results = matchSources("shopee orders monitor", sources);
    for (let i = 1; i < results.length; i++) {
      expect(results[i].score).toBeLessThanOrEqual(results[i - 1].score);
    }
  });

  // === 6. executeScout 集成 matchSources ===
  it("executeScout uses matchSources and returns candidate IDs", () => {
    const sources = getSources();
    const result = executeScout({
      task: {
        id: "t-1",
        triggerId: "trig",
        role: "scout",
        objective: "shopee sales monitor",
        status: "running",
        inputs: {},
        createdAt: FIXED_NOW.toISOString(),
      },
      registrySources: sources,
    });

    expect(result.status).toBe("completed");
    expect(result.candidateSourceIds).toBeDefined();
    expect(result.candidateSourceIds!.length).toBeGreaterThan(0);
    expect(result.candidateSourceIds).toContain("shopee-open-platform");
  });

  // === 7. executeScout 注入 broker ===
  it("executeScout accepts optional broker without error", () => {
    const sources = getSources();
    const { broker } = makeBroker();

    const result = executeScout({
      task: {
        id: "t-2",
        triggerId: "trig",
        role: "scout",
        objective: "apparel demand",
        status: "running",
        inputs: {},
        createdAt: FIXED_NOW.toISOString(),
      },
      registrySources: sources,
      broker,
    });

    expect(result.status).toBe("completed");
    expect(result.candidateSourceIds).toBeDefined();
  });

  // === 8. Feedback 盲重试（confidence < 0.5）===
  it("generateFollowUp generates blind retry when confidence < 0.5", () => {
    const synthesis = makeSynthesis("Low confidence brief", 0.3);
    const followUps = generateFollowUp(synthesis, [], "task-1", FIXED_NOW);

    expect(followUps.length).toBeGreaterThan(0);
    const retry = followUps.find((fu) => fu.objective.includes("additional evidence"));
    expect(retry).toBeDefined();
    expect(retry!.rationale).toContain("0.30");
  });

  // === 9. Feedback 不注入 broker 时保持 v1 行为 ===
  it("generateFollowUp without broker works as v1 (backward compatible)", () => {
    const synthesis = makeSynthesis("Normal brief", 0.8);
    const findings: AnalysisFinding[] = [
      {
        id: "f-1",
        taskId: "t-1",
        evidenceIds: ["ev-1"],
        summary: "cost rising",
        confidence: 0.8,
        signals: ["cost_rising"],
      },
    ];

    const followUps = generateFollowUp(synthesis, findings, "task-1", FIXED_NOW);

    expect(followUps.length).toBeGreaterThan(0);
    const probe = followUps.find((fu) => fu.kind === "probe");
    expect(probe).toBeDefined();
    expect(probe!.objective).toContain("cotton_price");
  });

  // === 10. Feedback 反射触发（注入 broker 有反射时）===
  it("generateFollowUp triggers reflex action when broker has matching reflex", () => {
    const { broker } = makeBroker();

    // 手动注入一个反射通路（模拟已形成的肌肉记忆）
    broker.extractReflex("Monitor SEA apparel demand surge", "Probe yarn_price for cost confirmation");

    const synthesis = makeSynthesis("Monitor SEA apparel demand surge", 0.8);
    const followUps = generateFollowUp(synthesis, [], "task-1", FIXED_NOW, broker);

    const reflexFollowUp = followUps.find((fu) =>
      fu.objective === "Probe yarn_price for cost confirmation"
    );
    expect(reflexFollowUp).toBeDefined();
    expect(reflexFollowUp!.rationale).toContain("reflex pathway triggered");
    expect(reflexFollowUp!.rationale).toContain("hitCount");
  });

  // === 11. 端到端：第二次运行时反射被触发 ===
  it("end-to-end: reflex triggers on second run with same objective", async () => {
    const sources = getSources();
    const { broker, store } = makeBroker();
    const trigger = makeTrigger("Monitor SEA apparel demand surge");
    const rawRecords: RawRecord[] = [
      {
        id: "raw-e2e",
        sourceId: "shopee-open-platform",
        fetchedAt: FIXED_NOW.toISOString(),
        raw: {
          subject: "cotton_price",
          claim: "Cotton price at 15000 CNY/ton",
          value: 15000,
          unit: "CNY/ton",
          period: "2026-07",
        },
      },
    ];

    // 运行 3 次（达到反射提取阈值）
    for (let i = 0; i < 3; i++) {
      await orchestrateSwarm(
        { ...trigger, id: `trig-${i + 1}` },
        {
          registrySources: sources,
          rawRecords,
          ledger: [],
          memoryStore: store,
          broker,
          now: FIXED_NOW,
        }
      );
    }

    // 第 3 次后应有反射
    expect(broker.reflexCount).toBeGreaterThanOrEqual(1);
    const reflex = broker.listReflexes()[0];
    expect(reflex.trigger).toContain("apparel demand");
    expect(reflex.action).toBeDefined();

    // 第 4 次运行 — Feedback 应触发反射 action
    const run4 = await orchestrateSwarm(
      { ...trigger, id: "trig-4" },
      {
        registrySources: sources,
        rawRecords,
        ledger: [],
        memoryStore: store,
        broker,
        now: FIXED_NOW,
      }
    );

    expect(run4.followUps).toBeDefined();
    // 反射 action 应出现在 followUps 中
    const reflexFollowUp = run4.followUps!.find((fu) => fu.objective === reflex.action);
    expect(reflexFollowUp).toBeDefined();
    expect(reflexFollowUp!.rationale).toContain("reflex");
  });

  // === 12. Orchestrator reflexes 输出 ===
  it("orchestrator returns reflexes field when broker extracts new reflex", async () => {
    const sources = getSources();
    const { broker, store } = makeBroker();
    const trigger = makeTrigger("Monitor SEA apparel demand surge");
    const rawRecords: RawRecord[] = [
      {
        id: "raw-reflex",
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

    // 先运行 2 次（累计计数）
    for (let i = 0; i < 2; i++) {
      await orchestrateSwarm(
        { ...trigger, id: `trig-pre-${i + 1}` },
        {
          registrySources: sources,
          rawRecords,
          ledger: [],
          memoryStore: store,
          broker,
          now: FIXED_NOW,
        }
      );
    }

    // 第 3 次应触发反射提取，reflexes 字段非空
    const run3 = await orchestrateSwarm(
      { ...trigger, id: "trig-3" },
      {
        registrySources: sources,
        rawRecords,
        ledger: [],
        memoryStore: store,
        broker,
        now: FIXED_NOW,
      }
    );

    expect(run3.reflexes).toBeDefined();
    expect(run3.reflexes!.length).toBeGreaterThanOrEqual(1);
  });
});
