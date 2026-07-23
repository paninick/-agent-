/**
 * swarm/agents/collector.ts — Collector Agent
 *
 * 角色：把 RawRecord → ExtractedFact → EvidenceEntry。
 * 复用 collection/raw-to-evidence 的转换函数。
 */

import type { AgentRunResult, SwarmTask, RawRecord } from "../../spine/types";
import type { IntelligenceSource } from "../../types";
import { rawRecordToEvidence } from "../../collection/raw-to-evidence";

export interface CollectorInput {
  task: SwarmTask;
  /** Scout 选出的来源列表（需与 rawRecords 的 sourceId 对应） */
  registrySources: IntelligenceSource[];
  /** 原始记录列表 */
  rawRecords: RawRecord[];
  /** 证据种类（默认 market_signal） */
  evidenceKind?: import("../../types").EvidenceKind;
  /** observedAt 时间戳（默认 now）；注入过去日期可保证 freshness gate 通过 */
  observedAt?: string;
}

/**
 * 执行 Collector agent。
 * 遍历 rawRecords，找到对应 source，转成 EvidenceEntry。
 * 返回全部匹配的 evidence（evidenceList）+ 第一条（evidence，向后兼容）。
 */
export function executeCollector(input: CollectorInput): AgentRunResult {
  const { task, registrySources, rawRecords, evidenceKind, observedAt } = input;

  const evidenceList: import("../../types").EvidenceEntry[] = [];

  for (const raw of rawRecords) {
    const source = registrySources.find((s) => s.id === raw.sourceId);
    if (!source) continue;

    const evidence = rawRecordToEvidence(raw, source, evidenceKind, observedAt ?? raw.fetchedAt);
    evidenceList.push(evidence);
  }

  if (evidenceList.length === 0) {
    return {
      taskId: task.id,
      role: "collector",
      status: "failed",
      error: "no raw record could be matched to a registry source",
    };
  }

  return {
    taskId: task.id,
    role: "collector",
    status: "completed",
    evidence: evidenceList[0], // 向后兼容
    evidenceList,
  };
}
