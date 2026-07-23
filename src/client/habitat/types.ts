/**
 * client/habitat/types.ts — 活动空间 UI 层类型
 *
 * 复用 domain/agentHabitat.ts 的领域类型，
 * 仅补充 UI 渲染所需的展示类型。
 */

import type {
  AgentIdentity,
  PersonalGoalContract,
  DynamicTask,
  DynamicSquad,
  SquadPhase,
  AgentRoleInSquad,
  UserBoundaryRequest,
  HabitatMemoryArtifact,
  HabitatActivityEvent,
  HabitatSnapshot,
  MotionPreference,
} from "../../domain/agentHabitat";

// Re-export domain types for convenience
export type {
  AgentIdentity,
  PersonalGoalContract,
  DynamicTask,
  DynamicSquad,
  SquadPhase,
  AgentRoleInSquad,
  UserBoundaryRequest,
  HabitatMemoryArtifact,
  HabitatActivityEvent,
  HabitatSnapshot,
  MotionPreference,
};

/** 画布上 Agent 的渲染位置（归一化 0-1） */
export interface AgentRenderPosition {
  agentId: string;
  /** 相对画布宽度的 x 坐标 (0-1) */
  x: number;
  /** 相对画布高度的 y 坐标 (0-1) */
  y: number;
}

/** 任务核心展示数据 */
export interface TaskCoreDisplay {
  goalId: string;
  need: string;
  receivedAt: string;
  status: PersonalGoalContract["status"];
}

/** 自动化等级 */
export type AutonomyLevel = "autonomous" | "supervised" | "manual";

/** 目标轨道条目（扩展：progress/budget/autonomy/agentCount） */
export interface GoalTrackEntry {
  goalId: string;
  need: string;
  trackKind: "focused" | "background" | "scheduled" | "waiting" | "completed";
  /** 0-1 进度 */
  progress?: number;
  /** 预算 */
  budget?: { spent: number; limit: number; currency: "CNY" | "USD" };
  /** 自动化等级 */
  autonomy?: AutonomyLevel;
  /** 关联 Agent 数 */
  agentCount?: number;
}

/** 注意力分配计算结果 */
export interface AttentionAllocation {
  trackKind: GoalTrackEntry["trackKind"];
  count: number;
  ratio: number;
}

/** 按 trackKind 计算注意力分配比例 */
export function computeAttentionAllocation(
  entries: GoalTrackEntry[]
): AttentionAllocation[] {
  const total = entries.length;
  if (total === 0) return [];
  const grouped = new Map<GoalTrackEntry["trackKind"], number>();
  for (const e of entries) {
    grouped.set(e.trackKind, (grouped.get(e.trackKind) ?? 0) + 1);
  }
  return [...grouped.entries()].map(([trackKind, count]) => ({
    trackKind,
    count,
    ratio: count / total,
  }));
}

/** 时间线事件（UI 展示用） */
export interface TimelineEventDisplay {
  id: string;
  /** 相对时间位置 (0-1, 0=00:00, 1=24:00) */
  timeRatio: number;
  /** 事件颜色 hex */
  color: string;
  /** 是否重要事件 */
  important: boolean;
  /** 事件摘要 */
  label: string;
  /** 关联 Agent ID */
  actorId?: string;
}

/** 成本摘要 */
export interface CostSummary {
  /** 今日已工作时长（秒） */
  workSeconds: number;
  /** 今日工具调用次数 */
  toolCalls: number;
  /** 今日预计费用（元） */
  estimatedCost: number;
  /** 月度预算（元） */
  monthlyBudget: number;
  /** 最耗资源的目标名称 */
  topCostGoal: string;
  /** 最耗资源占比 (0-1) */
  topCostRatio: number;
}

// === Squad 集群 UI 类型 ===

/** Squad 在画布上的视觉聚合数据 */
export interface SquadRenderGroup {
  squadId: string;
  label: string;
  objective: string;
  phase: SquadPhase;
  /** 阶段主色（hex） */
  phaseColor: string;
  /** 中心点（归一化 0-1） */
  centerX: number;
  centerY: number;
  /** 环形半径（归一化，相对画布短边） */
  radius: number;
  /** 成员 Agent ID（包含常驻+临时，按角色排序：lead 在最上方） */
  memberAgentIds: string[];
  /** 各成员在环上的角度（弧度，0=正上方，顺时针） */
  memberAngles: Record<string, number>;
  /** 各成员的角色 */
  memberRoles: Record<string, AgentRoleInSquad>;
  /** squad 整体进度 (0-1) */
  progress: number;
  /** 是否处于对峙状态 */
  hasAdversarialReview: boolean;
  /** 领队 Agent ID */
  leadAgentId: string;
}

/** Squad 内部成员之间的证据流连线 */
export interface SquadEvidenceFlow {
  squadId: string;
  /** 从 Agent ID */
  fromId: string;
  /** 到 Agent ID */
  toId: string;
  /** 流的颜色（默认取 squad 阶段色） */
  color: string;
  /** 流的强度 (0-1)，影响粒子密度 */
  intensity: number;
  /** 是否为对峙连线（虚线红色） */
  adversarial: boolean;
}

/** HabitatWorkspace 传给 WorkspaceCanvas 的集群渲染包 */
export interface SquadRenderBundle {
  groups: SquadRenderGroup[];
  flows: SquadEvidenceFlow[];
}
