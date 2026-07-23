/**
 * client/habitat/MemoryPanel.tsx — 成果与记忆面板
 *
 * 展示 Agent 学到的偏好、已完成的成果、自动执行规则、可复用流程。
 * 按 kind 分区展示，每区有标题、计数和条目详情。
 */

import type { HabitatMemoryArtifact } from "./types";

interface MemoryPanelProps {
  memories: HabitatMemoryArtifact[];
}

type DisplayKind = "result" | "preference" | "rule" | "procedure";

interface KindZoneConfig {
  kind: DisplayKind;
  label: string;
  icon: string;
  description: string;
}

const KIND_ZONES: KindZoneConfig[] = [
  { kind: "result", label: "成果", icon: "✓", description: "已完成的预订、生成的文件、发送的消息" },
  { kind: "preference", label: "偏好", icon: "♥", description: "用户确认的偏好" },
  { kind: "rule", label: "规则", icon: "⚙", description: "自动执行规则" },
  { kind: "procedure", label: "流程", icon: "📋", description: "可复用流程" },
];

function isDisplayKind(kind: string): kind is DisplayKind {
  return KIND_ZONES.some((z) => z.kind === kind);
}

function formatTime(createdAt: string): string {
  const date = new Date(createdAt);
  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  const time = date.toLocaleString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  return isToday ? `今天 ${time}` : `${date.toLocaleDateString("zh-CN")} ${time}`;
}

function confidencePercent(confidence: number): number {
  return confidence > 1 ? Math.round(confidence) : Math.round(confidence * 100);
}

function extractSavings(statement: string): { time?: string; cost?: string } {
  const timeMatch = statement.match(/(?:节省|省|节约)\s*(\d+\s*(?:分钟|小时|分|时))/);
  const costMatch = statement.match(/(?:节省|省|节约|便宜|省下)\s*(\d+(?:\.\d+)?\s*元)/);
  return {
    time: timeMatch?.[1],
    cost: costMatch?.[1],
  };
}

function extractRuleCondition(statement: string): string {
  const whenMatch = statement.match(/当(.+?)时/);
  if (whenMatch) return `当${whenMatch[1]}时`;
  const ifMatch = statement.match(/如果(.+?)(?:[，,就则])/);
  if (ifMatch) return `如果${ifMatch[1]}`;
  return "自动执行";
}

function MemoryItem({ mem }: { mem: HabitatMemoryArtifact }) {
  const pct = confidencePercent(mem.confidence);
  const savings = mem.kind === "result" ? extractSavings(mem.statement) : null;
  const ruleCondition = mem.kind === "rule" ? extractRuleCondition(mem.statement) : null;
  const hasResultExtra = mem.kind === "result" && (savings?.time || savings?.cost);

  return (
    <div className="habitat-memory-item" key={mem.id}>
      <div className="habitat-memory-statement">{mem.statement}</div>

      <div className="habitat-memory-meta">
        <div className="habitat-memory-confidence">
          <div
            className="habitat-memory-confidence-track"
            style={{
              display: "inline-block",
              width: "48px",
              height: "4px",
              background: "rgba(255,255,255,0.1)",
              borderRadius: "2px",
              overflow: "hidden",
              verticalAlign: "middle",
              marginRight: "6px",
            }}
          >
            <div
              className="habitat-memory-confidence-bar"
              style={{
                width: `${pct}%`,
                height: "100%",
                background: "var(--mint, #7fd1b9)",
                borderRadius: "2px",
              }}
            />
          </div>
          <span className="habitat-memory-confidence-text">{pct}% 确信</span>
        </div>

        <span
          className={`habitat-memory-confirmed ${mem.userConfirmed ? "confirmed" : "pending"}`}
        >
          {mem.userConfirmed ? "✓ 已确认" : "○ 待确认"}
        </span>

        {mem.learnedFrom.length > 0 && (
          <span className="habitat-memory-source">来自：{mem.learnedFrom.join("、")}</span>
        )}
      </div>

      {hasResultExtra && (
        <div className="habitat-memory-result-extra">
          {savings?.time && (
            <span className="habitat-memory-saving">⏱ 节省 {savings.time}</span>
          )}
          {savings?.cost && (
            <span className="habitat-memory-saving">💰 节省 {savings.cost}</span>
          )}
        </div>
      )}

      {mem.kind === "result" && (
        <div className="habitat-memory-result-time">
          <span className="habitat-memory-time">完成于 {formatTime(mem.createdAt)}</span>
        </div>
      )}

      {mem.kind === "preference" && mem.userConfirmed && (
        <div className="habitat-memory-preference-extra">
          <span
            className="habitat-memory-badge confirmed"
            style={{
              display: "inline-block",
              padding: "1px 6px",
              fontSize: "0.62rem",
              borderRadius: "3px",
              background: "rgba(127, 209, 185, 0.18)",
              color: "var(--mint, #7fd1b9)",
              border: "1px solid rgba(127, 209, 185, 0.4)",
            }}
          >
            已确认
          </span>
        </div>
      )}

      {mem.kind === "rule" && ruleCondition && (
        <div className="habitat-memory-rule-extra">
          <span className="habitat-memory-condition">生效条件：{ruleCondition}</span>
        </div>
      )}
    </div>
  );
}

export function MemoryPanel({ memories }: MemoryPanelProps) {
  if (memories.length === 0) return null;

  const grouped = new Map<DisplayKind, HabitatMemoryArtifact[]>();
  for (const zone of KIND_ZONES) {
    grouped.set(zone.kind, []);
  }
  for (const mem of memories) {
    if (isDisplayKind(mem.kind)) {
      grouped.get(mem.kind)!.push(mem);
    }
  }

  const visibleZones = KIND_ZONES.filter((zone) => (grouped.get(zone.kind) ?? []).length > 0);

  if (visibleZones.length === 0) return null;

  return (
    <div className="habitat-memory-panel">
      {visibleZones.map((zone) => {
        const items = grouped.get(zone.kind) ?? [];
        return (
          <div className="habitat-memory-zone" key={zone.kind}>
            <div className="habitat-memory-zone-header">
              <span className="habitat-memory-zone-icon">{zone.icon}</span>
              <span className="habitat-memory-zone-title">{zone.label}</span>
              <span className="habitat-memory-zone-count">({items.length})</span>
              <span className="habitat-memory-zone-desc">{zone.description}</span>
            </div>
            <div className="habitat-memory-zone-items">
              {items.map((mem) => (
                <MemoryItem key={mem.id} mem={mem} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
