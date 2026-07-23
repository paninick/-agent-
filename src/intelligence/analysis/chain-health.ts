/**
 * analysis/chain-health.ts - 供应链整体健康度引擎
 *
 * 从节点估计 + 传导推算结果中汇聚出一个整体指标。
 *
 * 输出 ChainHealth 包含：
 *   - healthScore: 0-100 综合健康度
 *   - pressureLevel: normal / elevated / critical
 *   - nodePressure: 每个节点的压力详情
 *   - bottleneckNode: 偏差最大的节点
 *   - riskSignals: 从偏差模式推断的风险信号
 *
 * 这个"整体指标"是 Synthesizer 写入 SynthesisOutput.chainEstimate 的核心数据，
 * 也是 Feedback 据此做出反应的依据。
 */

import type { NodeEstimate } from "./chain-estimator";
import type { PropagationResult, NodePropagation, ReversePropagationResult } from "./chain-propagator";
import type { ResonanceResult } from "./resonance-detector";
import { detectResonance } from "./resonance-detector";
import type { IndustryPack } from "../core/industry-pack";
import type { ReconciliationResult, ReconciliationSummary } from "../reconciliation/types";
import { computeReconciliationSummary } from "../reconciliation/reconciliation-summary";
import type { Anomaly } from "../reconciliation/types";

/** 压力等级 */
export type PressureLevel = "normal" | "elevated" | "critical";

/** 单个节点的压力详情 */
export interface NodePressure {
  nodeId: string;
  /** 该节点的主指标观测值 */
  observed: number | null;
  /** 从上游推算的应有值 */
  expected: number | null;
  /** 偏差（观测 - 推算） */
  deviation: number | null;
  /** 偏差率 */
  deviationRate: number | null;
  /** 严重度 */
  severity: "none" | "low" | "moderate" | "high";
  /** 来源分歧度（该节点各来源观测值的一致性） */
  sourceDisagreement: number;
  /** 节点置信度（来自 NodeEstimate） */
  confidence: number;
}

/** 供应链整体健康度 - 汇聚所有节点信息为一个整体指标 */
export interface ChainHealth {
  /** 综合健康度 0-100（100 = 完全健康，0 = 严重异常） */
  healthScore: number;
  /** 压力等级 */
  pressureLevel: PressureLevel;
  /** 每个节点的压力详情 */
  nodePressure: NodePressure[];
  /** 偏差最大的节点 ID（瓶颈节点） */
  bottleneckNode: string | null;
  /** 全链加权偏差率 */
  chainDeviation: number;
  /** 推算覆盖率 */
  coverage: number;
  /** 风险信号标签（从偏差模式推断） */
  riskSignals: string[];
  /** 估算的整体真实值摘要（每节点主指标的共识值） */
  trueValueSummary: Array<{ nodeId: string; subject: string; consensusValue: number; expected: number | null }>;
  /**
   * v3: 反向逆推结果 - 从下游品牌/市场反馈值逆推上游各节点应有值。
   * 让"单一品牌反馈"能推算出全链真实信息。
   */
  reversePropagation?: ReversePropagationResult;
  /**
   * v3 Phase E: 多节点共振检测结果。
   * 当 3+ 节点同时异常时，触发共振告警。
   */
  resonance?: ResonanceResult;
  /**
   * v3 Phase F: 买卖双方对账摘要。
   * 从交易文档级对账结果汇聚，影响 healthScore。
   */
  reconciliation?: ReconciliationSummary;
}

/** 健康度阈值 */
const HEALTH_THRESHOLDS = {
  normal: 75,    // >= 75 = normal
  elevated: 50,  // >= 50 = elevated
  // < 50 = critical
};

/**
 * 计算供应链整体健康度。
 *
 * healthScore = 100 - Σ(节点偏差率 × 节点权重)
 * 节点权重 = 1 / position（上游节点偏差影响更大）
 *
 * @param estimates 节点级估计
 * @param propagation 传导推算结果
 * @param signals 可选：当前激活信号列表（用于共振检测）
 * @param pack 可选：行业包（用于共振检测）
 * @param reconciliations 可选：买卖双方对账结果（用于对账健康度）
 * @param anomalies 可选：活跃异常列表（用于异常计数）
 * @returns 整体健康度
 */
export function computeChainHealth(
  estimates: NodeEstimate[],
  propagation: PropagationResult,
  signals?: string[],
  pack?: IndustryPack,
  reconciliations?: ReconciliationResult[],
  anomalies?: Anomaly[],
): ChainHealth {
  const nodePressure: NodePressure[] = [];
  const trueValueSummary: ChainHealth["trueValueSummary"] = [];
  let totalPenalty = 0;
  let penaltyCount = 0;
  const riskSignals: string[] = [];

  for (const nr of propagation.nodeResults) {
    // 从 estimates 中找到该节点的置信度和来源分歧度
    const estimate = estimates.find((e) => e.nodeId === nr.nodeId);
    const sourceDisagreement = estimate?.subjects[0]?.disagreement ?? 0;
    const confidence = estimate?.confidence ?? 0;

    nodePressure.push({
      nodeId: nr.nodeId,
      observed: nr.observed,
      expected: nr.expected,
      deviation: nr.deviation,
      deviationRate: nr.deviationRate,
      severity: nr.severity,
      sourceDisagreement,
      confidence,
    });

    // 收集真实值摘要
    if (estimate && estimate.subjects.length > 0) {
      trueValueSummary.push({
        nodeId: nr.nodeId,
        subject: nr.primarySubject,
        consensusValue: estimate.subjects[0].consensusValue,
        expected: nr.expected,
      });
    }

    // 累加惩罚（上游节点权重更高）
    if (nr.deviationRate !== null) {
      const weight = 1 / nr.position; // position 越小（越上游），权重越大
      totalPenalty += nr.deviationRate * weight;
      penaltyCount++;
    }

    // 推断风险信号
    if (nr.severity === "high") {
      riskSignals.push(`${nr.nodeId}_high_deviation`);
    }
    if (sourceDisagreement > 0.3) {
      riskSignals.push(`${nr.nodeId}_source_disagreement`);
    }
  }

  // 健康度计算
  // 平均惩罚 × 100 转为百分制，再从 100 中扣除
  const avgPenalty = penaltyCount > 0 ? totalPenalty / penaltyCount : 0;
  const healthScore = Math.max(0, Math.min(100, Math.round(100 - avgPenalty * 100)));

  // 压力等级
  const pressureLevel: PressureLevel =
    healthScore >= HEALTH_THRESHOLDS.normal ? "normal" :
    healthScore >= HEALTH_THRESHOLDS.elevated ? "elevated" :
    "critical";

  // 额外风险信号
  if (propagation.chainDeviation > 0.25) {
    riskSignals.push("chain_wide_deviation");
  }
  if (propagation.coverage < 0.5) {
    riskSignals.push("low_propagation_coverage");
  }

  // v3: 反向逆推一致性风险信号
  const reverseProp = propagation.reversePropagation;
  if (reverseProp) {
    if (reverseProp.consistency < 0.5) {
      riskSignals.push("reverse_consistency_low");
    }
    // 检查逆推中哪些节点偏差大（品牌反馈与实际成本结构不匹配）
    for (const rn of reverseProp.nodeResults) {
      if (rn.deviationRate !== null && rn.deviationRate > 0.25 && rn.observed !== null) {
        riskSignals.push(`${rn.nodeId}_reverse_mismatch`);
      }
    }
  }

  // v3 Phase E: 多节点共振检测
  let resonance: ResonanceResult | undefined;
  if (signals && pack) {
    resonance = detectResonance(signals, pack, reconciliations);
    if (resonance.hasAlert) {
      riskSignals.push(`resonance_${resonance.maxLevel}`);
      for (const p of resonance.patterns) {
        if (p.level === "strong" || p.level === "critical") {
          riskSignals.push(`${p.id}_alert`);
        }
      }
    }
  }

  // v3 Phase F: 买卖双方对账健康度
  let reconciliation: ReconciliationSummary | undefined;
  if (reconciliations && reconciliations.length > 0) {
    reconciliation = computeReconciliationSummary(reconciliations, anomalies ?? []);
    if (reconciliation.mismatchCount > 0) {
      riskSignals.push(`reconciliation_mismatch_${reconciliation.mismatchCount}`);
    }
    if (reconciliation.warningCount > 0) {
      riskSignals.push(`reconciliation_warning_${reconciliation.warningCount}`);
    }
    if (reconciliation.activeAnomalies > 0) {
      riskSignals.push(`active_anomalies_${reconciliation.activeAnomalies}`);
    }
    // 对账 mismatch 影响 healthScore（每个 mismatch 扣 2 分）
    const reconPenalty = reconciliation.mismatchCount * 2;
    const adjustedScore = Math.max(0, healthScore - reconPenalty);
    return {
      healthScore: adjustedScore,
      pressureLevel:
        adjustedScore >= HEALTH_THRESHOLDS.normal ? "normal" :
        adjustedScore >= HEALTH_THRESHOLDS.elevated ? "elevated" :
        "critical",
      nodePressure,
      bottleneckNode: propagation.bottleneckNodeId,
      chainDeviation: propagation.chainDeviation,
      coverage: propagation.coverage,
      riskSignals: [...new Set(riskSignals)],
      trueValueSummary,
      ...(reverseProp ? { reversePropagation: reverseProp } : {}),
      ...(resonance ? { resonance } : {}),
      ...(reconciliation ? { reconciliation } : {}),
    };
  }

  return {
    healthScore,
    pressureLevel,
    nodePressure,
    bottleneckNode: propagation.bottleneckNodeId,
    chainDeviation: propagation.chainDeviation,
    coverage: propagation.coverage,
    riskSignals: [...new Set(riskSignals)], // 去重
    trueValueSummary,
    ...(reverseProp ? { reversePropagation: reverseProp } : {}),
    ...(resonance ? { resonance } : {}),
  };
}

/**
 * 格式化健康度为人类可读文本。
 */
export function formatChainHealth(health: ChainHealth): string {
  const lines: string[] = [];
  lines.push(`Chain Health Score: ${health.healthScore}/100 [${health.pressureLevel.toUpperCase()}]`);
  lines.push(`Chain Deviation: ${(health.chainDeviation * 100).toFixed(1)}%`);
  lines.push(`Bottleneck: ${health.bottleneckNode ?? "none"}`);
  lines.push(`Coverage: ${(health.coverage * 100).toFixed(0)}%`);
  if (health.riskSignals.length > 0) {
    lines.push(`Risk Signals: ${health.riskSignals.join(", ")}`);
  }
  lines.push("");
  lines.push("True Value Summary (observed vs expected):");
  for (const tv of health.trueValueSummary) {
    const expStr = tv.expected !== null ? tv.expected.toFixed(1) : "-";
    const deltaStr = tv.expected !== null
      ? ` (Δ=${(tv.consensusValue - tv.expected).toFixed(1)})`
      : "";
    lines.push(`  ${tv.nodeId.padEnd(16)} ${tv.subject}=${tv.consensusValue.toFixed(1)}  expected=${expStr}${deltaStr}`);
  }

  // v3: 反向逆推摘要
  if (health.reversePropagation) {
    const rp = health.reversePropagation;
    lines.push("");
    lines.push(`Reverse Implied Values (from ${rp.anchorNodeId}=${rp.anchorValue}, consistency=${(rp.consistency * 100).toFixed(0)}%):`);
    for (const rn of rp.nodeResults) {
      const obsStr = rn.observed !== null ? rn.observed.toFixed(1) : "-";
      const implStr = rn.impliedValue !== null ? rn.impliedValue.toFixed(1) : "-";
      const deltaStr = rn.impliedDeltaPct !== null ? `${(rn.impliedDeltaPct * 100).toFixed(1)}%` : "-";
      const devStr = rn.deviationRate !== null ? `${(rn.deviationRate * 100).toFixed(1)}%` : "-";
      lines.push(`  ${rn.nodeId.padEnd(16)} observed=${obsStr.padStart(10)}  implied=${implStr.padStart(10)}  impliedΔ=${deltaStr.padStart(7)}  devRate=${devStr.padStart(6)}`);
    }
  }

  // v3 Phase E: 共振检测摘要
  if (health.resonance) {
    const r = health.resonance;
    lines.push("");
    lines.push(`Resonance: ${r.maxLevel.toUpperCase()} (${r.totalResonatingNodes} nodes, confidence=${(r.overallConfidence * 100).toFixed(0)}%)${r.hasAlert ? " [ALERT]" : ""}`);
    for (const p of r.patterns) {
      lines.push(`  [${p.level.toUpperCase()}] ${p.patternType}`);
      lines.push(`    nodes: ${p.resonatingNodes.join(", ")}  ->  ${p.recommendedAction}`);
    }
  }

  // v3 Phase F: 对账摘要
  if (health.reconciliation) {
    const rec = health.reconciliation;
    lines.push("");
    lines.push(`Reconciliation: ${rec.healthScore}/100 (${rec.matchedCount} matched, ${rec.warningCount} warning, ${rec.mismatchCount} mismatch)`);
    lines.push(`  dimensions: ${rec.dimensions.join(", ")}`);
    lines.push(`  active anomalies: ${rec.activeAnomalies}`);
  }

  return lines.join("\n");
}
