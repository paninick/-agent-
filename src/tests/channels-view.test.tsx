// @vitest-environment jsdom
/**
 * channels-view.test.tsx — ChannelsView 渠道集成视图测试
 *
 * 覆盖：
 *   - 渲染骨架：标题、汇总条、状态过滤、Tier 过滤
 *   - 数据源列表：渲染所有数据源卡片
 *   - 状态过滤：按 healthy/degraded/failed/unavailable 过滤
 *   - Tier 过滤：按 S/A+/A/B/C 过滤
 *   - 详情抽屉：选中后显示凭证状态、覆盖维度、官方 URL
 *   - 维度覆盖面板：底部集成 DimensionCoveragePanel
 *   - 凭证缺失汇总高亮
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { ChannelsView } from "../client/ChannelsView";
import type { SourceHealthEntry, DimensionCoverageEntry } from "../client/analysisTypes";

// ===== Helpers =====

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderChannelsView() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(createElement(ChannelsView));
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

function makeSource(overrides: Partial<SourceHealthEntry> = {}): SourceHealthEntry {
  return {
    sourceId: "world-bank",
    name: "World Bank 世界银行",
    tier: "S",
    status: "healthy",
    latencyMs: 820,
    lastCheckedAt: "2026-07-20T10:00:00Z",
    credentialRequired: false,
    credentialPresent: true,
    recordCount: 3,
    coverageDimensions: ["price", "policy", "finance"],
    officialUrl: "https://api.worldbank.org/v2",
    ...overrides,
  };
}

function makeDimension(overrides: Partial<DimensionCoverageEntry> = {}): DimensionCoverageEntry {
  return {
    dimension: "price",
    label: "价格",
    icon: "💲",
    discipline: "微观经济学",
    status: "covered",
    matchedSourceIds: ["world-bank"],
    sourceCount: 1,
    missingCoverage: "",
    keyMetrics: ["棉花现货价"],
    ...overrides,
  };
}

function mockApiClient(sources: SourceHealthEntry[], coverage: DimensionCoverageEntry[]) {
  return vi.fn((url: string | URL | Request) => {
    const u = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
    if (u === "/api/decision/collection-health") {
      return Promise.resolve(new Response(JSON.stringify(sources), { status: 200 }));
    }
    if (u === "/api/decision/dimension-coverage") {
      return Promise.resolve(new Response(JSON.stringify(coverage), { status: 200 }));
    }
    return Promise.reject(new Error(`Unmocked URL: ${u}`));
  });
}

// ===== Tests =====

describe("ChannelsView", () => {
  beforeEach(() => {
    cleanupDOM();
    vi.unstubAllGlobals();
  });

  it("renders skeleton: title, summary bar, status filters, tier filters", async () => {
    const sources = [makeSource()];
    const fetchMock = mockApiClient(sources, []);
    vi.stubGlobal("fetch", fetchMock);

    renderChannelsView();
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    expect(container!.textContent).toContain("渠道集成");
    expect(container!.textContent).toContain("数据源总数");
    expect(container!.textContent).toContain("健康");
    expect(container!.textContent).toContain("降级");
    expect(container!.textContent).toContain("失败");
    expect(container!.textContent).toContain("不可用");
    expect(container!.textContent).toContain("凭证缺失");
    expect(container!.textContent).toContain("平均延迟");
  });

  it("displays source list with tier badge, status icon, latency, credential status", async () => {
    const sources = [
      makeSource({ sourceId: "world-bank", name: "World Bank", tier: "S", status: "healthy", latencyMs: 820 }),
      makeSource({ sourceId: "sec-edgar", name: "SEC EDGAR", tier: "S", status: "healthy", latencyMs: 1240, credentialRequired: true, credentialPresent: true }),
    ];
    const fetchMock = mockApiClient(sources, []);
    vi.stubGlobal("fetch", fetchMock);

    renderChannelsView();
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    expect(container!.textContent).toContain("World Bank");
    expect(container!.textContent).toContain("SEC EDGAR");
    expect(container!.textContent).toContain("820ms");
    expect(container!.textContent).toContain("1240ms");
    expect(container!.textContent).toContain("已配置");
  });

  it("filters sources by status", async () => {
    const sources = [
      makeSource({ sourceId: "healthy-1", name: "健康源", status: "healthy" }),
      makeSource({ sourceId: "failed-1", name: "失败源", status: "failed" }),
    ];
    const fetchMock = mockApiClient(sources, []);
    vi.stubGlobal("fetch", fetchMock);

    renderChannelsView();
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    // 全部
    expect(container!.textContent).toContain("健康源");
    expect(container!.textContent).toContain("失败源");

    // 过滤：只看失败
    const failFilter = [...container!.querySelectorAll(".channels-filter")].find((f) => f.textContent?.includes("失败")) as HTMLElement;
    act(() => failFilter.click());

    expect(container!.textContent).not.toContain("健康源");
    expect(container!.textContent).toContain("失败源");
  });

  it("filters sources by tier", async () => {
    const sources = [
      makeSource({ sourceId: "s-tier", name: "S 级源", tier: "S" }),
      makeSource({ sourceId: "a-tier", name: "A 级源", tier: "A" }),
    ];
    const fetchMock = mockApiClient(sources, []);
    vi.stubGlobal("fetch", fetchMock);

    renderChannelsView();
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    expect(container!.textContent).toContain("S 级源");
    expect(container!.textContent).toContain("A 级源");

    // 过滤：只看 S 级
    const sFilter = [...container!.querySelectorAll(".channels-filter")].find((f) => f.textContent === "S1") as HTMLElement;
    act(() => sFilter.click());

    expect(container!.textContent).toContain("S 级源");
    expect(container!.textContent).not.toContain("A 级源");
  });

  it("shows detail drawer when source selected", async () => {
    const source = makeSource({ name: "World Bank 世界银行", recordCount: 5 });
    const coverage = [makeDimension({ matchedSourceIds: ["world-bank"] })];
    const fetchMock = mockApiClient([source], coverage);
    vi.stubGlobal("fetch", fetchMock);

    renderChannelsView();
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    // 点击数据源行
    const row = container!.querySelector(".channel-row") as HTMLElement;
    act(() => row.click());
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    // 详情抽屉可见
    expect(container!.textContent).toContain("World Bank 世界银行");
    expect(container!.textContent).toContain("描述");
    expect(container!.textContent).toContain("覆盖维度");
    expect(container!.textContent).toContain("最近检查");
    expect(container!.textContent).toContain("访问官方源");
  });

  it("closes detail drawer when close button clicked", async () => {
    const source = makeSource();
    const fetchMock = mockApiClient([source], []);
    vi.stubGlobal("fetch", fetchMock);

    renderChannelsView();
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    const row = container!.querySelector(".channel-row") as HTMLElement;
    act(() => row.click());
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    // 关闭
    const closeBtn = container!.querySelector(".channel-detail-close") as HTMLElement;
    act(() => closeBtn.click());

    expect(container!.querySelector(".channel-detail-drawer")).toBeNull();
    expect(container!.querySelector(".channels-detail-placeholder")).not.toBeNull();
  });

  it("highlights missing credential in summary", async () => {
    const sources = [
      makeSource({ sourceId: "ok", credentialRequired: true, credentialPresent: true }),
      makeSource({ sourceId: "missing", credentialRequired: true, credentialPresent: false }),
    ];
    const fetchMock = mockApiClient(sources, []);
    vi.stubGlobal("fetch", fetchMock);

    renderChannelsView();
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    // 凭证缺失汇总应该显示 1
    const credentialMetric = [...container!.querySelectorAll(".channels-summary-item")].find((item) => item.textContent?.includes("凭证缺失"));
    expect(credentialMetric?.textContent).toContain("1");
  });

  it("renders DimensionCoveragePanel at bottom", async () => {
    const sources = [makeSource()];
    const coverage = [makeDimension()];
    const fetchMock = mockApiClient(sources, coverage);
    vi.stubGlobal("fetch", fetchMock);

    renderChannelsView();
    await act(async () => { await new Promise((r) => setTimeout(r, 100)); });

    // DimensionCoveragePanel 渲染 7 维度
    expect(container!.textContent).toContain("维度");
  });

  it("falls back to mock data in DEV mode when API fails", async () => {
    const fetchMock = vi.fn(() => Promise.reject(new Error("network down")));
    vi.stubGlobal("fetch", fetchMock);

    renderChannelsView();
    await act(async () => { await new Promise((r) => setTimeout(r, 100)); });

    // DEV 模式下 apiClient 自动 fallback 到 createMock*，页面正常渲染
    expect(container!.textContent).toContain("渠道集成");
    expect(container!.textContent).toContain("World Bank");
  });

  it("shows empty state when filter matches no sources", async () => {
    const sources = [makeSource({ status: "healthy" })];
    const fetchMock = mockApiClient(sources, []);
    vi.stubGlobal("fetch", fetchMock);

    renderChannelsView();
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    // 过滤：只看失败（不存在）
    const failFilter = [...container!.querySelectorAll(".channels-filter")].find((f) => f.textContent?.includes("失败")) as HTMLElement;
    act(() => failFilter.click());

    expect(container!.textContent).toContain("无匹配的数据源");
  });
});
