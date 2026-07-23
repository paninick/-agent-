/**
 * orchestrator-stream.test.ts — Tests for the SSE streaming feature
 *
 * Tests three layers:
 *   1. orchestrateSwarm calls onStepComplete after each step
 *   2. runLiveSwarm threads onStepComplete through to orchestrator
 *   3. POST /api/intelligence/swarm/stream returns SSE with step events
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import registrySeed from "../../data/intelligence-source-registry.seed.json";
import {
  parseSourceRegistry,
  orchestrateSwarm,
  runLiveSwarm,
  MemoryStore,
  apparelPack,
  LIVE_WORKFLOW,
} from "../intelligence";
import type { SwarmTrigger, RawRecord, AgentRunResult, AgentRole } from "../intelligence/spine/types";
import type { OrchestratorContext } from "../intelligence/swarm/orchestrator";
import { createApp } from "../server";
import { FakeModelGateway, type FakeModelGatewayConfig } from "../integration";

// ===== Fixtures =====

const registry = parseSourceRegistry(registrySeed);
const registrySources = registry.sources;
const now = new Date("2025-06-01T00:00:00Z");

function makeTrigger(id = "trigger-stream-test"): SwarmTrigger {
  return {
    id,
    ruleId: "rule-test",
    signalId: "signal-test",
    firedAt: now.toISOString(),
    objective: "apparel cotton price cost transmission macro economic Vietnam Bangladesh",
    pack: apparelPack,
  };
}

function makeRawRecords(): RawRecord[] {
  return [
    {
      id: "raw-stream-1",
      sourceId: "world-bank",
      fetchedAt: now.toISOString(),
      contentType: "application/json",
      raw: {
        subject: "gdp_vietnam",
        claim: "Vietnam GDP",
        value: 409000000000,
        unit: "USD",
        period: "2023",
        geography: "VNM",
      },
    },
    {
      id: "raw-stream-2",
      sourceId: "bls-public-api",
      fetchedAt: now.toISOString(),
      contentType: "application/json",
      raw: {
        subject: "cpi_clothing",
        claim: "CPI clothing index",
        value: 140.5,
        unit: "index",
        period: "2024-01",
        geography: "US",
      },
    },
  ];
}

function fakeConfig(responses: Record<string, { content: string }> = {}): FakeModelGatewayConfig {
  return { responses };
}

function makeGateway(responses: Record<string, { content: string }> = {}): FakeModelGateway {
  return new FakeModelGateway(fakeConfig(responses));
}

function startServer(app: http.RequestListener): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as AddressInfo;
      resolve({
        baseUrl: `http://127.0.0.1:${addr.port}`,
        close: () => new Promise((res) => server.close(() => res())),
      });
    });
  });
}

/** Read SSE stream, collecting all data events until stream ends. */
function readSSEStream(
  baseUrl: string,
  body: unknown,
): Promise<{ statusCode: number; events: unknown[] }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(baseUrl);
    const options: http.RequestOptions = {
      method: "POST",
      hostname: parsed.hostname,
      port: parsed.port,
      path: "/api/intelligence/swarm/stream",
      headers: { "Content-Type": "application/json" },
    };
    const events: unknown[] = [];
    const req = http.request(options, (res) => {
      let buffer = "";
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => {
        buffer += chunk;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;
          const jsonStr = trimmed.slice(6);
          if (jsonStr === "[DONE]") continue;
          try {
            events.push(JSON.parse(jsonStr));
          } catch {
            // skip malformed
          }
        }
      });
      res.on("end", () => resolve({ statusCode: res.statusCode ?? 0, events }));
    });
    req.on("error", reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

function stubFetch404() {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ error: "not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

// ===== Tests =====

describe("Orchestrator onStepComplete callback", () => {
  it("calls onStepComplete after each step with correct step number, total, role, and result", async () => {
    const trigger = makeTrigger();
    const memoryStore = new MemoryStore();

    const calls: { step: number; total: number; role: AgentRole; status: string }[] = [];

    const context: OrchestratorContext = {
      registrySources,
      rawRecords: makeRawRecords(),
      memoryStore,
      now,
      workflow: LIVE_WORKFLOW,
      onStepComplete: (step, total, role, result) => {
        calls.push({ step, total, role, status: result.status });
      },
    };

    await orchestrateSwarm(trigger, context);

    // Should have been called for each step in the workflow
    expect(calls.length).toBe(LIVE_WORKFLOW.steps.length);

    // Step numbers should be sequential: 1, 2, 3, ...
    for (let i = 0; i < calls.length; i++) {
      expect(calls[i].step).toBe(i + 1);
      expect(calls[i].total).toBe(LIVE_WORKFLOW.steps.length);
      expect(calls[i].role).toBe(LIVE_WORKFLOW.steps[i]);
    }

    // Each call should have a valid status
    for (const c of calls) {
      expect(["completed", "done_with_concerns", "failed", "blocked", "needs_context"]).toContain(c.status);
    }
  });

  it("does not throw when onStepComplete is not provided", async () => {
    const trigger = makeTrigger();
    const memoryStore = new MemoryStore();

    const context: OrchestratorContext = {
      registrySources,
      rawRecords: makeRawRecords(),
      memoryStore,
      now,
      workflow: LIVE_WORKFLOW,
      // no onStepComplete
    };

    // Should complete without error
    const result = await orchestrateSwarm(trigger, context);
    expect(result.results.length).toBe(LIVE_WORKFLOW.steps.length);
  });

  it("result object passed to callback matches the result in the final results array", async () => {
    const trigger = makeTrigger();
    const memoryStore = new MemoryStore();

    const callbackResults: AgentRunResult[] = [];

    const context: OrchestratorContext = {
      registrySources,
      rawRecords: makeRawRecords(),
      memoryStore,
      now,
      workflow: LIVE_WORKFLOW,
      onStepComplete: (_step, _total, _role, result) => {
        callbackResults.push(result);
      },
    };

    const finalResult = await orchestrateSwarm(trigger, context);

    // The callback results should match the final results array
    expect(callbackResults.length).toBe(finalResult.results.length);
    for (let i = 0; i < callbackResults.length; i++) {
      expect(callbackResults[i].taskId).toBe(finalResult.results[i].taskId);
      expect(callbackResults[i].role).toBe(finalResult.results[i].role);
      expect(callbackResults[i].status).toBe(finalResult.results[i].status);
    }
  });
});

describe("runLiveSwam onStepComplete threading", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn> | null = null;

  beforeEach(() => {
    fetchSpy = stubFetch404();
  });

  afterEach(() => {
    if (fetchSpy) {
      fetchSpy.mockRestore();
      fetchSpy = null;
    }
  });

  it("threads onStepComplete through to the orchestrator", async () => {
    const trigger = makeTrigger("trigger-live-stream");
    const memoryStore = new MemoryStore();

    const calls: { step: number; role: string }[] = [];

    const result = await runLiveSwarm({
      registrySources,
      trigger,
      memoryStore,
      now,
      apiKeys: {},
      onStepComplete: (step, _total, role) => {
        calls.push({ step, role });
      },
    });

    // Should have received step callbacks from the orchestrator
    expect(calls.length).toBe(result.swarmRun.results.length);
    expect(calls.length).toBeGreaterThan(0);

    // Step numbers should be sequential
    for (let i = 0; i < calls.length; i++) {
      expect(calls[i].step).toBe(i + 1);
    }
  });
});

describe("POST /api/intelligence/swarm/stream (SSE endpoint)", () => {
  // SSE streaming tests need longer timeouts — live swarm takes 5-15s with stubbed fetch
  const SSE_TIMEOUT = 45_000;

  let cleanup: (() => Promise<void>) | null = null;
  let fetchSpy: ReturnType<typeof vi.spyOn> | null = null;

  beforeEach(() => {
    fetchSpy = stubFetch404();
  });

  afterEach(async () => {
    if (fetchSpy) {
      fetchSpy.mockRestore();
      fetchSpy = null;
    }
    if (cleanup) {
      await cleanup();
      cleanup = null;
    }
  });

  it("returns 400 with JSON error for short objective", async () => {
    const app = createApp(makeGateway());
    const { baseUrl, close } = await startServer(app);
    cleanup = close;

    // For 400, the route sends JSON (not SSE) since validation happens before headers
    const res = await new Promise<{ statusCode: number; body: string }>((resolve, reject) => {
      const parsed = new URL(baseUrl);
      const req = http.request(
        {
          method: "POST",
          hostname: parsed.hostname,
          port: parsed.port,
          path: "/api/intelligence/swarm/stream",
          headers: { "Content-Type": "application/json" },
        },
        (r) => {
          let data = "";
          r.setEncoding("utf8");
          r.on("data", (chunk) => (data += chunk));
          r.on("end", () => resolve({ statusCode: r.statusCode ?? 0, body: data }));
        },
      );
      req.on("error", reject);
      req.write(JSON.stringify({ objective: "short" }));
      req.end();
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(false);
    expect(body.error).toBe("invalid_input");
  });

  it("returns SSE stream with step events and done event", async () => {
    // SSE_TIMEOUT: allow up to 45s for live swarm with stubbed fetch
    const app = createApp(makeGateway());
    const { baseUrl, close } = await startServer(app);
    cleanup = close;

    const { statusCode, events } = await readSSEStream(baseUrl, {
      objective: "apparel cotton price cost transmission macro economic Vietnam Bangladesh",
    });

    expect(statusCode).toBe(200);

    // Should have at least one step event
    const stepEvents = events.filter((e) => !(e as { done?: boolean }).done);
    expect(stepEvents.length).toBeGreaterThan(0);

    // Each step event should have step, total, role, status, phase
    for (const ev of stepEvents) {
      const s = ev as { step: number; total: number; role: string; status: string; phase: string };
      expect(typeof s.step).toBe("number");
      expect(typeof s.total).toBe("number");
      expect(typeof s.role).toBe("string");
      expect(typeof s.status).toBe("string");
      expect(typeof s.phase).toBe("string");
    }

    // Should have a final done event
    const doneEvents = events.filter((e) => (e as { done?: boolean }).done);
    expect(doneEvents.length).toBe(1);

    const doneEvent = doneEvents[0] as { done: boolean; result: unknown; intent: unknown; budget: unknown };
    expect(doneEvent.done).toBe(true);
    expect(doneEvent.result).toBeDefined();
    expect(doneEvent.intent).toBeDefined();
    expect(doneEvent.budget).toBeDefined();
  }, SSE_TIMEOUT);

  it("step events are sequential (1, 2, 3, ...)", async () => {
    const app = createApp(makeGateway());
    const { baseUrl, close } = await startServer(app);
    cleanup = close;

    const { events } = await readSSEStream(baseUrl, {
      objective: "apparel cotton price cost transmission macro economic Vietnam Bangladesh",
    });

    const stepEvents = events.filter((e) => !(e as { done?: boolean }).done);
    for (let i = 0; i < stepEvents.length; i++) {
      expect((stepEvents[i] as { step: number }).step).toBe(i + 1);
    }
  }, SSE_TIMEOUT);

  it("SSE headers are set correctly", async () => {
    const app = createApp(makeGateway());
    const { baseUrl, close } = await startServer(app);
    cleanup = close;

    const headers = await new Promise<http.IncomingHttpHeaders>((resolve, reject) => {
      const parsed = new URL(baseUrl);
      const req = http.request(
        {
          method: "POST",
          hostname: parsed.hostname,
          port: parsed.port,
          path: "/api/intelligence/swarm/stream",
          headers: { "Content-Type": "application/json" },
        },
        (r) => {
          resolve(r.headers);
          r.resume();
        },
      );
      req.on("error", reject);
      req.write(JSON.stringify({ objective: "apparel cotton price cost transmission Vietnam Bangladesh" }));
      req.end();
    });

    expect(headers["content-type"]).toContain("text/event-stream");
    expect(headers["cache-control"]).toContain("no-cache");
  }, SSE_TIMEOUT);
});