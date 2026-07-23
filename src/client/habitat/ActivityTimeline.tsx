/**
 * client/habitat/ActivityTimeline.tsx — 24 小时活动时间线
 *
 * 底部状态栏中的时间线组件，展示一天中的关键事件。
 */

import { useMemo } from "react";
import type { TimelineEventDisplay } from "./types";

interface ActivityTimelineProps {
  events: TimelineEventDisplay[];
  /** 当前时间在 24h 中的比例 (0-1) */
  nowRatio: number;
}

const TIME_LABELS = ["00:00", "03:00", "06:00", "09:00", "12:00", "15:00", "18:00", "21:00", "24:00"];

export function ActivityTimeline({ events, nowRatio }: ActivityTimelineProps) {
  const sortedEvents = useMemo(
    () => [...events].sort((a, b) => a.timeRatio - b.timeRatio),
    [events]
  );

  return (
    <div className="habitat-timeline">
      <div className="habitat-timeline-track">
        <div className="habitat-timeline-line" />
        <div
          className="habitat-timeline-progress"
          style={{ width: `${nowRatio * 100}%` }}
        />
        <div className="habitat-timeline-events">
          <div
            className="habitat-timeline-now"
            style={{ left: `${nowRatio * 100}%` }}
          />
          {sortedEvents.map((ev) => (
            <div
              key={ev.id}
              className={`habitat-timeline-event${ev.important ? " important" : ""}`}
              style={{
                left: `${ev.timeRatio * 100}%`,
                background: ev.color,
                color: ev.color,
              }}
              title={ev.label}
            />
          ))}
        </div>
      </div>
      <div className="habitat-timeline-labels">
        {TIME_LABELS.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
    </div>
  );
}
