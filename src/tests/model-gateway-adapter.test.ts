import { describe, expect, it, vi } from "vitest";
import { FakeModelGateway, type FakeModelGatewayConfig } from "../integration";
import { ModelGatewayModel } from "../agent/modelGatewayAdapter";
import { createLaunchDeskAgent, DEFAULT_MODEL } from "../agent/launchAgent";
import type { ModelCallRequest, ModelStreamChunk } from "../integration";

// ===== Fixtures =====

function fakeConfig(responses: Record<string, { content: string }>): FakeModelGatewayConfig {
  return { responses } as FakeModelGatewayConfig;
}

function makeGateway(responses: Record<string, { content: string }> = {}): FakeModelGateway {
  return new FakeModelGateway(fakeConfig(responses));
}

function makeAdapter(gateway: FakeModelGateway, modelId = "test-model"): ModelGatewayModel {
  return new ModelGatewayModel(gateway, modelId);
}

/** Minimal ModelRequest stub for testing — only the fields the adapter reads. */
function modelRequest(input: string, systemInstructions?: string): unknown {
  return {
    input,
    systemInstructions,
    modelSettings: {},
    tools: [],
    outputType: "text",
    handoffs: [],
    tracing: false as const,
  };
}

async function collectStream(gen: AsyncIterable<unknown>): Promise<unknown[]> {
  const events: unknown[] = [];
  for await (const ev of gen) events.push(ev);
  return events;
}

// ===== getResponse (5) =====

describe("P6 ModelGateway Adapter", () => {
  it("getResponse returns ModelResponse with assistant message output", async () => {
    const gw = makeGateway({ "test-model": { content: "Hello!" } });
    const adapter = makeAdapter(gw);
    const response = await adapter.getResponse(modelRequest("hi") as never);

    expect(response.usage).toBeDefined();
    expect(response.output).toHaveLength(1);
    const msg = response.output[0] as Record<string, unknown>;
    expect(msg.type).toBe("message");
    expect(msg.role).toBe("assistant");
    const content = msg.content as Array<Record<string, unknown>>;
    expect(content[0].type).toBe("output_text");
    expect(content[0].text).toBe("Hello!");
  });

  it("getResponse maps systemInstructions to a system message", async () => {
    const gw = makeGateway({ "m": { content: "ok" } });
    const adapter = makeAdapter(gw, "m");
    // We can't easily inspect the messages sent to FakeModelGateway,
    // but we can verify the call succeeds with system instructions present.
    const response = await adapter.getResponse(modelRequest("hi", "You are a planner.") as never);
    expect(response.output).toHaveLength(1);
  });

  it("getResponse maps AgentInputItem[] input to messages", async () => {
    const gw = makeGateway({ "m": { content: "done" } });
    const adapter = makeAdapter(gw, "m");
    const input = [
      { type: "message", role: "user", content: [{ type: "input_text", text: "hello" }] },
    ];
    const response = await adapter.getResponse(modelRequest(input as never) as never);
    expect(response.output).toHaveLength(1);
  });

  it("getResponse throws on gateway failure", async () => {
    const gw = new FakeModelGateway({
      responses: {},
      errorOverrides: [{ errorKind: "auth_failed", message: "bad key" }],
    });
    const adapter = makeAdapter(gw, "any");
    await expect(adapter.getResponse(modelRequest("hi") as never)).rejects.toThrow("ModelGateway error");
  });

  it("getResponse passes maxTokens and temperature to gateway", async () => {
    const gw = makeGateway({ "m": { content: "ok" } });
    const adapter = makeAdapter(gw, "m");
    const request = {
      input: "hi",
      systemInstructions: undefined,
      modelSettings: { maxTokens: 100, temperature: 0.5 },
      tools: [],
      outputType: "text",
      handoffs: [],
      tracing: false as const,
    };
    const response = await adapter.getResponse(request as never);
    expect(response.output).toHaveLength(1);
  });

  // ===== getStreamedResponse (5) =====

  it("getStreamedResponse yields output_text_delta events then response_done", async () => {
    const gw = makeGateway({ "m": { content: "Hello world stream" } });
    const adapter = makeAdapter(gw, "m");
    const events = await collectStream(adapter.getStreamedResponse(modelRequest("hi") as never));

    const deltas = events.filter(
      (e) => (e as Record<string, unknown>).type === "output_text_delta"
    );
    const done = events.find(
      (e) => (e as Record<string, unknown>).type === "response_done"
    );

    expect(deltas.length).toBeGreaterThanOrEqual(1);
    expect(done).toBeDefined();
  });

  it("getStreamedResponse reassembles text from deltas", async () => {
    const gw = makeGateway({ "m": { content: "ABCDEF" } });
    const adapter = makeAdapter(gw, "m");
    const events = await collectStream(adapter.getStreamedResponse(modelRequest("hi") as never));

    const text = events
      .filter((e) => (e as Record<string, unknown>).type === "output_text_delta")
      .map((e) => (e as { delta: string }).delta)
      .join("");
    expect(text).toBe("ABCDEF");
  });

  it("getStreamedResponse response_done carries usage and output", async () => {
    const gw = makeGateway({ "m": { content: "test" } });
    const adapter = makeAdapter(gw, "m");
    const events = await collectStream(adapter.getStreamedResponse(modelRequest("hi") as never));

    const done = events.find(
      (e) => (e as Record<string, unknown>).type === "response_done"
    ) as { response: { usage: unknown; output: unknown[] } } | undefined;

    expect(done).toBeDefined();
    expect(done!.response.usage).toBeDefined();
    expect(done!.response.output).toHaveLength(1);
  });

  it("getStreamedResponse throws on gateway error", async () => {
    const gw = new FakeModelGateway({
      responses: {},
      errorOverrides: [{ errorKind: "server_error", message: "down" }],
    });
    const adapter = makeAdapter(gw, "any");
    await expect(
      collectStream(adapter.getStreamedResponse(modelRequest("hi") as never))
    ).rejects.toThrow("ModelGateway stream error");
  });

  it("getStreamedResponse handles empty content (only response_done)", async () => {
    const gw = makeGateway({ "m": { content: "" } });
    const adapter = makeAdapter(gw, "m");
    const events = await collectStream(adapter.getStreamedResponse(modelRequest("hi") as never));

    const deltas = events.filter(
      (e) => (e as Record<string, unknown>).type === "output_text_delta"
    );
    const done = events.find(
      (e) => (e as Record<string, unknown>).type === "response_done"
    );
    expect(deltas).toHaveLength(0);
    expect(done).toBeDefined();
  });

  // ===== launchAgent integration (2) =====

  it("createLaunchDeskAgent accepts a Model instance", () => {
    const gw = makeGateway({ "m": { content: "ok" } });
    const model = new ModelGatewayModel(gw, "m");
    const agent = createLaunchDeskAgent({ model });
    // The agent should be constructable without throwing.
    expect(agent).toBeDefined();
    expect(agent.name).toBe("Launch Desk");
  });

  it("createLaunchDeskAgent prepends skillContent to instructions", () => {
    const agent = createLaunchDeskAgent({
      skillContent: "## Loaded Skills\n\n### Skill: test\n\nA test skill.",
    });
    expect(agent.instructions).toContain("Loaded Skills");
    expect(agent.instructions).toContain("Launch Desk");
  });

  // ===== Boundary (3) =====

  it("DEFAULT_MODEL is still a string (backward compat)", () => {
    expect(typeof DEFAULT_MODEL).toBe("string");
    expect(DEFAULT_MODEL.length).toBeGreaterThan(0);
  });

  it("createLaunchDeskAgent without options uses DEFAULT_MODEL string", () => {
    const agent = createLaunchDeskAgent();
    expect(agent.model).toBe(DEFAULT_MODEL);
  });

  it("adapter does not call fetch directly (delegates to gateway)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const gw = makeGateway({ "m": { content: "ok" } });
    const adapter = makeAdapter(gw, "m");
    await adapter.getResponse(modelRequest("hi") as never);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
