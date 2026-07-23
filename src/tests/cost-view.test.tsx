// @vitest-environment jsdom
/**
 * cost-view.test.tsx - CostView 成本中心视图测试
 *
 * 覆盖：
 *   - 渲染骨架：标题、汇总条、6 桶分布
 *   - 6 桶成本明细展示
 *   - Per-run 成本列表
 *   - 预算守卫告警
 *   - 详情抽屉：选中后显示偏差、Run ID
 *   - DEV 模式 API 失败时 fallback 到 mock
 *   - 空状态
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { CostView } from "../client/CostView";
import type { CostSummary } from "../client/costTypes";

// ===== Helpers =====

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderCostView() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(createElement(CostView));
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

function makeSummary(overrides: Partial<CostSummary> = {}): CostSummary {
  return {
    totalSpent: 0.1612,
    totalEstimated: 0.2100,
    currency: "USD",
    runCount: 4,
    buckets: [
      { category: "modelCost", label: "模型调用", amountUsd: 0.0842, percentage: 52, color: "var(--cyan)" },
      { category: "toolCost", label: "工具执行", amountUsd: 0.0318, percentage: 20, color: "var(--mint)" },
      { category: "mcpCost", label: "MCP 服务", amountUsd: 0.0245, percentage: 15, color: "var(--amber)" },
      { category: "computeCost", label: "计算资源", amountUsd: 0.0129, percentage: 8, color: "#a78bfa" },
      { category: "storageCost", label: "存储", amountUsd: 0.0078, percentage: 5, color: "var(--steel)" },
    ],
    runs: [
      {
        runId: "run_001",
        intent: "Launch plan: 定价分析",
        actualTotal: 0.0648,
        estimatedTotal: 0.0800,
        status: "completed",
        createdAt: "2026-07-22T09:14:00Z",
      },
    ],
    budgetAlerts: [
      { taskId: "task-pricing", budgetLimit: 0.1000, spent: 0.0648, remaining: 0.0352, withinBudget: true },
    ],
    ...overrides,
  };
}

function mockFetch(summary: CostSummary) {
  return vi.fn(() => Promise.resolve(new Response(JSON.stringify(summary), { status: 200 })));
}

// ===== Tests =====

describe("CostView", () => {
  beforeEach(() => {
    cleanupDOM();
    vi.unstubAllGlobals();
  });

  it("renders skeleton: title, summary bar, bucket breakdown section", async () => {
    const summary = makeSummary();
    vi.stubGlobal("fetch", mockFetch(summary));

    renderCostView();
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    expect(container!.textContent).toContain("成本中心");
    expect(container!.textContent).toContain("总花费");
    expect(container!.textContent).toContain("预估总额");
    expect(container!.textContent).toContain("预算利用率");
    expect(container!.textContent).toContain("超支数");
    expect(container!.textContent).toContain("Run 数量");
    expect(container!.textContent).toContain("成本分布");
  });

  it("displays 6 cost buckets with amounts and percentages", async () => {
    const summary = makeSummary();
    vi.stubGlobal("fetch", mockFetch(summary));

    renderCostView();
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    expect(container!.textContent).toContain("模型调用");
    expect(container!.textContent).toContain("工具执行");
    expect(container!.textContent).toContain("MCP 服务");
    expect(container!.textContent).toContain("计算资源");
    expect(container!.textContent).toContain("存储");
    expect(container!.textContent).toContain("52%");
    expect(container!.textContent).toContain("5%");
  });

  it("displays per-run cost entries", async () => {
    const summary = makeSummary();
    vi.stubGlobal("fetch", mockFetch(summary));

    renderCostView();
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    expect(container!.textContent).toContain("Launch plan: 定价分析");
    expect(container!.textContent).toContain("已完成");
  });

  it("displays budget guard alerts", async () => {
    const summary = makeSummary();
    vi.stubGlobal("fetch", mockFetch(summary));

    renderCostView();
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    expect(container!.textContent).toContain("预算守卫");
    expect(container!.textContent).toContain("task-pricing");
  });

  it("shows detail drawer when run selected", async () => {
    const summary = makeSummary();
    vi.stubGlobal("fetch", mockFetch(summary));

    renderCostView();
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    const runItem = container!.querySelector(".cost-run-item") as HTMLElement;
    act(() => runItem.click());
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    expect(container!.textContent).toContain("实际成本");
    expect(container!.textContent).toContain("预估成本");
    expect(container!.textContent).toContain("偏差");
    expect(container!.textContent).toContain("run_001");
  });

  it("closes detail drawer when close button clicked", async () => {
    const summary = makeSummary();
    vi.stubGlobal("fetch", mockFetch(summary));

    renderCostView();
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    const runItem = container!.querySelector(".cost-run-item") as HTMLElement;
    act(() => runItem.click());
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    const closeBtn = container!.querySelector(".cost-detail-close") as HTMLElement;
    act(() => closeBtn.click());

    expect(container!.querySelector(".cost-detail-drawer")).toBeNull();
    expect(container!.querySelector(".cost-detail-placeholder")).not.toBeNull();
  });

  it("highlights over-budget alerts", async () => {
    const summary = makeSummary({
      budgetAlerts: [
        { taskId: "task-over", budgetLimit: 0.0500, spent: 0.0600, remaining: -0.0100, withinBudget: false },
      ],
    });
    vi.stubGlobal("fetch", mockFetch(summary));

    renderCostView();
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    const overAlert = container!.querySelector(".cost-budget-alert.over");
    expect(overAlert).not.toBeNull();
  });

  it("falls back to mock data in DEV mode when API fails", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("network down"))));

    renderCostView();
    await act(async () => { await new Promise((r) => setTimeout(r, 100)); });

    // DEV 模式下 fallback 到 mock 数据
    expect(container!.textContent).toContain("成本中心");
    expect(container!.textContent).toContain("模型调用");
  });

  it("shows empty state when no runs exist", async () => {
    const summary = makeSummary({ runs: [], runCount: 0 });
    vi.stubGlobal("fetch", mockFetch(summary));

    renderCostView();
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    expect(container!.textContent).toContain("暂无任务运行记录");
  });

  it("refresh button triggers refetch", async () => {
    const summary = makeSummary();
    const fetchMock = mockFetch(summary);
    vi.stubGlobal("fetch", fetchMock);

    renderCostView();
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const refreshBtn = container!.querySelector(".cost-refresh-btn") as HTMLElement;
    act(() => refreshBtn.click());
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
