/**
 * devils-advocate.test.ts - Devil's Advocate Agent 测试
 *
 * 测试对每个 finding 生成质疑
 */

import { describe, expect, it } from "vitest";
import { executeDevilsAdvocate } from "../intelligence/swarm/agents/devils-advocate";
import type { SwarmTask, AnalysisFinding } from "../intelligence/spine/types";
import type { EvidenceEntry } from "../intelligence/types";

function makeTask(): SwarmTask {
  return {
    id: "task-devil-1",
    triggerId: "trigger-1",
    role: "devils_advocate",
    objective: "test objective",
    status: "running",
    inputs: {},
    createdAt: new Date().toISOString(),
  };
}

function makeFinding(overrides: Partial<AnalysisFinding> = {}): AnalysisFinding {
  return {
    id: "finding-1",
    taskId: "task-analyst-1",
    evidenceIds: ["ev-1"],
    summary: "Cotton price rising",
    confidence: 0.8,
    signals: ["cost_rising", "demand_up"],
    ...overrides,
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
    ...overrides,
  };
}

describe("Devil's Advocate Agent", () => {
  it("handles empty findings list", () => {
    const task = makeTask();
    const result = executeDevilsAdvocate({ task, findings: [], evidenceList: [] });

    expect(result.status).toBe("failed");
    expect(result.error).toBe("no findings to challenge");
  });

  it("generates challenges for each signal", () => {
    const task = makeTask();
    const finding = makeFinding({ signals: ["cost_rising", "demand_up"] });
    const evidence = makeEvidence();

    const result = executeDevilsAdvocate({
      task,
      findings: [finding],
      evidenceList: [evidence],
    });

    expect(result.status).toBe("completed");
    expect(result.challenges).toBeDefined();
    expect(result.challenges?.challenges?.length).toBeGreaterThan(0);
    const signals = result.challenges?.challenges?.map((c) => c.signal);
    expect(signals).toContain("cost_rising");
  });

  it("calculates overall weakness score", () => {
    const task = makeTask();
    const finding = makeFinding();
    const evidence = makeEvidence();

    const result = executeDevilsAdvocate({
      task,
      findings: [finding],
      evidenceList: [evidence],
    });

    expect(result.status).toBe("completed");
    expect(result.challenges?.overallWeakness).toBeDefined();
    expect(result.challenges?.overallWeakness).toBeGreaterThanOrEqual(0);
    expect(result.challenges?.overallWeakness).toBeLessThanOrEqual(1);
  });

  it("generates diverse challenge types", () => {
    const task = makeTask();
    const finding = makeFinding({ signals: ["cost_rising"] });
    const evidence = makeEvidence();

    const result = executeDevilsAdvocate({
      task,
      findings: [finding],
      evidenceList: [evidence],
    });

    expect(result.status).toBe("completed");
    const challengeTypes = result.challenges?.challenges?.map((c) => c.challengeType);
    expect(challengeTypes?.length).toBeGreaterThan(0);
    const validTypes = ["alternative_explanation", "conflicting_evidence", "insufficient_data", "correlation_not_causation"];
    challengeTypes?.forEach((type) => {
      expect(validTypes).toContain(type);
    });
  });

  it("assigns impact scores to challenges", () => {
    const task = makeTask();
    const finding = makeFinding();
    const evidence = makeEvidence();

    const result = executeDevilsAdvocate({
      task,
      findings: [finding],
      evidenceList: [evidence],
    });

    expect(result.status).toBe("completed");
    result.challenges?.challenges?.forEach((challenge) => {
      expect(challenge.impactScore).toBeDefined();
      expect(challenge.impactScore).toBeGreaterThanOrEqual(0);
      expect(challenge.impactScore).toBeLessThanOrEqual(1);
    });
  });

  it("provides alternative explanations", () => {
    const task = makeTask();
    const finding = makeFinding();
    const evidence = makeEvidence();

    const result = executeDevilsAdvocate({
      task,
      findings: [finding],
      evidenceList: [evidence],
    });

    expect(result.status).toBe("completed");
    result.challenges?.challenges?.forEach((challenge) => {
      expect(challenge.alternativeExplanation).toBeDefined();
      expect(challenge.alternativeExplanation.length).toBeGreaterThan(0);
    });
  });

  it("handles multiple findings", () => {
    const task = makeTask();
    const finding1 = makeFinding({ id: "finding-1", signals: ["cost_rising"] });
    const finding2 = makeFinding({ id: "finding-2", signals: ["demand_up"] });
    const evidence = makeEvidence();

    const result = executeDevilsAdvocate({
      task,
      findings: [finding1, finding2],
      evidenceList: [evidence],
    });

    expect(result.status).toBe("completed");
    expect(result.challenges?.challenges?.length).toBeGreaterThan(0);
    const findingIds = result.challenges?.challenges?.map((c) => c.findingId);
    expect(findingIds).toContain("finding-1");
    expect(findingIds).toContain("finding-2");
  });

  it("detects conflicting evidence", () => {
    const task = makeTask();
    const finding = makeFinding({ signals: ["cost_rising"] });
    const evidence1 = makeEvidence({ id: "ev-1", claim: "Price increasing" });
    const evidence2 = makeEvidence({ id: "ev-2", claim: "Price decreasing" });

    const result = executeDevilsAdvocate({
      task,
      findings: [finding],
      evidenceList: [evidence1, evidence2],
    });

    expect(result.status).toBe("completed");
    const conflictChallenges = result.challenges?.challenges?.filter(
      (c) => c.challengeType === "conflicting_evidence"
    );
    expect(conflictChallenges?.length ?? 0).toBeGreaterThan(0);
  });
});
