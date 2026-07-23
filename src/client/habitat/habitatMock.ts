/**
 * client/habitat/habitatMock.ts — 活动空间 mock 数据工厂
 *
 * 遵循 apiClient.ts 的模式：开发环境 fallback 用。
 * 数据形状与 domain/agentHabitat.ts 保持一致。
 */

import type {
  HabitatSnapshot,
  PersonalGoalContract,
  DynamicTask,
  DynamicSquad,
  UserBoundaryRequest,
  HabitatMemoryArtifact,
  HabitatActivityEvent,
} from "../../domain/agentHabitat";
import { DEFAULT_RESIDENT_AGENTS } from "../../domain/agentHabitat";

export function createMockHabitatSnapshot(): HabitatSnapshot {
  return {
    capturedAt: "2026-07-12T09:24:00+08:00",
    motionPreference: "full",
    residentAgents: [...DEFAULT_RESIDENT_AGENTS].map((a) => ({
      ...a,
      state: a.residentKind === "memory" ? "consolidating_memory" : "idle",
      stateReason: a.residentKind === "memory"
        ? "正在整理最近完成的目标"
        : a.residentKind === "guardian"
          ? "当前没有等待批准的高影响行动"
          : "等待新的需求或后台目标更新",
    })),
    ephemeralAgents: [
      {
        id: "eph-trip-search",
        tenure: "ephemeral",
        name: "行程探索",
        purpose: "比较可退改航班",
        accent: "#4BA89A",
        toolSymbol: "search",
        state: "working",
        stateReason: "正在比较航班",
        currentMotion: "exchange_evidence",
        createdForGoalId: "goal-trip",
        expiresWhen: "task_completed",
      },
      {
        id: "eph-trip-budget",
        tenure: "ephemeral",
        name: "预算比较",
        purpose: "多平台比价分析",
        accent: "#4BA89A",
        toolSymbol: "calculator",
        state: "working",
        stateReason: "进行中",
        currentMotion: "exchange_evidence",
        createdForGoalId: "goal-trip",
        expiresWhen: "task_completed",
      },
      {
        id: "eph-trip-weather",
        tenure: "ephemeral",
        name: "天气与路线",
        purpose: "天气趋势分析与影响评估",
        accent: "#4BA89A",
        toolSymbol: "cloud",
        state: "working",
        stateReason: "进行中",
        currentMotion: "approach_squad",
        createdForGoalId: "goal-trip",
        expiresWhen: "task_completed",
      },
    ],
    goals: [createMockGoal()],
    tasks: createMockTasks(),
    squads: [createMockSquad()],
    userRequests: [createMockUserRequest()],
    memories: createMockMemories(),
    activity: createMockActivity(),
  };
}

function createMockGoal(): PersonalGoalContract {
  return {
    id: "goal-trip",
    need: "规划下周的出差，并自动处理预订与提醒",
    desiredOutcome: "完成出差行程规划、航班预订、酒店安排和日程提醒",
    successMeasures: [
      { label: "航班已预订", target: "可退改直飞航班", current: "已锁定 3 个候选" },
      { label: "酒店已预订", target: "靠近地铁站 ¥400-600/晚" },
      { label: "日程已同步", target: "日历事件已创建" },
    ],
    deadline: "2026-07-18",
    budget: { currency: "CNY", limit: 5000, spent: 1280 },
    autonomy: "ask_before_action",
    allowedActions: ["search_flights", "search_hotels", "create_calendar_event"],
    forbiddenActions: ["auto_payment_over_2000"],
    assumptions: ["出差地点为上海", "单程航班", "无需签证"],
    status: "active",
  };
}

function createMockTasks(): DynamicTask[] {
  return [
    {
      id: "task-understand",
      goalId: "goal-trip",
      title: "理解需求与约束",
      rationale: "管家接收需求后拆解核心要素",
      status: "completed",
      assignedAgentIds: ["resident-steward"],
      dependsOn: [],
      evidenceIds: [],
      progress: 1,
    },
    {
      id: "task-search",
      goalId: "goal-trip",
      title: "行程探索 - 比较可退改航班",
      rationale: "寻找符合预算和退改要求的行程",
      status: "running",
      assignedAgentIds: ["eph-trip-search"],
      dependsOn: ["task-understand"],
      evidenceIds: ["ev-flight-1", "ev-flight-2"],
      progress: 0.78,
    },
    {
      id: "task-budget",
      goalId: "goal-trip",
      title: "预算比较 - 多平台比价分析",
      rationale: "跨平台比较价格和退改政策",
      status: "running",
      assignedAgentIds: ["eph-trip-budget"],
      dependsOn: ["task-understand"],
      evidenceIds: [],
      progress: 0.65,
    },
    {
      id: "task-weather",
      goalId: "goal-trip",
      title: "天气与路线 - 趋势分析与影响评估",
      rationale: "评估天气对行程的影响",
      status: "running",
      assignedAgentIds: ["eph-trip-weather"],
      dependsOn: ["task-understand"],
      evidenceIds: [],
      progress: 0.40,
    },
    {
      id: "task-book",
      goalId: "goal-trip",
      title: "预订执行 - 等待安全审批",
      rationale: "需要守门人审批后执行预订",
      status: "waiting",
      assignedAgentIds: ["resident-guardian"],
      dependsOn: ["task-search", "task-budget"],
      evidenceIds: [],
      progress: 0.23,
    },
    {
      id: "task-memory",
      goalId: "goal-trip",
      title: "记忆沉淀 - 偏好学习与成果归档",
      rationale: "将本次偏好和成果存入长期记忆",
      status: "queued",
      assignedAgentIds: ["resident-memory"],
      dependsOn: ["task-book"],
      evidenceIds: [],
      progress: 0,
    },
  ];
}

function createMockSquad(): DynamicSquad {
  return {
    id: "squad-trip",
    goalId: "goal-trip",
    label: "出差规划小队",
    objective: "完成出差行程规划与预订",
    agentIds: [
      "resident-steward",
      "resident-planner",
      "eph-trip-search",
      "eph-trip-budget",
      "eph-trip-weather",
      "resident-guardian",
    ],
    taskIds: ["task-understand", "task-search", "task-budget", "task-weather"],
    formedAt: "2026-07-12T09:24:00+08:00",
    dissolveWhenComplete: true,
    phase: "working",
    phaseEnteredAt: "2026-07-12T09:30:00+08:00",
    leadAgentId: "resident-planner",
    memberRoles: [
      { agentId: "resident-planner", role: "lead", joinedAt: "2026-07-12T09:24:00+08:00" },
      { agentId: "resident-steward", role: "boundary_keeper", joinedAt: "2026-07-12T09:24:10+08:00" },
      { agentId: "eph-trip-search", role: "contributor", joinedAt: "2026-07-12T09:25:00+08:00" },
      { agentId: "eph-trip-budget", role: "contributor", joinedAt: "2026-07-12T09:25:30+08:00" },
      { agentId: "eph-trip-weather", role: "contributor", joinedAt: "2026-07-12T09:26:00+08:00" },
      { agentId: "resident-guardian", role: "reviewer", joinedAt: "2026-07-12T09:28:00+08:00" },
    ],
    hasAdversarialReview: false,
  };
}

function createMockUserRequest(): UserBoundaryRequest {
  return {
    id: "req-001",
    goalId: "goal-trip",
    requestingAgentId: "resident-guardian",
    kind: "permission",
    question: "是否预订 ¥1,280 的可退改航班？",
    whyNow: "3 个免费来源数据冲突，需确认最终选择",
    attempted: [
      "比较了 18 个航班",
      "排除了 6 个不可退改方案",
      "筛选出符合直飞偏好的 3 个候选",
    ],
    recommendation: {
      label: "建议预订",
      reason: "比最低价贵 ¥120，但能减少 2 小时转机，符合优先直飞偏好",
      confidence: 0.82,
    },
    consequencesOfNoResponse: "航班价格可能上涨，最佳选择可能被预订",
    deadline: "2026-07-12T12:00:00+08:00",
    reversible: true,
    autonomyOffer: {
      label: "以后类似情况自动处理",
      proposedLevel: "auto_within_limits",
      limitDescription: "预算 ¥1,500 以内的可退改航班自动预订",
    },
  };
}

function createMockMemories(): HabitatMemoryArtifact[] {
  return [
    {
      id: "mem-001",
      goalId: "goal-trip",
      kind: "preference",
      statement: "出差航班优先直飞，价格差低于 ¥200 时不选择转机",
      learnedFrom: ["task-search"],
      confidence: 0.95,
      userConfirmed: true,
      createdAt: "2026-07-12T09:30:00+08:00",
    },
    {
      id: "mem-002",
      goalId: "goal-trip",
      kind: "preference",
      statement: "酒店预订偏好靠近地铁站，预算 ¥400-600/晚",
      learnedFrom: ["task-search"],
      confidence: 0.90,
      userConfirmed: true,
      createdAt: "2026-07-12T09:32:00+08:00",
    },
    {
      id: "mem-003",
      goalId: "goal-trip",
      kind: "result",
      statement: "已预订 7 月 15 日北京→上海直飞航班，节省 ¥320 并减少 2 小时转机",
      learnedFrom: ["task-search", "task-book"],
      confidence: 1.0,
      userConfirmed: true,
      createdAt: "2026-07-12T18:00:00+08:00",
    },
    {
      id: "mem-004",
      goalId: "goal-trip",
      kind: "result",
      statement: "已生成出差行程单并发送至日历，包含航班、酒店和会议提醒",
      learnedFrom: ["task-memory"],
      confidence: 1.0,
      userConfirmed: true,
      createdAt: "2026-07-12T21:00:00+08:00",
    },
    {
      id: "mem-005",
      goalId: "goal-trip",
      kind: "rule",
      statement: "当航班价格在预算 ¥1,500 以内且可退改时，自动预订无需询问",
      learnedFrom: ["task-book"],
      confidence: 0.88,
      userConfirmed: true,
      createdAt: "2026-07-12T18:30:00+08:00",
    },
    {
      id: "mem-006",
      goalId: "goal-trip",
      kind: "rule",
      statement: "出差前 24 小时自动检查天气，如遇极端天气预警则通知用户",
      learnedFrom: ["task-weather"],
      confidence: 0.82,
      userConfirmed: false,
      createdAt: "2026-07-12T15:30:00+08:00",
    },
    {
      id: "mem-007",
      goalId: "goal-trip",
      kind: "procedure",
      statement: "出差规划标准流程：理解需求→航班搜索→酒店比价→天气评估→预订审批→记忆沉淀",
      learnedFrom: ["task-understand", "task-search", "task-budget", "task-weather", "task-book", "task-memory"],
      confidence: 0.92,
      userConfirmed: true,
      createdAt: "2026-07-12T21:10:00+08:00",
    },
  ];
}

function createMockActivity(): HabitatActivityEvent[] {
  return [
    { id: "act-001", goalId: "goal-trip", kind: "memory_consolidated", actorId: "resident-memory", summary: "沉淀 15 条新记忆", occurredAt: "2026-07-12T00:30:00+08:00", important: false },
    { id: "act-002", goalId: "goal-trip", kind: "agent_created", actorId: "eph-trip-search", summary: "行程探索 Agent 创建", occurredAt: "2026-07-12T03:00:00+08:00", important: false },
    { id: "act-003", goalId: "goal-trip", kind: "result_delivered", actorId: "eph-trip-budget", summary: "预算比较完成", occurredAt: "2026-07-12T05:30:00+08:00", important: false },
    { id: "act-004", goalId: "goal-trip", kind: "need_received", actorId: "resident-steward", summary: "你提出了新需求：规划下周出差", occurredAt: "2026-07-12T09:24:00+08:00", important: true },
    { id: "act-005", goalId: "goal-trip", kind: "decision_requested", actorId: "resident-guardian", summary: "守门人 Agent 请求审批航班预订", occurredAt: "2026-07-12T12:30:00+08:00", important: true },
    { id: "act-006", goalId: "goal-trip", kind: "agent_created", actorId: "eph-trip-weather", summary: "天气与路线 Agent 创建", occurredAt: "2026-07-12T15:00:00+08:00", important: false },
    { id: "act-007", goalId: "goal-trip", kind: "action_executed", actorId: "resident-guardian", summary: "预订成功，已锁定航班", occurredAt: "2026-07-12T18:00:00+08:00", important: false },
    { id: "act-008", goalId: "goal-trip", kind: "memory_consolidated", actorId: "resident-memory", summary: "本次出差偏好已存入记忆", occurredAt: "2026-07-12T21:00:00+08:00", important: false },
  ];
}
