/**
 * synthesis/brief.ts - 情报简报生成
 *
 * synthesizeBrief(input): 聚合 findings + evidence -> SynthesisOutput 简报。
 * 模板化生成标题 + 正文 + 综合置信度。
 *
 * v3: 若注入 evidence + pack，则调用三引擎推算供应链真实值：
 *   ChainEstimator -> ChainPropagator -> ChainHealthIndex
 * 结果写入 SynthesisOutput.chainEstimate，供 Feedback 做基于真实值的反应。
 */

import type { SynthesisOutput, AnalysisFinding, SwarmTrigger } from "../spine/types";
import type { EvidenceEntry } from "../types";
import type { IndustryPack } from "../core/industry-pack";
import type { ReconciliationResult, Anomaly } from "../reconciliation/types";
import { estimateNodeValues } from "../analysis/chain-estimator";
import { propagateChain, formatPropagation } from "../analysis/chain-propagator";
import { computeChainHealth, formatChainHealth } from "../analysis/chain-health";

export interface SynthesisInput {
  trigger: SwarmTrigger;
  findings: AnalysisFinding[];
  evidenceIds: string[];
  /** 注入 now 以保证测试可复现 */
  now?: Date;
  /** v3: 已验证的证据列表 - 注入后计算供应链真实值推算 */
  evidence?: EvidenceEntry[];
  /** v3: 行业包 - 注入后计算供应链真实值推算 */
  pack?: IndustryPack;
  /** v3 Phase F: 买卖双方对账结果 - 注入后计算对账健康度 */
  reconciliations?: ReconciliationResult[];
  /** v3 Phase F: 活跃异常列表 */
  anomalies?: Anomaly[];
}

let synthesisCounter = 0;

function nextSynthesisId(): string {
  synthesisCounter += 1;
  return `synthesis-${synthesisCounter}`;
}

/**
 * 生成情报简报。
 * 综合置信度 = findings 置信度的平均值（无 finding 则 0）。
 *
 * v3: 若注入 evidence + pack，额外计算供应链真实值推算。
 */
export function synthesizeBrief(input: SynthesisInput): SynthesisOutput {
  const { trigger, findings, evidenceIds, now, evidence, pack } = input;
  const generatedAt = (now ?? new Date()).toISOString();

  const confidence =
    findings.length > 0
      ? Math.round((findings.reduce((sum, f) => sum + f.confidence, 0) / findings.length) * 1000) / 1000
      : 0;

  // 收集所有信号标签
  const allSignals = findings.flatMap((f) => f.signals);
  const signalText = allSignals.length > 0 ? allSignals.join(", ") : "no signals";

  // 标题：目标截断 + 信号摘要
  const objectiveShort = trigger.objective.length > 60
    ? trigger.objective.slice(0, 57) + "..."
    : trigger.objective;
  const title = `Intelligence Brief: ${objectiveShort}`;

  // 正文：逐条 finding 摘要
  const findingLines = findings.map((f, i) =>
    `${i + 1}. [${(f.confidence * 100).toFixed(0)}% confidence] ${f.summary}`
  );

  const briefParts: string[] = [
    `Objective: ${trigger.objective}`,
    `Signals: ${signalText}`,
    `Evidence: ${evidenceIds.length} item(s) verified through 6 authenticity gates.`,
    ``,
    `Findings:`,
    ...findingLines,
    ``,
    `Overall confidence: ${(confidence * 100).toFixed(0)}%`,
  ];

  // v3: 供应链真实值推算
  let chainEstimate: SynthesisOutput["chainEstimate"];
  if (evidence && evidence.length > 0 && pack) {
    const estimates = estimateNodeValues(evidence, pack);
    if (estimates.length > 0) {
      const propagation = propagateChain(estimates, pack);
      // v3 Phase E: 传入信号和 pack 以启用共振检测
      const allSignals = findings.flatMap((f) => f.signals);
      // v3 Phase F: 传入对账结果和异常以启用对账健康度
      chainEstimate = computeChainHealth(estimates, propagation, allSignals, pack, input.reconciliations, input.anomalies);

      // 追加推算结果到正文
      briefParts.push(
        ``,
        `=== Supply Chain True Value Estimate ===`,
        formatChainHealth(chainEstimate),
      );
    }
  }

  const brief = briefParts.join("\n");

  return {
    id: nextSynthesisId(),
    triggerId: trigger.id,
    title,
    brief,
    findings,
    evidenceIds,
    confidence,
    generatedAt,
    ...(chainEstimate ? { chainEstimate } : {}),
  };
}
