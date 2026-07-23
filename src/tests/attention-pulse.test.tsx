// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";

// Tell React this is an act-enabled environment.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { AttentionPulse } from "../client/habitat/AttentionPulse";
import type { GoalTrackEntry } from "../client/habitat/types";

const entries: GoalTrackEntry[] = [
  { goalId: "g1", need: "聚焦任务", trackKind: "focused" },
  { goalId: "g2", need: "后台任务", trackKind: "background" },
  { goalId: "g3", need: "已完成", trackKind: "completed" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderPulse(
  props: { entries: GoalTrackEntry[]; onSelect: (t: GoalTrackEntry["trackKind"]) => void }
) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(createElement(AttentionPulse, props));
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AttentionPulse", () => {
  beforeEach(() => {
    cleanupDOM();
  });

  it("renders segments for each trackKind present", () => {
    renderPulse({ entries, onSelect: () => {} });
    const segments = container!.querySelectorAll("button");
    expect(segments).toHaveLength(3);
  });

  it("displays trackKind label and count in each segment", () => {
    renderPulse({ entries, onSelect: () => {} });
    expect(container!.textContent).toMatch(/聚焦/);
    expect(container!.textContent).toMatch(/后台/);
    expect(container!.textContent).toMatch(/完成/);
  });

  it("calls onSelect with trackKind when segment is clicked", () => {
    const onSelect = vi.fn();
    renderPulse({ entries, onSelect });
    const buttons = [...container!.querySelectorAll("button")];
    const focusedBtn = buttons.find((b) => b.textContent?.includes("聚焦"));
    expect(focusedBtn).toBeDefined();
    act(() => focusedBtn!.click());
    expect(onSelect).toHaveBeenCalledWith("focused");
  });

  it("renders nothing when entries is empty", () => {
    renderPulse({ entries: [], onSelect: () => {} });
    expect(container!.querySelector(".habitat-pulse-bar")).toBeNull();
  });
});
