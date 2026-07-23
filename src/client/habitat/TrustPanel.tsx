/**
 * client/habitat/TrustPanel.tsx — 信任与权限管理面板
 *
 * 展示和管理 Agent 的权限边界：
 * - 每个目标的自治等级 / 预算 / 允许&禁止行为
 * - 待处理的权限提升请求（UserBoundaryRequest.autonomyOffer）
 * - Agent 权限摘要
 */

import { useState, useCallback } from "react";
import type {
  HabitatSnapshot,
  PersonalGoalContract,
  UserBoundaryRequest,
  AgentIdentity,
} from "../../domain/agentHabitat";
import type { AutonomyLevel } from "../../domain/agentHabitat";

const AUTONOMY_LABELS: Record<AutonomyLevel, string> = {
  observe_only: "仅观察",
  prepare_draft: "准备草案",
  ask_before_action: "行动前询问",
  auto_within_limits: "限额内自动",
  denied: "已禁止",
};

const AUTONOMY_DESCRIPTIONS: Record<AutonomyLevel, string> = {
  observe_only: "只能收集信息，不能执行任何操作",
  prepare_draft: "可以准备方案，但必须等用户确认后才执行",
  ask_before_action: "每次执行前都要问用户",
  auto_within_limits: "在预算和行为限制内可自动执行",
  denied: "禁止执行任何操作",
};

const AUTONOMY_ORDER: AutonomyLevel[] = [
  "denied",
  "observe_only",
  "prepare_draft",
  "ask_before_action",
  "auto_within_limits",
];

const AUTONOMY_COLORS: Record<AutonomyLevel, string> = {
  denied: "#C75A4A",
  observe_only: "#8B6CCF",
  prepare_draft: "#4E72D8",
  ask_before_action: "#E4A84B",
  auto_within_limits: "#4BA89A",
};

interface TrustPanelProps {
  snapshot: HabitatSnapshot;
  onAutonomyChange?: (goalId: string, level: AutonomyLevel) => void;
  onAcceptOffer?: (requestId: string) => void;
  onRejectOffer?: (requestId: string) => void;
}

export function TrustPanel({
  snapshot,
  onAutonomyChange,
  onAcceptOffer,
  onRejectOffer,
}: TrustPanelProps) {
  const [localAutonomy, setLocalAutonomy] = useState<Record<string, AutonomyLevel>>({});

  const getAutonomy = useCallback(
    (goal: PersonalGoalContract): AutonomyLevel => {
      return localAutonomy[goal.id] ?? goal.autonomy;
    },
    [localAutonomy]
  );

  const cycleAutonomy = useCallback(
    (goal: PersonalGoalContract) => {
      const current = getAutonomy(goal);
      const idx = AUTONOMY_ORDER.indexOf(current);
      const next = AUTONOMY_ORDER[(idx + 1) % AUTONOMY_ORDER.length];
      setLocalAutonomy((prev) => ({ ...prev, [goal.id]: next }));
      onAutonomyChange?.(goal.id, next);
    },
    [getAutonomy, onAutonomyChange]
  );

  const pendingOffers = snapshot.userRequests.filter(
    (r): r is UserBoundaryRequest & { autonomyOffer: NonNullable<UserBoundaryRequest["autonomyOffer"]> } =>
      !!r.autonomyOffer
  );

  const allAgents = [...snapshot.residentAgents, ...snapshot.ephemeralAgents];

  return (
    <div className="trust-panel" role="region" aria-label="信任与权限管理">
      <header className="trust-panel-header">
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--ink-primary, #e8eaed)", margin: 0 }}>
          信任与权限
        </h1>
        <p style={{ color: "var(--ink-muted, #8b95a1)", fontSize: "0.85rem", marginTop: "0.25rem" }}>
          管理 Agent 的自治等级、预算边界和行为权限
        </p>
      </header>

      {/* === 目标权限 === */}
      <section className="trust-section" aria-label="目标权限">
        <h2 style={{ fontSize: "1rem", fontWeight: 600, color: "var(--ink-primary, #e8eaed)", marginBottom: "0.75rem" }}>
          目标权限（{snapshot.goals.length}）
        </h2>
        {snapshot.goals.map((goal) => {
          const autonomy = getAutonomy(goal);
          const color = AUTONOMY_COLORS[autonomy];
          const budgetPct = goal.budget ? (goal.budget.spent / goal.budget.limit) * 100 : 0;
          return (
            <div key={goal.id} className="trust-goal-card" style={{
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "0.75rem",
              padding: "1rem",
              marginBottom: "0.75rem",
              background: "rgba(255,255,255,0.02)",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", marginBottom: "0.75rem" }}>
                <div style={{ flex: 1 }}>
                  <p style={{ color: "var(--ink-primary, #e8eaed)", fontSize: "0.95rem", fontWeight: 500, margin: 0 }}>
                    {goal.need}
                  </p>
                  <p style={{ color: "var(--ink-muted, #8b95a1)", fontSize: "0.75rem", marginTop: "0.25rem" }}>
                    状态：{goal.status === "active" ? "进行中" : goal.status === "completed" ? "已完成" : goal.status}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => cycleAutonomy(goal)}
                  style={{
                    background: color + "20",
                    color: color,
                    border: `1px solid ${color}40`,
                    borderRadius: "0.5rem",
                    padding: "0.4rem 0.8rem",
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                  aria-label={`当前自治等级：${AUTONOMY_LABELS[autonomy]}，点击切换`}
                >
                  {AUTONOMY_LABELS[autonomy]}
                </button>
              </div>

              <p style={{ color: "var(--ink-muted, #8b95a1)", fontSize: "0.75rem", marginBottom: "0.5rem" }}>
                {AUTONOMY_DESCRIPTIONS[autonomy]}
              </p>

              {/* 预算 */}
              {goal.budget && (
                <div style={{ marginBottom: "0.5rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "var(--ink-muted, #8b95a1)", marginBottom: "0.25rem" }}>
                    <span>预算</span>
                    <span>¥{goal.budget.spent} / ¥{goal.budget.limit}（{Math.round(budgetPct)}%）</span>
                  </div>
                  <div style={{ height: "4px", background: "rgba(255,255,255,0.06)", borderRadius: "2px", overflow: "hidden" }}>
                    <div style={{
                      height: "100%",
                      width: `${Math.min(budgetPct, 100)}%`,
                      background: budgetPct > 80 ? "#C75A4A" : budgetPct > 50 ? "#E4A84B" : "#4BA89A",
                    }} />
                  </div>
                </div>
              )}

              {/* 允许 / 禁止行为 */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginTop: "0.5rem" }}>
                {goal.allowedActions.map((action) => (
                  <span key={action} style={{
                    fontSize: "0.7rem",
                    padding: "0.15rem 0.5rem",
                    borderRadius: "0.25rem",
                    background: "rgba(75, 168, 154, 0.12)",
                    color: "#4BA89A",
                    border: "1px solid rgba(75, 168, 154, 0.2)",
                  }}>
                    ✓ {action}
                  </span>
                ))}
                {goal.forbiddenActions.map((action) => (
                  <span key={action} style={{
                    fontSize: "0.7rem",
                    padding: "0.15rem 0.5rem",
                    borderRadius: "0.25rem",
                    background: "rgba(199, 90, 74, 0.12)",
                    color: "#C75A4A",
                    border: "1px solid rgba(199, 90, 74, 0.2)",
                  }}>
                    ✗ {action}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </section>

      {/* === 待处理权限提升 === */}
      {pendingOffers.length > 0 && (
        <section className="trust-section" aria-label="待处理权限提升" style={{ marginTop: "1.5rem" }}>
          <h2 style={{ fontSize: "1rem", fontWeight: 600, color: "var(--ink-primary, #e8eaed)", marginBottom: "0.75rem" }}>
            权限提升请求（{pendingOffers.length}）
          </h2>
          {pendingOffers.map((req) => {
            const agent = allAgents.find((a) => a.id === req.requestingAgentId);
            return (
              <div key={req.id} style={{
                border: "1px solid rgba(228, 168, 75, 0.3)",
                borderRadius: "0.75rem",
                padding: "1rem",
                marginBottom: "0.75rem",
                background: "rgba(228, 168, 75, 0.05)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                  {agent && <span style={{ color: agent.accent }}>●</span>}
                  <span style={{ color: "var(--ink-primary, #e8eaed)", fontSize: "0.85rem", fontWeight: 500 }}>
                    {agent?.name ?? req.requestingAgentId}
                  </span>
                  <span style={{ color: "var(--ink-muted, #8b95a1)", fontSize: "0.75rem" }}>
                    请求提升到「{AUTONOMY_LABELS[req.autonomyOffer.proposedLevel]}」
                  </span>
                </div>
                <p style={{ color: "var(--ink-primary, #e8eaed)", fontSize: "0.85rem", margin: "0 0 0.4rem" }}>
                  {req.autonomyOffer.label}
                </p>
                <p style={{ color: "var(--ink-muted, #8b95a1)", fontSize: "0.75rem", margin: "0 0 0.5rem" }}>
                  {req.autonomyOffer.limitDescription}
                </p>
                <p style={{ color: "var(--ink-muted, #8b95a1)", fontSize: "0.75rem", margin: "0 0 0.5rem" }}>
                  原因：{req.whyNow}
                </p>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button
                    type="button"
                    onClick={() => onAcceptOffer?.(req.id)}
                    style={{
                      background: "rgba(75, 168, 154, 0.15)",
                      color: "#4BA89A",
                      border: "1px solid rgba(75, 168, 154, 0.3)",
                      borderRadius: "0.4rem",
                      padding: "0.35rem 0.8rem",
                      fontSize: "0.8rem",
                      cursor: "pointer",
                    }}
                  >
                    同意提升
                  </button>
                  <button
                    type="button"
                    onClick={() => onRejectOffer?.(req.id)}
                    style={{
                      background: "transparent",
                      color: "var(--ink-muted, #8b95a1)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: "0.4rem",
                      padding: "0.35rem 0.8rem",
                      fontSize: "0.8rem",
                      cursor: "pointer",
                    }}
                  >
                    暂不
                  </button>
                </div>
              </div>
            );
          })}
        </section>
      )}

      {/* === Agent 权限摘要 === */}
      <section className="trust-section" aria-label="Agent 权限摘要" style={{ marginTop: "1.5rem" }}>
        <h2 style={{ fontSize: "1rem", fontWeight: 600, color: "var(--ink-primary, #e8eaed)", marginBottom: "0.75rem" }}>
          Agent 权限摘要（{allAgents.length}）
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: "0.5rem" }}>
          {allAgents.map((agent) => (
            <AgentPermissionCard key={agent.id} agent={agent} snapshot={snapshot} />
          ))}
        </div>
      </section>
    </div>
  );
}

function AgentPermissionCard({ agent, snapshot }: { agent: AgentIdentity; snapshot: HabitatSnapshot }) {
  const assignedTasks = snapshot.tasks.filter((t) => t.assignedAgentIds.includes(agent.id));
  const relatedGoals = snapshot.goals.filter((g) =>
    assignedTasks.some((t) => t.goalId === g.id)
  );

  return (
    <div style={{
      border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: "0.5rem",
      padding: "0.6rem",
      background: "rgba(255,255,255,0.015)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.3rem" }}>
        <span style={{ color: agent.accent, fontSize: "0.8rem" }}>●</span>
        <span style={{ color: "var(--ink-primary, #e8eaed)", fontSize: "0.85rem", fontWeight: 500 }}>
          {agent.name}
        </span>
        <span style={{ color: "var(--ink-muted, #8b95a1)", fontSize: "0.7rem" }}>
          {agent.tenure === "resident" ? "常驻" : "临时"}
        </span>
      </div>
      <p style={{ color: "var(--ink-muted, #8b95a1)", fontSize: "0.72rem", margin: "0 0 0.3rem" }}>
        {agent.purpose}
      </p>
      {relatedGoals.length > 0 && (
        <p style={{ color: "var(--ink-muted, #8b95a1)", fontSize: "0.7rem", margin: 0 }}>
          服务目标：{relatedGoals.map((g) => g.autonomy).join("、")}
        </p>
      )}
    </div>
  );
}
