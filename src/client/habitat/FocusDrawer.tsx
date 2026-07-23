import { useEffect, useId, type ReactNode } from "react";
import { useFocusTrap } from "./useFocusTrap";

interface FocusDrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export function FocusDrawer({ open, onClose, title, children }: FocusDrawerProps) {
  const titleId = useId();
  const trapRef = useFocusTrap(open);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="habitat-drawer-overlay" onClick={onClose}>
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="habitat-drawer"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="habitat-drawer-header">
          <h2 id={titleId} className="habitat-drawer-title">{title}</h2>
          <button className="habitat-drawer-close" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </div>
        <div className="habitat-drawer-content">{children}</div>
      </div>
    </div>
  );
}
