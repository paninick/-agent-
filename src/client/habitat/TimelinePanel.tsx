/**
 * client/habitat/TimelinePanel.tsx — 结果区独立时间线
 *
 * 将 Agent 的活动事件 + 记忆成果按时间倒序合并展示为独立垂直时间线。
 * 与底部状态栏的 ActivityTimeline（24h 紧凑条）互补：
 *   - ActivityTimeline：24h 全局节奏概览（紧凑条）
 *   - TimelinePanel：完整事件流（垂直卡片，可过滤分类）
 *
 * 事件分类：
 *   - decision  决策请求（红色，高影响）
 *   - action    行动执行（蓝色，含 tool_called / action_executed）
 *   - result    产出交付（绿色，含 result_delivered / memory_consolidated / memories.result）
 *   - memory    记忆沉淀（紫色，含 memories.preference / rule / procedure）
 *   - collaboration 协作事件（青色，含 agent_created / agent_joined_squad / evidence_shared / agent_dissolved）
 *   - state     状态变更（琥珀，含 need_received / need_clarified / goal_confirmed）
 */

import { useMemo, useState } from "react";
import type {
  HabitatSnapshot,
  HabitatMemoryArtifact,
  HabitatActivityKind,
} from "../../domain/agentHabitat";

// ============================================================
// 类型与常量
// ============================================================

export type TimelineCategory =
  | "decision"
  | "action"
  | "result"
  | "memory"
  | "collaboration"
  | "state";

export interface TimelineEntry {
  /** 事件唯一 ID（带前缀避免冲突） */
  id: string;
  /** ISO 时间戳 */
  occurredAt: string;
  /** 分类 */
  category: TimelineCategory;
  /** 事件摘要 */
  summary: string;
  /** 关联 Agent ID */
  actorId?: string;
  /** 主色 hex */
  color: string;
  /** 图标（单字符） */
  icon: string;
  /** 来源（activity / memory） */
  source: "activity" | "memory";
  /** 是否重要 */
  important?: boolean;
  /** 记忆类型（仅 source=memory） */
  memoryKind?: HabitatMemoryArtifact["kind"];
}

interface CategoryConfig {
  category: TimelineCategory;
  label: string;
  icon: string;
  color: string;
}

const CATEGORY_CONFIG: Record<TimelineCategory, CategoryConfig> = {
  decision: { category: "decision", label: "决策", icon: "!", color: "#C75A4A" },
  action: { category: "action", label: "行动", icon: "▶", color: "#4E72D8" },
  result: { category: "result", label: "产出", icon: "✓", color: "#4BA89A" },
  memory: { category: "memory", label: "记忆", icon: "◇", color: "#8B6CCF" },
  collaboration: { category: "collaboration", label: "协作", icon: "⇄", color: "#5DA8E0" },
  state: { category: "state", label: "状态", icon: "·", color: "#E4A84B" },
};

const CATEGORY_ORDER: TimelineCategory[] = [
  "decision", "action", "result", "memory", "collaboration", "state",
];

/** Resident Agent 主色映射（与 HabitatWorkspace.buildTimelineEvents 一致） */
const ACTOR_COLOR: Record<string, string> = {
  "resident-steward": "#E4A84B",
  "resident-planner": "#4E72D8",
  "resident-memory": "#8B6CCF",
  "resident-guardian": "#C75A4A",
};

// ============================================================
// 分类映射
// ============================================================

function classifyActivityKind(kind: HabitatActivityKind): TimelineCategory {
  switch (kind) {
    case "decision_requested":
      return "decision";
    case "action_executed":
    case "tool_called":
      return "action";
    case "result_delivered":
    case "memory_consolidated":
      return "result";
    case "agent_created":
    case "agent_joined_squad":
    case "evidence_shared":
    case "agent_dissolved":
      return "collaboration";
    case "need_received":
    case "need_clarified":
    case "goal_confirmed":
      return "state";
    default:
      return "state";
  }
}

function activityIcon(kind: HabitatActivityKind): string {
  const cat = classifyActivityKind(kind);
  return CATEGORY_CONFIG[cat].icon;
}

function memoryIcon(kind: HabitatMemoryArtifact["kind"]): string {
  switch (kind) {
    case "result": return CATEGORY_CONFIG.result.icon;
    case "preference":
    case "rule":
    case "procedure":
    case "relationship":
      return CATEGORY_CONFIG.memory.icon;
    default:
      return CATEGORY_CONFIG.memory.icon;
  }
}

// ============================================================
// 事件合并
// ============================================================

function buildTimelineEntries(snapshot: HabitatSnapshot): TimelineEntry[] {
  const entries: TimelineEntry[] = [];

  // 活动事件
  for (const ev of snapshot.activity) {
    const category = classifyActivityKind(ev.kind);
    const cfg = CATEGORY_CONFIG[category];
    entries.push({
      id: `act-${ev.id}`,
      occurredAt: ev.occurredAt,
      category,
      summary: ev.summary,
      actorId: ev.actorId,
      color: ACTOR_COLOR[ev.actorId] ?? cfg.color,
      icon: activityIcon(ev.kind),
      source: "activity",
      important: ev.important,
    });
  }

  // 记忆成果
  for (const mem of snapshot.memories) {
    const isResult = mem.kind === "result";
    const category: TimelineCategory = isResult ? "result" : "memory";
    const cfg = CATEGORY_CONFIG[category];
    entries.push({
      id: `mem-${mem.id}`,
      occurredAt: mem.createdAt,
      category,
      summary: mem.statement,
      color: cfg.color,
      icon: memoryIcon(mem.kind),
      source: "memory",
      memoryKind: mem.kind,
      important: isResult,
    });
  }

  // 按时间倒序（最新在前）
  entries.sort((a, b) => {
    const ta = new Date(a.occurredAt).getTime();
    const tb = new Date(b.occurredAt).getTime();
    return tb - ta;
  });

  return entries;
}

// ============================================================
// 时间格式化
// ============================================================

function formatTimelineTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const isSameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  const time = date.toLocaleString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (isSameDay) return `今天 ${time}`;
  const dateStr = date.toLocaleDateString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
  });
  return `${dateStr} ${time}`;
}

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "刚刚";
  if (diffMin < 60) return `${diffMin} 分钟前`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} 小时前`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay} 天前`;
  return formatTimelineTime(iso);
}

// ============================================================
// 过滤器
// ============================================================

interface FilterChipProps {
  category: TimelineCategory;
  count: number;
  active: boolean;
  onClick: () => void;
}

function FilterChip({ category, count, active, onClick }: FilterChipProps) {
  const cfg = CATEGORY_CONFIG[category];
  return (
    <button
      type="button"
      className={`habitat-timeline-filter-chip${active ? " active" : ""}`}
      onClick={onClick}
      style={active ? { borderColor: cfg.color, color: cfg.color } : undefined}
      aria-pressed={active}
    >
      <span className="habitat-timeline-filter-icon" style={{ color: cfg.color }}>
        {cfg.icon}
      </span>
      <span>{cfg.label}</span>
      <span className="habitat-timeline-filter-count">{count}</span>
    </button>
  );
}

// ============================================================
// 时间线项
// ============================================================

interface TimelineItemProps {
  entry: TimelineEntry;
  actorName?: string;
}

function TimelineItem({ entry, actorName }: TimelineItemProps) {
  const cfg = CATEGORY_CONFIG[entry.category];
  return (
    <li
      className={`habitat-timeline-item${entry.important ? " important" : ""}`}
      data-category={entry.category}
    >
      <div className="habitat-timeline-item-time">
        <div className="habitat-timeline-item-time-main">
          {formatTimelineTime(entry.occurredAt)}
        </div>
        <div className="habitat-timeline-item-time-relative">
          {formatRelativeTime(entry.occurredAt)}
        </div>
      </div>

      <div className="habitat-timeline-item-marker">
        <span
          className="habitat-timeline-item-dot"
          style={{
            background: entry.color,
            boxShadow: entry.important ? `0 0 0 3px ${entry.color}33` : undefined,
          }}
          aria-hidden="true"
        >
          {entry.icon}
        </span>
        <span className="habitat-timeline-item-line" aria-hidden="true" />
      </div>

      <div className="habitat-timeline-item-body">
        <div className="habitat-timeline-item-header">
          <span
            className="habitat-timeline-item-category"
            style={{ color: cfg.color, borderColor: `${cfg.color}55` }}
          >
            {cfg.label}
          </span>
          {entry.source === "memory" && entry.memoryKind && (
            <span className="habitat-timeline-item-source-tag">记忆 · {entry.memoryKind}</span>
          )}
          {entry.source === "activity" && actorName && (
            <span className="habitat-timeline-item-source-tag">来自 {actorName}</span>
          )}
        </div>
        <div className="habitat-timeline-item-summary">{entry.summary}</div>
      </div>
    </li>
  );
}

// ============================================================
// 主组件
// ============================================================

interface TimelinePanelProps {
  snapshot: HabitatSnapshot;
  /** 初始过滤分类（undefined = 全部） */
  initialFilter?: TimelineCategory | "all";
}

export function TimelinePanel({ snapshot, initialFilter = "all" }: TimelinePanelProps) {
  const allEntries = useMemo(() => buildTimelineEntries(snapshot), [snapshot]);

  // 按分类计数
  const categoryCounts = useMemo(() => {
    const counts: Record<TimelineCategory, number> = {
      decision: 0, action: 0, result: 0,
      memory: 0, collaboration: 0, state: 0,
    };
    for (const entry of allEntries) {
      counts[entry.category]++;
    }
    return counts;
  }, [allEntries]);

  const [filter, setFilter] = useState<TimelineCategory | "all">(initialFilter);

  const visibleEntries = useMemo(() => {
    if (filter === "all") return allEntries;
    return allEntries.filter((e) => e.category === filter);
  }, [allEntries, filter]);

  // Agent ID → name 映射
  const agentNameMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of snapshot.residentAgents) m.set(a.id, a.name);
    for (const a of snapshot.ephemeralAgents) m.set(a.id, a.name);
    return m;
  }, [snapshot.residentAgents, snapshot.ephemeralAgents]);

  return (
    <div className="habitat-timeline-panel">
      <header className="habitat-timeline-panel-header">
        <div className="habitat-timeline-panel-title">
          <h3>结果时间线</h3>
          <span className="habitat-timeline-panel-count">
            共 {allEntries.length} 条事件
          </span>
        </div>
        <p className="habitat-timeline-panel-desc">
          Agent 的决策、行动、产出与记忆事件按时间倒序展示
        </p>
      </header>

      <div className="habitat-timeline-filters" role="group" aria-label="事件过滤">
        <button
          type="button"
          className={`habitat-timeline-filter-chip${filter === "all" ? " active" : ""}`}
          onClick={() => setFilter("all")}
          aria-pressed={filter === "all"}
          style={filter === "all" ? { borderColor: "var(--ink-primary, #e8eaed)", color: "var(--ink-primary, #e8eaed)" } : undefined}
        >
          <span>全部</span>
          <span className="habitat-timeline-filter-count">{allEntries.length}</span>
        </button>
        {CATEGORY_ORDER.map((cat) => (
          <FilterChip
            key={cat}
            category={cat}
            count={categoryCounts[cat]}
            active={filter === cat}
            onClick={() => setFilter(cat)}
          />
        ))}
      </div>

      {visibleEntries.length === 0 ? (
        <div className="habitat-timeline-empty">暂无事件</div>
      ) : (
        <ol className="habitat-timeline-list" role="list">
          {visibleEntries.map((entry) => (
            <TimelineItem
              key={entry.id}
              entry={entry}
              actorName={entry.actorId ? agentNameMap.get(entry.actorId) : undefined}
            />
          ))}
        </ol>
      )}
    </div>
  );
}
