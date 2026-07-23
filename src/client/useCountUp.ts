/**
 * client/useCountUp.ts — 数字滚动 hook
 *
 * 从 0 滚动到目标值，ease-out 缓动。
 * 用于 KPI 卡片，使数字"活"起来。
 */

import { useEffect, useRef, useState } from "react";

/**
 * @param target 目标数值
 * @param duration 滚动时长（毫秒），默认 800ms
 * @returns 当前滚动中的数值
 */
export function useCountUp(target: number, duration = 800): number {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef<number | undefined>(undefined);
  const startRef = useRef<number | undefined>(undefined);
  const fromRef = useRef(0);
  // displayRef 镜像 display 的最新值，使 effect 能读取当前渲染值而非闭包捕获的旧值。
  // 修复 stale closure bug：原代码 fromRef.current = display 读取的是 effect 创建时
  // 闭包捕获的 display（不在 deps 中），导致 target 变化时从错误的起点动画。
  const displayRef = useRef(0);

  // 同步 displayRef <-> display
  displayRef.current = display;

  useEffect(() => {
    // 跳过极小变化或零
    if (target === 0) {
      setDisplay(0);
      return;
    }

    fromRef.current = displayRef.current;
    startRef.current = undefined;

    const easeOut = (t: number): number => 1 - Math.pow(1 - t, 3);

    const tick = (now: number): void => {
      if (startRef.current === undefined) startRef.current = now;
      const elapsed = now - startRef.current;
      const progress = Math.min(1, elapsed / duration);
      const eased = easeOut(progress);
      const current = fromRef.current + (target - fromRef.current) * eased;
      setDisplay(current);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setDisplay(target);
      }
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disabled deps: target + duration only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);

  return display;
}