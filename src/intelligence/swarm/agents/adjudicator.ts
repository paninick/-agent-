/**
 * swarm/agents/adjudicator.ts — Adjudicator Agent
 *
 * 角色：权衡 Analyst 的结论和 Devil's Advocate 的挑战，给出最终裁决。
 *
 * 对每个 finding 做三态裁决：
 *   - upheld   — 无实质性挑战，维持原置信度
 *   - modified — 有中等挑战，按比例下调置信度
 *   - rejected — 有高影响力挑战，置信度降至接近 0
 *
 * 约束：必须考虑所有挑战；必须给出理由；不可忽视高影响力挑战。
 */

import type {
  AgentRunResult,
  SwarmTask,
  AnalysisFinding,
  DevilsAdvocateOutput,
  VerdictEntry,
  AdjudicatorOutput,
  VerdictDecision,
} from "../../spine/types";
import type { EvidenceEntry } from "../../types";

export interface AdjudicatorInput {
  task: SwarmTask;
  findings: AnalysisFinding[];
  challenges?: DevilsAdvocateOutput;
  evidenceList: EvidenceEntry[];
}

/**
 * 执行 Adjudicator agent。
 * 对照 challenges，对每个 finding 做裁决。
 */
export function executeAdjudicator(input: AdjudicatorInput): AgentRunResult {
  const { task, findings, challenges, evidenceList } = input;

  if (findings.length === 0) {
    return {
      taskId: task.id,
      role: "adjudicator",
      status: "failed",
      error: "no findings to adjudicate",
    };
  }

  const verdicts: VerdictEntry[] = [];

  for (const finding of findings) {
    for (const signal of finding.signals) {
      const signalChallenges = challenges?.challenges.filter(
        (c) => c.findingId === finding.id && c.signal === signal,
      ) ?? [];

      const verdict = renderVerdict(finding, signal, signalChallenges, evidenceList);
      verdicts.push(verdict);
    }
  }

  const upheldCount = verdicts.filter((v) => v.decision === "upheld").length;
  const rejectedCount = verdicts.filter((v) => v.decision === "rejected").length;
  const totalCount = verdicts.length;

  let overallVerdict: AdjudicatorOutput["overallVerdict"];
  if (rejectedCount > totalCount / 2) {
    overallVerdict = "insufficient";
  } else if (rejectedCount > totalCount / 4) {
    overallVerdict = "weak";
  } else if (upheldCount >= totalCount * 0.6) {
    overallVerdict = "strong";
  } else {
    overallVerdict = "moderate";
  }

  const avgConfidence = verdicts.length > 0
    ? verdicts.reduce((sum, v) => sum + v.adjustedConfidence, 0) / verdicts.length
    : 0;

  const output: AdjudicatorOutput = {
    verdicts,
    overallVerdict,
    summary: `${totalCount} signals adjudicated: ${upheldCount} upheld, ${totalCount - upheldCount - rejectedCount} modified, ${rejectedCount} rejected. Average confidence: ${(avgConfidence * 100).toFixed(1)}%. Overall: ${overallVerdict}.`,
  };

  return {
    taskId: task.id,
    role: "adjudicator",
    status: "completed",
    verdict: output,
  };
}

function renderVerdict(
  finding: AnalysisFinding,
  signal: string,
  challenges: DevilsAdvocateOutput["challenges"],
  evidenceList: EvidenceEntry[],
): VerdictEntry {
  const originalConfidence = finding.confidence;
  const challengeCount = challenges.length;

  if (challengeCount === 0) {
    return {
      findingId: finding.id,
      signal,
      originalConfidence,
      challengeCount: 0,
      decision: "upheld",
      adjustedConfidence: originalConfidence,
      reasoning: `No challenges raised for signal "${signal}". Original confidence maintained.`,
    };
  }

  const maxImpact = Math.max(...challenges.map((c) => c.impactScore));
  const avgImpact = challenges.reduce((sum, c) => sum + c.impactScore, 0) / challengeCount;

  let decision: VerdictDecision;
  let adjustedConfidence: number;
  let reasoning: string;

  if (maxImpact >= 0.6) {
    // High-impact challenge → reject
    decision = "rejected";
    adjustedConfidence = Math.max(0.05, originalConfidence * 0.1);
    reasoning = `High-impact challenge (score: ${maxImpact.toFixed(2)}) found for "${signal}": ${challenges.find((c) => c.impactScore === maxImpact)?.alternativeExplanation ?? "severe challenge"}. Confidence reduced to near-zero.`;
  } else if (avgImpact >= 0.3) {
    // Moderate challenges → modify
    decision = "modified";
    adjustedConfidence = Math.max(0.1, originalConfidence * (1 - avgImpact));
    reasoning = `${challengeCount} moderate challenges (avg impact: ${avgImpact.toFixed(2)}) for "${signal}". Confidence reduced proportionally: ${(originalConfidence * 100).toFixed(1)}% → ${(adjustedConfidence * 100).toFixed(1)}%.`;
  } else {
    // Low-impact challenges → uphold
    decision = "upheld";
    adjustedConfidence = originalConfidence * (1 - avgImpact * 0.3);
    reasoning = `${challengeCount} low-impact challenges (avg: ${avgImpact.toFixed(2)}) for "${signal}". Confidence marginally adjusted: ${(originalConfidence * 100).toFixed(1)}% → ${(adjustedConfidence * 100).toFixed(1)}%.`;
  }

  return {
    findingId: finding.id,
    signal,
    originalConfidence,
    challengeCount,
    decision,
    adjustedConfidence: Math.round(adjustedConfidence * 100) / 100,
    reasoning,
  };
}
