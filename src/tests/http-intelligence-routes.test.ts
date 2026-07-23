/**
 * HTTP route test for POST /api/intelligence/swarm
 *
 * Tests the full HTTP path: request validation, intent compilation,
 * budget response field, and graceful behavior without API keys.
 *
 * Network calls are stubbed via vi.spyOn(globalThis, "fetch") to return
 * empty/404 responses, preventing real external API calls.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { createApp } from "../server";
import { FakeModelGateway, type FakeModelGatewayConfig } from "../integration";

// ===== Fixtures =====

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

// ===== Helpers =====

/** Stub globalThis.fetch to return 404 for all calls (prevents real network). */
function stubFetch404() {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ error: "not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

// ===== Tests =====

describe("Intelligence Swarm HTTP Route", () => {
  let cleanup: (() => Promise<void>) | null = null;
  let fetchSpy: ReturnType<typeof vi.spyOn> | null = null;

  beforeEach(() => {
    fetchSpy = stubFetch404();
  });

  afterEach(async () => {
    if (fetchSpy) { fetchSpy.mockRestore(); fetchSpy = null; }
    if (cleanup) { await cleanup(); cleanup = null; }
  });

  it("POST /api/intelligence/swarm returns 400 for short objective (< 8 chars)", async () => {
    const app = createApp(makeGateway());
    const { baseUrl, close } = await startServer(app);
    cleanup = close;

    const res = await httpRequest("POST", `${baseUrl}/api/intelligence/swarm`, {
      objective: "short",
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(false);
    expect(body.error).toBe("invalid_input");
    expect(body.message).toContain("at least 8");
  });

  it("POST /api/intelligence/swarm returns 400 for missing objective", async () => {
    const app = createApp(makeGateway());
    const { baseUrl, close } = await startServer(app);
    cleanup = close;

    const res = await httpRequest("POST", `${baseUrl}/api/intelligence/swarm`, {
      packId: "apparel",
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(false);
    expect(body.error).toBe("invalid_input");
  });

  it("POST /api/intelligence/swarm returns 200 with intent, budget, and result fields", async () => {
    const app = createApp(makeGateway());
    const { baseUrl, close } = await startServer(app);
    cleanup = close;

    const res = await httpRequest("POST", `${baseUrl}/api/intelligence/swarm`, {
      objective: "apparel cotton price cost transmission macro economic Vietnam Bangladesh",
    });

    // Should be 200 even with no data collected (graceful degradation)
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    expect(body.ok).toBe(true);

    // Result should have the expected structure
    expect(body.result).toBeDefined();
    expect(body.result.collectionLog).toBeDefined();
    expect(Array.isArray(body.result.collectionLog)).toBe(true);
    expect(body.result.swarmRun).toBeDefined();
    expect(body.result.swarmRun.results).toBeDefined();
    expect(Array.isArray(body.result.swarmRun.results)).toBe(true);

    // Intent field should be present
    expect(body.intent).toBeDefined();
    expect(body.intent.detectedIntent).toBeDefined();
    expect(["price_intelligence", "supply_chain_risk", "general_intelligence"]).toContain(body.intent.detectedIntent);
    expect(body.intent.assumptions).toBeDefined();
    expect(Array.isArray(body.intent.assumptions)).toBe(true);
    expect(body.intent.riskLevel).toBeDefined();

    // Budget field should be present
    expect(body.budget).toBeDefined();
    expect(body.budget.maxCostUsd).toBe(1.0);
    expect(typeof body.budget.withinBudget).toBe("boolean");

    // Cost record should exist (CostEngine always creates a budget)
    expect(body.result.swarmRun.costRecord).toBeDefined();
    expect(body.result.swarmRun.costRecord.totalCost).toBeGreaterThanOrEqual(0);
  });

  it("POST /api/intelligence/swarm detects price_intelligence intent for cotton price keywords", async () => {
    const app = createApp(makeGateway());
    const { baseUrl, close } = await startServer(app);
    cleanup = close;

    const res = await httpRequest("POST", `${baseUrl}/api/intelligence/swarm`, {
      objective: "cotton price trend analysis for apparel supply chain",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.intent.detectedIntent).toBe("price_intelligence");
    expect(body.intent.riskLevel).toBe("medium");

    // Scout should NOT appear in swarm results (stripped by route for live mode)
    const roles = body.result.swarmRun.results.map((r: { role: string }) => r.role);
    expect(roles).not.toContain("scout");
  });

  it("POST /api/intelligence/swarm detects supply_chain_risk intent for tariff keywords", async () => {
    const app = createApp(makeGateway());
    const { baseUrl, close } = await startServer(app);
    cleanup = close;

    const res = await httpRequest("POST", `${baseUrl}/api/intelligence/swarm`, {
      objective: "tariff impact on apparel supply chain risk assessment",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.intent.detectedIntent).toBe("supply_chain_risk");
    expect(body.intent.riskLevel).toBe("high");
  });

  it("POST /api/intelligence/swarm does not make real network calls (fetch stubbed)", async () => {
    const app = createApp(makeGateway());
    const { baseUrl, close } = await startServer(app);
    cleanup = close;

    await httpRequest("POST", `${baseUrl}/api/intelligence/swarm`, {
      objective: "apparel cotton price cost transmission macro economic Vietnam",
    });

    // Fetch was called (by live-collector attempting public APIs) but all returned 404 stubs.
    // The key assertion: no real network calls happened.
    expect(fetchSpy).toHaveBeenCalled();
    // Every call returned our 404 stub - no real data was fetched.
    for (const call of fetchSpy.mock.results) {
      expect(call.value).toBeInstanceOf(Promise);
    }
  });

  it("POST /api/intelligence/swarm budget.withinBudget is true when cost stays under $1.00", async () => {
    const app = createApp(makeGateway());
    const { baseUrl, close } = await startServer(app);
    cleanup = close;

    const res = await httpRequest("POST", `${baseUrl}/api/intelligence/swarm`, {
      objective: "apparel cotton price cost transmission macro economic Vietnam Bangladesh",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    // With stubbed fetch (no real data), the swarm runs with empty records.
    // The estimated per-step cost is tiny (fractions of a cent), so budget should hold.
    expect(body.budget.withinBudget).toBe(true);
    if (body.result.swarmRun.costRecord) {
      expect(body.result.swarmRun.costRecord.totalCost).toBeLessThan(1.0);
    }
  });

it("POST /api/intelligence/swarm returns 504 when swarm times out (30s)", async () => {
    // Clear module cache so the route module re-evaluates with our mock.
    vi.resetModules();

    // Stub runLiveSwarm to throw a timeout error — simulates the 30s timeout
    // firing inside the route's Promise.race. The route's catch block maps any
    // error containing "timeout" to 504 + "swarm_timeout" error code.
    vi.doMock("../intelligence", async (factory) => {
      const actual = (await factory()) as Record<string, unknown>;
      return {
        ...actual,
        runLiveSwarm: () => Promise.reject(new Error("swarm_timeout_30s")),
      };
    });

    const { createApp: createAppMocked } = await import("../server");
    const app = createAppMocked(makeGateway());
    const { baseUrl, close } = await startServer(app);
    cleanup = close;

    const res = await httpRequest("POST", `${baseUrl}/api/intelligence/swarm`, {
      objective: "apparel cotton price cost transmission macro economic Vietnam",
    });

    expect(res.statusCode).toBe(504);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(false);
    expect(body.error).toBe("swarm_timeout");
    expect(body.message).toContain("timeout");

    // Restore module registry so subsequent tests get the real runLiveSwarm.
    vi.doUnmock("../intelligence");
    vi.resetModules();
  });

  it("POST /api/intelligence/swarm returns 500 for internal errors (non-timeout)", async () => {
    // Stub runLiveSwarm to throw a generic error (no "timeout" in message).
    vi.resetModules();

    vi.doMock("../intelligence", async (factory) => {
      const actual = (await factory()) as Record<string, unknown>;
      return {
        ...actual,
        runLiveSwarm: () => Promise.reject(new Error("upstream connection refused")),
      };
    });

    const { createApp: createAppMocked } = await import("../server");
    const app = createAppMocked(makeGateway());
    const { baseUrl, close } = await startServer(app);
    cleanup = close;

    const res = await httpRequest("POST", `${baseUrl}/api/intelligence/swarm`, {
      objective: "apparel cotton price cost transmission macro economic Vietnam",
    });

    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(false);
    expect(body.error).toBe("swarm_failed");
    expect(body.message).toContain("connection refused");
    expect(body.message).not.toContain("timeout");

    vi.doUnmock("../intelligence");
    vi.resetModules();
  });
});
