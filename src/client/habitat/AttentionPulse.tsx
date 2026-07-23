import { useMemo } from "react";
import type { GoalTrackEntry, AttentionAllocation } from "./types";
import { computeAttentionAllocation } from "./types";

const TRACK_LABELS: Record<GoalTrackEntry["trackKind"], string> = {
  focused: "聚焦",
  background: "后台",
  scheduled: "定时",
  waiting: "等待",
  completed: "完成",
};

const TRACK_CLASS: Record<GoalTrackEntry["trackKind"], string> = {
  focused: "habitat-pulse-focused",
  background: "habitat-pulse-background",
  scheduled: "habitat-pulse-scheduled",
  waiting: "habitat-pulse-waiting",
  completed: "habitat-pulse-completed",
};

interface AttentionPulseProps {
  entries: GoalTrackEntry[];
  onSelect: (trackKind: GoalTrackEntry["trackKind"]) => void;
}

export function AttentionPulse({ entries, onSelect }: AttentionPulseProps) {
  const allocations = useMemo(() => computeAttentionAllocation(entries), [entries]);

  if (allocations.length === 0) return null;

  return (
    <div className="habitat-pulse-bar" role="list" aria-label="注意力分配">
      {allocations.map((alloc: AttentionAllocation) => (
        <button
          key={alloc.trackKind}
          className={`habitat-pulse-segment ${TRACK_CLASS[alloc.trackKind]}`}
          style={{ width: `${alloc.ratio * 100}%` }}
          onClick={() => onSelect(alloc.trackKind)}
          role="listitem"
          aria-label={`${TRACK_LABELS[alloc.trackKind]} ${alloc.count} 个目标`}
        >
          {TRACK_LABELS[alloc.trackKind]} {alloc.count}
        </button>
      ))}
    </div>
  );
}
