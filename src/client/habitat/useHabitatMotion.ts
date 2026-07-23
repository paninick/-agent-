/**
 * client/habitat/useHabitatMotion.ts — 活动空间动画控制 hook
 *
 * 管理 full / reduced / none 三档动态效果。
 * 尊重 prefers-reduced-motion 系统设置。
 */

import { useState, useEffect, useCallback } from "react";
import type { MotionPreference } from "../../domain/agentHabitat";

const STORAGE_KEY = "habitat-motion-preference";

function getSystemPreference(): MotionPreference {
  if (typeof window === "undefined") return "full";
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
    return "reduced";
  }
  return "full";
}

function getStoredPreference(): MotionPreference | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "full" || raw === "reduced" || raw === "none") return raw;
  } catch { /* ignore */ }
  return null;
}

export function useHabitatMotion() {
  const [motion, setMotion] = useState<MotionPreference>(
    () => getStoredPreference() ?? getSystemPreference()
  );

  // 监听系统设置变化
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    const handler = (e: MediaQueryListEvent) => {
      if (!getStoredPreference()) {
        setMotion(e.matches ? "reduced" : "full");
      }
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const cycleMotion = useCallback(() => {
    setMotion((prev) => {
      const order: MotionPreference[] = ["full", "reduced", "none"];
      const next = order[(order.indexOf(prev) + 1) % order.length];
      try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const isActive = motion !== "none";
  const isReduced = motion === "reduced";

  return { motion, cycleMotion, isActive, isReduced };
}
