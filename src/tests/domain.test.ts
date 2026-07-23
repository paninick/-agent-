/**
 * domain.test.ts - 领域层单元测试
 *
 * 覆盖 src/domain/ 下的纯函数：
 * - agentHabitat.ts: DEFAULT_RESIDENT_AGENTS, validateHabitatSnapshot
 * - squadLifecycle.ts: 状态机转换、角色校验、进度计算、状态描述
 * - common.ts: createAppError
 */

import { describe, it, expect } from "vitest";
import {
  DEFAULT_RESIDENT_AGENTS,
  validateHabitatSnapshot,
  type HabitatSnapshot,
  type DynamicSquad,
} from "../domain/agentHabitat";
import {
  SQUAD_PHASE_TRANSITIONS,
  SQUAD_PHASE_LABELS,
  SQUAD_PHASE_COLORS,
  PHASE_REQUIRED_ROLES,
  canTransitionTo,
  transitionSquadPhase,
  getAgentsByRole,
  missingRolesForPhase,
  computeSquadProgress,
  describeSquadState,
} from "../domain/squadLifecycle";
import { createAppError } from "../domain/common";

// ============ Helper Factories ============

function createMockSquad(overrides: Partial<DynamicSquad> = {}): DynamicSquad {
  return {
    id: "squad-test",
    goalId: "goal-1",
    label: "测试小队",
    objective: "测试目标",
    agentIds: ["a1", "a2", "a3"],
    taskIds: ["t1", "t2"],
    formedAt: "2026-07-12T10:00:00+08:00",
    dissolveWhenComplete: true,
    phase: "working",
    phaseEnteredAt: "2026-07-12T10:05:00+08:00",
    leadAgentId: "a1",
    memberRoles: [
      { agentId: "a1", role: "lead", joinedAt: "2026-07-12T10:00:00+08:00" },
      { agentId: "a2", role: "contributor", joinedAt: "2026-07-12T10:01:00+08:00" },
      { agentId: "a3", role: "reviewer", joinedAt: "2026-07-12T10:02:00+08:00" },
    ],
    hasAdversarialReview: false,
    ...overrides,
  };
}

function createMinimalSnapshot(overrides: Partial<HabitatSnapshot> = {}): HabitatSnapshot {
  return {
    capturedAt: "2026-07-12T10:00:00+08:00",
    motionPreference: "full",
    residentAgents: [...DEFAULT_RESIDENT_AGENTS].map((a) => ({ ...a })),
    ephemeralAgents: [],
    goals: [],
    tasks: [],
    squads: [],
    userRequests: [],
    memories: [],
    activity: [],
    ...overrides,
  };
}

// ============ agentHabitat.ts ============

describe("DEFAULT_RESIDENT_AGENTS", () => {
  it("应包含 4 个常驻 Agent", () => {
    expect(DEFAULT_RESIDENT_AGENTS).toHaveLength(4);
  });

  it("每个常驻 Agent 应有完整字段", () => {
    for (const agent of DEFAULT_RESIDENT_AGENTS) {
      expect(agent.id).toBeTruthy();
      expect(agent.tenure).toBe("resident");
      expect(agent.residentKind).toBeTruthy();
      expect(agent.name).toBeTruthy();
      expect(agent.purpose).toBeTruthy();
      expect(agent.accent).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(agent.toolSymbol).toBeTruthy();
      expect(agent.state).toBeTruthy();
      expect(agent.stateReason).toBeTruthy();
      expect(agent.currentMotion).toBeTruthy();
    }
  });

  it("应覆盖 4 种 residentKind", () => {
    const kinds = new Set(DEFAULT_RESIDENT_AGENTS.map((a) => a.residentKind));
    expect(kinds).toEqual(new Set(["steward", "planner", "memory", "guardian"]));
  });

  it("Agent ID 应唯一", () => {
    const ids = DEFAULT_RESIDENT_AGENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("validateHabitatSnapshot", () => {
  it("空快照应返回无问题", () => {
    const issues = validateHabitatSnapshot(createMinimalSnapshot());
    expect(issues).toEqual([]);
  });

  it("临时 Agent 缺少 createdForGoalId 应报告问题", () => {
    const snapshot = createMinimalSnapshot({
      ephemeralAgents: [
        {
          id: "eph-1",
          tenure: "ephemeral",
          name: "临时",
          purpose: "测试",
          accent: "#4BA89A",
          toolSymbol: "search",
          state: "working",
          stateReason: "进行中",
          currentMotion: "exchange_evidence",
          expiresWhen: "task_completed",
        },
      ],
    });
    const issues = validateHabitatSnapshot(snapshot);
    expect(issues.some((i) => i.includes("createdForGoalId"))).toBe(true);
  });

  it("临时 Agent 缺少 expiresWhen 应报告问题", () => {
    const snapshot = createMinimalSnapshot({
      ephemeralAgents: [
        {
          id: "eph-1",
          tenure: "ephemeral",
          name: "临时",
          purpose: "测试",
          accent: "#4BA89A",
          toolSymbol: "search",
          state: "working",
          stateReason: "进行中",
          currentMotion: "exchange_evidence",
          createdForGoalId: "goal-1",
        },
      ],
    });
    const issues = validateHabitatSnapshot(snapshot);
    expect(issues.some((i) => i.includes("expiresWhen"))).toBe(true);
  });

  it("临时 Agent 声明 residentKind 应报告问题", () => {
    const snapshot = createMinimalSnapshot({
      ephemeralAgents: [
        {
          id: "eph-1",
          tenure: "ephemeral",
          residentKind: "steward",
          name: "临时",
          purpose: "测试",
          accent: "#4BA89A",
          toolSymbol: "search",
          state: "working",
          stateReason: "进行中",
          currentMotion: "exchange_evidence",
          createdForGoalId: "goal-1",
          expiresWhen: "task_completed",
        },
      ],
    });
    const issues = validateHabitatSnapshot(snapshot);
    expect(issues.some((i) => i.includes("residentKind"))).toBe(true);
  });

  it("重复 Agent ID 应报告问题", () => {
    const snapshot = createMinimalSnapshot({
      ephemeralAgents: [
        {
          id: "resident-steward",
          tenure: "ephemeral",
          name: "临时",
          purpose: "测试",
          accent: "#4BA89A",
          toolSymbol: "search",
          state: "working",
          stateReason: "进行中",
          currentMotion: "exchange_evidence",
          createdForGoalId: "goal-1",
          expiresWhen: "task_completed",
        },
      ],
    });
    const issues = validateHabitatSnapshot(snapshot);
    expect(issues.some((i) => i.includes("Duplicate"))).toBe(true);
  });

  it("任务进度越界应报告问题", () => {
    const snapshot = createMinimalSnapshot({
      tasks: [
        {
          id: "t1",
          goalId: "g1",
          title: "任务",
          rationale: "理由",
          status: "running",
          assignedAgentIds: [],
          dependsOn: [],
          evidenceIds: [],
          progress: 1.5,
        },
      ],
    });
    const issues = validateHabitatSnapshot(snapshot);
    expect(issues.some((i) => i.includes("progress"))).toBe(true);
  });

  it("任务引用未知 Agent 应报告问题", () => {
    const snapshot = createMinimalSnapshot({
      tasks: [
        {
          id: "t1",
          goalId: "g1",
          title: "任务",
          rationale: "理由",
          status: "running",
          assignedAgentIds: ["unknown-agent"],
          dependsOn: [],
          evidenceIds: [],
          progress: 0.5,
        },
      ],
    });
    const issues = validateHabitatSnapshot(snapshot);
    expect(issues.some((i) => i.includes("unknown agent"))).toBe(true);
  });

  it("用户请求引用未知 Agent 应报告问题", () => {
    const snapshot = createMinimalSnapshot({
      userRequests: [
        {
          id: "req-1",
          goalId: "g1",
          requestingAgentId: "unknown-agent",
          kind: "permission",
          question: "是否执行？",
          whyNow: "需要确认",
          attempted: [],
          consequencesOfNoResponse: "无",
          reversible: true,
        },
      ],
    });
    const issues = validateHabitatSnapshot(snapshot);
    expect(issues.some((i) => i.includes("unknown agent"))).toBe(true);
  });

  it("推荐置信度越界应报告问题", () => {
    const snapshot = createMinimalSnapshot({
      userRequests: [
        {
          id: "req-1",
          goalId: "g1",
          requestingAgentId: "resident-steward",
          kind: "permission",
          question: "是否执行？",
          whyNow: "需要确认",
          attempted: [],
          recommendation: { label: "建议", reason: "理由", confidence: 1.5 },
          consequencesOfNoResponse: "无",
          reversible: true,
        },
      ],
    });
    const issues = validateHabitatSnapshot(snapshot);
    expect(issues.some((i) => i.includes("confidence"))).toBe(true);
  });
});

// ============ squadLifecycle.ts - 常量 ============

describe("SQUAD_PHASE_TRANSITIONS", () => {
  it("forming 只能进入 working", () => {
    expect(SQUAD_PHASE_TRANSITIONS.forming).toEqual(["working"]);
  });

  it("working 可进入 reviewing/delivering/dissolving", () => {
    expect(SQUAD_PHASE_TRANSITIONS.working).toEqual(
      expect.arrayContaining(["reviewing", "delivering", "dissolving"])
    );
    expect(SQUAD_PHASE_TRANSITIONS.working).toHaveLength(3);
  });

  it("reviewing 可回到 working 或进入 delivering", () => {
    expect(SQUAD_PHASE_TRANSITIONS.reviewing).toEqual(
      expect.arrayContaining(["working", "delivering"])
    );
  });

  it("delivering 只能进入 dissolving", () => {
    expect(SQUAD_PHASE_TRANSITIONS.delivering).toEqual(["dissolving"]);
  });

  it("dissolving 是终态（无后续转换）", () => {
    expect(SQUAD_PHASE_TRANSITIONS.dissolving).toEqual([]);
  });
});

describe("SQUAD_PHASE_LABELS", () => {
  it("每个阶段都有中文标签", () => {
    expect(SQUAD_PHASE_LABELS.forming).toBe("召集中");
    expect(SQUAD_PHASE_LABELS.working).toBe("协作中");
    expect(SQUAD_PHASE_LABELS.reviewing).toBe("对峙审查");
    expect(SQUAD_PHASE_LABELS.delivering).toBe("交付中");
    expect(SQUAD_PHASE_LABELS.dissolving).toBe("解散中");
  });
});

describe("SQUAD_PHASE_COLORS", () => {
  it("每个阶段都有 hex 颜色", () => {
    for (const phase of ["forming", "working", "reviewing", "delivering", "dissolving"] as const) {
      expect(SQUAD_PHASE_COLORS[phase]).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
});

describe("PHASE_REQUIRED_ROLES", () => {
  it("所有阶段都需要 lead", () => {
    for (const phase of ["forming", "working", "reviewing", "delivering", "dissolving"] as const) {
      expect(PHASE_REQUIRED_ROLES[phase]).toContain("lead");
    }
  });

  it("working 需要 contributor", () => {
    expect(PHASE_REQUIRED_ROLES.working).toContain("contributor");
  });

  it("reviewing 需要 reviewer", () => {
    expect(PHASE_REQUIRED_ROLES.reviewing).toContain("reviewer");
  });

  it("delivering 需要 boundary_keeper", () => {
    expect(PHASE_REQUIRED_ROLES.delivering).toContain("boundary_keeper");
  });
});

// ============ squadLifecycle.ts - 函数 ============

describe("canTransitionTo", () => {
  it("forming → working 应为合法", () => {
    expect(canTransitionTo("forming", "working")).toBe(true);
  });

  it("forming → delivering 应为非法（需先经过 working）", () => {
    expect(canTransitionTo("forming", "delivering")).toBe(false);
  });

  it("working → reviewing 应为合法", () => {
    expect(canTransitionTo("working", "reviewing")).toBe(true);
  });

  it("reviewing → working 应为合法（可回退修改）", () => {
    expect(canTransitionTo("reviewing", "working")).toBe(true);
  });

  it("dissolving → 任何阶段 都应为非法（终态）", () => {
    expect(canTransitionTo("dissolving", "forming")).toBe(false);
    expect(canTransitionTo("dissolving", "working")).toBe(false);
  });

  it("delivering → working 应为非法（不可回退）", () => {
    expect(canTransitionTo("delivering", "working")).toBe(false);
  });
});

describe("transitionSquadPhase", () => {
  it("合法转换应返回新 squad 对象（不可变）", () => {
    const squad = createMockSquad({ phase: "forming" });
    const result = transitionSquadPhase(squad, "working", "2026-07-12T11:00:00+08:00");
    expect(result.phase).toBe("working");
    expect(result.phaseEnteredAt).toBe("2026-07-12T11:00:00+08:00");
    expect(squad.phase).toBe("forming"); // 原对象不变
  });

  it("非法转换应抛出 Error", () => {
    const squad = createMockSquad({ phase: "forming" });
    expect(() => transitionSquadPhase(squad, "dissolving", "now")).toThrow(/非法状态转换/);
  });

  it("进入 dissolving 应设置 dissolvedAt", () => {
    const squad = createMockSquad({ phase: "delivering" });
    const result = transitionSquadPhase(squad, "dissolving", "2026-07-12T12:00:00+08:00");
    expect(result.dissolvedAt).toBe("2026-07-12T12:00:00+08:00");
  });

  it("非 dissolving 转换不应修改 dissolvedAt", () => {
    const squad = createMockSquad({ phase: "forming", dissolvedAt: undefined });
    const result = transitionSquadPhase(squad, "working", "now");
    expect(result.dissolvedAt).toBeUndefined();
  });

  it("保留原有 dissolvedAt（如果已存在）", () => {
    const squad = createMockSquad({
      phase: "reviewing",
      dissolvedAt: "2026-07-12T09:00:00+08:00",
    });
    const result = transitionSquadPhase(squad, "delivering", "now");
    expect(result.dissolvedAt).toBe("2026-07-12T09:00:00+08:00");
  });
});

describe("getAgentsByRole", () => {
  it("返回指定角色的 Agent ID 列表", () => {
    const squad = createMockSquad();
    expect(getAgentsByRole(squad, "lead")).toEqual(["a1"]);
    expect(getAgentsByRole(squad, "contributor")).toEqual(["a2"]);
    expect(getAgentsByRole(squad, "reviewer")).toEqual(["a3"]);
  });

  it("无匹配角色时返回空数组", () => {
    const squad = createMockSquad();
    expect(getAgentsByRole(squad, "boundary_keeper")).toEqual([]);
  });

  it("多个同角色成员应全部返回", () => {
    const squad = createMockSquad({
      memberRoles: [
        { agentId: "a1", role: "contributor", joinedAt: "t1" },
        { agentId: "a2", role: "contributor", joinedAt: "t2" },
        { agentId: "a3", role: "lead", joinedAt: "t3" },
      ],
    });
    expect(getAgentsByRole(squad, "contributor")).toEqual(["a1", "a2"]);
  });
});

describe("missingRolesForPhase", () => {
  it("所有必需角色都存在时返回空数组", () => {
    const squad = createMockSquad({ phase: "working" });
    // working 需要 lead + contributor，mock 已包含
    expect(missingRolesForPhase(squad)).toEqual([]);
  });

  it("reviewing 阶段缺少 reviewer 时应报告", () => {
    const squad = createMockSquad({
      phase: "reviewing",
      memberRoles: [
        { agentId: "a1", role: "lead", joinedAt: "t1" },
      ],
    });
    const missing = missingRolesForPhase(squad);
    expect(missing).toContain("reviewer");
  });

  it("delivering 阶段缺少 boundary_keeper 时应报告", () => {
    const squad = createMockSquad({
      phase: "delivering",
      memberRoles: [
        { agentId: "a1", role: "lead", joinedAt: "t1" },
      ],
    });
    const missing = missingRolesForPhase(squad);
    expect(missing).toContain("boundary_keeper");
  });

  it("forming 阶段只需 lead", () => {
    const squad = createMockSquad({
      phase: "forming",
      memberRoles: [
        { agentId: "a1", role: "lead", joinedAt: "t1" },
      ],
    });
    expect(missingRolesForPhase(squad)).toEqual([]);
  });
});

describe("computeSquadProgress", () => {
  it("dissolving 阶段强制返回 1", () => {
    const squad = createMockSquad({ phase: "dissolving" });
    expect(computeSquadProgress(squad, [])).toBe(1);
  });

  it("无任务时返回 0", () => {
    const squad = createMockSquad({ taskIds: [] });
    expect(computeSquadProgress(squad, [])).toBe(0);
  });

  it("计算任务平均进度", () => {
    const squad = createMockSquad({ taskIds: ["t1", "t2"] });
    const tasks = [
      { id: "t1", progress: 0.8 },
      { id: "t2", progress: 0.4 },
    ];
    expect(computeSquadProgress(squad, tasks)).toBeCloseTo(0.6, 5);
  });

  it("忽略不属于 squad 的任务", () => {
    const squad = createMockSquad({ taskIds: ["t1"] });
    const tasks = [
      { id: "t1", progress: 0.6 },
      { id: "t_other", progress: 1.0 },
    ];
    expect(computeSquadProgress(squad, tasks)).toBeCloseTo(0.6, 5);
  });

  it("进度被 clamp 到 [0, 1]", () => {
    const squad = createMockSquad({ taskIds: ["t1"] });
    const tasks = [{ id: "t1", progress: 1.5 }];
    expect(computeSquadProgress(squad, tasks)).toBe(1);
  });
});

describe("describeSquadState", () => {
  it("forming 阶段描述包含领队信息", () => {
    const squad = createMockSquad({ phase: "forming" });
    const desc = describeSquadState(squad);
    expect(desc).toContain("召集中");
    expect(desc).toContain("领队");
  });

  it("forming 阶段无领队时显示待定", () => {
    const squad = createMockSquad({
      phase: "forming",
      memberRoles: [{ agentId: "a1", role: "contributor", joinedAt: "t1" }],
    });
    const desc = describeSquadState(squad);
    expect(desc).toContain("待定");
  });

  it("working 阶段描述成员数量", () => {
    const squad = createMockSquad({ phase: "working", agentIds: ["a1", "a2", "a3", "a4"] });
    const desc = describeSquadState(squad);
    expect(desc).toContain("4");
    expect(desc).toContain("协作中");
  });

  it("reviewing 阶段描述对峙质疑", () => {
    const squad = createMockSquad({ phase: "reviewing" });
    expect(describeSquadState(squad)).toContain("对峙审查");
  });

  it("delivering 阶段描述交付", () => {
    const squad = createMockSquad({ phase: "delivering" });
    expect(describeSquadState(squad)).toContain("交付中");
  });

  it("dissolving 阶段描述解散归档", () => {
    const squad = createMockSquad({ phase: "dissolving" });
    expect(describeSquadState(squad)).toContain("解散中");
  });
});

// ============ common.ts ============

describe("createAppError", () => {
  it("创建可恢复错误（含 fallback）", () => {
    const err = createAppError(
      "TIMEOUT",
      "请求超时",
      "weather-api",
      true,
      "使用缓存数据"
    );
    expect(err.code).toBe("TIMEOUT");
    expect(err.message).toBe("请求超时");
    expect(err.source).toBe("weather-api");
    expect(err.recoverable).toBe(true);
    expect(err.fallback).toBe("使用缓存数据");
  });

  it("创建不可恢复错误（无 fallback）", () => {
    const err = createAppError("FATAL", "致命错误", "core", false);
    expect(err.recoverable).toBe(false);
    expect(err.fallback).toBeUndefined();
  });

  it("返回对象包含所有必需字段", () => {
    const err = createAppError("E1", "msg", "src", true, "fb");
    expect(err).toHaveProperty("code");
    expect(err).toHaveProperty("message");
    expect(err).toHaveProperty("source");
    expect(err).toHaveProperty("recoverable");
    expect(err).toHaveProperty("fallback");
  });
});
