// @vitest-environment jsdom
/**
 * tasks-view.test.tsx — TasksView 任务运行视图测试
 *
 * 覆盖：
 *   - 渲染骨架：标题、数据源 Tab、状态过滤器、刷新按钮
 *   - 通用任务：加载后端 /api/runs，列表渲染，选中后显示详情
 *   - 蜂群任务：从 localStorage 读取历史，Tab 切换后渲染
 *   - 状态过滤：按 status 过滤
 *   - 操作：approve / reject / resume 按钮（按 status 显隐）
 *   - 错误处理：后端 500 时显示错误提示，不阻塞蜂群历史
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { TasksView } from "../client/TasksView";
import type { TaskHistoryEntry } from "../client/IntelligenceDashboard";

// ===== Helpers =====

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderTasksView() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(createElement(TasksView));
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

function makeRun(overrides: Partial<Run> = {}): Run {
  return {
    runId: "run-001",
    intent: "Launch plan: 新产品上线",
    taskPlan: {
      planId: "plan-001",
      intent: "Launch plan",
      tasks: [{ taskId: "t-1", title: "收集需求" }],
    },
    workflow: {
      workflowId: "wf-001",
      nodes: [
        { nodeId: "n-1", type: "task", label: "收集需求" },
        { nodeId: "n-2", type: "task", label: "生成计划" },
        { nodeId: "n-3", type: "human_approval", label: "人工审批" },
      ],
    },
    status: "completed",
    completedNodeIds: ["n-1", "n-2", "n-3"],
    failedNodeIds: [],
    costSnapshot: { estimatedTotal: 0.05, actualTotal: 0.042, currency: "USD" },
    createdAt: "2026-07-20T08:00:00Z",
    updatedAt: "2026-07-20T08:05:00Z",
    ...overrides,
  } as Run;
}

interface Run {
  runId: string;
  intent: string;
  taskPlan: { planId: string; intent: string; tasks: Array<{ taskId: string; title: string }> };
  workflow: { workflowId: string; nodes: Array<{ nodeId: string; type: string; label: string }> };
  status: string;
  completedNodeIds: string[];
  failedNodeIds: string[];
  waitingApprovalNodeId?: string;
  costSnapshot: { estimatedTotal: number; actualTotal: number; currency: string };
  createdAt: string;
  updatedAt: string;
}

function makeSwarmEntry(overrides: Partial<TaskHistoryEntry> = {}): TaskHistoryEntry {
  return {
    id: "swarm-001",
    objective: "分析棉价传导",
    timestamp: "2026-07-20T09:00:00Z",
    status: "completed",
    sourcesCollected: 3,
    confidence: 0.85,
    cost: 0.042,
    durationMs: 15000,
    ...overrides,
  };
}

function mockFetch(runs: Run[], audit: unknown[] = []) {
  return vi.fn((url: string | URL | Request, _init?: RequestInit) => {
    const u = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
    if (u === "/api/runs") {
      return Promise.resolve(new Response(JSON.stringify({ runs }), { status: 200 }));
    }
    if (u.startsWith("/api/runs/") && u.endsWith("/audit")) {
      return Promise.resolve(new Response(JSON.stringify({ events: audit }), { status: 200 }));
    }
    if (u.startsWith("/api/runs/")) {
      return Promise.resolve(new Response(JSON.stringify(runs[0]), { status: 200 }));
    }
    return Promise.reject(new Error(`Unmocked URL: ${u}`));
  });
}

// ===== Tests =====

describe("TasksView", () => {
  beforeEach(() => {
    cleanupDOM();
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("renders skeleton: title, source tabs, status filters, refresh button", () => {
    const fetchMock = mockFetch([]);
    vi.stubGlobal("fetch", fetchMock);

    renderTasksView();

    expect(container!.textContent).toContain("任务运行");
    expect(container!.textContent).toContain("通用任务");
    expect(container!.textContent).toContain("蜂群任务");
    expect(container!.textContent).toContain("全部");
    expect(container!.textContent).toContain("运行中");
    expect(container!.textContent).toContain("待审批");
    expect(container!.textContent).toContain("已完成");
    expect(container!.textContent).toContain("失败");
    expect(container!.textContent).toContain("刷新");
  });

  it("loads and displays backend runs on mount", async () => {
    const run = makeRun({ intent: "Launch plan: 新产品上线" });
    const fetchMock = mockFetch([run]);
    vi.stubGlobal("fetch", fetchMock);

    renderTasksView();
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    expect(fetchMock).toHaveBeenCalledWith("/api/runs");
    expect(container!.textContent).toContain("Launch plan: 新产品上线");
    expect(container!.textContent).toContain("3/3"); // completed/total
    expect(container!.textContent).toContain("$0.0420");
  });

  it("switches to swarm tab and displays localStorage history", async () => {
    const entry = makeSwarmEntry({ objective: "分析棉价传导" });
    localStorage.setItem("intelligence-task-history", JSON.stringify([entry]));
    const fetchMock = mockFetch([]);
    vi.stubGlobal("fetch", fetchMock);

    renderTasksView();
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    // 切到蜂群 Tab
    const swarmTab = [...container!.querySelectorAll(".tasks-tab")].find((t) => t.textContent?.includes("蜂群任务")) as HTMLElement;
    act(() => swarmTab.click());

    expect(container!.textContent).toContain("分析棉价传导");
    expect(container!.textContent).toContain("数据源 3");
    expect(container!.textContent).toContain("置信 85%");
  });

  it("filters runs by status", async () => {
    const completed = makeRun({ runId: "r-1", status: "completed", intent: "完成任务" });
    const failed = makeRun({ runId: "r-2", status: "failed", intent: "失败任务", failedNodeIds: ["n-1"] });
    const fetchMock = mockFetch([completed, failed]);
    vi.stubGlobal("fetch", fetchMock);

    renderTasksView();
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    // 全部
    expect(container!.textContent).toContain("完成任务");
    expect(container!.textContent).toContain("失败任务");

    // 过滤：只看失败
    const failFilter = [...container!.querySelectorAll(".tasks-filter")].find((f) => f.textContent?.includes("失败")) as HTMLElement;
    act(() => failFilter.click());

    expect(container!.textContent).not.toContain("完成任务");
    expect(container!.textContent).toContain("失败任务");
  });

  it("shows detail drawer with workflow nodes when run selected", async () => {
    const run = makeRun({ intent: "Launch plan: 测试详情" });
    const fetchMock = mockFetch([run], [
      { eventId: "e-1", runId: run.runId, type: "run_created", message: "任务已创建", createdAt: "2026-07-20T08:00:00Z" },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    renderTasksView();
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    // 点击列表项
    const item = container!.querySelector(".task-list-item") as HTMLElement;
    act(() => item.click());
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    expect(container!.textContent).toContain("工作流节点 (3)");
    expect(container!.textContent).toContain("收集需求");
    expect(container!.textContent).toContain("生成计划");
    expect(container!.textContent).toContain("人工审批");
    expect(container!.textContent).toContain("审计时间线");
    expect(container!.textContent).toContain("任务已创建");
  });

  it("shows approve/reject buttons only for waiting_approval status", async () => {
    const waitingRun = makeRun({
      runId: "r-wait",
      status: "waiting_approval",
      intent: "待审批任务",
      waitingApprovalNodeId: "n-3",
    });
    const fetchMock = mockFetch([waitingRun]);
    vi.stubGlobal("fetch", fetchMock);

    renderTasksView();
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    const item = container!.querySelector(".task-list-item") as HTMLElement;
    act(() => item.click());
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    expect(container!.textContent).toContain("批准并继续");
    expect(container!.textContent).toContain("拒绝");
  });

  it("does not show approve/reject for completed status", async () => {
    const completed = makeRun({ status: "completed" });
    const fetchMock = mockFetch([completed]);
    vi.stubGlobal("fetch", fetchMock);

    renderTasksView();
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    const item = container!.querySelector(".task-list-item") as HTMLElement;
    act(() => item.click());
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    expect(container!.textContent).not.toContain("批准并继续");
    expect(container!.textContent).not.toContain("拒绝");
  });

  it("shows resume button for failed status", async () => {
    const failed = makeRun({ status: "failed", failedNodeIds: ["n-1"] });
    const fetchMock = mockFetch([failed]);
    vi.stubGlobal("fetch", fetchMock);

    renderTasksView();
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    const item = container!.querySelector(".task-list-item") as HTMLElement;
    act(() => item.click());
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    expect(container!.textContent).toContain("重新运行");
  });

  it("gracefully handles backend failure without blocking swarm history", async () => {
    const entry = makeSwarmEntry();
    localStorage.setItem("intelligence-task-history", JSON.stringify([entry]));

    const fetchMock = vi.fn(() => Promise.reject(new Error("network down")));
    vi.stubGlobal("fetch", fetchMock);

    renderTasksView();
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    // 通用任务列表为空（graceful fallback 到 []）
    expect(container!.textContent).toContain("暂无通用任务");

    // 切到蜂群 Tab，历史仍在
    const swarmTab = [...container!.querySelectorAll(".tasks-tab")].find((t) => t.textContent?.includes("蜂群任务")) as HTMLElement;
    act(() => swarmTab.click());
    expect(container!.textContent).toContain("分析棉价传导");
  });

  it("refresh button re-fetches runs", async () => {
    const run = makeRun();
    const fetchMock = mockFetch([run]);
    vi.stubGlobal("fetch", fetchMock);

    renderTasksView();
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const refreshBtn = [...container!.querySelectorAll("button")].find((b) => b.textContent?.includes("刷新")) as HTMLElement;
    await act(async () => {
      refreshBtn.click();
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
