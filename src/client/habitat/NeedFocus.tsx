import type { DynamicTask, AgentIdentity } from "./types";

interface NeedFocusProps {
  need: string;
  receivedAt: string;
  tasks: DynamicTask[];
  allAgents: AgentIdentity[];
  onClick: () => void;
}

export function NeedFocus({ need, receivedAt, tasks, allAgents, onClick }: NeedFocusProps) {
  return (
    <div
      className="habitat-focus-area habitat-focus-need"
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label="当前需求区，点击查看详情"
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onClick(); }}
    >
      <h2 className="habitat-eyebrow">你的需求</h2>
      <p style={{ font: "800 1.4rem var(--font-display)", color: "var(--habitat-ink)", margin: "0 0 0.5rem 0" }}>
        {need}
      </p>
      <p style={{ color: "var(--habitat-mute)", fontSize: "0.78rem", fontFamily: "var(--font-data)", margin: 0 }}>
        接收于 {receivedAt} · {tasks.length} 个任务 · {allAgents.length} 个 Agent
      </p>
    </div>
  );
}
