// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useFocusTrap } from "../client/habitat/useFocusTrap";
import type { RefCallback } from "react";

// Tell React this is an act-enabled environment.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// ---------------------------------------------------------------------------
// Manual renderHook replacement (no @testing-library/react in this project)
// ---------------------------------------------------------------------------

interface HookRenderResult<T> {
  result: { current: T };
  cleanup: () => void;
}

function renderHook<T>(hookFn: () => T): HookRenderResult<T> {
  const captured: { current: T | undefined } = { current: undefined };

  function HookProbe() {
    captured.current = hookFn();
    return null;
  }

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  act(() => {
    root.render(createElement(HookProbe));
  });

  return {
    result: { current: captured.current as T },
    cleanup: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useFocusTrap", () => {
  it("returns a ref callback when active", () => {
    const { result, cleanup } = renderHook(() => useFocusTrap(true));
    expect(typeof result.current).toBe("function");
    cleanup();
  });

  it("returns a ref callback when inactive", () => {
    const { result, cleanup } = renderHook(() => useFocusTrap(false));
    expect(typeof result.current).toBe("function");
    cleanup();
  });
});
