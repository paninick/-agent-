/**
 * client/decisionTypes.ts — 决策中心 Phase 1 MVP 类型定义
 *
 * 基于UI/UX专家+产品策略师论证结论：
 * - 决策就绪度全局信号
 * - 决策中心式首屏（待决策问题列表）
 * - 6个学科方法论专业指标解读卡
 * - 建议行动卡片矩阵（采纳/拒绝/暂存）
 * - 决策证据链下钻（可下钻原始数据）
 */

// ============================================================
// 决策就绪度
// ============================================================

/** 决策就绪度状态 */
export type ReadinessLevel = "ready" | "partial" | "waiting";

/** 决策就绪度全局信号 */
export interface DecisionReadiness {
  level: ReadinessLevel;
  /** 可执行的 P0 决策数 */
  readyDecisions: number;
  /** 等待补全的数据项数 */
  pendingItems: number;
  /** 简短说明 */
  summary: string;
  /** 缺失项列表 */
  gaps: string[];
}

// ============================================================
// 决策中心 — 待决策问题列表
// ============================================================

/** 决策优先级 */
export type DecisionPriority = "P0" | "P1" | "P2";

/** 决策类型 */
export type DecisionCategory = "risk" | "opportunity" | "exit" | "monitor";

/** 决策状态 */
export type DecisionStatus = "pending" | "accepted" | "rejected" | "deferred";

/** 单个待决策问题 */
export interface DecisionItem {
  id: string;
  priority: DecisionPriority;
  category: DecisionCategory;
  title: string;
  description: string;
  /** 数据依据摘要 */
  rationale: string;
  /** 预期影响 */
  expectedImpact: string;
  /** 建议时间窗口 */
  timeframe: string;
  /** 跟踪指标 */
  kpiToTrack: string[];
  /** 置信度 0-1 */
  confidence: number;
  status: DecisionStatus;
  /** 关联证据ID列表 */
  evidenceIds: string[];
  /** 关联指标ID列表 */
  metricIds: string[];
  /** 冲突的决策ID列表 */
  conflictsWith?: string[];
}

// ============================================================
// 6个学科方法论专业指标
// ============================================================

/** 指标维度（8维度，趋势降级为横向属性） */
export type MetricDimension =
  | "price"        // 💲 价格（微观经济学）
  | "capacity"     // 📦 产能（生产理论）
  | "inventory"    // 📊 库存（运筹学/供应链管理）
  | "trade"        // 🚢 贸易（国际贸易学）
  | "policy"       // ⚖️ 政策法规（政策学）
  | "finance"      // 💱 汇率金融（金融学）
  | "competition"; // 🏆 竞争（产业组织理论）

/** 学科方法论 */
export interface Methodology {
  /** 学科名称 */
  discipline: string;
  /** 理论名称 */
  theory: string;
  /** 数学公式 */
  formula: string;
  /** 方法论说明 */
  description: string;
  /** 适用场景 */
  applicableScenarios: string[];
  /** 局限性 */
  limitations: string[];
  /** 参考文献 */
  references?: string[];
}

/** 趋势数据点（sparkline用） */
export interface TrendPoint {
  timestamp: string;
  value: number;
}

/** 异常标注 */
export interface AnomalyMark {
  timestamp: string;
  value: number;
  type: "spike" | "drop" | "outlier";
  note: string;
}

/** 专业指标解读卡数据 */
export interface ProfessionalMetric {
  id: string;
  /** 指标名称 */
  name: string;
  /** 维度 */
  dimension: MetricDimension;
  /** 学科图标 emoji */
  icon: string;
  /** 学科色系 hex */
  color: string;
  /** 当前主数值 */
  value: number;
  /** 单位 */
  unit: string;
  /** 变化趋势（近5轮） */
  trend: TrendPoint[];
  /** 行业基准线 */
  benchmark: { min: number; max: number; label: string };
  /** 置信区间 */
  confidenceInterval: { lower: number; upper: number; level: number };
  /** 异常标注 */
  anomalies: AnomalyMark[];
  /** 当前解读（一句话） */
  interpretation: string;
  /** 是否异常 */
  isAbnormal: boolean;
  /** 学科方法论 */
  methodology: Methodology;
  /** 关联证据ID列表 */
  evidenceIds: string[];
  /** 原始数据（下钻用） */
  rawData?: RawDataEntry[];
}

/** 原始数据条目（证据链下钻用） */
export interface RawDataEntry {
  id: string;
  sourceId: string;
  /** 来源机构 */
  institution: string;
  /** 来源等级 */
  tier: "A" | "B" | "C" | "D";
  /** 数据类型标签 */
  dataType: string;
  /** 原始值 */
  rawValue: string | number;
  /** 标准化值 */
  normalizedValue?: string | number;
  /** 采集时间 */
  collectedAt: string;
  /** 数据新鲜度（距今天数） */
  freshnessDays: number;
  /** 字段完整性 0-1 */
  completeness: number;
  /** 交叉验证状态 */
  crossValidation: "consistent" | "deviation" | "conflict";
  /** 验证说明 */
  validationNote?: string;
}

// ============================================================
// 建议行动卡片矩阵
// ============================================================

/** 建议优先级 */
export type AdvicePriority = "critical" | "high" | "medium" | "low";

/** 建议类型 */
export type AdviceType = "risk" | "opportunity" | "exit" | "monitor";

/** 建议状态 */
export type AdviceStatus = "pending" | "accepted" | "rejected" | "deferred";

/** 执行路径步骤 */
export interface ExecutionStep {
  order: number;
  action: string;
  expectedOutcome: string;
}

/** 行动建议卡片 */
export interface ActionAdvice {
  id: string;
  priority: AdvicePriority;
  type: AdviceType;
  title: string;
  description: string;
  /** 数据依据摘要 */
  rationale: string;
  /** 学科方法论依据 */
  methodologyBasis: string;
  /** 预期影响 */
  expectedImpact: string;
  /** 时间窗口 */
  timeframe: string;
  /** 跟踪指标 */
  kpiToTrack: string[];
  /** 执行路径 */
  executionPath: ExecutionStep[];
  /** 置信度 0-1 */
  confidence: number;
  status: AdviceStatus;
  /** 关联指标ID列表 */
  metricIds: string[];
  /** 关联证据ID列表 */
  evidenceIds: string[];
  /** 冲突建议ID列表 */
  conflictsWith?: string[];
}

// ============================================================
// 证据链下钻
// ============================================================

/** 证据链节点 */
export interface EvidenceChainNode {
  id: string;
  /** 节点类型 */
  type: "source" | "institution" | "validation" | "methodology";
  /** 节点标签 */
  label: string;
  /** 节点详情 */
  detail: string;
  /** 子节点 */
  children?: EvidenceChainNode[];
}

// ============================================================
// 视图模式
// ============================================================

/** 前端视图模式 */
export type ViewMode = "decision" | "analysis";

// ============================================================
// 模拟数据生成器（MVP阶段用，后续接入真实SSE数据）
// ============================================================

/** 创建模拟决策就绪度 */
export function createMockReadiness(): DecisionReadiness {
  return {
    level: "partial",
    readyDecisions: 2,
    pendingItems: 3,
    summary: "当前情报可支撑 2 项 P0 决策，等待 3 项数据补全",
    gaps: [
      "FRED 利率数据缺 key",
      "US Census 贸易统计缺 key",
      "Open Supply Hub 工厂映射缺 key",
    ],
  };
}

/** 创建模拟待决策列表 */
export function createMockDecisions(): DecisionItem[] {
  return [
    {
      id: "dec-001",
      priority: "P0",
      category: "risk",
      title: "越南面料供应商交货延迟 14 天，触发库存预警",
      description: "越南 HS60 面料进口成本上涨 5.5%，交货延迟指数从 6 天升至 14 天，影响 12 家门店夏季基础款补货",
      rationale: "3 源一致（Comtrade + World Bank + BLS），置信度 87%",
      expectedImpact: "预计降低缺货率 0.8pp，物流成本增加 ¥6,420",
      timeframe: "48 小时内执行",
      kpiToTrack: ["缺货率", "库存周转率", "客户满意度"],
      confidence: 0.87,
      status: "pending",
      evidenceIds: ["ev-001", "ev-002", "ev-003"],
      metricIds: ["metric-delay", "metric-risk"],
    },
    {
      id: "dec-002",
      priority: "P0",
      category: "opportunity",
      title: "棉花价格回落 8%，建议锁定 Q3 采购合同",
      description: "棉花期货从 $2.85/kg 降至 $2.62/kg，传导率 78% 显示面料价格将跟随回落，建议锁定 3 个月用量",
      rationale: "传导率模型基于 Engel-Granger 协整检验，准确率 73%",
      expectedImpact: "预计节约采购成本 ¥42,000",
      timeframe: "本周内执行",
      kpiToTrack: ["原料采购成本", "面料价格", "毛利率"],
      confidence: 0.82,
      status: "pending",
      evidenceIds: ["ev-004", "ev-005"],
      metricIds: ["metric-propagation"],
      conflictsWith: ["dec-003"],
    },
    {
      id: "dec-003",
      priority: "P1",
      category: "monitor",
      title: "美元/人民币汇率波动加大，关注账期风险",
      description: "汇率 30 天波动率从 2.1% 升至 3.8%，服装出口账期 60-90 天，汇率敏感度模型显示利润影响 ±2.4%",
      rationale: "ECB 月均汇率 + BLS 通胀数据，2 源一致",
      expectedImpact: "建议与财务部门评估远期结售汇",
      timeframe: "持续监控至 Q3 末",
      kpiToTrack: ["汇率波动率", "远期结售汇比例", "汇兑损益"],
      confidence: 0.74,
      status: "pending",
      evidenceIds: ["ev-006"],
      metricIds: ["metric-risk"],
      conflictsWith: ["dec-002"],
    },
  ];
}

/** 创建模拟专业指标 */
export function createMockMetrics(): ProfessionalMetric[] {
  const now = Date.now();
  const day = 86400000;
  return [
    {
      id: "metric-propagation",
      name: "原料传导率",
      dimension: "price",
      icon: "💲",
      color: "#F59E0B",
      value: 78,
      unit: "%",
      trend: [
        { timestamp: new Date(now - 5 * day).toISOString(), value: 75 },
        { timestamp: new Date(now - 4 * day).toISOString(), value: 73 },
        { timestamp: new Date(now - 3 * day).toISOString(), value: 76 },
        { timestamp: new Date(now - 2 * day).toISOString(), value: 77 },
        { timestamp: new Date(now - 1 * day).toISOString(), value: 78 },
      ],
      benchmark: { min: 70, max: 80, label: "服装行业经验值" },
      confidenceInterval: { lower: 74, upper: 82, level: 95 },
      anomalies: [],
      interpretation: "中度传导，符合行业经验值",
      isAbnormal: false,
      methodology: {
        discipline: "经济学",
        theory: "价格传导机制 (Price Pass-Through)",
        formula: "传导率 = ΔP下游 / ΔP上游 × 100%",
        description: "沿产业链上游到下游的价格传导，传导率反映价格信号的传递效率",
        applicableScenarios: ["棉花→纱线", "纱线→面料", "面料→成衣"],
        limitations: ["假设线性传导", "未考虑价格管制", "滞后时间需独立估计"],
      },
      evidenceIds: ["ev-001", "ev-004"],
    },
    {
      id: "metric-inventory",
      name: "库销比",
      dimension: "inventory",
      icon: "📊",
      color: "#84CC16",
      value: 3.2,
      unit: "",
      trend: [
        { timestamp: new Date(now - 5 * day).toISOString(), value: 2.8 },
        { timestamp: new Date(now - 4 * day).toISOString(), value: 2.9 },
        { timestamp: new Date(now - 3 * day).toISOString(), value: 3.0 },
        { timestamp: new Date(now - 2 * day).toISOString(), value: 3.1 },
        { timestamp: new Date(now - 1 * day).toISOString(), value: 3.2 },
      ],
      benchmark: { min: 2.0, max: 3.0, label: "服装行业健康区间" },
      confidenceInterval: { lower: 3.0, upper: 3.4, level: 95 },
      anomalies: [{ timestamp: new Date(now - 1 * day).toISOString(), value: 3.2, type: "spike", note: "超过健康上限" }],
      interpretation: "库存积压预警，超过健康区间上限",
      isAbnormal: true,
      methodology: {
        discipline: "供应链管理",
        theory: "库存管理理论",
        formula: "库销比 = 库存价值 / 月销量价值",
        description: "反映供需平衡和库存效率，基于 EOQ 经济订货量的安全库存基准",
        applicableScenarios: ["成品库存", "面料库存", "原料库存"],
        limitations: ["未考虑季节性", "未区分 ABC 分类", "月度数据有滞后"],
      },
      evidenceIds: ["ev-002"],
    },
    {
      id: "metric-capacity",
      name: "产能利用率",
      dimension: "capacity",
      icon: "📦",
      color: "#3B82F6",
      value: 87,
      unit: "%",
      trend: [
        { timestamp: new Date(now - 5 * day).toISOString(), value: 82 },
        { timestamp: new Date(now - 4 * day).toISOString(), value: 84 },
        { timestamp: new Date(now - 3 * day).toISOString(), value: 85 },
        { timestamp: new Date(now - 2 * day).toISOString(), value: 86 },
        { timestamp: new Date(now - 1 * day).toISOString(), value: 87 },
      ],
      benchmark: { min: 60, max: 95, label: "合理区间" },
      confidenceInterval: { lower: 83, upper: 91, level: 95 },
      anomalies: [],
      interpretation: "健康区间，接近上限需关注产能瓶颈",
      isAbnormal: false,
      methodology: {
        discipline: "产业经济学",
        theory: "产能理论",
        formula: "利用率 = 实际产量 / 设计产能 × 100%",
        description: "基于 Cobb-Douglas 生产函数的产能估计，反映产能利用效率",
        applicableScenarios: ["工厂产能", "产线利用率", "设备开动率"],
        limitations: ["设计产能需定期更新", "未考虑产品组合差异", "月度统计有滞后"],
      },
      evidenceIds: ["ev-003"],
    },
    {
      id: "metric-risk",
      name: "供应链风险指数",
      dimension: "trade",
      icon: "⚠️",
      color: "#EF4444",
      value: 58,
      unit: "",
      trend: [
        { timestamp: new Date(now - 5 * day).toISOString(), value: 42 },
        { timestamp: new Date(now - 4 * day).toISOString(), value: 45 },
        { timestamp: new Date(now - 3 * day).toISOString(), value: 50 },
        { timestamp: new Date(now - 2 * day).toISOString(), value: 54 },
        { timestamp: new Date(now - 1 * day).toISOString(), value: 58 },
      ],
      benchmark: { min: 0, max: 40, label: "低风险阈值" },
      confidenceInterval: { lower: 52, upper: 64, level: 90 },
      anomalies: [{ timestamp: new Date(now - 3 * day).toISOString(), value: 50, type: "spike", note: "进入中风险区间" }],
      interpretation: "中风险，风险指数持续上升需关注",
      isAbnormal: true,
      methodology: {
        discipline: "风险管理",
        theory: "多因子风险模型",
        formula: "风险指数 = Σ(wi × ri), wi=权重, ri=因子风险分(0-1)",
        description: "加权多维度风险因子，AHP 层次分析法确定权重，Monte Carlo 模拟置信区间",
        applicableScenarios: ["地缘政治", "汇率波动", "关税政策", "产能集中度", "供应商依赖", "交货延迟"],
        limitations: ["权重需定期校准", "因子间有相关性", "Monte Carlo 有计算成本"],
      },
      evidenceIds: ["ev-005", "ev-006"],
    },
    {
      id: "metric-delay",
      name: "交货延迟指数",
      dimension: "trade",
      icon: "🚢",
      color: "#8B5CF6",
      value: 14,
      unit: "天",
      trend: [
        { timestamp: new Date(now - 5 * day).toISOString(), value: 6 },
        { timestamp: new Date(now - 4 * day).toISOString(), value: 8 },
        { timestamp: new Date(now - 3 * day).toISOString(), value: 10 },
        { timestamp: new Date(now - 2 * day).toISOString(), value: 12 },
        { timestamp: new Date(now - 1 * day).toISOString(), value: 14 },
      ],
      benchmark: { min: 0, max: 7, label: "正常天数" },
      confidenceInterval: { lower: 11, upper: 17, level: 95 },
      anomalies: [{ timestamp: new Date(now - 2 * day).toISOString(), value: 12, type: "spike", note: "超过预警线" }],
      interpretation: "高风险，交货延迟持续恶化",
      isAbnormal: true,
      methodology: {
        discipline: "供应链管理",
        theory: "交货绩效",
        formula: "延迟指数 = (实际交货天数 - 承诺天数) / 承诺天数 × 100%",
        description: "订单级数据统计，排除 3σ 外异常值",
        applicableScenarios: ["供应商交货", "物流运输", "港口清关"],
        limitations: ["需订单级数据", "排除异常值有偏差", "未区分延迟原因"],
      },
      evidenceIds: ["ev-001"],
    },
    {
      id: "metric-hhi",
      name: "市场集中度 HHI",
      dimension: "competition",
      icon: "🏆",
      color: "#EC4899",
      value: 1820,
      unit: "",
      trend: [
        { timestamp: new Date(now - 5 * day).toISOString(), value: 1750 },
        { timestamp: new Date(now - 4 * day).toISOString(), value: 1780 },
        { timestamp: new Date(now - 3 * day).toISOString(), value: 1800 },
        { timestamp: new Date(now - 2 * day).toISOString(), value: 1810 },
        { timestamp: new Date(now - 1 * day).toISOString(), value: 1820 },
      ],
      benchmark: { min: 0, max: 1500, label: "竞争阈值" },
      confidenceInterval: { lower: 1700, upper: 1940, level: 90 },
      anomalies: [],
      interpretation: "适度集中，接近高度集中阈值",
      isAbnormal: false,
      methodology: {
        discipline: "产业经济学",
        theory: "市场结构 (HHI)",
        formula: "HHI = Σ(企业i市场份额%)²",
        description: "反垄断经济学标准，DOJ 分类：<1500 竞争 / 1500-2500 适度集中 / >2500 高度集中",
        applicableScenarios: ["面料供应商", "成衣代工厂", "品牌零售"],
        limitations: ["市场范围定义影响结果", "未考虑潜在竞争", "份额数据有滞后"],
      },
      evidenceIds: ["ev-003"],
    },
  ];
}

/** 创建模拟行动建议 */
export function createMockAdvices(): ActionAdvice[] {
  return [
    {
      id: "advice-001",
      priority: "critical",
      type: "risk",
      title: "启动跨仓调拨 1,280 件夏季基础款",
      description: "越南交货延迟 14 天，上海/杭州 12 家门店库存仅够 5 天，需从南京仓调拨",
      rationale: "3 源一致（Comtrade + World Bank + BLS），置信度 87%",
      methodologyBasis: "基于交货延迟指数 + 库销比综合分析",
      expectedImpact: "预计降低缺货率 0.8pp，物流成本增加 ¥6,420",
      timeframe: "48 小时内执行",
      kpiToTrack: ["缺货率", "库存周转率", "客户满意度"],
      executionPath: [
        { order: 1, action: "南京仓确认库存可用", expectedOutcome: "1,280 件可用" },
        { order: 2, action: "创建调拨单并审批", expectedOutcome: "审批通过" },
        { order: 3, action: "物流发货 12 家门店", expectedOutcome: "48 小时内到货" },
      ],
      confidence: 0.87,
      status: "pending",
      metricIds: ["metric-delay", "metric-risk", "metric-inventory"],
      evidenceIds: ["ev-001", "ev-002", "ev-003"],
    },
    {
      id: "advice-002",
      priority: "high",
      type: "opportunity",
      title: "锁定 Q3 棉花采购合同",
      description: "棉花价格回落 8% 至 $2.62/kg，传导率 78% 显示面料将跟随，建议锁定 3 个月用量",
      rationale: "传导率模型基于 Engel-Granger 协整检验，准确率 73%",
      methodologyBasis: "经济学: 价格传导机制 + 统计学: 协整检验",
      expectedImpact: "预计节约采购成本 ¥42,000",
      timeframe: "本周内执行",
      kpiToTrack: ["原料采购成本", "面料价格", "毛利率"],
      executionPath: [
        { order: 1, action: "评估 3 个月用量需求", expectedOutcome: "需求确认" },
        { order: 2, action: "与 3 家供应商比价", expectedOutcome: "最优报价" },
        { order: 3, action: "签订锁价合同", expectedOutcome: "合同签订" },
      ],
      confidence: 0.82,
      status: "pending",
      metricIds: ["metric-propagation"],
      evidenceIds: ["ev-004", "ev-005"],
      conflictsWith: ["advice-003"],
    },
    {
      id: "advice-003",
      priority: "medium",
      type: "monitor",
      title: "关注汇率波动，评估远期结售汇",
      description: "美元/人民币 30 天波动率从 2.1% 升至 3.8%，账期 60-90 天利润影响 ±2.4%",
      rationale: "ECB 月均汇率 + BLS 通胀数据，2 源一致",
      methodologyBasis: "金融学: 汇率传递效应 + 统计学: 波动率分析",
      expectedImpact: "建议与财务部门评估远期结售汇比例",
      timeframe: "持续监控至 Q3 末",
      kpiToTrack: ["汇率波动率", "远期结售汇比例", "汇兑损益"],
      executionPath: [
        { order: 1, action: "财务部评估敞口", expectedOutcome: "敞口确认" },
        { order: 2, action: "银行询价远期汇率", expectedOutcome: "报价获取" },
      ],
      confidence: 0.74,
      status: "pending",
      metricIds: ["metric-risk"],
      evidenceIds: ["ev-006"],
      conflictsWith: ["advice-002"],
    },
    {
      id: "advice-004",
      priority: "low",
      type: "monitor",
      title: "库销比超 3.0，关注秋季库存积压",
      description: "库销比从 2.8 升至 3.2，超过健康区间，需关注秋季上新前的库存清理",
      rationale: "供应链管理: EOQ 安全库存基准",
      methodologyBasis: "供应链管理: 库存管理理论",
      expectedImpact: "建议制定促销计划清理滞销款",
      timeframe: "Q3 末前评估",
      kpiToTrack: ["库销比", "库存龄期", "促销转化率"],
      executionPath: [
        { order: 1, action: "分析滞销款明细", expectedOutcome: "清单确认" },
      ],
      confidence: 0.68,
      status: "pending",
      metricIds: ["metric-inventory"],
      evidenceIds: ["ev-002"],
    },
  ];
}

/** 创建模拟原始数据 */
export function createMockRawData(): RawDataEntry[] {
  return [
    {
      id: "raw-001",
      sourceId: "comtrade",
      institution: "UN Comtrade 联合国贸易统计",
      tier: "A",
      dataType: "🚢 贸易",
      rawValue: "1245 条",
      normalizedValue: "HS60 面料进口 1245 条",
      collectedAt: "2026-07-09T08:30:00Z",
      freshnessDays: 3,
      completeness: 0.95,
      crossValidation: "consistent",
      validationNote: "3 源一致（Comtrade + World Bank + BLS）",
    },
    {
      id: "raw-002",
      sourceId: "ecb",
      institution: "ECB 欧洲央行",
      tier: "A",
      dataType: "💱 汇率",
      rawValue: "7.24 CNY/USD",
      normalizedValue: "月均参考汇率 7.24",
      collectedAt: "2026-07-12T00:00:00Z",
      freshnessDays: 0,
      completeness: 1.0,
      crossValidation: "consistent",
      validationNote: "实时数据",
    },
    {
      id: "raw-003",
      sourceId: "world-bank",
      institution: "World Bank 世界银行",
      tier: "A",
      dataType: "💲 价格",
      rawValue: "$2.62/kg",
      normalizedValue: "棉花价格 $2.62/kg (USD标准化)",
      collectedAt: "2026-07-05T00:00:00Z",
      freshnessDays: 7,
      completeness: 0.90,
      crossValidation: "deviation",
      validationNote: "BLS 数据偏离 3%，World Bank 为基准",
    },
    {
      id: "raw-004",
      sourceId: "bls",
      institution: "BLS 美国劳工统计局",
      tier: "A",
      dataType: "💲 价格",
      rawValue: "$2.70/kg",
      normalizedValue: "棉花价格 $2.70/kg (CPI调整后)",
      collectedAt: "2026-07-10T00:00:00Z",
      freshnessDays: 2,
      completeness: 0.88,
      crossValidation: "deviation",
      validationNote: "偏离 World Bank 3%，可能是 CPI 调整差异",
    },
  ];
}
