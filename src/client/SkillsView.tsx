/**
 * client/SkillsView.tsx - 技能与工具视图
 *
 * 数据流：
 *   - /api/skills -> SkillViewSummary（技能注册表 + 上下文预算汇总）
 *
 * 设计原则（与 TasksView / ChannelsView 一致）：
 *   - 顶部：汇总条（技能总数 / 估算总 token / 预算利用率 / 上下文窗口等级）
 *   - 中部：上下文预算可视化（估算 token vs 可用预算，利用率条）
 *   - 主体左侧：技能列表（name + description + origin badge + token 估算 + 行/字符数）
 *   - 主体右侧：选中技能的完整描述符详情
 *   - 复用主题变量：--panel / --mint / --cyan / --amber / --red / --steel
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Boxes,
  Code2,
  Cpu,
  FileCode,
  Filter,
  Layers,
  RefreshCw,
} from "lucide-react/dist/esm/lucide-react.mjs";
import {
  PRIORITY_META,
  TIER_META,
  createMockSkillViewSummary,
  type SkillViewEntry,
  type SkillViewPriority,
  type SkillViewSummary,
} from "./skillViewTypes";

// ===== Priority filter =====

const PRIORITY_FILTERS: Array<{ id: SkillViewPriority | "all"; label: string }> = [
  { id: "all", label: "全部" },
  { id: "always_needed", label: "常驻" },
  { id: "sometimes_needed", label: "按需" },
  { id: "rarely_needed", label: "备用" },
];

// ===== API helpers =====

const USE_MOCK_FALLBACK = import.meta.env.DEV;

async function fetchSkills(): Promise<SkillViewSummary> {
  try {
    const res = await fetch("/api/skills");
    if (!res.ok) throw new Error(`GET /api/skills failed: ${res.status}`);
    return (await res.json()) as SkillViewSummary;
  } catch (err) {
    if (USE_MOCK_FALLBACK) {
      return createMockSkillViewSummary("medium");
    }
    throw err;
  }
}

// ===== Subcomponents =====

function PriorityBadge({ priority }: { priority: SkillViewPriority }) {
  const meta = PRIORITY_META[priority];
  return (
    <span className="skill-priority-badge" style={{ color: meta.color, borderColor: meta.color }}>
      {meta.label}
    </span>
  );
}

function OriginBadge({ origin }: { origin: string }) {
  return (
    <span className="skill-origin-badge" title={`来源: ${origin}`}>
      {origin}
    </span>
  );
}

function ContextBudgetBar({ summary }: { summary: SkillViewSummary }) {
  const pct = Math.min(100, summary.utilizationPercent);
  const tierMeta = TIER_META[summary.contextWindowTier];
  const overBudget = summary.utilizationPercent > 80;
  return (
    <div className="skill-budget-bar-section">
      <div className="skill-budget-bar-header">
        <span className="skill-budget-label"><Cpu size={13} /> 上下文预算</span>
        <span className="skill-budget-tier">{tierMeta.label} ({summary.windowSize.toLocaleString()} tokens)</span>
      </div>
      <div className="skill-budget-track">
        <div
          className="skill-budget-fill"
          style={{
            width: `${pct}%`,
            background: overBudget ? "var(--red)" : pct > 60 ? "var(--amber)" : "var(--mint)",
          }}
        />
      </div>
      <div className="skill-budget-meta">
        <span>估算 {summary.totalEstimatedTokens.toLocaleString()} tokens</span>
        <span>可用 {summary.availableBudget.toLocaleString()} tokens</span>
        <strong style={{ color: overBudget ? "var(--red)" : "var(--mint)" }}>{summary.utilizationPercent}%</strong>
      </div>
      {summary.warnings.map((w, i) => (
        <p key={i} className="skill-warning">{w}</p>
      ))}
    </div>
  );
}

function SkillListItem({ entry, selected, onSelect }: { entry: SkillViewEntry; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      className={selected ? "skill-list-item selected" : "skill-list-item"}
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
    >
      <div className="skill-list-item-head">
        <PriorityBadge priority={entry.priority} />
        <OriginBadge origin={entry.origin} />
        <span className="skill-list-item-tokens">{entry.tokens.toLocaleString()} tok</span>
      </div>
      <strong className="skill-list-item-name">{entry.name}</strong>
      <p className="skill-list-item-desc">{entry.description}</p>
      <div className="skill-list-item-meta">
        <span><FileCode size={11} /> {entry.lineCount} 行</span>
        <span>{entry.charCount.toLocaleString()} 字符</span>
        <span className="skill-list-item-id">{entry.skillId}</span>
      </div>
    </button>
  );
}

function SkillDetailDrawer({ entry, onClose }: { entry: SkillViewEntry; onClose: () => void }) {
  const meta = PRIORITY_META[entry.priority];
  return (
    <div className="skill-detail-drawer" role="dialog" aria-label={`技能详情 ${entry.skillId}`}>
      <div className="skill-detail-head">
        <div>
          <div className="skill-detail-badges">
            <PriorityBadge priority={entry.priority} />
            <OriginBadge origin={entry.origin} />
          </div>
          <h3 className="skill-detail-title">{entry.name}</h3>
        </div>
        <button type="button" className="skill-detail-close" onClick={onClose} aria-label="关闭">×</button>
      </div>

      <div className="skill-detail-section">
        <h4 className="skill-detail-section-title">描述</h4>
        <p className="skill-detail-text">{entry.description}</p>
      </div>

      <div className="skill-detail-grid">
        <div className="skill-detail-metric">
          <span className="skill-detail-metric-label">Token 估算</span>
          <span className="skill-detail-metric-value">{entry.tokens.toLocaleString()}</span>
        </div>
        <div className="skill-detail-metric">
          <span className="skill-detail-metric-label">估算方法</span>
          <span className="skill-detail-metric-value">
            {entry.tokenMethod === "prose" ? "散文" : entry.tokenMethod === "code" ? "代码" : "混合"}
          </span>
        </div>
        <div className="skill-detail-metric">
          <span className="skill-detail-metric-label">行数</span>
          <span className="skill-detail-metric-value">{entry.lineCount}</span>
        </div>
        <div className="skill-detail-metric">
          <span className="skill-detail-metric-label">字符数</span>
          <span className="skill-detail-metric-value">{entry.charCount.toLocaleString()}</span>
        </div>
      </div>

      <div className="skill-detail-section">
        <h4 className="skill-detail-section-title"><Code2 size={13} /> 文件路径</h4>
        <code className="skill-detail-code">{entry.filePath}</code>
      </div>

      <div className="skill-detail-section">
        <h4 className="skill-detail-section-title"><Layers size={13} /> 优先级</h4>
        <p className="skill-detail-text" style={{ color: meta.color }}>
          {meta.label} - {entry.priority}
        </p>
      </div>

      <div className="skill-detail-section">
        <h4 className="skill-detail-section-title">Skill ID</h4>
        <code className="skill-detail-code">{entry.skillId}</code>
      </div>
    </div>
  );
}

// ===== Main component =====

export function SkillsView() {
  const [summary, setSummary] = useState<SkillViewSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [priorityFilter, setPriorityFilter] = useState<SkillViewPriority | "all">("all");
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchSkills();
      setSummary(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const entries = useMemo(() => summary?.entries ?? [], [summary]);

  const filteredEntries = useMemo(() => {
    const filtered = priorityFilter === "all" ? entries : entries.filter((e) => e.priority === priorityFilter);
    return [...filtered].sort((a, b) => b.tokens - a.tokens);
  }, [entries, priorityFilter]);

  const selectedSkill = useMemo(
    () => entries.find((e) => e.skillId === selectedSkillId) ?? null,
    [entries, selectedSkillId],
  );

  const counts = useMemo(() => {
    const byPriority: Record<string, number> = { all: entries.length };
    for (const e of entries) {
      byPriority[e.priority] = (byPriority[e.priority] ?? 0) + 1;
    }
    return byPriority;
  }, [entries]);

  if (loading && !summary) {
    return (
      <section className="skills-view" aria-label="技能与工具">
        <div className="data-loading" role="status">加载技能数据…</div>
      </section>
    );
  }

  if (error || !summary) {
    return (
      <section className="skills-view" aria-label="技能与工具">
        <div className="data-error-banner" role="alert">
          技能数据加载失败：{error ?? "未知错误"}
        </div>
      </section>
    );
  }

  return (
    <section className="skills-view" aria-label="技能与工具">
      <header className="skills-view-head">
        <div className="skills-view-title">
          <h2><Boxes size={20} /> 技能与工具</h2>
          <p className="skills-view-subtitle">技能注册表 - Token 估算 · 上下文预算 · 优先级分类</p>
        </div>
        <button type="button" className="skills-refresh-btn" onClick={() => void refresh()} disabled={loading} aria-label="刷新">
          <RefreshCw size={14} className={loading ? "spin" : ""} />
          <span>{loading ? "刷新中…" : "刷新"}</span>
        </button>
      </header>

      {/* 汇总条 */}
      <div className="skills-summary">
        <div className="skills-summary-item">
          <span className="skills-summary-label"><Boxes size={13} /> 技能总数</span>
          <strong className="skills-summary-value">{summary.totalSkills}</strong>
        </div>
        <div className="skills-summary-item">
          <span className="skills-summary-label"><Code2 size={13} /> 估算总 Token</span>
          <strong className="skills-summary-value">{summary.totalEstimatedTokens.toLocaleString()}</strong>
        </div>
        <div className="skills-summary-item">
          <span className="skills-summary-label"><Cpu size={13} /> 预算利用率</span>
          <strong className={summary.utilizationPercent > 80 ? "skills-summary-value fail" : "skills-summary-value ok"}>
            {summary.utilizationPercent}%
          </strong>
        </div>
        <div className="skills-summary-item">
          <span className="skills-summary-label"><Layers size={13} /> 窗口等级</span>
          <strong className="skills-summary-value">{TIER_META[summary.contextWindowTier].label}</strong>
        </div>
      </div>

      {/* 上下文预算可视化 */}
      <ContextBudgetBar summary={summary} />

      {/* 优先级过滤 */}
      <div className="skills-filters" aria-label="优先级过滤">
        <Filter size={13} aria-hidden="true" />
        {PRIORITY_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={priorityFilter === f.id ? "skills-filter active" : "skills-filter"}
            onClick={() => setPriorityFilter(f.id)}
          >
            {f.label}
            <span className="skills-filter-count">{counts[f.id] ?? 0}</span>
          </button>
        ))}
      </div>

      {/* 主体：列表 + 详情 */}
      <div className="skills-body">
        <div className="skills-list" role="list">
          {filteredEntries.length === 0 ? (
            <p className="skills-empty-hint">无匹配的技能。调整过滤条件查看。</p>
          ) : (
            filteredEntries.map((entry) => (
              <SkillListItem
                key={entry.skillId}
                entry={entry}
                selected={selectedSkillId === entry.skillId}
                onSelect={() => setSelectedSkillId(entry.skillId)}
              />
            ))
          )}
        </div>

        <div className="skills-detail">
          {selectedSkill ? (
            <SkillDetailDrawer entry={selectedSkill} onClose={() => setSelectedSkillId(null)} />
          ) : (
            <div className="skills-detail-placeholder">
              <Boxes size={32} aria-hidden="true" />
              <p>选择左侧任意技能查看详情</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
