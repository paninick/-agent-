/**
 * squadLayout.test.ts - Squad 环形布局单元测试
 *
 * 覆盖 src/client/habitat/squadLayout.ts 的纯函数：
 * - layoutSquad: 环形布局计算
 * - getMemberPositions: 成员位置计算
 * - buildSquadFlows: 证据流连线构造
 */

import { describe, it, expect } from "vitest";
import {
  layoutSquad,
  getMemberPositions,
  buildSquadFlows,
  DEFAULT_SQUAD_CENTER,
  DEFAULT_SQUAD_RADIUS,
} from "./squadLayout";
import type { DynamicSquad } from "../../domain/agentHabitat";

function createMockSquad(overrides: Partial<DynamicSquad> = {}): DynamicSquad {
  return {
    id: "squad-1",
    goalId: "goal-1",
    label: "测试小队",
    objective: "测试目标",
    agentIds: ["lead-1", "contrib-1", "contrib-2", "reviewer-1"],
    taskIds: ["t1", "t2"],
    formedAt: "2026-07-12T10:00:00+08:00",
    dissolveWhenComplete: true,
    phase: "working",
    phaseEnteredAt: "2026-07-12T10:05:00+08:00",
    leadAgentId: "lead-1",
    memberRoles: [
      { agentId: "lead-1", role: "lead", joinedAt: "2026-07-12T10:00:00+08:00" },
      { agentId: "contrib-1", role: "contributor", joinedAt: "2026-07-12T10:01:00+08:00" },
      { agentId: "contrib-2", role: "contributor", joinedAt: "2026-07-12T10:01:30+08:00" },
      { agentId: "reviewer-1", role: "reviewer", joinedAt: "2026-07-12T10:02:00+08:00" },
    ],
    hasAdversarialReview: false,
    ...overrides,
  };
}

describe("DEFAULT_SQUAD_CENTER", () => {
  it("默认中心点为画布正中 (0.5, 0.5)", () => {
    expect(DEFAULT_SQUAD_CENTER.x).toBe(0.5);
    expect(DEFAULT_SQUAD_CENTER.y).toBe(0.5);
  });
});

describe("DEFAULT_SQUAD_RADIUS", () => {
  it("默认半径为 0.18", () => {
    expect(DEFAULT_SQUAD_RADIUS).toBe(0.18);
  });
});

describe("layoutSquad", () => {
  it("返回完整的 SquadRenderGroup", () => {
    const squad = createMockSquad();
    const group = layoutSquad(squad, []);
    expect(group.squadId).toBe("squad-1");
    expect(group.label).toBe("测试小队");
    expect(group.phase).toBe("working");
    expect(group.leadAgentId).toBe("lead-1");
  });

  it("lead 位于角度 0（正上方）", () => {
    const squad = createMockSquad();
    const group = layoutSquad(squad, []);
    expect(group.memberAngles["lead-1"]).toBe(0);
  });

  it("成员按角色优先级排序：lead < contributor < reviewer", () => {
    const squad = createMockSquad();
    const group = layoutSquad(squad, []);
    // lead-1 角度 0，contrib-1 其次，contrib-2 第三，reviewer-1 最后
    expect(group.memberAgentIds[0]).toBe("lead-1");
    expect(group.memberAgentIds[1]).toBe("contrib-1");
    expect(group.memberAgentIds[2]).toBe("contrib-2");
    expect(group.memberAgentIds[3]).toBe("reviewer-1");
  });

  it("同角色按加入时间排序", () => {
    const squad = createMockSquad({
      memberRoles: [
        { agentId: "c-late", role: "contributor", joinedAt: "2026-07-12T10:05:00+08:00" },
        { agentId: "c-early", role: "contributor", joinedAt: "2026-07-12T10:01:00+08:00" },
        { agentId: "lead-1", role: "lead", joinedAt: "2026-07-12T10:00:00+08:00" },
      ],
    });
    const group = layoutSquad(squad, []);
    expect(group.memberAgentIds[0]).toBe("lead-1");
    expect(group.memberAgentIds[1]).toBe("c-early");
    expect(group.memberAgentIds[2]).toBe("c-late");
  });

  it("working 阶段半径系数为 1.0", () => {
    const squad = createMockSquad({ phase: "working" });
    const group = layoutSquad(squad, [], { x: 0.5, y: 0.5 }, 0.18);
    expect(group.radius).toBeCloseTo(0.18, 5);
  });

  it("forming 阶段半径收缩（0.85）", () => {
    const squad = createMockSquad({ phase: "forming" });
    const group = layoutSquad(squad, [], { x: 0.5, y: 0.5 }, 0.18);
    expect(group.radius).toBeCloseTo(0.18 * 0.85, 5);
  });

  it("dissolving 阶段半径扩张（1.2）", () => {
    const squad = createMockSquad({ phase: "dissolving" });
    const group = layoutSquad(squad, [], { x: 0.5, y: 0.5 }, 0.18);
    expect(group.radius).toBeCloseTo(0.18 * 1.2, 5);
  });

  it("使用自定义中心点", () => {
    const squad = createMockSquad();
    const group = layoutSquad(squad, [], { x: 0.3, y: 0.7 });
    expect(group.centerX).toBe(0.3);
    expect(group.centerY).toBe(0.7);
  });

  it("包含进度计算", () => {
    const squad = createMockSquad({ taskIds: ["t1", "t2"] });
    const tasks = [
      { id: "t1", progress: 0.8 },
      { id: "t2", progress: 0.4 },
    ];
    const group = layoutSquad(squad, tasks);
    expect(group.progress).toBeCloseTo(0.6, 5);
  });

  it("dissolving 阶段进度为 1", () => {
    const squad = createMockSquad({ phase: "dissolving" });
    const group = layoutSquad(squad, []);
    expect(group.progress).toBe(1);
  });

  it("包含阶段颜色", () => {
    const squad = createMockSquad({ phase: "working" });
    const group = layoutSquad(squad, []);
    expect(group.phaseColor).toBe("#4E72D8");
  });
});

describe("getMemberPositions", () => {
  it("返回每个成员的归一化坐标", () => {
    const squad = createMockSquad();
    const group = layoutSquad(squad, []);
    const positions = getMemberPositions(group);
    expect(positions).toHaveLength(4);
    for (const pos of positions) {
      expect(pos.agentId).toBeTruthy();
      expect(typeof pos.x).toBe("number");
      expect(typeof pos.y).toBe("number");
    }
  });

  it("lead 位于正上方（x=center, y=center-radius）", () => {
    const squad = createMockSquad();
    const group = layoutSquad(squad, [], { x: 0.5, y: 0.5 }, 0.18);
    const positions = getMemberPositions(group);
    const leadPos = positions.find((p) => p.agentId === "lead-1");
    expect(leadPos).toBeDefined();
    expect(leadPos!.x).toBeCloseTo(0.5, 5);
    // angle=0 → dy = -cos(0) * radius = -radius
    expect(leadPos!.y).toBeCloseTo(0.5 - group.radius, 5);
  });

  it("所有位置围绕中心点", () => {
    const squad = createMockSquad();
    const center = { x: 0.5, y: 0.5 };
    const group = layoutSquad(squad, [], center, 0.18);
    const positions = getMemberPositions(group);
    for (const pos of positions) {
      const dx = pos.x - center.x;
      const dy = pos.y - center.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      expect(dist).toBeCloseTo(group.radius, 4);
    }
  });

  it("空成员返回空数组", () => {
    const squad = createMockSquad({ memberRoles: [] });
    const group = layoutSquad(squad, []);
    const positions = getMemberPositions(group);
    expect(positions).toEqual([]);
  });
});

describe("buildSquadFlows", () => {
  it("lead 与每个非 lead 成员有双向流", () => {
    const squad = createMockSquad();
    const group = layoutSquad(squad, []);
    const flows = buildSquadFlows(group);
    // 3 个非 lead 成员 × 2 方向 = 6 流
    const leadFlows = flows.filter(
      (f) => f.fromId === "lead-1" || f.toId === "lead-1"
    );
    expect(leadFlows.length).toBeGreaterThanOrEqual(6);
  });

  it("working 阶段 contributor 之间有弱连接", () => {
    const squad = createMockSquad({ phase: "working" });
    const group = layoutSquad(squad, []);
    const flows = buildSquadFlows(group);
    // 2 个 contributor 之间应有 1 条弱流
    const contribFlow = flows.find(
      (f) =>
        f.fromId === "contrib-1" && f.toId === "contrib-2" &&
        f.intensity === 0.3
    );
    expect(contribFlow).toBeDefined();
    expect(contribFlow!.adversarial).toBe(false);
  });

  it("reviewing 阶段 reviewer → lead 为对峙连线", () => {
    const squad = createMockSquad({ phase: "reviewing" });
    const group = layoutSquad(squad, []);
    const flows = buildSquadFlows(group);
    const adversarial = flows.find(
      (f) => f.fromId === "reviewer-1" && f.toId === "lead-1" && f.adversarial
    );
    expect(adversarial).toBeDefined();
    expect(adversarial!.color).toBe("#C75A4A");
    expect(adversarial!.intensity).toBe(0.9);
  });

  it("working 阶段无对峙连线", () => {
    const squad = createMockSquad({ phase: "working" });
    const group = layoutSquad(squad, []);
    const flows = buildSquadFlows(group);
    const adversarial = flows.filter((f) => f.adversarial);
    expect(adversarial).toHaveLength(0);
  });

  it("所有流包含 squadId", () => {
    const squad = createMockSquad();
    const group = layoutSquad(squad, []);
    const flows = buildSquadFlows(group);
    for (const flow of flows) {
      expect(flow.squadId).toBe("squad-1");
    }
  });

  it("非 working 阶段 contributor 之间无弱连接", () => {
    const squad = createMockSquad({ phase: "forming" });
    const group = layoutSquad(squad, []);
    const flows = buildSquadFlows(group);
    const contribFlow = flows.find(
      (f) => f.fromId === "contrib-1" && f.toId === "contrib-2"
    );
    expect(contribFlow).toBeUndefined();
  });

  it("lead 不与自己连线", () => {
    const squad = createMockSquad();
    const group = layoutSquad(squad, []);
    const flows = buildSquadFlows(group);
    const selfFlow = flows.find((f) => f.fromId === "lead-1" && f.toId === "lead-1");
    expect(selfFlow).toBeUndefined();
  });
});
