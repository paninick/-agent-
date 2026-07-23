/**
 * client/GoalsView.tsx - 目标中心视图
 *
 * 数据流：
 *   - /api/habitat/snapshot -> HabitatSnapshot（goals: PersonalGoalContract[]）
 *   - PATCH /api/habitat/goals/:id/autonomy -> 修改目标自治等级
 *
 * 设计原则（与 TasksView / ChannelsView 一致）：
 *   - 顶部：汇总条（总数 / 活跃 / 待用户 / 已完成 / 已取消 / 预算总花费）
 *   - 中部：状态过滤
 *   - 主体左侧：目标列表（need + status badge + autonomy badge + deadline + budget bar）
 *   - 主体右侧：选中目标的完整合约详情（desiredOutcome + successMeasures + budget +
 *               allowedActions + forbiddenActions + assumptions + autonomy 选择器）
 *   - 复用主题变量：--panel / --mint / --cyan / --amber / --red / --steel
 *
 * 与 HabitatWorkspace 区别：
 *   - HabitatWorkspace 是智能体活动空间全景（agents + squads + requests + memories）
 *   - GoalsView 聚焦目标合约本身：成功度量、预算约束、自治策略、行动边界
 */

import React, { useCallback, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  Filter,
  ShieldAlert,
  Target,
  X,
  XCircle,
} from "lucide-react/dist/esm/lucide-react.mjs";
import type {
  AutonomyLevel,
  PersonalGoalContract,
  HabitatSnapshot,
} from "../domain/agentHabitat";
import { habitatApi, useHabitatSnapshot } from "./habitat/habitatApi";

// ===== Status metadata =====

type GoalStatus = PersonalGoalContract["status"];

const STATUS_META: Record<GoalStatus, { label: string; color: string }> = {
  draft: { label: "草稿", color: "var(--steel)" },
  clarifying: { label: "澄清中", color: "var(--cyan)" },
  active: { label: "活跃", color: "var(--mint)" },
  waiting_for_user: { label: "待用户", color: "var(--amber)" },
  completed: { label: "已完成", color: "var(--mint)" },
  cancelled: { label: "已取消", color: "var(--ink-muted)" },
};

const AUTONOMY_META: Record<AutonomyLevel, { label: string; color: string }> = {
  observe_only: { label: "仅观察", color: "var(--steel)" },
  prepare_draft: { label: "准备草稿", color: "var(--cyan)" },
  ask_before_action: { label: "行动前询问", color: "var(--amber)" },
  auto_within_limits: { label: "限额内自动", color: "var(--mint)" },
  denied: { label: "已拒绝", color: "var(--red)" },
};

const AUTONOMY_OPTIONS: AutonomyLevel[] = [
  "observe_only",
  "prepare_draft",
  "ask_before_action",
  "auto_within_limits",
  "denied",
];

const STATUS_FILTERS: Array<{ id: GoalStatus | "all"; label: string }> = [
  { id: "all", label: "全部" },
  { id: "active", label: "活跃" },
  { id: "waiting_for_user", label: "待用户" },
  { id: "clarifying", label: "澄清中" },
  { id: "completed", label: "已完成" },
  { id: "cancelled", label: "已取消" },
  { id: "draft", label: "草稿" },
];

// ===== Subcomponents =====

function StatusBadge({ status }: { status: GoalStatus }) {
  const meta = STATUS_META[status];
  return (
    <span className="goal-status-badge" style={{ color: meta.color, borderColor: meta.color }}>
      {meta.label}
    </span>
  );
}

function AutonomyBadge({ autonomy }: { autonomy: AutonomyLevel }) {
  const meta = AUTONOMY_META[autonomy];
  return (
    <span className="goal-autonomy-badge" style={{ color: meta.color, borderColor: meta.color }}>
      {meta.label}
    </span>
  );
}

function BudgetBar({ budget }: { budget: NonNullable<PersonalGoalContract["budget"]> }) {
  const pct = budget.limit > 0 ? Math.min(100, Math.round((budget.spent / budget.limit) * 100)) : 0;
  const overBudget = budget.spent > budget.limit;
  const symbol = budget.currency === "CNY" ? "¥" : "$";
  return (
    <div className="goal-budget-bar-wrap">
      <div className="goal-budget-bar-track">
        <div
          className="goal-budget-bar-fill"
          style={{ width: `${pct}%`, background: overBudget ? "var(--red)" : "var(--mint)" }}
        />
      </div>
      <span className="goal-budget-label">
        {symbol}{budget.spent} / {symbol}{budget.limit}
      </span>
    </div>
  );
}

function GoalListItem({ goal, selected, onSelect }: { goal: PersonalGoalContract; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      className={selected ? "goal-list-item selected" : "goal-list-item"}
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
    >
      <div className="goal-list-item-head">
        <StatusBadge status={goal.status} />
        <AutonomyBadge autonomy={goal.autonomy} />
      </div>
      <p className="goal-list-item-need">{goal.need}</p>
      {goal.budget && <BudgetBar budget={goal.budget} />}
      <div className="goal-list-item-meta">
        {goal.deadline && <span><Clock size={11} /> {new Date(goal.deadline).toLocaleDateString("zh-CN")}</span>}
        <span className="goal-list-item-id">#{goal.id.slice(0, 12)}</span>
      </div>
    </button>
  );
}

function SuccessMeasureRow({ measure }: { measure: PersonalGoalContract["successMeasures"][number] }) {
  const achieved = Boolean(measure.current);
  return (
    <li className="goal-measure-row">
      <span className="goal-measure-icon" style={{ color: achieved ? "var(--mint)" : "var(--ink-muted)" }}>
        {achieved ? <Check size={13} /> : <Clock size={13} />}
      </span>
      <div className="goal-measure-body">
        <strong className="goal-measure-label">{measure.label}</strong>
        <span className="goal-measure-target">目标：{measure.target}</span>
        {measure.current && <span className="goal-measure-current">当前：{measure.current}</span>}
      </div>
    </li>
  );
}

function GoalDetailDrawer({ goal, onClose, onAutonomyChange }: {
  goal: PersonalGoalContract;
  onClose: () => void;
  onAutonomyChange: (goalId: string, autonomy: AutonomyLevel) => Promise<void>;
}) {
  const [autonomyError, setAutonomyError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleAutonomyChange = useCallback(async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newAutonomy = e.target.value as AutonomyLevel;
    setBusy(true);
    setAutonomyError(null);
    try {
      await onAutonomyChange(goal.id, newAutonomy);
    } catch (err) {
      setAutonomyError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [goal.id, onAutonomyChange]);

  return (
    <div className="goal-detail-drawer" role="dialog" aria-label={`目标详情 ${goal.id}`}>
      <div className="goal-detail-head">
        <div>
          <div className="goal-detail-badges">
            <StatusBadge status={goal.status} />
            <AutonomyBadge autonomy={goal.autonomy} />
          </div>
          <h3 className="goal-detail-title">{goal.need}</h3>
        </div>
        <button type="button" className="goal-detail-close" onClick={onClose} aria-label="关闭">×</button>
      </div>

      <div className="goal-detail-section">
        <h4 className="goal-detail-section-title">期望结果</h4>
        <p className="goal-detail-text">{goal.desiredOutcome}</p>
      </div>

      <div className="goal-detail-section">
        <h4 className="goal-detail-section-title">成功度量 ({goal.successMeasures.length})</h4>
        <ul className="goal-measures-list">
          {goal.successMeasures.map((m, i) => (
            <SuccessMeasureRow key={i} measure={m} />
          ))}
        </ul>
      </div>

      {goal.budget && (
        <div className="goal-detail-section">
          <h4 className="goal-detail-section-title">预算约束</h4>
          <BudgetBar budget={goal.budget} />
        </div>
      )}

      <div className="goal-detail-section">
        <h4 className="goal-detail-section-title">
          <ShieldAlert size={13} /> 自治等级
        </h4>
        <select
          className="goal-autonomy-select"
          value={goal.autonomy}
          onChange={(e) => void handleAutonomyChange(e)}
          disabled={busy}
          aria-label="自治等级"
        >
          {AUTONOMY_OPTIONS.map((level) => (
            <option key={level} value={level}>{AUTONOMY_META[level].label}</option>
          ))}
        </select>
        {autonomyError && <p className="goal-error">{autonomyError}</p>}
      </div>

      <div className="goal-detail-section">
        <h4 className="goal-detail-section-title">允许行动 ({goal.allowedActions.length})</h4>
        <ul className="goal-actions-list">
          {goal.allowedActions.map((action, i) => (
            <li key={i} className="goal-action-row allowed">
              <Check size={12} /> <code>{action}</code>
            </li>
          ))}
        </ul>
      </div>

      <div className="goal-detail-section">
        <h4 className="goal-detail-section-title">禁止行动 ({goal.forbiddenActions.length})</h4>
        <ul className="goal-actions-list">
          {goal.forbiddenActions.map((action, i) => (
            <li key={i} className="goal-action-row forbidden">
              <X size={12} /> <code>{action}</code>
            </li>
          ))}
        </ul>
      </div>

      <div className="goal-detail-section">
        <h4 className="goal-detail-section-title">假设前提 ({goal.assumptions.length})</h4>
        <ul className="goal-assumptions-list">
          {goal.assumptions.map((assumption, i) => (
            <li key={i}>{assumption}</li>
          ))}
        </ul>
      </div>

      {goal.deadline && (
        <div className="goal-detail-section">
          <h4 className="goal-detail-section-title">截止日期</h4>
          <p className="goal-detail-text">{new Date(goal.deadline).toLocaleString("zh-CN")}</p>
        </div>
      )}
    </div>
  );
}

// ===== Main component =====

export function GoalsView() {
  const { data: snapshot, loading, error, refetch } = useHabitatSnapshotWithRefetch();
  const [statusFilter, setStatusFilter] = useState<GoalStatus | "all">("all");
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);

  const goals = useMemo(() => snapshot?.goals ?? [], [snapshot]);

  const filteredGoals = useMemo(() => {
    const filtered = statusFilter === "all" ? goals : goals.filter((g) => g.status === statusFilter);
    return [...filtered].sort((a, b) => {
      // active first, then by deadline
      if (a.status === "active" && b.status !== "active") return -1;
      if (b.status === "active" && a.status !== "active") return 1;
      if (a.deadline && b.deadline) return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
      return 0;
    });
  }, [goals, statusFilter]);

  const selectedGoal = useMemo(
    () => goals.find((g) => g.id === selectedGoalId) ?? null,
    [goals, selectedGoalId],
  );

  const counts = useMemo(() => {
    const byStatus: Record<string, number> = { all: goals.length };
    for (const g of goals) {
      byStatus[g.status] = (byStatus[g.status] ?? 0) + 1;
    }
    return byStatus;
  }, [goals]);

  const totalBudgetSpent = useMemo(() => {
    return goals.reduce((sum, g) => sum + (g.budget?.spent ?? 0), 0);
  }, [goals]);

  const handleAutonomyChange = useCallback(async (goalId: string, autonomy: AutonomyLevel) => {
    await habitatApi.updateGoalAutonomy(goalId, autonomy);
    // 触发重新加载以获取最新快照
    refetch();
  }, [refetch]);

  if (loading && !snapshot) {
    return (
      <section className="goals-view" aria-label="目标中心">
        <div className="data-loading" role="status">加载目标数据…</div>
      </section>
    );
  }

  if (error || !snapshot) {
    return (
      <section className="goals-view" aria-label="目标中心">
        <div className="data-error-banner" role="alert">
          目标数据加载失败：{error ?? "未知错误"}
        </div>
      </section>
    );
  }

  return (
    <section className="goals-view" aria-label="目标中心">
      <header className="goals-view-head">
        <div className="goals-view-title">
          <h2><Target size={20} /> 目标中心</h2>
          <p className="goals-view-subtitle">个人目标合约 - 成功度量 · 预算约束 · 自治策略 · 行动边界</p>
        </div>
      </header>

      {/* 汇总条 */}
      <div className="goals-summary">
        <div className="goals-summary-item">
          <span className="goals-summary-label"><Target size={13} /> 目标总数</span>
          <strong className="goals-summary-value">{goals.length}</strong>
        </div>
        <div className="goals-summary-item">
          <span className="goals-summary-label"><CheckCircle2 size={13} /> 活跃</span>
          <strong className="goals-summary-value ok">{counts.active ?? 0}</strong>
        </div>
        <div className="goals-summary-item">
          <span className="goals-summary-label"><AlertTriangle size={13} /> 待用户</span>
          <strong className="goals-summary-value warn">{counts.waiting_for_user ?? 0}</strong>
        </div>
        <div className="goals-summary-item">
          <span className="goals-summary-label"><Check size={13} /> 已完成</span>
          <strong className="goals-summary-value ok">{counts.completed ?? 0}</strong>
        </div>
        <div className="goals-summary-item">
          <span className="goals-summary-label"><XCircle size={13} /> 已取消</span>
          <strong className="goals-summary-value muted">{counts.cancelled ?? 0}</strong>
        </div>
        <div className="goals-summary-item">
          <span className="goals-summary-label"><Clock size={13} /> 预算总花费</span>
          <strong className="goals-summary-value">¥{totalBudgetSpent}</strong>
        </div>
      </div>

      {/* 状态过滤 */}
      <div className="goals-filters" aria-label="状态过滤">
        <Filter size={13} aria-hidden="true" />
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={statusFilter === f.id ? "goals-filter active" : "goals-filter"}
            onClick={() => setStatusFilter(f.id)}
          >
            {f.label}
            <span className="goals-filter-count">{counts[f.id] ?? 0}</span>
          </button>
        ))}
      </div>

      {/* 主体：列表 + 详情 */}
      <div className="goals-body">
        <div className="goals-list" role="list">
          {filteredGoals.length === 0 ? (
            <p className="goals-empty-hint">无匹配的目标。调整过滤条件查看。</p>
          ) : (
            filteredGoals.map((goal) => (
              <GoalListItem
                key={goal.id}
                goal={goal}
                selected={selectedGoalId === goal.id}
                onSelect={() => setSelectedGoalId(goal.id)}
              />
            ))
          )}
        </div>

        <div className="goals-detail">
          {selectedGoal ? (
            <GoalDetailDrawer
              goal={selectedGoal}
              onClose={() => setSelectedGoalId(null)}
              onAutonomyChange={handleAutonomyChange}
            />
          ) : (
            <div className="goals-detail-placeholder">
              <Target size={32} aria-hidden="true" />
              <p>选择左侧任意目标查看完整合约</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ===== 扩展 hook：支持 refetch =====

/**
 * useHabitatSnapshot 的扩展版本，额外暴露 refetch 函数。
 * autonomy 修改后调用 refetch 刷新快照。
 */
function useHabitatSnapshotWithRefetch(): {
  data: HabitatSnapshot | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
} {
  const [tick, setTick] = useState(0);
  const refetch = useCallback(() => setTick((t) => t + 1), []);
  const state = useHabitatSnapshot([tick]);
  return { ...state, refetch };
}
