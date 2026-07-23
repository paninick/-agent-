import { useCallback, useEffect, type RefCallback } from "react";

/**
 * focus trap hook — 将 Tab 焦点循环限制在容器内。
 * 当 active 为 true 时，焦点不会离开容器边界。
 */
export function useFocusTrap(active: boolean): RefCallback<HTMLElement> {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!active || e.key !== "Tab") return;
      const container = e.currentTarget as HTMLElement;
      const focusable = container.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [active]
  );

  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => handleKeyDown(e);
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [active, handleKeyDown]);

  return useCallback((node: HTMLElement | null) => {
    if (node && active) {
      const first = node.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      first?.focus();
    }
  }, [active]);
}
