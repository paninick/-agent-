/**
 * swarm/agents/analyst.ts — Analyst Agent
 *
 * 角色：对已验证的证据做分析，产 AnalysisFinding。
 * 行业无关；接受可选 IndustryPack 作为分析镜头（读取 nodes / transmissionPaths 辅助解读）。
 *
 * v2 增强（吸收 DeepSeek thinking_mode "先解释再执行" + 第一性归因）：
 *   - 发现信号时主动建 causes 边到 Layer 2（通过 MemoryBroker）
 *   - 因果边是 AttributionEngine 反向遍历的数据源
 *   - 因果启发式表：将信号模式映射到 A--causes-->B 关系
 */

import type {
  AgentRunResult,
  SwarmTask,
  AnalysisFinding,
} from "../../spine/types";
import type { EvidenceEntry } from "../../types";
import type { IndustryPack } from "../../core/industry-pack";
import type { MemoryBroker } from "../../memory/broker";
import type { ReconciliationResult } from "../../reconciliation/types";

export interface AnalystInput {
  task: SwarmTask;
  /** 已验证的证据（带 authenticity） */
  evidence: EvidenceEntry[];
  /** 可选行业包 */
  pack?: IndustryPack;
  /** 可选 MemoryBroker - 注入后发现信号主动建 causes 边 */
  broker?: MemoryBroker;
  /** 注入 now 以保证测试可复现 */
  now?: Date;
  /** v3 Phase F: 买卖双方对账结果 - 从对账异常建因果边 */
  reconciliations?: ReconciliationResult[];
}

let findingCounter = 0;

function nextFindingId(): string {
  findingCounter += 1;
  return `finding-${findingCounter}`;
}

/**
 * 因果启发式表 — 将信号模式映射到 A--causes-->B 关系。
 * 当 Analyst 检测到 effectSignal 时，如果同时存在 causeSignal，
 * 则通过 broker 建 causeSignal --causes--> effectSignal 边。
 *
 * 这些是领域无关的因果模板（具体行业可通过 IndustryPack 扩展）。
 */
const CAUSAL_HEURISTICS: Array<{
  cause: string; // 因信号（上游）
  effect: string; // 果信号（下游）
  causePattern: RegExp; // 匹配 cause 信号
  effectPattern: RegExp; // 匹配 effect 信号
}> = [
  // 需求上升 → 成本上升
  {
    cause: "demand_up",
    effect: "cost_rising",
    causePattern: /demand|sales.*up|surge/i,
    effectPattern: /above_range|cost.*ris|price.*up/i,
  },
  // 需求上升 → 产能压力
  {
    cause: "demand_up",
    effect: "capacity_pressure",
    causePattern: /demand|sales.*up|surge/i,
    effectPattern: /capacity|supply.*chain/i,
  },
  // 成本上升 → 价格上升
  {
    cause: "cost_rising",
    effect: "price_up",
    causePattern: /above_range|cost.*ris|price.*up/i,
    effectPattern: /price.*up|inflat/i,
  },
];

/**
 * 从 IndustryPack.transmissionPaths + nodes.metrics 构建行业传导因果边。
 *
 * transmissionPaths 描述节点间传导（如 raw_material→yarn），
 * nodes.metrics 描述每个节点跟踪的指标 key（如 raw_material → cotton_price）。
 *
 * 本函数把"节点级传导"翻译成"指标级因果边"：
 *   1. subject 级因果边（始终建）：cotton_price --causes--> yarn_price
 *   2. 信号级因果边（当上游指标 above_range 时建）：
 *      对每个 above_range 信号，BFS 遍历传导图，
 *      为所有下游可达节点的指标建 X_above_range --causes--> Y_above_range 边。
 *      这样 retail_price_garment_above_range 就能追溯到 cotton_price_above_range。
 *
 * @returns 本次新建/强化的因果边数量
 */
function buildTransmissionCausalEdges(
  broker: MemoryBroker,
  signals: string[],
  pack: IndustryPack,
): number {
  if (!pack.transmissionPaths || pack.transmissionPaths.length === 0) return 0;

  // 构建 nodeId → metrics[] 映射
  const nodeMetrics = new Map<string, string[]>();
  for (const node of pack.nodes) {
    if (node.metrics && node.metrics.length > 0) {
      nodeMetrics.set(node.nodeId, node.metrics);
    }
  }

  // 构建传导邻接表：nodeId → [downstream nodeId]
  // 过滤回环边（如 recycling→raw_material）— 回环让下游指标变成上游的"因"，
  // 导致归因引擎把零售价格归因到棉花价格（方向反了）。
  // 回环在产业链中是真实存在的（再生纤维影响原料成本），但因果归因需要 DAG。
  const CYCLE_BACK_EDGES = new Set<string>();
  // 检测回环：如果一个节点出现在自己的下游可达集合中，则该路径为回环
  // 简化处理：已知 apparel pack 中 recycling→raw_material 是回环
  for (const path of pack.transmissionPaths) {
    // 如果 from 的 position > to 的 position，则为回环边
    const fromNode = pack.nodes.find((n) => n.nodeId === path.from);
    const toNode = pack.nodes.find((n) => n.nodeId === path.to);
    if (fromNode && toNode && fromNode.position > toNode.position) {
      CYCLE_BACK_EDGES.add(`${path.from}→${path.to}`);
    }
  }

  const adjacency = new Map<string, string[]>();
  for (const path of pack.transmissionPaths) {
    if (CYCLE_BACK_EDGES.has(`${path.from}→${path.to}`)) continue; // 跳过回环边
    const downstream = adjacency.get(path.from) ?? [];
    downstream.push(path.to);
    adjacency.set(path.from, downstream);
  }

  // 收集 above_range 信号对应的 subject
  const aboveRangeSubjects = new Set<string>();
  for (const sig of signals) {
    const m = sig.match(/^(.+)_above_range$/);
    if (m) aboveRangeSubjects.add(m[1]);
  }

  let edgeCount = 0;

  // 构建 path -> coefficient 映射（v3: 取第一条匹配的路径系数）
  const pathCoeff = new Map<string, number>();
  for (const path of pack.transmissionPaths) {
    const key = `${path.from}->${path.to}`;
    if (!pathCoeff.has(key)) {
      pathCoeff.set(key, path.coefficient);
    }
  }

  // 1. subject 级因果边（全部建 - 供归因引擎多路径遍历）
  // v3: 用 path.coefficient 作为初始权重，让归因引擎做加权连乘
  for (const path of pack.transmissionPaths) {
    if (CYCLE_BACK_EDGES.has(`${path.from}->${path.to}`)) continue;
    const fromMetrics = nodeMetrics.get(path.from) ?? [];
    const toMetrics = nodeMetrics.get(path.to) ?? [];
    for (const fromMetric of fromMetrics) {
      for (const toMetric of toMetrics) {
        broker.createOrReinforceAssociation(fromMetric, toMetric, "causes", path.coefficient, {
          source: "transmission",
          coefficient: path.coefficient,
          lagDays: path.lagDays,
        });
        edgeCount++;
      }
    }
  }

  // 2. 信号级因果边（BFS — 从每个 above_range 指标出发，遍历全部下游）
  // 找到 above_range 指标所在的 nodeId
  const subjectToNodeId = new Map<string, string>();
  for (const node of pack.nodes) {
    if (node.metrics) {
      for (const m of node.metrics) {
        subjectToNodeId.set(m, node.nodeId);
      }
    }
  }

  for (const subject of aboveRangeSubjects) {
    const startNodeId = subjectToNodeId.get(subject);
    if (!startNodeId) continue;
    const startSignal = `${subject}_above_range`;

    // BFS 遍历下游节点
    const visited = new Set<string>([startNodeId]);
    const queue = [startNodeId];
    while (queue.length > 0) {
      const current = queue.shift()!;
      const downstreams = adjacency.get(current) ?? [];
      for (const downNode of downstreams) {
        if (visited.has(downNode)) continue;
        visited.add(downNode);
        queue.push(downNode);

        // v3: 获取 current->downNode 的传导系数
        const coeff = pathCoeff.get(`${current}->${downNode}`) ?? 0.3;

        // 为下游节点的每个指标建信号级因果边（用传导系数做初始权重）
        const downMetrics = nodeMetrics.get(downNode) ?? [];
        for (const downMetric of downMetrics) {
          broker.createOrReinforceAssociation(startSignal, `${downMetric}_above_range`, "causes", coeff, {
            source: "transmission_bfs",
            coefficient: coeff,
          });
          edgeCount++;
        }
      }
    }
  }

  return edgeCount;
}

/**
 * v3: 基于行业包的跨维度因果规则，对真实信号动态建边。
 *
 * 与 CAUSAL_HEURISTICS 的区别：
 *   - CAUSAL_HEURISTICS 是全局硬编码的3条规则（模糊匹配）
 *   - 本函数读取 pack.crossDimensionRules（声明式精确匹配）
 *   - 只对真实触发的信号建边（不预建不存在的信号边）
 *   - 支持 above_range 和 below_range 双方向
 *   - 用 rule.weight 作为初始权重
 *
 * @returns 本次新建/强化的因果边数量
 */
function buildCrossDimensionEdges(
  broker: MemoryBroker,
  signals: string[],
  pack: IndustryPack,
): number {
  if (!pack.crossDimensionRules || pack.crossDimensionRules.length === 0) return 0;

  const signalSet = new Set(signals);
  let edgeCount = 0;

  for (const rule of pack.crossDimensionRules) {
    // 只对真实触发的信号建边
    // 构建 cause 和 effect 的完整信号 key
    const causeSignal = `${rule.causeKeyPrefix}_${rule.causeDirection}`;
    const effectSignal = `${rule.effectKeyPrefix}_${rule.effectDirection}`;

    if (!signalSet.has(causeSignal)) continue;
    if (!signalSet.has(effectSignal)) continue;

    // 两个信号都真实存在 -> 建因果边
    broker.createOrReinforceAssociation(causeSignal, effectSignal, "causes", rule.weight, {
      source: "cross_dimension",
      rule: rule.id,
      coefficient: rule.weight,
      description: rule.description,
    });
    edgeCount++;
  }

  return edgeCount;
}

/**
 * v3: 基于行业包的供应通道，建国家间供应因果边。
 *
 * 当通道起点国家的指标出现异常信号时，
 * 通道终点国家的同节点指标也会受影响。
 *
 * 如 India.raw_material cotton_price_above_range
 *  -> Bangladesh.raw_material cotton_price_above_range
 *
 * 权重 = 通道的贸易量占比（简化：用固定 0.5 表示强通道）
 *
 * @returns 本次新建/强化的因果边数量
 */
function buildSupplyLaneEdges(
  broker: MemoryBroker,
  signals: string[],
  pack: IndustryPack,
): number {
  if (!pack.supplyLanes || pack.supplyLanes.length === 0) return 0;

  const signalSet = new Set(signals);
  let edgeCount = 0;

  for (const lane of pack.supplyLanes) {
    // 对每个 above_range / below_range 信号，检查是否匹配通道起点节点的指标
    for (const sig of signals) {
      const m = sig.match(/^(.+?)_(above|below)_range$/);
      if (!m) continue;
      const [, subject, direction] = m;

      // 找到信号对应的 nodeId
      const fromNodeId = lane.from.node;
      const fromNode = pack.nodes.find((n) => n.nodeId === fromNodeId);
      if (!fromNode?.metrics?.includes(subject)) continue;

      // 起点信号存在，为终点节点的指标建因果边
      const toNodeId = lane.to.node;
      const toNode = pack.nodes.find((n) => n.nodeId === toNodeId);
      if (!toNode?.metrics) continue;

      for (const toMetric of toNode.metrics) {
        const toSignal = `${toMetric}_${direction}_range`;
        // 只当终点信号也存在时才建边（避免虚假因果）
        if (!signalSet.has(toSignal)) continue;

        broker.createOrReinforceAssociation(sig, toSignal, "causes", 0.5, {
          source: "supply_lane",
          lane: lane.id,
          fromCountry: lane.from.country,
          toCountry: lane.to.country,
          leadTimeDays: lane.leadTimeDays,
        });
        edgeCount++;
      }
    }
  }

  return edgeCount;
}

/**
 * v3: 基于节点的 substitution 属性，建替代效应因果边。
 *
 * 当替代品价格异常时，本品需求/价格会反向变动。
 * 如 PTA(涤纶原料) 降价 -> 棉花需求下降 -> 棉花价格下降
 *
 * @returns 本次新建/强化的因果边数量
 */
function buildSubstitutionEdges(
  broker: MemoryBroker,
  signals: string[],
  pack: IndustryPack,
): number {
  const signalSet = new Set(signals);
  let edgeCount = 0;

  for (const node of pack.nodes) {
    if (!node.substitution) continue;

    const substituteMetric = node.substitution.substituteMetric;
    const crossElasticity = Math.abs(node.substitution.crossElasticity);

    // 替代品价格 above_range -> 本品价格 above_range（同向：替代品涨->本品需求增->本品涨）
    const substituteUp = `${substituteMetric}_above_range`;
    const substituteDown = `${substituteMetric}_below_range`;
    const nodeMetrics = node.metrics ?? [];

    for (const nodeMetric of nodeMetrics) {
      // 同向替代：替代品涨 -> 本品涨
      const nodeUp = `${nodeMetric}_above_range`;
      if (signalSet.has(substituteUp) && signalSet.has(nodeUp)) {
        broker.createOrReinforceAssociation(substituteUp, nodeUp, "causes", crossElasticity, {
          source: "substitution",
          substituteMetric,
          crossElasticity,
          direction: "same",
        });
        edgeCount++;
      }

      // 同向替代：替代品跌 -> 本品跌
      const nodeDown = `${nodeMetric}_below_range`;
      if (signalSet.has(substituteDown) && signalSet.has(nodeDown)) {
        broker.createOrReinforceAssociation(substituteDown, nodeDown, "causes", crossElasticity, {
          source: "substitution",
          substituteMetric,
          crossElasticity,
          direction: "same",
        });
        edgeCount++;
      }
    }
  }

  return edgeCount;
}

/**
 * v3: 基于节点的 risk 属性，建风险传导因果边。
 *
 * 当风险指标超阈值时，供应链节点指标会受影响。
 * 如 drought_index below_range -> cotton_price above_range
 *
 * 风险节点（position=0）的 geography.producerCountries 标注了
 * 风险影响的生产国。我们查找这些国家也有产能的供应链节点
 * （如 raw_material），并把风险信号连到这些节点的指标。
 *
 * 权重 = risk.impactCoefficient
 *
 * @returns 本次新建/强化的因果边数量
 */
function buildRiskEdges(
  broker: MemoryBroker,
  signals: string[],
  pack: IndustryPack,
): number {
  const signalSet = new Set(signals);
  let edgeCount = 0;

  for (const node of pack.nodes) {
    if (!node.risk) continue;
    if (!node.geography?.producerCountries || node.geography.producerCountries.length === 0) continue;

    const riskMetric = node.risk.riskMetric;
    const impactCoeff = node.risk.impactCoefficient;
    const riskDirection: "above_range" | "below_range" =
      node.risk.riskThreshold > 0 ? "above_range" : "below_range";

    const riskSignal = `${riskMetric}_${riskDirection}`;
    if (!signalSet.has(riskSignal)) continue;

    // 风险信号存在 -> 找同国生产的供应链节点，建到其指标的风险因果边
    const riskCountries = new Set(node.geography.producerCountries);
    for (const targetNode of pack.nodes) {
      // 跳过风险节点自身和回收节点
      if (targetNode === node) continue;
      if (!targetNode.geography?.producerCountries) continue;
      if (targetNode.position === 0) continue; // 跳过其他风险节点

      // 检查是否有地理重叠（风险国 = 目标生产国）
      const hasOverlap = targetNode.geography.producerCountries.some((c) => riskCountries.has(c));
      if (!hasOverlap) continue;

      // 为目标节点的每个指标建风险因果边（只对真实存在的 above_range 信号建）
      const targetMetrics = targetNode.metrics ?? [];
      for (const targetMetric of targetMetrics) {
        const effectSignal = `${targetMetric}_above_range`;
        if (!signalSet.has(effectSignal)) continue;

        broker.createOrReinforceAssociation(riskSignal, effectSignal, "causes", impactCoeff, {
          source: "risk",
          riskType: node.risk.riskType,
          riskThreshold: node.risk.riskThreshold,
          impactCoefficient: impactCoeff,
        });
        edgeCount++;
      }
    }
  }

  return edgeCount;
}

/**
 * v3: 资金流因果边 - 从 pack.capitalFlows 自动构建。
 *
 * 资金流描述贷款/退税/纳税/货款/投资在节点间的流动。
 * 当资金流指标信号触发时，建到目标节点指标的因果边。
 *
 * 如 loan_interest_rate_above_range -> fob_price_garment_above_range
 */
function buildCapitalFlowEdges(
  broker: MemoryBroker,
  signals: string[],
  pack: IndustryPack,
): number {
  if (!pack.capitalFlows || pack.capitalFlows.length === 0) return 0;

  const signalSet = new Set(signals);
  let edgeCount = 0;

  for (const flow of pack.capitalFlows) {
    // 因信号：资金流指标 above_range 或 below_range
    const causeAbove = `${flow.metric}_above_range`;
    const causeBelow = `${flow.metric}_below_range`;

    // 只对真实存在的信号建边
    const causeSignal = signalSet.has(causeAbove) ? causeAbove
      : signalSet.has(causeBelow) ? causeBelow
      : null;
    if (!causeSignal) continue;

    // 果信号：目标节点的指标信号
    const toNode = pack.nodes.find((n) => n.nodeId === flow.to);
    if (!toNode?.metrics) continue;

    for (const toMetric of toNode.metrics) {
      // 尝试 above_range 和 below_range 两个方向
      for (const dir of ["above_range", "below_range"] as const) {
        const effectSignal = `${toMetric}_${dir}`;
        if (!signalSet.has(effectSignal)) continue;

        broker.createOrReinforceAssociation(causeSignal, effectSignal, "causes", flow.coefficient, {
          source: "capital_flow",
          flowType: flow.flowType,
          flowId: flow.id,
          coefficient: flow.coefficient,
        });
        edgeCount++;
      }
    }
  }

  return edgeCount;
}

/**
 * v3: 人员流因果边 - 从 pack.workforceFlows 自动构建。
 *
 * 人员流描述各节点的人员结构与薪酬。
 * 当 headcount/wage 信号触发时，建到节点产能/成本指标的因果边。
 *
 * 如 sewer_headcount_below_range -> utilization_pct_below_range
 *     sewer_wage_above_range -> fob_price_garment_above_range
 */
function buildWorkforceEdges(
  broker: MemoryBroker,
  signals: string[],
  pack: IndustryPack,
): number {
  if (!pack.workforceFlows || pack.workforceFlows.length === 0) return 0;

  const signalSet = new Set(signals);
  let edgeCount = 0;

  for (const wf of pack.workforceFlows) {
    const node = pack.nodes.find((n) => n.nodeId === wf.nodeId);
    if (!node?.metrics) continue;

    // 人数信号 -> 产能指标（同方向）
    // headcount below_range -> utilization below_range
    // headcount above_range -> utilization above_range (产能充足)
    for (const dir of ["above_range", "below_range"] as const) {
      const hcSignal = `${wf.headcountMetric}_${dir}`;
      if (!signalSet.has(hcSignal)) continue;

      // 连到产能利用率指标
      const capacityMetric = node.capacity?.utilizationMetric;
      if (capacityMetric) {
        const capSignal = `${capacityMetric}_${dir}`;
        if (signalSet.has(capSignal)) {
          broker.createOrReinforceAssociation(hcSignal, capSignal, "causes", 0.4, {
            source: "workforce",
            role: wf.role,
            direction: dir,
            workforceId: wf.id,
          });
          edgeCount++;
        }
      }

      // 连到人效指标
      if (wf.productivityMetric) {
        const prodSignal = `${wf.productivityMetric}_${dir === "above_range" ? "below_range" : "above_range"}`;
        if (signalSet.has(prodSignal)) {
          broker.createOrReinforceAssociation(hcSignal, prodSignal, "causes", 0.3, {
            source: "workforce",
            role: wf.role,
            direction: "inverse",
            workforceId: wf.id,
          });
          edgeCount++;
        }
      }
    }

    // 薪酬信号 -> 成本指标（同方向）
    // wage above_range -> fob_price above_range
    for (const dir of ["above_range", "below_range"] as const) {
      const wageSignal = `${wf.wageMetric}_${dir}`;
      if (!signalSet.has(wageSignal)) continue;

      // 连到节点的主价格指标
      for (const metric of node.metrics) {
        // 跳过人数/薪酬指标自身
        if (metric === wf.headcountMetric || metric === wf.wageMetric) continue;
        const costSignal = `${metric}_${dir}`;
        if (!signalSet.has(costSignal)) continue;

        broker.createOrReinforceAssociation(wageSignal, costSignal, "causes", 0.35, {
          source: "workforce",
          role: wf.role,
          direction: "same",
          workforceId: wf.id,
        });
        edgeCount++;
      }
    }
  }

  return edgeCount;
}

/**
 * v3 Phase E: 企业经营维度因果边 - 从 pack.businessDimensions 自动构建。
 *
 * 企业经营维度描述各节点的纳税/合规/管理层/客户构成/供应商依赖指标。
 * 当这些指标信号触发时，建到节点价格/产能指标的因果边。
 *
 * 如 customer_concentration_above_range -> gross_margin_below_range
 *     esg_compliance_score_below_range -> utilization_pct_below_range
 */
function buildBusinessDimensionEdges(
  broker: MemoryBroker,
  signals: string[],
  pack: IndustryPack,
): number {
  if (!pack.businessDimensions || pack.businessDimensions.length === 0) return 0;

  const signalSet = new Set(signals);
  let edgeCount = 0;

  for (const bd of pack.businessDimensions) {
    const node = pack.nodes.find((n) => n.nodeId === bd.nodeId);
    if (!node?.metrics) continue;

    // 收集所有企业经营指标
    const dimMetrics: { metric: string; type: string }[] = [];
    if (bd.taxMetric) dimMetrics.push({ metric: bd.taxMetric, type: "tax" });
    if (bd.complianceMetric) dimMetrics.push({ metric: bd.complianceMetric, type: "compliance" });
    if (bd.managementMetric) dimMetrics.push({ metric: bd.managementMetric, type: "management" });
    if (bd.customerCompositionMetric) dimMetrics.push({ metric: bd.customerCompositionMetric, type: "customer" });
    if (bd.supplierDependencyMetric) dimMetrics.push({ metric: bd.supplierDependencyMetric, type: "supplier" });

    for (const { metric, type } of dimMetrics) {
      for (const dir of ["above_range", "below_range"] as const) {
        const causeSignal = `${metric}_${dir}`;
        if (!signalSet.has(causeSignal)) continue;

        // 连到节点的价格/产能指标
        for (const targetMetric of node.metrics) {
          // 跳过经营维度指标自身
          if (dimMetrics.some((d) => d.metric === targetMetric)) continue;

          // 合规/管理层指标是反向的：below_range（差）-> 产能/价格 above_range（成本上升）
          const isInverted = type === "compliance" || type === "management";
          const expectedDir = isInverted
            ? (dir === "below_range" ? "above_range" : "below_range")
            : dir;

          // 客户集中度 above_range -> 毛利 below_range（议价能力差）
          const actualDir = type === "customer" && dir === "above_range"
            ? "below_range"
            : type === "customer" && dir === "below_range"
              ? "above_range"
              : expectedDir;

          const effectSignal = `${targetMetric}_${actualDir}`;
          if (!signalSet.has(effectSignal)) continue;

          const weight =
            type === "compliance" ? 0.30 :
            type === "customer" ? 0.25 :
            type === "supplier" ? 0.20 :
            type === "tax" ? 0.20 :
            0.15;  // management

          broker.createOrReinforceAssociation(causeSignal, effectSignal, "causes", weight, {
            source: "business_dimension",
            dimensionType: type,
            nodeId: bd.nodeId,
            direction: actualDir === dir ? "same" : "inverse",
          });
          edgeCount++;
        }
      }
    }
  }

  return edgeCount;
}

/**
 * v3 Phase E: 信息流因果边 - 从 pack.informationFlows 自动构建。
 *
 * 信息流描述趋势传播链路：社媒热度 -> 审美验证 -> 供应链响应 -> 平台放量。
 * 当趋势信号触发时，建到消费/品牌/渠道指标的因果边。
 *
 * 如 social_media_mentions_above_range -> retail_sales_value_above_range
 *     search_index_above_range -> ecommerce_new_listings_above_range
 *     supplier_inquiries_above_range -> utilization_pct_above_range
 */
function buildInformationFlowEdges(
  broker: MemoryBroker,
  signals: string[],
  pack: IndustryPack,
): number {
  if (!pack.informationFlows || pack.informationFlows.length === 0) return 0;

  const signalSet = new Set(signals);
  let edgeCount = 0;

  // 趋势信号节点的指标映射到下游消费/品牌/渠道节点
  const trendTargetNodes = pack.nodes.filter(
    (n) => ["design", "brand", "channel", "consumer", "manufacturing"].includes(n.nodeId),
  );

  for (const flow of pack.informationFlows) {
    // 热度指标 above_range -> 下游指标 above_range（趋势驱动需求增长）
    // 热度指标 below_range -> 下游指标 below_range（趋势衰退）
    for (const dir of ["above_range", "below_range"] as const) {
      const buzzSignal = `${flow.buzzMetric}_${dir}`;
      if (!signalSet.has(buzzSignal)) continue;

      for (const targetNode of trendTargetNodes) {
        if (!targetNode.metrics) continue;
        for (const targetMetric of targetNode.metrics) {
          const effectSignal = `${targetMetric}_${dir}`;
          if (!signalSet.has(effectSignal)) continue;

          broker.createOrReinforceAssociation(buzzSignal, effectSignal, "causes", 0.35, {
            source: "information_flow",
            flowId: flow.id,
            sourceType: flow.sourceType,
            direction: "same",
          });
          edgeCount++;
        }
      }
    }

    // 验证指标（pinterest_saves / tiktok_views）-> 加固热度信号
    if (flow.validationMetric) {
      for (const dir of ["above_range", "below_range"] as const) {
        const valSignal = `${flow.validationMetric}_${dir}`;
        const buzzSignal = `${flow.buzzMetric}_${dir}`;
        if (signalSet.has(valSignal) && signalSet.has(buzzSignal)) {
          broker.createOrReinforceAssociation(valSignal, buzzSignal, "supports", 0.45, {
            source: "information_flow",
            flowId: flow.id,
            relation: "validation",
          });
          edgeCount++;
        }
      }
    }

    // 供应端响应指标 -> 产能指标
    if (flow.supplyResponseMetric) {
      for (const dir of ["above_range", "below_range"] as const) {
        const supplySignal = `${flow.supplyResponseMetric}_${dir}`;
        if (!signalSet.has(supplySignal)) continue;

        // 供应商询盘增加 -> 制造业产能利用率上升
        const mfgNode = pack.nodes.find((n) => n.nodeId === "manufacturing");
        const capMetric = mfgNode?.capacity?.utilizationMetric;
        if (capMetric) {
          const capSignal = `${capMetric}_${dir}`;
          if (signalSet.has(capSignal)) {
            broker.createOrReinforceAssociation(supplySignal, capSignal, "causes", 0.30, {
              source: "information_flow",
              flowId: flow.id,
              relation: "supply_response",
            });
            edgeCount++;
          }
        }
      }
    }
  }

  return edgeCount;
}

/**
 * v3 Phase F: 买卖双方对账因果边 - 从对账异常建因果边。
 *
 * 对账 mismatch / warning 可作为因果信号参与分析：
 *   - quantity_mismatch -> fob_price_garment_above_range（数量差异导致成本分摊变化）
 *   - price_mismatch -> fob_price_garment_above_range（价格差异直接影响）
 *   - delivery_mismatch -> utilization_pct_below_range（交期延误反映产能问题）
 *   - quality_mismatch -> fob_price_garment_above_range（质量问题导致返工成本）
 *   - demand_mismatch -> order_volume_below_range（需求预测偏差）
 *   - capacity_mismatch -> utilization_pct_below_range（产能不足）
 *   - financial_mismatch -> loan_interest_rate_above_range（资金压力）
 *
 * 从对账结果生成虚拟信号并建边到行业包中的相关指标信号。
 *
 * @returns 本次新建/强化的因果边数量
 */
function buildReconciliationEdges(
  broker: MemoryBroker,
  reconciliations: ReconciliationResult[],
  pack: IndustryPack,
  existingSignals: Set<string>,
): number {
  if (reconciliations.length === 0) return 0;

  let edgeCount = 0;

  // 维度 -> 目标指标映射
  // 每种对账维度异常会影响到行业包中的哪些指标
  const DIMENSION_TARGETS: Record<string, Array<{ metric: string; direction: "above_range" | "below_range"; weight: number }>> = {
    quantity: [
      { metric: "fob_price_garment", direction: "above_range", weight: 0.25 },  // 数量差异->成本分摊
      { metric: "order_volume", direction: "below_range", weight: 0.20 },
    ],
    price: [
      { metric: "fob_price_garment", direction: "above_range", weight: 0.35 },  // 价格差异直接影响
      { metric: "gross_margin", direction: "below_range", weight: 0.30 },
    ],
    delivery: [
      { metric: "utilization_pct", direction: "below_range", weight: 0.25 },  // 交期延误->产能问题
      { metric: "on_time_delivery_rate", direction: "below_range", weight: 0.30 },
    ],
    quality: [
      { metric: "fob_price_garment", direction: "above_range", weight: 0.20 },  // 返工成本
      { metric: "first_pass_yield", direction: "below_range", weight: 0.30 },
    ],
    inventory: [
      { metric: "weekly_sell_through", direction: "below_range", weight: 0.25 },
      { metric: "order_volume", direction: "below_range", weight: 0.20 },
    ],
    financial: [
      { metric: "loan_interest_rate", direction: "above_range", weight: 0.20 },  // 资金压力
      { metric: "dso_days", direction: "above_range", weight: 0.25 },
    ],
    demand: [
      { metric: "order_volume", direction: "below_range", weight: 0.30 },
      { metric: "forecast_accuracy", direction: "below_range", weight: 0.25 },
    ],
    capacity: [
      { metric: "utilization_pct", direction: "below_range", weight: 0.30 },
      { metric: "capacity_credibility", direction: "below_range", weight: 0.25 },
    ],
    tax: [
      { metric: "tariff_rate_avg", direction: "above_range", weight: 0.20 },
    ],
  };

  for (const recon of reconciliations) {
    if (recon.status === "matched") continue;

    // 生成对账异常信号
    const reconSignal = `reconciliation_${recon.dimension}_${recon.status}`;
    const targets = DIMENSION_TARGETS[recon.dimension] ?? [];

    for (const target of targets) {
      const effectSignal = `${target.metric}_${target.direction}`;
      // 只当目标信号在现有信号中存在时才建边（避免虚假因果）
      if (!existingSignals.has(effectSignal)) continue;

      broker.createOrReinforceAssociation(reconSignal, effectSignal, "causes", target.weight, {
        source: "reconciliation",
        dimension: recon.dimension,
        reconStatus: recon.status,
        reconId: recon.id,
      });
      edgeCount++;
    }

    // 对账异常也可以作为 supports 边加固已有的 above/below_range 信号
    // 如 quantity mismatch + fob_price_garment_above_range 同时存在 -> supports
    if (recon.status === "mismatch") {
      for (const target of targets) {
        const effectSignal = `${target.metric}_${target.direction}`;
        if (existingSignals.has(effectSignal)) {
          broker.createOrReinforceAssociation(reconSignal, effectSignal, "supports", target.weight * 0.5, {
            source: "reconciliation_supports",
            dimension: recon.dimension,
          });
          edgeCount++;
        }
      }
    }
  }

  return edgeCount;
}

/**
 * 执行 Analyst agent。
 * v1：基于证据的 value / subject / claim 生成摘要 + 信号标签。
 * v2：发现信号后通过 broker 建 causes 边（第一性归因的数据源）。
 */
export function executeAnalyst(input: AnalystInput): AgentRunResult {
  const { task, evidence, pack, broker } = input;

  if (evidence.length === 0) {
    return {
      taskId: task.id,
      role: "analyst",
      status: "failed",
      error: "no evidence to analyze",
    };
  }

  const signals: string[] = [];
  const summaries: string[] = [];

  for (const ev of evidence.length > 3 ? evidence.slice(0, 3) : evidence) {
    const auth = (ev as EvidenceEntry & { authenticity?: { authenticityScore?: number } }).authenticity;
    const authScore = auth?.authenticityScore;
    const authText = authScore !== undefined ? ` [auth ${(authScore * 100).toFixed(0)}%]` : "";

    // 检测数值趋势信号
    const numValue = typeof ev.value === "number" ? ev.value : NaN;
    if (!isNaN(numValue)) {
      // 若提供 pack 且有该 metric 的 range，判断是否在范围内
      if (pack) {
        const range = findRangeForSubject(pack, ev.subject);
        if (range && numValue > range.max) {
          signals.push(`${ev.subject}_above_range`);
        } else if (range && numValue < range.min) {
          signals.push(`${ev.subject}_below_range`);
        } else if (range) {
          signals.push(`${ev.subject}_in_range`);
        }
      }
      summaries.push(`${ev.subject}: ${ev.claim}${authText}`);
    } else {
      summaries.push(`${ev.subject}: ${ev.claim}${authText}`);
    }
  }

  // 综合置信度：取证据 authenticity 的平均（无则 0.5）
  const confidences = evidence
    .map((ev) => (ev as EvidenceEntry & { authenticity?: { authenticityScore?: number } }).authenticity?.authenticityScore)
    .filter((s): s is number => typeof s === "number");
  const confidence = confidences.length > 0
    ? Math.round((confidences.reduce((a, b) => a + b, 0) / confidences.length) * 1000) / 1000
    : 0.5;

  // v3 Phase F: 从对账结果生成信号
  if (input.reconciliations) {
    for (const recon of input.reconciliations) {
      if (recon.status !== "matched") {
        signals.push(`reconciliation_${recon.dimension}_${recon.status}`);
      }
    }
  }

  const uniqueSignals = [...new Set(signals)];

  const finding: AnalysisFinding = {
    id: nextFindingId(),
    taskId: task.id,
    evidenceIds: evidence.map((e) => e.id),
    summary: summaries.join("; "),
    confidence,
    signals: uniqueSignals,
  };

  // v2: 因果边构建 — 发现信号后通过 broker 建 causes 边
  // 这是第一性归因的数据源：AttributionEngine 反向遍历这些边找根因
  if (broker && uniqueSignals.length > 0) {
    buildCausalEdges(broker, uniqueSignals, finding);
    // v2.1: 行业传导因果边 — 从 pack.transmissionPaths 自动构建
    // 这让 cotton_price→yarn_price→fabric_price→retail_price 的传导链自动成立
    if (pack) {
      // v2.1: 行业传导因果边（带传导系数权重）
      buildTransmissionCausalEdges(broker, uniqueSignals, pack);
      // v3: 跨维度因果边（外汇->价格、贸易流->供应等）
      buildCrossDimensionEdges(broker, uniqueSignals, pack);
      // v3: 供应通道因果边（国家间供应关系）
      buildSupplyLaneEdges(broker, uniqueSignals, pack);
      // v3: 替代效应因果边（PTA->棉花替代）
      buildSubstitutionEdges(broker, uniqueSignals, pack);
      // v3: 风险传导因果边（干旱->减产->价格）
      buildRiskEdges(broker, uniqueSignals, pack);
      // v3: 资金流因果边（利率->制造成本、退税->出口价格）
      buildCapitalFlowEdges(broker, uniqueSignals, pack);
      // v3: 人员流因果边（人员短缺->产能下降、工资上涨->成本上升）
      buildWorkforceEdges(broker, uniqueSignals, pack);
      // v3 Phase E: 企业经营维度因果边（客户集中度->毛利、合规->产能）
      buildBusinessDimensionEdges(broker, uniqueSignals, pack);
      // v3 Phase E: 信息流因果边（社媒趋势->消费需求、供应商询盘->产能）
      buildInformationFlowEdges(broker, uniqueSignals, pack);
      // v3 Phase F: 买卖双方对账因果边（对账异常->指标信号）
      if (input.reconciliations && input.reconciliations.length > 0) {
        buildReconciliationEdges(broker, input.reconciliations, pack, new Set(uniqueSignals));
      }
    }
  }

  return {
    taskId: task.id,
    role: "analyst",
    status: "completed",
    finding,
  };
}

/**
 * 根据信号和因果启发式表，通过 broker 建 causes 边。
 * 同时把 finding 本身 commit 到 broker（confidence ≥ 0.6 时写 Layer 1）。
 */
function buildCausalEdges(
  broker: MemoryBroker,
  signals: string[],
  finding: AnalysisFinding,
): void {
  const signalText = signals.join(" ");

  // 把 finding commit 到 broker（作为 Layer 1 记忆）
  broker.commit({
    kind: "finding",
    key: `finding:${finding.id}`,
    value: finding.summary,
    confidence: finding.confidence,
    tags: finding.signals,
    relatedKeys: finding.evidenceIds.map((id) => `evidence:${id}`),
  });

  // 遍历因果启发式，匹配到则建 causes 边
  for (const heuristic of CAUSAL_HEURISTICS) {
    const hasCause = heuristic.causePattern.test(signalText);
    const hasEffect = heuristic.effectPattern.test(signalText);

    if (hasCause && hasEffect) {
      // 建 cause --causes--> effect 边
      broker.createOrReinforceAssociation(
        heuristic.cause,
        heuristic.effect,
        "causes",
      );
    }
  }

  // 额外：subject 级因果 — 如果 evidence 的 subject 暗示因果链
  // 如 cotton_price_above_range 暗示 cotton_price --causes--> yarn_price
  for (const signal of signals) {
    if (signal.includes("above_range") || signal.includes("below_range")) {
      const subject = signal.replace(/_(above|below|in)_range$/, "");
      // 建一条 subject → subject_cost_pressure 的因果边
      broker.createOrReinforceAssociation(
        subject,
        `${subject}_cost_pressure`,
        "causes",
      );
    }
  }
}

/** 在 pack.knownRanges 中查找与 subject 匹配的 range */
function findRangeForSubject(pack: IndustryPack, subject: string) {
  const lower = subject.toLowerCase();
  for (const [key, range] of Object.entries(pack.knownRanges)) {
    if (lower.includes(key.replace(/_/g, " ")) || lower.includes(key)) {
      return range;
    }
  }
  return undefined;
}
