import { describe, expect, it, vi } from "vitest";
import { FakeModelGateway, type FakeModelGatewayConfig } from "../integration";
import { ModelGatewayImpl, createModelGateway } from "../integration";
import { defaultProviderConfigs } from "../integration";
import type { ModelStreamChunk } from "../integration";

// ===== Fixtures =====

function fakeConfig(responses: Record<string, { content: string }>): FakeModelGatewayConfig {
  return { responses } as FakeModelGatewayConfig;
}

function makeFakeGateway(responses: Record<string, { content: string }> = {}): FakeModelGateway {
  return new FakeModelGateway(fakeConfig(responses));
}

async function collectChunks(gen: AsyncGenerator<ModelStreamChunk>): Promise<ModelStreamChunk[]> {
  const chunks: ModelStreamChunk[] = [];
  for await (const chunk of gen) chunks.push(chunk);
  return chunks;
}

// ===== FakeModelGateway.callModelStream (8) =====

describe("P6 ModelGateway Streaming — FakeModelGateway", () => {
  it("yields text_delta chunks followed by a done chunk", async () => {
    const gw = makeFakeGateway({ "test-model": { content: "Hello world from model" } });
    const chunks = await collectChunks(
      gw.callModelStream({ modelId: "test-model", messages: [{ role: "user", content: "hi" }] })
    );

    const textDeltas = chunks.filter((c) => c.type === "text_delta");
    const done = chunks.find((c) => c.type === "done");
    expect(textDeltas.length).toBeGreaterThanOrEqual(1);
    expect(done).toBeDefined();
    if (done && done.type === "done") {
      expect(done.modelId).toBe("test-model");
      expect(done.provider).toBe("fake");
    }
  });

  it("reassembled text matches the configured content", async () => {
    const content = "The quick brown fox jumps over the lazy dog.";
    const gw = makeFakeGateway({ "m": { content } });
    const chunks = await collectChunks(
      gw.callModelStream({ modelId: "m", messages: [{ role: "user", content: "hi" }] })
    );
    const reassembled = chunks
      .filter((c) => c.type === "text_delta")
      .map((c) => (c as { delta: string }).delta)
      .join("");
    expect(reassembled).toBe(content);
  });

  it("handles empty content with a done chunk only", async () => {
    const gw = makeFakeGateway({ "empty": { content: "" } });
    const chunks = await collectChunks(
      gw.callModelStream({ modelId: "empty", messages: [{ role: "user", content: "hi" }] })
    );
    const textDeltas = chunks.filter((c) => c.type === "text_delta");
    const done = chunks.find((c) => c.type === "done");
    expect(textDeltas).toHaveLength(0);
    expect(done).toBeDefined();
  });

  it("throws on errorOverride match (primary, no fallback)", async () => {
    const gw = new FakeModelGateway({
      responses: {},
      errorOverrides: [{ errorKind: "rate_limited", message: "throttled" }],
    });
    await expect(
      collectChunks(gw.callModelStream({ modelId: "any", messages: [{ role: "user", content: "hi" }] }))
    ).rejects.toThrow();
  });

  it("falls back to next candidate on errorOverride", async () => {
    const gw = new FakeModelGateway({
      responses: { "good": { content: "ok" } },
      errorOverrides: [{ modelId: "bad", errorKind: "server_error" }],
    });
    const chunks = await collectChunks(
      gw.callModelStream({
        modelId: "bad",
        fallbackModelIds: ["good"],
        messages: [{ role: "user", content: "hi" }],
      })
    );
    const done = chunks.find((c) => c.type === "done");
    expect(done).toBeDefined();
    if (done && done.type === "done") expect(done.modelId).toBe("good");
  });

  it("throws all_providers_failed when all candidates error", async () => {
    const gw = new FakeModelGateway({
      responses: {},
      errorOverrides: [{ errorKind: "server_error" }],
    });
    await expect(
      collectChunks(
        gw.callModelStream({
          modelId: "a",
          fallbackModelIds: ["b"],
          messages: [{ role: "user", content: "hi" }],
        })
      )
    ).rejects.toThrow();
  });

  it("throws no_provider when no response configured and no fallback", async () => {
    const gw = makeFakeGateway({});
    await expect(
      collectChunks(gw.callModelStream({ modelId: "missing", messages: [{ role: "user", content: "hi" }] }))
    ).rejects.toThrow();
  });

  it("FakeModelGateway.callModelStream does not call fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const gw = makeFakeGateway({ "m": { content: "hi" } });
    await collectChunks(gw.callModelStream({ modelId: "m", messages: [{ role: "user", content: "hi" }] }));
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  // ===== ModelGatewayImpl.callModelStream (4) =====

  it("parses SSE stream from real fetch and yields text_delta + done", async () => {
    const sseBody = [
      'data: {"choices":[{"delta":{"content":"Hello"}}]}',
      "",
      'data: {"choices":[{"delta":{"content":" world"}}]}',
      "",
      'data: {"choices":[],"usage":{"prompt_tokens":5,"completion_tokens":2,"total_tokens":7}}',
      "",
      "data: [DONE]",
      "",
    ].join("\n");

    const mockResponse = {
      ok: true,
      body: new readableStreamMock(sseBody),
    };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse as unknown as Response);

    const gw = createModelGateway({
      providers: [{
        providerId: "test",
        baseUrl: "https://test.example/v1/chat/completions",
        apiKeyEnv: "TEST_KEY",
        modelMapping: { "test-model": "test-model" },
      }],
    });

    process.env.TEST_KEY = "sk-test";
    const chunks = await collectChunks(
      gw.callModelStream({ modelId: "test-model", messages: [{ role: "user", content: "hi" }] })
    );

    const textDeltas = chunks.filter((c) => c.type === "text_delta");
    const done = chunks.find((c) => c.type === "done");
    expect(textDeltas).toHaveLength(2);
    if (textDeltas[0].type === "text_delta") expect(textDeltas[0].delta).toBe("Hello");
    if (textDeltas[1].type === "text_delta") expect(textDeltas[1].delta).toBe(" world");
    expect(done).toBeDefined();
    if (done && done.type === "done") {
      expect(done.usage.totalTokens).toBe(7);
      expect(done.provider).toBe("test");
    }

    delete process.env.TEST_KEY;
    fetchSpy.mockRestore();
  });

  it("throws on HTTP error response", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
    } as unknown as Response);

    const gw = createModelGateway({
      providers: [{
        providerId: "test",
        baseUrl: "https://test.example/v1/chat/completions",
        apiKeyEnv: "TEST_KEY2",
        modelMapping: { "m": "m" },
      }],
    });
    process.env.TEST_KEY2 = "sk-test";

    await expect(
      collectChunks(gw.callModelStream({ modelId: "m", messages: [{ role: "user", content: "hi" }] }))
    ).rejects.toThrow();

    delete process.env.TEST_KEY2;
    fetchSpy.mockRestore();
  });

  it("throws on network error (fetch rejects)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));

    const gw = createModelGateway({
      providers: [{
        providerId: "test",
        baseUrl: "https://test.example/v1/chat/completions",
        apiKeyEnv: "TEST_KEY3",
        modelMapping: { "m": "m" },
      }],
    });
    process.env.TEST_KEY3 = "sk-test";

    await expect(
      collectChunks(gw.callModelStream({ modelId: "m", messages: [{ role: "user", content: "hi" }] }))
    ).rejects.toThrow();

    delete process.env.TEST_KEY3;
    fetchSpy.mockRestore();
  });

  it("falls back to next provider on server_error", async () => {
    // First call returns 500, second call returns a valid SSE stream
    const sseBody = [
      'data: {"choices":[{"delta":{"content":"recovered"}}]}',
      "",
      'data: {"choices":[],"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}',
      "",
      "data: [DONE]",
      "",
    ].join("\n");

    let callCount = 0;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return { ok: false, status: 500, text: async () => "Internal error" } as unknown as Response;
      }
      return { ok: true, body: new readableStreamMock(sseBody) } as unknown as Response;
    });

    const gw = createModelGateway({
      providers: [{
        providerId: "test",
        baseUrl: "https://test.example/v1/chat/completions",
        apiKeyEnv: "TEST_KEY4",
        modelMapping: { "primary": "primary", "fallback": "fallback" },
      }],
      fallbackEnabled: true,
    });
    process.env.TEST_KEY4 = "sk-test";

    const chunks = await collectChunks(
      gw.callModelStream({
        modelId: "primary",
        fallbackModelIds: ["fallback"],
        messages: [{ role: "user", content: "hi" }],
      })
    );

    const done = chunks.find((c) => c.type === "done");
    expect(done).toBeDefined();
    if (done && done.type === "done") expect(done.modelId).toBe("fallback");

    delete process.env.TEST_KEY4;
    fetchSpy.mockRestore();
  });

  // ===== Boundary (2) =====

  it("callModel (non-streaming) still works alongside callModelStream", async () => {
    const gw = makeFakeGateway({ "m": { content: "hello" } });
    const result = await gw.callModel({ modelId: "m", messages: [{ role: "user", content: "hi" }] });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.content).toBe("hello");
  });

  it("defaultProviderConfigs has 4 providers", () => {
    expect(defaultProviderConfigs).toHaveLength(4);
    expect(defaultProviderConfigs.map((p) => p.providerId).sort()).toEqual(
      ["deepseek", "longcat", "openrouter", "volcengine"]
    );
  });
});

// ===== Helper: mock ReadableStream from a string =====

class readableStreamMock {
  private encoder = new TextEncoder();
  private chunks: Uint8Array[];
  private index = 0;

  constructor(content: string) {
    // Split into a few chunks to simulate streaming
    const half = Math.ceil(content.length / 2);
    this.chunks = [
      this.encoder.encode(content.slice(0, half)),
      this.encoder.encode(content.slice(half)),
    ];
  }

  getReader() {
    return {
      read: async () => {
        if (this.index >= this.chunks.length) return { done: true, value: undefined };
        return { done: false, value: this.chunks[this.index++] };
      },
      releaseLock: () => {},
    };
  }
}
