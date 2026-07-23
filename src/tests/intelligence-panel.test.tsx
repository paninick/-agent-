// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";

// Tell React this is an act-enabled environment.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// React Flow v12 requires ResizeObserver which jsdom does not provide.
class ResizeObserverPolyfill {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_cb: ResizeObserverCallback) {}
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverPolyfill;

import { IntelligencePanel } from "../client/IntelligencePanel";

// ---------------------------------------------------------------------------
// Helpers
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
    act(() => {
      root!.unmount();
    });
    root = null;
  }
  if (container) {
    container.remove();
    container = null;
  }
  document.body.innerHTML = "";
}

/**
 * Build a mock SSE ReadableStream that emits step events + done event.
 * The response object has the same shape as the DONE event from the server.
 */
function buildSSEStream(stepEvents: unknown[], doneEvent: unknown): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const allEvents = [...stepEvents, doneEvent];
  let index = 0;

  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < allEvents.length) {
        const data = `data: ${JSON.stringify(allEvents[index])}\n\n`;
        controller.enqueue(encoder.encode(data));
        index++;
      } else {
        controller.close();
      }
    },
  });
}

/** Build a canned successful SSE response with step events + done event. */
function mockSwarmSuccess(overrides?: {
  withinBudget?: boolean;
  maxCostUsd?: number;
  totalCost?: number;
  detectedIntent?: string;
}) {
  const withinBudget = overrides?.withinBudget ?? true;
  const maxCostUsd = overrides?.maxCostUsd ?? 1.0;
  const totalCost = overrides?.totalCost ?? 0.042;
  const detectedIntent = overrides?.detectedIntent ?? "price_intelligence";

  const liveResult = {
    candidateSourceIds: ["src-cotton-index", "src-fiber-exchange"],
    collectionLog: [
      { sourceId: "src-cotton-index", status: "collected", recordCount: 3 },
      { sourceId: "src-fiber-exchange", status: "collected", recordCount: 2 },
      { sourceId: "src-yarn-trends", status: "skipped_no_key", recordCount: 0 },
    ],
    rawRecordCount: 5,
    swarmRun: {
      triggerId: "trg-001",
      results: [
        {
          taskId: "t-scout",
          role: "scout",
          status: "completed",
          evidence: {
            id: "ev-1",
            sourceId: "src-cotton-index",
            sourceTier: "T1",
            subject: "Cotton price index",
            claim: "Cotton A Index rose 2.3% WoW",
            value: 2.3,
            unit: "%",
            period: "weekly",
            geography: "global",
          },
        },
        { taskId: "t-collector", role: "collector", status: "completed" },
        { taskId: "t-verifier", role: "verifier", status: "completed" },
        { taskId: "t-analyst", role: "analyst", status: "completed" },
        {
          taskId: "t-synth",
          role: "synthesizer",
          status: "completed",
          synthesis: {
            title: "Cotton Price Weekly Brief",
            brief: "Cotton prices rose 2.3% week-on-week driven by supply tightening.",
            confidence: 0.78,
            evidenceIds: ["ev-1"],
          },
        },
        { taskId: "t-mem", role: "memory", status: "completed" },
      ],
      synthesis: {
        title: "Cotton Price Weekly Brief",
        brief: "Cotton prices rose 2.3% week-on-week driven by supply tightening.",
        confidence: 0.78,
        evidenceIds: ["ev-1"],
      },
      costRecord: { totalCost, modelCost: totalCost * 0.8, toolCost: 0, mcpCost: totalCost * 0.2 },
    },
  };

  // Build SSE step events (one per swarm result)
  const stepEvents = liveResult.swarmRun.results.map((r, i) => ({
    step: i + 1,
    total: liveResult.swarmRun.results.length,
    role: r.role,
    status: r.status,
    result: r,
    phase: i < 2 ? "Phase 1: Collection & Cleaning" : i < 5 ? "Phase 2: Verification & Analysis" : "Phase 3: Adjudication & Synthesis",
  }));

  const doneEvent = {
    done: true,
    result: liveResult,
    intent: {
      detectedIntent,
      assumptions: [
        "User wants current price/cost intelligence for apparel supply chain.",
        "Scout will match data sources covering raw materials.",
      ],
      riskLevel: "medium",
    },
    budget: { maxCostUsd, withinBudget },
  };

  const stream = buildSSEStream(stepEvents, doneEvent);

  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    body: stream,
  } as Response);
  return { fetchMock, response: doneEvent };
}

/** Build a canned error SSE response (done event with error field). */
function mockSwarmError(message: string) {
  const doneEvent = { done: true, result: null, error: message };
  const stream = buildSSEStream([], doneEvent);

  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    body: stream,
  } as Response);
  return { fetchMock, response: doneEvent };
}

/** Build a deferred SSE stream (for loading-state tests). */
function mockSwarmDeferred(): {
  fetchMock: ReturnType<typeof vi.fn>;
  resolveFetch: (val: unknown) => void;
} {
  let resolver: ((val: unknown) => void) | null = null;
  const fetchMock = vi.fn().mockImplementation(() => {
    return new Promise((resolve) => {
      resolver = resolve;
    });
  });
  const resolveFetch = (val: unknown): void => {
    resolver?.(val);
  };
  return { fetchMock, resolveFetch };
}

/** Build a minimal SSE response (no costRecord). */
function mockSwarmNoCost() {
  const liveResult = {
    candidateSourceIds: [],
    collectionLog: [],
    rawRecordCount: 0,
    swarmRun: { triggerId: "t", results: [] },
  };
  const doneEvent = {
    done: true,
    result: liveResult,
    intent: { detectedIntent: "general_intelligence", assumptions: [], riskLevel: "low" },
    budget: { maxCostUsd: 1.0, withinBudget: true },
  };
  const stream = buildSSEStream([], doneEvent);

  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    body: stream,
  } as Response);
  return { fetchMock };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("IntelligencePanel", () => {
  it("renders the panel shell with title and textarea on mount", () => {
    renderPanel();

    const title = container!.querySelector(".panel-title");
    expect(title).not.toBeNull();
    expect(title!.textContent).toContain("INTELLIGENCE SWARM");

    const textarea = container!.querySelector("textarea") as HTMLTextAreaElement;
    expect(textarea).not.toBeNull();
    expect(textarea.value.length).toBeGreaterThanOrEqual(8);

    cleanupDOM();
  });

  it("shows empty-state before any run", () => {
    renderPanel();

    const empty = container!.querySelector(".empty-state");
    expect(empty).not.toBeNull();
    expect(empty!.textContent).toContain("尚未运行");

    cleanupDOM();
  });

  it("shows error when objective is too short (< 8 chars)", () => {
    renderPanel();

    const textarea = container!.querySelector("textarea") as HTMLTextAreaElement;
    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )!.set!;
    act(() => {
      setter.call(textarea, "short");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const btn = container!.querySelector(".intel-run-btn") as HTMLButtonElement;
    act(() => {
      btn.click();
    });

    const banner = container!.querySelector(".error-banner");
    expect(banner).not.toBeNull();
    expect(banner!.textContent).toContain("8");

    cleanupDOM();
  });

  it("renders cost metric, intent bar, and budget indicator after successful run", async () => {
    const { fetchMock } = mockSwarmSuccess();
    vi.stubGlobal("fetch", fetchMock);

    renderPanel();

    const btn = container!.querySelector(".intel-run-btn") as HTMLButtonElement;
    await act(async () => {
      btn.click();
      await new Promise((r) => setTimeout(r, 50));
    });

    // cost metric
    const costMetric = container!.querySelector(".intel-metric-cost");
    expect(costMetric).not.toBeNull();
    expect(costMetric!.textContent).toContain("$0.0420");
    expect(costMetric!.textContent).toContain("预算 $1.00");

    // budget within — no overrun class
    expect(costMetric!.classList.contains("intel-metric-overrun")).toBe(false);

    // intent bar
    const intentBar = container!.querySelector(".intel-intent-bar");
    expect(intentBar).not.toBeNull();
    expect(intentBar!.textContent).toContain("price_intelligence");
    expect(intentBar!.textContent).toContain("medium");
    expect(intentBar!.textContent).toContain("2 条假设");

    // synthesis
    const brief = container!.querySelector(".intel-brief-title");
    expect(brief).not.toBeNull();
    expect(brief!.textContent).toContain("Cotton Price Weekly Brief");

    vi.unstubAllGlobals();
    cleanupDOM();
  });

  it("applies overrun styling when budget is exceeded", async () => {
    const { fetchMock } = mockSwarmSuccess({
      withinBudget: false,
      maxCostUsd: 0.5,
      totalCost: 0.8,
    });
    vi.stubGlobal("fetch", fetchMock);

    renderPanel();

    const btn = container!.querySelector(".intel-run-btn") as HTMLButtonElement;
    await act(async () => {
      btn.click();
      await new Promise((r) => setTimeout(r, 50));
    });

    const costMetric = container!.querySelector(".intel-metric-cost");
    expect(costMetric).not.toBeNull();
    expect(costMetric!.classList.contains("intel-metric-overrun")).toBe(true);
    expect(costMetric!.textContent).toContain("超支");

    vi.unstubAllGlobals();
    cleanupDOM();
  });

  it("displays error banner when swarm returns ok:false", async () => {
    const { fetchMock } = mockSwarmError("All collectors failed");
    vi.stubGlobal("fetch", fetchMock);

    renderPanel();

    const btn = container!.querySelector(".intel-run-btn") as HTMLButtonElement;
    await act(async () => {
      btn.click();
      await new Promise((r) => setTimeout(r, 50));
    });

    const banner = container!.querySelector(".error-banner");
    expect(banner).not.toBeNull();
    expect(banner!.textContent).toContain("All collectors failed");

    vi.unstubAllGlobals();
    cleanupDOM();
  });

  it("calls fetch with POST /api/intelligence/swarm and correct body", async () => {
    const { fetchMock } = mockSwarmSuccess();
    vi.stubGlobal("fetch", fetchMock);

    renderPanel();

    const btn = container!.querySelector(".intel-run-btn") as HTMLButtonElement;
    await act(async () => {
      btn.click();
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/intelligence/swarm/stream");
    expect((opts as RequestInit).method).toBe("POST");

    const body = JSON.parse((opts as RequestInit).body as string);
    expect(body.packId).toBe("apparel");
    expect(body.objective.length).toBeGreaterThanOrEqual(8);

    vi.unstubAllGlobals();
    cleanupDOM();
  });

  it("shows loading state while fetch is in-flight", async () => {
    // Use a deferred fetch so we can observe loading state.
    const { fetchMock, resolveFetch } = mockSwarmDeferred();
    vi.stubGlobal("fetch", fetchMock);

    renderPanel();

    const btn = container!.querySelector(".intel-run-btn") as HTMLButtonElement;
    act(() => {
      btn.click();
    });

    // loading state should show (streaming = true, steps not yet received)
    const streaming = container!.querySelector(".intel-streaming");
    expect(streaming).not.toBeNull();
    // The run button should be disabled while streaming
    const runBtn = container!.querySelector(".intel-run-btn") as HTMLButtonElement;
    expect(runBtn.disabled).toBe(true);
    // The cancel button should appear during streaming
    const cancelBtn = container!.querySelector(".intel-cancel-btn");
    expect(cancelBtn).not.toBeNull();
    // The progress bar should be visible
    const progress = container!.querySelector(".intel-stream-progress");
    expect(progress).not.toBeNull();

    // Clean up — resolve the deferred fetch to avoid unhandled rejections
    const liveResult = {
      candidateSourceIds: [],
      collectionLog: [],
      rawRecordCount: 0,
      swarmRun: { triggerId: "t", results: [] },
    };
    const stream = buildSSEStream([], { done: true, result: liveResult });
    resolveFetch?.({ ok: true, body: stream });

    vi.unstubAllGlobals();
    cleanupDOM();
  });

  it("renders collection log entries with status icons", async () => {
    const { fetchMock } = mockSwarmSuccess();
    vi.stubGlobal("fetch", fetchMock);

    renderPanel();

    const btn = container!.querySelector(".intel-run-btn") as HTMLButtonElement;
    await act(async () => {
      btn.click();
      await new Promise((r) => setTimeout(r, 50));
    });

    const logItems = container!.querySelectorAll(".intel-log-item");
    expect(logItems.length).toBe(3);

    const collected = container!.querySelectorAll(".intel-log-collected");
    expect(collected.length).toBe(2);

    const skipped = container!.querySelectorAll(".intel-log-skipped_no_key");
    expect(skipped.length).toBe(1);

    vi.unstubAllGlobals();
    cleanupDOM();
  });

  it("renders swarm execution steps with role names and statuses", async () => {
    const { fetchMock } = mockSwarmSuccess();
    vi.stubGlobal("fetch", fetchMock);

    renderPanel();

    const btn = container!.querySelector(".intel-run-btn") as HTMLButtonElement;
    await act(async () => {
      btn.click();
      await new Promise((r) => setTimeout(r, 50));
    });

    const steps = container!.querySelectorAll(".intel-step");
    expect(steps.length).toBe(6);

    // First step should be scout
    expect(steps[0].textContent).toContain("scout");
    expect(steps[0].textContent).toContain("completed");

    // Synthesizer should show the synthesis title
    const synthStep = Array.from(steps).find((s) => s.textContent?.includes("synthesizer"));
    expect(synthStep).toBeDefined();
    expect(synthStep!.textContent).toContain("Cotton Price Weekly Brief");

    vi.unstubAllGlobals();
    cleanupDOM();
  });

  it("displays evidence list with source tier and subject", async () => {
    const { fetchMock } = mockSwarmSuccess();
    vi.stubGlobal("fetch", fetchMock);

    renderPanel();

    const btn = container!.querySelector(".intel-run-btn") as HTMLButtonElement;
    await act(async () => {
      btn.click();
      await new Promise((r) => setTimeout(r, 50));
    });

    const evidenceItems = container!.querySelectorAll(".intel-evidence-item");
    expect(evidenceItems.length).toBe(1);

    const tier = evidenceItems[0].querySelector(".intel-tier");
    expect(tier).not.toBeNull();
    expect(tier!.textContent).toContain("T1");

    const subject = evidenceItems[0].querySelector(".intel-evidence-subject");
    expect(subject).not.toBeNull();
    expect(subject!.textContent).toContain("Cotton price index");

    vi.unstubAllGlobals();
    cleanupDOM();
  });

  it("renders confidence percentage in synthesis section", async () => {
    const { fetchMock } = mockSwarmSuccess();
    vi.stubGlobal("fetch", fetchMock);

    renderPanel();

    const btn = container!.querySelector(".intel-run-btn") as HTMLButtonElement;
    await act(async () => {
      btn.click();
      await new Promise((r) => setTimeout(r, 50));
    });

    const confidence = container!.querySelector(".intel-confidence");
    expect(confidence).not.toBeNull();
    expect(confidence!.textContent).toContain("78.0%");

    vi.unstubAllGlobals();
    cleanupDOM();
  });

  // ===== Cost breakdown panel tests =====

  it("renders cost breakdown section with model/tool/mcp bars", async () => {
    const { fetchMock } = mockSwarmSuccess();
    vi.stubGlobal("fetch", fetchMock);

    renderPanel();

    const btn = container!.querySelector(".intel-run-btn") as HTMLButtonElement;
    await act(async () => {
      btn.click();
      await new Promise((r) => setTimeout(r, 50));
    });

    const breakdown = container!.querySelector(".intel-cost-breakdown");
    expect(breakdown).not.toBeNull();

    const barItems = container!.querySelectorAll(".intel-cost-bar-item");
    expect(barItems.length).toBe(3);

    const labels = Array.from(barItems).map((b) => b.querySelector(".intel-cost-bar-label")?.textContent);
    expect(labels).toContain("模型");
    expect(labels).toContain("工具");
    expect(labels).toContain("MCP");

    vi.unstubAllGlobals();
    cleanupDOM();
  });

  it("cost breakdown shows correct model/tool/mcp values", async () => {
    const { fetchMock } = mockSwarmSuccess({ totalCost: 0.05 });
    vi.stubGlobal("fetch", fetchMock);

    renderPanel();

    const btn = container!.querySelector(".intel-run-btn") as HTMLButtonElement;
    await act(async () => {
      btn.click();
      await new Promise((r) => setTimeout(r, 50));
    });

    const barItems = container!.querySelectorAll(".intel-cost-bar-item");
    const values = Array.from(barItems).map((b) => b.querySelector(".intel-cost-bar-value")?.textContent);
    // modelCost = 0.05 * 0.8 = 0.04
    expect(values[0]).toContain("$0.0400");
    // toolCost = 0
    expect(values[1]).toContain("$0.0000");
    // mcpCost = 0.05 * 0.2 = 0.01
    expect(values[2]).toContain("$0.0100");

    vi.unstubAllGlobals();
    cleanupDOM();
  });

  it("cost breakdown displays budget usage percentage", async () => {
    const { fetchMock } = mockSwarmSuccess({ totalCost: 0.042, maxCostUsd: 1.0, withinBudget: true });
    vi.stubGlobal("fetch", fetchMock);

    renderPanel();

    const btn = container!.querySelector(".intel-run-btn") as HTMLButtonElement;
    await act(async () => {
      btn.click();
      await new Promise((r) => setTimeout(r, 50));
    });

    const budgetLine = container!.querySelector(".intel-cost-budget-line");
    expect(budgetLine).not.toBeNull();
    // 0.042 / 1.0 * 100 = 4.2%
    expect(budgetLine!.textContent).toContain("4.2%");
    expect(budgetLine!.textContent).not.toContain("超支");

    // Should not have overrun class
    expect(budgetLine!.classList.contains("intel-cost-overrun")).toBe(false);

    vi.unstubAllGlobals();
    cleanupDOM();
  });

  it("cost breakdown budget line shows overrun styling when exceeded", async () => {
    const { fetchMock } = mockSwarmSuccess({
      totalCost: 0.8,
      maxCostUsd: 0.5,
      withinBudget: false,
    });
    vi.stubGlobal("fetch", fetchMock);

    renderPanel();

    const btn = container!.querySelector(".intel-run-btn") as HTMLButtonElement;
    await act(async () => {
      btn.click();
      await new Promise((r) => setTimeout(r, 50));
    });

    const budgetLine = container!.querySelector(".intel-cost-budget-line");
    expect(budgetLine).not.toBeNull();
    expect(budgetLine!.textContent).toContain("超支");
    expect(budgetLine!.classList.contains("intel-cost-overrun")).toBe(true);

    vi.unstubAllGlobals();
    cleanupDOM();
  });

  it("cost breakdown NOT rendered when costRecord is absent", async () => {
    const { fetchMock } = mockSwarmNoCost();
    vi.stubGlobal("fetch", fetchMock);

    renderPanel();

    const btn = container!.querySelector(".intel-run-btn") as HTMLButtonElement;
    await act(async () => {
      btn.click();
      await new Promise((r) => setTimeout(r, 50));
    });

    const breakdown = container!.querySelector(".intel-cost-breakdown");
    expect(breakdown).toBeNull();

    const costMetric = container!.querySelector(".intel-metric-cost");
    expect(costMetric).toBeNull();

    vi.unstubAllGlobals();
    cleanupDOM();
  });
});