/**
 * Personal Agent Habitat domain contract.
 *
 * This layer describes the product-facing, dynamic personal swarm. It does not
 * replace the deterministic intelligence pipeline; an ephemeral habitat agent
 * may delegate work to that pipeline as one of its capabilities.
 */

export type ResidentAgentKind = "steward" | "planner" | "memory" | "guardian";
export type AgentTenure = "resident" | "ephemeral";
export type HabitatAgentState =
  | "idle"
  | "understanding"
  | "planning"
  | "working"
  | "collaborating"
  | "waiting_for_user"
  | "blocked"
  | "handoff"
  | "consolidating_memory"
  | "dissolving";

export type AutonomyLevel =
  | "observe_only"
  | "prepare_draft"
  | "ask_before_action"
  | "auto_within_limits"
  | "denied";

export type HabitatActivityKind =
  | "need_received"
  | "need_clarified"
  | "goal_confirmed"
  | "agent_created"
  | "agent_joined_squad"
  | "evidence_shared"
  | "tool_called"
  | "decision_requested"
  | "action_executed"
  | "result_delivered"
  | "memory_consolidated"
  | "agent_dissolved";

export type MotionPreference = "full" | "reduced" | "none";
export type MotionCue =
  | "breathe"
  | "turn_to_need"
  | "materialize"
  | "approach_squad"
  | "exchange_evidence"
  | "approach_user_boundary"
  | "place_result_in_memory"
  | "dissolve";

export interface AgentIdentity {
  id: string;
  tenure: AgentTenure;
  residentKind?: ResidentAgentKind;
  name: string;
  purpose: string;
  accent: string;
  toolSymbol: string;
  state: HabitatAgentState;
  stateReason: string;
  currentMotion: MotionCue;
  createdForGoalId?: string;
  expiresWhen?: "goal_completed" | "task_completed" | "manual";
}

export interface PersonalGoalContract {
  id: string;
  need: string;
  desiredOutcome: string;
  successMeasures: Array<{ label: string; target: string; current?: string }>;
  deadline?: string;
  budget?: { currency: "CNY" | "USD"; limit: number; spent: number };
  autonomy: AutonomyLevel;
  allowedActions: string[];
  forbiddenActions: string[];
  assumptions: string[];
  status: "draft" | "clarifying" | "active" | "waiting_for_user" | "completed" | "cancelled";
}

export interface DynamicTask {
  id: string;
  goalId: string;
  title: string;
  rationale: string;
  status: "queued" | "running" | "waiting" | "blocked" | "completed";
  assignedAgentIds: string[];
  dependsOn: string[];
  evidenceIds: string[];
  progress: number;
}

/** Squad 5 阶段生命周期 */
export type SquadPhase =
  | "forming"
  | "working"
  | "reviewing"
  | "delivering"
  | "dissolving";

/** Agent 在 squad 中的角色 */
export type AgentRoleInSquad =
  | "lead"
  | "contributor"
  | "reviewer"
  | "boundary_keeper";

/** Squad 成员关系 */
export interface SquadMemberRole {
  agentId: string;
  role: AgentRoleInSquad;
  joinedAt: string;
}

export interface DynamicSquad {
  id: string;
  goalId: string;
  label: string;
  objective: string;
  agentIds: string[];
  taskIds: string[];
  formedAt: string;
  dissolveWhenComplete: boolean;
  /** 当前生命周期阶段 */
  phase: SquadPhase;
  /** 阶段进入时间（ISO） */
  phaseEnteredAt: string;
  /** 小队领队 Agent ID（通常是 planner 或 steward） */
  leadAgentId: string;
  /** 成员角色映射 */
  memberRoles: SquadMemberRole[];
  /** 是否处于对峙状态（devils_advocate 触发） */
  hasAdversarialReview: boolean;
  /** 解散时间（dissolving/dissolved 后填充） */
  dissolvedAt?: string;
}

export interface UserBoundaryRequest {
  id: string;
  goalId: string;
  requestingAgentId: string;
  kind: "clarification" | "choice" | "permission" | "budget" | "external_action";
  question: string;
  whyNow: string;
  attempted: string[];
  recommendation?: { label: string; reason: string; confidence: number };
  consequencesOfNoResponse: string;
  deadline?: string;
  reversible: boolean;
  autonomyOffer?: { label: string; proposedLevel: AutonomyLevel; limitDescription: string };
}

export interface HabitatMemoryArtifact {
  id: string;
  goalId: string;
  kind: "preference" | "result" | "rule" | "relationship" | "procedure";
  statement: string;
  learnedFrom: string[];
  confidence: number;
  userConfirmed: boolean;
  createdAt: string;
}

export interface HabitatActivityEvent {
  id: string;
  goalId: string;
  kind: HabitatActivityKind;
  actorId: string;
  summary: string;
  occurredAt: string;
  important: boolean;
}

export interface HabitatSnapshot {
  capturedAt: string;
  motionPreference: MotionPreference;
  residentAgents: AgentIdentity[];
  ephemeralAgents: AgentIdentity[];
  goals: PersonalGoalContract[];
  tasks: DynamicTask[];
  squads: DynamicSquad[];
  userRequests: UserBoundaryRequest[];
  memories: HabitatMemoryArtifact[];
  activity: HabitatActivityEvent[];
}

export const DEFAULT_RESIDENT_AGENTS: readonly AgentIdentity[] = [
  {
    id: "resident-steward",
    tenure: "resident",
    residentKind: "steward",
    name: "管家",
    purpose: "理解需求、保持长期关系并向用户交付结果",
    accent: "#E4A84B",
    toolSymbol: "compass",
    state: "idle",
    stateReason: "等待新的需求或后台目标更新",
    currentMotion: "breathe",
  },
  {
    id: "resident-planner",
    tenure: "resident",
    residentKind: "planner",
    name: "规划者",
    purpose: "拆解目标、形成动态任务并组织临时小队",
    accent: "#4E72D8",
    toolSymbol: "blueprint",
    state: "idle",
    stateReason: "没有需要重新规划的活动目标",
    currentMotion: "breathe",
  },
  {
    id: "resident-memory",
    tenure: "resident",
    residentKind: "memory",
    name: "记忆者",
    purpose: "沉淀偏好、成果、关系与可复用流程",
    accent: "#8B6CCF",
    toolSymbol: "archive",
    state: "consolidating_memory",
    stateReason: "正在整理最近完成的目标",
    currentMotion: "place_result_in_memory",
  },
  {
    id: "resident-guardian",
    tenure: "resident",
    residentKind: "guardian",
    name: "守门人",
    purpose: "检查隐私、预算、权限和外部行动风险",
    accent: "#C75A4A",
    toolSymbol: "shield",
    state: "idle",
    stateReason: "当前没有等待批准的高影响行动",
    currentMotion: "breathe",
  },
] as const;

export function validateHabitatSnapshot(snapshot: HabitatSnapshot): string[] {
  const issues: string[] = [];
  const agentIds = new Set(snapshot.residentAgents.map((agent) => agent.id));

  for (const agent of snapshot.ephemeralAgents) {
    if (!agent.createdForGoalId) issues.push(`Ephemeral agent ${agent.id} is missing createdForGoalId.`);
    if (!agent.expiresWhen) issues.push(`Ephemeral agent ${agent.id} is missing expiresWhen.`);
    if (agent.residentKind) issues.push(`Ephemeral agent ${agent.id} must not declare residentKind.`);
    if (agentIds.has(agent.id)) issues.push(`Duplicate agent id: ${agent.id}.`);
    agentIds.add(agent.id);
  }

  for (const task of snapshot.tasks) {
    if (task.progress < 0 || task.progress > 1) issues.push(`Task ${task.id} progress must be between 0 and 1.`);
    for (const agentId of task.assignedAgentIds) {
      if (!agentIds.has(agentId)) issues.push(`Task ${task.id} references unknown agent ${agentId}.`);
    }
  }

  for (const request of snapshot.userRequests) {
    if (!agentIds.has(request.requestingAgentId)) {
      issues.push(`User request ${request.id} references unknown agent ${request.requestingAgentId}.`);
    }
    if (request.recommendation && (request.recommendation.confidence < 0 || request.recommendation.confidence > 1)) {
      issues.push(`User request ${request.id} confidence must be between 0 and 1.`);
    }
  }

  return issues;
}
