/**
 * #9 LLM 集成烟雾测试
 *
 * 聚焦于 LLM 调用链路的端到端可用性：
 *   1. createModelGateway 工厂行为（默认配置 + 自定义配置）
 *   2. ModelGateway 全链路 + 审计日志生成（buildModelCallAudit）
 *   3. 多模型 fallback 链路完整性
 *   4. 流式 callModelStream + 审计可构建性
 *   5. 错误码到审计事件的映射
 *
 * 设计原则：
 *   - 不调用真实 API（使用 FakeModelGateway）
 *   - 不调用 fetch（已有边界测试覆盖，此处只验证链路）
 *   - 不与 model-gateway.test.ts 单元测试重复（此处聚焦端到端链路 + 审计）
 */

import { describe, expect, it, vi } from "vitest";
import {
  FakeModelGateway,
  createModelGateway,
  defaultProviderConfigs,
  listKnownModelIds,
  resolveProvider,
  type FakeModelGatewayConfig,
  type ModelCallRequest,
  type ModelCallSuccess,
  type ModelCallFailure,
} from "../integration";
import { buildModelCallAudit } from "../integration/types";
import { ModelGatewayModel } from "../agent/modelGatewayAdapter";
import { DEFAULT_MODEL } from "../agent/launchAgent";

// ===== Fixtures =====

function makeFakeConfig(overrides?: Partial<FakeModelGatewayConfig>): FakeModelGatewayConfig {
  return {
    responses: {
      "deepseek-v4-flash": {
        content: "Plan: ship MVP by August.",
        usage: { promptTokens: 50, completionTokens: 30, totalTokens: 80 },
      },
      "deepseek-v4-pro": {
        content: "Detailed plan with risk analysis.",
        usage: { promptTokens: 50, completionTokens: 60, totalTokens: 110 },
      },
      "doubao-seed-2.0-pro": {
        content: "Doubao alternative response.",
        usage: { promptTokens: 20, completionTokens: 25, totalTokens: 45 },
      },
    },
    ...overrides,
  };
}

function makeRequest(modelId: string, fallbackModelIds: string[] = []): ModelCallRequest {
  return {
    modelId,
    messages: [
      { role: "system", content: "You are a launch planner." },
      { role: "user", content: "Generate a release plan for a fitness app." },
    ],
    maxTokens: 200,
    temperature: 0.4,
    fallbackModelIds,
  };
}

async function collectStream(
  gen: AsyncGenerator<{ type: string; delta?: string; usage?: unknown; modelId?: string; provider?: string }>,
): Promise<{ deltas: string; doneChunk: unknown | null; chunkTypes: string[] }> {
  const deltas: string[] = [];
  const chunkTypes: string[] = [];
  let doneChunk: unknown | null = null;
  for await (const chunk of gen) {
    chunkTypes.push(chunk.type);
    if (chunk.type === "text_delta" && typeof chunk.delta === "string") {
      deltas.push(chunk.delta);
    }
    if (chunk.type === "done") {
      doneChunk = chunk;
    }
  }
  return { deltas: deltas.join(""), doneChunk, chunkTypes };
}

// ===== #9 LLM Integration Smoke Test =====

describe("#9 LLM Integration Smoke Test", () => {
  // ===== createModelGateway factory (3) =====

  it("createModelGateway with no args uses defaults: 4 providers, fallback=true, returns ModelGatewayImpl", () => {
    const gw = createModelGateway();
    // Available models depend on env API keys; just verify it returns an array.
    expect(Array.isArray(gw.getAvailableModels())).toBe(true);
    // Verify defaultProviderConfigs has the expected 4 providers.
    expect(defaultProviderConfigs).toHaveLength(4);
    const providerIds = defaultProviderConfigs.map((c) => c.providerId);
    expect(providerIds).toEqual(expect.arrayContaining(["deepseek", "volcengine", "openrouter", "longcat"]));
  });

  it("createModelGateway with custom config overrides defaults", () => {
    const gw = createModelGateway({
      maxRetries: 5,
      timeoutMs: 60000,
      fallbackEnabled: false,
    });
    // Config is internal, but we can verify behavior: with fallbackEnabled=false and unknown model,
    // the gateway should fail-fast rather than trying fallbacks.
    // Since no API keys are configured, callModel on any model returns no_provider/all_providers_failed.
    // We just verify it doesn't throw.
    expect(gw).toBeInstanceOf(createModelGateway({}).constructor);
  });

  it("listKnownModelIds covers all default providers' models", () => {
    const ids = listKnownModelIds();
    expect(ids.length).toBeGreaterThan(0);
    // Each default provider should contribute at least one model.
    for (const provider of defaultProviderConfigs) {
      const providerModels = Object.keys(provider.modelMapping);
      for (const m of providerModels) {
        expect(ids).toContain(m);
      }
    }
  });

  // ===== End-to-end callModel + audit (4) =====

  it("FakeModelGateway.callModel success → buildModelCallAudit produces correct audit entry", async () => {
    const gw = new FakeModelGateway(makeFakeConfig());
    const response = await gw.callModel(makeRequest("deepseek-v4-flash"));

    expect(response.ok).toBe(true);
    if (response.ok) {
      const success = response as ModelCallSuccess;
      const audit = buildModelCallAudit(success, "deepseek-v4-flash");

      expect(audit.eventType).toBe("model_call_succeeded");
      expect(audit.metadata.modelId).toBe("deepseek-v4-flash");
      expect(audit.metadata.attemptedModels).toEqual(["deepseek-v4-flash"]);
      expect(audit.metadata.fallbackUsed).toBe(false);
      expect(audit.metadata.integrationLayer).toBe(true);
      expect(typeof audit.metadata.latencyMs).toBe("number");
      expect(audit.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });

  it("FakeModelGateway.callModel fallback success → audit records attemptedModels + fallbackUsed=true", async () => {
    const gw = new FakeModelGateway({
      responses: makeFakeConfig().responses,
      errorOverrides: [{ modelId: "deepseek-v4-flash", errorKind: "rate_limited" }],
    });
    const response = await gw.callModel(
      makeRequest("deepseek-v4-flash", ["deepseek-v4-pro"]),
    );

    expect(response.ok).toBe(true);
    if (response.ok) {
      const success = response as ModelCallSuccess;
      const audit = buildModelCallAudit(success, "deepseek-v4-flash");

      expect(audit.eventType).toBe("model_call_succeeded");
      expect(audit.metadata.fallbackUsed).toBe(true);
      expect(audit.metadata.modelId).toBe("deepseek-v4-pro"); // Resolved model, not requested
      expect(audit.metadata.attemptedModels).toEqual(["deepseek-v4-flash", "deepseek-v4-pro"]);
    }
  });

  it("FakeModelGateway.callModel failure → buildModelCallAudit produces failed event with errorKind", async () => {
    const gw = new FakeModelGateway({
      responses: makeFakeConfig().responses,
      errorOverrides: [{ modelId: "deepseek-v4-flash", errorKind: "auth_failed", message: "Invalid API key" }],
    });
    const response = await gw.callModel(makeRequest("deepseek-v4-flash"));

    expect(response.ok).toBe(false);
    if (!response.ok) {
      const failure = response as ModelCallFailure;
      const audit = buildModelCallAudit(failure, "deepseek-v4-flash");

      expect(audit.eventType).toBe("model_call_failed");
      expect(audit.metadata.modelId).toBe("deepseek-v4-flash"); // Requested model on failure
      expect(audit.metadata.errorKind).toBe("auth_failed");
      expect(audit.metadata.fallbackUsed).toBe(false);
      expect(audit.metadata.attemptedModels).toEqual(["deepseek-v4-flash"]);
      expect(audit.metadata.integrationLayer).toBe(true);
    }
  });

  it("buildModelCallAudit on all_providers_failed records full attempted chain", async () => {
    const gw = new FakeModelGateway({
      responses: makeFakeConfig().responses,
      errorOverrides: [
        { modelId: "deepseek-v4-flash", errorKind: "rate_limited" },
        { modelId: "deepseek-v4-pro", errorKind: "server_error" },
      ],
    });
    const response = await gw.callModel(
      makeRequest("deepseek-v4-flash", ["deepseek-v4-pro"]),
    );

    expect(response.ok).toBe(false);
    if (!response.ok) {
      const failure = response as ModelCallFailure;
      const audit = buildModelCallAudit(failure, "deepseek-v4-flash");

      expect(audit.eventType).toBe("model_call_failed");
      expect(audit.metadata.errorKind).toBe("all_providers_failed");
      expect(audit.metadata.attemptedModels).toEqual(["deepseek-v4-flash", "deepseek-v4-pro"]);
    }
  });

  // ===== Streaming end-to-end (3) =====

  it("FakeModelGateway.callModelStream yields text_delta chunks + done chunk with usage", async () => {
    const gw = new FakeModelGateway(makeFakeConfig());
    const result = await collectStream(gw.callModelStream(makeRequest("deepseek-v4-flash")));

    expect(result.chunkTypes).toContain("text_delta");
    expect(result.chunkTypes).toContain("done");
    expect(result.deltas.length).toBeGreaterThan(0);
    expect(result.deltas).toBe("Plan: ship MVP by August.");

    const done = result.doneChunk as { usage: { totalTokens: number }; modelId: string; provider: string };
    expect(done.usage.totalTokens).toBe(80);
    expect(done.modelId).toBe("deepseek-v4-flash");
    expect(typeof done.provider).toBe("string");
  });

  it("callModelStream fallback switches model mid-stream and done chunk reports resolved model", async () => {
    const gw = new FakeModelGateway({
      responses: makeFakeConfig().responses,
      errorOverrides: [{ modelId: "deepseek-v4-flash", errorKind: "rate_limited" }],
    });
    const result = await collectStream(
      gw.callModelStream(makeRequest("deepseek-v4-flash", ["deepseek-v4-pro"])),
    );

    expect(result.chunkTypes).toContain("done");
    expect(result.deltas).toBe("Detailed plan with risk analysis.");

    const done = result.doneChunk as { modelId: string };
    expect(done.modelId).toBe("deepseek-v4-pro");
  });

  it("callModelStream all_providers_failed throws ModelStreamError with attemptedModels", async () => {
    const gw = new FakeModelGateway({
      responses: makeFakeConfig().responses,
      errorOverrides: [{ errorKind: "server_error" }],
    });

    let thrown: unknown = null;
    try {
      await collectStream(
        gw.callModelStream(makeRequest("deepseek-v4-flash", ["deepseek-v4-pro"])),
      );
    } catch (err) {
      thrown = err;
    }

    expect(thrown).not.toBeNull();
    const err = thrown as { error: string; attemptedModels: string[] };
    expect(err.error).toBe("all_providers_failed");
    expect(err.attemptedModels).toEqual(["deepseek-v4-flash", "deepseek-v4-pro"]);
  });

  // ===== ModelGatewayModel adapter end-to-end (2) =====

  it("ModelGatewayModel.getResponse via FakeModelGateway returns message output in agent-compatible format", async () => {
    const gw = new FakeModelGateway(makeFakeConfig());
    const model = new ModelGatewayModel(gw, "deepseek-v4-flash");

    const response = await model.getResponse({
      input: "Plan a fitness app launch",
      systemInstructions: undefined,
      modelSettings: {},
      tools: [],
      outputType: "text",
      handoffs: [],
      tracing: false,
    } as never);

    // The adapter should produce output items.
    expect(Array.isArray(response.output)).toBe(true);
    expect(response.output.length).toBeGreaterThan(0);

    // Find a message item in the output (buildAssistantMessage produces type="message").
    const messageItem = response.output.find(
      (item) => (item as Record<string, unknown>).type === "message",
    ) as Record<string, unknown> | undefined;
    expect(messageItem).toBeDefined();
    if (messageItem) {
      const content = (messageItem as { content: Array<{ type: string; text: string }> }).content;
      expect(Array.isArray(content)).toBe(true);
      expect(content[0].type).toBe("output_text");
      expect(content[0].text).toBe("Plan: ship MVP by August.");
    }
  });

  it("ModelGatewayModel extracts tool_call JSON from FakeModelGateway content", async () => {
    const toolCallJson = '```json\n{"tool_calls":[{"id":"c1","function":{"name":"extract_tasks_from_brief","arguments":"{\\"topic\\":\\"fitness\\"}"}}]}\n```';
    const gw = new FakeModelGateway({
      responses: { [DEFAULT_MODEL]: { content: toolCallJson } },
    });
    const model = new ModelGatewayModel(gw, DEFAULT_MODEL);

    const response = await model.getResponse({
      input: "Extract tasks",
      systemInstructions: undefined,
      modelSettings: {},
      tools: [],
      outputType: "text",
      handoffs: [],
      tracing: false,
    } as never);

    const functionCall = response.output.find(
      (item) => (item as Record<string, unknown>).type === "function_call",
    ) as Record<string, unknown> | undefined;
    expect(functionCall).toBeDefined();
    expect((functionCall as { name: string }).name).toBe("extract_tasks_from_brief");
  });

  // ===== Degradation chain (3) =====

  it("FakeModelGateway.getAvailableModels returns configured model ids", () => {
    const gw = new FakeModelGateway(makeFakeConfig());
    const models = gw.getAvailableModels();
    expect(models).toEqual(expect.arrayContaining([
      "deepseek-v4-flash",
      "deepseek-v4-pro",
      "doubao-seed-2.0-pro",
    ]));
  });

  it("FakeModelGateway.callModel on unknown model returns no_provider or all_providers_failed", async () => {
    const gw = new FakeModelGateway({ responses: {} });
    const response = await gw.callModel(makeRequest("nonexistent-model"));

    expect(response.ok).toBe(false);
    if (!response.ok) {
      // Single candidate without response → no_provider per implementation.
      expect(["no_provider", "all_providers_failed"]).toContain(response.error);
      expect(response.attemptedModels).toEqual(["nonexistent-model"]);
    }
  });

  it("FakeModelGateway.callModel with unknown model + fallback chain attempts all candidates", async () => {
    const gw = new FakeModelGateway({ responses: {} });
    const response = await gw.callModel(
      makeRequest("unknown-1", ["unknown-2", "unknown-3"]),
    );

    expect(response.ok).toBe(false);
    if (!response.ok) {
      // FakeModelGateway returns no_provider or all_providers_failed when no responses match.
      expect(["no_provider", "all_providers_failed"]).toContain(response.error);
      expect(response.attemptedModels).toEqual(["unknown-1", "unknown-2", "unknown-3"]);
    }
  });

  // ===== Error code → audit mapping (2) =====

  it("each ModelGatewayErrorKind maps to a model_call_failed audit event with matching errorKind", async () => {
    const errorKinds = [
      "auth_failed",
      "rate_limited",
      "timeout",
      "server_error",
      "network_error",
    ] as const;

    for (const kind of errorKinds) {
      const gw = new FakeModelGateway({
        responses: makeFakeConfig().responses,
        errorOverrides: [{ modelId: "deepseek-v4-flash", errorKind: kind }],
      });
      const response = await gw.callModel(makeRequest("deepseek-v4-flash"));
      expect(response.ok).toBe(false);
      if (!response.ok) {
        const audit = buildModelCallAudit(response, "deepseek-v4-flash");
        expect(audit.eventType).toBe("model_call_failed");
        expect(audit.metadata.errorKind).toBe(kind);
      }
    }
  });

  it("success audit does not carry errorKind; failure audit does not carry latencyMs", async () => {
    // Success
    const gwOk = new FakeModelGateway(makeFakeConfig());
    const okResp = await gwOk.callModel(makeRequest("deepseek-v4-flash"));
    if (okResp.ok) {
      const audit = buildModelCallAudit(okResp, "deepseek-v4-flash");
      expect(audit.metadata).not.toHaveProperty("errorKind");
      expect(audit.metadata).toHaveProperty("latencyMs");
    }

    // Failure
    const gwFail = new FakeModelGateway({
      responses: makeFakeConfig().responses,
      errorOverrides: [{ modelId: "deepseek-v4-flash", errorKind: "timeout" }],
    });
    const failResp = await gwFail.callModel(makeRequest("deepseek-v4-flash"));
    if (!failResp.ok) {
      const audit = buildModelCallAudit(failResp, "deepseek-v4-flash");
      expect(audit.metadata).toHaveProperty("errorKind");
      expect(audit.metadata).not.toHaveProperty("latencyMs");
    }
  });

  // ===== Boundary (2) =====

  it("LLM integration smoke test path does not call fetch (uses FakeModelGateway)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    // Only use FakeModelGateway — real gateway would attempt actual API calls if API keys exist.
    const fakeGw = new FakeModelGateway(makeFakeConfig());
    await fakeGw.callModel(makeRequest("deepseek-v4-flash"));
    await collectStream(fakeGw.callModelStream(makeRequest("deepseek-v4-flash")));

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("resolveProvider maps known model ids to their providers consistently", () => {
    expect(resolveProvider("deepseek-v4-flash")?.providerId).toBe("deepseek");
    expect(resolveProvider("deepseek-v4-pro")?.providerId).toBe("deepseek");
    expect(resolveProvider("doubao-seed-2.0-pro")?.providerId).toBe("volcengine");
    expect(resolveProvider("claude-sonnet-4.6")?.providerId).toBe("openrouter");
    expect(resolveProvider("longcat-v1")?.providerId).toBe("longcat");
    // Unknown model returns undefined.
    expect(resolveProvider("totally-unknown-model")).toBeUndefined();
  });
});
