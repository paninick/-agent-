import { afterEach, beforeEach, describe, expect, it } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { createApp, setApprovalTimeout, resetApprovalTimeout } from "../server";
import { FakeModelGateway, type FakeModelGatewayConfig } from "../integration";
import {
  resetInjection,
  setGateway,
  setSkillRegistry,
  setUseModelGateway,
} from "../agent/streamLaunchPlan";
import { approvalPolicy, resetApprovalPolicy } from "../agent/approvalPolicy";
import { createSkillRegistry } from "../skills";
import { DEFAULT_MODEL } from "../agent/launchAgent";
import { SwarmOrchestrator } from "../runtime";

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
 * Start a POST /api/launch-plan SSE stream and read events incrementally.
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
            const existing = events.find((e) => e.event === type);
            if (existing) return Promise.resolve(existing);
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

// ===== Phase 2 — Approval Governance Backend Contract =====

describe("P2 Approval Governance Backend", () => {
  beforeEach(() => {
    setSkillRegistry(createSkillRegistry());
    // Enable approval policy for these tests (without orchestrator).
    approvalPolicy.enabled = true;
  });

  afterEach(() => {
    resetInjection();
    resetApprovalPolicy();
    resetApprovalTimeout();
  });

  it("approval_required payload has all required fields", async () => {
    const gw = makeGateway({ [DEFAULT_MODEL]: { content: "Plan content." } });
    setGateway(gw);
    setUseModelGateway(true);
    const app = createApp(gw); // No orchestrator — approvalPolicy.enabled drives the gate.
    const { baseUrl, close } = await startServer(app);

    const stream = await startSSEStream(baseUrl, validInput());
    const approval = await stream.waitForEvent("approval_required");
    const data = approval.data as Record<string, unknown>;

    expect(data.type).toBe("approval_required");
    expect(typeof data.runId).toBe("string");
    expect((data.runId as string).length).toBeGreaterThan(0);
    expect(typeof data.approvalId).toBe("string");
    expect((data.approvalId as string).length).toBeGreaterThan(0);
    expect(typeof data.title).toBe("string");
    expect(data.title).toBe("Approval required");
    expect(typeof data.reason).toBe("string");
    expect((data.reason as string).length).toBeGreaterThan(0);
    expect(["low", "medium", "high"]).toContain(data.riskLevel);
    expect(typeof data.toolName).toBe("string");
    expect(typeof data.requestedAction).toBe("string");
    expect(data.payloadPreview).toBeDefined();
    expect(typeof data.timestamp).toBe("string");

    stream.close();
    await close();
  });

  it("approval endpoint accepts approved decision", async () => {
    const gw = makeGateway({ [DEFAULT_MODEL]: { content: "Plan." } });
    setGateway(gw);
    setUseModelGateway(true);
    const app = createApp(gw);
    const { baseUrl, close } = await startServer(app);

    const stream = await startSSEStream(baseUrl, validInput());
    const approval = await stream.waitForEvent("approval_required");
    const { runId, approvalId } = approval.data as Record<string, string>;

    const res = await httpRequest("POST", `${baseUrl}/api/launch-plan/approval`, {
      runId,
      approvalId,
      decision: "approved",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);

    // Verify approval_resolved and run_completed follow.
    const resolved = await stream.waitForEvent("approval_resolved");
    expect((resolved.data as Record<string, unknown>).decision).toBe("approved");
    const completed = await stream.waitForEvent("run_completed");
    expect(completed).toBeDefined();

    stream.close();
    await close();
  });

  it("approval endpoint accepts rejected decision", async () => {
    const gw = makeGateway({ [DEFAULT_MODEL]: { content: "Plan." } });
    setGateway(gw);
    setUseModelGateway(true);
    const app = createApp(gw);
    const { baseUrl, close } = await startServer(app);

    const stream = await startSSEStream(baseUrl, validInput());
    const approval = await stream.waitForEvent("approval_required");
    const { runId, approvalId } = approval.data as Record<string, string>;

    const res = await httpRequest("POST", `${baseUrl}/api/launch-plan/approval`, {
      runId,
      approvalId,
      decision: "rejected",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);

    const resolved = await stream.waitForEvent("approval_resolved");
    expect((resolved.data as Record<string, unknown>).decision).toBe("rejected");
    const completed = await stream.waitForEvent("run_completed");
    expect(completed).toBeDefined();

    stream.close();
    await close();
  });

  it("invalid decision returns 400", async () => {
    const gw = makeGateway({ [DEFAULT_MODEL]: { content: "Plan." } });
    setGateway(gw);
    setUseModelGateway(true);
    const app = createApp(gw);
    const { baseUrl, close } = await startServer(app);

    const stream = await startSSEStream(baseUrl, validInput());
    const approval = await stream.waitForEvent("approval_required");
    const { runId, approvalId } = approval.data as Record<string, string>;

    const res = await httpRequest("POST", `${baseUrl}/api/launch-plan/approval`, {
      runId,
      approvalId,
      decision: "maybe", // invalid
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(false);
    expect(body.error).toBe("invalid_input");

    stream.close();
    await close();
  });

  it("unknown approvalId returns 404", async () => {
    const gw = makeGateway({ [DEFAULT_MODEL]: { content: "Plan." } });
    setGateway(gw);
    setUseModelGateway(true);
    const app = createApp(gw);
    const { baseUrl, close } = await startServer(app);

    const res = await httpRequest("POST", `${baseUrl}/api/launch-plan/approval`, {
      runId: "run_nonexistent",
      approvalId: "appr_nonexistent",
      decision: "approved",
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(false);
    expect(body.error).toBe("approval_not_found");

    await close();
  });

  it("rejected run outputs safe message and does not continue high-risk action", async () => {
    const gw = makeGateway({ [DEFAULT_MODEL]: { content: "Generated plan content." } });
    setGateway(gw);
    setUseModelGateway(true);
    const app = createApp(gw);
    const { baseUrl, close } = await startServer(app);

    const stream = await startSSEStream(baseUrl, validInput());
    const approval = await stream.waitForEvent("approval_required");
    const { runId, approvalId } = approval.data as Record<string, string>;

    await httpRequest("POST", `${baseUrl}/api/launch-plan/approval`, {
      runId,
      approvalId,
      decision: "rejected",
    });

    await stream.waitForEvent("approval_resolved");
    await stream.waitForEvent("run_completed");

    // After rejection, a safe stop message is appended via text_delta.
    const textDeltas = stream.events.filter((e) => e.event === "text_delta");
    const allText = textDeltas.map((e) => (e.data as Record<string, unknown>).delta as string).join("");
    expect(allText).toContain("Run stopped");
    expect(allText).toContain("No customer-facing copy was generated");

    // No additional text_delta events should arrive after the safe message.
    // The run_completed event should be the last event.
    const lastEvent = stream.events[stream.events.length - 1];
    expect(lastEvent.event).toBe("run_completed");

    stream.close();
    await close();
  });

  it("approved run continues to emit run_completed after approval_resolved", async () => {
    const gw = makeGateway({ [DEFAULT_MODEL]: { content: "Final plan." } });
    setGateway(gw);
    setUseModelGateway(true);
    const orch = new SwarmOrchestrator();
    const app = createApp(gw, orch);
    const { baseUrl, close } = await startServer(app);

    const stream = await startSSEStream(baseUrl, validInput());
    const started = await stream.waitForEvent("run_started");
    const runId = (started.data as Record<string, unknown>).runId as string;
    const approval = await stream.waitForEvent("approval_required");
    const approvalId = (approval.data as Record<string, unknown>).approvalId as string;

    await httpRequest("POST", `${baseUrl}/api/launch-plan/approval`, {
      runId,
      approvalId,
      decision: "approved",
    });

    const resolved = await stream.waitForEvent("approval_resolved");
    expect((resolved.data as Record<string, unknown>).decision).toBe("approved");
    const completed = await stream.waitForEvent("run_completed");
    expect(completed).toBeDefined();

    stream.close();
    await close();
  });

  it("approval_required works via /api/runs/:runId/approve (legacy endpoint)", async () => {
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

    // Use the legacy /api/runs/:runId/approve endpoint.
    const res = await httpRequest("POST", `${baseUrl}/api/runs/${runId}/approve`);
    expect(res.statusCode).toBe(200);

    const completed = await stream.waitForEvent("run_completed");
    expect(completed).toBeDefined();

    stream.close();
    await close();
  });

  it("approval timeout auto-rejects after configured period", async () => {
    const gw = makeGateway({ [DEFAULT_MODEL]: { content: "Plan." } });
    setGateway(gw);
    setUseModelGateway(true);
    // Shorten the timeout to 200ms for this test.
    setApprovalTimeout(200);
    const app = createApp(gw);
    const { baseUrl, close } = await startServer(app);

    const stream = await startSSEStream(baseUrl, validInput());
    await stream.waitForEvent("approval_required");

    // Don't POST a decision — wait for the timeout to auto-reject.
    const resolved = await stream.waitForEvent("approval_resolved", 5000);
    expect((resolved.data as Record<string, unknown>).decision).toBe("rejected");

    const completed = await stream.waitForEvent("run_completed");
    expect(completed).toBeDefined();

    // Verify the safe stop message was emitted.
    const textDeltas = stream.events.filter((e) => e.event === "text_delta");
    const allText = textDeltas.map((e) => (e.data as Record<string, unknown>).delta as string).join("");
    expect(allText).toContain("Run stopped");

    stream.close();
    await close();
  });
});
