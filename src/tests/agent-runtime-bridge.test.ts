import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { createApp } from "../server";
import { FakeModelGateway, type FakeModelGatewayConfig } from "../integration";
import {
  resetInjection,
  setGateway,
  setSkillRegistry,
  setUseModelGateway,
} from "../agent/streamLaunchPlan";
import { createSkillRegistry } from "../skills";
import { DEFAULT_MODEL } from "../agent/launchAgent";
import { SwarmOrchestrator, type Run } from "../runtime";

// ===== Fixtures =====

function fakeConfig(responses: Record<string, { content: string }> = {}): FakeModelGatewayConfig {
  return { responses };
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

interface SSEEvent {
  event: string;
  data: unknown;
}

function parseSSE(raw: string): SSEEvent[] {
  const events: SSEEvent[] = [];
  const blocks = raw.split("\n\n");
  for (const block of blocks) {
    if (!block.trim()) continue;
    let eventName = "";
    let dataStr = "";
    for (const line of block.split("\n")) {
      if (line.startsWith("event: ")) eventName = line.slice(7);
      else if (line.startsWith("data: ")) dataStr = line.slice(6);
    }
    if (eventName) {
      let data: unknown = dataStr;
      try { data = JSON.parse(dataStr); } catch { /* keep raw string */ }
      events.push({ event: eventName, data });
    }
  }
  return events;
}

function startServer(app: http.RequestListener): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as AddressInfo;
      const baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve({
        baseUrl,
        close: () => new Promise((res) => server.close(() => res())),
      });
    });
  });
}

function httpRequest(
  method: string,
  url: string,
  body?: unknown,
): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options: http.RequestOptions = {
      method,
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      headers: body !== undefined ? { "Content-Type": "application/json" } : {},
    };
    const req = http.request(options, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => resolve({ statusCode: res.statusCode ?? 0, headers: res.headers, body: data }));
    });
    req.on("error", reject);
    if (body !== undefined) req.write(JSON.stringify(body));
    req.end();
  });
}

/**
 * Send a POST /api/launch-plan request and start reading the SSE stream.
 * Returns { baseUrl, runId, events, addEvent, waitForEvent, close }.
 * The stream is read incrementally — events are appended to `events` as they arrive.
 */
function startSSEStream(
  baseUrl: string,
  input: unknown,
): Promise<{
  events: SSEEvent[];
  close: () => void;
  waitForEvent: (type: string, timeoutMs?: number) => Promise<SSEEvent>;
}> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(`${baseUrl}/api/launch-plan`);
    const req = http.request(
      {
        method: "POST",
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname,
        headers: { "Content-Type": "application/json" },
      },
      (res) => {
        const events: SSEEvent[] = [];
        let buffer = "";
        const listeners: Array<{ type: string; resolve: (e: SSEEvent) => void }> = [];

        function processChunk(chunk: string) {
          buffer += chunk;
          const blocks = buffer.split("\n\n");
          buffer = blocks.pop() ?? "";
          for (const block of blocks) {
            if (!block.trim()) continue;
            let eventName = "";
            let dataStr = "";
            for (const line of block.split("\n")) {
              if (line.startsWith("event: ")) eventName = line.slice(7);
              else if (line.startsWith("data: ")) dataStr = line.slice(6);
            }
            if (eventName) {
              let data: unknown = dataStr;
              try { data = JSON.parse(dataStr); } catch { /* keep raw */ }
              const ev = { event: eventName, data };
              events.push(ev);
              // Notify any listeners waiting for this event type.
              for (let i = listeners.length - 1; i >= 0; i--) {
                if (listeners[i].type === eventName) {
                  listeners[i].resolve(ev);
                  listeners.splice(i, 1);
                }
              }
            }
          }
        }

        res.setEncoding("utf8");
        res.on("data", processChunk);

        resolve({
          events,
          close: () => req.destroy(),
          waitForEvent: (type: string, timeoutMs = 10000) => {
            // Check if the event already arrived.
            const existing = events.find((e) => e.event === type);
            if (existing) return Promise.resolve(existing);
            // Otherwise wait.
            return new Promise<SSEEvent>((res, rej) => {
              const timer = setTimeout(() => {
                const idx = listeners.findIndex((l) => l.type === type);
                if (idx >= 0) listeners.splice(idx, 1);
                rej(new Error(`Timed out waiting for event: ${type}. Received: ${events.map((e) => e.event).join(", ")}`));
              }, timeoutMs);
              listeners.push({
                type,
                resolve: (e) => {
                  clearTimeout(timer);
                  res(e);
                },
              });
            });
          },
        });
      },
    );
    req.on("error", reject);
    req.write(JSON.stringify(input));
    req.end();
  });
}

// ===== P13 Agent ↔ Runtime Bridge (11) =====

describe("P13 Agent ↔ Runtime Bridge", () => {
  beforeEach(() => {
    setSkillRegistry(createSkillRegistry());
  });

  afterEach(() => {
    resetInjection();
  });

  // ===== Tracking bridge: runId in SSE + approval gate (7) =====

  it("run_started event includes runId when tracking is enabled", async () => {
    const gw = makeGateway({ [DEFAULT_MODEL]: { content: "A release plan." } });
    setGateway(gw);
    setUseModelGateway(true);
    const orch = new SwarmOrchestrator();
    const app = createApp(gw, orch);
    const { baseUrl, close } = await startServer(app);

    const stream = await startSSEStream(baseUrl, validInput());
    const started = await stream.waitForEvent("run_started");

    expect(started.data).toBeDefined();
    const runId = (started.data as Record<string, unknown>).runId;
    expect(runId).toMatch(/^run_/);

    stream.close();
    await close();
  });

  it("text_delta events are streamed after run_started", async () => {
    const gw = makeGateway({ [DEFAULT_MODEL]: { content: "Step 1: Research. Step 2: Build." } });
    setGateway(gw);
    setUseModelGateway(true);
    const orch = new SwarmOrchestrator();
    const app = createApp(gw, orch);
    const { baseUrl, close } = await startServer(app);

    const stream = await startSSEStream(baseUrl, validInput());
    await stream.waitForEvent("run_started");
    const delta = await stream.waitForEvent("text_delta");

    expect(delta).toBeDefined();
    expect(typeof (delta.data as Record<string, unknown>).delta).toBe("string");

    stream.close();
    await close();
  });

  it("approval_required is emitted after agent completes (tracking enabled)", async () => {
    const gw = makeGateway({ [DEFAULT_MODEL]: { content: "Plan content." } });
    setGateway(gw);
    setUseModelGateway(true);
    const orch = new SwarmOrchestrator();
    const app = createApp(gw, orch);
    const { baseUrl, close } = await startServer(app);

    const stream = await startSSEStream(baseUrl, validInput());
    await stream.waitForEvent("run_started");
    const approval = await stream.waitForEvent("approval_required");

    expect(approval).toBeDefined();
    const runId = (approval.data as Record<string, unknown>).runId;
    expect(runId).toMatch(/^run_/);

    stream.close();
    await close();
  });

  it("full lifecycle: run_started → text_delta → approval_required → approve → run_completed", async () => {
    const gw = makeGateway({ [DEFAULT_MODEL]: { content: "Final plan." } });
    setGateway(gw);
    setUseModelGateway(true);
    const orch = new SwarmOrchestrator();
    const app = createApp(gw, orch);
    const { baseUrl, close } = await startServer(app);

    const stream = await startSSEStream(baseUrl, validInput());
    const started = await stream.waitForEvent("run_started");
    const runId = (started.data as Record<string, unknown>).runId as string;
    await stream.waitForEvent("text_delta");
    await stream.waitForEvent("approval_required");

    // Approve the run via REST — this unblocks the SSE stream.
    const approveRes = await httpRequest("POST", `${baseUrl}/api/runs/${runId}/approve`);
    expect(approveRes.statusCode).toBe(200);

    const completed = await stream.waitForEvent("run_completed");
    expect(completed).toBeDefined();

    stream.close();
    await close();
  });

  it("reject path: approval_required → approval_resolved(rejected) → run_completed", async () => {
    const gw = makeGateway({ [DEFAULT_MODEL]: { content: "Plan." } });
    setGateway(gw);
    setUseModelGateway(true);
    const orch = new SwarmOrchestrator();
    const app = createApp(gw, orch);
    const { baseUrl, close } = await startServer(app);

    const stream = await startSSEStream(baseUrl, validInput());
    const started = await stream.waitForEvent("run_started");
    const runId = (started.data as Record<string, unknown>).runId as string;
    await stream.waitForEvent("approval_required");

    // Reject the run.
    const rejectRes = await httpRequest("POST", `${baseUrl}/api/runs/${runId}/reject`);
    expect(rejectRes.statusCode).toBe(200);

    // Phase 2: rejected runs emit approval_resolved then run_completed (not error).
    const resolved = await stream.waitForEvent("approval_resolved");
    expect(resolved).toBeDefined();
    expect((resolved.data as Record<string, unknown>).decision).toBe("rejected");

    const completed = await stream.waitForEvent("run_completed");
    expect(completed).toBeDefined();

    stream.close();
    await close();
  });

  it("run state is completed after approve + resume", async () => {
    const gw = makeGateway({ [DEFAULT_MODEL]: { content: "Plan." } });
    setGateway(gw);
    setUseModelGateway(true);
    const orch = new SwarmOrchestrator();
    const app = createApp(gw, orch);
    const { baseUrl, close } = await startServer(app);

    const stream = await startSSEStream(baseUrl, validInput());
    const started = await stream.waitForEvent("run_started");
    const runId = (started.data as Record<string, unknown>).runId as string;
    await stream.waitForEvent("approval_required");

    // Approve.
    await httpRequest("POST", `${baseUrl}/api/runs/${runId}/approve`);
    await stream.waitForEvent("run_completed");

    // Verify run state via REST.
    const stateRes = await httpRequest("GET", `${baseUrl}/api/runs/${runId}`);
    const run = JSON.parse(stateRes.body) as Run;

    expect(stateRes.statusCode).toBe(200);
    expect(run.status).toBe("completed");

    stream.close();
    await close();
  });

  it("audit events include the full lifecycle", async () => {
    const gw = makeGateway({ [DEFAULT_MODEL]: { content: "Plan." } });
    setGateway(gw);
    setUseModelGateway(true);
    const orch = new SwarmOrchestrator();
    const app = createApp(gw, orch);
    const { baseUrl, close } = await startServer(app);

    const stream = await startSSEStream(baseUrl, validInput());
    const started = await stream.waitForEvent("run_started");
    const runId = (started.data as Record<string, unknown>).runId as string;
    await stream.waitForEvent("approval_required");

    await httpRequest("POST", `${baseUrl}/api/runs/${runId}/approve`);
    await stream.waitForEvent("run_completed");

    const auditRes = await httpRequest("GET", `${baseUrl}/api/runs/${runId}/audit`);
    const body = JSON.parse(auditRes.body);

    expect(auditRes.statusCode).toBe(200);
    expect(Array.isArray(body.events)).toBe(true);
    const types = body.events.map((e: { type: string }) => e.type);
    expect(types).toContain("run_created");
    expect(types).toContain("approved");
    expect(types).toContain("run_completed");

    stream.close();
    await close();
  });

  // ===== Backward compatibility: no orchestrator = old behavior (2) =====

  it("without orchestrator, run_completed is emitted directly (no approval gate)", async () => {
    const gw = makeGateway({ [DEFAULT_MODEL]: { content: "Direct plan." } });
    setGateway(gw);
    setUseModelGateway(true);
    const app = createApp(gw); // No orchestrator — backward compatible.
    const { baseUrl, close } = await startServer(app);

    const stream = await startSSEStream(baseUrl, validInput());
    await stream.waitForEvent("run_started");
    const completed = await stream.waitForEvent("run_completed");

    expect(completed).toBeDefined();
    // No approval_required should have been emitted.
    const approvalEvents = stream.events.filter((e) => e.event === "approval_required");
    expect(approvalEvents.length).toBe(0);

    stream.close();
    await close();
  });

  it("without orchestrator, run_started does not include runId", async () => {
    const gw = makeGateway({ [DEFAULT_MODEL]: { content: "No tracking." } });
    setGateway(gw);
    setUseModelGateway(true);
    const app = createApp(gw);
    const { baseUrl, close } = await startServer(app);

    const stream = await startSSEStream(baseUrl, validInput());
    const started = await stream.waitForEvent("run_started");

    expect((started.data as Record<string, unknown>).runId).toBeUndefined();

    stream.close();
    await close();
  });

  // ===== Error handling (1) =====

  it("gateway error marks runtime run as rejected", async () => {
    const gw = new FakeModelGateway({
      responses: { [DEFAULT_MODEL]: { content: "irrelevant" } },
      errorOverrides: [{ errorKind: "auth_failed", message: "Bad key" }],
    });
    setGateway(gw);
    setUseModelGateway(true);
    const orch = new SwarmOrchestrator();
    const app = createApp(gw, orch);
    const { baseUrl, close } = await startServer(app);

    const stream = await startSSEStream(baseUrl, validInput());
    const started = await stream.waitForEvent("run_started");
    const runId = (started.data as Record<string, unknown>).runId as string;
    await stream.waitForEvent("error");

    // Verify run is marked failed.
    const stateRes = await httpRequest("GET", `${baseUrl}/api/runs/${runId}`);
    const run = JSON.parse(stateRes.body) as Run;
    expect(run.status).toBe("rejected");

    stream.close();
    await close();
  });

  // ===== Boundary (1) =====

  it("fetch is never called during the bridge flow", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const gw = makeGateway({ [DEFAULT_MODEL]: { content: "No fetch." } });
    setGateway(gw);
    setUseModelGateway(true);
    const orch = new SwarmOrchestrator();
    const app = createApp(gw, orch);
    const { baseUrl, close } = await startServer(app);

    const stream = await startSSEStream(baseUrl, validInput());
    const started = await stream.waitForEvent("run_started");
    const runId = (started.data as Record<string, unknown>).runId as string;
    await stream.waitForEvent("approval_required");
    await httpRequest("POST", `${baseUrl}/api/runs/${runId}/approve`);
    await stream.waitForEvent("run_completed");

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();

    stream.close();
    await close();
  });
});