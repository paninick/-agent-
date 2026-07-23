import { describe, expect, it } from "vitest";
import { FakeModelGateway } from "../integration";
import { StaticModelRouter, type ModelProfile, type ModelSelectionRequest } from "../models";
import { launchDeskSelectionRequest, selectModelForLaunchDesk } from "../agent/modelRouterIntegration";

function request(overrides: Partial<ModelSelectionRequest> = {}): ModelSelectionRequest {
  return {
    taskType: "release_planning",
    requiredCapabilities: ["reasoning", "structured_output"],
    complexity: "standard",
    costPreference: "balanced",
    latencyPreference: "balanced",
    privacyLevel: "internal",
    ...overrides,
  };
}

function profile(modelId: string, fallbackModelIds: string[] = []): ModelProfile {
  return {
    modelId,
    provider: "test",
    capabilities: ["reasoning", "structured_output"],
    costTier: "medium",
    latencyTier: "normal",
    contextWindowTier: "medium",
    defaultFor: ["release_planning"],
    fallbackModelIds,
    enabled: true,
  };
}

describe("P7 ModelRouter Launch Desk Integration", () => {
  it("uses the router-selected model when it is available in the gateway", () => {
    const router = new StaticModelRouter([
      profile("primary", ["fallback"]),
      profile("fallback"),
    ]);
    const gateway = new FakeModelGateway({
      responses: {
        primary: { content: "primary" },
        fallback: { content: "fallback" },
      },
    });

    const result = selectModelForLaunchDesk(router, gateway, request(), "sdk-default");

    expect(result.ok).toBe(true);
    expect(result.modelId).toBe("primary");
    expect(result.fallbackModelIds).toEqual(["fallback"]);
    expect(result.availableModelIds.sort()).toEqual(["fallback", "primary"]);
  });

  it("falls back to the first available gateway model when router choice is unavailable", () => {
    const router = new StaticModelRouter([
      profile("primary", ["fallback"]),
      profile("fallback"),
    ]);
    const gateway = new FakeModelGateway({
      responses: {
        fallback: { content: "fallback" },
      },
    });

    const result = selectModelForLaunchDesk(router, gateway, request(), "sdk-default");

    expect(result.ok).toBe(false);
    expect(result.modelId).toBe("fallback");
    expect(result.fallbackModelIds).toEqual([]);
    expect(result.reason).toContain("not available");
  });

  it("returns SDK default path when the gateway has no available models", () => {
    const router = new StaticModelRouter([profile("primary")]);
    const gateway = new FakeModelGateway({ responses: {} });

    const result = selectModelForLaunchDesk(router, gateway, request(), "sdk-default");

    expect(result.ok).toBe(false);
    expect(result.modelId).toBe("sdk-default");
    expect(result.fallbackModelIds).toEqual([]);
    expect(result.availableModelIds).toEqual([]);
  });

  it("caps gateway fallback chain to three available models", () => {
    const router = new StaticModelRouter([
      profile("unavailable"),
    ]);
    const gateway = new FakeModelGateway({
      responses: {
        a: { content: "a" },
        b: { content: "b" },
        c: { content: "c" },
        d: { content: "d" },
        e: { content: "e" },
      },
    });

    const result = selectModelForLaunchDesk(router, gateway, request(), "sdk-default");

    expect(result.modelId).toBe("a");
    expect(result.fallbackModelIds).toEqual(["b", "c", "d"]);
  });

  it("launchDeskSelectionRequest preserves the documented task routing request", () => {
    expect(launchDeskSelectionRequest()).toMatchObject({
      taskType: "release_planning",
      requiredCapabilities: ["structured_output", "reasoning"],
      complexity: "standard",
      costPreference: "balanced",
      latencyPreference: "balanced",
      privacyLevel: "internal",
    });
  });
});
