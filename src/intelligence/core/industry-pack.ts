/**
 * core/industry-pack.ts - Industry Pack 抽象
 *
 * v3 是多产业情报引擎。Core engine 必须行业无关。
 * 每个 IndustryPack 提供该行业的：
 *   - 指标值域 (knownRanges)
 *   - 时效规则 (freshnessMaxAgeDays)
 *   - 受信来源 (trustedSourceIds)
 *   - 产业链节点 (nodes) - v2 升级为 SupplyChainNode
 *   - 传导路径 (transmissionPaths)
 *   - 供应通道 (supplyLanes) - v3 新增：国家间供应关系
 *   - 跨维度因果规则 (crossDimensionRules) - v3 新增：外汇/风险/替代/产能
 *   - 资金流 (capitalFlows) - v3 新增：贷款/退税/纳税/货款/投资
 *   - 人员流 (workforceFlows) - v3 新增：招聘/薪酬/产能人员
 *   - 企业经营维度 (businessDimensions) - v3 新增：纳税/合规/管理层/客户构成
 *
 * Core validators 不硬编码任何行业数据。
 * Apparel / Textile 是第一个 pack（见 analysis/industryPacks/apparel/）。
 * 未来可添加 semiconductor / automotive / energy / chemicals 等。
 */

import type { ZodTypeAny } from "zod";

/** 值域区间 - 通用概念，非行业专属 */
export interface Range {
  min: number;
  max: number;
  unit?: string;
}

/** 产业链节点（基础） */
export interface IndustryNode {
  /** 节点 ID，如 "raw_material" / "yarn" / "fabric" */
  nodeId: string;
  /** 人类可读标签，如 "Raw Material (Cotton/Fiber)" */
  label: string;
  /** 在链条中的位置（1-based） */
  position: number;
  /** 该节点跟踪的指标 key 列表 */
  metrics?: string[];
}

// === v3: 供应链节点扩展属性 ===

/** 地理属性 - 节点在哪些国家有产能/市场 */
export interface GeographySpec {
  /** 生产国列表 */
  producerCountries: string[];
  /** 消费国列表 */
  consumerCountries: string[];
}

/** 产能约束 */
export interface CapacitySpec {
  /** 产能利用率指标 key（如 "utilization_pct"） */
  utilizationMetric: string;
  /** 产能瓶颈阈值（利用率超过此值 -> 瓶颈信号） */
  bottleneckThreshold: number;
}

/** 成本因子 - 劳动力+能源+物流 */
export interface CostFactorSpec {
  /** 劳动力成本指标 key */
  laborCostMetric?: string;
  /** 能源成本指标 key */
  energyCostMetric?: string;
  /** 物流成本指标 key */
  logisticsCostMetric?: string;
}

/** 库存动态 */
export interface InventorySpec {
  /** 库存水平指标 key */
  inventoryMetric: string;
  /** 安全库存阈值（低于此值 -> 供应紧张信号） */
  safetyStockThreshold: number;
}

/** 需求信号 */
export interface DemandSpec {
  /** 需求量指标 key（如 "order_volume" / "sales_volume"） */
  demandMetric: string;
  /** 需求弹性（价格变化1% -> 需求变化百分之几，负值） */
  elasticity?: number;
}

/** 风险传导 */
export interface RiskSpec {
  /** 风险类型（如 "weather" / "geopolitical" / "pandemic"） */
  riskType: string;
  /** 风险指标 key（如 "drought_index" / "el_nino_sst"） */
  riskMetric: string;
  /** 风险阈值（超过此值 -> 减产信号） */
  riskThreshold: number;
  /** 风险对供应的影响系数（0-1） */
  impactCoefficient: number;
}

/** 替代效应 */
export interface SubstitutionSpec {
  /** 替代品指标 key（如 "pta_price" 是棉花的替代品原料） */
  substituteMetric: string;
  /** 替代弹性（替代品价格变化1% -> 本品需求变化百分之几） */
  crossElasticity: number;
}

/**
 * 供应链节点 - v3 扩展 IndustryNode。
 * 向后兼容：不设置扩展字段时等同于 IndustryNode。
 */
export interface SupplyChainNode extends IndustryNode {
  /** 地理属性 - 哪些国家生产/消费 */
  geography?: GeographySpec;
  /** 产能约束 */
  capacity?: CapacitySpec;
  /** 成本因子 - 劳动力+能源+物流 */
  costFactors?: CostFactorSpec;
  /** 库存动态 */
  inventory?: InventorySpec;
  /** 需求信号 */
  demand?: DemandSpec;
  /** 风险传导 */
  risk?: RiskSpec;
  /** 替代效应 */
  substitution?: SubstitutionSpec;
}

/** 传导路径 - 上游节点变化传导到下游节点的系数 */
export interface TransmissionPath {
  from: string;
  to: string;
  coefficient: number;
  description?: string;
  /** v3: 传导延迟（天） - 信号需要多久传导到下游 */
  lagDays?: number;
}

// === v3: 供应通道（国家间供应关系） ===

/** 供应通道端点 - 国家+节点 */
export interface SupplyLaneEndpoint {
  country: string;
  node: string;
}

/**
 * 供应通道 - 连接两个国家的供应链节点。
 * 如 India.raw_material -> Bangladesh.yarn（印度棉花出口到孟加拉纺纱）
 *
 * 这让"谁供给谁"的关系成为图中的一等公民，
 * 而非散落在贸易流汇总数字中的隐含信息。
 */
export interface SupplyLane {
  id: string;
  from: SupplyLaneEndpoint;
  to: SupplyLaneEndpoint;
  /** 运费范围（到岸成本组成部分） */
  freightCost?: Range;
  /** 关税率范围（到岸成本组成部分） */
  tariffRate?: Range;
  /** 交期（天） */
  leadTimeDays?: number;
  /** 贸易量范围 */
  volume?: Range;
  /** 通道描述 */
  description?: string;
}

// === v3: 跨维度因果规则 ===

/**
 * 跨维度因果规则 - 将不同维度的信号映射到因果关系。
 *
 * Analyst 检测到 causeSignal 时，如果同时存在 effectSignal，
 * 则建 causeSignal --causes--> effectSignal 边。
 *
 * 与 CAUSAL_HEURISTICS 的区别：
 *   - CAUSAL_HEURISTICS 是全局硬编码的3条规则
 *   - CrossDimensionRule 是行业包声明的，可扩展
 *   - 支持 below_range 信号（如汇率贬值 below_range -> 进口成本 above_range）
 */
export interface CrossDimensionRule {
  /** 规则 ID */
  id: string;
  /** 因信号模式（正则匹配信号文本） */
  causePattern: RegExp;
  /** 果信号模式（正则匹配信号文本） */
  effectPattern: RegExp;
  /** 因信号的 key 前缀（如 "fx_rate" 匹配 fx_rate_usd_cny_below_range） */
  causeKeyPrefix: string;
  /** 果信号的 key 前缀 */
  effectKeyPrefix: string;
  /** 因信号的 direction（above_range/below_range） */
  causeDirection: "above_range" | "below_range";
  /** 果信号的 direction */
  effectDirection: "above_range" | "below_range";
  /** 因果权重（初始 weight，0-1） */
  weight: number;
  /** 规则描述 */
  description?: string;
}

// === v3: 跨链路流（资金流 / 人员流 / 企业经营维度） ===

/**
 * 资金流 - 描述资金在节点间的流动。
 *
 * 覆盖：贷款、退税、纳税、货款结算、投资。
 * Analyst 检测到 metric 信号异常时，按 coefficient 建因果边。
 */
export interface CapitalFlow {
  /** 流 ID */
  id: string;
  /** 资金来源节点 ID */
  from: string;
  /** 资金去向节点 ID */
  to: string;
  /** 流类型 */
  flowType: "loan" | "tax_refund" | "tax_payment" | "payment" | "investment";
  /** 关联指标 key（如 "loan_interest_rate" / "tax_refund_rate"） */
  metric: string;
  /** 传导系数（资金成本变化1% -> 下游成本变化百分之几） */
  coefficient: number;
  /** 描述 */
  description?: string;
}

/**
 * 人员流 - 描述节点的人员结构与薪酬。
 *
 * 覆盖：招聘、薪酬结构、产能人员配置、人员流失。
 * Analyst 检测到 headcount/wage 信号异常时，建因果边到产能/成本指标。
 */
export interface WorkforceFlow {
  /** 流 ID */
  id: string;
  /** 所属节点 ID */
  nodeId: string;
  /** 角色类型（如 "designer" / "worker" / "manager" / "qc"） */
  role: string;
  /** 人数指标 key（如 "sewer_headcount"） */
  headcountMetric: string;
  /** 薪酬指标 key（如 "sewer_wage"） */
  wageMetric: string;
  /** 人效指标 key（可选，如 "oee" / "units_per_worker"） */
  productivityMetric?: string;
  /** 描述 */
  description?: string;
}

/**
 * 企业经营维度 - 节点的企业经营层面指标。
 *
 * 覆盖：纳税、合规、管理层、客户构成、供应商依赖。
 * 这些指标不直接传导产品成本，但影响企业经营健康度。
 */
export interface BusinessDimension {
  /** 所属节点 ID */
  nodeId: string;
  /** 纳税指标 key（如 "tax_burden_rate"） */
  taxMetric?: string;
  /** 合规指标 key（如 "esg_compliance_score"） */
  complianceMetric?: string;
  /** 管理层指标 key（如 "management_turnover"） */
  managementMetric?: string;
  /** 客户构成指标 key（如 "customer_concentration"） */
  customerCompositionMetric?: string;
  /** 供应商依赖指标 key（如 "supplier_dependency"） */
  supplierDependencyMetric?: string;
  /** 描述 */
  description?: string;
}

/**
 * 信息流 - 趋势传播链路。
 *
 * 覆盖：社媒热度、搜索指数、电商上新、供应商询盘等信号。
 * Analyst 检测到趋势信号异常时，建因果边到消费/品牌/渠道指标。
 *
 * 趋势生命周期阶段（lifecycleStage）：
 *   0=萌芽 (emerging) 1=上升 (rising) 2=峰值 (peak) 3=衰退 (declining) 4=消亡 (saturated)
 */
export interface InformationFlow {
  /** 流 ID */
  id: string;
  /** 信号源类型（如 "social_media" / "search" / "ecommerce" / "supplier" / "retail"） */
  sourceType: string;
  /** 热度指标 key（如 "social_media_mentions" / "search_index"） */
  buzzMetric: string;
  /** 验证指标 key（可选，如 "pinterest_saves" / "tiktok_views"） */
  validationMetric?: string;
  /** 供应端响应指标 key（可选，如 "supplier_inquiries" / "sample_requests"） */
  supplyResponseMetric?: string;
  /** 生命周期阶段指标 key（可选，如 "trend_lifecycle_stage"） */
  lifecycleStageMetric?: string;
  /** 趋势速度指标 key（可选，如 "trend_velocity"） */
  velocityMetric?: string;
  /** 饱和度指标 key（可选，如 "trend_saturation"） */
  saturationMetric?: string;
  /** 描述 */
  description?: string;
}

/** Freshness 配置 - 传给 freshness gate */
export interface FreshnessConfig {
  /** nodeId -> 最大滞后天数 */
  maxAgeDays: Record<string, number>;
  /** nodeId 不在 map 时的默认最大滞后天数 */
  defaultMaxAgeDays: number;
}

/** Industry Pack 接口 - 行业配置包 */
export interface IndustryPack {
  /** 行业 ID，如 "apparel" / "semiconductor" */
  industryId: string;
  /** 显示名，如 "Apparel / Textile Industry" */
  displayName: string;
  /** 指标值域表（subject key -> Range） */
  knownRanges: Record<string, Range>;
  /** nodeId -> 最大滞后天数 */
  freshnessMaxAgeDays: Record<string, number>;
  /** 默认最大滞后天数（nodeId 不在 map 时） */
  defaultFreshnessMaxAgeDays: number;
  /** 额外受信来源 ID（超出 S/A+ tier 的） */
  trustedSourceIds?: Set<string>;
  /** 可选行业 zod schema，传给 schema_match 门 */
  evidenceSchema?: ZodTypeAny;
  /** 产业链节点列表（v3: 允许 SupplyChainNode 扩展属性） */
  nodes: SupplyChainNode[];
  /** 传导路径列表 */
  transmissionPaths?: TransmissionPath[];
  /** v3: 国家间供应通道 */
  supplyLanes?: SupplyLane[];
  /** v3: 跨维度因果规则 */
  crossDimensionRules?: CrossDimensionRule[];
  /** v3: 资金流（贷款/退税/纳税/货款/投资） */
  capitalFlows?: CapitalFlow[];
  /** v3: 人员流（招聘/薪酬/产能人员） */
  workforceFlows?: WorkforceFlow[];
  /** v3: 企业经营维度（纳税/合规/管理层/客户构成） */
  businessDimensions?: BusinessDimension[];
  /** v3 Phase E: 信息流（趋势传播链路） */
  informationFlows?: InformationFlow[];
}

/** 通用默认 freshness：30 天（非行业专属） */
export const DEFAULT_FRESHNESS_MAX_AGE_DAYS = 30;

/** 通用空 freshness 配置（不提供 pack 时使用） */
export const GENERIC_FRESHNESS_CONFIG: FreshnessConfig = {
  maxAgeDays: {},
  defaultMaxAgeDays: DEFAULT_FRESHNESS_MAX_AGE_DAYS
};
