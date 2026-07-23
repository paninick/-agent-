/**
 * client/DecisionCenter.tsx — 决策中心式首屏
 *
 * UI/UX 专家论证结论：决策中心替代7阶段认知流作为默认首屏。
 * 用户进入后第一眼看到的是"需要我决策什么"，而不是"系统怎么工作"。
 *
 * 设计原则（来自 frontend-design skill）：
 * - 结构编码信息：P0 卡片左侧红带 + 顶部置顶，priority 即视觉权重
 * - 类型对比：标题 Georgia 衬线 + 标签 Cascadia 等宽，避免单一字族模板感
 * - 每张卡片一个明确动作：接受/拒绝/暂存，无歧义
 * - 冲突可视化：conflictsWith 用警示边框 + 关联线提示
 * - 减少硬数据堆砌：置信度用进度条 + 百分比，不用数字墙
 *
 * 布局：1 主列，过滤器在顶，卡片纵向排列按优先级排序
 */

import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  TrendingUp,
  LogOut,
  Eye,
  ChevronRight,
  Check,
  X,
  Clock,
  Filter,
  ArrowUpDown,
  AlertCircle,
} from "lucide-react/dist/esm/lucide-react.mjs";
import type {
  DecisionItem,
  DecisionPriority,
  DecisionCategory,
  DecisionStatus,
} from "./decisionTypes";

// === 优先级元数据 ===
// 颜色编码 + 时效语义：P0=红/紧迫，P1=琥珀/重要，P2=钢蓝/常规
const PRIORITY_META: Record<
  DecisionPriority,
  { colorVar: string; label: string; urgency: string; weight: number }
> = {
  P0: { colorVar: "--red", label: "P0", urgency: "紧迫", weight: 3 },
  P1: { colorVar: "--amber", label: "P1", urgency: "重要", weight: 2 },
  P2: { colorVar: "--steel", label: "P2", urgency: "常规", weight: 1 },
};

// === 类别元数据 ===
// 每个类别有自己的图标，让用户一眼分辨"这是风险还是机会"
const CATEGORY_META: Record<
  DecisionCategory,
  { Icon: React.ComponentType<{ size?: number; "aria-hidden"?: boolean | "true" | "false" }>; label: string }
> = {
  risk: { Icon: AlertTriangle, label: "风险" },
  opportunity: { Icon: TrendingUp, label: "机会" },
  exit: { Icon: LogOut, label: "退出" },
  monitor: { Icon: Eye, label: "监控" },
};

// === 状态元数据 ===
const STATUS_META: Record<DecisionStatus, { label: string; colorVar: string }> = {
  pending: { label: "待决策", colorVar: "--amber" },
  accepted: { label: "已采纳", colorVar: "--mint" },
  rejected: { label: "已拒绝", colorVar: "--red" },
  deferred: { label: "已暂存", colorVar: "--steel" },
};

// === 置信度进度条 ===
// 用5段填充直观呈现，避免单纯数字带来的"数据墙"感
function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const segments = 5;
  const filled = Math.round(value * segments);
  return (
    <div
      className="decision-confidence"
      role="img"
      aria-label={`置信度 ${pct}%`}
      title={`置信度 ${pct}%`}
    >
      <div className="decision-confidence-segments" aria-hidden="true">
        {Array.from({ length: segments }).map((_, i) => (
          <span
            key={i}
            className={`decision-confidence-segment ${i < filled ? "filled" : ""}`}
          />
        ))}
      </div>
      <span className="decision-confidence-num">{pct}%</span>
    </div>
  );
}

// === 单张决策卡片 ===
interface DecisionCardProps {
  decision: DecisionItem;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  onDefer: (id: string) => void;
  onSelect: (id: string) => void;
  conflictTitles: string[];
}

function DecisionCard({
  decision,
  onAccept,
  onReject,
  onDefer,
  onSelect,
  conflictTitles,
}: DecisionCardProps) {
  const pri = PRIORITY_META[decision.priority];
  const cat = CATEGORY_META[decision.category];
  const st = STATUS_META[decision.status];
  const { Icon } = cat;
  const hasConflicts = conflictTitles.length > 0;
  const isPending = decision.status === "pending";

  return (
    <article
      className={`decision-card priority-${decision.priority} status-${decision.status}`}
      style={{ "--pri-color": `var(${pri.colorVar})` } as React.CSSProperties}
      aria-label={`${pri.label} ${cat.label}决策：${decision.title}`}
    >
      {/* 优先级色带：左侧3px竖条 */}
      <span className="decision-card-band" aria-hidden="true" />

      <div className="decision-card-body">
        {/* 头部：优先级标签 + 类别图标 + 标题 + 状态 */}
        <header className="decision-card-head">
          <div className="decision-card-tags">
            <span className="decision-priority-tag">{pri.label}</span>
            <span className="decision-urgency">{pri.urgency}</span>
            <span className="decision-category-tag">
              <Icon size={13} aria-hidden="true" />
              <span>{cat.label}</span>
            </span>
          </div>
          {decision.status !== "pending" && (
            <span className="decision-status-tag" style={{ color: `var(${st.colorVar})` }}>
              {st.label}
            </span>
          )}
        </header>

        {/* 标题：衬线字体，强化"决策"的严肃感 */}
        <h3 className="decision-card-title">{decision.title}</h3>

        {/* 描述 */}
        <p className="decision-card-desc">{decision.description}</p>

        {/* 元信息条：置信度 + 时间窗口 + 数据依据 */}
        <div className="decision-card-meta">
          <ConfidenceBar value={decision.confidence} />
          <span className="decision-meta-item">
            <Clock size={12} aria-hidden="true" />
            <span>{decision.timeframe}</span>
          </span>
          <span className="decision-meta-item">
            <Check size={12} aria-hidden="true" />
            <span>{decision.evidenceIds.length} 证据</span>
          </span>
          <span className="decision-meta-item">
            <ArrowUpDown size={12} aria-hidden="true" />
            <span>{decision.metricIds.length} 指标</span>
          </span>
        </div>

        {/* 数据依据摘要 */}
        <p className="decision-card-rationale">{decision.rationale}</p>

        {/* 冲突提示：当与其他决策冲突时高亮 */}
        {hasConflicts && (
          <div className="decision-card-conflicts" role="alert">
            <AlertCircle size={13} aria-hidden="true" />
            <span>与以下决策存在冲突：</span>
            <span className="decision-conflict-titles">{conflictTitles.join("、")}</span>
          </div>
        )}

        {/* 预期影响 */}
        <div className="decision-card-impact">
          <span className="decision-impact-label">预期影响</span>
          <span className="decision-impact-text">{decision.expectedImpact}</span>
        </div>

        {/* KPI 跟踪标签 */}
        <div className="decision-card-kpis">
          {decision.kpiToTrack.map((kpi) => (
            <span key={kpi} className="decision-kpi-chip">{kpi}</span>
          ))}
        </div>

        {/* 操作按钮：每张卡片一个明确动作集 */}
        {isPending && (
          <footer className="decision-card-actions">
            <button
              type="button"
              className="decision-action decision-action-accept"
              onClick={() => onAccept(decision.id)}
            >
              <Check size={14} aria-hidden="true" />
              <span>采纳</span>
            </button>
            <button
              type="button"
              className="decision-action decision-action-reject"
              onClick={() => onReject(decision.id)}
            >
              <X size={14} aria-hidden="true" />
              <span>拒绝</span>
            </button>
            <button
              type="button"
              className="decision-action decision-action-defer"
              onClick={() => onDefer(decision.id)}
            >
              <Clock size={14} aria-hidden="true" />
              <span>暂存</span>
            </button>
            <button
              type="button"
              className="decision-action decision-action-detail"
              onClick={() => onSelect(decision.id)}
            >
              <span>查看证据</span>
              <ChevronRight size={14} aria-hidden="true" />
            </button>
          </footer>
        )}
      </div>
    </article>
  );
}

// === 主组件 ===
interface DecisionCenterProps {
  decisions: DecisionItem[];
  /** 当存在冲突时，传入 id→title 映射用于显示冲突标题 */
  decisionTitleMap?: Map<string, string>;
  onAccept?: (id: string) => void;
  onReject?: (id: string) => void;
  onDefer?: (id: string) => void;
  /** 打开证据链下钻抽屉 */
  onSelect?: (id: string) => void;
}

type PriorityFilter = "all" | DecisionPriority;
type StatusFilter = "all" | DecisionStatus;
type SortMode = "priority" | "confidence" | "timeframe";

export function DecisionCenter({
  decisions,
  decisionTitleMap,
  onAccept = () => {},
  onReject = () => {},
  onDefer = () => {},
  onSelect = () => {},
}: DecisionCenterProps) {
  const [priFilter, setPriFilter] = useState<PriorityFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [sortMode, setSortMode] = useState<SortMode>("priority");

  // 过滤 + 排序后的决策列表
  const visibleDecisions = useMemo(() => {
    let list = decisions.slice();
    if (priFilter !== "all") {
      list = list.filter((d) => d.priority === priFilter);
    }
    if (statusFilter !== "all") {
      list = list.filter((d) => d.status === statusFilter);
    }
    list.sort((a, b) => {
      if (sortMode === "priority") {
        return PRIORITY_META[b.priority].weight - PRIORITY_META[a.priority].weight;
      }
      if (sortMode === "confidence") {
        return b.confidence - a.confidence;
      }
      // timeframe 字符串排序：紧迫的在前
      return a.timeframe.localeCompare(b.timeframe, "zh-CN");
    });
    return list;
  }, [decisions, priFilter, statusFilter, sortMode]);

  // 统计：按优先级和状态计数
  const stats = useMemo(() => {
    const byPri: Record<DecisionPriority, number> = { P0: 0, P1: 0, P2: 0 };
    const pending = decisions.filter((d) => d.status === "pending").length;
    decisions.forEach((d) => { byPri[d.priority]++; });
    return { byPri, pending, total: decisions.length };
  }, [decisions]);

  // 构建冲突标题列表
  const getConflictTitles = (decision: DecisionItem): string[] => {
    if (!decision.conflictsWith || decision.conflictsWith.length === 0) return [];
    return decision.conflictsWith
      .map((id) => decisionTitleMap?.get(id) ?? id)
      .filter(Boolean);
  };

  return (
    <section className="decision-center" aria-label="决策中心">
      {/* 顶部工具栏：过滤器 + 排序 + 统计 */}
      <header className="decision-center-head">
        <div className="decision-center-title">
          <h2>待决策清单</h2>
          <span className="decision-center-subtitle">
            {stats.pending} 项待决策 / 共 {stats.total} 项
          </span>
        </div>

        <div className="decision-center-filters">
          {/* 优先级过滤 */}
          <label className="decision-filter">
            <Filter size={12} aria-hidden="true" />
            <span className="decision-filter-label">优先级</span>
            <select
              value={priFilter}
              onChange={(e) => setPriFilter(e.target.value as PriorityFilter)}
              aria-label="按优先级过滤"
            >
              <option value="all">全部 ({stats.total})</option>
              <option value="P0">P0 紧迫 ({stats.byPri.P0})</option>
              <option value="P1">P1 重要 ({stats.byPri.P1})</option>
              <option value="P2">P2 常规 ({stats.byPri.P2})</option>
            </select>
          </label>

          {/* 状态过滤 */}
          <label className="decision-filter">
            <span className="decision-filter-label">状态</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              aria-label="按状态过滤"
            >
              <option value="all">全部状态</option>
              <option value="pending">待决策</option>
              <option value="accepted">已采纳</option>
              <option value="rejected">已拒绝</option>
              <option value="deferred">已暂存</option>
            </select>
          </label>

          {/* 排序 */}
          <label className="decision-filter">
            <ArrowUpDown size={12} aria-hidden="true" />
            <span className="decision-filter-label">排序</span>
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              aria-label="排序方式"
            >
              <option value="priority">按优先级</option>
              <option value="confidence">按置信度</option>
              <option value="timeframe">按时间窗口</option>
            </select>
          </label>
        </div>
      </header>

      {/* 决策卡片列表 */}
      {visibleDecisions.length === 0 ? (
        <div className="decision-center-empty">
          <Check size={32} aria-hidden="true" />
          <p className="empty-title">当前过滤条件下没有待决策项</p>
          <p className="empty-hint">
            尝试切换过滤条件，或运行新的情报采集任务以产生决策建议。
          </p>
        </div>
      ) : (
        <div className="decision-card-list">
          {visibleDecisions.map((d) => (
            <DecisionCard
              key={d.id}
              decision={d}
              onAccept={onAccept}
              onReject={onReject}
              onDefer={onDefer}
              onSelect={onSelect}
              conflictTitles={getConflictTitles(d)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export default DecisionCenter;
