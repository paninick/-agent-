// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FocusDrawer } from "../client/habitat/FocusDrawer";

// Tell React this is an act-enabled environment.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

interface RenderResult {
  container: HTMLDivElement;
  root: Root;
  cleanup: () => void;
}

function render(element: ReturnType<typeof createElement>): RenderResult {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(element);
  });
  return {
    container,
    root,
    cleanup: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

function dispatchKeyDown(target: Document | Element, key: string) {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(event);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("FocusDrawer", () => {
  it("renders nothing when not open", () => {
    const { container, cleanup } = render(
      createElement(FocusDrawer, {
        open: false,
        onClose: () => {},
        title: "测试",
        children: createElement("p", null, "内容"),
      }),
    );
    expect(container.firstChild).toBeNull();
    cleanup();
  });

  it("renders dialog with title when open", () => {
    const { container, cleanup } = render(
      createElement(FocusDrawer, {
        open: true,
        onClose: () => {},
        title: "Agent 详情",
        children: createElement("p", null, "能力说明"),
      }),
    );
    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog).toBeTruthy();
    expect(container.textContent).toContain("Agent 详情");
    expect(container.textContent).toContain("能力说明");
    cleanup();
  });

  it("calls onClose when Escape is pressed", () => {
    const onClose = vi.fn();
    const { cleanup } = render(
      createElement(FocusDrawer, {
        open: true,
        onClose,
        title: "测试",
        children: createElement("p", null, "内容"),
      }),
    );
    dispatchKeyDown(document, "Escape");
    expect(onClose).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("has aria-modal and aria-labelledby", () => {
    const { container, cleanup } = render(
      createElement(FocusDrawer, {
        open: true,
        onClose: () => {},
        title: "测试",
        children: createElement("p", null, "内容"),
      }),
    );
    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog).toBeTruthy();
    expect(dialog!.getAttribute("aria-modal")).toBe("true");
    expect(dialog!.getAttribute("aria-labelledby")).toBeTruthy();
    cleanup();
  });
});
