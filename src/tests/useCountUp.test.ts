// @vitest-environment jsdom
/**
 * useCountUp.test.ts - 数字滚动 hook 单元测试
 *
 * 覆盖：
 *   - 初始值为 0
 *   - target 变化后动画到目标值
 *   - target 为 0 时直接返回 0
 *   - target 二次变化时从正确起点动画（stale closure 修复验证）
 *   - 清理时取消 requestAnimationFrame
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { useCountUp } from "../client/useCountUp";

// ===== 测试用包装组件 =====

function Counter({ target, duration = 800 }: { target: number; duration?: number }) {
  const value = useCountUp(target, duration);
  return createElement("span", { "data-testid": "value" }, value.toFixed(2));
}

// ===== Helpers =====

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function render(props: { target: number; duration?: number }) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(createElement(Counter, props));
  });
}

function rerender(props: { target: number; duration?: number }) {
  act(() => {
    root!.render(createElement(Counter, props));
  });
}

function cleanup() {
  if (root) {
    act(() => root!.unmount());
    root = null;
  }
  if (container) {
    container.remove();
    container = null;
  }
}

function getValue(): string {
  return container!.querySelector('[data-testid="value"]')!.textContent!;
}

// ===== Mock requestAnimationFrame =====

let rafCallbacks: FrameRequestCallback[] = [];
let rafIdCounter = 0;

beforeEach(() => {
  rafCallbacks = [];
  rafIdCounter = 0;
  vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((cb: FrameRequestCallback) => {
    const id = ++rafIdCounter;
    rafCallbacks.push(cb);
    return id;
  });
  vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** 模拟 requestAnimationFrame 回调执行，用递增时间模拟连续帧 */
function flushRaf(startTimeMs: number, frameIntervalMs = 16): void {
  let currentTime = startTimeMs;
  let safety = 0;
  while (rafCallbacks.length > 0 && safety < 200) {
    const callbacks = [...rafCallbacks];
    rafCallbacks = [];
    for (const cb of callbacks) {
      cb(currentTime);
    }
    currentTime += frameIntervalMs;
    safety++;
  }
}

/** 模拟单次帧执行（不递增时间，用于检查初始状态） */
function flushSingleFrame(timeMs: number): void {
  const callbacks = [...rafCallbacks];
  rafCallbacks = [];
  for (const cb of callbacks) {
    cb(timeMs);
  }
}

// ===== Tests =====

describe("useCountUp", () => {
  it("starts at 0 before animation", () => {
    render({ target: 100, duration: 800 });
    expect(getValue()).toBe("0.00");
  });

  it("animates to target value over duration", () => {
    render({ target: 100, duration: 800 });

    // 从 time=0 开始，每帧 16ms，模拟足够多的帧让动画完成（800ms / 16ms ≈ 50 帧）
    act(() => flushRaf(0));
    const finalValue = parseFloat(getValue());
    expect(finalValue).toBe(100);
  });

  it("returns 0 immediately when target is 0", () => {
    render({ target: 0, duration: 800 });
    expect(getValue()).toBe("0.00");
  });

  it("animates from correct start point on second target change (stale closure fix)", () => {
    // 第一次：target = 100, duration = 800
    render({ target: 100, duration: 800 });

    // 动画到完成
    act(() => flushRaf(0));
    expect(getValue()).toBe("100.00");

    // 第二次：target = 200
    rerender({ target: 200, duration: 800 });

    // 执行第一帧（time 从 0 开始）
    // fromRef.current 应该是 100（上一次的 display 值），而不是 stale 0
    act(() => flushSingleFrame(0));
    const startValue = parseFloat(getValue());
    // 应该从接近 100 的位置开始，而不是从 0
    // 第一帧 elapsed=0, progress=0, eased=0, current = fromRef + (target-fromRef)*0 = fromRef = 100
    expect(startValue).toBe(100);

    // 动画完成到 200
    act(() => flushRaf(0));
    expect(getValue()).toBe("200.00");
  });

  it("cancels animation frame on unmount", () => {
    render({ target: 100, duration: 800 });
    // 触发一个 raf 注册
    act(() => flushRaf(100));

    const cancelSpy = vi.mocked(globalThis.cancelAnimationFrame);
    cleanup();

    // unmount 后应该调用 cancelAnimationFrame
    expect(cancelSpy).toHaveBeenCalled();
  });
});
