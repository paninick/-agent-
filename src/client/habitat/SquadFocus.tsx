import type { ReactNode } from "react";

interface SquadFocusProps {
  children: ReactNode;
  squadCount: number;
  agentCount: number;
  onClick: () => void;
}

export function SquadFocus({ children, squadCount, agentCount, onClick }: SquadFocusProps) {
  return (
    <div
      className="habitat-focus-area habitat-focus-squad"
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label="Agent 小队画布区，点击查看详情"
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onClick(); }}
    >
      <h2 className="habitat-eyebrow">工作中</h2>
      <p style={{ color: "var(--habitat-mute)", fontSize: "0.78rem", marginBottom: "0.5rem", margin: 0 }}>
        {squadCount} 个小队 · {agentCount} 个 Agent
      </p>
      <div style={{ height: "calc(100% - 3rem)" }}>
        {children}
      </div>
    </div>
  );
}
