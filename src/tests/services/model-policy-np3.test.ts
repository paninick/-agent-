import { describe, expect, it } from "vitest";
import { scoreModel } from "../../models/modelPolicy";
import { defaultModelProfiles } from "../../models/modelProfiles";
import type { ModelProfile, ModelSelectionRequest } from "../../models/types";

const baseRequest: ModelSelectionRequest = {
  taskType: "general",
  requiredCapabilities: [],
  complexity: "standard",
  costPreference: "balanced",
  latencyPreference: "balanced",
  privacyLevel: "internal",
};

function numericProfile(overrides: Partial<ModelProfile> = {}): ModelProfile {
  return {
    modelId: "test-model",
    provider: "test",
    capabilities: ["reasoning", "structured_output"],
    costTier: "medium",
    latencyTier: "normal",
    contextWindowTier: "medium",
    defaultFor: [],
    fallbackModelIds: [],
    enabled: true,
    qualityScore: 0.8,
    reliabilityScore: 0.85,
    latencyScore: 0.7,
    inputCostPer1k: 0.002,
    outputCostPer1k: 0.006,
    contextWindow: 64000,
    ...overrides,
  };
}

describe("NP3 Multi-Factor Scoring", () => {
  it("adds NP3 bonus when numeric score fields are present", () => {
    const profile = numericProfile();
    const result = scoreModel(profile, baseRequest);

    // Without numeric fields, base score for no required caps, no match = 0.
    // With numeric fields, NP3 bonus should be > 0, so score > 0.
    expect(result.score).toBeGreaterThan(0);
    expect(result.reasons.some((r) => r.includes("NP3 multi-factor"))).toBe(true);
  });

  it("does not add NP3 bonus when numeric fields are absent (backward compatible)", () => {
    const profile: ModelProfile = {
      modelId: "qualitative-only",
      provider: "test",
      capabilities: ["structured_output"],
      costTier: "medium",
      latencyTier: "normal",
      contextWindowTier: "medium",
      defaultFor: [],
      fallbackModelIds: [],
      enabled: true,
    };
    const result = scoreModel(profile, baseRequest);

    // No required caps, no taskType match -> base score is 0, no NP3 bonus.
    expect(result.score).toBe(0);
    expect(result.reasons.some((r) => r.includes("NP3"))).toBe(false);
  });

  it("higher quality model scores higher than lower quality model", () => {
    const highQuality = numericProfile({ modelId: "high-q", qualityScore: 0.95 });
    const lowQuality = numericProfile({ modelId: "low-q", qualityScore: 0.5 });

    const highResult = scoreModel(highQuality, baseRequest);
    const lowResult = scoreModel(lowQuality, baseRequest);

    expect(highResult.score).toBeGreaterThan(lowResult.score);
  });

  it("cheaper model gets higher costEfficiency sub-score", () => {
    const cheap = numericProfile({
      modelId: "cheap",
      inputCostPer1k: 0.0003,
      outputCostPer1k: 0.0008,
    });
    const expensive = numericProfile({
      modelId: "expensive",
      inputCostPer1k: 0.01,
      outputCostPer1k: 0.03,
    });

    const cheapResult = scoreModel(cheap, baseRequest);
    const expensiveResult = scoreModel(expensive, baseRequest);

    // Both have same quality/reliability/latency, but cheap has better costEfficiency.
    expect(cheapResult.score).toBeGreaterThan(expensiveResult.score);
  });

  it("preferred model (defaultFor includes taskType) gets preferredBoost", () => {
    const preferred = numericProfile({
      modelId: "preferred",
      defaultFor: ["research"],
    });
    const notPreferred = numericProfile({
      modelId: "not-preferred",
      defaultFor: [],
    });

    const request: ModelSelectionRequest = {
      ...baseRequest,
      taskType: "research",
    };

    const preferredResult = scoreModel(preferred, request);
    const notPreferredResult = scoreModel(notPreferred, request);

    expect(preferredResult.score).toBeGreaterThan(notPreferredResult.score);
    // The preferred model's reason should include "preferred".
    expect(preferredResult.reasons.some((r) => r.includes("preferred"))).toBe(true);
  });

  it("critical complexity requires larger context window for full contextFit", () => {
    const largeContext = numericProfile({
      modelId: "large-ctx",
      contextWindow: 256000,
    });
    const smallContext = numericProfile({
      modelId: "small-ctx",
      contextWindow: 8000,
    });

    const request: ModelSelectionRequest = {
      ...baseRequest,
      complexity: "critical",
    };

    const largeResult = scoreModel(largeContext, request);
    const smallResult = scoreModel(smallContext, request);

    expect(largeResult.score).toBeGreaterThan(smallResult.score);
  });

  it("taskFit is higher when profile capabilities match task type", () => {
    const codingModel = numericProfile({
      modelId: "coder",
      capabilities: ["coding", "structured_output"],
      defaultFor: ["code_task"],
    });
    const nonCodingModel = numericProfile({
      modelId: "non-coder",
      capabilities: ["reasoning", "structured_output"],
      defaultFor: ["research"],
    });

    const request: ModelSelectionRequest = {
      ...baseRequest,
      taskType: "code_task",
    };

    const codingResult = scoreModel(codingModel, request);
    const nonCodingResult = scoreModel(nonCodingModel, request);

    expect(codingResult.score).toBeGreaterThan(nonCodingResult.score);
  });

  it("NP3 bonus reason string contains all 6 factor abbreviations", () => {
    const profile = numericProfile();
    const result = scoreModel(profile, baseRequest);
    const np3Reason = result.reasons.find((r) => r.includes("NP3 multi-factor"));

    expect(np3Reason).toBeDefined();
    if (np3Reason) {
      expect(np3Reason).toContain("q=");
      expect(np3Reason).toContain("fit=");
      expect(np3Reason).toContain("rel=");
      expect(np3Reason).toContain("cost=");
      expect(np3Reason).toContain("lat=");
      expect(np3Reason).toContain("ctx=");
    }
  });

  it("falls back to qualitative costEfficiency when pricing data absent but numeric scores present", () => {
    const profile = numericProfile({
      modelId: "no-pricing",
      inputCostPer1k: undefined,
      outputCostPer1k: undefined,
      costTier: "low",
    });

    const result = scoreModel(profile, baseRequest);

    // Should still get an NP3 bonus (quality/reliability/latency present),
    // with costEfficiency falling back to costTier="low" -> 0.9.
    expect(result.score).toBeGreaterThan(0);
    expect(result.reasons.some((r) => r.includes("NP3 multi-factor"))).toBe(true);
  });
});

describe("NP3 scoring with real defaultModelProfiles", () => {
  it("all enabled production profiles produce NP3 multi-factor bonus", () => {
    const enabled = defaultModelProfiles.filter((p: ModelProfile) => p.enabled);

    for (const profile of enabled) {
      const result = scoreModel(profile, baseRequest);
      expect(result.score).toBeGreaterThan(0);
      expect(result.reasons.some((r) => r.includes("NP3 multi-factor"))).toBe(true);
    }
  });

  it("doubao-seed-2.0-pro outscores deepseek-v4-flash for complex reasoning (higher quality)", () => {
    const doubao = defaultModelProfiles.find((p: ModelProfile) => p.modelId === "doubao-seed-2.0-pro")!;
    const deepseek = defaultModelProfiles.find((p: ModelProfile) => p.modelId === "deepseek-v4-flash")!;

    const request: ModelSelectionRequest = {
      ...baseRequest,
      taskType: "complex_reasoning",
      requiredCapabilities: ["reasoning"],
      complexity: "complex",
    };

    const doubaoResult = scoreModel(doubao, request);
    const deepseekResult = scoreModel(deepseek, request);

    // Both match required capabilities (base +100), both have reasoning for complex (+35),
    // but doubao has higher qualityScore (0.9 vs 0.72) and is defaultFor complex_reasoning (preferredBoost).
    expect(doubaoResult.score).toBeGreaterThan(deepseekResult.score);
  });

  it("deepseek-v4-flash gets higher costEfficiency than doubao (cheaper per token)", () => {
    const doubao = defaultModelProfiles.find((p: ModelProfile) => p.modelId === "doubao-seed-2.0-pro")!;
    const deepseek = defaultModelProfiles.find((p: ModelProfile) => p.modelId === "deepseek-v4-flash")!;

    // Parse the NP3 reason string to extract cost= factor value
    const doubaoResult = scoreModel(doubao, baseRequest);
    const deepseekResult = scoreModel(deepseek, baseRequest);

    const extractFactor = (reason: string, factor: string): number => {
      const match = reason.match(new RegExp(`${factor}=([\\d.]+)`));
      return match ? parseFloat(match[1]) : -1;
    };

    const doubaoReason = doubaoResult.reasons.find((r) => r.includes("NP3 multi-factor")) ?? "";
    const deepseekReason = deepseekResult.reasons.find((r) => r.includes("NP3 multi-factor")) ?? "";

    const doubaoCost = extractFactor(doubaoReason, "cost");
    const deepseekCost = extractFactor(deepseekReason, "cost");

    // deepseek ($0.0003/1k in) should have higher costEfficiency than doubao ($0.004/1k in)
    expect(deepseekCost).toBeGreaterThan(doubaoCost);
  });
});
