/**
 * analysis/industryPacks/apparel/supply-lanes.ts - 服装行业国家间供应通道
 *
 * 真实供应链图（基于 WorldsTopExports 2024 贸易流 + 行业知识）：
 *
 *   棉花出口国:  中国($10.8B) 印度($6.5B) 美国($6.2B) 巴西($5.3B)
 *   棉花进口国:  中国($9.3B) 孟加拉($7.7B) 越南($4.8B) 土耳其($2.4B)
 *
 *   纱线出口:    中国->越南, 中国->孟加拉, 印度->孟加拉
 *   面料出口:    中国->孟加拉, 中国->越南, 韩国->越南
 *   成衣出口:    中国->日本, 越南->日本, 孟加拉->日本, 孟加拉->欧盟
 *
 * 每条 SupplyLane 编码了"谁供给谁"的关系，
 * 以及运费/关税/交期/贸易量等物流维度。
 *
 * Analyst 的 buildSupplyLaneEdges 读取这些通道，
 * 当通道起点国家的指标异常时，自动建到终点国家指标的因果边。
 */

import type { SupplyLane } from "../../../core/industry-pack";

export const apparelSupplyLanes: SupplyLane[] = [
  // === 棉花（原料级） ===
  {
    id: "lane-cotton-india-bangladesh",
    from: { country: "IN", node: "raw_material" },
    to: { country: "BD", node: "raw_material" },
    freightCost: { min: 30, max: 80, unit: "USD/ton" },
    tariffRate: { min: 0, max: 5, unit: "%" },
    leadTimeDays: 25,
    volume: { min: 2_000_000, max: 4_000_000, unit: "bales" },
    description: "印度棉花出口到孟加拉（孟加拉最大棉花来源，年 ~$3B）",
  },
  {
    id: "lane-cotton-india-china",
    from: { country: "IN", node: "raw_material" },
    to: { country: "CN", node: "raw_material" },
    freightCost: { min: 40, max: 100, unit: "USD/ton" },
    tariffRate: { min: 0, max: 1, unit: "%" },
    leadTimeDays: 20,
    volume: { min: 500_000, max: 1_500_000, unit: "bales" },
    description: "印度棉花出口到中国（配额内关税极低）",
  },
  {
    id: "lane-cotton-brazil-china",
    from: { country: "BR", node: "raw_material" },
    to: { country: "CN", node: "raw_material" },
    freightCost: { min: 60, max: 140, unit: "USD/ton" },
    tariffRate: { min: 0, max: 1, unit: "%" },
    leadTimeDays: 40,
    volume: { min: 1_000_000, max: 2_500_000, unit: "bales" },
    description: "巴西棉花出口到中国（2024增长65%，替代美国供给）",
  },
  {
    id: "lane-cotton-usa-china",
    from: { country: "US", node: "raw_material" },
    to: { country: "CN", node: "raw_material" },
    freightCost: { min: 50, max: 120, unit: "USD/ton" },
    tariffRate: { min: 0, max: 25, unit: "%" },
    leadTimeDays: 35,
    volume: { min: 800_000, max: 2_000_000, unit: "bales" },
    description: "美国棉花出口到中国（关税不确定性高）",
  },
  {
    id: "lane-cotton-brazil-bangladesh",
    from: { country: "BR", node: "raw_material" },
    to: { country: "BD", node: "raw_material" },
    freightCost: { min: 70, max: 150, unit: "USD/ton" },
    tariffRate: { min: 0, max: 5, unit: "%" },
    leadTimeDays: 45,
    volume: { min: 500_000, max: 1_200_000, unit: "bales" },
    description: "巴西棉花替代供给孟加拉（多元化采购）",
  },

  // === 纱线（中间品级） ===
  {
    id: "lane-yarn-china-vietnam",
    from: { country: "CN", node: "yarn" },
    to: { country: "VN", node: "yarn" },
    freightCost: { min: 10, max: 30, unit: "USD/ton" },
    tariffRate: { min: 0, max: 5, unit: "%" },
    leadTimeDays: 10,
    volume: { min: 100_000, max: 500_000, unit: "tons" },
    description: "中国纱线出口到越南（成衣制造用）",
  },
  {
    id: "lane-yarn-india-bangladesh",
    from: { country: "IN", node: "yarn" },
    to: { country: "BD", node: "yarn" },
    freightCost: { min: 10, max: 25, unit: "USD/ton" },
    tariffRate: { min: 0, max: 3, unit: "%" },
    leadTimeDays: 7,
    volume: { min: 50_000, max: 200_000, unit: "tons" },
    description: "印度纱线出口到孟加拉（区域供应链）",
  },

  // === 面料（中间品级） ===
  {
    id: "lane-fabric-china-bangladesh",
    from: { country: "CN", node: "fabric" },
    to: { country: "BD", node: "fabric" },
    freightCost: { min: 0.5, max: 2, unit: "USD/m" },
    tariffRate: { min: 0, max: 5, unit: "%" },
    leadTimeDays: 15,
    volume: { min: 1_000_000, max: 5_000_000, unit: "meters" },
    description: "中国面料出口到孟加拉（成衣制造用）",
  },
  {
    id: "lane-fabric-china-vietnam",
    from: { country: "CN", node: "fabric" },
    to: { country: "VN", node: "fabric" },
    freightCost: { min: 0.5, max: 2, unit: "USD/m" },
    tariffRate: { min: 0, max: 5, unit: "%" },
    leadTimeDays: 12,
    volume: { min: 2_000_000, max: 8_000_000, unit: "meters" },
    description: "中国面料出口到越南（成衣制造用）",
  },

  // === 成衣（成品级） ===
  {
    id: "lane-garment-china-japan",
    from: { country: "CN", node: "manufacturing" },
    to: { country: "JP", node: "channel" },
    freightCost: { min: 0.5, max: 3, unit: "USD/piece" },
    tariffRate: { min: 0, max: 8, unit: "%" },
    leadTimeDays: 20,
    volume: { min: 50_000_000, max: 200_000_000, unit: "pieces" },
    description: "中国成衣出口到日本零售渠道",
  },
  {
    id: "lane-garment-vietnam-japan",
    from: { country: "VN", node: "manufacturing" },
    to: { country: "JP", node: "channel" },
    freightCost: { min: 0.5, max: 3, unit: "USD/piece" },
    tariffRate: { min: 0, max: 8, unit: "%" },
    leadTimeDays: 18,
    volume: { min: 30_000_000, max: 100_000_000, unit: "pieces" },
    description: "越南成衣出口到日本零售渠道（CPTPP 优惠关税）",
  },
  {
    id: "lane-garment-bangladesh-japan",
    from: { country: "BD", node: "manufacturing" },
    to: { country: "JP", node: "channel" },
    freightCost: { min: 1, max: 4, unit: "USD/piece" },
    tariffRate: { min: 0, max: 8, unit: "%" },
    leadTimeDays: 30,
    volume: { min: 10_000_000, max: 50_000_000, unit: "pieces" },
    description: "孟加拉成衣出口到日本零售渠道（低成本制造）",
  },

  // === v3 新增：原油运输通道 ===
  {
    id: "lane-crude-mideast-china",
    from: { country: "SA", node: "petrochemical" },
    to: { country: "CN", node: "petrochemical" },
    freightCost: { min: 3, max: 12, unit: "USD/bbl" },
    tariffRate: { min: 0, max: 2, unit: "%" },
    leadTimeDays: 25,
    volume: { min: 5_000_000, max: 12_000_000, unit: "bbl/day" },
    description: "中东原油出口到中国（中国PTA产能主要原料来源）",
  },
  {
    id: "lane-crude-us-china",
    from: { country: "US", node: "petrochemical" },
    to: { country: "CN", node: "petrochemical" },
    freightCost: { min: 4, max: 15, unit: "USD/bbl" },
    tariffRate: { min: 0, max: 5, unit: "%" },
    leadTimeDays: 35,
    volume: { min: 500_000, max: 3_000_000, unit: "bbl/day" },
    description: "美国页岩油出口到中国（贸易战影响波动大）",
  },

  // === v3 新增：PTA/涤纶运输通道 ===
  {
    id: "lane-pta-china-india",
    from: { country: "CN", node: "petrochemical" },
    to: { country: "IN", node: "petrochemical" },
    freightCost: { min: 15, max: 40, unit: "USD/ton" },
    tariffRate: { min: 0, max: 5, unit: "%" },
    leadTimeDays: 15,
    volume: { min: 100_000, max: 500_000, unit: "tons/yr" },
    description: "中国PTA出口到印度（印度涤纶产能原料）",
  },
  {
    id: "lane-polyester-china-bangladesh",
    from: { country: "CN", node: "petrochemical" },
    to: { country: "BD", node: "yarn" },
    freightCost: { min: 10, max: 35, unit: "USD/ton" },
    tariffRate: { min: 0, max: 5, unit: "%" },
    leadTimeDays: 12,
    volume: { min: 200_000, max: 800_000, unit: "tons/yr" },
    description: "中国涤纶短纤出口到孟加拉（混纺纱线原料）",
  },
  {
    id: "lane-polyester-china-vietnam",
    from: { country: "CN", node: "petrochemical" },
    to: { country: "VN", node: "yarn" },
    freightCost: { min: 10, max: 30, unit: "USD/ton" },
    tariffRate: { min: 0, max: 3, unit: "%" },
    leadTimeDays: 10,
    volume: { min: 300_000, max: 1_000_000, unit: "tons/yr" },
    description: "中国涤纶长丝出口到越南（纺织原料）",
  },

  // === v3 新增：二手服装出口通道 ===
  {
    id: "lane-secondhand-japan-sea",
    from: { country: "JP", node: "secondhand" },
    to: { country: "PH", node: "secondhand" },
    freightCost: { min: 0.2, max: 1, unit: "USD/piece" },
    tariffRate: { min: 0, max: 30, unit: "%" },
    leadTimeDays: 20,
    volume: { min: 10_000_000, max: 50_000_000, unit: "pieces/yr" },
    description: "日本二手服装出口到东南亚（菲律宾/柬埔寨/缅甸）",
  },
  {
    id: "lane-secondhand-eu-africa",
    from: { country: "EU", node: "secondhand" },
    to: { country: "AF", node: "secondhand" },
    freightCost: { min: 0.1, max: 0.5, unit: "USD/piece" },
    tariffRate: { min: 0, max: 50, unit: "%" },
    leadTimeDays: 30,
    volume: { min: 50_000_000, max: 200_000_000, unit: "pieces/yr" },
    description: "欧美二手服装出口到非洲（加纳/肯尼亚/尼日利亚，全球最大二手服装流向）",
  },

  // === v3 新增：棉花-交易所通道（期货交割） ===
  {
    id: "lane-cotton-futures-zce",
    from: { country: "CN", node: "fiber_exchange" },
    to: { country: "CN", node: "raw_material" },
    leadTimeDays: 0,  // 期货即期影响
    volume: { min: 10_000, max: 500_000, unit: "lots" },
    description: "郑商所棉花期货交割 -> 影响国内现货定价",
  },

  // === v3 Phase E：辅料供应通道 ===
  {
    id: "lane-dye-china-bangladesh",
    from: { country: "CN", node: "accessories" },
    to: { country: "BD", node: "accessories" },
    freightCost: { min: 0.5, max: 2, unit: "USD/kg" },
    tariffRate: { min: 0, max: 7, unit: "%" },
    leadTimeDays: 15,
    volume: { min: 5_000, max: 30_000, unit: "tons/yr" },
    description: "中国染料出口到孟加拉（印染厂原料）",
  },
  {
    id: "lane-dye-india-china",
    from: { country: "IN", node: "accessories" },
    to: { country: "CN", node: "accessories" },
    freightCost: { min: 0.3, max: 1.5, unit: "USD/kg" },
    tariffRate: { min: 0, max: 5, unit: "%" },
    leadTimeDays: 12,
    volume: { min: 3_000, max: 15_000, unit: "tons/yr" },
    description: "印度染料/中间体出口到中国（分散染料中间体）",
  },
  {
    id: "lane-zipper-japan-china",
    from: { country: "JP", node: "accessories" },
    to: { country: "CN", node: "accessories" },
    freightCost: { min: 0.01, max: 0.05, unit: "USD/piece" },
    tariffRate: { min: 0, max: 10, unit: "%" },
    leadTimeDays: 10,
    volume: { min: 10_000_000, max: 100_000_000, unit: "pieces/yr" },
    description: "日本YKK拉链出口到中国成衣厂（高端拉链依赖进口）",
  },
  {
    id: "lane-accessories-china-vietnam",
    from: { country: "CN", node: "accessories" },
    to: { country: "VN", node: "accessories" },
    freightCost: { min: 0.005, max: 0.03, unit: "USD/piece" },
    tariffRate: { min: 0, max: 5, unit: "%" },
    leadTimeDays: 8,
    volume: { min: 50_000_000, max: 300_000_000, unit: "pieces/yr" },
    description: "中国辅料（纽扣/标签/包装）出口到越南成衣厂",
  },

  // === v3 Phase E：竞争情报通道（竞品制造国->消费市场） ===
  {
    id: "lane-competitor-vietnam-usa",
    from: { country: "VN", node: "manufacturing" },
    to: { country: "US", node: "channel" },
    freightCost: { min: 0.5, max: 3, unit: "USD/piece" },
    tariffRate: { min: 0, max: 15, unit: "%" },
    leadTimeDays: 25,
    volume: { min: 100_000_000, max: 500_000_000, unit: "pieces/yr" },
    description: "越南成衣出口到美国（中美贸易战受益者，竞争情报监测重点）",
  },
  {
    id: "lane-competitor-bangladesh-eu",
    from: { country: "BD", node: "manufacturing" },
    to: { country: "EU", node: "channel" },
    freightCost: { min: 1, max: 4, unit: "USD/piece" },
    tariffRate: { min: 0, max: 0, unit: "%" },
    leadTimeDays: 30,
    volume: { min: 200_000_000, max: 800_000_000, unit: "pieces/yr" },
    description: "孟加拉成衣出口到欧盟（EBA免关税，价格竞争优势显著）",
  },
];
