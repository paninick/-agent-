/**
 * client/CostView.tsx - 成本中心视图
 *
 * 数据流：
 *   - /api/cost/summary -> 成本汇总（6 桶明细 + per-run 成本 + 预算守卫告警）
 *
 * 设计原则（与 TasksView / ChannelsView 一致）：
 *   - 顶部：汇总条（总花费 / 预估总额 / 预算利用率 / 超支数）
 *   - 中部：6 桶成本分布（横向条形 + 金额 + 占比）
 *   - 主体左侧：Per-run 成本列表（intent + actualTotal + status badge + 日期）
 *   - 主体右侧：选中 run 的成本详情 + 预算守卫告警面板
 *   - 复用主题变量：--panel / --mint / --cyan / --amber / --red / --steel
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  RefreshCw,
  ShieldCheck,
  TrendingDown,
  Wallet,
  XCircle,
} from "lucide-react/dist/esm/lucide-react.mjs";
import {
  BUCKET_META,
  createMockCostSummary,
  type CostBucketBreakdown,
  type CostBudgetAlert,
  type CostRunEntry,
  type CostSummary,
} from "./costTypes";

// ===== Status metadata（与 TasksView 对齐） =====

type RunStatus = CostRunEntry["status"];

const STATUS_META: Record<RunStatus, { label: string; color: string }> = {
  running: { label: "运行中", color: "var(--cyan)" },
  waiting_approval: { label: "待审批", color: "var(--amber)" },
  paused: { label: "已暂停", color: "var(--steel)" },
  completed: { label: "已完成", color: "var(--mint)" },
  failed: { label: "失败", color: "var(--red)" },
  rejected: { label: "已拒绝", color: "var(--ink-muted)" },
};

// ===== API helpers =====

const USE_MOCK_FALLBACK = import.meta.env.DEV;

async function fetchCostSummary(): Promise<CostSummary> {
  try {
    const res = await fetch("/api/cost/summary");
    if (!res.ok) throw new Error(`GET /api/cost/summary failed: ${res.status}`);
    return (await res.json()) as CostSummary;
  } catch (err) {
    if (USE_MOCK_FALLBACK) {
      return createMockCostSummary();
    }
    throw err;
  }
}

// ===== Subcomponents =====

function StatusBadge({ status }: { status: RunStatus }) {
  const meta = STATUS_META[status];
  return (
    <span className="cost-status-badge" style={{ color: meta.color, borderColor: meta.color }}>
      {meta.label}
    </span>
  );
}

function BucketBar({ bucket }: { bucket: CostBucketBreakdown }) {
  return (
    <div className="cost-bucket-row">
      <div className="cost-bucket-label">
        <span className="cost-bucket-dot" style={{ background: bucket.color }} />
        <span>{bucket.label}</span>
      </div>
      <div className="cost-bucket-track">
        <div className="cost-bucket-fill" style={{ width: `${bucket.percentage}%`, background: bucket.color }} />
      </div>
      <span className="cost-bucket-amount">${bucket.amountUsd.toFixed(4)}</span>
      <span className="cost-bucket-pct">{bucket.percentage}%</span>
    </div>
  );
}

function RunCostItem({ entry, selected, onSelect }: { entry: CostRunEntry; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      className={selected ? "cost-run-item selected" : "cost-run-item"}
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
    >
      <div className="cost-run-item-head">
        <StatusBadge status={entry.status} />
        <span className="cost-run-item-date">{new Date(entry.createdAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
      </div>
      <p className="cost-run-item-intent">{entry.intent}</p>
      <div className="cost-run-item-meta">
        <span>实际 ${entry.actualTotal.toFixed(4)}</span>
        <span className="cost-run-item-est">预估 ${entry.estimatedTotal.toFixed(4)}</span>
        <span className="cost-run-item-id">#{entry.runId.slice(-6)}</span>
      </div>
    </button>
  );
}

function BudgetAlertCard({ alert }: { alert: CostBudgetAlert }) {
  const pct = alert.budgetLimit > 0 ? Math.min(100, Math.round((alert.spent / alert.budgetLimit) * 100)) : 0;
  return (
    <div className={alert.withinBudget ? "cost-budget-alert ok" : "cost-budget-alert over"}>
      <div className="cost-budget-alert-head">
        {alert.withinBudget ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
        <strong>{alert.taskId}</strong>
      </div>
      <div className="cost-budget-bar">
        <div
          className="cost-budget-bar-fill"
          style={{ width: `${pct}%`, background: alert.withinBudget ? "var(--mint)" : "var(--red)" }}
        />
      </div>
      <div className="cost-budget-alert-meta">
        <span>已花 ${alert.spent.toFixed(4)}</span>
        <span>上限 ${alert.budgetLimit.toFixed(4)}</span>
        <span>余 ${alert.remaining.toFixed(4)}</span>
      </div>
    </div>
  );
}

function RunCostDetail({ entry, onClose }: { entry: CostRunEntry; onClose: () => void }) {
  const variance = entry.estimatedTotal - entry.actualTotal;
  const variancePct = entry.estimatedTotal > 0 ? Math.round((variance / entry.estimatedTotal) * 100) : 0;
  return (
    <div className="cost-detail-drawer" role="dialog" aria-label={`成本详情 ${entry.runId}`}>
      <div className="cost-detail-head">
        <div>
          <StatusBadge status={entry.status} />
          <h3 className="cost-detail-title">{entry.intent}</h3>
        </div>
        <button type="button" className="cost-detail-close" onClick={onClose} aria-label="关闭">×</button>
      </div>
      <div className="cost-detail-grid">
        <div className="cost-detail-metric">
          <span className="cost-detail-metric-label">实际成本</span>
          <span className="cost-detail-metric-value">${entry.actualTotal.toFixed(4)}</span>
        </div>
        <div className="cost-detail-metric">
          <span className="cost-detail-metric-label">预估成本</span>
          <span className="cost-detail-metric-value">${entry.estimatedTotal.toFixed(4)}</span>
        </div>
        <div className="cost-detail-metric">
          <span className="cost-detail-metric-label">偏差</span>
          <span className="cost-detail-metric-value" style={{ color: variance >= 0 ? "var(--mint)" : "var(--red)" }}>
            {variance >= 0 ? "-" : "+"}${Math.abs(variance).toFixed(4)} ({variancePct}%)
          </span>
        </div>
        <div className="cost-detail-metric">
          <span className="cost-detail-metric-label">创建时间</span>
          <span className="cost-detail-metric-value">{new Date(entry.createdAt).toLocaleString("zh-CN")}</span>
        </div>
      </div>
      <div className="cost-detail-section">
        <h4 className="cost-detail-section-title">Run ID</h4>
        <code className="cost-detail-code">{entry.runId}</code>
      </div>
    </div>
  );
}

// ===== Main component =====

export function CostView() {
  const [summary, setSummary] = useState<CostSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCostSummary();
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

  const selectedRun = useMemo(
    () => summary?.runs.find((r) => r.runId === selectedRunId) ?? null,
    [summary, selectedRunId],
  );

  const overBudgetCount = useMemo(
    () => summary?.budgetAlerts.filter((a) => !a.withinBudget).length ?? 0,
    [summary],
  );

  const budgetUtilization = useMemo(() => {
    if (!summary || summary.totalEstimated === 0) return 0;
    return Math.round((summary.totalSpent / summary.totalEstimated) * 100);
  }, [summary]);

  if (loading && !summary) {
    return (
      <section className="cost-view" aria-label="成本中心">
        <div className="data-loading" role="status">加载成本数据…</div>
      </section>
    );
  }

  if (error || !summary) {
    return (
      <section className="cost-view" aria-label="成本中心">
        <div className="data-error-banner" role="alert">
          成本数据加载失败：{error ?? "未知错误"}
        </div>
      </section>
    );
  }

  return (
    <section className="cost-view" aria-label="成本中心">
      <header className="cost-view-head">
        <div className="cost-view-title">
          <h2><Wallet size={20} /> 成本中心</h2>
          <p className="cost-view-subtitle">6 桶成本核算 + 预算守卫 + Per-run 成本追踪</p>
        </div>
        <button type="button" className="cost-refresh-btn" onClick={() => void refresh()} disabled={loading} aria-label="刷新">
          <RefreshCw size={14} className={loading ? "spin" : ""} />
          <span>{loading ? "刷新中…" : "刷新"}</span>
        </button>
      </header>

      {/* 汇总条 */}
      <div className="cost-summary">
        <div className="cost-summary-item">
          <span className="cost-summary-label"><DollarSign size={13} /> 总花费</span>
          <strong className="cost-summary-value">${summary.totalSpent.toFixed(4)}</strong>
        </div>
        <div className="cost-summary-item">
          <span className="cost-summary-label"><TrendingDown size={13} /> 预估总额</span>
          <strong className="cost-summary-value">${summary.totalEstimated.toFixed(4)}</strong>
        </div>
        <div className="cost-summary-item">
          <span className="cost-summary-label"><ShieldCheck size={13} /> 预算利用率</span>
          <strong className={budgetUtilization > 80 ? "cost-summary-value warn" : "cost-summary-value"}>
            {budgetUtilization}%
          </strong>
        </div>
        <div className="cost-summary-item">
          <span className="cost-summary-label"><AlertTriangle size={13} /> 超支数</span>
          <strong className={overBudgetCount > 0 ? "cost-summary-value fail" : "cost-summary-value ok"}>
            {overBudgetCount}
          </strong>
        </div>
        <div className="cost-summary-item">
          <span className="cost-summary-label"><Wallet size={13} /> Run 数量</span>
          <strong className="cost-summary-value">{summary.runCount}</strong>
        </div>
      </div>

      {/* 6 桶成本分布 */}
      <div className="cost-buckets">
        <h3 className="cost-section-title">成本分布（6 桶模型）</h3>
        {summary.buckets.map((bucket) => (
          <BucketBar key={bucket.category} bucket={bucket} />
        ))}
      </div>

      {/* 主体：列表 + 详情 */}
      <div className="cost-body">
        <div className="cost-runs-list" role="list">
          <h3 className="cost-section-title">Per-run 成本</h3>
          {summary.runs.length === 0 ? (
            <p className="cost-empty-hint">暂无任务运行记录。</p>
          ) : (
            summary.runs.map((entry) => (
              <RunCostItem
                key={entry.runId}
                entry={entry}
                selected={selectedRunId === entry.runId}
                onSelect={() => setSelectedRunId(entry.runId)}
              />
            ))
          )}
        </div>

        <div className="cost-detail">
          {selectedRun ? (
            <RunCostDetail entry={selectedRun} onClose={() => setSelectedRunId(null)} />
          ) : (
            <div className="cost-detail-placeholder">
              <Wallet size={32} aria-hidden="true" />
              <p>选择左侧任意 run 查看成本详情</p>
            </div>
          )}
        </div>
      </div>

      {/* 预算守卫面板 */}
      <div className="cost-budget-panel">
        <h3 className="cost-section-title">
          <ShieldCheck size={15} /> 预算守卫 ({summary.budgetAlerts.length})
        </h3>
        <div className="cost-budget-grid">
          {summary.budgetAlerts.map((alert) => (
            <BudgetAlertCard key={alert.taskId} alert={alert} />
          ))}
        </div>
      </div>
    </section>
  );
}
