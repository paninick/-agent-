/**
 * analysis/resonance-detector.ts - 多节点共振检测引擎
 *
 * 规格："重大经营动作至少三个节点共振"
 *
 * 当多个节点同时出现异常信号时，系统检测"共振模式"：
 *   - 2节点同时异常 = 中等置信信号
 *   - 3+节点同时异常 = 高置信信号（共振）
 *   - 5+节点同时异常 = 系统性风险信号
 *
 * 共振检测逻辑：
 *   1. 从信号列表中提取各节点的异常状态
 *   2. 按产业链层级分组（上游/中游/下游/风险/信号）
 *   3. 检测同层多节点共振 + 跨层连锁共振
 *   4. 输出共振强度 + 共振节点 + 建议动作
 */

import type { IndustryPack } from "../core/industry-pack";
import type { ReconciliationResult } from "../reconciliation/types";

/** 共振强度等级 */
export type ResonanceLevel = "none" | "weak" | "moderate" | "strong" | "critical";

/** 单个共振模式 */
export interface ResonancePattern {
  /** 模式 ID */
  id: string;
  /** 共振强度 */
  level: ResonanceLevel;
  /** 参与共振的节点 ID 列表 */
  resonatingNodes: string[];
  /** 参与共振的信号列表 */
  resonatingSignals: string[];
  /** 共振节点数 */
  nodeCount: number;
  /** 共振类型描述 */
  patternType: string;
  /** 建议动作 */
  recommendedAction: string;
  /** 置信度 0-1 */
  confidence: number;
}

/** 共振检测结果 */
export interface ResonanceResult {
  /** 检测到的共振模式列表（按强度排序） */
  patterns: ResonancePattern[];
  /** 最高共振强度 */
  maxLevel: ResonanceLevel;
  /** 参与共振的节点总数（去重） */
  totalResonatingNodes: number;
  /** 综合置信度 0-1 */
  overallConfidence: number;
  /** 是否触发共振告警 */
  hasAlert: boolean;
}

/** 产业链层级分组 */
const CHAIN_LAYERS = {
  upstream: ["raw_material", "agri_inputs", "petrochemical", "fiber_exchange"],
  midstream: ["yarn", "fabric", "accessories", "design", "manufacturing"],
  downstream: ["trading_co", "brand", "channel", "consumer"],
  circular: ["recycling", "secondhand"],
  risk: ["weather_risk", "geopolitical_risk", "logistics_risk", "financial_risk", "compliance_risk"],
  signal: ["trend_signal", "competition"],
};

/** 预定义共振模式 */
const RESONANCE_PATTERNS: {
  id: string;
  patternType: string;
  nodeCombinations: string[][];
  minNodes: number;
  recommendedAction: string;
}[] = [
  {
    id: "cost_push_crisis",
    patternType: "成本推动型共振（利率+汇率+工资同时上涨）",
    nodeCombinations: [
      ["financial_risk", "manufacturing", "brand"],
      ["financial_risk", "raw_material", "yarn"],
    ],
    minNodes: 3,
    recommendedAction: "启动成本对冲：锁定远期汇率、固定利率贷款、提前采购原料",
  },
  {
    id: "supply_disruption",
    patternType: "供应中断型共振（天气+地缘+物流同时异常）",
    nodeCombinations: [
      ["weather_risk", "geopolitical_risk", "logistics_risk"],
      ["weather_risk", "raw_material", "yarn"],
    ],
    minNodes: 3,
    recommendedAction: "启动替代供应商：评估备用采购渠道、增加安全库存",
  },
  {
    id: "demand_collapse",
    patternType: "需求崩塌型共振（消费者信心+零售额+趋势同时下降）",
    nodeCombinations: [
      ["consumer", "channel", "trend_signal"],
      ["consumer", "brand", "competition"],
    ],
    minNodes: 3,
    recommendedAction: "启动需求刺激：调整定价策略、加大营销投入、清仓滞销品",
  },
  {
    id: "trend_amplification",
    patternType: "趋势放大型共振（社媒+搜索+供应端同时响应）",
    nodeCombinations: [
      ["trend_signal", "manufacturing", "channel"],
      ["trend_signal", "design", "brand"],
    ],
    minNodes: 3,
    recommendedAction: "快速追单：扩大产能、加速上新、借势营销窗口期",
  },
  {
    id: "compliance_storm",
    patternType: "合规风暴型共振（ESG+劳工+环保同时违规）",
    nodeCombinations: [
      ["compliance_risk", "manufacturing", "fabric"],
      ["compliance_risk", "brand", "channel"],
    ],
    minNodes: 3,
    recommendedAction: "启动合规整改：暂停高风险产线、加强供应商审计、准备公关应对",
  },
  {
    id: "inventory_imbalance",
    patternType: "库存失衡型共振（上游积压+下游缺货）",
    nodeCombinations: [
      ["raw_material", "manufacturing", "channel"],
      ["yarn", "fabric", "secondhand"],
    ],
    minNodes: 3,
    recommendedAction: "调整库存策略：加速中间品流转、清理滞销库存、优化渠道分配",
  },
  {
    id: "buyer_seller_divergence",
    patternType: "买卖分歧型共振（买方需求高+卖方产能低+价格不一致）",
    nodeCombinations: [
      ["trend_signal", "manufacturing", "brand"],
      ["consumer", "manufacturing", "financial_risk"],
    ],
    minNodes: 3,
    recommendedAction: "买卖链路协同核查：核实需求真实性、产能可信度、价格合理性",
  },
  {
    id: "quality_cost_spiral",
    patternType: "质量成本螺旋型共振（质量下降+返修增加+交期延误+成本上升）",
    nodeCombinations: [
      ["manufacturing", "brand", "financial_risk"],
      ["fabric", "manufacturing", "channel"],
    ],
    minNodes: 3,
    recommendedAction: "质量成本联动干预：暂停高风险产线、排查质量根因、重算成本结构",
  },
];

/**
 * 从信号列表中提取各节点的异常状态。
 */
function extractNodeAnomalies(
  signals: string[],
  pack: IndustryPack,
): Map<string, string[]> {
  const nodeAnomalies = new Map<string, string[]>();

  for (const signal of signals) {
    // 信号格式：{subject}_{above_range|below_range|in_range}
    // subject 自身可能包含下划线（如 loan_interest_rate）
    // 因此用后缀匹配而非 split
    let subjectKey: string | null = null;
    if (signal.endsWith("_above_range")) {
      subjectKey = signal.slice(0, -"_above_range".length);
    } else if (signal.endsWith("_below_range")) {
      subjectKey = signal.slice(0, -"_below_range".length);
    } else {
      continue;
    }

    // 在 pack.nodes 中搜索包含该 metric 的节点
    // 一个指标可能属于多个节点（如 utilization_pct 属于 yarn/fabric/manufacturing）
    // 全部记录，让共振检测覆盖所有相关节点
    for (const node of pack.nodes) {
      // 检查 node.metrics、capacity.utilizationMetric、inventory.inventoryMetric、demand.demandMetric
      const allNodeMetrics = [
        ...(node.metrics ?? []),
        node.capacity?.utilizationMetric,
        node.inventory?.inventoryMetric,
        node.demand?.demandMetric,
        node.costFactors?.laborCostMetric,
        node.costFactors?.energyCostMetric,
        node.costFactors?.logisticsCostMetric,
        node.substitution?.substituteMetric,
      ].filter((m): m is string => typeof m === "string");
      if (allNodeMetrics.includes(subjectKey)) {
        const existing = nodeAnomalies.get(node.nodeId) ?? [];
        existing.push(signal);
        nodeAnomalies.set(node.nodeId, existing);
        // 不 break，继续检查其他节点
      }
    }
  }

  return nodeAnomalies;
}

/**
 * 计算共振强度等级。
 */
function getResonanceLevel(nodeCount: number): ResonanceLevel {
  if (nodeCount >= 5) return "critical";
  if (nodeCount >= 4) return "strong";
  if (nodeCount >= 3) return "moderate";
  if (nodeCount >= 2) return "weak";
  return "none";
}

/**
 * 检测多节点共振。
 *
 * @param signals 当前激活的信号列表
 * @param pack 行业包
 * @param reconciliations 可选：买卖双方对账结果（mismatch 作为额外共振信号）
 * @returns 共振检测结果
 */
export function detectResonance(
  signals: string[],
  pack: IndustryPack,
  reconciliations?: ReconciliationResult[],
): ResonanceResult {
  if (signals.length === 0) {
    return {
      patterns: [],
      maxLevel: "none",
      totalResonatingNodes: 0,
      overallConfidence: 0,
      hasAlert: false,
    };
  }

  const nodeAnomalies = extractNodeAnomalies(signals, pack);
  const anomalousNodeIds = new Set(nodeAnomalies.keys());

  // v3 Phase F: 对账 mismatch 作为额外共振信号
  // 对账 mismatch 信号格式：reconciliation_{dimension}_mismatch
  // 将对账异常映射到相关节点，增强共振检测
  const RECON_NODE_MAP: Record<string, string[]> = {
    quantity: ["manufacturing", "channel"],
    price: ["brand", "manufacturing"],
    delivery: ["manufacturing", "trading_co"],
    quality: ["fabric", "manufacturing"],
    inventory: ["channel", "brand"],
    financial: ["financial_risk", "brand"],
    demand: ["consumer", "trend_signal"],
    capacity: ["manufacturing", "yarn"],
    tax: ["trading_co", "brand"],
  };
  if (reconciliations) {
    for (const recon of reconciliations) {
      if (recon.status !== "mismatch") continue;
      const targetNodes = RECON_NODE_MAP[recon.dimension] ?? [];
      for (const nodeId of targetNodes) {
        anomalousNodeIds.add(nodeId);
        const existing = nodeAnomalies.get(nodeId) ?? [];
        existing.push(`reconciliation_${recon.dimension}_mismatch`);
        nodeAnomalies.set(nodeId, existing);
      }
    }
  }

  const patterns: ResonancePattern[] = [];

  // 1. 检测预定义共振模式
  for (const template of RESONANCE_PATTERNS) {
    for (const combo of template.nodeCombinations) {
      const matchedNodes = combo.filter((n) => anomalousNodeIds.has(n));
      if (matchedNodes.length >= template.minNodes) {
        const level = getResonanceLevel(matchedNodes.length);
        const resonatingSignals: string[] = [];
        for (const nodeId of matchedNodes) {
          resonatingSignals.push(...(nodeAnomalies.get(nodeId) ?? []));
        }
        patterns.push({
          id: template.id,
          level,
          resonatingNodes: matchedNodes,
          resonatingSignals: [...new Set(resonatingSignals)],
          nodeCount: matchedNodes.length,
          patternType: template.patternType,
          recommendedAction: template.recommendedAction,
          confidence: Math.min(1, 0.4 + matchedNodes.length * 0.15),
        });
      }
    }
  }

  // 2. 检测同层多节点共振
  for (const [layerName, nodeIds] of Object.entries(CHAIN_LAYERS)) {
    const layerAnomalies = nodeIds.filter((n) => anomalousNodeIds.has(n));
    if (layerAnomalies.length >= 2) {
      const level = getResonanceLevel(layerAnomalies.length);
      // 跳过弱共振（2节点），只报告中等及以上
      if (level === "none" || level === "weak") continue;

      const resonatingSignals: string[] = [];
      for (const nodeId of layerAnomalies) {
        resonatingSignals.push(...(nodeAnomalies.get(nodeId) ?? []));
      }
      patterns.push({
        id: `layer_${layerName}_resonance`,
        level,
        resonatingNodes: layerAnomalies,
        resonatingSignals: [...new Set(resonatingSignals)],
        nodeCount: layerAnomalies.length,
        patternType: `${layerName}层级共振（${layerAnomalies.length}个节点同时异常）`,
        recommendedAction: layerName === "risk"
          ? "多维度风险叠加，建议启动全面风险评估"
          : `${layerName}层级出现连锁异常，检查传导路径是否被放大`,
        confidence: Math.min(1, 0.3 + layerAnomalies.length * 0.2),
      });
    }
  }

  // 3. 检测全链条共振（上中下游同时异常）
  const upstreamHit = CHAIN_LAYERS.upstream.filter((n) => anomalousNodeIds.has(n)).length;
  const midstreamHit = CHAIN_LAYERS.midstream.filter((n) => anomalousNodeIds.has(n)).length;
  const downstreamHit = CHAIN_LAYERS.downstream.filter((n) => anomalousNodeIds.has(n)).length;
  if (upstreamHit > 0 && midstreamHit > 0 && downstreamHit > 0) {
    const allNodes = [
      ...CHAIN_LAYERS.upstream.filter((n) => anomalousNodeIds.has(n)),
      ...CHAIN_LAYERS.midstream.filter((n) => anomalousNodeIds.has(n)),
      ...CHAIN_LAYERS.downstream.filter((n) => anomalousNodeIds.has(n)),
    ];
    const level = getResonanceLevel(allNodes.length);
    patterns.push({
      id: "full_chain_resonance",
      level,
      resonatingNodes: allNodes,
      resonatingSignals: signals,
      nodeCount: allNodes.length,
      patternType: "全链条共振（上中下游同时异常，系统性风险）",
      recommendedAction: "全链条共振触发：启动应急指挥，评估是否暂停采购/生产/扩张计划",
      confidence: Math.min(1, 0.6 + allNodes.length * 0.05),
    });
  }

  // 按强度排序
  const levelOrder: Record<ResonanceLevel, number> = {
    none: 0, weak: 1, moderate: 2, strong: 3, critical: 4,
  };
  patterns.sort((a, b) => levelOrder[b.level] - levelOrder[a.level]);

  // 汇总
  const allResonatingNodes = new Set<string>();
  for (const p of patterns) {
    for (const n of p.resonatingNodes) allResonatingNodes.add(n);
  }

  const maxLevel = patterns.length > 0 ? patterns[0].level : "none";
  const overallConfidence = patterns.length > 0
    ? Math.min(1, patterns.reduce((sum, p) => sum + p.confidence, 0) / patterns.length)
    : 0;

  return {
    patterns,
    maxLevel,
    totalResonatingNodes: allResonatingNodes.size,
    overallConfidence,
    hasAlert: patterns.some((p) => p.level === "moderate" || p.level === "strong" || p.level === "critical"),
  };
}

/**
 * 格式化共振检测结果为人类可读文本。
 */
export function formatResonance(result: ResonanceResult): string {
  if (result.patterns.length === 0) {
    return "Resonance: none";
  }

  const lines: string[] = [];
  lines.push(`Resonance: ${result.maxLevel.toUpperCase()} (${result.totalResonatingNodes} nodes, confidence=${(result.overallConfidence * 100).toFixed(0)}%)`);
  for (const p of result.patterns) {
    lines.push(`  [${p.level.toUpperCase()}] ${p.patternType}`);
    lines.push(`    nodes: ${p.resonatingNodes.join(", ")}`);
    lines.push(`    action: ${p.recommendedAction}`);
  }
  return lines.join("\n");
}
