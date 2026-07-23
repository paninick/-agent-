/**
 * adjudicator.test.ts - Adjudicator Agent 测试
 *
 * 测试对 finding 的最终裁决
 */

import { describe, expect, it } from "vitest";
import { executeAdjudicator } from "../intelligence/swarm/agents/adjudicator";
import type { SwarmTask, AnalysisFinding, DevilsAdvocateOutput } from "../intelligence/spine/types";
import type { EvidenceEntry } from "../intelligence/types";

function makeTask(): SwarmTask {
  return {
    id: "task-judge-1",
    triggerId: "trigger-1",
    role: "adjudicator",
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
    signals: ["cost_rising"],
    ...overrides,
  };
}

function makeChallenges(overrides: Partial<DevilsAdvocateOutput> = {}): DevilsAdvocateOutput {
  return {
    challenges: [
      {
        findingId: "finding-1",
        signal: "cost_rising",
        challengeType: "alternative_explanation",
        counterEvidence: [],
        alternativeExplanation: "Could be seasonal fluctuation",
        impactScore: 0.3,
      },
    ],
    overallWeakness: 0.3,
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

describe("Adjudicator Agent", () => {
  it("handles empty findings list", () => {
    const task = makeTask();
    const result = executeAdjudicator({
      task,
      findings: [],
      challenges: makeChallenges(),
      evidenceList: [],
    });

    expect(result.status).toBe("failed");
    expect(result.error).toBe("no findings to adjudicate");
  });

  it("upholds findings with low-impact challenges", () => {
    const task = makeTask();
    const finding = makeFinding({ confidence: 0.8 });
    const challenges = makeChallenges({
      challenges: [
        {
          findingId: "finding-1",
          signal: "cost_rising",
          challengeType: "alternative_explanation",
          counterEvidence: [],
          alternativeExplanation: "Minor concern",
          impactScore: 0.2,
        },
      ],
    });
    const evidence = makeEvidence();

    const result = executeAdjudicator({
      task,
      findings: [finding],
      challenges,
      evidenceList: [evidence],
    });

    expect(result.status).toBe("completed");
    expect(result.verdict).toBeDefined();
    expect(result.verdict?.verdicts.length).toBe(1);
    const verdict = result.verdict?.verdicts[0];
    expect(verdict?.decision).toBe("upheld");
    // Adjusted confidence should be close to original
    expect(verdict?.adjustedConfidence).toBeGreaterThanOrEqual(0.7);
  });

  it("modifies findings with moderate-impact challenges", () => {
    const task = makeTask();
    const finding = makeFinding({ confidence: 0.8 });
    const challenges = makeChallenges({
      challenges: [
        {
          findingId: "finding-1",
          signal: "cost_rising",
          challengeType: "alternative_explanation",
          counterEvidence: [],
          alternativeExplanation: "Significant concern",
          impactScore: 0.5,
        },
      ],
    });
    const evidence = makeEvidence();

    const result = executeAdjudicator({
      task,
      findings: [finding],
      challenges,
      evidenceList: [evidence],
    });

    expect(result.status).toBe("completed");
    const verdict = result.verdict?.verdicts[0];
    expect(verdict?.decision).toBe("modified");
    // Adjusted confidence should be reduced
    expect(verdict?.adjustedConfidence).toBeLessThan(0.8);
    expect(verdict?.adjustedConfidence).toBeGreaterThan(0);
  });

  it("rejects findings with high-impact challenges", () => {
    const task = makeTask();
    const finding = makeFinding({ confidence: 0.8 });
    const challenges = makeChallenges({
      challenges: [
        {
          findingId: "finding-1",
          signal: "cost_rising",
          challengeType: "conflicting_evidence",
          counterEvidence: ["Strong conflicting data"],
          alternativeExplanation: "Strong conflicting evidence",
          impactScore: 0.8,
        },
      ],
    });
    const evidence = makeEvidence();

    const result = executeAdjudicator({
      task,
      findings: [finding],
      challenges,
      evidenceList: [evidence],
    });

    expect(result.status).toBe("completed");
    const verdict = result.verdict?.verdicts[0];
    expect(verdict?.decision).toBe("rejected");
    // Adjusted confidence should be near zero
    expect(verdict?.adjustedConfidence).toBeLessThan(0.2);
  });

  it("calculates overall verdict", () => {
    const task = makeTask();
    const finding1 = makeFinding({ id: "finding-1", signals: ["cost_rising"] });
    const finding2 = makeFinding({ id: "finding-2", signals: ["demand_up"] });
    const challenges = makeChallenges({
      challenges: [
        {
          findingId: "finding-1",
          signal: "cost_rising",
          challengeType: "alternative_explanation",
          counterEvidence: [],
          alternativeExplanation: "Minor",
          impactScore: 0.2,
        },
        {
          findingId: "finding-2",
          signal: "demand_up",
          challengeType: "alternative_explanation",
          counterEvidence: [],
          alternativeExplanation: "Minor",
          impactScore: 0.2,
        },
      ],
    });
    const evidence = makeEvidence();

    const result = executeAdjudicator({
      task,
      findings: [finding1, finding2],
      challenges,
      evidenceList: [evidence],
    });

    expect(result.status).toBe("completed");
    expect(result.verdict?.overallVerdict).toBeDefined();
    const validVerdicts = ["strong", "moderate", "weak", "insufficient"];
    expect(validVerdicts).toContain(result.verdict?.overallVerdict);
  });

  it("provides reasoning for each verdict", () => {
    const task = makeTask();
    const finding = makeFinding();
    const challenges = makeChallenges();
    const evidence = makeEvidence();

    const result = executeAdjudicator({
      task,
      findings: [finding],
      challenges,
      evidenceList: [evidence],
    });

    expect(result.status).toBe("completed");
    result.verdict?.verdicts.forEach((verdict) => {
      expect(verdict.reasoning).toBeDefined();
      expect(verdict.reasoning.length).toBeGreaterThan(0);
    });
  });

  it("preserves original confidence in verdict", () => {
    const task = makeTask();
    const finding = makeFinding({ confidence: 0.85 });
    const challenges = makeChallenges();
    const evidence = makeEvidence();

    const result = executeAdjudicator({
      task,
      findings: [finding],
      challenges,
      evidenceList: [evidence],
    });

    expect(result.status).toBe("completed");
    const verdict = result.verdict?.verdicts[0];
    expect(verdict?.originalConfidence).toBe(0.85);
    expect(verdict?.adjustedConfidence).toBeDefined();
  });

  it("handles missing challenges gracefully", () => {
    const task = makeTask();
    const finding = makeFinding();
    const evidence = makeEvidence();

    const result = executeAdjudicator({
      task,
      findings: [finding],
      challenges: undefined,
      evidenceList: [evidence],
    });

    expect(result.status).toBe("completed");
    const verdict = result.verdict?.verdicts[0];
    // Should uphold with no challenges
    expect(verdict?.decision).toBe("upheld");
    expect(verdict?.adjustedConfidence).toBe(0.8);
  });
});
