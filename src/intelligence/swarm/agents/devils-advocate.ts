/**
 * swarm/agents/devils-advocate.ts — Devil's Advocate Agent
 *
 * 角色：挑战每一个 Analyst 产出的结论，确保结论的鲁棒性。
 *
 * 对每个 signal 生成四类质疑：
 *   1. alternative_explanation  — 是否有其他因素可以解释这个信号？
 *   2. conflicting_evidence     — 是否有相反方向的证据？
 *   3. insufficient_data        — 证据基础是否太薄弱？
 *   4. correlation_not_causation — 因果关系还是仅相关性？
 *
 * 约束：必须挑战每个 finding（不仅挑弱的）；必须提供证据支持挑战；不捏造反证。
 */

import type {
  AgentRunResult,
  SwarmTask,
  AnalysisFinding,
  ChallengeEntry,
  DevilsAdvocateOutput,
  ChallengeType,
} from "../../spine/types";
import type { EvidenceEntry } from "../../types";
import type { IndustryPack } from "../../core/industry-pack";

export interface DevilsAdvocateInput {
  task: SwarmTask;
  findings: AnalysisFinding[];
  evidenceList: EvidenceEntry[];
  pack?: IndustryPack;
}

/**
 * 执行 Devil's Advocate agent。
 * 对每个 finding 的每个 signal 生成挑战。
 */
export function executeDevilsAdvocate(input: DevilsAdvocateInput): AgentRunResult {
  const { task, findings, evidenceList, pack } = input;

  if (findings.length === 0) {
    return {
      taskId: task.id,
      role: "devils_advocate",
      status: "failed",
      error: "no findings to challenge",
    };
  }

  const challenges: ChallengeEntry[] = [];

  for (const finding of findings) {
    for (const signal of finding.signals) {
      const signalChallenges = generateChallenges(finding, signal, evidenceList, pack);
      challenges.push(...signalChallenges);
    }
  }

  const overallWeakness = challenges.length > 0
    ? challenges.reduce((sum, c) => sum + c.impactScore, 0) / challenges.length
    : 0;

  const output: DevilsAdvocateOutput = {
    challenges,
    overallWeakness: Math.round(overallWeakness * 100) / 100,
  };

  return {
    taskId: task.id,
    role: "devils_advocate",
    status: "completed",
    challenges: output,
  };
}

function generateChallenges(
  finding: AnalysisFinding,
  signal: string,
  evidenceList: EvidenceEntry[],
  pack?: IndustryPack,
): ChallengeEntry[] {
  const result: ChallengeEntry[] = [];

  // 1. Alternative explanation: is there another factor?
  const altExplanation = findAlternativeExplanation(signal, evidenceList, pack);
  if (altExplanation) {
    result.push({
      findingId: finding.id,
      signal,
      challengeType: "alternative_explanation",
      counterEvidence: altExplanation.evidence,
      alternativeExplanation: altExplanation.explanation,
      impactScore: 0.3,
    });
  }

  // 2. Conflicting evidence: opposite direction?
  const conflicts = findConflictingEvidence(signal, evidenceList);
  if (conflicts.length > 0) {
    result.push({
      findingId: finding.id,
      signal,
      challengeType: "conflicting_evidence",
      counterEvidence: conflicts,
      alternativeExplanation: `Found ${conflicts.length} evidence item(s) pointing in the opposite direction for "${signal}"`,
      impactScore: Math.min(0.6, conflicts.length * 0.2),
    });
  }

  // 3. Insufficient data: thin evidence base?
  const relatedEvidence = evidenceList.filter(
    (e) => finding.evidenceIds.includes(e.id) || e.subject.toLowerCase().includes(signal.toLowerCase()),
  );
  if (relatedEvidence.length < 2) {
    result.push({
      findingId: finding.id,
      signal,
      challengeType: "insufficient_data",
      counterEvidence: relatedEvidence.map((e) => e.id),
      alternativeExplanation: `Only ${relatedEvidence.length} evidence item(s) support signal "${signal}" — insufficient for a robust conclusion`,
      impactScore: relatedEvidence.length === 0 ? 0.7 : 0.4,
    });
  }

  // 4. Correlation not causation
  if (signal.includes("transmission") || signal.includes("correlation") || signal.includes("linked")) {
    result.push({
      findingId: finding.id,
      signal,
      challengeType: "correlation_not_causation",
      counterEvidence: [],
      alternativeExplanation: `Signal "${signal}" may represent correlation rather than proven causal transmission — confounding factors not ruled out`,
      impactScore: 0.35,
    });
  }

  return result;
}

function findAlternativeExplanation(
  signal: string,
  evidenceList: EvidenceEntry[],
  pack?: IndustryPack,
): { evidence: string[]; explanation: string } | undefined {
  // Check if there are evidence items about different subjects that could explain the signal
  const subjects = new Set(evidenceList.map((e) => e.subject));
  if (subjects.size > 2) {
    return {
      evidence: evidenceList.slice(0, 2).map((e) => e.id),
      explanation: `Multiple subjects (${[...subjects].slice(0, 3).join(", ")}) may provide alternative explanations for "${signal}" — the observed pattern may not be unique to the primary subject`,
    };
  }

  // Check if pack has cross-dimension rules that suggest alternative causes
  if (pack?.crossDimensionRules) {
    const relevantRules = pack.crossDimensionRules.filter(
      (rule) => rule.effectPattern.test(signal) || signal.toLowerCase().includes(rule.effectKeyPrefix.toLowerCase()),
    );
    if (relevantRules.length > 0) {
      return {
        evidence: [],
        explanation: `Cross-dimension rules suggest "${signal}" may be driven by ${relevantRules.map((rule) => rule.causeKeyPrefix).join(", ")} rather than the primary factor`,
      };
    }
  }

  return undefined;
}

function findConflictingEvidence(signal: string, evidenceList: EvidenceEntry[]): string[] {
  // Simple heuristic: if signal implies "up"/"rising"/"increase", look for evidence with low values
  const isPositiveSignal = /up|rising|increas|growth|surge|high/i.test(signal);
  const isNegativeSignal = /down|falling|decreas|declin|drop|low/i.test(signal);

  const conflicts: string[] = [];

  for (const ev of evidenceList) {
    if (typeof ev.value === "number") {
      // If positive signal but evidence has low value (or vice versa)
      if (isPositiveSignal && ev.value < 0) conflicts.push(ev.id);
      if (isNegativeSignal && ev.value > 0) conflicts.push(ev.id);
    }
    // Text-based conflict detection — use stems to match -ing/-ed forms
    if (isPositiveSignal && /declin|decreas|drop|fall/i.test(ev.claim)) conflicts.push(ev.id);
    if (isNegativeSignal && /increas|growth|surge|rising/i.test(ev.claim)) conflicts.push(ev.id);
  }

  return [...new Set(conflicts)];
}
