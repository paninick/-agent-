/**
 * analysis/industryPacks/apparel/ranges.ts — 服装行业指标值域表
 *
 * 2026-07-08 校准（基于真实市场数据）：
 *   棉花 ICE 期货 80.94¢/lb (TradingEconomics)，年涨22%
 *   中国国内 CC Index 3128B 现货 ~16,000 CNY/ton
 *   32s 纯棉纱 ~25,000 CNY/ton
 *   纯棉面料 ~28 CNY/m
 *
 * 外汇维度（TradingEconomics 2026-07-08 真实汇率）：
 *   USD/CNY 6.8017 (CNY年涨5.28%)
 *   JPY/CNY 0.04189 (CNYJPY年涨17.34%)
 *   INR/CNY 0.0715 (INR年跌14.76% — 印度货币贬值)
 *   BRL/CNY 1.3188 (BRL年涨0.87%)
 *   VND/CNY 0.000259 (VND年跌5.88%)
 *   IDR/CNY 0.000378 (IDR年跌14.42%)
 *
 * 贸易流（WorldsTopExports 2024）：
 *   棉花出口：中国$10.8B, 印度$6.5B, 美国$6.2B, 巴西$5.3B(+65%)
 *   棉花进口：中国$9.3B, 孟加拉$7.7B, 越南$4.8B, 土耳其$2.4B
 *   净逆差：孟加拉-$7.6B, 越南-$2.0B, 印尼-$1.1B
 */

import type { Range } from "../../../core/industry-pack";
import { apparelCostFactorRanges } from "./cost-factors";
import { apparelRiskRanges } from "./risk-nodes";

export const apparelKnownRanges: Record<string, Range> = {
  // === 原料价格（中国国内现货口径） ===
  cotton_price:         { min: 10_000, max: 18_000, unit: "CNY/ton" },
  pta_price:            { min: 3_000, max: 8_000, unit: "CNY/ton" },
  yarn_price:           { min: 15_000, max: 30_000, unit: "CNY/ton" },
  fabric_price_per_m:   { min: 5, max: 50, unit: "CNY/m" },
  fob_price_garment:    { min: 5, max: 120, unit: "CNY/piece" },
  retail_price_garment: { min: 30, max: 800, unit: "CNY/piece" },

  // === 外汇汇率（2026-07-08 真实， TradingEconomics） ===
  // CNY 通用范围：汇率波动通常 ±15%
  fx_rate_usd_cny:      { min: 6, max: 7.5, unit: "CNY/USD" },
  fx_rate_jpy_cny:      { min: 0.035, max: 0.055, unit: "CNY/JPY" },
  fx_rate_inr_cny:      { min: 0.06, max: 0.09, unit: "CNY/INR" },
  fx_rate_brl_cny:      { min: 1.0, max: 1.6, unit: "CNY/BRL" },
  fx_rate_vnd_cny:      { min: 0.00022, max: 0.00030, unit: "CNY/VND" },
  fx_rate_idr_cny:      { min: 0.00032, max: 0.00045, unit: "CNY/IDR" },

  // === 进出口贸易流（亿美元，2024 真实数据） ===
  cotton_export_value:  { min: 0, max: 12_000, unit: "M_USD" },
  cotton_import_value:  { min: 0, max: 10_000, unit: "M_USD" },
  cotton_net_trade:     { min: -8_000, max: 6_000, unit: "M_USD" },

  // === 通用指标 ===
  utilization_pct:      { min: 0, max: 100, unit: "%" },
  gdp_usd:              { min: 1e9, max: 1e13, unit: "USD" },
  cpi_index:            { min: 50, max: 500, unit: "index" },

  // === v3: 库存指标 ===
  cotton_inventory:     { min: 200_000, max: 2_000_000, unit: "tons" },
  garment_inventory:    { min: 0, max: 50_000_000, unit: "pieces" },
  retail_inventory:     { min: 0, max: 10_000_000, unit: "pieces" },

  // === v3 新增：农业投入指标 ===
  seed_price:           { min: 3, max: 8, unit: "CNY/kg" },
  fertilizer_price:     { min: 2_000, max: 4_500, unit: "CNY/ton" },
  land_rent:            { min: 8_000, max: 25_000, unit: "CNY/ha/yr" },
  pesticide_cost:       { min: 1_500, max: 6_000, unit: "CNY/ha" },
  irrigation_cost:      { min: 1_000, max: 4_000, unit: "CNY/ha" },
  cotton_planting_area: { min: 2_000_000, max: 5_000_000, unit: "ha" },
  fertilizer_capacity_util: { min: 0, max: 100, unit: "%" },
  natural_gas_price:    { min: 2, max: 6, unit: "USD/MMBtu" },

  // === v3 新增：石油化工指标 ===
  crude_oil_price:         { min: 40, max: 120, unit: "USD/bbl" },
  pta_feedstock_price:     { min: 4_000, max: 9_000, unit: "CNY/ton" },  // PX价格
  m_eg_price:              { min: 3_500, max: 7_500, unit: "CNY/ton" },   // 乙二醇
  polyester_staple_price:  { min: 6_000, max: 12_000, unit: "CNY/ton" },  // 涤纶短纤
  polyester_filament_price:{ min: 7_000, max: 14_000, unit: "CNY/ton" },  // 涤纶长丝
  pta_inventory:           { min: 0, max: 1_000_000, unit: "tons" },
  pta_capacity_util:       { min: 0, max: 100, unit: "%" },

  // === v3 新增：交易所指标 ===
  cotton_futures_price:  { min: 10_000, max: 20_000, unit: "CNY/ton" },  // 郑商所CF
  yarn_futures_price:    { min: 15_000, max: 35_000, unit: "CNY/ton" },  // CY
  fiber_spot_index:      { min: 80, max: 160, unit: "index" },            // 中国纺织材料价格指数
  futures_basis:         { min: -2_000, max: 2_000, unit: "CNY/ton" },   // 期现基差（负=贴水）
  futures_trading_volume:{ min: 50_000, max: 2_000_000, unit: "lots/day" },

  // === v3 新增：贸易公司指标 ===
  trading_margin:        { min: 3, max: 15, unit: "%" },
  import_export_volume:  { min: 0, max: 500_000_000, unit: "pieces/yr" },
  procurement_cost:      { min: 5, max: 130, unit: "CNY/piece" },
  distribution_cost:     { min: 0.5, max: 8, unit: "CNY/piece" },
  trading_inventory:     { min: 0, max: 20_000_000, unit: "pieces" },
  logistics_throughput:  { min: 0, max: 100, unit: "% capacity" },

  // === v3 新增：二批/二手指标 ===
  secondhand_price:      { min: 2, max: 50, unit: "CNY/piece" },
  surplus_inventory:     { min: 0, max: 50_000_000, unit: "pieces" },
  offprice_retail:       { min: 0, max: 100_000_000, unit: "CNY/quarter" },

  // === v3 新增：资金流指标 ===
  loan_interest_rate:    { min: 3, max: 8, unit: "%" },           // 制造业贷款利率
  tax_refund_rate:       { min: 0, max: 13, unit: "%" },          // 出口退税率
  tax_burden_rate:       { min: 0, max: 25, unit: "%" },          // 综合税负率
  working_capital:       { min: 0, max: 500_000_000, unit: "CNY" },
  accounts_receivable_days: { min: 15, max: 120, unit: "days" },

  // === v3 新增：人员流指标 ===
  farm_worker_headcount: { min: 100, max: 50_000, unit: "persons" },
  farm_worker_wage:      { min: 1_500, max: 5_000, unit: "CNY/month" },
  spinner_headcount:     { min: 50, max: 5_000, unit: "persons" },
  spinner_wage:          { min: 3_000, max: 8_000, unit: "CNY/month" },
  weaver_headcount:      { min: 50, max: 3_000, unit: "persons" },
  weaver_wage:           { min: 3_500, max: 9_000, unit: "CNY/month" },
  sewer_headcount:       { min: 100, max: 10_000, unit: "persons" },
  sewer_wage:            { min: 80, max: 900, unit: "USD/month" },  // 缝纫工（跨国范围）
  qc_headcount:          { min: 5, max: 500, unit: "persons" },
  qc_wage:               { min: 2_000, max: 12_000, unit: "CNY/month" },
  manager_headcount:     { min: 3, max: 200, unit: "persons" },
  manager_wage:          { min: 8_000, max: 50_000, unit: "CNY/month" },
  designer_headcount:    { min: 2, max: 100, unit: "persons" },
  designer_salary:       { min: 8_000, max: 40_000, unit: "CNY/month" },
  marketer_headcount:    { min: 5, max: 300, unit: "persons" },
  marketer_salary:       { min: 6_000, max: 35_000, unit: "CNY/month" },
  retail_staff_headcount:{ min: 5, max: 2_000, unit: "persons" },
  retail_staff_wage:     { min: 2_500, max: 15_000, unit: "CNY/month" },
  ecommerce_staff_headcount: { min: 2, max: 500, unit: "persons" },
  ecommerce_staff_wage:  { min: 4_000, max: 20_000, unit: "CNY/month" },
  recruitment_cost:      { min: 500, max: 10_000, unit: "CNY/person" },

  // === v3 Phase E：补充人员流指标 ===
  buyer_headcount:       { min: 2, max: 100, unit: "persons" },
  buyer_salary:          { min: 8_000, max: 40_000, unit: "CNY/month" },
  streamer_headcount:    { min: 1, max: 200, unit: "persons" },
  streamer_salary:       { min: 5_000, max: 100_000, unit: "CNY/month" },
  pattern_maker_headcount:{ min: 1, max: 50, unit: "persons" },
  pattern_maker_salary:  { min: 7_000, max: 30_000, unit: "CNY/month" },
  technician_headcount:  { min: 2, max: 80, unit: "persons" },
  technician_salary:     { min: 6_000, max: 25_000, unit: "CNY/month" },

  // === v3 新增：企业经营指标 ===
  customer_concentration:  { min: 0, max: 80, unit: "%" },        // 前五大客户占比
  supplier_dependency:     { min: 0, max: 70, unit: "%" },        // 前三大供应商占比
  // compliance_score 已统一为 esg_compliance_score（见 risk-nodes.ts apparelRiskRanges）
  management_turnover:     { min: 0, max: 30, unit: "%/yr" },

  // === v3 Phase E：补全节点指标基线范围 ===
  // 原料价格（补充动物纤维 + 丝绸）
  wool_price:              { min: 50_000, max: 120_000, unit: "CNY/ton" },   // 国毛/澳毛均价
  silk_price:              { min: 200_000, max: 500_000, unit: "CNY/ton" },  // 生丝价格

  // 面料指标（柯桥指数 - 中国轻纺城面料价格指数）
  keqiao_index:            { min: 80, max: 130, unit: "index" },

  // 设计指标
  design_trend:            { min: 0, max: 100, unit: "score" },   // 趋势匹配度评分
  bom_accuracy:            { min: 70, max: 100, unit: "%" },       // BOM 准确率

  // 品牌指标
  brand_health:            { min: 40, max: 100, unit: "score" },  // 品牌健康度综合评分
  gross_margin:            { min: 10, max: 75, unit: "%" },        // 毛利率

  // 消费者指标
  consumer_confidence:     { min: 50, max: 150, unit: "index" },  // 消费者信心指数

  // 回收循环指标
  recycled_fiber_ratio:    { min: 0, max: 60, unit: "%" },         // 再生纤维使用比例
  lca_score:               { min: 30, max: 100, unit: "score" },   // 生命周期评估得分

  // 农业生产力指标
  cotton_yield_per_hectare:{ min: 800, max: 2_000, unit: "kg/ha" }, // 皮棉单产

  // 地缘政治风险指标
  tariff_rate_avg:         { min: 0, max: 40, unit: "%" },         // 平均关税税率

  // === v3 Phase E：辅料指标 ===
  dye_price:               { min: 15, max: 80, unit: "CNY/kg" },   // 染料均价（活性染料）
  auxiliary_price:         { min: 8, max: 50, unit: "CNY/kg" },    // 纺织助剂
  zipper_price:            { min: 0.2, max: 8, unit: "CNY/piece" }, // 拉链
  button_price:            { min: 0.05, max: 3, unit: "CNY/piece" }, // 纽扣
  interlining_price:       { min: 2, max: 25, unit: "CNY/m" },      // 衬布
  label_price:             { min: 0.02, max: 1, unit: "CNY/piece" }, // 标签/吊牌
  packaging_cost:          { min: 0.5, max: 15, unit: "CNY/piece" }, // 包装成本

  // === v3 Phase E：趋势信号指标（Step 4 将定义节点） ===
  social_media_mentions:   { min: 0, max: 1_000_000, unit: "mentions/day" },
  search_index:            { min: 0, max: 10_000, unit: "index" },   // 搜索热度指数
  pinterest_saves:         { min: 0, max: 500_000, unit: "saves/week" },
  tiktok_views:            { min: 0, max: 500_000_000, unit: "views/week" },
  ecommerce_new_listings:  { min: 0, max: 500_000, unit: "listings/week" },
  supplier_inquiries:      { min: 0, max: 50_000, unit: "inquiries/week" },
  sample_requests:         { min: 0, max: 10_000, unit: "requests/week" },

  // === v3 Phase E：竞争格局指标（Step 5 将定义节点） ===
  market_share:            { min: 0, max: 50, unit: "%" },          // 市占率
  competitor_price:        { min: 30, max: 800, unit: "CNY/piece" },
  competitor_sales:        { min: 0, max: 100_000_000, unit: "CNY/quarter" },
  bestseller_lifecycle:    { min: 2, max: 52, unit: "weeks" },      // 爆款生命周期
  sku_depth:               { min: 10, max: 10_000, unit: "SKUs" },  // SKU 深度
  ad_spend:                { min: 0, max: 100_000_000, unit: "CNY/quarter" },
  roas:                    { min: 0, max: 20, unit: "ratio" },      // 广告投资回报率

  // === v3 Phase E：趋势生命周期指标（Step 14 将扩展） ===
  trend_lifecycle_stage:   { min: 0, max: 4, unit: "stage" },       // 0=萌芽 1=上升 2=峰值 3=衰退 4=消亡
  trend_velocity:          { min: -100, max: 100, unit: "%/week" }, // 趋势变化速度
  trend_saturation:        { min: 0, max: 100, unit: "%" },         // 趋势饱和度
  sell_through_rate:       { min: 30, max: 90, unit: "%" },          // 售罄率/动销率
  order_volume:            { min: 0, max: 100_000_000, unit: "pieces/quarter" }, // 订单量
  retail_sales_value:      { min: 0, max: 500_000_000, unit: "CNY/quarter" },    // 零售额
  oee:                     { min: 50, max: 95, unit: "%" },          // 设备综合效率

  // === v3 Phase F：买卖双方对账指标 ===
  quantity_variance_rate:    { min: 0, max: 5, unit: "%" },          // 数量差异率
  on_time_delivery_rate:     { min: 80, max: 100, unit: "%" },       // 准交率
  first_pass_yield:          { min: 85, max: 100, unit: "%" },       // 一次合格率
  rework_rate:               { min: 0, max: 8, unit: "%" },          // 返修率
  customer_complaint_rate:   { min: 0, max: 5, unit: "%" },          // 客诉率
  return_rate:               { min: 0, max: 5, unit: "%" },          // 退货率
  weekly_sell_through:       { min: 30, max: 90, unit: "%" },         // 周销比
  dso_days:                  { min: 30, max: 90, unit: "days" },      // 应收账款周转天数
  dpo_days:                  { min: 30, max: 90, unit: "days" },      // 应付账款周转天数
  overdue_rate:              { min: 0, max: 15, unit: "%" },          // 逾期率
  forecast_accuracy:         { min: 60, max: 100, unit: "%" },        // 预测准确率
  capacity_credibility:      { min: 40, max: 100, unit: "score" },    // 产能可信度评分
  demand_credibility_score:  { min: 40, max: 100, unit: "score" },    // 需求真实性评分
  supply_credibility_score:  { min: 40, max: 100, unit: "score" },    // 供应真实性评分
  price_reasonableness_score:{ min: 40, max: 100, unit: "score" },    // 价格合理性评分

  // === v3: 成本因子 + 风险指标（从子模块合并） ===
  ...apparelCostFactorRanges,
  ...apparelRiskRanges,

  // 传导率（参考值，非价格指标）:
  // cotton_yarn_传导率: 0.5-0.8
  // pta_polyester_传导率: 0.95-0.99
  // eal 服装需求弹性: -1.5 至 -0.5
};
