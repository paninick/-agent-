/**
 * analysis/chain-estimator.ts - 节点级真实值推算引擎
 *
 * 从多个来源的证据中推算每个供应链节点的"真实值"。
 *
 * 核心思路：
 *   同一指标（subject）可能有多个来源的证据，每个来源有不同的可信度。
 *   用加权中位数做共识估计，避免极端值拉偏均值。
 *   再把 subject 映射到 nodeId，聚合出节点级估计。
 *
 * 输出 NodeEstimate[] 供：
 *   - ChainPropagator 做下游传导推算
 *   - ChainHealthIndex 做整体健康度汇聚
 *   - Synthesizer 写入 SynthesisOutput.chainEstimate
 */

import type { EvidenceEntry } from "../types";
import type { IndustryPack } from "../core/industry-pack";

/** 单个指标的共识估计 */
export interface SubjectEstimate {
  /** 指标 key（如 "cotton_price"） */
  subject: string;
  /** 共识值（加权中位数） */
  consensusValue: number;
  /** 观测值列表（来源不同可能有多个） */
  observedValues: number[];
  /** 来源分歧度 = |max - min| / |consensus|（0 = 完全一致，大 = 来源分歧大） */
  disagreement: number;
  /** 综合置信度 0-1（来源可信度 × 真实性得分的加权平均） */
  confidence: number;
  /** 证据来源数 */
  sourceCount: number;
}

/** 节点级估计 - 聚合该节点下所有指标 */
export interface NodeEstimate {
  /** 产业链节点 ID（如 "raw_material"） */
  nodeId: string;
  /** 节点在链中的位置 */
  position: number;
  /** 该节点下各指标的共识估计 */
  subjects: SubjectEstimate[];
  /** 节点级综合置信度（各 subject 置信度的加权平均） */
  confidence: number;
}

/**
 * 从证据列表推算各节点的真实值。
 *
 * @param evidence 已验证的证据列表
 * @param pack 行业包（提供 nodes.metrics 映射 + knownRanges 基线）
 * @returns 节点级估计列表（按 position 排序）
 */
export function estimateNodeValues(
  evidence: EvidenceEntry[],
  pack: IndustryPack,
): NodeEstimate[] {
  // 1. 按 subject 分组，只保留数值型证据
  const bySubject = new Map<string, Array<{ value: number; weight: number; sourceId: string }>>();
  for (const ev of evidence) {
    if (typeof ev.value !== "number" || isNaN(ev.value)) continue;
    const list = bySubject.get(ev.subject) ?? [];
    // 权重 = sourceWeight × authenticityScore（无 authenticity 时用 sourceWeight）
    const authScore = (ev as EvidenceEntry & { authenticity?: { authenticityScore?: number } })
      .authenticity?.authenticityScore;
    const weight = ev.sourceWeight * (authScore ?? 0.5);
    list.push({ value: ev.value, weight, sourceId: ev.sourceId });
    bySubject.set(ev.subject, list);
  }

  // 2. 对每个 subject 做加权中位数
  const subjectEstimates = new Map<string, SubjectEstimate>();
  for (const [subject, items] of bySubject) {
    if (items.length === 0) continue;

    // 加权中位数：按值排序，找到累积权重达到一半的位置
    const sorted = [...items].sort((a, b) => a.value - b.value);
    const totalWeight = sorted.reduce((sum, item) => sum + item.weight, 0);
    let cumulativeWeight = 0;
    let consensusValue = sorted[0].value; // fallback
    for (const item of sorted) {
      cumulativeWeight += item.weight;
      if (cumulativeWeight >= totalWeight / 2) {
        consensusValue = item.value;
        break;
      }
    }

    const values = items.map((i) => i.value);
    const maxVal = Math.max(...values);
    const minVal = Math.min(...values);
    const disagreement = consensusValue !== 0
      ? Math.abs(maxVal - minVal) / Math.abs(consensusValue)
      : Math.abs(maxVal - minVal);

    const avgConfidence = items.reduce((sum, i) => sum + i.weight, 0) / totalWeight;

    subjectEstimates.set(subject, {
      subject,
      consensusValue,
      observedValues: values,
      disagreement,
      confidence: Math.min(1, avgConfidence),
      sourceCount: items.length,
    });
  }

  // 3. subject -> nodeId 映射
  const subjectToNodeId = new Map<string, string>();
  for (const node of pack.nodes) {
    if (node.metrics) {
      for (const metric of node.metrics) {
        subjectToNodeId.set(metric, node.nodeId);
      }
    }
  }

  // 4. 按 nodeId 聚合
  const nodeMap = new Map<string, SubjectEstimate[]>();
  for (const [subject, estimate] of subjectEstimates) {
    const nodeId = subjectToNodeId.get(subject);
    if (!nodeId) continue; // 该 subject 不在任何节点上
    const list = nodeMap.get(nodeId) ?? [];
    list.push(estimate);
    nodeMap.set(nodeId, list);
  }

  // 5. 构建 NodeEstimate[]
  const result: NodeEstimate[] = [];
  for (const node of pack.nodes) {
    const subjects = nodeMap.get(node.nodeId);
    if (!subjects || subjects.length === 0) continue;
    const confidence = subjects.reduce((sum, s) => sum + s.confidence, 0) / subjects.length;
    result.push({
      nodeId: node.nodeId,
      position: node.position,
      subjects: subjects.sort((a, b) => b.confidence - a.confidence),
      confidence: Math.round(confidence * 1000) / 1000,
    });
  }

  return result.sort((a, b) => a.position - b.position);
}

/**
 * 查找某节点某指标的共识值。
 * @returns 共识值，或 undefined（该节点无该指标的估计）
 */
export function findConsensusValue(
  estimates: NodeEstimate[],
  nodeId: string,
  subject: string,
): number | undefined {
  const node = estimates.find((e) => e.nodeId === nodeId);
  if (!node) return undefined;
  return node.subjects.find((s) => s.subject === subject)?.consensusValue;
}
