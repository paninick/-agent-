/**
 * analysis/industryPacks/apparel/index.ts - 服装行业包
 *
 * 第一个 IndustryPack。Core engine 不持有任何服装数据，
 * 全部从这里读取。位于 analysis 层（行业包是分析镜头，非核心边界）。
 *
 * v3: 整合了供应链通道、跨维度因果规则、风险节点。
 *
 * 用法:
 *   import { apparelPack } from "../intelligence";
 *   import { evaluateAuthenticity } from "../intelligence";
 *   const result = evaluateAuthenticity({ evidence, ledger, registrySources, pack: apparelPack });
 */

import type { IndustryPack, SupplyChainNode } from "../../../core/industry-pack";
import { apparelKnownRanges } from "./ranges";
import { apparelFreshnessMaxAgeDays, apparelDefaultFreshnessMaxAgeDays } from "./freshness";
import { apparelTrustedSourceIds } from "./trusted-sources";
import { apparelNodes } from "./nodes";
import { apparelTransmissionPaths } from "./transmission";
import { apparelSupplyLanes } from "./supply-lanes";
import { apparelCrossDimensionRules } from "./cross-dimension-rules";
import { apparelRiskNodes } from "./risk-nodes";
import { apparelCapitalFlows } from "./capital-flows";
import { apparelWorkforceFlows } from "./workforce-flows";
import { apparelBusinessDimensions } from "./business-dimensions";
import { apparelInformationFlows } from "./information-flows";

// 合并产业链节点 + 风险节点
const allNodes: SupplyChainNode[] = [...apparelRiskNodes, ...apparelNodes];

export const apparelPack: IndustryPack = {
  industryId: "apparel",
  displayName: "Apparel / Textile Industry",
  knownRanges: apparelKnownRanges,
  freshnessMaxAgeDays: apparelFreshnessMaxAgeDays,
  defaultFreshnessMaxAgeDays: apparelDefaultFreshnessMaxAgeDays,
  trustedSourceIds: apparelTrustedSourceIds,
  nodes: allNodes,
  transmissionPaths: apparelTransmissionPaths,
  supplyLanes: apparelSupplyLanes,
  crossDimensionRules: apparelCrossDimensionRules,
  capitalFlows: apparelCapitalFlows,
  workforceFlows: apparelWorkforceFlows,
  businessDimensions: apparelBusinessDimensions,
  informationFlows: apparelInformationFlows,
};

// 重导出各子模块，方便按需引用
export * from "./ranges";
export * from "./freshness";
export * from "./trusted-sources";
export * from "./nodes";
export * from "./transmission";
export * from "./supply-lanes";
export * from "./cross-dimension-rules";
export * from "./risk-nodes";
export * from "./cost-factors";
export * from "./capital-flows";
export * from "./workforce-flows";
export * from "./business-dimensions";
export * from "./information-flows";
