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

// ===== P11 HTTP/SSE Integration (10) =====

describe("P11 HTTP/SSE Integration Test", () => {
  let cleanup: (() => Promise<void>) | null = null;

  beforeEach(() => {
    setSkillRegistry(createSkillRegistry());
  });

  afterEach(async () => {
    if (cleanup) { await cleanup(); cleanup = null; }
    resetInjection();
  });

  // ===== GET /api/health (3) =====

  it("GET /api/health returns 200 with ok:true and model fields", async () => {
    const gw = makeGateway({ "test-model": { content: "ok" } });
    const app = createApp(gw);
    const { baseUrl, close } = await startServer(app);
    cleanup = close;

    const res = await httpRequest("GET", `${baseUrl}/api/health`);
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.hasProviderKey).toBe(true);
    expect(Array.isArray(body.availableModels)).toBe(true);
  });

  it("GET /api/health reports availableModels matching the gateway", async () => {
    const gw = makeGateway({
      "deepseek-v4-flash": { content: "ok" },
      "doubao-seed-2.0-pro": { content: "ok" },
    });
    const app = createApp(gw);
    const { baseUrl, close } = await startServer(app);
    cleanup = close;

    const res = await httpRequest("GET", `${baseUrl}/api/health`);
    const body = JSON.parse(res.body);

    expect(body.availableModels).toEqual(["deepseek-v4-flash", "doubao-seed-2.0-pro"]);
    expect(body.model).toBe("deepseek-v4-flash");
  });

  it("GET /api/health hasProviderKey is true when gateway has models (no OPENAI_API_KEY needed)", async () => {
    const gw = makeGateway({ "m": { content: "ok" } });
    const app = createApp(gw);
    const { baseUrl, close } = await startServer(app);
    cleanup = close;

    const res = await httpRequest("GET", `${baseUrl}/api/health`);
    const body = JSON.parse(res.body);

    expect(body.hasProviderKey).toBe(true);
    expect(body.availableModels.length).toBeGreaterThan(0);
  });

  // ===== POST /api/launch-plan SSE (5) =====

  it("POST /api/launch-plan returns SSE stream with run_started, text_delta, run_completed", async () => {
    const gw = makeGateway({ [DEFAULT_MODEL]: { content: "Release plan ready." } });
    setGateway(gw);
    setUseModelGateway(true);
    const app = createApp(gw);
    const { baseUrl, close } = await startServer(app);
    cleanup = close;

    const res = await httpRequest("POST", `${baseUrl}/api/launch-plan`, validInput());

    expect(res.headers["content-type"]).toContain("text/event-stream");
    const events = parseSSE(res.body);
    const types = events.map((e) => e.event);

    expect(types).toContain("run_started");
    expect(types).toContain("text_delta");
    expect(types).toContain("run_completed");
  });

  it("POST /api/launch-plan SSE events have valid event: and data: lines with JSON data", async () => {
    const gw = makeGateway({ [DEFAULT_MODEL]: { content: "Plan." } });
    setGateway(gw);
    setUseModelGateway(true);
    const app = createApp(gw);
    const { baseUrl, close } = await startServer(app);
    cleanup = close;

    const res = await httpRequest("POST", `${baseUrl}/api/launch-plan`, validInput());
    const events = parseSSE(res.body);

    expect(events.length).toBeGreaterThan(0);
    for (const ev of events) {
      expect(ev.event.length).toBeGreaterThan(0);
      expect(ev.data).toBeDefined();
      // data should be a parsed object (not a raw string)
      expect(typeof ev.data).toBe("object");
    }

    // run_started event should have model field
    const started = events.find((e) => e.event === "run_started");
    expect(started).toBeDefined();
    expect((started!.data as Record<string, unknown>).model).toBeDefined();
  });

  it("POST /api/launch-plan returns error SSE event when productBrief is too short", async () => {
    const gw = makeGateway({ [DEFAULT_MODEL]: { content: "ok" } });
    setGateway(gw);
    setUseModelGateway(true);
    const app = createApp(gw);
    const { baseUrl, close } = await startServer(app);
    cleanup = close;

    const res = await httpRequest("POST", `${baseUrl}/api/launch-plan`, {
      productBrief: "too short",
    });
    const events = parseSSE(res.body);
    const error = events.find((e) => e.event === "error");

    expect(error).toBeDefined();
    const msg = (error!.data as Record<string, unknown>).message;
    expect(typeof msg).toBe("string");
    expect((msg as string).length).toBeGreaterThan(0);
  });

  it("POST /api/launch-plan returns error SSE event when productBrief is missing", async () => {
    const gw = makeGateway({ [DEFAULT_MODEL]: { content: "ok" } });
    setGateway(gw);
    setUseModelGateway(true);
    const app = createApp(gw);
    const { baseUrl, close } = await startServer(app);
    cleanup = close;

    const res = await httpRequest("POST", `${baseUrl}/api/launch-plan`, {
      audience: "testers",
    });
    const events = parseSSE(res.body);
    const error = events.find((e) => e.event === "error");

    expect(error).toBeDefined();
  });

  it("POST /api/launch-plan preflight fails when no provider keys and no OPENAI_API_KEY", async () => {
    // Empty gateway = no models available. Also ensure OPENAI_API_KEY is not set.
    const gw = makeGateway({});
    const app = createApp(gw);
    const { baseUrl, close } = await startServer(app);
    cleanup = close;

    const res = await httpRequest("POST", `${baseUrl}/api/launch-plan`, validInput());
    const events = parseSSE(res.body);

    // Should get exactly one error event about missing API keys.
    const error = events.find((e) => e.event === "error");
    expect(error).toBeDefined();
    const msg = (error!.data as Record<string, unknown>).message;
    expect(msg).toContain("API keys");
  });

  it("POST /api/launch-plan propagates gateway errors as SSE error events", async () => {
    const gw = new FakeModelGateway({
      responses: {},
      errorOverrides: [{ errorKind: "auth_failed", message: "Invalid API key" }],
    });
    setGateway(gw);
    setUseModelGateway(true);
    const app = createApp(gw);
    const { baseUrl, close } = await startServer(app);
    cleanup = close;

    const res = await httpRequest("POST", `${baseUrl}/api/launch-plan`, validInput());
    const events = parseSSE(res.body);
    const error = events.find((e) => e.event === "error");

    expect(error).toBeDefined();
    const msg = (error!.data as Record<string, unknown>).message;
    expect(typeof msg).toBe("string");
    expect((msg as string).length).toBeGreaterThan(0);
  });

  // ===== Boundary (1) =====

  it("HTTP integration test path does not call fetch (uses FakeModelGateway)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const gw = makeGateway({ [DEFAULT_MODEL]: { content: "No fetch." } });
    setGateway(gw);
    setUseModelGateway(true);
    const app = createApp(gw);
    const { baseUrl, close } = await startServer(app);
    cleanup = close;

    await httpRequest("POST", `${baseUrl}/api/launch-plan`, validInput());

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
