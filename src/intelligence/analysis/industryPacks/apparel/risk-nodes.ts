/**
 * analysis/industryPacks/apparel/risk-nodes.ts - 服装行业风险节点
 *
 * 天气/地缘/疫情风险传导节点。
 * 这些节点的指标由数据采集器注入，风险超阈值时触发供应减产信号。
 *
 * 风险阈值参考：
 *   干旱指数 (PDSI): > -3 为严重干旱（影响棉花产量 10-30%）
 *   厄尔尼诺 SST: Niño 3.4 区 SST 偏高 > +0.5°C 为厄尔尼诺
 *   热浪天数: > 15天/季 为极端（影响棉花品质）
 */

import type { SupplyChainNode } from "../../../core/industry-pack";

/** 风险节点 - 天气/地缘风险因子 */
export const apparelRiskNodes: SupplyChainNode[] = [
  {
    nodeId: "weather_risk",
    label: "Weather Risk (Drought / El Niño / Heatwave)",
    position: 0, // 位置0 - 风险在上游之前，影响原料供应
    metrics: ["drought_index", "el_nino_sst", "heatwave_days"],
    geography: {
      producerCountries: ["IN", "CN", "US", "BR"],  // 主要棉花产区
      consumerCountries: [],
    },
    risk: {
      riskType: "weather",
      riskMetric: "drought_index",
      riskThreshold: -3,  // PDSI < -3 为严重干旱
      impactCoefficient: 0.3,  // 严重干旱影响棉花产量 ~30%
    },
  },
  {
    nodeId: "geopolitical_risk",
    label: "Geopolitical Risk (Tariff / Sanction / Trade War)",
    position: 0,
    metrics: ["trade_tension_index", "sanction_count", "tariff_rate_avg"],
    geography: {
      producerCountries: ["US", "CN"],  // 中美贸易战
      consumerCountries: ["CN", "US"],
    },
    risk: {
      riskType: "geopolitical",
      riskMetric: "trade_tension_index",
      riskThreshold: 70,  // 贸易紧张指数 > 70 为高风险
      impactCoefficient: 0.25,
    },
  },
  {
    nodeId: "logistics_risk",
    label: "Logistics Risk (Freight / Port Congestion / Canal Blockage)",
    position: 0,
    metrics: ["freight_index_fbx", "port_congestion_days", "suez_transit_days"],
    geography: {
      producerCountries: [],
      consumerCountries: ["JP", "EU", "US"],  // 依赖海运的进口地区
    },
    risk: {
      riskType: "logistics",
      riskMetric: "freight_index_fbx",
      riskThreshold: 3500,  // FBX > 3500 为高运费
      impactCoefficient: 0.2,
    },
  },
  {
    // v3 新增：资金链风险 - 汇率/利率/信贷紧缩
    nodeId: "financial_risk",
    label: "Financial Risk (Interest Rate / Credit / Currency)",
    position: 0,
    metrics: ["interest_rate", "credit_spread", "fx_volatility_index", "loan_interest_rate", "fx_rate_usd_cny", "fx_rate_jpy_cny", "fx_rate_inr_cny"],
    geography: {
      producerCountries: ["US", "EU", "CN"],  // 主要央行/金融中心
      consumerCountries: ["CN", "BD", "VN", "IN"],  // 依赖融资的制造国
    },
    risk: {
      riskType: "financial",
      riskMetric: "interest_rate",
      riskThreshold: 5.5,  // 基准利率 > 5.5% 为高资金成本
      impactCoefficient: 0.2,
    },
  },
  {
    // v3 新增：合规风险 - 环保/劳工/贸易制裁
    nodeId: "compliance_risk",
    label: "Compliance Risk (ESG / Labor / Trade Sanction)",
    position: 0,
    metrics: ["esg_compliance_score", "labor_violation_count", "sanction_risk_score"],
    geography: {
      producerCountries: ["BD", "VN", "CN", "IN"],  // 主要制造国（合规审查对象）
      consumerCountries: ["EU", "US"],  // 合规要求最高的市场
    },
    risk: {
      riskType: "compliance",
      riskMetric: "esg_compliance_score",
      riskThreshold: 40,  // ESG评分 < 40 为高风险（below_range 触发）
      impactCoefficient: 0.15,
    },
  },
];

/** 风险指标范围 - 合并到 knownRanges */
import type { Range } from "../../../core/industry-pack";

export const apparelRiskRanges: Record<string, Range> = {
  // 天气风险
  // PDSI: 正常范围 -3 到 5; < -3 为严重干旱 (below_range 触发)
  drought_index:    { min: -3, max: 5, unit: "PDSI" },
  // 厄尔尼诺 SST: 正常 -0.5 到 0.5; > 0.5 为厄尔尼诺 (above_range 触发)
  el_nino_sst:      { min: -0.5, max: 0.5, unit: "°C" },
  heatwave_days:    { min: 0, max: 15, unit: "days/season" }, // > 15 为极端

  // 地缘风险
  trade_tension_index: { min: 0, max: 70, unit: "index" },   // > 70 为高风险
  sanction_count:      { min: 0, max: 10, unit: "count" },   // 制裁数量

  // 物流风险
  port_congestion_days: { min: 0, max: 10, unit: "days" },   // 港口拥堵天数
  suez_transit_days:    { min: 12, max: 20, unit: "days" },  // 苏伊士运河通行天数

  // v3 资金链风险
  interest_rate:        { min: 0, max: 5.5, unit: "%" },      // 基准利率 > 5.5% 为高
  credit_spread:        { min: 0, max: 300, unit: "bps" },    // 信用利差 > 300bps 为紧缩
  fx_volatility_index:  { min: 0, max: 15, unit: "index" },   // 汇率波动率指数

  // v3 合规风险
  esg_compliance_score:    { min: 40, max: 100, unit: "score" }, // < 40 为高风险 (below_range 触发)
  labor_violation_count:   { min: 0, max: 5, unit: "count" },    // 劳工违规数量
  sanction_risk_score:     { min: 0, max: 70, unit: "score" },   // 制裁风险评分
};
