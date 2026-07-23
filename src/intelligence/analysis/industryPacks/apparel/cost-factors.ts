/**
 * analysis/industryPacks/apparel/cost-factors.ts - 服装行业各国成本因子
 *
 * 数据来源：ILO 劳动力成本报告 + IEA 能源价格 + Freightos 海运指数
 *
 * 这些范围用于 rangeGate 验证各国成本指标，
 * 并在 Analyst 建跨维度因果边时提供阈值参考。
 */

import type { Range } from "../../../core/industry-pack";

/** 各国劳动力成本范围（月工资，USD） */
export const apparelLaborCostRanges: Record<string, Range> = {
  labor_cost_cn: { min: 400, max: 900, unit: "USD/month" },   // 中国制造业
  labor_cost_bd: { min: 80, max: 150, unit: "USD/month" },    // 孟加拉（全球最低）
  labor_cost_vn: { min: 200, max: 400, unit: "USD/month" },   // 越南
  labor_cost_in: { min: 150, max: 350, unit: "USD/month" },   // 印度
  labor_cost_jp: { min: 1500, max: 3000, unit: "USD/month" }, // 日本
  labor_cost_br: { min: 300, max: 600, unit: "USD/month" },   // 巴西
};

/** 各国能源成本范围（工业用电，USD/kWh） */
export const apparelEnergyCostRanges: Record<string, Range> = {
  energy_cost_cn: { min: 0.06, max: 0.12, unit: "USD/kWh" },  // 中国工业电价
  energy_cost_bd: { min: 0.08, max: 0.15, unit: "USD/kWh" },  // 孟加拉（天然气为主）
  energy_cost_vn: { min: 0.07, max: 0.13, unit: "USD/kWh" },  // 越南
  energy_cost_in: { min: 0.07, max: 0.14, unit: "USD/kWh" },  // 印度
  energy_cost_jp: { min: 0.15, max: 0.25, unit: "USD/kWh" },  // 日本（进口LNG）
  energy_cost_br: { min: 0.10, max: 0.18, unit: "USD/kWh" },  // 巴西（水电为主）
};

/** 海运成本指数（Freightos Baltic Index，FBX） */
export const apparelLogisticsCostRanges: Record<string, Range> = {
  freight_index_fbx:    { min: 1_000, max: 5_000, unit: "USD/FEU" },  // 全球集装箱运费
  freight_us_west:      { min: 1_200, max: 4_500, unit: "USD/FEU" },  // 中国->美西
  freight_eu:           { min: 1_000, max: 4_000, unit: "USD/FEU" },  // 中国->欧洲
  freight_jp:           { min: 300, max: 1_200, unit: "USD/FEU" },    // 中国->日本（近海）
  freight_bd:           { min: 500, max: 1_800, unit: "USD/FEU" },    // 中国->孟加拉
};

/** 需求端指标范围 */
export const apparelDemandRanges: Record<string, Range> = {
  order_volume:          { min: 0, max: 10_000_000, unit: "pieces/quarter" },
  retail_sales_value:    { min: 0, max: 500_000, unit: "M_USD/quarter" },
  sell_through_rate:     { min: 0, max: 100, unit: "%" },
  inventory_turnover:    { min: 1, max: 12, unit: "turns/year" },
};

/** 关税率范围（按贸易协定） */
export const apparelTariffRanges: Record<string, Range> = {
  tariff_cotton_cn:      { min: 0, max: 25, unit: "%" },  // 中国棉花进口关税（配额外高）
  tariff_garment_jp:     { min: 0, max: 10, unit: "%" },  // 日本成衣进口关税
  tariff_garment_eu:     { min: 0, max: 12, unit: "%" },  // 欧盟成衣进口关税
  tariff_garment_us:     { min: 0, max: 32, unit: "%" },  // 美国成衣进口关税（最高）
};

/** 汇总所有成本因子范围 - 合并到 knownRanges */
export const apparelCostFactorRanges: Record<string, Range> = {
  ...apparelLaborCostRanges,
  ...apparelEnergyCostRanges,
  ...apparelLogisticsCostRanges,
  ...apparelDemandRanges,
  ...apparelTariffRanges,
};
