/**
 * client/TasksView.tsx — 任务运行视图
 *
 * 数据流：
 *   - /api/runs         → 后端通用任务（SwarmOrchestrator DAG 执行）
 *   - localStorage      → 蜂群任务历史（loadHistory 复用 IntelligenceDashboard 的 HISTORY_KEY）
 *
 * 设计原则（与 DecisionCenter / IntelligenceDashboard 一致）：
 *   - 左侧：任务列表卡片，状态色带 + 进度环 + 关键指标
 *   - 右侧：选中任务的详情抽屉（workflow 节点 + audit 时间线 + 操作）
 *   - 顶部：状态过滤器 + 数据源切换（后端 / 蜂群）
 *   - 复用主题变量：--panel / --mint / --cyan / --amber / --red / --steel
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Check,
  ChevronRight,
  Clock,
  Filter,
  ListChecks,
  Play,
  RefreshCw,
  Workflow as WorkflowIcon,
  X,
  XCircle,
} from "lucide-react/dist/esm/lucide-react.mjs";
import { loadHistory, type TaskHistoryEntry } from "./IntelligenceDashboard";

// ===== Types (镜像后端 src/runtime/types.ts) =====

type RunStatus = "running" | "waiting_approval" | "paused" | "completed" | "failed" | "rejected";

interface WorkflowNode {
  nodeId: string;
  type: "task" | "human_approval" | "waiting_approval" | "tool_call" | "swarm_execution";
  label: string;
  dependsOn?: string[];
  cost?: number;
  outputKey?: string;
  outputValue?: unknown;
  failMessage?: string;
}

interface Workflow {
  workflowId: string;
  nodes: WorkflowNode[];
}

interface CostSnapshot {
  estimatedTotal: number;
  actualTotal: number;
  currency: "USD" | "CNY" | "JPY" | "EUR";
}

interface Run {
  runId: string;
  intent: string;
  taskPlan: { planId: string; intent: string; tasks: Array<{ taskId: string; title: string; nodeId?: string }> };
  workflow: Workflow;
  status: RunStatus;
  currentNodeId?: string;
  completedNodeIds: string[];
  failedNodeIds: string[];
  waitingApprovalNodeId?: string;
  costSnapshot: CostSnapshot;
  createdAt: string;
  updatedAt: string;
}

interface AuditEvent {
  eventId: string;
  runId: string;
  type: string;
  message: string;
  nodeId?: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

// ===== Status metadata =====

const STATUS_META: Record<RunStatus, { label: string; color: string; icon: React.ReactNode }> = {
  running: { label: "运行中", color: "var(--cyan)", icon: <Activity size={13} /> },
  waiting_approval: { label: "待审批", color: "var(--amber)", icon: <AlertTriangle size={13} /> },
  paused: { label: "已暂停", color: "var(--steel)", icon: <Clock size={13} /> },
  completed: { label: "已完成", color: "var(--mint)", icon: <Check size={13} /> },
  failed: { label: "失败", color: "var(--red)", icon: <XCircle size={13} /> },
  rejected: { label: "已拒绝", color: "var(--ink-muted)", icon: <X size={13} /> },
};

const FILTER_TABS: Array<{ id: RunStatus | "all"; label: string }> = [
  { id: "all", label: "全部" },
  { id: "running", label: "运行中" },
  { id: "waiting_approval", label: "待审批" },
  { id: "completed", label: "已完成" },
  { id: "failed", label: "失败" },
];

type SourceTab = "backend" | "swarm";

// ===== API helpers =====

async function fetchRuns(): Promise<Run[]> {
  const res = await fetch("/api/runs");
  if (!res.ok) throw new Error(`GET /api/runs failed: ${res.status}`);
  const data = (await res.json()) as { runs: Run[] };
  return data.runs;
}

async function fetchRunDetail(runId: string): Promise<Run> {
  const res = await fetch(`/api/runs/${runId}`);
  if (!res.ok) throw new Error(`GET /api/runs/${runId} failed: ${res.status}`);
  return (await res.json()) as Run;
}

async function fetchRunAudit(runId: string): Promise<AuditEvent[]> {
  const res = await fetch(`/api/runs/${runId}/audit`);
  if (!res.ok) throw new Error(`GET /api/runs/${runId}/audit failed: ${res.status}`);
  const data = (await res.json()) as { events: AuditEvent[] };
  return data.events;
}

async function postRunAction(runId: string, action: "approve" | "reject" | "resume"): Promise<void> {
  const res = await fetch(`/api/runs/${runId}/${action}`, { method: "POST" });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `POST ${action} failed: ${res.status}`);
  }
}

// ===== Subcomponents =====

function StatusBadge({ status }: { status: RunStatus }) {
  const meta = STATUS_META[status];
  return (
    <span className="task-status-badge" style={{ color: meta.color, borderColor: meta.color }}>
      {meta.icon}
      <span>{meta.label}</span>
    </span>
  );
}

function ProgressBar({ completed, total, failed }: { completed: number; total: number; failed: number }) {
  const donePct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const failPct = total > 0 ? Math.round((failed / total) * 100) : 0;
  return (
    <div className="task-progress" role="progressbar" aria-valuenow={completed} aria-valuemax={total} aria-valuemin={0}>
      <div className="task-progress-track">
        <div className="task-progress-done" style={{ width: `${donePct}%` }} />
        <div className="task-progress-fail" style={{ width: `${failPct}%`, left: `${donePct}%` }} />
      </div>
      <span className="task-progress-label">{completed}/{total}</span>
    </div>
  );
}

function RunListItem({ run, selected, onSelect }: { run: Run; selected: boolean; onSelect: () => void }) {
  const total = run.workflow.nodes.length;
  const completed = run.completedNodeIds.length;
  const failed = run.failedNodeIds.length;
  return (
    <button
      type="button"
      className={selected ? "task-list-item selected" : "task-list-item"}
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
    >
      <div className="task-list-item-head">
        <StatusBadge status={run.status} />
        <span className="task-list-item-time">{new Date(run.createdAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
      </div>
      <p className="task-list-item-intent">{run.intent}</p>
      <ProgressBar completed={completed} total={total} failed={failed} />
      <div className="task-list-item-meta">
        <span>成本 ${run.costSnapshot.actualTotal.toFixed(4)}</span>
        <span className="task-list-item-id">#{run.runId.slice(0, 8)}</span>
      </div>
    </button>
  );
}

function SwarmHistoryItem({ entry, selected, onSelect }: { entry: TaskHistoryEntry; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      className={selected ? "task-list-item selected" : "task-list-item"}
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
    >
      <div className="task-list-item-head">
        <span className="task-status-badge" style={{ color: entry.status === "completed" ? "var(--mint)" : "var(--red)", borderColor: entry.status === "completed" ? "var(--mint)" : "var(--red)" }}>
          {entry.status === "completed" ? <Check size={13} /> : <XCircle size={13} />}
          <span>{entry.status === "completed" ? "已完成" : "失败"}</span>
        </span>
        <span className="task-list-item-time">{new Date(entry.timestamp).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
      </div>
      <p className="task-list-item-intent">{entry.objective}</p>
      <div className="task-list-item-meta">
        <span>数据源 {entry.sourcesCollected}</span>
        <span>置信 {(entry.confidence * 100).toFixed(0)}%</span>
        <span>${entry.cost.toFixed(4)}</span>
        <span>{(entry.durationMs / 1000).toFixed(1)}s</span>
      </div>
    </button>
  );
}

function WorkflowNodeRow({ node, status }: { node: WorkflowNode; status: "completed" | "failed" | "current" | "waiting" | "pending" }) {
  const iconByStatus = {
    completed: <Check size={13} />,
    failed: <XCircle size={13} />,
    current: <Activity size={13} />,
    waiting: <AlertTriangle size={13} />,
    pending: <ChevronRight size={13} />,
  };
  const colorByStatus = {
    completed: "var(--mint)",
    failed: "var(--red)",
    current: "var(--cyan)",
    waiting: "var(--amber)",
    pending: "var(--ink-muted)",
  };
  return (
    <li className="task-workflow-node">
      <span className="task-workflow-icon" style={{ color: colorByStatus[status] }}>{iconByStatus[status]}</span>
      <span className="task-workflow-label">{node.label}</span>
      <span className="task-workflow-type">{node.type}</span>
      {node.failMessage ? <span className="task-workflow-fail">{node.failMessage}</span> : null}
    </li>
  );
}

function AuditTimelineItem({ event }: { event: AuditEvent }) {
  const typeIcon: Record<string, React.ReactNode> = {
    run_created: <Play size={12} />,
    node_started: <Activity size={12} />,
    node_completed: <Check size={12} />,
    waiting_approval: <AlertTriangle size={12} />,
    approved: <Check size={12} />,
    rejected: <X size={12} />,
    resumed: <Play size={12} />,
    run_completed: <Check size={12} />,
    run_failed: <XCircle size={12} />,
  };
  return (
    <li className="task-audit-item">
      <span className="task-audit-icon">{typeIcon[event.type] ?? <ChevronRight size={12} />}</span>
      <div className="task-audit-body">
        <p className="task-audit-message">{event.message}</p>
        <span className="task-audit-meta">
          {event.type}
          {event.nodeId ? ` · ${event.nodeId}` : ""}
          {" · "}
          {new Date(event.createdAt).toLocaleTimeString("zh-CN")}
        </span>
      </div>
    </li>
  );
}

// ===== Detail drawer =====

function RunDetailDrawer({ run, onClose, onRefresh }: { run: Run; onClose: () => void; onRefresh: () => void }) {
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchRunAudit(run.runId)
      .then((events) => { if (!cancelled) setAudit(events); })
      .catch((err) => { if (!cancelled) setAuditError(err instanceof Error ? err.message : String(err)); });
    return () => { cancelled = true; };
  }, [run.runId]);

  const doAction = useCallback(async (action: "approve" | "reject" | "resume") => {
    setBusy(true);
    setActionError(null);
    try {
      await postRunAction(run.runId, action);
      onRefresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [run.runId, onRefresh]);

  const statusByNode = (nodeId: string): "completed" | "failed" | "current" | "waiting" | "pending" => {
    if (run.failedNodeIds.includes(nodeId)) return "failed";
    if (run.completedNodeIds.includes(nodeId)) return "completed";
    if (run.waitingApprovalNodeId === nodeId) return "waiting";
    if (run.currentNodeId === nodeId) return "current";
    return "pending";
  };

  return (
    <div className="task-detail-drawer" role="dialog" aria-label={`任务详情 ${run.runId}`}>
      <div className="task-detail-head">
        <div>
          <StatusBadge status={run.status} />
          <h3 className="task-detail-title">{run.intent}</h3>
        </div>
        <button type="button" className="task-detail-close" onClick={onClose} aria-label="关闭">
          <X size={16} />
        </button>
      </div>

      <div className="task-detail-grid">
        <div className="task-detail-metric">
          <span className="task-detail-metric-label">工作流节点</span>
          <span className="task-detail-metric-value">{run.workflow.nodes.length}</span>
        </div>
        <div className="task-detail-metric">
          <span className="task-detail-metric-label">已完成</span>
          <span className="task-detail-metric-value">{run.completedNodeIds.length}</span>
        </div>
        <div className="task-detail-metric">
          <span className="task-detail-metric-label">失败</span>
          <span className="task-detail-metric-value">{run.failedNodeIds.length}</span>
        </div>
        <div className="task-detail-metric">
          <span className="task-detail-metric-label">成本</span>
          <span className="task-detail-metric-value">${run.costSnapshot.actualTotal.toFixed(4)}</span>
        </div>
      </div>

      {(run.status === "waiting_approval" || run.status === "paused" || run.status === "failed") && (
        <div className="task-detail-actions">
          {run.status === "waiting_approval" && (
            <>
              <button type="button" className="task-action-btn primary" disabled={busy} onClick={() => void doAction("approve")}>
                <Check size={14} /> 批准并继续
              </button>
              <button type="button" className="task-action-btn danger" disabled={busy} onClick={() => void doAction("reject")}>
                <X size={14} /> 拒绝
              </button>
            </>
          )}
          {(run.status === "paused" || run.status === "failed") && (
            <button type="button" className="task-action-btn primary" disabled={busy} onClick={() => void doAction("resume")}>
              <Play size={14} /> 重新运行
            </button>
          )}
        </div>
      )}
      {actionError ? <p className="task-error">{actionError}</p> : null}

      <details className="task-detail-section" open>
        <summary><WorkflowIcon size={14} /> 工作流节点 ({run.workflow.nodes.length})</summary>
        <ul className="task-workflow-list">
          {run.workflow.nodes.map((node) => (
            <WorkflowNodeRow key={node.nodeId} node={node} status={statusByNode(node.nodeId)} />
          ))}
        </ul>
      </details>

      <details className="task-detail-section" open>
        <summary><ListChecks size={14} /> 审计时间线 ({audit.length})</summary>
        {auditError ? <p className="task-error">{auditError}</p> : null}
        {audit.length === 0 && !auditError ? <p className="task-empty-hint">暂无审计事件</p> : null}
        <ul className="task-audit-list">
          {audit.map((ev) => <AuditTimelineItem key={ev.eventId} event={ev} />)}
        </ul>
      </details>
    </div>
  );
}

function SwarmHistoryDetail({ entry, onClose }: { entry: TaskHistoryEntry; onClose: () => void }) {
  return (
    <div className="task-detail-drawer" role="dialog" aria-label={`蜂群任务 ${entry.id}`}>
      <div className="task-detail-head">
        <div>
          <span className="task-status-badge" style={{ color: entry.status === "completed" ? "var(--mint)" : "var(--red)", borderColor: entry.status === "completed" ? "var(--mint)" : "var(--red)" }}>
            {entry.status === "completed" ? <Check size={13} /> : <XCircle size={13} />}
            <span>{entry.status === "completed" ? "已完成" : "失败"}</span>
          </span>
          <h3 className="task-detail-title">{entry.objective}</h3>
        </div>
        <button type="button" className="task-detail-close" onClick={onClose} aria-label="关闭">
          <X size={16} />
        </button>
      </div>
      <div className="task-detail-grid">
        <div className="task-detail-metric">
          <span className="task-detail-metric-label">数据源采集</span>
          <span className="task-detail-metric-value">{entry.sourcesCollected}</span>
        </div>
        <div className="task-detail-metric">
          <span className="task-detail-metric-label">置信度</span>
          <span className="task-detail-metric-value">{(entry.confidence * 100).toFixed(0)}%</span>
        </div>
        <div className="task-detail-metric">
          <span className="task-detail-metric-label">成本</span>
          <span className="task-detail-metric-value">${entry.cost.toFixed(4)}</span>
        </div>
        <div className="task-detail-metric">
          <span className="task-detail-metric-label">耗时</span>
          <span className="task-detail-metric-value">{(entry.durationMs / 1000).toFixed(1)}s</span>
        </div>
      </div>
      <p className="task-empty-hint">
        蜂群任务的完整步骤与证据在驾驶舱（IntelligencePanel）查看。此处仅展示执行摘要。
      </p>
    </div>
  );
}

// ===== Main component =====

export function TasksView() {
  const [sourceTab, setSourceTab] = useState<SourceTab>("backend");
  const [statusFilter, setStatusFilter] = useState<RunStatus | "all">("all");
  const [runs, setRuns] = useState<Run[]>([]);
  const [swarmHistory, setSwarmHistory] = useState<TaskHistoryEntry[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedSwarmId, setSelectedSwarmId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [backendRuns, history] = await Promise.all([
        fetchRuns().catch(() => [] as Run[]), // graceful: 后端失败不阻塞蜂群历史
        Promise.resolve(loadHistory()),
      ]);
      setRuns(backendRuns);
      setSwarmHistory(history);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filteredRuns = useMemo(() => {
    const filtered = statusFilter === "all" ? runs : runs.filter((r) => r.status === statusFilter);
    return [...filtered].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [runs, statusFilter]);

  const filteredSwarmHistory = useMemo(() => {
    const filtered = statusFilter === "all" || statusFilter === "completed" || statusFilter === "failed"
      ? swarmHistory.filter((e) => statusFilter === "all" || e.status === statusFilter)
      : [];
    return [...filtered].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [swarmHistory, statusFilter]);

  const selectedRun = useMemo(() => runs.find((r) => r.runId === selectedRunId) ?? null, [runs, selectedRunId]);
  const selectedSwarm = useMemo(() => swarmHistory.find((e) => e.id === selectedSwarmId) ?? null, [swarmHistory, selectedSwarmId]);

  const counts = useMemo(() => {
    const byStatus: Record<string, number> = { all: 0 };
    for (const r of sourceTab === "backend" ? runs : swarmHistory) {
      byStatus.all = (byStatus.all ?? 0) + 1;
      byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    }
    return byStatus;
  }, [runs, swarmHistory, sourceTab]);

  return (
    <section className="tasks-view" aria-label="任务运行">
      <header className="tasks-view-head">
        <div className="tasks-view-title">
          <h2>任务运行</h2>
          <p className="tasks-view-subtitle">通用任务（DAG 编排） + 蜂群任务（SSE 流式执行）执行历史与状态追踪</p>
        </div>
        <button type="button" className="tasks-refresh-btn" onClick={() => void refresh()} disabled={loading} aria-label="刷新">
          <RefreshCw size={14} className={loading ? "spin" : ""} />
          <span>{loading ? "刷新中…" : "刷新"}</span>
        </button>
      </header>

      <div className="tasks-view-tabs" role="tablist" aria-label="数据源">
        <button
          type="button"
          role="tab"
          aria-selected={sourceTab === "backend"}
          className={sourceTab === "backend" ? "tasks-tab active" : "tasks-tab"}
          onClick={() => setSourceTab("backend")}
        >
          <WorkflowIcon size={14} /> 通用任务 <span className="tasks-tab-count">{runs.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={sourceTab === "swarm"}
          className={sourceTab === "swarm" ? "tasks-tab active" : "tasks-tab"}
          onClick={() => setSourceTab("swarm")}
        >
          <Activity size={14} /> 蜂群任务 <span className="tasks-tab-count">{swarmHistory.length}</span>
        </button>
      </div>

      <div className="tasks-view-filters" aria-label="状态过滤">
        <Filter size={13} aria-hidden="true" />
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={statusFilter === tab.id ? "tasks-filter active" : "tasks-filter"}
            onClick={() => setStatusFilter(tab.id)}
          >
            {tab.label}
            <span className="tasks-filter-count">{counts[tab.id] ?? 0}</span>
          </button>
        ))}
      </div>

      {error ? <p className="task-error">{error}</p> : null}

      <div className="tasks-view-body">
        <div className="tasks-list" role="list">
          {sourceTab === "backend" ? (
            filteredRuns.length === 0 ? (
              <p className="task-empty-hint">暂无通用任务。在驾驶舱发起一次 Launch Plan 或工作流即会在此出现。</p>
            ) : (
              filteredRuns.map((run) => (
                <RunListItem
                  key={run.runId}
                  run={run}
                  selected={selectedRunId === run.runId}
                  onSelect={() => { setSelectedRunId(run.runId); setSelectedSwarmId(null); }}
                />
              ))
            )
          ) : filteredSwarmHistory.length === 0 ? (
            <p className="task-empty-hint">暂无蜂群任务。在驾驶舱执行一次情报采集即会在此出现。</p>
          ) : (
            filteredSwarmHistory.map((entry) => (
              <SwarmHistoryItem
                key={entry.id}
                entry={entry}
                selected={selectedSwarmId === entry.id}
                onSelect={() => { setSelectedSwarmId(entry.id); setSelectedRunId(null); }}
              />
            ))
          )}
        </div>

        <div className="tasks-detail">
          {selectedRun ? (
            <RunDetailDrawer run={selectedRun} onClose={() => setSelectedRunId(null)} onRefresh={refresh} />
          ) : selectedSwarm ? (
            <SwarmHistoryDetail entry={selectedSwarm} onClose={() => setSelectedSwarmId(null)} />
          ) : (
            <div className="tasks-detail-placeholder">
              <ListChecks size={32} aria-hidden="true" />
              <p>选择左侧任意任务查看详情</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
