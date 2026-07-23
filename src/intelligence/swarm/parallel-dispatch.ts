/**
 * swarm/parallel-dispatch.ts - 并行派发决策树
 *
 * 吸收 superpowers dispatching-parallel-agents 的决策树：
 *   多任务？ -> 独立？ -> 无共享状态？ -> parallel / sequential / single
 *
 * 核心原则：
 *   - 每个 agent 获得特定范围（一个测试文件/子系统）
 *   - 明确目标（让这些测试通过）
 *   - 约束（"不要改其他代码"）
 *   - 预期输出格式
 *
 * "Never dispatch multiple implementation subagents in parallel (conflicts)."
 */

import type { SwarmTask, AgentRunResult } from "../spine/types";

// === 派发决策类型 ===

export type DispatchDecision = "parallel" | "sequential" | "single_agent";

/** 派发评估结果 */
export interface DispatchAssessment {
  /** 派发决策 */
  decision: DispatchDecision;
  /** 决策理由 */
  rationale: string;
  /** 任务数量 */
  taskCount: number;
  /** 是否有共享状态 */
  hasSharedState: boolean;
  /** 是否独立 */
  isIndependent: boolean;
}

// === 并行派发计划 ===

/** 并行派发计划 - 将任务分组 */
export interface ParallelDispatchPlan {
  /** 任务分组 - 每组内的任务可以并行执行 */
  groups: SwarmTask[][];
  /** 分组理由 */
  rationale: string;
  /** 每组的约束说明 */
  constraints: string[];
}

// === 决策树 ===

/**
 * 评估派发决策 - 根据任务特征决定并行、顺序还是单代理。
 *
 * 决策树（吸收 superpowers dispatching-parallel-agents）：
 *   1. 只有 1 个任务？ -> single_agent
 *   2. 多个任务？ -> 它们独立吗？
 *      - 否 -> sequential
 *      - 是 -> 有共享状态吗？
 *           - 是 -> sequential
 *           - 否 -> parallel
 *
 * @param tasks - 待执行的任务列表
 * @returns 派发评估结果
 */
export function assessDispatch(tasks: SwarmTask[]): DispatchAssessment {
  // 只有 1 个任务 -> 单代理
  if (tasks.length <= 1) {
    return {
      decision: "single_agent",
      rationale: "Only one task - no parallelization needed",
      taskCount: tasks.length,
      hasSharedState: false,
      isIndependent: true,
    };
  }

  // 检查任务独立性 - 不同角色的任务通常是独立的
  const roles = new Set(tasks.map((t) => t.role));
  const isIndependent = roles.size === tasks.length; // 每个任务角色不同

  // 检查共享状态 - 相同 triggerId 的任务可能有共享状态
  const triggerIds = new Set(tasks.map((t) => t.triggerId));
  const hasSharedState = triggerIds.size < tasks.length;

  // 决策
  if (!isIndependent) {
    return {
      decision: "sequential",
      rationale: "Tasks are not independent (same role) - sequential to avoid conflicts",
      taskCount: tasks.length,
      hasSharedState,
      isIndependent: false,
    };
  }

  if (hasSharedState) {
    return {
      decision: "sequential",
      rationale: "Tasks share state (same trigger) - sequential to avoid race conditions",
      taskCount: tasks.length,
      hasSharedState: true,
      isIndependent: true,
    };
  }

  return {
    decision: "parallel",
    rationale: "Multiple independent tasks with no shared state - safe to parallelize",
    taskCount: tasks.length,
    hasSharedState: false,
    isIndependent: true,
  };
}

// === 并行派发计划构建 ===

/**
 * 创建并行派发计划 - 将任务按独立性分组。
 *
 * 吸收 superpowers 的并行派发模式：
 *   "Group failures by problem domain; each agent gets specific scope"
 *
 * @param tasks - 待执行的任务列表
 * @returns 并行派发计划
 */
export function createParallelDispatchPlan(tasks: SwarmTask[]): ParallelDispatchPlan {
  const assessment = assessDispatch(tasks);

  if (assessment.decision !== "parallel") {
    // 非并行 -> 所有任务在一个组中顺序执行
    return {
      groups: [tasks],
      rationale: `${assessment.decision}: ${assessment.rationale}`,
      constraints: ["Execute tasks in order"],
    };
  }

  // 并行 -> 每个任务一个组
  const groups = tasks.map((task) => [task]);
  const constraints = tasks.map((task) =>
    `Agent for ${task.role}: scope=${task.role}, goal=${task.objective}, constraint="Do NOT change other agents' code"`
  );

  return {
    groups,
    rationale: "Tasks are independent with no shared state - each gets its own agent",
    constraints,
  };
}

// === 聚焦 Agent Prompt 模板 ===

/**
 * 创建聚焦 Agent Prompt - 三要素模板。
 *
 * 吸收 superpowers 的子代理上下文隔离原则：
 *   1. 聚焦 - 明确范围和目标
 *   2. 自包含 - 提供完整上下文，不需要读取文件
 *   3. 明确输出 - 预期输出格式
 *
 * @param task    - 任务
 * @param context - 场景设置上下文
 * @returns 格式化的 prompt 字符串
 */
export function createFocusedAgentPrompt(task: SwarmTask, context: string): string {
  return [
    `# Task: ${task.role.toUpperCase()}`,
    "",
    `## Objective`,
    task.objective,
    "",
    `## Context`,
    context,
    "",
    `## Scope`,
    `You are responsible ONLY for the ${task.role} role.`,
    `Do NOT perform work outside your role's boundaries.`,
    `Do NOT modify other agents' outputs.`,
    "",
    `## Expected Output`,
    `Return an AgentRunResult with:`,
    `- status: "completed" | "failed"`,
    `- Your role-specific output field (e.g., candidateSourceIds, evidence, finding, synthesis)`,
    `- error: only if status is "failed"`,
    "",
    `## Constraints`,
    `- Follow your role's boundaries strictly`,
    `- Do not invent data`,
    `- Verify your output before reporting completion`,
  ].join("\n");
}

// === 并行结果验证 ===

/**
 * 验证并行执行的结果 - 检查冲突和整体状态。
 *
 * 吸收 superpowers 的集成验证：
 *   "Review and integrate: read each summary, verify no conflicts,
 *    run full suite, spot-check for systematic errors"
 *
 * @param results - 并行执行的结果列表
 * @returns 验证结果
 */
export function verifyParallelResults(
  results: AgentRunResult[]
): { conflicts: string[]; allGreen: boolean } {
  const conflicts: string[] = [];

  // 检查是否有结果冲突（相同角色产出不同结果）
  const roleResults = new Map<string, AgentRunResult[]>();
  for (const result of results) {
    const existing = roleResults.get(result.role) ?? [];
    existing.push(result);
    roleResults.set(result.role, existing);
  }

  for (const [role, roleResultsList] of roleResults) {
    if (roleResultsList.length > 1) {
      // 同一角色有多个结果 - 可能冲突
      const statuses = new Set(roleResultsList.map((r) => r.status));
      if (statuses.size > 1) {
        conflicts.push(`Role "${role}" has conflicting statuses: ${Array.from(statuses).join(", ")}`);
      }
    }
  }

  // 检查是否全部通过
  const allGreen = results.every((r) => r.status === "completed" || r.status === "done_with_concerns");

  return { conflicts, allGreen };
}
