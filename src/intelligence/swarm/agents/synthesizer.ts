/**
 * swarm/agents/synthesizer.ts - Synthesizer Agent
 *
 * 角色：聚合 findings + evidence -> SynthesisOutput 简报。
 * 复用 synthesis/brief.ts 的 synthesizeBrief。
 *
 * v3: 若注入 evidence + pack，synthesizeBrief 会计算供应链真实值推算。
 */

import type { AgentRunResult, SwarmTask, AnalysisFinding, SwarmTrigger } from "../../spine/types";
import type { EvidenceEntry } from "../../types";
import type { IndustryPack } from "../../core/industry-pack";
import { synthesizeBrief } from "../../synthesis/brief";

export interface SynthesizerInput {
  task: SwarmTask;
  trigger: SwarmTrigger;
  findings: AnalysisFinding[];
  evidenceIds: string[];
  /** 注入 now 以保证测试可复现 */
  now?: Date;
  /** v3: 已验证的证据列表 - 注入后计算供应链真实值推算 */
  evidence?: EvidenceEntry[];
  /** v3: 行业包 - 注入后计算供应链真实值推算 */
  pack?: IndustryPack;
}

/**
 * 执行 Synthesizer agent。
 */
export function executeSynthesizer(input: SynthesizerInput): AgentRunResult {
  const { task, trigger, findings, evidenceIds, now, evidence, pack } = input;

  const synthesis = synthesizeBrief({ trigger, findings, evidenceIds, now, evidence, pack });

  return {
    taskId: task.id,
    role: "synthesizer",
    status: "completed",
    synthesis,
  };
}
