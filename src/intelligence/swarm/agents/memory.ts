/**
 * swarm/agents/memory.ts — Memory Agent
 *
 * 角色：把 SynthesisOutput / Finding 写入 MemoryEntry。
 * 同时调用 feedback 生成 FollowUpTask（闭合环路）。
 */

import type {
  AgentRunResult,
  SwarmTask,
  SynthesisOutput,
  AnalysisFinding,
  MemoryEntry,
  FollowUpTask,
} from "../../spine/types";
import type { MemoryStore } from "../../memory/store";
import type { MemoryBroker } from "../../memory/broker";
import { generateFollowUp } from "../../workflows/feedback";

export interface MemoryInput {
  task: SwarmTask;
  synthesis: SynthesisOutput;
  findings: AnalysisFinding[];
  memoryStore: MemoryStore;
  /** 可选 MemoryBroker - 注入后通过 broker commit 到 4 层神经记忆 */
  broker?: MemoryBroker;
  /** 注入 now 以保证测试可复现 */
  now?: Date;
  /**
   * 可选行业标识 - 从 pack 动态读取，传入 broker.commit 的 industry 字段。
   * 修复原硬编码 industry: "apparel" 的问题。
   * 无 pack 时默认 "default"。
   */
  industry?: string;
}

let memoryCounter = 0;

function nextMemoryId(): string {
  memoryCounter += 1;
  return `memory-${memoryCounter}`;
}

/**
 * 执行 Memory agent。
 * 1. 把 SynthesisOutput 写入 MemoryStore（v1 行为，向后兼容）
 * 2. 若注入 broker，同时通过 broker.commit 写入神经记忆（含关联边 + 反射提取）
 * 3. 生成 FollowUpTask（调用 feedback 模块）
 */
export function executeMemory(input: MemoryInput): AgentRunResult {
  const { task, synthesis, findings, memoryStore, broker, now, industry } = input;
  const createdAt = (now ?? new Date()).toISOString();

  const memoryEntry: MemoryEntry = {
    id: nextMemoryId(),
    key: `synthesis:${synthesis.triggerId}`,
    kind: "synthesis",
    value: synthesis.brief,
    sourceTaskId: task.id,
    createdAt,
    tags: ["synthesis", ...synthesis.findings.flatMap((f) => f.signals)],
  };

  // v1 行为：直接写 MemoryStore（保证未注入 broker 时不破）
  memoryStore.remember(memoryEntry);

  // v2 增强：若注入 broker，通过 commit 写入神经记忆
  // confidence ≥ 0.6 时写 Layer 1 + 建 Layer 2 关联边
  // 同时提供 reflexTrigger/reflexAction 供反射提取
  if (broker) {
    const findingKeys = findings.map((f) => `finding:${f.id}`);
    broker.commit({
      kind: "synthesis",
      key: memoryEntry.key,
      value: synthesis.brief,
      confidence: synthesis.confidence,
      tags: memoryEntry.tags,
      relatedKeys: findingKeys,
      industry: industry ?? "default", // 从 pack 动态读取，无 pack 时默认 "default"
      reflexTrigger: task.objective,
      reflexAction: synthesis.title,
    });
  }

  // 生成后续任务（注入 broker 做反射触发）
  const followUp = generateFollowUp(synthesis, findings, task.id, now, broker);

  return {
    taskId: task.id,
    role: "memory",
    status: "completed",
    memoryEntry,
    followUp,
  };
}
