/**
 * analysis/industryPacks/apparel/transmission.ts — 服装产业链传导路径
 *
 * 系数来源：docs/ARCHITECTURE_SUMMARY.md §2.2 验证系数表
 * 这些是参考传导率，用于 TransmissionPath 抽象。
 * （现有 transmission-engine.ts 的非线性模型保留不动，这里提供声明式路径。）
 */

import type { TransmissionPath } from "../../../core/industry-pack";

export const apparelTransmissionPaths: TransmissionPath[] = [
  { from: "raw_material", to: "yarn", coefficient: 0.72, description: "棉花->纱线（Obsidian 成本拆分验证，误差 0.02%）" },
  { from: "yarn", to: "fabric", coefficient: 0.85, description: "纱线->面料（含织造染整加工费）" },
  { from: "fabric", to: "design", coefficient: 0.60, description: "面料->设计开发（BOM 成本估算）" },
  { from: "design", to: "manufacturing", coefficient: 0.90, description: "设计->成衣制造（面料+人工+能源）" },
  { from: "manufacturing", to: "brand", coefficient: 0.286, description: "出厂->零售（优衣库倍率反推，品牌溢价干扰）" },
  { from: "manufacturing", to: "brand", coefficient: 0.200, description: "出厂->零售（ZARA 倍率反推，精确）" },
  { from: "brand", to: "channel", coefficient: 0.75, description: "品牌定价->渠道零售价" },
  { from: "channel", to: "consumer", coefficient: 0.65, description: "渠道零售->消费者购买" },
  { from: "consumer", to: "recycling", coefficient: 0.15, description: "消费->废旧回收量" },
  { from: "recycling", to: "raw_material", coefficient: 0.20, description: "再生纤维->原料成本（回到①）" },

  // === v3 新增：农业投入传导 ===
  { from: "agri_inputs", to: "raw_material", coefficient: 0.25, description: "种子/化肥/农药成本->棉花种植成本（占种植成本约25%）" },
  { from: "agri_inputs", to: "petrochemical", coefficient: 0.15, description: "化肥生产（天然气）->石化产品联动" },

  // === v3 新增：石油化工传导 ===
  { from: "petrochemical", to: "yarn", coefficient: 0.40, description: "PTA/涤纶价格->混纺纱线成本（涤纶占纱线原料约40%）" },
  { from: "petrochemical", to: "raw_material", coefficient: 0.15, description: "PTA替代效应：PTA涨价->棉花需求增加->棉价上涨（反向传导）" },

  // === v3 新增：交易所传导 ===
  { from: "fiber_exchange", to: "raw_material", coefficient: 0.85, description: "棉花期货->现货价格（期货是现货先行指标，传导率高）" },
  { from: "fiber_exchange", to: "yarn", coefficient: 0.60, description: "纱线期货->纱线现货定价" },

  // === v3 新增：贸易公司传导 ===
  { from: "manufacturing", to: "trading_co", coefficient: 0.95, description: "成衣出厂->贸易公司采购（接近1:1传导）" },
  { from: "trading_co", to: "brand", coefficient: 0.90, description: "贸易分销->品牌入库（含贸易加价）" },

  // === v3 新增：二批/二手传导 ===
  { from: "brand", to: "secondhand", coefficient: 0.20, description: "品牌库存->二批清仓（过季库存流向折扣渠道）" },
  { from: "channel", to: "secondhand", coefficient: 0.15, description: "渠道滞销->二批（库存周转压力释放）" },

  // === v3 新增：回收闭环扩展 ===
  { from: "recycling", to: "petrochemical", coefficient: 0.30, description: "再生PET瓶片->涤纶原料（rPET替代原生PTA）" },

  // === v3 新增：资金流传导 ===
  { from: "financial_risk", to: "manufacturing", coefficient: 0.20, description: "利率上升->融资成本上升->制造成本上升" },
  { from: "financial_risk", to: "trading_co", coefficient: 0.25, description: "信贷紧缩->贸易公司资金链紧张->采购能力下降" },

  // === v3 新增：合规风险传导 ===
  { from: "compliance_risk", to: "manufacturing", coefficient: 0.15, description: "ESG/劳工违规->产能受限/整改成本" },
  { from: "compliance_risk", to: "brand", coefficient: 0.10, description: "品牌关联供应商违规->品牌声誉受损" },

  // === v3 Phase E：辅料传导 ===
  { from: "accessories", to: "fabric", coefficient: 0.20, description: "染料/助剂->面料染整成本（占染整成本约20%）" },
  { from: "accessories", to: "manufacturing", coefficient: 0.12, description: "拉链/纽扣/衬布->成衣辅料成本（占成衣成本约12%）" },
  { from: "fabric", to: "accessories", coefficient: 0.10, description: "面料需求->染料需求联动（印染加工量随面料产量变化）" },

  // === v3 Phase E：趋势信号传导（信息流） ===
  { from: "trend_signal", to: "design", coefficient: 0.45, description: "社媒趋势->设计方向调整（趋势匹配度影响设计选款）" },
  { from: "trend_signal", to: "brand", coefficient: 0.30, description: "趋势热度->品牌营销策略（借势营销提升品牌关注度）" },
  { from: "trend_signal", to: "channel", coefficient: 0.35, description: "趋势信号->渠道上新节奏（电商快速响应趋势）" },
  { from: "trend_signal", to: "manufacturing", coefficient: 0.25, description: "供应商询盘增加->产能紧张（趋势驱动的生产需求）" },
  { from: "trend_signal", to: "consumer", coefficient: 0.50, description: "趋势传播->消费者购买意愿增强（信息流驱动消费行为）" },

  // === v3 Phase E：竞争格局传导 ===
  { from: "competition", to: "brand", coefficient: 0.40, description: "竞品降价->自身品牌定价压力（竞争挤压利润空间）" },
  { from: "competition", to: "channel", coefficient: 0.35, description: "竞品渠道扩张->自身渠道份额下降" },
  { from: "competition", to: "manufacturing", coefficient: 0.20, description: "竞品缺货->自身订单增加（需求转移效应）" },
  { from: "competition", to: "consumer", coefficient: 0.25, description: "竞争格局变化->消费者品牌选择转移" },

  // === v3 Phase E：趋势衰退传导（生命周期后半段） ===
  { from: "trend_signal", to: "secondhand", coefficient: 0.15, description: "趋势衰退->过季清仓库存流向二批/折扣渠道" },
  { from: "trend_signal", to: "recycling", coefficient: 0.10, description: "趋势消亡->废弃服装回收量增加" },

  // === v3 Phase E：地缘政治传导扩展 ===
  { from: "geopolitical_risk", to: "trading_co", coefficient: 0.30, description: "关税壁垒->贸易公司进出口成本上升" },
  { from: "geopolitical_risk", to: "accessories", coefficient: 0.15, description: "贸易摩擦->辅料进口成本上升（高端染料/拉链依赖进口）" },
];
