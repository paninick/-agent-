// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
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

import { IntelligenceDashboard, loadHistory, saveHistory } from "../client/IntelligenceDashboard";
import type { TaskHistoryEntry } from "../client/IntelligenceDashboard";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderDashboard() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(createElement(IntelligenceDashboard));
  });
}

/** 切换到分析视图（默认首屏是决策视图，分析视图含 KPI/编队/审批等）
 *  Phase 2: 分析视图默认子 Tab 是"采集健康"，需进一步切换到"蜂群执行"才能看到 KPI/编队/审批
 */
function switchToAnalysisView() {
  const tabs = [...container!.querySelectorAll(".view-tab")];
  const analysisTab = tabs.find((tab) => tab.textContent?.includes("分析视图"));
  expect(analysisTab).toBeDefined();
  act(() => (analysisTab as HTMLElement).click());
  // 切换到"蜂群执行"子 Tab
  const subtabs = [...container!.querySelectorAll(".analysis-subtab")];
  const executionTab = subtabs.find((tab) => tab.textContent?.includes("任务执行"));
  expect(executionTab).toBeDefined();
  act(() => (executionTab as HTMLElement).click());
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("IntelligenceDashboard", () => {
  beforeEach(() => {
    cleanupDOM();
    localStorage.clear();
  });

  it("renders dashboard section with aria-label", () => {
    renderDashboard();
    const section = container!.querySelector("[aria-label='供应链情报中心']");
    expect(section).not.toBeNull();
  });

  it("renders mast with title", () => {
    renderDashboard();
    const h1 = container!.querySelector("h1");
    expect(h1).not.toBeNull();
    expect(h1!.textContent).toContain("任务监控");
  });

  it("renders 5 KPI cards", () => {
    renderDashboard();
    switchToAnalysisView();
    const cards = container!.querySelectorAll(".kpi-card");
    expect(cards.length).toBe(5);
  });

  it("renders dashboard-signal indicator", () => {
    renderDashboard();
    const signal = container!.querySelector(".dashboard-signal");
    expect(signal).not.toBeNull();
  });

  it("shows empty history state when no history exists", () => {
    renderDashboard();
    // Task queue should not render when history is empty
    const queue = container!.querySelector(".task-queue");
    expect(queue).toBeNull();
  });

  it("shows task queue when history exists in localStorage", () => {
    const entry: TaskHistoryEntry = {
      id: "test-1",
      objective: "Test objective",
      timestamp: "2026-07-11T10:00:00.000Z",
      status: "completed",
      sourcesCollected: 5,
      confidence: 0.85,
      cost: 0.0012,
      durationMs: 15000,
    };
    localStorage.setItem("intelligence-task-history", JSON.stringify([entry]));

    renderDashboard();

    const queue = container!.querySelector(".task-queue");
    expect(queue).not.toBeNull();
  });

  it("renders IntelligencePanel (embedded)", () => {
    renderDashboard();
    switchToAnalysisView();
    // IntelligencePanel renders with aria-label "任务执行面板"
    const panel = container!.querySelector("[aria-label='任务执行面板']");
    expect(panel).not.toBeNull();
  });

  it("KPI cards show correct initial values", () => {
    renderDashboard();
    switchToAnalysisView();
    const values = container!.querySelectorAll(".kpi-value");
    expect(values.length).toBe(5);
    // KPI 1 (预测缺货率) is now data-driven via useCountUp, animates from 0 to 7.1
    // Before animation completes, it shows 0.0% (same as other KPIs)
    expect(values[0].textContent).toBe("0.0%");
    // KPI 2-5 are dynamic from SSE, initialized to 0 before any run
    expect(values[1].textContent).toBe("0%");
  });

  it("renders the full 10-agent mission roster", () => {
    renderDashboard();
    switchToAnalysisView();
    expect(container!.querySelectorAll(".agent-card")).toHaveLength(10);
  });

  it("labels channel integrations as simulated adapters", () => {
    renderDashboard();
    switchToAnalysisView();
    const labels = [...container!.querySelectorAll(".status-pill.mock")].map((node) => node.textContent);
    expect(labels).toEqual(["模拟适配器", "模拟适配器"]);
  });

  it("supports approving a human-gated action", () => {
    renderDashboard();
    switchToAnalysisView();
    const approve = [...container!.querySelectorAll("button")].find((button) => button.textContent === "批准并执行");
    expect(approve).toBeDefined();
    act(() => approve!.click());
    expect(container!.textContent).toContain("已批准，执行代理正在创建调拨单");
  });
});

describe("loadHistory / saveHistory", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("loadHistory returns empty array when no data", () => {
    const result = loadHistory();
    expect(result).toEqual([]);
  });

  it("saveHistory + loadHistory roundtrip", () => {
    const entries: TaskHistoryEntry[] = [
      {
        id: "r1",
        objective: "Test",
        timestamp: "2026-07-11T00:00:00Z",
        status: "completed",
        sourcesCollected: 3,
        confidence: 0.9,
        cost: 0.01,
        durationMs: 5000,
      },
    ];
    saveHistory(entries);
    const loaded = loadHistory();
    expect(loaded.length).toBe(1);
    expect(loaded[0].id).toBe("r1");
  });

  it("saveHistory truncates to MAX_HISTORY entries", () => {
    const entries: TaskHistoryEntry[] = Array.from({ length: 60 }, (_, i) => ({
      id: `r${i}`,
      objective: `Task ${i}`,
      timestamp: new Date().toISOString(),
      status: "completed" as const,
      sourcesCollected: 1,
      confidence: 0.5,
      cost: 0.001,
      durationMs: 1000,
    }));
    saveHistory(entries);
    const loaded = loadHistory();
    expect(loaded.length).toBe(50);
  });

  it("loadHistory returns empty array on corrupt data", () => {
    localStorage.setItem("intelligence-task-history", "not-json");
    const result = loadHistory();
    expect(result).toEqual([]);
  });
});
