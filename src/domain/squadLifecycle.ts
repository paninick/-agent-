/**
 * Squad 生命周期状态机与编排规则。
 *
 * 5 阶段：forming → working → reviewing → delivering → dissolving
 * 每个阶段有允许的前置阶段、参与的成员角色、可见的视觉信号。
 *
 * 本模块纯函数，不依赖 React / Canvas，方便单元测试。
 */

import type {
  AgentRoleInSquad,
  DynamicSquad,
  SquadPhase,
} from "./agentHabitat";

/** 阶段转换图：键是当前阶段，值是该阶段允许进入的下一阶段 */
export const SQUAD_PHASE_TRANSITIONS: Record<SquadPhase, SquadPhase[]> = {
  forming: ["working"],
  working: ["reviewing", "delivering", "dissolving"],
  reviewing: ["working", "delivering"],
  delivering: ["dissolving"],
  dissolving: [],
};

/** 阶段中文标签 */
export const SQUAD_PHASE_LABELS: Record<SquadPhase, string> = {
  forming: "召集中",
  working: "协作中",
  reviewing: "对峙审查",
  delivering: "交付中",
  dissolving: "解散中",
};

/** 阶段对应的视觉主色（hex） */
export const SQUAD_PHASE_COLORS: Record<SquadPhase, string> = {
  forming: "#4BA89A", // 薄荷绿：召集
  working: "#4E72D8", // 蓝：协作
  reviewing: "#C75A4A", // 红：对峙
  delivering: "#E4A84B", // 金：交付
  dissolving: "#8B6CCF", // 紫：解散
};

/** 各阶段需要参与的角色集合 */
export const PHASE_REQUIRED_ROLES: Record<SquadPhase, AgentRoleInSquad[]> = {
  forming: ["lead"],
  working: ["lead", "contributor"],
  reviewing: ["lead", "reviewer"],
  delivering: ["lead", "boundary_keeper"],
  dissolving: ["lead"],
};

/**
 * 校验是否可以从 from 阶段进入 to 阶段。
 */
export function canTransitionTo(from: SquadPhase, to: SquadPhase): boolean {
  return SQUAD_PHASE_TRANSITIONS[from].includes(to);
}

/**
 * 应用阶段转换。返回新的 squad 对象（不可变更新）。
 * 如果转换非法，抛出 Error。
 */
export function transitionSquadPhase(
  squad: DynamicSquad,
  to: SquadPhase,
  now: string
): DynamicSquad {
  if (!canTransitionTo(squad.phase, to)) {
    throw new Error(
      `非法状态转换：${squad.phase} → ${to}（squad ${squad.id}）`
    );
  }
  return {
    ...squad,
    phase: to,
    phaseEnteredAt: now,
    dissolvedAt: to === "dissolving" ? now : squad.dissolvedAt,
  };
}

/**
 * 返回 squad 中担任指定角色的 Agent ID 列表。
 */
export function getAgentsByRole(
  squad: DynamicSquad,
  role: AgentRoleInSquad
): string[] {
  return squad.memberRoles
    .filter((m) => m.role === role)
    .map((m) => m.agentId);
}

/**
 * 检查 squad 在当前阶段是否满足角色要求。
 * 返回缺失的角色数组（空数组表示满足）。
 */
export function missingRolesForPhase(squad: DynamicSquad): AgentRoleInSquad[] {
  const required = PHASE_REQUIRED_ROLES[squad.phase];
  const present = new Set(squad.memberRoles.map((m) => m.role));
  return required.filter((r) => !present.has(r));
}

/**
 * 计算 squad 进度（基于任务列表）。
 * 0-1 之间。dissolving 阶段强制为 1。
 */
export function computeSquadProgress(
  squad: DynamicSquad,
  tasks: Array<{ id: string; progress: number }>
): number {
  if (squad.phase === "dissolving") return 1;
  const squadTasks = tasks.filter((t) => squad.taskIds.includes(t.id));
  if (squadTasks.length === 0) return 0;
  const sum = squadTasks.reduce((acc, t) => acc + t.progress, 0);
  return Math.max(0, Math.min(1, sum / squadTasks.length));
}

/**
 * 根据 squad 状态生成简短的状态说明文案。
 */
export function describeSquadState(squad: DynamicSquad): string {
  const label = SQUAD_PHASE_LABELS[squad.phase];
  const lead = squad.memberRoles.find((m) => m.role === "lead");
  switch (squad.phase) {
    case "forming":
      return `${label}：${lead ? "领队" : "待定"}正在召集临时 Agent`;
    case "working":
      return `${label}：${squad.agentIds.length} 名成员协作中`;
    case "reviewing":
      return `${label}：审查员正在对峙质疑`;
    case "delivering":
      return `${label}：准备向用户交付结果`;
    case "dissolving":
      return `${label}：临时成员已解散，成果已归档`;
  }
}
