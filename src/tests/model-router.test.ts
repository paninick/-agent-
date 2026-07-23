import { describe, expect, it } from "vitest";
import { defaultModelProfiles, StaticModelRouter, type ModelProfile, type ModelSelectionRequest } from "../models";

const baseRequest: ModelSelectionRequest = {
  taskType: "general",
  requiredCapabilities: [],
  complexity: "standard",
  costPreference: "balanced",
  latencyPreference: "balanced",
  privacyLevel: "internal"
};

describe("ModelRouter v1", () => {
  it("selects a low cost fast model for simple classification", () => {
    const result = new StaticModelRouter().selectModel({
      ...baseRequest,
      taskType: "simple_classification",
      requiredCapabilities: ["fast_classification"],
      complexity: "simple",
      costPreference: "minimize",
      latencyPreference: "fast"
    });

    expect(result.ok).toBe(true);
    expect(result.selectedModelId).toBe("deepseek-v4-flash");
    expect(result.estimatedCostTier).toBe("low");
    expect(result.reason).toContain("simple classification");
  });

  it("selects a reasoning model for complex reasoning", () => {
    const result = new StaticModelRouter().selectModel({
      ...baseRequest,
      taskType: "complex_reasoning",
      requiredCapabilities: ["reasoning"],
      complexity: "complex"
    });

    expect(result.ok).toBe(true);
    expect(result.selectedModelId).toBe("doubao-seed-2.0-pro");
    expect(result.reason).toContain("reasoning capability");
  });

  it("selects a coding model for code_task", () => {
    const result = new StaticModelRouter().selectModel({
      ...baseRequest,
      taskType: "code_task",
      requiredCapabilities: ["coding"],
      complexity: "complex"
    });

    expect(result.ok).toBe(true);
    expect(result.selectedModelId).toBe("ark-code-latest");
    expect(result.reason).toContain("coding capability");
  });

  it("selects a long_context model for document_analysis", () => {
    const result = new StaticModelRouter().selectModel({
      ...baseRequest,
      taskType: "document_analysis",
      requiredCapabilities: ["long_context"],
      complexity: "complex"
    });

    expect(result.ok).toBe(true);
    expect(result.selectedModelId).toBe("doubao-seed-2.0-pro");
    expect(result.reason).toContain("long_context capability");
  });

  it("does not select disabled models even when their profile looks attractive", () => {
    const result = new StaticModelRouter().selectModel({
      ...baseRequest,
      taskType: "vision_review",
      requiredCapabilities: ["vision"],
      complexity: "critical",
      costPreference: "minimize",
      latencyPreference: "fast"
    });

    expect(result.ok).toBe(false);
    expect(result.selectedModelId).toBeUndefined();
    expect(result.fallbackModelIds).not.toContain("disabled-vision-reasoner");
  });

  it("returns a safe error when required capabilities are unavailable", () => {
    const result = new StaticModelRouter().selectModel({
      ...baseRequest,
      requiredCapabilities: ["coding", "long_context"]
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("no_model_available");
      expect(result.selectedModelId).toBeUndefined();
      expect(Object.hasOwn(result, "selectedModelId")).toBe(false);
      expect(result.confidence).toBe(0);
    }
  });

  it("returns a queryable fallback chain", () => {
    const chain = new StaticModelRouter().getFallbackChain("ark-code-latest");

    expect(chain).toEqual(["deepseek-v4-flash"]);
    expect(chain).not.toContain("disabled-vision-reasoner");
  });

  it("returns an empty fallback chain for an unknown modelId", () => {
    expect(new StaticModelRouter().getFallbackChain("missing-model")).toEqual([]);
  });

  it("emits a warning for sensitive privacy level", () => {
    const result = new StaticModelRouter().selectModel({
      ...baseRequest,
      requiredCapabilities: ["reasoning"],
      privacyLevel: "sensitive"
    });

    expect(result.ok).toBe(true);
    expect(result.warnings.join(" ")).toContain("Sensitive privacy level");
    expect(result.selectedModelId).toBeDefined();
  });

  it("explains the selected model and fallback chain", () => {
    const router = new StaticModelRouter();
    const request: ModelSelectionRequest = {
      ...baseRequest,
      taskType: "code_task",
      requiredCapabilities: ["coding"],
      complexity: "complex"
    };
    const result = router.selectModel(request);
    const explanation = router.explainSelection(request, result);

    expect(explanation).toContain("selected=ark-code-latest");
    expect(explanation).toContain("taskType=code_task");
    expect(explanation).toContain("fallback=deepseek-v4-flash");
  });

  it("does not expose real API call hooks", () => {
    const router = new StaticModelRouter(defaultModelProfiles);

    expect("callModel" in router).toBe(false);
    expect("fetch" in router).toBe(false);
    expect(defaultModelProfiles.map((profile) => profile.modelId)).toEqual([
      "doubao-seed-2.0-pro",
      "deepseek-v4-flash",
      "ark-code-latest",
      "disabled-vision-reasoner"
    ]);
  });

  it("returns a safe error for an empty model list", () => {
    const result = new StaticModelRouter([]).selectModel({
      ...baseRequest,
      requiredCapabilities: ["reasoning"]
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("no_model_available");
  });

  it("returns a safe error when all matching models are disabled", () => {
    const profiles = defaultModelProfiles.map((profile) => ({ ...profile, enabled: false }));
    const result = new StaticModelRouter(profiles).selectModel({
      ...baseRequest,
      requiredCapabilities: ["reasoning"]
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("no_model_available");
  });

  it("prefers lower cost when models have the same capabilities", () => {
    const result = new StaticModelRouter([
      profile("expensive", "high", "fast"),
      profile("cheap", "low", "slow")
    ]).selectModel({
      ...baseRequest,
      requiredCapabilities: ["structured_output"]
    });

    expect(result.selectedModelId).toBe("cheap");
  });

  it("prefers lower latency when models have the same capabilities and cost", () => {
    const result = new StaticModelRouter([
      profile("normal-latency", "medium", "normal"),
      profile("fast-latency", "medium", "fast")
    ]).selectModel({
      ...baseRequest,
      requiredCapabilities: ["structured_output"]
    });

    expect(result.selectedModelId).toBe("fast-latency");
  });

  it("prefers larger context when score, cost, and latency are tied", () => {
    const result = new StaticModelRouter([
      { ...profile("medium-context", "medium", "normal"), contextWindowTier: "medium" },
      { ...profile("large-context", "medium", "normal"), contextWindowTier: "large" }
    ]).selectModel({
      ...baseRequest,
      requiredCapabilities: ["structured_output"]
    });

    expect(result.selectedModelId).toBe("large-context");
  });

  it("uses profile order as the final deterministic tie-break", () => {
    const result = new StaticModelRouter([
      profile("first-profile", "medium", "normal"),
      profile("second-profile", "medium", "normal")
    ]).selectModel({
      ...baseRequest,
      requiredCapabilities: ["structured_output"]
    });

    expect(result.selectedModelId).toBe("first-profile");
  });

  it("skips disabled fallback models", () => {
    const profiles: ModelProfile[] = [
      { ...profile("primary", "medium", "normal"), fallbackModelIds: ["disabled-fallback", "active-fallback"] },
      { ...profile("disabled-fallback", "low", "fast"), enabled: false },
      profile("active-fallback", "low", "fast")
    ];

    expect(new StaticModelRouter(profiles).getFallbackChain("primary")).toEqual(["active-fallback"]);
  });

  it("ignores missing fallback models without crashing", () => {
    const profiles: ModelProfile[] = [{ ...profile("primary", "medium", "normal"), fallbackModelIds: ["missing-fallback"] }];

    expect(new StaticModelRouter(profiles).getFallbackChain("primary")).toEqual([]);
  });

  it("handles fallback loops without infinite recursion or duplicate entries", () => {
    const profiles: ModelProfile[] = [
      { ...profile("a", "medium", "normal"), fallbackModelIds: ["b"] },
      { ...profile("b", "medium", "normal"), fallbackModelIds: ["c", "a"] },
      { ...profile("c", "medium", "normal"), fallbackModelIds: ["b"] }
    ];

    expect(new StaticModelRouter(profiles).getFallbackChain("a")).toEqual(["b", "c"]);
  });

  it("deduplicates fallback chains while preserving first-seen order", () => {
    const profiles: ModelProfile[] = [
      { ...profile("primary", "medium", "normal"), fallbackModelIds: ["a", "b", "a"] },
      { ...profile("a", "medium", "normal"), fallbackModelIds: ["b"] },
      profile("b", "medium", "normal")
    ];

    expect(new StaticModelRouter(profiles).getFallbackChain("primary")).toEqual(["a", "b"]);
  });

  it("does not select a model when any required capability is missing", () => {
    const result = new StaticModelRouter([profile("structured-only", "low", "fast")]).selectModel({
      ...baseRequest,
      requiredCapabilities: ["structured_output", "tool_calling"]
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("no_model_available");
  });
});

function profile(modelId: string, costTier: ModelProfile["costTier"], latencyTier: ModelProfile["latencyTier"]): ModelProfile {
  return {
    modelId,
    provider: "test",
    capabilities: ["structured_output"],
    costTier,
    latencyTier,
    contextWindowTier: "medium",
    defaultFor: [],
    fallbackModelIds: [],
    enabled: true
  };
}
