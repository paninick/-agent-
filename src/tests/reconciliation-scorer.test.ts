/**
 * reconciliation-scorer.test.ts - Reconciliation Scorer Agent 测试
 *
 * 测试 10 维度对账评分
 */

import { describe, expect, it } from "vitest";
import { executeReconciliationScorer } from "../intelligence/swarm/agents/reconciliation-scorer";
import type { SwarmTask } from "../intelligence/spine/types";
import type { EvidenceEntry } from "../intelligence/types";
import { apparelPack } from "../intelligence/analysis/industryPacks/apparel";

function makeTask(): SwarmTask {
  return {
    id: "task-recon-1",
    triggerId: "trigger-1",
    role: "reconciliation_scorer",
    objective: "test objective",
    status: "running",
    inputs: {},
    createdAt: new Date().toISOString(),
  };
}

function makeEvidence(overrides: Partial<EvidenceEntry> = {}): EvidenceEntry {
  return {
    id: "ev-1",
    sourceId: "source-1",
    sourceTier: "A",
    sourceWeight: 1.0,
    kind: "market_signal",
    subject: "cotton_price",
    claim: "Cotton price at 12000 CNY/ton",
    observedAt: new Date().toISOString(),
    method: "api",
    conversions: [],
    crossChecks: [],
    contradictions: [],
    notes: [],
    value: 12000,
    unit: "CNY/ton",
    ...overrides,
  };
}

describe("Reconciliation Scorer Agent", () => {
  it("handles empty evidence list", () => {
    const task = makeTask();
    const result = executeReconciliationScorer({ task, evidenceList: [] });

    expect(result.status).toBe("failed");
    expect(result.error).toBe("no evidence to score");
  });

  it("scores all 10 dimensions", () => {
    const task = makeTask();
    const evidence = makeEvidence();

    const result = executeReconciliationScorer({
      task,
      evidenceList: [evidence],
      pack: apparelPack,
    });

    expect(result.status).toBe("completed");
    expect(result.reconciliationScores).toBeDefined();
    expect(result.reconciliationScores?.dimensions?.length).toBe(10);

    const expectedDimensions = [
      "product", "quantity", "price", "delivery", "quality",
      "inventory", "financial", "tax", "demand", "capacity",
    ];
    const scoredDimensions = result.reconciliationScores?.dimensions?.map((d) => d.dimension);
    expectedDimensions.forEach((dim) => {
      expect(scoredDimensions).toContain(dim);
    });
  });

  it("calculates overall health score", () => {
    const task = makeTask();
    const evidence = makeEvidence();

    const result = executeReconciliationScorer({
      task,
      evidenceList: [evidence],
      pack: apparelPack,
    });

    expect(result.status).toBe("completed");
    expect(result.reconciliationScores?.overallHealth).toBeDefined();
    expect(result.reconciliationScores?.overallHealth).toBeGreaterThanOrEqual(0);
    expect(result.reconciliationScores?.overallHealth).toBeLessThanOrEqual(100);
  });

  it("identifies critical mismatches", () => {
    const task = makeTask();
    const evidence1 = makeEvidence({
      id: "ev-1",
      subject: "cotton_price",
      value: 50000,
    });
    const evidence2 = makeEvidence({
      id: "ev-2",
      subject: "wage_sewer",
      value: 50,
    });

    const result = executeReconciliationScorer({
      task,
      evidenceList: [evidence1, evidence2],
      pack: apparelPack,
    });

    expect(result.status).toBe("completed");
    expect(result.reconciliationScores?.criticalMismatches).toBeDefined();
    expect(Array.isArray(result.reconciliationScores?.criticalMismatches)).toBe(true);
  });

  it("handles missing pack gracefully", () => {
    const task = makeTask();
    const evidence = makeEvidence();

    const result = executeReconciliationScorer({
      task,
      evidenceList: [evidence],
    });

    expect(result.status).toBe("completed");
    expect(result.reconciliationScores?.dimensions?.length).toBe(10);
    expect(result.reconciliationScores?.overallHealth).toBeDefined();
  });

  it("assigns status to each dimension", () => {
    const task = makeTask();
    const evidence = makeEvidence();

    const result = executeReconciliationScorer({
      task,
      evidenceList: [evidence],
      pack: apparelPack,
    });

    expect(result.status).toBe("completed");
    result.reconciliationScores?.dimensions?.forEach((dim) => {
      expect(dim.status).toBeDefined();
      const validStatuses = ["matched", "warning", "mismatch", "insufficient_data"];
      expect(validStatuses).toContain(dim.status);
    });
  });

  it("provides details for each dimension", () => {
    const task = makeTask();
    const evidence = makeEvidence();

    const result = executeReconciliationScorer({
      task,
      evidenceList: [evidence],
      pack: apparelPack,
    });

    expect(result.status).toBe("completed");
    result.reconciliationScores?.dimensions?.forEach((dim) => {
      expect(dim.details).toBeDefined();
      expect(dim.details.length).toBeGreaterThan(0);
    });
  });

  it("handles multiple evidence entries", () => {
    const task = makeTask();
    const evidence1 = makeEvidence({ id: "ev-1", subject: "cotton_price", value: 12000 });
    const evidence2 = makeEvidence({ id: "ev-2", subject: "wage_sewer", value: 500 });
    const evidence3 = makeEvidence({ id: "ev-3", subject: "fx_usd_cny", value: 7.2 });

    const result = executeReconciliationScorer({
      task,
      evidenceList: [evidence1, evidence2, evidence3],
      pack: apparelPack,
    });

    expect(result.status).toBe("completed");
    expect(result.reconciliationScores?.dimensions?.length).toBe(10);
    expect(result.reconciliationScores?.overallHealth).toBeGreaterThanOrEqual(0);
  });

  it("scores within valid range for each dimension", () => {
    const task = makeTask();
    const evidence = makeEvidence();

    const result = executeReconciliationScorer({
      task,
      evidenceList: [evidence],
      pack: apparelPack,
    });

    expect(result.status).toBe("completed");
    result.reconciliationScores?.dimensions?.forEach((dim) => {
      expect(dim.score).toBeGreaterThanOrEqual(0);
      expect(dim.score).toBeLessThanOrEqual(100);
    });
  });
});
