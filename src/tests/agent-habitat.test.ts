import { describe, expect, it } from "vitest";
import {
  DEFAULT_RESIDENT_AGENTS,
  validateHabitatSnapshot,
  type HabitatSnapshot,
} from "../domain";

function makeSnapshot(): HabitatSnapshot {
  return {
    capturedAt: "2026-07-12T09:24:00+08:00",
    motionPreference: "full",
    residentAgents: [...DEFAULT_RESIDENT_AGENTS],
    ephemeralAgents: [{
      id: "ephemeral-trip-search",
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
    }],
    goals: [],
    tasks: [{
      id: "task-search",
      goalId: "goal-trip",
      title: "比较航班",
      rationale: "寻找符合预算和退改要求的行程",
      status: "running",
      assignedAgentIds: ["ephemeral-trip-search"],
      dependsOn: [],
      evidenceIds: [],
      progress: 0.65,
    }],
    squads: [],
    userRequests: [],
    memories: [],
    activity: [],
  };
}

describe("Personal Agent Habitat contract", () => {
  it("defines four stable resident agents", () => {
    expect(DEFAULT_RESIDENT_AGENTS.map((agent) => agent.residentKind)).toEqual([
      "steward", "planner", "memory", "guardian",
    ]);
  });

  it("accepts a valid dynamic habitat snapshot", () => {
    expect(validateHabitatSnapshot(makeSnapshot())).toEqual([]);
  });

  it("rejects temporary agents without lifecycle ownership", () => {
    const snapshot = makeSnapshot();
    snapshot.ephemeralAgents[0] = {
      ...snapshot.ephemeralAgents[0],
      createdForGoalId: undefined,
      expiresWhen: undefined,
    };
    expect(validateHabitatSnapshot(snapshot)).toEqual([
      "Ephemeral agent ephemeral-trip-search is missing createdForGoalId.",
      "Ephemeral agent ephemeral-trip-search is missing expiresWhen.",
    ]);
  });

  it("rejects tasks assigned to unknown agents", () => {
    const snapshot = makeSnapshot();
    snapshot.tasks[0].assignedAgentIds = ["missing-agent"];
    expect(validateHabitatSnapshot(snapshot)).toContain(
      "Task task-search references unknown agent missing-agent.",
    );
  });
});
