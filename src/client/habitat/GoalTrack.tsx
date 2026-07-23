/**
 * client/habitat/GoalTrack.tsx — 目标轨道面板
 *
 * 展示 Agent 的注意力分配：当前聚焦 / 后台运行 / 定时自动化 / 等待用户 / 已完成
 */

import type { GoalTrackEntry } from "./types";

interface GoalTrackProps {
  entries: GoalTrackEntry[];
}

const TRACK_COLORS: Record<GoalTrackEntry["trackKind"], string> = {
  focused: "#4BA89A",
  background: "#4E72D8",
  scheduled: "#8B6CCF",
  waiting: "#E4A84B",
  completed: "#5f6e8a",
};

const TRACK_LABELS: Record<GoalTrackEntry["trackKind"], string> = {
  focused: "当前聚焦",
  background: "后台运行",
  scheduled: "定时自动化",
  waiting: "等待你确认",
  completed: "已完成",
};

export function GoalTrack({ entries }: GoalTrackProps) {
  if (entries.length === 0) return null;

  return (
    <div className="habitat-goal-track">
      {entries.map((entry) => (
        <div className="habitat-goal-track-item" key={entry.goalId}>
          <span
            className="habitat-goal-track-dot"
            style={{ background: TRACK_COLORS[entry.trackKind] }}
          />
          <span className="habitat-goal-track-label">{entry.need}</span>
          <span className="habitat-goal-track-status">
            {TRACK_LABELS[entry.trackKind]}
          </span>
        </div>
      ))}
    </div>
  );
}
