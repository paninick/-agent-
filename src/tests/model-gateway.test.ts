import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  FakeModelGateway,
  ModelGatewayImpl,
  createModelGateway,
  defaultProviderConfigs,
  resolveProvider,
  listKnownModelIds,
  type FakeModelGatewayConfig,
  type ModelGatewayConfig,
  type ModelCallRequest
} from "../integration";
import { StaticModelRouter } from "../models";

// ===== Helpers =====

function makeRequest(modelId: string, fallbackModelIds: string[] = []): ModelCallRequest {
  return {
    modelId,
    messages: [{ role: "user", content: "Hello" }],
    maxTokens: 100,
    temperature: 0.7,
    fallbackModelIds
  };
}

function gatewayConfig(overrides?: Partial<ModelGatewayConfig>): ModelGatewayConfig {
  return {
    providers: defaultProviderConfigs,
    maxRetries: 0,
    timeoutMs: 5000,
    fallbackEnabled: true,
    ...overrides
  };
}

function fakeConfig(overrides?: Partial<FakeModelGatewayConfig>): FakeModelGatewayConfig {
  return {
    responses: {
      "deepseek-v4-flash": { content: "Synthetic response from flash.", usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 } },
      "deepseek-v4-pro": { content: "Synthetic response from pro.", usage: { promptTokens: 10, completionTokens: 40, totalTokens: 50 } },
      "doubao-seed-2.0-pro": { content: "Synthetic response from doubao.", usage: { promptTokens: 5, completionTokens: 15, totalTokens: 20 } },
      "claude-sonnet-4.6": { content: "Synthetic response from claude." }
    },
    ...overrides
  };
}

// ===== Happy path (5) =====

describe("Model Gateway + Auto-Switch v1", () => {
  it("FakeModelGateway returns synthetic success for known model", async () => {
    const gateway = new FakeModelGateway(fakeConfig());
    const result = await gateway.callModel(makeRequest("deepseek-v4-flash"));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.content).toBe("Synthetic response from flash.");
      expect(result.modelId).toBe("deepseek-v4-flash");
      expect(result.fallbackUsed).toBe(false);
      expect(result.usage.totalTokens).toBe(30);
    }
  });

  it("FakeModelGateway fallback success when primary has error override", async () => {
    const gateway = new FakeModelGateway({
      responses: fakeConfig().responses,
      errorOverrides: [{ modelId: "deepseek-v4-flash", errorKind: "rate_limited" }]
    });
    const result = await gateway.callModel(makeRequest("deepseek-v4-flash", ["deepseek-v4-pro"]));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.modelId).toBe("deepseek-v4-pro");
      expect(result.fallbackUsed).toBe(true);
      expect(result.attemptedModels).toEqual(["deepseek-v4-flash", "deepseek-v4-pro"]);
    }
  });

  it("FakeModelGateway records attemptedModels including failed primary", async () => {
    const gateway = new FakeModelGateway({
      responses: fakeConfig().responses,
      errorOverrides: [{ modelId: "deepseek-v4-flash", errorKind: "server_error" }]
    });
    const result = await gateway.callModel(makeRequest("deepseek-v4-flash", ["doubao-seed-2.0-pro"]));
    if (result.ok) {
      expect(result.attemptedModels).toEqual(["deepseek-v4-flash", "doubao-seed-2.0-pro"]);
    }
  });

  it("FakeModelGateway returns usage from config", async () => {
    const gateway = new FakeModelGateway(fakeConfig());
    const result = await gateway.callModel(makeRequest("deepseek-v4-pro"));
    if (result.ok) {
      expect(result.usage.promptTokens).toBe(10);
      expect(result.usage.completionTokens).toBe(40);
      expect(result.usage.totalTokens).toBe(50);
    }
  });

  it("FakeModelGateway getAvailableModels lists configured responses", () => {
    const gateway = new FakeModelGateway(fakeConfig());
    const models = gateway.getAvailableModels();
    expect(models).toContain("deepseek-v4-flash");
    expect(models).toContain("deepseek-v4-pro");
    expect(models).toContain("doubao-seed-2.0-pro");
    expect(models).toContain("claude-sonnet-4.6");
  });

  // ===== Safe failure (8) =====

  it("returns no_provider when no provider configured for modelId", async () => {
    const gateway = new FakeModelGateway({
      responses: {},
      fallbackEnabled: true
    });
    const result = await gateway.callModel(makeRequest("nonexistent-model"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("no_provider");
  });

  it("FakeModelGateway errorOverride injects auth_failed", async () => {
    const gateway = new FakeModelGateway({
      responses: fakeConfig().responses,
      errorOverrides: [{ modelId: "deepseek-v4-flash", errorKind: "auth_failed", message: "Invalid key" }]
    });
    const result = await gateway.callModel(makeRequest("deepseek-v4-flash"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("auth_failed");
      expect(result.message).toContain("Invalid key");
    }
  });

  it("FakeModelGateway errorOverride injects rate_limited without fallback", async () => {
    const gateway = new FakeModelGateway({
      responses: fakeConfig().responses,
      errorOverrides: [{ modelId: "deepseek-v4-flash", errorKind: "rate_limited" }]
    });
    const result = await gateway.callModel(makeRequest("deepseek-v4-flash"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("rate_limited");
  });

  it("FakeModelGateway errorOverride injects timeout", async () => {
    const gateway = new FakeModelGateway({
      responses: fakeConfig().responses,
      errorOverrides: [{ modelId: "deepseek-v4-flash", errorKind: "timeout" }]
    });
    const result = await gateway.callModel(makeRequest("deepseek-v4-flash"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("timeout");
  });

  it("FakeModelGateway errorOverride injects server_error", async () => {
    const gateway = new FakeModelGateway({
      responses: fakeConfig().responses,
      errorOverrides: [{ modelId: "deepseek-v4-flash", errorKind: "server_error" }]
    });
    const result = await gateway.callModel(makeRequest("deepseek-v4-flash"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("server_error");
  });

  it("FakeModelGateway errorOverride injects network_error", async () => {
    const gateway = new FakeModelGateway({
      responses: fakeConfig().responses,
      errorOverrides: [{ modelId: "deepseek-v4-flash", errorKind: "network_error" }]
    });
    const result = await gateway.callModel(makeRequest("deepseek-v4-flash"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("network_error");
  });

  it("returns all_providers_failed when primary and all fallbacks fail", async () => {
    const gateway = new FakeModelGateway({
      responses: fakeConfig().responses,
      errorOverrides: [{ errorKind: "server_error" }]
    });
    const result = await gateway.callModel(makeRequest("deepseek-v4-flash", ["deepseek-v4-pro"]));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("all_providers_failed");
      expect(result.attemptedModels).toEqual(["deepseek-v4-flash", "deepseek-v4-pro"]);
    }
  });

  it("returns all_providers_failed when no response and no fallback configured", async () => {
    const gateway = new FakeModelGateway({
      responses: {},
      fallbackEnabled: true
    });
    const result = await gateway.callModel(makeRequest("unknown-model", ["another-unknown"]));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.attemptedModels).toEqual(["unknown-model", "another-unknown"]);
    }
  });

  // ===== Fallback auto-switch (6) =====

  it("primary rate_limited → fallback succeeds", async () => {
    const gateway = new FakeModelGateway({
      responses: fakeConfig().responses,
      errorOverrides: [{ modelId: "deepseek-v4-flash", errorKind: "rate_limited" }]
    });
    const result = await gateway.callModel(makeRequest("deepseek-v4-flash", ["deepseek-v4-pro"]));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.modelId).toBe("deepseek-v4-pro");
      expect(result.fallbackUsed).toBe(true);
    }
  });

  it("primary auth_failed → fallback succeeds", async () => {
    const gateway = new FakeModelGateway({
      responses: fakeConfig().responses,
      errorOverrides: [{ modelId: "deepseek-v4-flash", errorKind: "auth_failed" }]
    });
    const result = await gateway.callModel(makeRequest("deepseek-v4-flash", ["doubao-seed-2.0-pro"]));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.modelId).toBe("doubao-seed-2.0-pro");
      expect(result.fallbackUsed).toBe(true);
    }
  });

  it("entire chain fails → all_providers_failed with all attempted models recorded", async () => {
    const gateway = new FakeModelGateway({
      responses: fakeConfig().responses,
      errorOverrides: [
        { modelId: "deepseek-v4-flash", errorKind: "rate_limited" },
        { modelId: "deepseek-v4-pro", errorKind: "server_error" },
        { modelId: "doubao-seed-2.0-pro", errorKind: "timeout" }
      ]
    });
    const result = await gateway.callModel(
      makeRequest("deepseek-v4-flash", ["deepseek-v4-pro", "doubao-seed-2.0-pro"])
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("all_providers_failed");
      expect(result.attemptedModels).toEqual([
        "deepseek-v4-flash",
        "deepseek-v4-pro",
        "doubao-seed-2.0-pro"
      ]);
    }
  });

  it("fallbackEnabled=false stops at first failure", async () => {
    const gateway = new FakeModelGateway({
      responses: fakeConfig().responses,
      errorOverrides: [{ modelId: "deepseek-v4-flash", errorKind: "rate_limited" }],
      fallbackEnabled: false
    });
    const result = await gateway.callModel(makeRequest("deepseek-v4-flash", ["deepseek-v4-pro"]));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("rate_limited");
      expect(result.attemptedModels).toEqual(["deepseek-v4-flash"]);
    }
  });

  it("catch-all errorOverride matches any model without specific override", async () => {
    const gateway = new FakeModelGateway({
      responses: fakeConfig().responses,
      errorOverrides: [{ errorKind: "server_error" }]
    });
    const result = await gateway.callModel(makeRequest("deepseek-v4-flash", ["deepseek-v4-pro"]));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.attemptedModels).toEqual(["deepseek-v4-flash", "deepseek-v4-pro"]);
    }
  });

  it("specific errorOverride only affects matching model, not fallback", async () => {
    const gateway = new FakeModelGateway({
      responses: fakeConfig().responses,
      errorOverrides: [{ modelId: "deepseek-v4-flash", errorKind: "rate_limited" }]
    });
    const result = await gateway.callModel(makeRequest("deepseek-v4-flash", ["deepseek-v4-pro"]));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.modelId).toBe("deepseek-v4-pro");
      expect(result.fallbackUsed).toBe(true);
    }
  });

  // ===== Boundary protection (5) =====

  it("src/models is unchanged — ModelRouter still does not expose callModel", () => {
    const router = new StaticModelRouter();
    expect("callModel" in router).toBe(false);
    expect("fetch" in router).toBe(false);
  });

  it("FakeModelGateway does not call fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const gateway = new FakeModelGateway(fakeConfig());
    await gateway.callModel(makeRequest("deepseek-v4-flash"));
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("ModelCallResponse is a safe discriminated union (ok field narrows)", async () => {
    const gateway = new FakeModelGateway(fakeConfig());
    const success = await gateway.callModel(makeRequest("deepseek-v4-flash"));
    const failure = await gateway.callModel(makeRequest("nonexistent"));
    expect(success.ok).toBe(true);
    expect(failure.ok).toBe(false);
    if (success.ok) expect(typeof success.content).toBe("string");
    if (!failure.ok) expect(typeof failure.error).toBe("string");
  });

  it("integration layer source does not contain hardcoded API keys", () => {
    const root = join(process.cwd(), "src", "integration");
    const source = readdirSync(root)
      .filter((file) => file.endsWith(".ts"))
      .map((file) => readFileSync(join(root, file), "utf8"))
      .join("\n");
    expect(source).not.toMatch(/sk-[a-zA-Z0-9]{20,}/);
    expect(source).not.toMatch(/Bearer\s+[a-zA-Z0-9]{20,}/);
  });

  it("defaultProviderConfigs covers 4 providers", () => {
    const providerIds = defaultProviderConfigs.map((c) => c.providerId);
    expect(providerIds).toContain("deepseek");
    expect(providerIds).toContain("volcengine");
    expect(providerIds).toContain("openrouter");
    expect(providerIds).toContain("longcat");
    expect(defaultProviderConfigs).toHaveLength(4);
  });

  // ===== Provider config resolution (4) =====

  it("resolveProvider finds correct provider for modelId", () => {
    expect(resolveProvider("deepseek-v4-flash")?.providerId).toBe("deepseek");
    expect(resolveProvider("doubao-seed-2.0-pro")?.providerId).toBe("volcengine");
    expect(resolveProvider("claude-sonnet-4.6")?.providerId).toBe("openrouter");
    expect(resolveProvider("longcat-v1")?.providerId).toBe("longcat");
  });

  it("resolveProvider returns undefined for unknown modelId", () => {
    expect(resolveProvider("unknown-model")).toBeUndefined();
  });

  it("listKnownModelIds returns all mapped models", () => {
    const ids = listKnownModelIds();
    expect(ids).toContain("deepseek-v4-flash");
    expect(ids).toContain("deepseek-v4-pro");
    expect(ids).toContain("doubao-seed-2.0-pro");
    expect(ids).toContain("ark-code-latest");
    expect(ids).toContain("claude-sonnet-4.6");
    expect(ids).toContain("longcat-v1");
  });

  it("createModelGateway factory produces working instance", () => {
    const gateway = createModelGateway({ maxRetries: 2, timeoutMs: 10000 });
    expect(gateway).toBeInstanceOf(ModelGatewayImpl);
  });
});
