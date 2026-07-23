// @vitest-environment jsdom
/**
 * skills-view.test.tsx - SkillsView 技能与工具视图测试
 *
 * 覆盖：
 *   - 渲染骨架：标题、汇总条、上下文预算条
 *   - 技能列表：name + origin badge + token 估算
 *   - 优先级过滤
 *   - 详情抽屉：文件路径、行/字符数、token 估算
 *   - 关闭详情抽屉
 *   - DEV 模式 fallback
 *   - 空状态
 *   - 刷新按钮
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { SkillsView } from "../client/SkillsView";
import type { SkillViewSummary, SkillViewEntry } from "../client/skillViewTypes";

// ===== Helpers =====

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderSkillsView() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(createElement(SkillsView));
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

function makeEntry(overrides: Partial<SkillViewEntry> = {}): SkillViewEntry {
  return {
    skillId: "market-analysis",
    name: "市场分析框架",
    description: "结构化市场情报采集与趋势研判。",
    origin: "ECC",
    filePath: "skills/market-analysis/SKILL.md",
    lineCount: 142,
    charCount: 5680,
    tokens: 1840,
    tokenMethod: "prose",
    priority: "always_needed",
    ...overrides,
  };
}

function makeSummary(entries: SkillViewEntry[], overrides: Partial<SkillViewSummary> = {}): SkillViewSummary {
  const totalEstimatedTokens = entries.reduce((sum, e) => sum + e.tokens, 0);
  const availableBudget = 47104;
  return {
    totalSkills: entries.length,
    totalEstimatedTokens,
    contextWindowTier: "medium",
    windowSize: 65536,
    availableBudget,
    utilizationPercent: Math.round((totalEstimatedTokens / availableBudget) * 100),
    entries,
    warnings: [],
    ...overrides,
  };
}

function mockFetch(summary: SkillViewSummary) {
  return vi.fn(() => Promise.resolve(new Response(JSON.stringify(summary), { status: 200 })));
}

// ===== Tests =====

describe("SkillsView", () => {
  beforeEach(() => {
    cleanupDOM();
    vi.unstubAllGlobals();
  });

  it("renders skeleton: title, summary bar, context budget bar", async () => {
    const summary = makeSummary([makeEntry()]);
    vi.stubGlobal("fetch", mockFetch(summary));

    renderSkillsView();
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    expect(container!.textContent).toContain("技能与工具");
    expect(container!.textContent).toContain("技能总数");
    expect(container!.textContent).toContain("估算总 Token");
    expect(container!.textContent).toContain("预算利用率");
    expect(container!.textContent).toContain("窗口等级");
    expect(container!.textContent).toContain("上下文预算");
  });

  it("displays skill list with names, origins, token estimates", async () => {
    const summary = makeSummary([
      makeEntry({ skillId: "s1", name: "市场分析", origin: "ECC", tokens: 1840 }),
      makeEntry({ skillId: "s2", name: "价格弹性", origin: "NP3", tokens: 1280 }),
    ]);
    vi.stubGlobal("fetch", mockFetch(summary));

    renderSkillsView();
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    expect(container!.textContent).toContain("市场分析");
    expect(container!.textContent).toContain("价格弹性");
    expect(container!.textContent).toContain("ECC");
    expect(container!.textContent).toContain("NP3");
    expect(container!.textContent).toContain("1,840");
    expect(container!.textContent).toContain("1,280");
  });

  it("filters skills by priority", async () => {
    const summary = makeSummary([
      makeEntry({ skillId: "s1", name: "常驻技能", priority: "always_needed" }),
      makeEntry({ skillId: "s2", name: "备用技能", priority: "rarely_needed" }),
    ]);
    vi.stubGlobal("fetch", mockFetch(summary));

    renderSkillsView();
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    expect(container!.textContent).toContain("常驻技能");
    expect(container!.textContent).toContain("备用技能");

    // 过滤：只看备用
    const rareFilter = [...container!.querySelectorAll(".skills-filter")].find(
      (f) => f.textContent?.includes("备用"),
    ) as HTMLElement;
    act(() => rareFilter.click());

    expect(container!.textContent).not.toContain("常驻技能");
    expect(container!.textContent).toContain("备用技能");
  });

  it("shows detail drawer when skill selected", async () => {
    const entry = makeEntry({ name: "市场分析框架" });
    const summary = makeSummary([entry]);
    vi.stubGlobal("fetch", mockFetch(summary));

    renderSkillsView();
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    const skillItem = container!.querySelector(".skill-list-item") as HTMLElement;
    act(() => skillItem.click());
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    expect(container!.textContent).toContain("描述");
    expect(container!.textContent).toContain("Token 估算");
    expect(container!.textContent).toContain("估算方法");
    expect(container!.textContent).toContain("行数");
    expect(container!.textContent).toContain("字符数");
    expect(container!.textContent).toContain("文件路径");
    expect(container!.textContent).toContain("skills/market-analysis/SKILL.md");
  });

  it("closes detail drawer when close button clicked", async () => {
    const summary = makeSummary([makeEntry()]);
    vi.stubGlobal("fetch", mockFetch(summary));

    renderSkillsView();
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    const skillItem = container!.querySelector(".skill-list-item") as HTMLElement;
    act(() => skillItem.click());
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    const closeBtn = container!.querySelector(".skill-detail-close") as HTMLElement;
    act(() => closeBtn.click());

    expect(container!.querySelector(".skill-detail-drawer")).toBeNull();
    expect(container!.querySelector(".skills-detail-placeholder")).not.toBeNull();
  });

  it("falls back to mock data in DEV mode when API fails", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("network down"))));

    renderSkillsView();
    await act(async () => { await new Promise((r) => setTimeout(r, 100)); });

    // DEV 模式下 fallback 到 mock 数据
    expect(container!.textContent).toContain("技能与工具");
    expect(container!.textContent).toContain("市场分析框架");
  });

  it("shows context budget utilization", async () => {
    const summary = makeSummary([makeEntry({ tokens: 5000 })], { utilizationPercent: 42 });
    vi.stubGlobal("fetch", mockFetch(summary));

    renderSkillsView();
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    expect(container!.textContent).toContain("42%");
  });

  it("shows empty state when no skills match filter", async () => {
    const summary = makeSummary([makeEntry({ priority: "always_needed" })]);
    vi.stubGlobal("fetch", mockFetch(summary));

    renderSkillsView();
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    // 过滤：只看备用（不存在）
    const rareFilter = [...container!.querySelectorAll(".skills-filter")].find(
      (f) => f.textContent?.includes("备用"),
    ) as HTMLElement;
    act(() => rareFilter.click());

    expect(container!.textContent).toContain("无匹配的技能");
  });

  it("refresh button triggers refetch", async () => {
    const summary = makeSummary([makeEntry()]);
    const fetchMock = mockFetch(summary);
    vi.stubGlobal("fetch", fetchMock);

    renderSkillsView();
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const refreshBtn = container!.querySelector(".skills-refresh-btn") as HTMLElement;
    act(() => refreshBtn.click());
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shows warnings when budget utilization is high", async () => {
    const summary = makeSummary([makeEntry({ tokens: 40000 })], {
      utilizationPercent: 85,
      warnings: ["上下文预算利用率 85%，接近上限。"],
    });
    vi.stubGlobal("fetch", mockFetch(summary));

    renderSkillsView();
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    expect(container!.textContent).toContain("接近上限");
  });
});
