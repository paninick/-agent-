import { afterEach, beforeEach, describe, expect, it } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { createApp } from "../server";
import { FakeModelGateway, type FakeModelGatewayConfig } from "../integration";
import { SwarmOrchestrator, type Run, type RunIntentResult } from "../runtime";

// ===== Fixtures =====

function fakeConfig(responses: Record<string, { content: string }> = {}): FakeModelGatewayConfig {
  return { responses };
}

function makeGateway(responses: Record<string, { content: string }> = {}): FakeModelGateway {
  return new FakeModelGateway(fakeConfig(responses));
}

/** Start a temporary HTTP server on a random port. Returns baseUrl + close. */
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

/** Send an HTTP request and return { statusCode, headers, body }. */
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

// ===== P12 Runs API HTTP Integration (13) =====

describe("P12 Runs API HTTP Integration", () => {
  let cleanup: (() => Promise<void>) | null = null;

  afterEach(async () => {
    if (cleanup) { await cleanup(); cleanup = null; }
  });

  // ===== POST /api/runs (3) =====

  it("POST /api/runs creates a run and returns 201 with runId, status, workflow", async () => {
    const gw = makeGateway();
    const orch = new SwarmOrchestrator();
    const app = createApp(gw, orch);
    const { baseUrl, close } = await startServer(app);
    cleanup = close;

    const res = await httpRequest("POST", `${baseUrl}/api/runs`, { intent: "Deploy release v2.1" });
    const body = JSON.parse(res.body) as RunIntentResult;

    expect(res.statusCode).toBe(201);
    expect(body.runId).toMatch(/^run_/);
    expect(body.status).toBe("waiting_approval");
    expect(body.approvalRequired).toBe(true);
    expect(body.waitingApprovalNodeId).toBe("002_approval");
    expect(body.workflow.nodes.length).toBeGreaterThan(0);
    expect(body.costSummary.currency).toBe("USD");
  });

  it("POST /api/runs returns 400 when intent is missing", async () => {
    const gw = makeGateway();
    const app = createApp(gw, new SwarmOrchestrator());
    const { baseUrl, close } = await startServer(app);
    cleanup = close;

    const res = await httpRequest("POST", `${baseUrl}/api/runs`, {});
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(400);
    expect(body.error).toBe("invalid_input");
  });

  it("POST /api/runs returns 400 when intent is empty string", async () => {
    const gw = makeGateway();
    const app = createApp(gw, new SwarmOrchestrator());
    const { baseUrl, close } = await startServer(app);
    cleanup = close;

    const res = await httpRequest("POST", `${baseUrl}/api/runs`, { intent: "" });
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(400);
    expect(body.error).toBe("invalid_input");
  });

  // ===== GET /api/runs (2) =====

  it("GET /api/runs lists all runs", async () => {
    const gw = makeGateway();
    const orch = new SwarmOrchestrator();
    const app = createApp(gw, orch);
    const { baseUrl, close } = await startServer(app);
    cleanup = close;

    // Create two runs.
    await httpRequest("POST", `${baseUrl}/api/runs`, { intent: "First run" });
    await httpRequest("POST", `${baseUrl}/api/runs`, { intent: "Second run" });

    const res = await httpRequest("GET", `${baseUrl}/api/runs`);
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(body.runs)).toBe(true);
    expect(body.runs.length).toBe(2);
    expect(body.runs[0].runId).toMatch(/^run_/);
    expect(body.runs[1].runId).toMatch(/^run_/);
  });

  it("GET /api/runs returns empty runs array when no runs created", async () => {
    const gw = makeGateway();
    const app = createApp(gw, new SwarmOrchestrator());
    const { baseUrl, close } = await startServer(app);
    cleanup = close;

    const res = await httpRequest("GET", `${baseUrl}/api/runs`);
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.runs).toEqual([]);
  });

  // ===== GET /api/runs/:runId (2) =====

  it("GET /api/runs/:runId returns the run state", async () => {
    const gw = makeGateway();
    const orch = new SwarmOrchestrator();
    const app = createApp(gw, orch);
    const { baseUrl, close } = await startServer(app);
    cleanup = close;

    const created = await httpRequest("POST", `${baseUrl}/api/runs`, { intent: "Inspect run" });
    const run = JSON.parse(created.body) as RunIntentResult;

    const res = await httpRequest("GET", `${baseUrl}/api/runs/${run.runId}`);
    const body = JSON.parse(res.body) as Run;

    expect(res.statusCode).toBe(200);
    expect(body.runId).toBe(run.runId);
    expect(body.intent).toBe("Inspect run");
    expect(body.status).toBe("waiting_approval");
    expect(body.waitingApprovalNodeId).toBe("002_approval");
  });

  it("GET /api/runs/:runId returns 404 for unknown runId", async () => {
    const gw = makeGateway();
    const app = createApp(gw, new SwarmOrchestrator());
    const { baseUrl, close } = await startServer(app);
    cleanup = close;

    const res = await httpRequest("GET", `${baseUrl}/api/runs/run_nonexistent`);
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(404);
    expect(body.error).toBe("run_not_found");
  });

  // ===== Approve / Reject / Resume lifecycle (5) =====

  it("POST /api/runs/:runId/approve approves a waiting_approval run", async () => {
    const gw = makeGateway();
    const orch = new SwarmOrchestrator();
    const app = createApp(gw, orch);
    const { baseUrl, close } = await startServer(app);
    cleanup = close;

    const created = await httpRequest("POST", `${baseUrl}/api/runs`, { intent: "Approve me" });
    const run = JSON.parse(created.body) as RunIntentResult;

    const res = await httpRequest("POST", `${baseUrl}/api/runs/${run.runId}/approve`);
    const body = JSON.parse(res.body) as Run;

    expect(res.statusCode).toBe(200);
    expect(body.status).toBe("paused");
    expect(body.contextSnapshot["approval.002_approval"]).toBe("approved");
  });

  it("POST /api/runs/:runId/approve returns 409 for non-waiting run", async () => {
    const gw = makeGateway();
    const orch = new SwarmOrchestrator();
    const app = createApp(gw, orch);
    const { baseUrl, close } = await startServer(app);
    cleanup = close;

    const created = await httpRequest("POST", `${baseUrl}/api/runs`, { intent: "Approve twice" });
    const run = JSON.parse(created.body) as RunIntentResult;

    // First approve — should succeed.
    await httpRequest("POST", `${baseUrl}/api/runs/${run.runId}/approve`);

    // Second approve — should fail with 409 (run is now paused, not waiting_approval).
    const res = await httpRequest("POST", `${baseUrl}/api/runs/${run.runId}/approve`);
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(409);
    expect(body.error).toBe("invalid_state");
  });

  it("POST /api/runs/:runId/reject rejects a waiting_approval run", async () => {
    const gw = makeGateway();
    const orch = new SwarmOrchestrator();
    const app = createApp(gw, orch);
    const { baseUrl, close } = await startServer(app);
    cleanup = close;

    const created = await httpRequest("POST", `${baseUrl}/api/runs`, { intent: "Reject me" });
    const run = JSON.parse(created.body) as RunIntentResult;

    const res = await httpRequest("POST", `${baseUrl}/api/runs/${run.runId}/reject`);
    const body = JSON.parse(res.body) as Run;

    expect(res.statusCode).toBe(200);
    expect(body.status).toBe("rejected");
  });

  it("POST /api/runs/:runId/resume resumes a paused run to completion", async () => {
    const gw = makeGateway();
    const orch = new SwarmOrchestrator();
    const app = createApp(gw, orch);
    const { baseUrl, close } = await startServer(app);
    cleanup = close;

    const created = await httpRequest("POST", `${baseUrl}/api/runs`, { intent: "Full lifecycle" });
    const run = JSON.parse(created.body) as RunIntentResult;

    // Approve → paused.
    await httpRequest("POST", `${baseUrl}/api/runs/${run.runId}/approve`);

    // Resume → completed.
    const res = await httpRequest("POST", `${baseUrl}/api/runs/${run.runId}/resume`);
    const body = JSON.parse(res.body) as Run;

    expect(res.statusCode).toBe(200);
    expect(body.status).toBe("completed");
    expect(body.completedNodeIds).toEqual(["001_prepare", "002_approval", "003_finalize"]);
    expect(body.contextSnapshot.finalized).toBe(true);
  });

  it("POST /api/runs/:runId/resume returns 409 for non-paused run", async () => {
    const gw = makeGateway();
    const orch = new SwarmOrchestrator();
    const app = createApp(gw, orch);
    const { baseUrl, close } = await startServer(app);
    cleanup = close;

    const created = await httpRequest("POST", `${baseUrl}/api/runs`, { intent: "Resume too early" });
    const run = JSON.parse(created.body) as RunIntentResult;

    // Try to resume without approving — should fail.
    const res = await httpRequest("POST", `${baseUrl}/api/runs/${run.runId}/resume`);
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(409);
    expect(body.error).toBe("invalid_state");
  });

  // ===== GET /api/runs/:runId/audit (1) =====

  it("GET /api/runs/:runId/audit returns audit events for a run", async () => {
    const gw = makeGateway();
    const orch = new SwarmOrchestrator();
    const app = createApp(gw, orch);
    const { baseUrl, close } = await startServer(app);
    cleanup = close;

    const created = await httpRequest("POST", `${baseUrl}/api/runs`, { intent: "Audit trail" });
    const run = JSON.parse(created.body) as RunIntentResult;

    const res = await httpRequest("GET", `${baseUrl}/api/runs/${run.runId}/audit`);
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(body.events)).toBe(true);
    expect(body.events.length).toBeGreaterThan(0);
    // Should include run_created and node_started events.
    const types = body.events.map((e: { type: string }) => e.type);
    expect(types).toContain("run_created");
    expect(types).toContain("node_started");
    expect(types).toContain("waiting_approval");
  });
});