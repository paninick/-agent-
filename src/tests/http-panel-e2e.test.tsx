/**
 * E2E integration test: HTTP server → IntelligencePanel component
 *
 * Spins up a real HTTP server (createApp) and renders IntelligencePanel in jsdom.
 * The panel's fetch("/api/...") calls are relayed to the real server so the
 * component receives authentic response shapes (intent, budget, costRecord,
 * collectionLog, swarmRun.results) — not a hand-crafted mock object.
 *
 * This bridges the gap between http-intelligence-routes.test.ts (server only)
 * and intelligence-panel.test.tsx (component with mock fetch).
 */
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { createApp } from "../server";
import { FakeModelGateway } from "../integration";
import { IntelligencePanel } from "../client/IntelligencePanel";

// React act environment
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// ResizeObserver polyfill for React Flow
class ResizeObserverPolyfill {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_cb: ResizeObserverCallback) {}
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverPolyfill;

// ---------------------------------------------------------------------------
// HTTP server helpers
// ---------------------------------------------------------------------------

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

/** Relay fetch to the real HTTP server for /api/ calls; stub external APIs as 404. */
function makeRelayFetch(baseUrl: string) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

    // Only relay /api/* calls to our test server
    if (url.includes("/api/")) {
      const parsed = new URL(url.startsWith("http") ? url : `${baseUrl}${url}`);
      return new Promise<Response>((resolve, reject) => {
        const options: http.RequestOptions = {
          method: init?.method ?? "GET",
          hostname: parsed.hostname,
          port: parsed.port,
          path: parsed.pathname + parsed.search,
          headers: init?.body !== undefined ? { "Content-Type": "application/json" } : {},
        };
        const req = http.request(options, (res) => {
          let data = "";
          res.setEncoding("utf8");
          res.on("data", (chunk) => { data += chunk; });
          res.on("end", () => {
            resolve(new Response(data, {
              status: res.statusCode ?? 200,
              headers: { "Content-Type": "application/json" },
            }));
          });
        });
        req.on("error", reject);
        if (init?.body !== undefined) req.write(init.body);
        req.end();
      });
    }

    // External API calls (world-bank, sec-edgar, etc.) → 404 stub
    return new Response(JSON.stringify({ error: "not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  });
}

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderPanel() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(createElement(IntelligencePanel));
  });
}

function cleanupDOM() {
  if (root) {
    act(() => { root!.unmount(); });
    root = null;
  }
  if (container) { container.remove(); container = null; }
  document.body.innerHTML = "";
}

/** Poll for a selector to appear in the DOM, with act-wrapped flushes. */
async function waitForSelector(selector: string, timeoutMs = 5000): Promise<Element | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    act(() => { /* flush pending React state updates */ });
    const el = container!.querySelector(selector);
    if (el) return el;
    await new Promise((r) => setTimeout(r, 100));
  }
  return container!.querySelector(selector);
}

/** Poll for text content to appear. */
async function waitForText(text: string, timeoutMs = 5000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    act(() => { /* flush */ });
    if (container!.textContent?.includes(text)) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return container!.textContent?.includes(text) ?? false;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("HTTP → Panel E2E", () => {
  let cleanup: (() => Promise<void>) | null = null;
  let fetchSpy: ReturnType<typeof vi.spyOn> | null = null;

  afterEach(async () => {
    // Close server first to stop any in-flight requests (with safety timeout)
    if (fetchSpy) { fetchSpy.mockRestore(); fetchSpy = null; }
    cleanupDOM();
    if (cleanup) {
      await Promise.race([
        cleanup(),
        new Promise((r) => setTimeout(r, 3000)),
      ]);
      cleanup = null;
    }
  });

  it("renders full result from real HTTP server response", { timeout: 15000 }, async () => {
    const app = createApp(new FakeModelGateway({ responses: {} }));
    const { baseUrl, close } = await startServer(app);
    cleanup = close;

    fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(makeRelayFetch(baseUrl));

    renderPanel();

    // Click the run button with default objective
    const btn = container!.querySelector(".intel-run-btn") as HTMLButtonElement;
    expect(btn).toBeTruthy();

    await act(async () => {
      btn.click();
    });

    // Wait for the result to appear (swarm runs through real orchestrator)
    const intelResult = await waitForSelector(".intel-result", 8000);
    expect(intelResult).toBeTruthy();

    // collectionLog should have entries (even if sources returned 404)
    const logEntries = container!.querySelectorAll(".intel-log-item");
    expect(logEntries.length).toBeGreaterThan(0);

    // Budget should be visible ($1.00 max)
    const hasBudget = await waitForText("$1.00", 2000);
    expect(hasBudget).toBe(true);

    // Verify the relay actually called the server
    const swarmCalls = fetchSpy!.mock.calls.filter(
      ([url]: unknown[]) => typeof url === "string" && (url as string).includes("/api/intelligence/swarm"),
    );
    expect(swarmCalls.length).toBe(1);
  });

  it("renders cost breakdown from real server costRecord", { timeout: 15000 }, async () => {
    const app = createApp(new FakeModelGateway({ responses: {} }));
    const { baseUrl, close } = await startServer(app);
    cleanup = close;

    fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(makeRelayFetch(baseUrl));

    renderPanel();

    const btn = container!.querySelector(".intel-run-btn") as HTMLButtonElement;
    await act(async () => { btn.click(); });

    // Wait for cost breakdown to render
    const costBreakdown = await waitForSelector(".intel-cost-breakdown", 8000);
    expect(costBreakdown).toBeTruthy();

    // Should show total cost in the summary
    const summary = costBreakdown!.querySelector("summary");
    expect(summary?.textContent).toMatch(/\$/);

    // Budget line should exist
    const budgetLine = container!.querySelector(".intel-cost-budget-line");
    expect(budgetLine).toBeTruthy();
    expect(budgetLine!.textContent).toContain("预算");
  });

  it("renders swarm steps with role names from real response", { timeout: 15000 }, async () => {
    const app = createApp(new FakeModelGateway({ responses: {} }));
    const { baseUrl, close } = await startServer(app);
    cleanup = close;

    fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(makeRelayFetch(baseUrl));

    renderPanel();

    const btn = container!.querySelector(".intel-run-btn") as HTMLButtonElement;
    await act(async () => { btn.click(); });

    // Wait for swarm steps to render
    const steps = await waitForSelector(".intel-step", 8000);
    expect(steps).toBeTruthy();

    // Should have at least 1 step (swarm may run fewer steps with empty data)
    const allSteps = container!.querySelectorAll(".intel-step");
    expect(allSteps.length).toBeGreaterThanOrEqual(1);

    // Should mention collector or verifier or other role names in the rendered steps
    const text = container!.textContent ?? "";
    const roleMentioned = ["collector", "verifier", "analyst", "synthesizer", "memory"].some(
      (role) => text.toLowerCase().includes(role),
    );
    expect(roleMentioned).toBe(true);
  });
});