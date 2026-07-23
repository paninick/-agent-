// @vitest-environment jsdom
/**
 * goals-view.test.tsx - GoalsView 目标中心视图测试
 *
 * 覆盖：
 *   - 渲染骨架：标题、汇总条、状态过滤
 *   - 目标列表：status badge + autonomy badge + budget bar
 *   - 状态过滤
 *   - 详情抽屉：成功度量、预算、允许/禁止行动、自治选择器
 *   - 自治选择器调用 API
 *   - 关闭详情抽屉
 *   - DEV 模式 fallback
 *   - 空状态
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { GoalsView } from "../client/GoalsView";
import type { HabitatSnapshot, PersonalGoalContract } from "../domain/agentHabitat";

// ===== Helpers =====

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderGoalsView() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(createElement(GoalsView));
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

function makeGoal(overrides: Partial<PersonalGoalContract> = {}): PersonalGoalContract {
  return {
    id: "goal-trip",
    need: "规划下周的出差",
    desiredOutcome: "完成出差行程规划",
    successMeasures: [
      { label: "航班已预订", target: "可退改直飞航班", current: "已锁定 3 个候选" },
      { label: "酒店已预订", target: "靠近地铁站 ¥400-600/晚" },
    ],
    deadline: "2026-07-18",
    budget: { currency: "CNY", limit: 5000, spent: 1280 },
    autonomy: "ask_before_action",
    allowedActions: ["search_flights", "search_hotels"],
    forbiddenActions: ["auto_payment_over_2000"],
    assumptions: ["出差地点为上海"],
    status: "active",
    ...overrides,
  };
}

function makeSnapshot(goals: PersonalGoalContract[]): HabitatSnapshot {
  return {
    capturedAt: "2026-07-22T09:24:00+08:00",
    motionPreference: "full",
    residentAgents: [],
    ephemeralAgents: [],
    goals,
    tasks: [],
    squads: [],
    userRequests: [],
    memories: [],
    activity: [],
  };
}

function mockFetch(snapshot: HabitatSnapshot) {
  return vi.fn((url: string | URL | Request) => {
    const u = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
    if (u === "/api/habitat/snapshot") {
      return Promise.resolve(new Response(JSON.stringify(snapshot), { status: 200 }));
    }
    if (u.includes("/api/habitat/goals/") && u.includes("/autonomy")) {
      const goalId = u.match(/goals\/([^/]+)\/autonomy/)?.[1] ?? "";
      return Promise.resolve(new Response(JSON.stringify({ ok: true, goalId, autonomy: "auto_within_limits" }), { status: 200 }));
    }
    return Promise.reject(new Error(`Unmocked URL: ${u}`));
  });
}

// ===== Tests =====

describe("GoalsView", () => {
  beforeEach(() => {
    cleanupDOM();
    vi.unstubAllGlobals();
  });

  it("renders skeleton: title, summary bar, status filters", async () => {
    const snapshot = makeSnapshot([makeGoal()]);
    vi.stubGlobal("fetch", mockFetch(snapshot));

    renderGoalsView();
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    expect(container!.textContent).toContain("目标中心");
    expect(container!.textContent).toContain("目标总数");
    expect(container!.textContent).toContain("活跃");
    expect(container!.textContent).toContain("待用户");
    expect(container!.textContent).toContain("已完成");
    expect(container!.textContent).toContain("已取消");
    expect(container!.textContent).toContain("预算总花费");
  });

  it("displays goal list with status and autonomy badges", async () => {
    const snapshot = makeSnapshot([
      makeGoal({ id: "g1", need: "目标 A", status: "active", autonomy: "ask_before_action" }),
      makeGoal({ id: "g2", need: "目标 B", status: "waiting_for_user", autonomy: "observe_only" }),
    ]);
    vi.stubGlobal("fetch", mockFetch(snapshot));

    renderGoalsView();
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    expect(container!.textContent).toContain("目标 A");
    expect(container!.textContent).toContain("目标 B");
    expect(container!.textContent).toContain("活跃");
    expect(container!.textContent).toContain("待用户");
    expect(container!.textContent).toContain("行动前询问");
    expect(container!.textContent).toContain("仅观察");
  });

  it("filters goals by status", async () => {
    const snapshot = makeSnapshot([
      makeGoal({ id: "g1", need: "活跃目标", status: "active" }),
      makeGoal({ id: "g2", need: "已完成目标", status: "completed" }),
    ]);
    vi.stubGlobal("fetch", mockFetch(snapshot));

    renderGoalsView();
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    expect(container!.textContent).toContain("活跃目标");
    expect(container!.textContent).toContain("已完成目标");

    // 过滤：只看已完成
    const completedFilter = [...container!.querySelectorAll(".goals-filter")].find(
      (f) => f.textContent?.includes("已完成"),
    ) as HTMLElement;
    act(() => completedFilter.click());

    expect(container!.textContent).not.toContain("活跃目标");
    expect(container!.textContent).toContain("已完成目标");
  });

  it("shows detail drawer when goal selected", async () => {
    const goal = makeGoal({ need: "出差规划" });
    const snapshot = makeSnapshot([goal]);
    vi.stubGlobal("fetch", mockFetch(snapshot));

    renderGoalsView();
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    const goalItem = container!.querySelector(".goal-list-item") as HTMLElement;
    act(() => goalItem.click());
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    expect(container!.textContent).toContain("期望结果");
    expect(container!.textContent).toContain("成功度量");
    expect(container!.textContent).toContain("预算约束");
    expect(container!.textContent).toContain("允许行动");
    expect(container!.textContent).toContain("禁止行动");
    expect(container!.textContent).toContain("假设前提");
    expect(container!.textContent).toContain("自治等级");
  });

  it("detail drawer shows success measures with label and target", async () => {
    const goal = makeGoal({
      successMeasures: [
        { label: "航班已预订", target: "可退改直飞航班", current: "已锁定 3 个候选" },
      ],
    });
    const snapshot = makeSnapshot([goal]);
    vi.stubGlobal("fetch", mockFetch(snapshot));

    renderGoalsView();
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    const goalItem = container!.querySelector(".goal-list-item") as HTMLElement;
    act(() => goalItem.click());
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    expect(container!.textContent).toContain("航班已预订");
    expect(container!.textContent).toContain("可退改直飞航班");
    expect(container!.textContent).toContain("已锁定 3 个候选");
  });

  it("closes detail drawer when close button clicked", async () => {
    const snapshot = makeSnapshot([makeGoal()]);
    vi.stubGlobal("fetch", mockFetch(snapshot));

    renderGoalsView();
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    const goalItem = container!.querySelector(".goal-list-item") as HTMLElement;
    act(() => goalItem.click());
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    const closeBtn = container!.querySelector(".goal-detail-close") as HTMLElement;
    act(() => closeBtn.click());

    expect(container!.querySelector(".goal-detail-drawer")).toBeNull();
    expect(container!.querySelector(".goals-detail-placeholder")).not.toBeNull();
  });

  it("autonomy select calls API on change", async () => {
    const goal = makeGoal({ autonomy: "ask_before_action" });
    const fetchMock = mockFetch(makeSnapshot([goal]));
    vi.stubGlobal("fetch", fetchMock);

    renderGoalsView();
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    const goalItem = container!.querySelector(".goal-list-item") as HTMLElement;
    act(() => goalItem.click());
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    const select = container!.querySelector(".goal-autonomy-select") as HTMLSelectElement;
    act(() => {
      select.value = "auto_within_limits";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    // Should have called the autonomy PATCH endpoint
    const autonomyCalls = fetchMock.mock.calls.filter(
      ([url]: [string | URL | Request]) => {
        const u = typeof url === "string" ? url : url.toString();
        return u.includes("/autonomy");
      },
    );
    expect(autonomyCalls.length).toBeGreaterThan(0);
  });

  it("falls back to mock data in DEV mode when API fails", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("network down"))));

    renderGoalsView();
    await act(async () => { await new Promise((r) => setTimeout(r, 100)); });

    // DEV 模式下 habitatApi fallback 到 mock
    expect(container!.textContent).toContain("目标中心");
  });

  it("shows empty state when no goals match filter", async () => {
    const snapshot = makeSnapshot([makeGoal({ status: "active" })]);
    vi.stubGlobal("fetch", mockFetch(snapshot));

    renderGoalsView();
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    // 过滤：只看已取消（不存在）
    const cancelledFilter = [...container!.querySelectorAll(".goals-filter")].find(
      (f) => f.textContent?.includes("已取消"),
    ) as HTMLElement;
    act(() => cancelledFilter.click());

    expect(container!.textContent).toContain("无匹配的目标");
  });

  it("displays budget bar in goal list item", async () => {
    const snapshot = makeSnapshot([
      makeGoal({ budget: { currency: "CNY", limit: 5000, spent: 1280 } }),
    ]);
    vi.stubGlobal("fetch", mockFetch(snapshot));

    renderGoalsView();
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    const budgetBar = container!.querySelector(".goal-budget-bar-fill");
    expect(budgetBar).not.toBeNull();
  });
});
