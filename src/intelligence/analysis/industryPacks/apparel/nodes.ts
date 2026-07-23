/**
 * analysis/industryPacks/apparel/nodes.ts - 服装产业链节点（完整链条）
 *
 * 15 环节因果 DAG：
 *   原料 -> 农业投入 -> 石油化工 -> 交易所 -> 纱线 -> 面料 -> 辅料
 *   -> 设计 -> 制造 -> 贸易公司 -> 品牌 -> 渠道 -> 消费者 -> 回收 -> 二批/二手
 *
 * v3: 升级为 SupplyChainNode，每个节点携带：
 *   - geography: 哪些国家生产/消费
 *   - capacity: 产能利用率指标 + 瓶颈阈值
 *   - costFactors: 劳动力/能源/物流成本指标
 *   - inventory: 库存指标 + 安全库存阈值
 *   - demand: 需求指标 + 弹性
 *   - substitution: 替代品指标 + 交叉弹性
 *
 * 不设置扩展字段的节点等同原 IndustryNode（向后兼容）。
 */

import type { SupplyChainNode } from "../../../core/industry-pack";

export const apparelNodes: SupplyChainNode[] = [
  {
    nodeId: "raw_material",
    label: "Raw Material (Cotton / Wool / Silk / Hemp)",
    position: 1,
    metrics: ["cotton_price", "wool_price", "silk_price", "cotton_export_value", "cotton_import_value", "cotton_net_trade"],
    geography: {
      producerCountries: ["IN", "CN", "US", "BR"],  // 印度/中国/美国/巴西
      consumerCountries: ["CN", "BD", "VN", "TR"],  // 中国/孟加拉/越南/土耳其
    },
    capacity: {
      utilizationMetric: "utilization_pct",
      bottleneckThreshold: 90,
    },
    costFactors: {
      laborCostMetric: "labor_cost_in",
      energyCostMetric: "energy_cost_in",
    },
    inventory: {
      inventoryMetric: "cotton_inventory",
      safetyStockThreshold: 500_000,
    },
    substitution: {
      substituteMetric: "pta_price",
      crossElasticity: 0.3,  // PTA与棉花有一定替代性
    },
  },
  {
    // v3 新增：农业投入 - 种子/化肥/土地/农药/灌溉
    // 影响棉花等天然纤维的种植成本和产量
    nodeId: "agri_inputs",
    label: "Agricultural Inputs (Seeds / Fertilizer / Land / Pesticide)",
    position: 2,
    metrics: ["seed_price", "fertilizer_price", "land_rent", "pesticide_cost", "irrigation_cost"],
    geography: {
      producerCountries: ["CN", "IN", "US", "BR"],  // 农业投入品主要生产/使用国
      consumerCountries: ["IN", "CN", "US", "BR", "PK"],  // 主要农业国
    },
    capacity: {
      utilizationMetric: "fertilizer_capacity_util",
      bottleneckThreshold: 85,
    },
    costFactors: {
      energyCostMetric: "natural_gas_price",  // 化肥生产高度依赖天然气
    },
    demand: {
      demandMetric: "cotton_planting_area",
      elasticity: -0.5,  // 农业投入需求弹性较低
    },
  },
  {
    // v3 新增：石油化工 - 原油->石脑油->PX->PTA->涤纶
    // PTA 是棉花的主要替代品（涤纶）的上游原料
    nodeId: "petrochemical",
    label: "Petrochemical (Crude Oil -> PTA -> Polyester)",
    position: 3,
    metrics: ["crude_oil_price", "pta_feedstock_price", "m_eg_price", "polyester_staple_price", "polyester_filament_price", "pta_price"],
    geography: {
      producerCountries: ["CN", "IN", "KR", "SA"],  // 中国/印度/韩国/沙特
      consumerCountries: ["CN", "IN", "BD", "VN", "TR"],
    },
    capacity: {
      utilizationMetric: "pta_capacity_util",
      bottleneckThreshold: 90,
    },
    costFactors: {
      energyCostMetric: "crude_oil_price",  // 石化行业能源即原料
      logisticsCostMetric: "freight_index_fbx",
    },
    inventory: {
      inventoryMetric: "pta_inventory",
      safetyStockThreshold: 200_000,
    },
    substitution: {
      substituteMetric: "cotton_price",  // PTA/涤纶与棉花双向替代
      crossElasticity: 0.25,
    },
  },
  {
    // v3 新增：交易所 - 期货/现货/全球价格发现
    // 期货价格是现货价格的先行指标
    nodeId: "fiber_exchange",
    label: "Fiber Exchange (Futures / Spot / Price Discovery)",
    position: 4,
    metrics: ["cotton_futures_price", "yarn_futures_price", "fiber_spot_index", "futures_basis"],
    geography: {
      producerCountries: ["CN", "US", "IN"],  // 郑商所/ICE/印度MCX
      consumerCountries: ["CN", "IN", "BD", "VN", "TR"],  // 全球市场参与者
    },
    demand: {
      demandMetric: "futures_trading_volume",
      elasticity: 0,  // 期货交易量与价格弹性无关
    },
  },
  {
    nodeId: "yarn",
    label: "Yarn Spinning",
    position: 5,
    metrics: ["yarn_price", "pta_price"],
    geography: {
      producerCountries: ["CN", "IN", "VN", "BD"],
      consumerCountries: ["CN", "BD", "VN"],
    },
    capacity: {
      utilizationMetric: "utilization_pct",
      bottleneckThreshold: 95,
    },
    costFactors: {
      laborCostMetric: "labor_cost_cn",
      energyCostMetric: "energy_cost_cn",
    },
  },
  {
    nodeId: "fabric",
    label: "Fabric Weaving & Dyeing (Keqiao Index)",
    position: 6,
    metrics: ["fabric_price_per_m", "keqiao_index"],
    geography: {
      producerCountries: ["CN", "KR", "TW"],  // 中国柯桥/韩国/台湾
      consumerCountries: ["BD", "VN", "CN"],
    },
    capacity: {
      utilizationMetric: "utilization_pct",
      bottleneckThreshold: 88,
    },
    costFactors: {
      laborCostMetric: "labor_cost_cn",
      energyCostMetric: "energy_cost_cn",
      logisticsCostMetric: "freight_index_fbx",
    },
  },
  {
    // v3 Phase E 新增：辅料 - 染料/助剂/拉链/纽扣/衬布/标签/包装
    // 辅料成本占成衣成本的 5-15%，染料影响印染环节（环保合规风险）
    nodeId: "accessories",
    label: "Accessories & Chemicals (Dyes / Zippers / Buttons / Labels)",
    position: 6.5,
    metrics: ["dye_price", "auxiliary_price", "zipper_price", "button_price", "interlining_price", "label_price", "packaging_cost"],
    geography: {
      producerCountries: ["CN", "IN", "TW", "KR"],  // 中国/印度/台湾/韩国
      consumerCountries: ["CN", "BD", "VN", "IN"],   // 主要成衣制造国
    },
    capacity: {
      utilizationMetric: "utilization_pct",
      bottleneckThreshold: 88,
    },
    costFactors: {
      laborCostMetric: "labor_cost_cn",
      energyCostMetric: "energy_cost_cn",
    },
    inventory: {
      inventoryMetric: "garment_inventory",
      safetyStockThreshold: 500_000,
    },
    demand: {
      demandMetric: "order_volume",
      elasticity: -0.8,
    },
  },
  {
    nodeId: "design",
    label: "Design & Development (BOM / Pattern)",
    position: 7,
    metrics: ["design_trend", "bom_accuracy"],
    // 设计环节无明确地理属性（全球分散）
  },
  {
    nodeId: "manufacturing",
    label: "Manufacturing (Cutting / Sewing / QC)",
    position: 8,
    metrics: ["fob_price_garment", "utilization_pct", "oee"],
    geography: {
      producerCountries: ["CN", "BD", "VN", "IN"],  // 主要成衣制造国
      consumerCountries: ["JP", "US", "EU", "CN"],
    },
    capacity: {
      utilizationMetric: "utilization_pct",
      bottleneckThreshold: 92,
    },
    costFactors: {
      laborCostMetric: "labor_cost_bd",
      energyCostMetric: "energy_cost_bd",
      logisticsCostMetric: "freight_index_fbx",
    },
    inventory: {
      inventoryMetric: "garment_inventory",
      safetyStockThreshold: 1_000_000,
    },
    demand: {
      demandMetric: "order_volume",
      elasticity: -1.0,  // 服装需求弹性适中
    },
  },
  {
    // v3 新增：贸易公司 - 进出口/采购/分销/退税
    // 连接制造端和品牌端，处理跨境物流、清关、退税
    nodeId: "trading_co",
    label: "Trading Company (Import/Export / Procurement / Distribution)",
    position: 9,
    metrics: ["trading_margin", "import_export_volume", "procurement_cost", "distribution_cost", "tax_refund_rate"],
    geography: {
      producerCountries: ["CN", "HK", "SG"],  // 中国/香港/新加坡贸易枢纽
      consumerCountries: ["JP", "US", "EU", "CN"],
    },
    capacity: {
      utilizationMetric: "logistics_throughput",
      bottleneckThreshold: 85,
    },
    costFactors: {
      logisticsCostMetric: "freight_index_fbx",
    },
    inventory: {
      inventoryMetric: "trading_inventory",
      safetyStockThreshold: 2_000_000,
    },
    demand: {
      demandMetric: "order_volume",
      elasticity: -0.8,
    },
  },
  {
    nodeId: "brand",
    label: "Brand Operations (Positioning / Pricing)",
    position: 10,
    metrics: ["brand_health", "gross_margin"],
    // 品牌环节无物理产能属性
  },
  {
    nodeId: "channel",
    label: "Channel & Retail",
    position: 11,
    metrics: ["retail_price_garment", "sell_through_rate"],
    geography: {
      producerCountries: [],  // 渠道不在"生产"
      consumerCountries: ["JP", "US", "EU", "CN", "KR"],
    },
    inventory: {
      inventoryMetric: "retail_inventory",
      safetyStockThreshold: 500_000,
    },
    demand: {
      demandMetric: "retail_sales_value",
      elasticity: -1.2,  // 零售端需求弹性更高
    },
  },
  {
    nodeId: "consumer",
    label: "Consumer Behavior",
    position: 12,
    metrics: ["consumer_confidence", "cpi_index"],
    geography: {
      producerCountries: [],
      consumerCountries: ["JP", "US", "EU", "CN", "KR"],
    },
    demand: {
      demandMetric: "retail_sales_value",
      elasticity: -1.5,  // 消费者端需求弹性最高
    },
  },
  {
    nodeId: "recycling",
    label: "Recycling & Circular Economy",
    position: 13,
    metrics: ["recycled_fiber_ratio", "lca_score"],
    // 回收环节影响原料成本（回环边），不单独标地理属性
  },
  {
    // v3 Phase E 新增：二批/二手流通 - 库存清仓/过季/二手/折扣渠道
    // 吸收品牌和渠道的滞销库存，形成价格发现机制
    nodeId: "secondhand",
    label: "Off-price & Secondhand (Surplus / Discount / Resale)",
    position: 14,
    metrics: ["secondhand_price", "surplus_inventory", "offprice_retail"],
    geography: {
      producerCountries: [],  // 二批不"生产"
      consumerCountries: ["CN", "IN", "US", "AF"],  // 中国内销/东南亚/美国/非洲（二手服装进口大国）
    },
    inventory: {
      inventoryMetric: "surplus_inventory",
      safetyStockThreshold: 5_000_000,
    },
    demand: {
      demandMetric: "offprice_retail",
      elasticity: -2.0,  // 折扣渠道价格弹性最高
    },
  },
  {
    // v3 Phase E 新增：趋势信号 - 社媒/搜索/电商上新/供应商询盘
    // 信息流的载体节点，position=0 表示非物理链条节点（同风险节点）
    nodeId: "trend_signal",
    label: "Trend Signal (Social Media / Search / E-commerce Buzz)",
    position: 0,
    metrics: [
      "social_media_mentions", "search_index", "pinterest_saves", "tiktok_views",
      "ecommerce_new_listings", "supplier_inquiries", "sample_requests",
      "trend_lifecycle_stage", "trend_velocity", "trend_saturation",
    ],
  },
  {
    // v3 Phase E 新增：竞争格局 - 竞品价格/市占率/爆款生命周期
    // position=0 表示非物理链条节点（同风险节点）
    nodeId: "competition",
    label: "Competition Landscape (Market Share / Competitor Pricing)",
    position: 0,
    metrics: ["market_share", "competitor_price", "competitor_sales", "bestseller_lifecycle", "sku_depth", "ad_spend", "roas"],
  },
];
