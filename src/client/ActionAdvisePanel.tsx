/**
 * client/ActionAdvisePanel.tsx — 建议行动卡片矩阵
 *
 * 与 DecisionCenter 区别：
 * - DecisionCenter 是高层"待决策问题"（P0/P1/P2）
 * - ActionAdvisePanel 是具体"行动建议"（critical/high/medium/low）
 * - 每条建议包含 executionPath 执行步骤，可直接落地
 * - 每条建议标注 methodologyBasis 学科方法论依据
 *
 * 设计原则：
 * - 4级优先级色带：critical=红/high=琥珀/medium=钢蓝/low=灰
 * - 执行路径用编号步骤展示，让用户看到"怎么做"
 * - 方法论依据用小字标注，建立信任但不抢占注意力
 * - 矩阵布局：2列网格，移动端降为1列
 */

import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  TrendingUp,
  LogOut,
  Eye,
  Check,
  X,
  Clock,
  Filter,
  ArrowUpDown,
  AlertCircle,
  ChevronRight,
  ListChecks,
  FlaskConical,
} from "lucide-react/dist/esm/lucide-react.mjs";
import type {
  ActionAdvice,
  AdvicePriority,
  AdviceType,
  AdviceStatus,
} from "./decisionTypes";

// === 优先级元数据 ===
// 4级：critical=红/high=琥珀/medium=钢蓝/low=灰
const PRIORITY_META: Record<
  AdvicePriority,
  { colorVar: string; label: string; weight: number }
> = {
  critical: { colorVar: "--red", label: "紧急", weight: 4 },
  high: { colorVar: "--amber", label: "高", weight: 3 },
  medium: { colorVar: "--steel", label: "中", weight: 2 },
  low: { colorVar: "--ink-muted", label: "低", weight: 1 },
};

// === 类型元数据 ===
const TYPE_META: Record<
  AdviceType,
  { Icon: React.ComponentType<{ size?: number; "aria-hidden"?: boolean | "true" | "false" }>; label: string }
> = {
  risk: { Icon: AlertTriangle, label: "风险应对" },
  opportunity: { Icon: TrendingUp, label: "机会捕捉" },
  exit: { Icon: LogOut, label: "退出止损" },
  monitor: { Icon: Eye, label: "持续监控" },
};

// === 状态元数据 ===
const STATUS_META: Record<AdviceStatus, { label: string; colorVar: string }> = {
  pending: { label: "待处理", colorVar: "--amber" },
  accepted: { label: "已采纳", colorVar: "--mint" },
  rejected: { label: "已拒绝", colorVar: "--red" },
  deferred: { label: "已暂存", colorVar: "--steel" },
};

// === 置信度环 ===
// 圆环可视化，比纯数字更直观
function ConfidenceRing({ value, color }: { value: number; color: string }) {
  const pct = Math.round(value * 100);
  const radius = 14;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - value);
  return (
    <div className="advice-confidence" role="img" aria-label={`置信度 ${pct}%`}>
      <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true">
        <circle
          cx="16"
          cy="16"
          r={radius}
          fill="none"
          stroke="var(--panel-strong)"
          strokeWidth="2.5"
        />
        <circle
          cx="16"
          cy="16"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          transform="rotate(-90 16 16)"
        />
      </svg>
      <span className="advice-confidence-num">{pct}%</span>
    </div>
  );
}

// === 执行路径 ===
function ExecutionPath({ steps }: { steps: ActionAdvice["executionPath"] }) {
  if (steps.length === 0) return null;
  return (
    <ol className="advice-execution-path" aria-label="执行路径">
      {steps.map((step) => (
        <li key={step.order} className="advice-execution-step">
          <span className="advice-step-num" aria-hidden="true">
            {String(step.order).padStart(2, "0")}
          </span>
          <div className="advice-step-body">
            <span className="advice-step-action">{step.action}</span>
            <span className="advice-step-outcome">→ {step.expectedOutcome}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}

// === 单张建议卡 ===
interface AdviceCardProps {
  advice: ActionAdvice;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  onDefer: (id: string) => void;
  onSelect: (id: string) => void;
  conflictTitles: string[];
}

function AdviceCard({
  advice,
  onAccept,
  onReject,
  onDefer,
  onSelect,
  conflictTitles,
}: AdviceCardProps) {
  const pri = PRIORITY_META[advice.priority];
  const typ = TYPE_META[advice.type];
  const st = STATUS_META[advice.status];
  const { Icon } = typ;
  const hasConflicts = conflictTitles.length > 0;
  const isPending = advice.status === "pending";

  return (
    <article
      className={`advice-card priority-${advice.priority} status-${advice.status}`}
      style={{ "--pri-color": `var(${pri.colorVar})` } as React.CSSProperties}
      aria-label={`${pri.label}优先级 ${typ.label}建议：${advice.title}`}
    >
      {/* 优先级色带 */}
      <span className="advice-card-band" aria-hidden="true" />

      <div className="advice-card-body">
        {/* 头部：优先级标签 + 类型 + 置信度环 */}
        <header className="advice-card-head">
          <div className="advice-card-tags">
            <span className="advice-priority-tag">{pri.label}</span>
            <span className="advice-type-tag">
              <Icon size={12} aria-hidden="true" />
              <span>{typ.label}</span>
            </span>
          </div>
          <ConfidenceRing value={advice.confidence} color={`var(${pri.colorVar})`} />
        </header>

        {/* 状态徽章（仅非pending显示） */}
        {advice.status !== "pending" && (
          <span
            className="advice-status-badge"
            style={{ color: `var(${st.colorVar})` }}
          >
            {st.label}
          </span>
        )}

        {/* 标题 */}
        <h3 className="advice-card-title">{advice.title}</h3>

        {/* 描述 */}
        <p className="advice-card-desc">{advice.description}</p>

        {/* 方法论依据 */}
        <div className="advice-methodology">
          <FlaskConical size={12} aria-hidden="true" />
          <span className="advice-methodology-label">方法论依据</span>
          <span className="advice-methodology-text">{advice.methodologyBasis}</span>
        </div>

        {/* 数据依据 */}
        <p className="advice-card-rationale">{advice.rationale}</p>

        {/* 预期影响 + 时间窗口 */}
        <div className="advice-card-meta">
          <div className="advice-meta-item">
            <span className="advice-meta-label">预期影响</span>
            <span className="advice-meta-value">{advice.expectedImpact}</span>
          </div>
          <div className="advice-meta-item">
            <span className="advice-meta-label">时间窗口</span>
            <span className="advice-meta-value advice-meta-timeframe">
              <Clock size={11} aria-hidden="true" />
              <span>{advice.timeframe}</span>
            </span>
          </div>
        </div>

        {/* 冲突提示 */}
        {hasConflicts && (
          <div className="advice-card-conflicts" role="alert">
            <AlertCircle size={12} aria-hidden="true" />
            <span>与以下建议冲突：</span>
            <span className="advice-conflict-titles">{conflictTitles.join("、")}</span>
          </div>
        )}

        {/* 执行路径 */}
        {advice.executionPath.length > 0 && (
          <div className="advice-execution-section">
            <div className="advice-execution-header">
              <ListChecks size={12} aria-hidden="true" />
              <span>执行路径（{advice.executionPath.length} 步）</span>
            </div>
            <ExecutionPath steps={advice.executionPath} />
          </div>
        )}

        {/* KPI 跟踪 */}
        {advice.kpiToTrack.length > 0 && (
          <div className="advice-card-kpis">
            <span className="advice-kpis-label">跟踪指标</span>
            <div className="advice-kpi-chips">
              {advice.kpiToTrack.map((kpi) => (
                <span key={kpi} className="advice-kpi-chip">{kpi}</span>
              ))}
            </div>
          </div>
        )}

        {/* 操作按钮 */}
        {isPending && (
          <footer className="advice-card-actions">
            <button
              type="button"
              className="advice-action advice-action-accept"
              onClick={() => onAccept(advice.id)}
            >
              <Check size={13} aria-hidden="true" />
              <span>采纳</span>
            </button>
            <button
              type="button"
              className="advice-action advice-action-reject"
              onClick={() => onReject(advice.id)}
            >
              <X size={13} aria-hidden="true" />
              <span>拒绝</span>
            </button>
            <button
              type="button"
              className="advice-action advice-action-defer"
              onClick={() => onDefer(advice.id)}
            >
              <Clock size={13} aria-hidden="true" />
              <span>暂存</span>
            </button>
            <button
              type="button"
              className="advice-action advice-action-detail"
              onClick={() => onSelect(advice.id)}
            >
              <span>证据</span>
              <ChevronRight size={13} aria-hidden="true" />
            </button>
          </footer>
        )}
      </div>
    </article>
  );
}

// === 主组件 ===
interface ActionAdvisePanelProps {
  advices: ActionAdvice[];
  adviceTitleMap?: Map<string, string>;
  onAccept?: (id: string) => void;
  onReject?: (id: string) => void;
  onDefer?: (id: string) => void;
  onSelect?: (id: string) => void;
}

type PriorityFilter = "all" | AdvicePriority;
type TypeFilter = "all" | AdviceType;
type StatusFilter = "all" | AdviceStatus;
type SortMode = "priority" | "confidence" | "timeframe";

export function ActionAdvisePanel({
  advices,
  adviceTitleMap,
  onAccept = () => {},
  onReject = () => {},
  onDefer = () => {},
  onSelect = () => {},
}: ActionAdvisePanelProps) {
  const [priFilter, setPriFilter] = useState<PriorityFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [sortMode, setSortMode] = useState<SortMode>("priority");

  // 过滤 + 排序
  const visibleAdvices = useMemo(() => {
    let list = advices.slice();
    if (priFilter !== "all") list = list.filter((a) => a.priority === priFilter);
    if (typeFilter !== "all") list = list.filter((a) => a.type === typeFilter);
    if (statusFilter !== "all") list = list.filter((a) => a.status === statusFilter);
    list.sort((a, b) => {
      if (sortMode === "priority") {
        return PRIORITY_META[b.priority].weight - PRIORITY_META[a.priority].weight;
      }
      if (sortMode === "confidence") {
        return b.confidence - a.confidence;
      }
      return a.timeframe.localeCompare(b.timeframe, "zh-CN");
    });
    return list;
  }, [advices, priFilter, typeFilter, statusFilter, sortMode]);

  // 统计
  const stats = useMemo(() => {
    const byPri: Record<AdvicePriority, number> = { critical: 0, high: 0, medium: 0, low: 0 };
    const byType: Record<AdviceType, number> = { risk: 0, opportunity: 0, exit: 0, monitor: 0 };
    let pending = 0;
    advices.forEach((a) => {
      byPri[a.priority]++;
      byType[a.type]++;
      if (a.status === "pending") pending++;
    });
    return { byPri, byType, pending, total: advices.length };
  }, [advices]);

  const getConflictTitles = (advice: ActionAdvice): string[] => {
    if (!advice.conflictsWith || advice.conflictsWith.length === 0) return [];
    return advice.conflictsWith
      .map((id) => adviceTitleMap?.get(id) ?? id)
      .filter(Boolean);
  };

  return (
    <section className="advice-panel" aria-label="行动建议矩阵">
      <header className="advice-panel-head">
        <div className="advice-panel-title">
          <h2>行动建议</h2>
          <span className="advice-panel-subtitle">
            {stats.pending} 待处理 / 共 {stats.total} 条
          </span>
        </div>

        <div className="advice-panel-filters">
          <label className="advice-filter">
            <Filter size={12} aria-hidden="true" />
            <span className="advice-filter-label">优先级</span>
            <select
              value={priFilter}
              onChange={(e) => setPriFilter(e.target.value as PriorityFilter)}
              aria-label="按优先级过滤"
            >
              <option value="all">全部 ({stats.total})</option>
              <option value="critical">紧急 ({stats.byPri.critical})</option>
              <option value="high">高 ({stats.byPri.high})</option>
              <option value="medium">中 ({stats.byPri.medium})</option>
              <option value="low">低 ({stats.byPri.low})</option>
            </select>
          </label>

          <label className="advice-filter">
            <span className="advice-filter-label">类型</span>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
              aria-label="按类型过滤"
            >
              <option value="all">全部类型</option>
              <option value="risk">风险应对 ({stats.byType.risk})</option>
              <option value="opportunity">机会捕捉 ({stats.byType.opportunity})</option>
              <option value="exit">退出止损 ({stats.byType.exit})</option>
              <option value="monitor">持续监控 ({stats.byType.monitor})</option>
            </select>
          </label>

          <label className="advice-filter">
            <span className="advice-filter-label">状态</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              aria-label="按状态过滤"
            >
              <option value="all">全部状态</option>
              <option value="pending">待处理</option>
              <option value="accepted">已采纳</option>
              <option value="rejected">已拒绝</option>
              <option value="deferred">已暂存</option>
            </select>
          </label>

          <label className="advice-filter">
            <ArrowUpDown size={12} aria-hidden="true" />
            <span className="advice-filter-label">排序</span>
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

      {visibleAdvices.length === 0 ? (
        <div className="advice-panel-empty">
          <Check size={32} aria-hidden="true" />
          <p className="empty-title">当前过滤条件下无建议</p>
          <p className="empty-hint">
            调整过滤条件，或运行新的情报分析以生成行动建议。
          </p>
        </div>
      ) : (
        <div className="advice-card-grid">
          {visibleAdvices.map((a) => (
            <AdviceCard
              key={a.id}
              advice={a}
              onAccept={onAccept}
              onReject={onReject}
              onDefer={onDefer}
              onSelect={onSelect}
              conflictTitles={getConflictTitles(a)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export default ActionAdvisePanel;
