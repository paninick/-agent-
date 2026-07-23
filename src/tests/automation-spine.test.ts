/**
 * automation-spine.test.ts — Automation Spine v1 测试
 *
 * 覆盖完整闭环：Probe → Trigger → Swarm → Information → Verification → Analysis → Synthesis → Memory → Feedback
 *
 * 12 项测试对齐用户要求：
 *   1.  Probe 注册与查询
 *   2.  runProbe 生成 ProbeSignal（schedule kind）
 *   3.  runProbe 生成 ProbeSignal（threshold kind）
 *   4.  TriggerEngine 命中规则生成 SwarmTrigger
 *   5.  TriggerEngine 未命中返回 null
 *   6.  SwarmOrchestrator 创建完整工作流的 SwarmTask
 *   7.  Collector 把 RawRecord 转 EvidenceEntry（字段完整）
 *   8.  Verifier 调 6 门返回 AnnotatedEvidence（authenticity 存在）
 *   9.  Analyst 产 AnalysisFinding（confidence 合理）
 *   10. Synthesizer 产 SynthesisOutput（含 brief 文本）
 *   11. Memory 写入并可 recall
 *   12. Demo 端到端跑通（trigger → synthesis → followUp 非空）
 */

import { describe, expect, it } from "vitest";
import registrySeed from "../../data/intelligence-source-registry.seed.json";
import {
  // probes
  ProbeRegistry,
  runProbe,
  buildSignal,
  // triggers
  TriggerEngine,
  thresholdRule,
  signalPayloadRule,
  // collection
  rawRecordToExtractedFact,
  extractedFactToEvidence,
  // swarm agents
  executeScout,
  executeCollector,
  executeVerifier,
  executeAnalyst,
  executeSynthesizer,
  executeMemory,
  // swarm orchestrator + profiles
  orchestrateSwarm,
  AGENT_ROLE_PROFILES,
  DEFAULT_SWARM_WORKFLOW,
  getRoleProfile,
  // memory
  MemoryStore,
  // synthesis
  synthesizeBrief,
  // feedback
  generateFollowUp,
  // demo
  runApparelSoutheastAsiaDemo,
  // existing (reused)
  parseSourceRegistry,
  getSource,
  apparelPack,
  // types
} from "../intelligence";
import type {
  Probe,
  RawRecord,
  SwarmTrigger,
  SwarmTask,
} from "../intelligence";

const FIXED_NOW = new Date("2026-07-07T12:00:00Z");
// observedAt / fetchedAt 用 FIXED_NOW — freshness gate 现在接收注入的 now 参数，
// ageDays = 0 → score = 1.0，确定性通过（不再需要 PAST_DATE hack 绕过 Date.now() bug）。

function makeRegistry() {
  return parseSourceRegistry(registrySeed);
}

describe("Automation Spine v1", () => {
  // === 1. Probe 注册与查询 ===
  it("ProbeRegistry registers and queries probes", () => {
    const reg = new ProbeRegistry();
    const probe: Probe = {
      id: "test-probe-1",
      name: "Test Probe",
      kind: "schedule",
      sourceId: "shopee-open-platform",
      params: {},
      enabled: true,
    };
    reg.register(probe);

    expect(reg.get("test-probe-1")).toBeDefined();
    expect(reg.get("test-probe-1")?.name).toBe("Test Probe");
    expect(reg.list()).toHaveLength(1);
    expect(reg.listEnabled()).toHaveLength(1);

    reg.disable("test-probe-1");
    expect(reg.listEnabled()).toHaveLength(0);
    expect(reg.get("test-probe-1")?.enabled).toBe(false);

    reg.enable("test-probe-1");
    expect(reg.listEnabled()).toHaveLength(1);
  });

  // === 2. runProbe 生成 ProbeSignal（schedule kind）===
  it("runProbe emits signal for schedule kind", async () => {
    const probe: Probe = {
      id: "schedule-probe",
      name: "Daily Check",
      kind: "schedule",
      sourceId: "shopee-open-platform",
      params: { metric: "sales" },
      enabled: true,
    };
    const run = await runProbe(probe, { now: FIXED_NOW });

    expect(run.status).toBe("completed");
    expect(run.signalId).toBeDefined();
    expect(run.startedAt).toBe(FIXED_NOW.toISOString());
  });

  // === 3. runProbe 生成 ProbeSignal（threshold kind）===
  it("runProbe emits signal for threshold kind when value exceeds", async () => {
    const probe: Probe = {
      id: "threshold-probe",
      name: "Sales Threshold",
      kind: "threshold",
      sourceId: "shopee-open-platform",
      params: { metric: "sales_volume", threshold: 10000, operator: "gt" },
      enabled: true,
    };

    // 超过阈值 → 应产生信号
    const runHit = await runProbe(probe, {
      payload: { sales_volume: 18500 },
      now: FIXED_NOW,
    });
    expect(runHit.status).toBe("completed");
    expect(runHit.signalId).toBeDefined();

    // 未超过阈值 → 不产生信号
    const runMiss = await runProbe(probe, {
      payload: { sales_volume: 5000 },
      now: FIXED_NOW,
    });
    expect(runMiss.status).toBe("completed");
    expect(runMiss.signalId).toBeUndefined();
  });

  // === 4. TriggerEngine 命中规则生成 SwarmTrigger ===
  it("TriggerEngine fires SwarmTrigger when threshold rule matches", () => {
    const engine = new TriggerEngine({ now: FIXED_NOW });
    engine.addRule(thresholdRule("r1", "Sales Threshold", "sales_volume", 10000, "gt"));

    const signal = buildSignal(
      { id: "p1", name: "P", kind: "threshold", sourceId: "s", params: {}, enabled: true },
      { id: "run1", probeId: "p1", startedAt: FIXED_NOW.toISOString(), status: "completed", signalId: "sig1" },
      { sales_volume: 18500 },
      FIXED_NOW
    );

    const trigger = engine.evaluate(signal, { ledger: [] });
    expect(trigger).not.toBeNull();
    expect(trigger?.ruleId).toBe("r1");
    expect(trigger?.signalId).toBe("sig1");
    expect(trigger?.firedAt).toBe(FIXED_NOW.toISOString());
  });

  // === 5. TriggerEngine 未命中返回 null ===
  it("TriggerEngine returns null when no rule matches", () => {
    const engine = new TriggerEngine({ now: FIXED_NOW });
    engine.addRule(thresholdRule("r1", "Sales Threshold", "sales_volume", 50000, "gt"));

    const signal = buildSignal(
      { id: "p1", name: "P", kind: "threshold", sourceId: "s", params: {}, enabled: true },
      { id: "run1", probeId: "p1", startedAt: FIXED_NOW.toISOString(), status: "completed", signalId: "sig1" },
      { sales_volume: 18500 }, // 低于阈值 50000
      FIXED_NOW
    );

    const trigger = engine.evaluate(signal, { ledger: [] });
    expect(trigger).toBeNull();
  });

  // === 6. SwarmOrchestrator 创建完整工作流 SwarmTask ===
  it("SwarmOrchestrator creates tasks for every role in DEFAULT_SWARM_WORKFLOW", async () => {
    const registry = makeRegistry();
    const trigger: SwarmTrigger = {
      id: "trigger-test",
      ruleId: "r1",
      signalId: "sig1",
      firedAt: FIXED_NOW.toISOString(),
      objective: "Test objective for swarm",
      pack: apparelPack,
    };

    const rawRecords: RawRecord[] = [
      {
        id: "raw-1",
        sourceId: "shopee-open-platform",
        fetchedAt: FIXED_NOW.toISOString(),
        raw: {
          subject: "cotton_price",
          claim: "Test claim about cotton price",
          value: 15000,
          unit: "CNY/ton",
          period: "2026-07",
          geography: "Southeast Asia",
        },
      },
    ];

    const memoryStore = new MemoryStore();
    const result = await orchestrateSwarm(trigger, {
      registrySources: registry.sources,
      rawRecords,
      ledger: [],
      memoryStore,
      now: FIXED_NOW,
    });

    // 默认工作流中的每个角色各一个 task
    expect(result.tasks).toHaveLength(DEFAULT_SWARM_WORKFLOW.steps.length);
    const roles = result.tasks.map((t) => t.role);
    expect(roles).toEqual(DEFAULT_SWARM_WORKFLOW.steps);

    // 所有 task 都应完成（非失败）
    const failedTasks = result.tasks.filter((t) => t.status === "failed");
    expect(failedTasks).toHaveLength(0);
  });

  // === 7. Collector 把 RawRecord 转 EvidenceEntry（字段完整）===
  it("Collector converts RawRecord to EvidenceEntry with complete fields", () => {
    const registry = makeRegistry();
    const source = getSource(registry, "shopee-open-platform");

    const raw: RawRecord = {
      id: "raw-test",
      sourceId: "shopee-open-platform",
      fetchedAt: FIXED_NOW.toISOString(),
      raw: {
        subject: "cotton_price",
        claim: "Cotton price at 15000 CNY/ton",
        value: 15000,
        unit: "CNY/ton",
        period: "2026-07",
        geography: "China",
      },
    };

    const result = executeCollector({
      task: { id: "t1", triggerId: "trig1", role: "collector", objective: "collect", status: "running", inputs: {}, createdAt: FIXED_NOW.toISOString() },
      registrySources: registry.sources,
      rawRecords: [raw],
    });

    expect(result.status).toBe("completed");
    expect(result.evidence).toBeDefined();
    expect(result.evidence?.sourceId).toBe("shopee-open-platform");
    expect(result.evidence?.sourceTier).toBe(source.tier);
    expect(result.evidence?.subject).toBe("cotton_price");
    expect(result.evidence?.claim).toContain("Cotton price");
    expect(result.evidence?.value).toBe(15000);
    expect(result.evidence?.unit).toBe("CNY/ton");
    expect(result.evidence?.id).toBeDefined();
  });

  // === 8. Verifier 调 6 门返回 AnnotatedEvidence（authenticity 存在）===
  it("Verifier runs 6 gates and returns AnnotatedEvidence with authenticity", () => {
    const registry = makeRegistry();

    // 先用 collection 函数构造一条 evidence
    const source = getSource(registry, "shopee-open-platform");
    const raw: RawRecord = {
      id: "raw-v",
      sourceId: "shopee-open-platform",
      fetchedAt: FIXED_NOW.toISOString(),
      raw: {
        subject: "cotton_price",
        claim: "Cotton price at 15000 CNY/ton",
        value: 15000,
        unit: "CNY/ton",
        period: "2026-07",
      },
    };
    const fact = rawRecordToExtractedFact(raw, FIXED_NOW);
    const evidence = extractedFactToEvidence(fact, source, "market_signal", FIXED_NOW.toISOString());

    // Verifier 验证
    const result = executeVerifier({
      task: { id: "t-v", triggerId: "trig", role: "verifier", objective: "verify", status: "running", inputs: {}, createdAt: FIXED_NOW.toISOString() },
      evidence,
      ledger: [],
      registrySources: registry.sources,
      pack: apparelPack,
      now: FIXED_NOW,
    });

    expect(result.status).toBe("completed");
    expect(result.authenticity).toBeDefined();
    expect(result.authenticity?.gateResults).toHaveLength(6);
    // 6 门名称
    const gateNames = result.authenticity?.gateResults.map((g) => g.gate);
    expect(gateNames).toEqual([
      "provenance",
      "schema_match",
      "range_plausibility",
      "freshness",
      "cross_source",
      "historical",
    ]);
    // cotton_price=15000 在 apparelPack knownRanges (10000-18000) 内 → range 门应通过
    const rangeGate = result.authenticity?.gateResults.find((g) => g.gate === "range_plausibility");
    expect(rangeGate?.score).toBeGreaterThan(0.7);
  });

  // === 9. Analyst 产 AnalysisFinding（confidence 合理）===
  it("Analyst produces AnalysisFinding with reasonable confidence", () => {
    const registry = makeRegistry();
    const source = getSource(registry, "shopee-open-platform");

    // 构造一条已验证的 evidence
    const raw: RawRecord = {
      id: "raw-a",
      sourceId: "shopee-open-platform",
      fetchedAt: FIXED_NOW.toISOString(),
      raw: {
        subject: "cotton_price",
        claim: "Cotton price rising to 15000 CNY/ton",
        value: 15000,
        unit: "CNY/ton",
        period: "2026-07",
      },
    };
    const fact = rawRecordToExtractedFact(raw, FIXED_NOW);
    const evidence = extractedFactToEvidence(fact, source, "market_signal", FIXED_NOW.toISOString());

    // 先验证
    const verifyResult = executeVerifier({
      task: { id: "t-va", triggerId: "trig", role: "verifier", objective: "verify", status: "running", inputs: {}, createdAt: FIXED_NOW.toISOString() },
      evidence,
      ledger: [],
      registrySources: registry.sources,
      pack: apparelPack,
      now: FIXED_NOW,
    });
    const annotatedEvidence = verifyResult.evidence!;

    // 分析
    const result = executeAnalyst({
      task: { id: "t-a", triggerId: "trig", role: "analyst", objective: "analyze", status: "running", inputs: {}, createdAt: FIXED_NOW.toISOString() },
      evidence: [annotatedEvidence],
      pack: apparelPack,
      now: FIXED_NOW,
    });

    expect(result.status).toBe("completed");
    expect(result.finding).toBeDefined();
    expect(result.finding?.summary).toContain("cotton_price");
    expect(result.finding?.confidence).toBeGreaterThan(0);
    expect(result.finding?.confidence).toBeLessThanOrEqual(1);
    expect(result.finding?.evidenceIds).toContain(annotatedEvidence.id);
  });

  // === 10. Synthesizer 产 SynthesisOutput（含 brief 文本）===
  it("Synthesizer produces SynthesisOutput with brief text", () => {
    const trigger: SwarmTrigger = {
      id: "trig-synth",
      ruleId: "r1",
      signalId: "sig1",
      firedAt: FIXED_NOW.toISOString(),
      objective: "Test synthesis objective",
      pack: apparelPack,
    };

    const result = executeSynthesizer({
      task: { id: "t-s", triggerId: "trig-synth", role: "synthesizer", objective: "synthesize", status: "running", inputs: {}, createdAt: FIXED_NOW.toISOString() },
      trigger,
      findings: [
        {
          id: "f1",
          taskId: "t-a",
          evidenceIds: ["ev1"],
          summary: "Cotton price in range, demand rising",
          confidence: 0.75,
          signals: ["cotton_price_in_range", "demand_up"],
        },
      ],
      evidenceIds: ["ev1"],
      now: FIXED_NOW,
    });

    expect(result.status).toBe("completed");
    expect(result.synthesis).toBeDefined();
    expect(result.synthesis?.title).toContain("Intelligence Brief");
    expect(result.synthesis?.brief).toContain("Objective: Test synthesis objective");
    expect(result.synthesis?.brief).toContain("Cotton price in range");
    expect(result.synthesis?.brief).toContain("demand_up");
    expect(result.synthesis?.confidence).toBe(0.75);
    expect(result.synthesis?.findings).toHaveLength(1);
  });

  // === 11. Memory 写入并可 recall ===
  it("MemoryStore writes and recalls entries", () => {
    const store = new MemoryStore();
    const entry = {
      id: "mem-1",
      key: "synthesis:trigger-1",
      kind: "synthesis" as const,
      value: "Test synthesis brief content",
      sourceTaskId: "task-1",
      createdAt: FIXED_NOW.toISOString(),
      tags: ["synthesis", "demand_up"],
    };

    store.remember(entry);

    expect(store.size).toBe(1);
    expect(store.recall("synthesis:trigger-1")?.value).toBe("Test synthesis brief content");
    expect(store.recallByTag("demand_up")).toHaveLength(1);
    expect(store.listByKind("synthesis")).toHaveLength(1);
    expect(store.recall("nonexistent")).toBeUndefined();
  });

  // === 12. Demo 端到端跑通（trigger → synthesis → followUp 非空）===
  it("Apparel Southeast Asia demo runs end-to-end with closed loop", async () => {
    const registry = makeRegistry();
    const result = await runApparelSoutheastAsiaDemo(registry.sources, FIXED_NOW);

    // Probe 运行并产生信号
    expect(result.probe.id).toBe("probe-shopee-sea-womenswear");
    expect(result.signal.payload.sales_volume).toBe(18500);

    // Trigger 触发
    expect(result.trigger).toBeDefined();
    expect(result.trigger.ruleId).toBe("rule-sales-threshold");

    // Swarm 执行完整默认工作流
    expect(result.swarmRun.tasks).toHaveLength(DEFAULT_SWARM_WORKFLOW.steps.length);

    // Synthesis 产出
    expect(result.swarmRun.synthesis).toBeDefined();
    expect(result.swarmRun.synthesis?.brief).toContain("womenswear");

    // FollowUp 生成（闭环）
    expect(result.swarmRun.followUps).toBeDefined();
    expect(result.swarmRun.followUps!.length).toBeGreaterThan(0);

    // Memory 写入
    expect(result.memoryEntries).toBeGreaterThan(0);

    // 闭环成功
    expect(result.loopClosed).toBe(true);
  });
});

// === 附加：Agent Role Profiles 契约校验 ===
describe("Automation Spine v1: Agent Role Profiles (SOUL.md / IDENTITY.md absorption)", () => {
  it("all 6 roles have profiles with identity and boundaries", () => {
    const roles: Array<keyof typeof AGENT_ROLE_PROFILES> = ["scout", "collector", "verifier", "analyst", "synthesizer", "memory"];
    for (const role of roles) {
      const profile = getRoleProfile(role);
      expect(profile.identity).toBeTruthy();
      expect(profile.identity.toLowerCase()).toContain(role);
      expect(profile.boundaries.length).toBeGreaterThan(0);
      expect(profile.permittedInputs.length).toBeGreaterThan(0);
      expect(profile.permittedOutputs.length).toBeGreaterThan(0);
    }
  });

  it("DEFAULT_SWARM_WORKFLOW has 10 steps in correct order", () => {
    expect(DEFAULT_SWARM_WORKFLOW.steps).toEqual([
      "scout", "collector", "data_janitor", "verifier", "analyst",
      "devils_advocate", "adjudicator", "reconciliation_scorer", "synthesizer", "memory",
    ]);
  });

  it("verifier profile forbids skipping gates (SOUL boundary)", () => {
    const profile = getRoleProfile("verifier");
    const hasGateBoundary = profile.boundaries.some((b) => b.includes("gate"));
    expect(hasGateBoundary).toBe(true);
  });

  it("memory profile requires at least one follow-up (loop closure)", () => {
    const profile = getRoleProfile("memory");
    const hasLoopBoundary = profile.boundaries.some((b) => b.includes("follow-up"));
    expect(hasLoopBoundary).toBe(true);
  });
});
