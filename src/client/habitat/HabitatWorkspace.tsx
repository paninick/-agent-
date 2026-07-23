/**
 * client/habitat/HabitatWorkspace.tsx — 活动空间主容器
 *
 * 3 焦点布局重构（2026-07-12）：
 *   顶部注意力脉搏条 + 左侧上下分区（需求+画布） + 右侧回应栏
 *   点击焦点区触发对应详情抽屉
 */

import { useState, useCallback, useMemo, useEffect } from "react";
import { WorkspaceCanvas } from "./WorkspaceCanvas";
import { TaskCore } from "./TaskCore";
import { MemoryPanel } from "./MemoryPanel";
import { ActivityTimeline } from "./ActivityTimeline";
import { AttentionPulse } from "./AttentionPulse";
import { FocusDrawer } from "./FocusDrawer";
import { NeedFocus } from "./NeedFocus";
import { SquadFocus } from "./SquadFocus";
import { ResponseFocus } from "./ResponseFocus";
import { TimelinePanel } from "./TimelinePanel";
import { narrateCost } from "./costNarrative";
import { useHabitatMotion } from "./useHabitatMotion";
import { createMockHabitatSnapshot } from "./habitatMock";
import { habitatApi, useHabitatSnapshot } from "./habitatApi";
import { layoutSquad, getMemberPositions, buildSquadFlows, DEFAULT_SQUAD_CENTER } from "./squadLayout";
import type {
  HabitatSnapshot,
  AgentRenderPosition,
  GoalTrackEntry,
  TimelineEventDisplay,
  CostSummary,
  SquadRenderGroup,
  SquadEvidenceFlow,
} from "./types";

// === 常驻 Agent 默认位置（归一化坐标） ===
// 注意：当 Agent 加入 squad 时，位置由 squad 环形布局覆盖
const DEFAULT_RESIDENT_POSITIONS: AgentRenderPosition[] = [
  { agentId: "resident-steward", x: 0.18, y: 0.22 },
  { agentId: "resident-planner", x: 0.38, y: 0.15 },
  { agentId: "resident-memory", x: 0.62, y: 0.15 },
  { agentId: "resident-guardian", x: 0.82, y: 0.22 },
];

const DEFAULT_EPHEMERAL_POSITIONS: AgentRenderPosition[] = [
  { agentId: "eph-trip-search", x: 0.22, y: 0.62 },
  { agentId: "eph-trip-budget", x: 0.38, y: 0.72 },
  { agentId: "eph-trip-weather", x: 0.55, y: 0.72 },
  { agentId: "eph-trip-book", x: 0.72, y: 0.62 },
];

const TASK_CORE_POS = { x: 0.5, y: 0.48 };

/**
 * 从 snapshot 构建 squad 渲染包：groups + flows。
 * - 每个 squad 计算环形布局
 * - 成员位置由 squad 布局覆盖（合并到 resident/ephemeral positions）
 */
function buildSquadRenderBundle(
  snapshot: HabitatSnapshot
): { groups: SquadRenderGroup[]; flows: SquadEvidenceFlow[] } {
  const groups: SquadRenderGroup[] = [];
  const allFlows: SquadEvidenceFlow[] = [];

  for (const squad of snapshot.squads) {
    // 跳过已解散的 squad
    if (squad.phase === "dissolving" && squad.dissolvedAt) continue;

    const group = layoutSquad(squad, snapshot.tasks, DEFAULT_SQUAD_CENTER);
    groups.push(group);
    allFlows.push(...buildSquadFlows(group));
  }

  return { groups, flows: allFlows };
}

/**
 * 合并默认位置和 squad 环形位置：
 * - 在 squad 中的 Agent 用 squad 环形位置覆盖
 * - 不在任何 squad 中的 Agent 保持默认位置
 */
function mergePositions(
  defaultPositions: AgentRenderPosition[],
  squadGroups: SquadRenderGroup[]
): AgentRenderPosition[] {
  const squadPositionMap = new Map<string, AgentRenderPosition>();
  for (const group of squadGroups) {
    for (const pos of getMemberPositions(group)) {
      squadPositionMap.set(pos.agentId, pos);
    }
  }
  return defaultPositions.map((p) => squadPositionMap.get(p.agentId) ?? p);
}

// === 辅助：从 snapshot 构建 UI 数据 ===

function buildGoalTrack(snapshot: HabitatSnapshot): GoalTrackEntry[] {
  return snapshot.goals.map((g) => {
    let trackKind: GoalTrackEntry["trackKind"] = "background";
    if (g.status === "active") trackKind = "focused";
    else if (g.status === "waiting_for_user") trackKind = "waiting";
    else if (g.status === "completed") trackKind = "completed";
    return { goalId: g.id, need: g.need, trackKind };
  });
}

function buildTimelineEvents(snapshot: HabitatSnapshot): TimelineEventDisplay[] {
  const colorMap: Record<string, string> = {
    "resident-steward": "#E4A84B",
    "resident-planner": "#4E72D8",
    "resident-memory": "#8B6CCF",
    "resident-guardian": "#C75A4A",
  };
  return snapshot.activity.map((ev) => {
    const d = new Date(ev.occurredAt);
    const hours = d.getHours() + d.getMinutes() / 60;
    return {
      id: ev.id,
      timeRatio: hours / 24,
      color: colorMap[ev.actorId] ?? "#4BA89A",
      important: ev.important,
      label: ev.summary,
      actorId: ev.actorId,
    };
  });
}

function buildCostSummary(snapshot: HabitatSnapshot): CostSummary {
  return {
    workSeconds: 7 * 3600,
    toolCalls: 23,
    estimatedCost: 4.80,
    monthlyBudget: 50,
    topCostGoal: "出差规划",
    topCostRatio: 0.62,
  };
}

function buildConnections(snapshot: HabitatSnapshot): Array<[string, string, string, boolean]> {
  const connections: Array<[string, string, string, boolean]> = [];
  const allAgents = [...snapshot.residentAgents, ...snapshot.ephemeralAgents];

  // Ephemeral -> parent resident (via task assignment)
  for (const task of snapshot.tasks) {
    for (const agentId of task.assignedAgentIds) {
      const agent = allAgents.find((a) => a.id === agentId);
      if (agent?.tenure === "ephemeral") {
        // Find which resident this ephemeral is associated with
        const parent = snapshot.residentAgents.find((r) => {
          if (r.residentKind === "planner") return true;
          if (r.residentKind === "guardian" && task.status === "waiting") return true;
          return false;
        });
        if (parent) {
          connections.push([parent.id, agentId, agent.accent, false]);
        }
      }
    }
  }

  // All agents -> task core (represented by a virtual connection)
  // We'll use the first resident as the "core proxy"
  // 注意：connection 颜色保持 6-hex（#RRGGBB），alpha 由 WorkspaceCanvas.drawConnection 统一追加
  const coreProxy = snapshot.residentAgents[0]?.id;
  if (coreProxy) {
    for (const agent of allAgents) {
      if (agent.id !== coreProxy) {
        connections.push([agent.id, coreProxy, agent.accent, true]);
      }
    }
  }

  return connections;
}

// === 主组件 ===

const DRAWER_VIEWS = ["need", "squad", "response", "pulse", "timeline"] as const;
type DrawerView = (typeof DRAWER_VIEWS)[number];

function readDrawerFromUrl(): DrawerView | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const view = params.get("view");
  if (view && (DRAWER_VIEWS as readonly string[]).includes(view)) {
    return view as DrawerView;
  }
  return null;
}

export function HabitatWorkspace() {
  const { motion, cycleMotion, isActive, isReduced } = useHabitatMotion();
  // 通过 habitatApi 加载快照（生产环境调真实 API，开发模式 fallback 到 mock）
  const { data: apiSnapshot, loading, error } = useHabitatSnapshot();
  const [localOverrides, setLocalOverrides] = useState<Partial<HabitatSnapshot> | null>(null);
  // 合并 API 数据与本地覆盖（用于乐观更新）
  const snapshot: HabitatSnapshot = useMemo(() => {
    const base = apiSnapshot ?? createMockHabitatSnapshot();
    return localOverrides ? { ...base, ...localOverrides } : base;
  }, [apiSnapshot, localOverrides]);
  // 初始化即从 URL 读取，避免 writer effect 在挂载时清掉 ?view= 参数的竞态
  const [activeDrawer, setActiveDrawer] = useState<string | null>(() => readDrawerFromUrl());

  const allAgents = useMemo(
    () => [...snapshot.residentAgents, ...snapshot.ephemeralAgents],
    [snapshot.residentAgents, snapshot.ephemeralAgents]
  );

  const goalTrack = useMemo(() => buildGoalTrack(snapshot), [snapshot]);
  const timelineEvents = useMemo(() => buildTimelineEvents(snapshot), [snapshot]);
  const costSummary = useMemo(() => buildCostSummary(snapshot), [snapshot]);
  const connections = useMemo(() => buildConnections(snapshot), [snapshot]);

  // Squad 集群渲染包
  const squadBundle = useMemo(() => buildSquadRenderBundle(snapshot), [snapshot]);

  const currentGoal = snapshot.goals[0];

  // === URL 视图状态同步（activeDrawer → URL） ===
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (activeDrawer) {
      params.set("view", activeDrawer);
    } else {
      params.delete("view");
    }
    const newUrl = `${window.location.pathname}?${params.toString()}`.replace(/\?$/, "");
    window.history.replaceState(null, "", newUrl);
  }, [activeDrawer]);

  const handleApprove = useCallback((id: string) => {
    // 乐观更新：立即从 UI 移除请求
    setLocalOverrides((prev) => ({
      ...prev,
      userRequests: (prev?.userRequests ?? snapshot.userRequests).filter(
        (r) => r.id !== id,
      ),
    }));
    // 异步调用 API（失败时由 mock fallback 或下次 snapshot 拉取纠正）
    habitatApi.approveRequest(id).catch((err) => {
      console.warn(`[habitatApi] approveRequest(${id}) failed:`, err);
    });
  }, [snapshot.userRequests]);

  const handleReject = useCallback((id: string) => {
    setLocalOverrides((prev) => ({
      ...prev,
      userRequests: (prev?.userRequests ?? snapshot.userRequests).filter(
        (r) => r.id !== id,
      ),
    }));
    habitatApi.rejectRequest(id).catch((err) => {
      console.warn(`[habitatApi] rejectRequest(${id}) failed:`, err);
    });
  }, [snapshot.userRequests]);

  const handleAutoAuthorize = useCallback((id: string) => {
    const req = snapshot.userRequests.find((r) => r.id === id);
    const autonomyLevel = req?.autonomyOffer?.proposedLevel ?? "auto_within_limits";
    setLocalOverrides((prev) => ({
      ...prev,
      userRequests: (prev?.userRequests ?? snapshot.userRequests).filter(
        (r) => r.id !== id,
      ),
    }));
    habitatApi
      .autoAuthorize(id, autonomyLevel)
      .catch((err) => {
        console.warn(`[habitatApi] autoAuthorize(${id}) failed:`, err);
      });
  }, [snapshot.userRequests]);

  // Now ratio based on current time
  const now = new Date();
  const nowRatio = (now.getHours() + now.getMinutes() / 60) / 24;

  const residentPositions = mergePositions(
    DEFAULT_RESIDENT_POSITIONS.filter((p) =>
      snapshot.residentAgents.some((a) => a.id === p.agentId)
    ),
    squadBundle.groups
  );
  const ephemeralPositions = mergePositions(
    DEFAULT_EPHEMERAL_POSITIONS.filter((p) =>
      snapshot.ephemeralAgents.some((a) => a.id === p.agentId)
    ),
    squadBundle.groups
  );

  // ResponseFocus 的 requestingAgents Map
  const requestingAgentsMap = useMemo(() => {
    const m = new Map<string, typeof allAgents[number] | undefined>();
    for (const req of snapshot.userRequests) {
      m.set(req.id, allAgents.find((a) => a.id === req.requestingAgentId));
    }
    return m;
  }, [snapshot.userRequests, allAgents]);

  if (loading && !apiSnapshot) {
    return <div className="habitat-loading">正在加载活动空间...</div>;
  }

  if (error && !apiSnapshot) {
    return (
      <div className="habitat-loading" role="alert">
        <p style={{ color: "var(--red, #C75A4A)", marginBottom: "0.5rem" }}>
          加载失败：{error}
        </p>
        <p style={{ fontSize: "0.75rem", color: "var(--ink-muted)" }}>
          请检查后端 API（/api/habitat/snapshot）是否可用。
        </p>
      </div>
    );
  }

  return (
    <div className="habitat-workspace">
      <a href="#habitat-main" className="habitat-skip-link">跳转到主内容</a>
      <h1 style={{ position: "absolute", left: "-9999px" }}>Agent 活动空间</h1>

      {/* 顶部注意力脉搏条 */}
      <AttentionPulse entries={goalTrack} onSelect={() => setActiveDrawer("pulse")} />

      {/* 3 焦点布局 */}
      <main id="habitat-main" className="habitat-focus-layout">
        {/* 左列：上下分区 */}
        <div className="habitat-left-column">
          {/* 上部：当前需求区 */}
          <NeedFocus
            need={currentGoal?.need ?? "暂无活动需求"}
            receivedAt={new Date(snapshot.capturedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
            tasks={snapshot.tasks}
            allAgents={allAgents}
            onClick={() => setActiveDrawer("need")}
          />
          {/* 下部：Agent 小队画布区 */}
          <SquadFocus
            squadCount={snapshot.squads.length}
            agentCount={allAgents.length}
            onClick={() => setActiveDrawer("squad")}
          >
            <WorkspaceCanvas
              residents={snapshot.residentAgents}
              ephemerals={snapshot.ephemeralAgents}
              residentPositions={residentPositions}
              ephemeralPositions={ephemeralPositions}
              taskCoreX={TASK_CORE_POS.x}
              taskCoreY={TASK_CORE_POS.y}
              connections={connections}
              squadGroups={squadBundle.groups}
              squadFlows={squadBundle.flows}
              animate={isActive}
              reduced={isReduced}
            />
          </SquadFocus>
        </div>

        {/* 右列：需要回应区 */}
        <ResponseFocus
          requests={snapshot.userRequests}
          requestingAgents={requestingAgentsMap}
          onApprove={handleApprove}
          onReject={handleReject}
          onAutoAuthorize={handleAutoAuthorize}
          onClick={() => setActiveDrawer("response")}
        />
      </main>

      {/* 运动模式切换（浮动） */}
      <button
        className="habitat-motion-toggle"
        onClick={cycleMotion}
        style={{ position: "fixed", bottom: "1rem", right: "1rem", zIndex: 50 }}
        aria-label="切换动画模式"
      >
        {motion === "full" ? "专注模式" : motion === "reduced" ? "减少动态" : "关闭动画"}
      </button>

      {/* 结果时间线入口（浮动） */}
      <button
        type="button"
        className="habitat-timeline-toggle"
        onClick={() => setActiveDrawer("timeline")}
        style={{ position: "fixed", bottom: "1rem", right: "8.5rem", zIndex: 50 }}
        aria-label="打开结果时间线"
      >
        结果时间线
      </button>

      {/* === 详情抽屉 === */}

      {/* 当前需求抽屉 */}
      <FocusDrawer open={activeDrawer === "need"} onClose={() => setActiveDrawer(null)} title="当前需求详情">
        {currentGoal && (
          <TaskCore
            need={currentGoal.need}
            receivedAt={new Date(snapshot.capturedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
            tasks={snapshot.tasks}
            allAgents={allAgents}
          />
        )}
        {snapshot.memories.length > 0 && (
          <div style={{ marginTop: "1rem" }}>
            <h3 style={{ color: "var(--habitat-mute)", fontSize: "0.8rem", marginBottom: "0.5rem" }}>新学到的偏好</h3>
            <MemoryPanel memories={snapshot.memories} />
          </div>
        )}
      </FocusDrawer>

      {/* Agent 小队抽屉 */}
      <FocusDrawer open={activeDrawer === "squad"} onClose={() => setActiveDrawer(null)} title="Agent 小队详情">
        <p style={{ color: "var(--habitat-ink)" }}>
          共 {allAgents.length} 个 Agent，{snapshot.squads.length} 个小队
        </p>
        <div style={{ marginTop: "0.5rem" }}>
          <h3 style={{ color: "var(--habitat-mute)", fontSize: "0.8rem", marginBottom: "0.5rem" }}>常驻 Agent</h3>
          <ul style={{ listStyle: "none", padding: 0 }}>
            {snapshot.residentAgents.map((a) => (
              <li key={a.id} style={{ padding: "0.25rem 0", color: "var(--habitat-ink)", fontSize: "0.85rem" }}>
                <span style={{ color: a.accent }}>●</span> {a.name} — {a.residentKind}
              </li>
            ))}
          </ul>
        </div>
        {snapshot.ephemeralAgents.length > 0 && (
          <div style={{ marginTop: "0.5rem" }}>
            <h3 style={{ color: "var(--habitat-mute)", fontSize: "0.8rem", marginBottom: "0.5rem" }}>临时 Agent</h3>
            <ul style={{ listStyle: "none", padding: 0 }}>
              {snapshot.ephemeralAgents.map((a) => (
                <li key={a.id} style={{ padding: "0.25rem 0", color: "var(--habitat-ink)", fontSize: "0.85rem" }}>
                  <span style={{ color: a.accent }}>●</span> {a.name}
                </li>
              ))}
            </ul>
          </div>
        )}
      </FocusDrawer>

      {/* 需要回应抽屉 */}
      <FocusDrawer open={activeDrawer === "response"} onClose={() => setActiveDrawer(null)} title="需要回应详情">
        <p style={{ color: "var(--habitat-ink)" }}>
          共 {snapshot.userRequests.length} 个待回应事项
        </p>
        {snapshot.userRequests.length > 0 && (
          <div style={{ marginTop: "0.5rem" }}>
            <p style={{ color: "var(--habitat-mute)", fontSize: "0.8rem" }}>
              点击右侧"需要你"区域中的 DecisionCard 可直接审批。此处展示历史决策和证据链。
            </p>
          </div>
        )}
      </FocusDrawer>

      {/* 注意力脉搏条抽屉 */}
      <FocusDrawer open={activeDrawer === "pulse"} onClose={() => setActiveDrawer(null)} title="注意力分配详情">
        <div style={{ marginBottom: "1rem" }}>
          <h3 style={{ color: "var(--habitat-mute)", fontSize: "0.8rem", marginBottom: "0.5rem" }}>24 小时活动</h3>
          <ActivityTimeline events={timelineEvents} nowRatio={nowRatio} />
        </div>
        <div className="habitat-cost-detail">
          <h3 style={{ color: "var(--habitat-mute)", fontSize: "0.8rem", marginBottom: "0.5rem" }}>成本摘要</h3>
          {(() => {
            const n = narrateCost(costSummary);
            return (
              <>
                <p style={{ color: "var(--habitat-ink)", fontSize: "0.9rem", marginBottom: "0.4rem", lineHeight: 1.6 }}>
                  {n.overview}。{n.spending}。{n.focus}。
                </p>
                <p style={{ color: "var(--habitat-mute)", fontSize: "0.75rem", lineHeight: 1.5 }}>
                  今日工作 {Math.floor(costSummary.workSeconds / 3600)}h · 调用 {costSummary.toolCalls} 次 · ¥{costSummary.estimatedCost.toFixed(2)} / ¥{costSummary.monthlyBudget} · {costSummary.topCostGoal} {Math.round(costSummary.topCostRatio * 100)}%
                </p>
              </>
            );
          })()}
        </div>
      </FocusDrawer>

      {/* 结果时间线抽屉 */}
      <FocusDrawer open={activeDrawer === "timeline"} onClose={() => setActiveDrawer(null)} title="结果时间线">
        <TimelinePanel snapshot={snapshot} />
      </FocusDrawer>
    </div>
  );
}
