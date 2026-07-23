/**
 * client/habitat/squadLayout.ts — Squad 环形布局计算
 *
 * 纯函数：根据 squad 数据 + 画布尺寸，计算每个成员 Agent 在画布上的位置。
 * 布局规则：
 * - lead 位于环的正上方（angle=0）
 * - 其余成员按角色优先级顺时针排列：contributor → reviewer → boundary_keeper
 * - 同角色按加入时间排序
 * - radius 根据 squad 阶段动态变化：forming 时收缩，dissolving 时扩张淡出
 */

import type { DynamicSquad, AgentRoleInSquad } from "../../domain/agentHabitat";
import { SQUAD_PHASE_COLORS } from "../../domain/squadLifecycle";
import { computeSquadProgress } from "../../domain/squadLifecycle";
import type {
  SquadRenderGroup,
  SquadEvidenceFlow,
  AgentRenderPosition,
} from "./types";

/** 角色在环上的优先级（数字越小越靠前） */
const ROLE_PRIORITY: Record<AgentRoleInSquad, number> = {
  lead: 0,
  contributor: 1,
  reviewer: 2,
  boundary_keeper: 3,
};

/** Squad 中心默认位置（归一化），可被外部覆盖 */
export const DEFAULT_SQUAD_CENTER = { x: 0.5, y: 0.5 };

/** Squad 环形半径基准（归一化，相对画布短边） */
export const DEFAULT_SQUAD_RADIUS = 0.18;

/**
 * 根据阶段调整半径系数。
 * - forming：0.85（紧凑，体现"召集"）
 * - working：1.0（标准）
 * - reviewing：1.05（稍扩张，体现"对峙"）
 * - delivering：0.95（紧凑，体现"汇聚交付"）
 * - dissolving：1.2（扩张，体现"散开"）
 */
function radiusFactorForPhase(phase: DynamicSquad["phase"]): number {
  switch (phase) {
    case "forming": return 0.85;
    case "working": return 1.0;
    case "reviewing": return 1.05;
    case "delivering": return 0.95;
    case "dissolving": return 1.2;
  }
}

/**
 * 计算单个 squad 的环形布局。
 *
 * @param squad 当前 squad 数据
 * @param tasks 任务列表（用于计算进度）
 * @param center 中心点（归一化），默认 {0.5, 0.5}
 * @param baseRadius 基础半径（归一化），默认 0.18
 */
export function layoutSquad(
  squad: DynamicSquad,
  tasks: Array<{ id: string; progress: number }>,
  center: { x: number; y: number } = DEFAULT_SQUAD_CENTER,
  baseRadius: number = DEFAULT_SQUAD_RADIUS
): SquadRenderGroup {
  // 按角色优先级 + 加入时间排序
  const sortedMembers = [...squad.memberRoles].sort((a, b) => {
    const pa = ROLE_PRIORITY[a.role];
    const pb = ROLE_PRIORITY[b.role];
    if (pa !== pb) return pa - pb;
    return a.joinedAt.localeCompare(b.joinedAt);
  });

  // 计算每个成员的角度
  // lead 固定在 angle=0（正上方），其余顺时针均匀分布
  const memberAngles: Record<string, number> = {};
  const memberRoles: Record<string, AgentRoleInSquad> = {};
  const memberAgentIds: string[] = [];

  const n = sortedMembers.length;
  sortedMembers.forEach((m, i) => {
    // 0=正上方（12点钟），顺时针递增
    const angle = (i / Math.max(n, 1)) * Math.PI * 2;
    memberAngles[m.agentId] = angle;
    memberRoles[m.agentId] = m.role;
    memberAgentIds.push(m.agentId);
  });

  const radius = baseRadius * radiusFactorForPhase(squad.phase);
  const progress = computeSquadProgress(squad, tasks);

  return {
    squadId: squad.id,
    label: squad.label,
    objective: squad.objective,
    phase: squad.phase,
    phaseColor: SQUAD_PHASE_COLORS[squad.phase],
    centerX: center.x,
    centerY: center.y,
    radius,
    memberAgentIds,
    memberAngles,
    memberRoles,
    progress,
    hasAdversarialReview: squad.hasAdversarialReview,
    leadAgentId: squad.leadAgentId,
  };
}

/**
 * 根据 squad 布局计算每个成员 Agent 的画布位置（归一化 0-1）。
 * 调用方需要用画布宽高换算成像素。
 */
export function getMemberPositions(
  group: SquadRenderGroup
): AgentRenderPosition[] {
  return group.memberAgentIds.map((id) => {
    const angle = group.memberAngles[id] ?? 0;
    // angle=0 正上方 → dx=0, dy=-radius
    // 顺时针：dx = sin(angle), dy = -cos(angle)
    const dx = Math.sin(angle) * group.radius;
    const dy = -Math.cos(angle) * group.radius;
    return {
      agentId: id,
      x: group.centerX + dx,
      y: group.centerY + dy,
    };
  });
}

/**
 * 构造 squad 内部的证据流连线。
 * - lead ↔ 每个成员（双向证据流）
 * - reviewing 阶段：reviewer → lead 为对峙连线（adversarial=true）
 * - working 阶段：contributor 之间互连（弱流）
 */
export function buildSquadFlows(
  group: SquadRenderGroup
): SquadEvidenceFlow[] {
  const flows: SquadEvidenceFlow[] = [];
  const color = group.phaseColor;

  for (const memberId of group.memberAgentIds) {
    if (memberId === group.leadAgentId) continue;
    const role = group.memberRoles[memberId];

    // lead ↔ member 双向
    flows.push({
      squadId: group.squadId,
      fromId: group.leadAgentId,
      toId: memberId,
      color,
      intensity: 0.7,
      adversarial: false,
    });
    flows.push({
      squadId: group.squadId,
      fromId: memberId,
      toId: group.leadAgentId,
      color,
      intensity: 0.5,
      adversarial: false,
    });

    // 对峙阶段：reviewer 质疑 lead
    if (group.phase === "reviewing" && role === "reviewer") {
      flows.push({
        squadId: group.squadId,
        fromId: memberId,
        toId: group.leadAgentId,
        color: "#C75A4A",
        intensity: 0.9,
        adversarial: true,
      });
    }
  }

  // working 阶段：contributor 之间弱连接
  if (group.phase === "working") {
    const contributors = group.memberAgentIds.filter(
      (id) => group.memberRoles[id] === "contributor"
    );
    for (let i = 0; i < contributors.length; i++) {
      for (let j = i + 1; j < contributors.length; j++) {
        flows.push({
          squadId: group.squadId,
          fromId: contributors[i],
          toId: contributors[j],
          color,
          intensity: 0.3,
          adversarial: false,
        });
      }
    }
  }

  return flows;
}
