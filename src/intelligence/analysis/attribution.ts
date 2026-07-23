/**
 * analysis/attribution.ts — 第一性归因引擎
 *
 * 从观测症状出发，反向遍历 Layer 2 关联图中 relation="causes" 的边，
 * 找到没有上游因的叶节点 = 第一性根因。
 *
 * 置信度随链长连乘衰减：
 *   cumulativeWeight = Π(weight_i)
 *   长链归因可信度低 → 触发补充采集
 *   短链归因可信度高 → 可直接行动
 *
 * 叶节点判定：在 causes 图中没有 toKey = 该节点的边。
 * 即：该节点不被任何其它节点 causes，它就是"第一性"的。
 *
 * 防环：维护 visited 集合，遇到已访问节点则停止（避免循环因果）。
 */

import type { MemoryAssociation } from "../memory/types";

/** 归因链 — 从第一性根因到观测症状的完整因果路径 */
export interface AttributionChain {
  /** 第一性根因（叶节点，无更上游的 causes 边） */
  rootCause: string;
  /** 因果路径：从根因到症状的完整序列 [rootCause, ..., symptom] */
  path: string[];
  /** 观测症状（起点，反向遍历的出发点） */
  symptom: string;
  /** 累积置信度 = Π(weight_i)，随链长指数衰减 */
  cumulativeWeight: number;
  /** 链长（跳数）= path.length - 1 */
  hops: number;
  /** 是否高置信度（cumulativeWeight >= ATTRIBUTION_CONFIDENCE_THRESHOLD） */
  highConfidence: boolean;
  /**
   * v3: 每跳的权重 - path[i] -> path[i+1] 的边权重。
   * 长度 = hops。用于 formatAttribution 展示传导强度。
   * 如 [0.6, 0.5, 0.4] 表示根因->中继1 权重0.6，中继1->中继2 权重0.5，中继2->症状 权重0.4。
   */
  hopWeights?: number[];
}

/** 归因置信度阈值 — 低于此值表示链太长/太弱，需补充证据 */
export const ATTRIBUTION_CONFIDENCE_THRESHOLD = 0.15;

/** 最大遍历深度 — 防止无限递归 */
export const MAX_ATTRIBUTION_DEPTH = 10;

/**
 * 反向遍历 causes 边，找第一性根因。
 *
 * 算法：
 *   1. 从 symptom 出发，找所有 toKey = symptom 且 relation = "causes" 的边
 *   2. 对每个上游因（fromKey），递归向上找
 *   3. 如果某个节点没有更上游的 causes 边 → 它是叶节点（第一性根因）
 *   4. 累积置信度 = 路径上所有 weight 的连乘
 *   5. 返回置信度最高的归因链（多条候选时取 cumulativeWeight 最大的）
 *
 * @param symptom 观测症状的 key（如 "cotton_price_up"）
 * @param associations Layer 2 全部关联边
 * @returns 最佳归因链，或 null（无 causes 边时）
 */
export function traceAttribution(
  symptom: string,
  associations: MemoryAssociation[],
): AttributionChain | null {
  // 构建 causes 图：toKey → [{ fromKey, weight }]
  const causesGraph = new Map<string, Array<{ fromKey: string; weight: number }>>();
  for (const assoc of associations) {
    if (assoc.relation !== "causes") continue;
    const edges = causesGraph.get(assoc.toKey) ?? [];
    edges.push({ fromKey: assoc.fromKey, weight: assoc.weight });
    causesGraph.set(assoc.toKey, edges);
  }

  // 如果症状没有任何上游 causes 边，它自己就是根因（0 跳）
  const upstream = causesGraph.get(symptom);
  if (!upstream || upstream.length === 0) {
    return {
      rootCause: symptom,
      path: [symptom],
      symptom,
      cumulativeWeight: 1.0,
      hops: 0,
      highConfidence: true,
    };
  }

  // DFS 反向遍历，找所有从 symptom 到叶节点的路径
  const allChains: AttributionChain[] = [];
  const visited = new Set<string>();
  visited.add(symptom);

  function dfs(current: string, path: string[], hopWeights: number[], cumulativeWeight: number, depth: number): void {
    if (depth >= MAX_ATTRIBUTION_DEPTH) {
      // 达到最大深度，当前节点作为根因
      allChains.push({
        rootCause: current,
        path: [...path],
        symptom,
        cumulativeWeight,
        hops: path.length - 1,
        highConfidence: cumulativeWeight >= ATTRIBUTION_CONFIDENCE_THRESHOLD,
        hopWeights: [...hopWeights],
      });
      return;
    }

    const upstreamEdges = causesGraph.get(current);
    if (!upstreamEdges || upstreamEdges.length === 0) {
      // 叶节点 - 没有更上游的 causes 边 -> 第一性根因
      allChains.push({
        rootCause: current,
        path: [...path],
        symptom,
        cumulativeWeight,
        hops: path.length - 1,
        highConfidence: cumulativeWeight >= ATTRIBUTION_CONFIDENCE_THRESHOLD,
        hopWeights: [...hopWeights],
      });
      return;
    }

    // 递归遍历每条上游边
    let hasUnvisitedUpstream = false;
    for (const edge of upstreamEdges) {
      if (visited.has(edge.fromKey)) {
        // 环检测 - 跳过已访问节点
        continue;
      }
      hasUnvisitedUpstream = true;
      visited.add(edge.fromKey);
      dfs(edge.fromKey, [...path, edge.fromKey], [...hopWeights, edge.weight], cumulativeWeight * edge.weight, depth + 1);
      visited.delete(edge.fromKey);
    }

    // 如果所有上游节点都已访问过（循环因果），当前节点作为根因
    if (!hasUnvisitedUpstream) {
      allChains.push({
        rootCause: current,
        path: [...path],
        symptom,
        cumulativeWeight,
        hops: path.length - 1,
        highConfidence: cumulativeWeight >= ATTRIBUTION_CONFIDENCE_THRESHOLD,
        hopWeights: [...hopWeights],
      });
    }
  }

  dfs(symptom, [symptom], [], 1.0, 0);

  if (allChains.length === 0) {
    return null;
  }

  // 取累积置信度最高的链
  allChains.sort((a, b) => b.cumulativeWeight - a.cumulativeWeight);
  return allChains[0];
}

/**
 * 批量归因 — 对多个症状同时做归因分析。
 * 返回每个症状的最佳归因链。
 */
export function traceAttributionBatch(
  symptoms: string[],
  associations: MemoryAssociation[],
): Array<{ symptom: string; chain: AttributionChain | null }> {
  return symptoms.map((symptom) => ({
    symptom,
    chain: traceAttribution(symptom, associations),
  }));
}

/**
 * 归因报告 - 人类可读的归因链描述。
 * v3: 当 hopWeights 存在时，展示每跳的传导权重。
 */
export function formatAttribution(chain: AttributionChain): string {
  const confidencePct = (chain.cumulativeWeight * 100).toFixed(1);
  const confidenceLabel = chain.highConfidence ? "HIGH" : "LOW";

  // v3: 如果有每跳权重，展示带权重的路径
  if (chain.hopWeights && chain.hopWeights.length > 0) {
    const parts: string[] = [chain.path[0]];
    for (let i = 0; i < chain.hopWeights.length; i++) {
      parts.push(`--(${chain.hopWeights[i].toFixed(2)})-->`);
      parts.push(chain.path[i + 1]);
    }
    const pathStr = parts.join(" ");
    return `[${confidenceLabel} ${confidencePct}%] ${pathStr} (root: ${chain.rootCause}, ${chain.hops} hops)`;
  }

  const pathStr = chain.path.join(" -> ");
  return `[${confidenceLabel} ${confidencePct}%] ${pathStr} (root: ${chain.rootCause}, ${chain.hops} hops)`;
}

/**
 * 判断归因链是否需要补充证据。
 * 置信度低于阈值时返回 true — Feedback 据此生成"补充采集"FollowUpTask。
 */
export function needsMoreEvidence(chain: AttributionChain): boolean {
  return !chain.highConfidence;
}
