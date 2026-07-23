/**
 * analysis/chain-propagator.ts - 链路传导推算引擎
 *
 * 从上游节点的观测值出发，沿 transmissionPaths 正向推算下游应有值，
 * 再与下游实际观测值比较，找出"未解释的偏差"。
 *
 * 核心公式：
 *   上游变化率 Δ% = (observed_upstream - baseline_upstream) / baseline_upstream
 *   下游应有值 expected = baseline_downstream × (1 + Δ% × coefficient)
 *   偏差 = observed_downstream - expected
 *   偏差率 = |偏差| / |expected|
 *
 * 偏差率大 = 该节点有"未解释的异常"（利润挤压/囤货/其他因素）。
 *
 * baseline 来源：IndustryPack.knownRanges 的中点 (min+max)/2。
 */

import type { IndustryPack, TransmissionPath } from "../core/industry-pack";
import type { NodeEstimate } from "./chain-estimator";
import { findConsensusValue } from "./chain-estimator";

/** 单个节点的传导推算结果 */
export interface NodePropagation {
  /** 节点 ID */
  nodeId: string;
  /** 节点位置 */
  position: number;
  /** 实际观测值（该节点主指标的共识值，无观测则为 null） */
  observed: number | null;
  /** 从上游推算的应有值（无上游观测则为 null） */
  expected: number | null;
  /** 偏差 = observed - expected（两者都有时才有值） */
  deviation: number | null;
  /** 偏差率 = |deviation| / |expected|（两者都有时才有值） */
  deviationRate: number | null;
  /** 严重度："none" | "low" | "moderate" | "high" */
  severity: "none" | "low" | "moderate" | "high";
  /** 该节点的主指标 key */
  primarySubject: string;
  /** 推算来源路径（哪条 transmissionPath 推过来的） */
  fromPath?: { from: string; to: string; coefficient: number };
}

/** 全链传导推算结果 */
export interface PropagationResult {
  /** 各节点的推算结果 */
  nodeResults: NodePropagation[];
  /** 全链加权偏差率（各节点 deviationRate 的加权平均，权重 = position） */
  chainDeviation: number;
  /** 偏差最大的节点 ID（瓶颈节点） */
  bottleneckNodeId: string | null;
  /** 推算覆盖率：有多少比例的节点有 expected 值 */
  coverage: number;
  /**
   * v3: 反向逆推结果 - 从下游品牌/市场反馈值逆推上游各节点应有值。
   * 让"单一品牌反馈"能推算出全链真实信息。
   */
  reversePropagation?: ReversePropagationResult;
}

/** 偏差率阈值 */
const DEVIATION_THRESHOLDS = {
  low: 0.10,      // < 10% = low
  moderate: 0.25, // < 25% = moderate
  // >= 25% = high
};

/**
 * 获取某节点的主指标（第一个有观测值的指标，否则第一个声明的指标）。
 */
function getPrimarySubject(
  estimates: NodeEstimate[],
  pack: IndustryPack,
  nodeId: string,
): string | null {
  const node = pack.nodes.find((n) => n.nodeId === nodeId);
  if (!node?.metrics || node.metrics.length === 0) return null;

  // 优先返回有观测值的指标
  const estimate = estimates.find((e) => e.nodeId === nodeId);
  if (estimate && estimate.subjects.length > 0) {
    return estimate.subjects[0].subject;
  }
  return node.metrics[0];
}

/**
 * 获取某指标的基线值（knownRanges 中点）。
 */
function getBaseline(pack: IndustryPack, subject: string): number | null {
  const range = pack.knownRanges[subject];
  if (!range) return null;
  return (range.min + range.max) / 2;
}

/**
 * 沿 transmissionPaths 正向推算下游应有值。
 *
 * 算法：
 *   1. 对每条非回环 transmissionPath（from.position < to.position）：
 *      a. 找 from 节点的主指标观测值和基线
 *      b. 找 to 节点的主指标基线
 *      c. 计算 expected = baseline_to × (1 + Δ% × coefficient)
 *   2. 如果 to 节点有多个上游路径，取第一条有观测值的路径
 *   3. 对每个节点比较 observed vs expected
 */
export function propagateChain(
  estimates: NodeEstimate[],
  pack: IndustryPack,
): PropagationResult {
  if (!pack.transmissionPaths || pack.transmissionPaths.length === 0) {
    return { nodeResults: [], chainDeviation: 0, bottleneckNodeId: null, coverage: 0 };
  }

  // 过滤回环边
  const forwardPaths = pack.transmissionPaths.filter((path) => {
    const fromNode = pack.nodes.find((n) => n.nodeId === path.from);
    const toNode = pack.nodes.find((n) => n.nodeId === path.to);
    return fromNode && toNode && fromNode.position < toNode.position;
  });

  // 为每个节点计算 expected
  const nodeResults: NodePropagation[] = [];
  let totalDeviationRate = 0;
  let deviationCount = 0;
  let nodesWithExpected = 0;

  for (const node of pack.nodes) {
    if (node.position === 0) continue; // 跳过风险节点

    const primarySubject = getPrimarySubject(estimates, pack, node.nodeId);
    if (!primarySubject) continue;

    const observed = findConsensusValue(estimates, node.nodeId, primarySubject);
    const baseline = getBaseline(pack, primarySubject);

    // 找上游路径：谁传导到这个节点
    const upstreamPath = forwardPaths.find((p) => p.to === node.nodeId);

    let expected: number | null = null;
    let fromPath: NodePropagation["fromPath"] | undefined;

    if (upstreamPath && baseline !== null) {
      const fromPrimarySubject = getPrimarySubject(estimates, pack, upstreamPath.from);
      if (fromPrimarySubject) {
        const fromObserved = findConsensusValue(estimates, upstreamPath.from, fromPrimarySubject);
        const fromBaseline = getBaseline(pack, fromPrimarySubject);

        if (fromObserved !== undefined && fromBaseline !== null && fromBaseline !== 0) {
          // 上游变化率
          const deltaPct = (fromObserved - fromBaseline) / fromBaseline;
          // 下游应有值
          expected = baseline * (1 + deltaPct * upstreamPath.coefficient);
          fromPath = {
            from: upstreamPath.from,
            to: upstreamPath.to,
            coefficient: upstreamPath.coefficient,
          };
        }
      }
    }

    if (expected !== null) nodesWithExpected++;

    // 计算偏差
    let deviation: number | null = null;
    let deviationRate: number | null = null;
    let severity: NodePropagation["severity"] = "none";

    if (observed !== undefined && expected !== null && expected !== 0) {
      deviation = observed - expected;
      deviationRate = Math.abs(deviation) / Math.abs(expected);
      totalDeviationRate += deviationRate;
      deviationCount++;

      if (deviationRate < DEVIATION_THRESHOLDS.low) severity = "low";
      else if (deviationRate < DEVIATION_THRESHOLDS.moderate) severity = "moderate";
      else severity = "high";
    }

    nodeResults.push({
      nodeId: node.nodeId,
      position: node.position,
      observed: observed ?? null,
      expected,
      deviation,
      deviationRate,
      severity,
      primarySubject,
      fromPath,
    });
  }

  // 全链加权偏差率
  const chainDeviation = deviationCount > 0
    ? Math.round((totalDeviationRate / deviationCount) * 1000) / 1000
    : 0;

  // 瓶颈节点 = 偏差率最大的节点
  let bottleneckNodeId: string | null = null;
  let maxDeviationRate = 0;
  for (const nr of nodeResults) {
    if (nr.deviationRate !== null && nr.deviationRate > maxDeviationRate) {
      maxDeviationRate = nr.deviationRate;
      bottleneckNodeId = nr.nodeId;
    }
  }

  // 覆盖率
  const totalNodes = pack.nodes.filter((n) => n.position > 0).length;
  const coverage = totalNodes > 0 ? nodesWithExpected / totalNodes : 0;

  return {
    nodeResults: nodeResults.sort((a, b) => a.position - b.position),
    chainDeviation,
    bottleneckNodeId,
    coverage: Math.round(coverage * 100) / 100,
    // v3: 同时执行反向逆推，让"品牌反馈"能逆推全链
    reversePropagation: reversePropagateChain(estimates, pack) ?? undefined,
  };
}

// === v3: 反向逆推 - 从下游品牌/市场反馈逆推上游应有值 ===

/** 单个节点的反向逆推结果 */
export interface ReverseNodePropagation {
  /** 节点 ID */
  nodeId: string;
  /** 节点位置 */
  position: number;
  /** 实际观测值（无观测则为 null） */
  observed: number | null;
  /** 从下游逆推的应有值 */
  impliedValue: number | null;
  /** 逆推变化率 = (implied - baseline) / baseline */
  impliedDeltaPct: number | null;
  /** 观测值与逆推值的偏差 */
  deviation: number | null;
  /** 偏差率 */
  deviationRate: number | null;
  /** 主指标 key */
  primarySubject: string;
  /** 逆推来源路径 */
  fromPath?: { from: string; to: string; coefficient: number };
}

/** 反向逆推结果 */
export interface ReversePropagationResult {
  /** 起点：逆推的出发点（最下游有观测值的节点） */
  anchorNodeId: string;
  /** 起点 subject */
  anchorSubject: string;
  /** 起点观测值 */
  anchorValue: number;
  /** 各节点的逆推结果（按 position 降序，从锚点往上游） */
  nodeResults: ReverseNodePropagation[];
  /** 逆推覆盖率 */
  coverage: number;
  /** 逆推一致性：观测值与逆推值的整体吻合度 0-1（越高越一致） */
  consistency: number;
}

/**
 * 从下游节点（如品牌/零售）的观测值出发，反向逆推上游各节点应有值。
 *
 * 反向公式（正传导的逆运算）：
 *   正向: downstream_delta% = upstream_delta% × coefficient
 *   反向: upstream_delta% = downstream_delta% / coefficient
 *   upstream_implied = baseline_upstream × (1 + downstream_delta% / coefficient)
 *
 * 应用场景：
 *   - 只拿到品牌零售价反馈 -> 逆推棉花应有价格
 *   - 品牌方说"零售价涨了50%" -> 逆推各环节真实成本变化
 *   - 比较逆推值与实际观测值 -> 找出哪个环节"吃掉了"利润
 *
 * @param estimates 节点级估计
 * @param pack 行业包
 * @returns 反向逆推结果，或 null（无下游观测值时）
 */
export function reversePropagateChain(
  estimates: NodeEstimate[],
  pack: IndustryPack,
): ReversePropagationResult | null {
  if (!pack.transmissionPaths || pack.transmissionPaths.length === 0) return null;

  // 过滤回环边，构建正向邻接表
  const forwardPaths = pack.transmissionPaths.filter((path) => {
    const fromNode = pack.nodes.find((n) => n.nodeId === path.from);
    const toNode = pack.nodes.find((n) => n.nodeId === path.to);
    return fromNode && toNode && fromNode.position < toNode.position;
  });

  // 构建反向邻接表：to -> [from, coefficient]（从下游找上游）
  const reverseAdjacency = new Map<string, Array<{ from: string; coefficient: number }>>();
  for (const path of forwardPaths) {
    const upstreams = reverseAdjacency.get(path.to) ?? [];
    upstreams.push({ from: path.from, coefficient: path.coefficient });
    reverseAdjacency.set(path.to, upstreams);
  }

  // 找最下游有观测值的节点作为锚点
  let anchorNodeId: string | null = null;
  let anchorSubject: string | null = null;
  let anchorValue: number | undefined;
  let maxPosition = 0;

  for (const node of pack.nodes) {
    if (node.position === 0) continue;
    const subject = getPrimarySubject(estimates, pack, node.nodeId);
    if (!subject) continue;
    const observed = findConsensusValue(estimates, node.nodeId, subject);
    if (observed !== undefined && node.position > maxPosition) {
      maxPosition = node.position;
      anchorNodeId = node.nodeId;
      anchorSubject = subject;
      anchorValue = observed;
    }
  }

  if (!anchorNodeId || !anchorSubject || anchorValue === undefined) return null;

  // 锚点自身的 implied delta（需要锚点的 baseline 来计算）
  const anchorBaseline = getBaseline(pack, anchorSubject);
  if (anchorBaseline === null) return null;
  const anchorDeltaPct = (anchorValue - anchorBaseline) / anchorBaseline;

  // BFS 反向遍历：传播 implied delta 百分比（不依赖 baseline，只依赖 coefficient）
  // implied value 仅在节点有 baseline 时计算
  const impliedDeltas = new Map<string, {
    deltaPct: number;
    fromPath?: { from: string; to: string; coefficient: number };
  }>();
  impliedDeltas.set(anchorNodeId, { deltaPct: anchorDeltaPct });

  const visited = new Set<string>([anchorNodeId]);
  const queue = [anchorNodeId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentImplied = impliedDeltas.get(current);
    if (!currentImplied) continue;

    const upstreams = reverseAdjacency.get(current) ?? [];
    for (const { from, coefficient } of upstreams) {
      if (visited.has(from)) continue;
      visited.add(from);
      if (coefficient === 0) continue;

      // 反向公式：upstream_delta% = downstream_delta% / coefficient
      // 这一步不需要 baseline，只传递变化率
      const upstreamDeltaPct = currentImplied.deltaPct / coefficient;
      impliedDeltas.set(from, {
        deltaPct: upstreamDeltaPct,
        fromPath: { from, to: current, coefficient },
      });
      queue.push(from);
    }
  }

  // 构建 implied values：每个有 baseline 的节点计算 impliedValue
  const impliedValues = new Map<string, {
    value: number | null;
    deltaPct: number;
    fromPath?: { from: string; to: string; coefficient: number };
  }>();
  for (const [nodeId, info] of impliedDeltas) {
    const subject = getPrimarySubject(estimates, pack, nodeId);
    const baseline = subject ? getBaseline(pack, subject) : null;
    impliedValues.set(nodeId, {
      value: baseline !== null ? baseline * (1 + info.deltaPct) : null,
      deltaPct: info.deltaPct,
      fromPath: info.fromPath,
    });
  }
  // 覆盖锚点：锚点的 impliedValue = 观测值（而非 baseline × delta）
  impliedValues.set(anchorNodeId, {
    value: anchorValue,
    deltaPct: anchorDeltaPct,
  });

  // 构建结果
  const nodeResults: ReverseNodePropagation[] = [];
  let consistencySum = 0;
  let consistencyCount = 0;

  for (const node of pack.nodes) {
    if (node.position === 0) continue;
    const subject = getPrimarySubject(estimates, pack, node.nodeId);
    if (!subject) continue;

    const implied = impliedValues.get(node.nodeId);
    const observed = findConsensusValue(estimates, node.nodeId, subject);

    let deviation: number | null = null;
    let deviationRate: number | null = null;

    // 只有当 implied value 存在（非 null）且 observed 存在时才计算偏差
    if (observed !== undefined && implied && implied.value !== null && typeof implied.value === "number") {
      deviation = observed - implied.value;
      deviationRate = implied.value !== 0 ? Math.abs(deviation) / Math.abs(implied.value) : 0;
      consistencySum += 1 / (1 + deviationRate); // 越接近1越一致
      consistencyCount++;
    }

    nodeResults.push({
      nodeId: node.nodeId,
      position: node.position,
      observed: observed ?? null,
      impliedValue: (implied?.value !== null && typeof implied?.value === "number") ? implied.value : null,
      impliedDeltaPct: implied?.deltaPct ?? null,
      deviation,
      deviationRate,
      primarySubject: subject,
      fromPath: implied?.fromPath,
    });
  }

  // 按 position 降序排列（从锚点往上游）
  nodeResults.sort((a, b) => b.position - a.position);

  const totalNodes = pack.nodes.filter((n) => n.position > 0).length;
  const coverage = totalNodes > 0 ? impliedValues.size / totalNodes : 0;
  const consistency = consistencyCount > 0 ? consistencySum / consistencyCount : 0;

  return {
    anchorNodeId,
    anchorSubject,
    anchorValue,
    nodeResults,
    coverage: Math.round(coverage * 100) / 100,
    consistency: Math.round(consistency * 1000) / 1000,
  };
}

/**
 * 格式化反向逆推结果为人类可读文本。
 */
export function formatReversePropagation(result: ReversePropagationResult): string {
  const lines: string[] = [];
  lines.push(`Reverse Propagation from anchor: ${result.anchorNodeId}.${result.anchorSubject} = ${result.anchorValue}`);
  lines.push(`Consistency: ${(result.consistency * 100).toFixed(1)}% | Coverage: ${(result.coverage * 100).toFixed(0)}%`);
  lines.push("");
  lines.push("Implied upstream values (brand feedback -> raw material):");

  for (const nr of result.nodeResults) {
    const obsStr = nr.observed !== null ? nr.observed.toFixed(1) : "-";
    const implStr = nr.impliedValue !== null ? nr.impliedValue.toFixed(1) : "-";
    const deltaStr = nr.impliedDeltaPct !== null ? `${(nr.impliedDeltaPct * 100).toFixed(1)}%` : "-";
    const devStr = nr.deviation !== null ? nr.deviation.toFixed(1) : "-";
    const rateStr = nr.deviationRate !== null ? `${(nr.deviationRate * 100).toFixed(1)}%` : "-";
    const pathStr = nr.fromPath ? ` [via ${nr.fromPath.to}, coeff=${nr.fromPath.coefficient}]` : "";
    lines.push(
      `  ${nr.nodeId.padEnd(16)} observed=${obsStr.padStart(10)}  implied=${implStr.padStart(10)}  ` +
      `impliedΔ=${deltaStr.padStart(7)}  dev=${devStr.padStart(10)}  rate=${rateStr.padStart(6)}${pathStr}`
    );
  }

  return lines.join("\n");
}
export function formatPropagation(result: PropagationResult): string {
  const lines: string[] = [];
  lines.push(`Chain Deviation: ${(result.chainDeviation * 100).toFixed(1)}%`);
  lines.push(`Bottleneck: ${result.bottleneckNodeId ?? "none"}`);
  lines.push(`Coverage: ${(result.coverage * 100).toFixed(0)}%`);
  lines.push("");
  lines.push("Node-by-node propagation:");

  for (const nr of result.nodeResults) {
    const obsStr = nr.observed !== null ? nr.observed.toFixed(1) : "—";
    const expStr = nr.expected !== null ? nr.expected.toFixed(1) : "—";
    const devStr = nr.deviation !== null ? nr.deviation.toFixed(1) : "—";
    const rateStr = nr.deviationRate !== null ? `${(nr.deviationRate * 100).toFixed(1)}%` : "—";
    const pathStr = nr.fromPath ? ` [from ${nr.fromPath.from}, coeff=${nr.fromPath.coefficient}]` : "";
    lines.push(
      `  ${nr.nodeId.padEnd(16)} observed=${obsStr.padStart(10)}  expected=${expStr.padStart(10)}  ` +
      `dev=${devStr.padStart(10)}  rate=${rateStr.padStart(6)}  [${nr.severity}]${pathStr}`
    );
  }

  return lines.join("\n");
}
