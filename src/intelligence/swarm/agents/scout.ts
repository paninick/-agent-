/**
 * swarm/agents/scout.ts — Scout Agent
 *
 * 角色：根据目标，产出去哪些数据源采集信息的候选列表。
 * v2 升级：调用 matchSources 做多级匹配 (exact→domain→coverage→broker→fallback)。
 * 不实际调用外部 API（遵守约束）。
 */

import type { AgentRunResult, SwarmTask } from "../../spine/types";
import type { IntelligenceSource } from "../../types";
import type { MemoryBroker } from "../../memory/broker";
import { matchSources } from "../scout-matcher";

export interface ScoutInput {
  task: SwarmTask;
  registrySources: IntelligenceSource[];
  /** 可选 MemoryBroker — 注入后查历史记忆寻找已知好源 */
  broker?: MemoryBroker;
}

/**
 * 执行 Scout agent。
 * 调 matchSources 做多级匹配，返回候选来源 ID 列表。
 */
export function executeScout(input: ScoutInput): AgentRunResult {
  const { task, registrySources, broker } = input;

  const matches = matchSources(task.objective, registrySources, broker);

  return {
    taskId: task.id,
    role: "scout",
    status: "completed",
    candidateSourceIds: matches.map((m) => m.sourceId),
  };
}
