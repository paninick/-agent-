import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeModelGateway, type FakeModelGatewayConfig } from "../integration";
import { ModelGatewayModel } from "../agent/modelGatewayAdapter";
import { createLaunchDeskAgent, DEFAULT_MODEL } from "../agent/launchAgent";
import {
  resetInjection,
  setGateway,
  setSkillRegistry,
  setUseModelGateway,
  streamLaunchPlan,
  type LaunchStreamEvent,
} from "../agent/streamLaunchPlan";
import { launchDeskSelectionRequest, selectModelForLaunchDesk } from "../agent/modelRouterIntegration";
import { StaticModelRouter } from "../models";
import { createSkillRegistry } from "../skills";

// ===== Fixtures =====

function fakeConfig(responses: Record<string, { content: string }>): FakeModelGatewayConfig {
  return { responses } as FakeModelGatewayConfig;
}

function makeGateway(responses: Record<string, { content: string }> = {}): FakeModelGateway {
  return new FakeModelGateway(fakeConfig(responses));
}

function validInput(): unknown {
  return {
    productBrief: "A mobile app for tracking gym workouts with social sharing features.",
    audience: "fitness enthusiasts",
    launchDate: "2026-08-01",
    constraints: "Must support iOS and Android",
    assets: "Brand guidelines ready",
  };
}

async function collectEvents(gen: AsyncGenerator<LaunchStreamEvent>): Promise<LaunchStreamEvent[]> {
  const events: LaunchStreamEvent[] = [];
  for await (const event of gen) events.push(event);
  return events;
}

/** Minimal ModelRequest stub for adapter unit tests. */
function modelRequest(input: string): unknown {
  return {
    input,
    systemInstructions: undefined,
    modelSettings: {},
    tools: [],
    outputType: "text",
    handoffs: [],
    tracing: false as const,
  };
}

// ===== E2E Runtime Smoke (8) =====

describe("P10 E2E Runtime Smoke Test", () => {
  // Inject an empty skill registry so streamLaunchPlan doesn't scan the filesystem.
  beforeEach(() => {
    setSkillRegistry(createSkillRegistry());
  });

  afterEach(() => {
    resetInjection();
  });

  // ===== Happy path (2) =====

  it("streamLaunchPlan yields run_started, text_delta, and run_completed with FakeModelGateway", async () => {
    const gw = makeGateway({ [DEFAULT_MODEL]: { content: "Release plan is ready." } });
    setGateway(gw);
    setUseModelGateway(true);

    const events = await collectEvents(streamLaunchPlan(validInput()));

    const started = events.find((e) => e.type === "run_started");
    const completed = events.find((e) => e.type === "run_completed");
    const textDeltas = events.filter((e) => e.type === "text_delta");

    expect(started).toBeDefined();
    expect(completed).toBeDefined();
    expect(textDeltas.length).toBeGreaterThanOrEqual(1);

    // Concatenated text should reconstruct the original content.
    const text = textDeltas
      .map((e) => (e.type === "text_delta" ? e.delta : ""))
      .join("");
    expect(text).toBe("Release plan is ready.");
  });

  it("run_started event carries the model id from the gateway", async () => {
    const gw = makeGateway({ "deepseek-v4-flash": { content: "Plan complete." } });
    setGateway(gw);
    setUseModelGateway(true);

    const events = await collectEvents(streamLaunchPlan(validInput()));
    const started = events.find((e) => e.type === "run_started");

    expect(started).toBeDefined();
    if (started && started.type === "run_started") {
      expect(started.model).toBe("deepseek-v4-flash");
    }
  });

  // ===== Skill injection (1) =====

  it("createLaunchDeskAgent with skillContent + ModelGatewayModel produces correct instructions", () => {
    const gw = makeGateway({ "m": { content: "ok" } });
    const model = new ModelGatewayModel(gw, "m");
    const agent = createLaunchDeskAgent({
      skillContent: "## Loaded Skills\n\n### Skill: test-skill\n\nA test capability.",
      model,
    });

    expect(agent.instructions).toContain("Loaded Skills");
    expect(agent.instructions).toContain("test-skill");
    expect(agent.instructions).toContain("Launch Desk");
  });

  // ===== ModelRouter integration (2) =====

  it("selectModelForLaunchDesk picks an available model from the gateway", () => {
    const gw = makeGateway({
      "deepseek-v4-flash": { content: "ok" },
      "doubao-seed-2.0-pro": { content: "ok" },
    });
    const router = new StaticModelRouter();
    const result = selectModelForLaunchDesk(router, gw, launchDeskSelectionRequest(), "default");

    expect(result.availableModelIds).toContain("deepseek-v4-flash");
    expect(result.availableModelIds).toContain("doubao-seed-2.0-pro");
    // Both models match required capabilities (score=100). With balanced cost/latency
    // preferences and standard complexity, the tie-break is costRank ascending —
    // deepseek-v4-flash (low) wins over doubao-seed-2.0-pro (medium).
    expect(result.modelId).toBe("deepseek-v4-flash");
  });

  it("selectModelForLaunchDesk falls back to first available when router selection not in gateway", () => {
    // Gateway only has longcat-v1; router profiles don't include it.
    const gw = makeGateway({ "longcat-v1": { content: "ok" } });
    const router = new StaticModelRouter();
    const result = selectModelForLaunchDesk(router, gw, launchDeskSelectionRequest(), "default-model");

    expect(result.ok).toBe(false);
    expect(result.modelId).toBe("longcat-v1");
    expect(result.reason).toContain("not available");
  });

  // ===== Error path (1) =====

  it("streamLaunchPlan yields an error event when gateway fails", async () => {
    const gw = new FakeModelGateway({
      responses: {},
      errorOverrides: [{ errorKind: "auth_failed", message: "Invalid API key" }],
    });
    setGateway(gw);
    setUseModelGateway(true);

    const events = await collectEvents(streamLaunchPlan(validInput()));
    const error = events.find((e) => e.type === "error");

    expect(error).toBeDefined();
    if (error && error.type === "error") {
      expect(error.message.length).toBeGreaterThan(0);
    }
  });

  // ===== Tool-call extraction (1) =====

  it("ModelGatewayModel.getResponse extracts FunctionCallItem from embedded tool_call JSON", async () => {
    const toolCallContent = '```json\n{"tool_calls":[{"id":"c1","function":{"name":"extract_tasks_from_brief","arguments":"{}"}}]}\n```';
    const gw = makeGateway({ "m": { content: toolCallContent } });
    const adapter = new ModelGatewayModel(gw, "m");

    const response = await adapter.getResponse(modelRequest("hi") as never);

    const functionCall = response.output.find(
      (item) => (item as Record<string, unknown>).type === "function_call"
    );
    expect(functionCall).toBeDefined();
    expect((functionCall as Record<string, unknown>).name).toBe("extract_tasks_from_brief");
  });

  // ===== Boundary (1) =====

  it("E2E test path does not call fetch (uses FakeModelGateway)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const gw = makeGateway({ [DEFAULT_MODEL]: { content: "No fetch needed." } });
    setGateway(gw);
    setUseModelGateway(true);

    await collectEvents(streamLaunchPlan(validInput()));

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
