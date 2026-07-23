/**
 * swarm/agents/verifier.ts — Verifier Agent
 *
 * 角色：调 6 道真实性验证门，返回带 authenticity 的 AnnotatedEvidence。
 * 复用 validation/authenticity.ts 的 evaluateAuthenticity。
 */

import type { AgentRunResult, SwarmTask } from "../../spine/types";
import type { EvidenceEntry, IntelligenceSource } from "../../types";
import type { IndustryPack } from "../../core/industry-pack";
import { evaluateAuthenticity } from "../../validation/authenticity";
import type { AnnotatedEvidence } from "../../validation/types";

export interface VerifierInput {
  task: SwarmTask;
  evidence: EvidenceEntry;
  /** 证据账本（供 cross-source / historical 门参考） */
  ledger: EvidenceEntry[];
  registrySources: IntelligenceSource[];
  /** 可选行业包 — 提供时 ranges/freshness/trustedSources 从 pack 注入 */
  pack?: IndustryPack;
  /** 注入 now 以保证测试可复现 */
  now?: Date;
}

/**
 * 执行 Verifier agent。
 * 调 evaluateAuthenticity 跑完整 6 门，返回 AnnotatedEvidence。
 */
export function executeVerifier(input: VerifierInput): AgentRunResult {
  const { task, evidence, ledger, registrySources, pack, now } = input;

  const authenticity = evaluateAuthenticity({
    evidence,
    ledger,
    registrySources,
    pack,
    now,
  });

  const annotated: AnnotatedEvidence = { ...evidence, authenticity };

  return {
    taskId: task.id,
    role: "verifier",
    status: "completed",
    evidence: annotated,
    authenticity,
  };
}
