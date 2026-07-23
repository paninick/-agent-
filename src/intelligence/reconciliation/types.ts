/**
 * reconciliation/types.ts - 买卖双方链路协同核对类型系统
 *
 * 在现有"供应链信号 + 因果推理"体系基础上，新增**交易文档级对账**能力。
 * 核心思路：统一交易 ID 链路贯穿买方链与卖方链，逐字段双向验证。
 *
 * 买方链：市场趋势 -> 销售预测 -> 采购订单(PO) -> 交货 -> 销售 -> 库存 -> 退货 -> 补货
 * 卖方链：原材料 -> 产能 -> 报价 -> 销售订单(SO) -> 生产 -> 质检 -> 发货 -> 开票 -> 回款
 *
 * 统一交易 ID 链路：
 *   inquiryId -> quoteId -> poId -> soId -> workOrderId -> batchId
 *   -> shipmentId -> receiptId -> invoiceId -> paymentId
 *
 * 设计原则：
 *   - 纯 TypeScript 类型，不依赖 Zod schema（Zod 仅在入口校验用）
 *   - 所有新字段对现有系统可选，向后兼容
 *   - 对账输入为函数参数（交易记录数组），不接数据库
 *   - 复用 materialReconciliation.ts 的 "expected vs observed -> status" 模式
 */

// ============================================================================
// 1. 统一交易 ID 链路
// ============================================================================

/** 交易文档类型 */
export type TransactionDocType =
  | "inquiry"        // 询价
  | "quote"          // 报价
  | "po"             // 采购订单（买方发出）
  | "so"             // 销售订单（卖方接收）
  | "work_order"     // 工单
  | "batch"          // 生产批次
  | "shipment"       // 发货
  | "receipt"        // 入库
  | "invoice"        // 发票
  | "payment";       // 付款

/** 交易方 */
export type TransactionParty = "buyer" | "seller";

/**
 * 统一交易文档 - 贯穿买方链与卖方链的核心载体。
 * 每个文档携带完整 ID 链路，使任意环节可双向追溯。
 */
export interface TransactionDocument {
  /** 文档唯一 ID */
  docId: string;
  /** 文档类型 */
  docType: TransactionDocType;
  /** 交易方 */
  party: TransactionParty;
  /** 时间戳 ISO 8601 */
  timestamp: string;

  // 统一交易 ID 链路（按链路顺序填充，未到达的环节为 undefined）
  inquiryId?: string;
  quoteId?: string;
  poId?: string;
  soId?: string;
  workOrderId?: string;
  batchId?: string;
  shipmentId?: string;
  receiptId?: string;
  invoiceId?: string;
  paymentId?: string;

  // 交易主体
  buyerId: string;
  sellerId: string;

  // 商品信息
  productId: string;
  styleId?: string;
  sku?: string;
  description?: string;

  // 数量与价格
  quantity?: number;
  unit?: string;
  unitPrice?: number;
  currency?: string;
  totalAmount?: number;

  // 交期
  requestedDeliveryDate?: string;
  promisedDeliveryDate?: string;
  actualDeliveryDate?: string;

  // 扩展字段（各对账维度按需填充）
  [key: string]: unknown;
}

// ============================================================================
// 2. 对账状态与通用容器
// ============================================================================

/** 对账状态（三态） */
export type ReconciliationStatus = "matched" | "warning" | "mismatch";

/** 差异明细条目 */
export interface VarianceDetail {
  /** 字段名 */
  field: string;
  /** 买方值 */
  buyerValue: unknown;
  /** 卖方值 */
  sellerValue: unknown;
  /** 差异率（|买方 - 卖方| / 买方，买方为0时用卖方） */
  varianceRate: number;
  /** 该字段状态 */
  status: ReconciliationStatus;
  /** 说明 */
  note?: string;
}

/**
 * 通用对账结果容器 - 所有 10 类对账共用。
 * 泛型 T 携带该维度的专属数据。
 */
export interface ReconciliationResult<T = unknown> {
  /** 对账 ID */
  id: string;
  /** 对账维度 */
  dimension: ReconciliationDimension;
  /** 关联的交易文档 ID 链（poId / soId 等） */
  transactionRef: Partial<Pick<TransactionDocument, "poId" | "soId" | "quoteId" | "invoiceId" | "shipmentId">>;
  /** 整体状态（取所有字段中最严重的） */
  status: ReconciliationStatus;
  /** 差异明细 */
  variances: VarianceDetail[];
  /** 维度专属数据 */
  data: T;
  /** 对账时间 */
  reconciledAt: string;
  /** 数据可信度层（由 data-trust.ts 填充） */
  trustLayer?: DataTrustLayer;
  /** 调整后置信度（由 applyTrustWeight 填充） */
  confidence?: number;
}

/** 10 类对账维度 */
export type ReconciliationDimension =
  | "product"
  | "quantity"
  | "price"
  | "delivery"
  | "quality"
  | "inventory"
  | "financial"
  | "tax"
  | "demand"
  | "capacity";

// ============================================================================
// 3. 10 类对账维度专属类型
// ============================================================================

/** 商品核对数据 */
export interface ProductReconciliationData {
  styleIdMatch: boolean;
  skuMatch: boolean;
  fabricCompositionMatch: boolean;
  fabricWeightMatch: boolean;
  colorSizeMatch: boolean;
  packagingMatch: boolean;
  mismatches: string[];
}

/** 数量核对数据 */
export interface QuantityReconciliationData {
  poQuantity: number;
  soQuantity: number;
  productionQuantity: number;
  shippedQuantity: number;
  receivedQuantity: number;
  /** 差异率阈值（warning 1%, mismatch 3%） */
  warningThreshold: number;
  mismatchThreshold: number;
  /** 最终差异率 */
  varianceRate: number;
}

/** 价格核对数据 */
export interface PriceReconciliationData {
  quotePrice: number;
  poPrice: number;
  contractPrice: number;
  invoicePrice: number;
  paymentPrice: number;
  /** 价格公式拆解（由 credibility.ts 填充） */
  costBreakdown?: PriceCostBreakdown;
  varianceRate: number;
}

/** 交期核对数据 */
export interface DeliveryReconciliationData {
  requestedDate: string;
  promisedDate: string;
  completedDate: string;
  shippedDate: string;
  arrivedDate: string;
  onShelfDate: string;
  /** 延误天数（负数=提前） */
  delayDays: number;
  /** 准交率（批量对账时填充） */
  onTimeDeliveryRate?: number;
}

/** 质量核对数据 */
export interface QualityReconciliationData {
  aqlLevel: string;
  factoryPassRate: number;
  thirdPartyPassRate: number;
  inboundPassRate: number;
  firstPassYield: number;
  reworkRate: number;
  customerComplaintRate: number;
  returnRate: number;
}

/** 库存核对数据 */
export interface InventoryReconciliationData {
  // 买方库存
  buyerInTransit: number;
  buyerWarehouse: number;
  buyerStore: number;
  buyerPlatform: number;
  buyerReturns: number;
  // 卖方库存
  sellerRawMaterial: number;
  sellerWip: number;
  sellerFinished: number;
  sellerPendingShip: number;
  // 派生指标
  weeklySellThrough?: number;
  reorderPoint?: number;
  /** 库存责任归属 */
  responsibility?: InventoryResponsibility;
}

/** 资金核对数据 */
export interface FinancialReconciliationData {
  orderAmount: number;
  shippedAmount: number;
  receivedAmount: number;
  invoiceAmount: number;
  accountsReceivable: number;
  accountsPayable: number;
  collectedAmount: number;
  /** DSO 应收账款周转天数 */
  dsoDays?: number;
  /** DPO 应付账款周转天数 */
  dpoDays?: number;
  /** 逾期率 */
  overdueRate?: number;
}

/** 税务/关务核对数据 */
export interface TaxReconciliationData {
  hsCodeMatch: boolean;
  productNameMatch: boolean;
  quantityMatch: boolean;
  amountMatch: boolean;
  originMatch: boolean;
  taxRefundAmount?: number;
  foreignExchangeReceived?: number;
}

/** 需求核对数据 */
export interface DemandReconciliationData {
  forecastQuantity: number;
  orderedQuantity: number;
  soldQuantity: number;
  sellThroughRate: number;
  returnRate: number;
  discountRate: number;
  /** 预测准确率 */
  forecastAccuracy: number;
}

/** 产能核对数据 */
export interface CapacityReconciliationData {
  claimedDailyOutput: number;
  actualDailyOutput: number;
  workerCount: number;
  equipmentCount: number;
  historicalOnTimeRate: number;
  currentOrderLoad: number;
  /** 产能可信度评分 0-100 */
  capacityCredibilityScore: number;
}

// ============================================================================
// 4. 数据可信度分层
// ============================================================================

/** 数据可信度层级（4 级） */
export type DataTrustLayer = "factual" | "commitment" | "external" | "subjective";

// ============================================================================
// 5. 真实性评分
// ============================================================================

/** 评分等级 */
export type CredibilityGrade = "high" | "acceptable" | "cautious" | "high_risk";

/** 真实性评分结果 */
export interface CredibilityScore {
  /** 分数 0-100 */
  score: number;
  /** 等级 */
  grade: CredibilityGrade;
  /** 各因子得分明细 */
  factors: Array<{
    name: string;
    weight: number;
    rawScore: number;
    weightedScore: number;
  }>;
  /** 建议动作 */
  recommendedAction: string;
}

/** 价格成本拆解 */
export interface PriceCostBreakdown {
  fabric: number;
  accessories: number;
  wasteAllowance: number;
  labor: number;
  manufacturingOverhead: number;
  packaging: number;
  logistics: number;
  tax: number;
  profit: number;
  /** 拆解总价 */
  totalEstimated: number;
  /** 报价与拆解差异率 */
  varianceRate: number;
  /** 预警标志 */
  warnings: string[];
}

/** 价格合理性分析结果 */
export interface PriceAnalysis {
  breakdown: PriceCostBreakdown;
  /** 报价涨幅 */
  quoteChangeRate: number;
  /** 原料涨幅 */
  materialChangeRate: number;
  /** 是否合理 */
  isReasonable: boolean;
  /** 预警 */
  alerts: string[];
}

// ============================================================================
// 6. 异常闭环
// ============================================================================

/** 异常类型 */
export type AnomalyType =
  | "quantity"
  | "price"
  | "delivery"
  | "quality"
  | "inventory"
  | "payment"
  | "tax"
  | "logistics"
  | "compliance";

/** 异常状态（5 态闭环） */
export type AnomalyStatus =
  | "detected"
  | "evidence_collected"
  | "attributed"
  | "resolved"
  | "closed";

/** 责任方 */
export type ResponsibleParty = "buyer" | "seller" | "shared" | "designer" | "third_party" | "unattributed";

/** 异常记录 */
export interface Anomaly {
  id: string;
  type: AnomalyType;
  /** 关联订单 ID */
  orderId: string;
  /** 异常描述 */
  description: string;
  /** 当前状态 */
  status: AnomalyStatus;
  /** 责任方 */
  responsibleParty?: ResponsibleParty;
  /** 支持证据 ID */
  evidenceIds: string[];
  /** 财务影响金额 */
  financialImpact?: number;
  /** 检测时间 */
  detectedAt: string;
  /** 结案时间 */
  resolvedAt?: string;
  /** 结案说明 */
  resolution?: string;
  /** 评分影响 */
  scoreImpact?: number;
}

/** 库存责任归属 */
export type InventoryResponsibility = "buyer" | "seller" | "shared" | "designer";

// ============================================================================
// 7. 协同看板
// ============================================================================

/** 买方视角看板 */
export interface BuyerDashboardView {
  /** 供应商报价变化 */
  supplierPriceChanges: Array<{ sellerId: string; productId: string; changeRate: number; trend: "up" | "down" | "stable" }>;
  /** 交期风险 */
  deliveryRisks: Array<{ orderId: string; delayDays: number; risk: "low" | "medium" | "high" }>;
  /** 质量风险 */
  qualityRisks: Array<{ sellerId: string; defectRate: number; trend: "improving" | "stable" | "worsening" }>;
  /** 在途库存 */
  inTransitInventory: number;
  /** 补货建议 */
  reorderSuggestions: Array<{ productId: string; currentStock: number; reorderPoint: number; suggestedQty: number }>;
  /** 供应商信用评分 */
  supplierCredibilityScores: Array<{ sellerId: string; score: number; grade: CredibilityGrade }>;
}

/** 卖方视角看板 */
export interface SellerDashboardView {
  /** 客户订单稳定性 */
  customerOrderStability: Array<{ buyerId: string; stabilityScore: number; trend: "growing" | "stable" | "declining" }>;
  /** 付款风险 */
  paymentRisks: Array<{ buyerId: string; dsoDays: number; overdueRate: number; risk: "low" | "medium" | "high" }>;
  /** 买方库存压力 */
  buyerInventoryPressure: Array<{ buyerId: string; weeklySellThrough: number; pressure: "low" | "medium" | "high" }>;
  /** 实际动销 */
  actualSellThrough: number;
  /** 退货风险 */
  returnRisks: Array<{ buyerId: string; returnRate: number; trend: "improving" | "stable" | "worsening" }>;
  /** 补单概率 */
  reorderProbability: Array<{ buyerId: string; probability: number }>;
}

/** 共享视角看板 */
export interface SharedDashboardView {
  /** 订单状态汇总 */
  orderStatusSummary: Record<string, number>;
  /** 生产进度 */
  productionProgress: Array<{ orderId: string; stage: string; progress: number }>;
  /** 质检状态 */
  qcStatus: Array<{ orderId: string; passRate: number; status: ReconciliationStatus }>;
  /** 发货状态 */
  shipmentStatus: Array<{ orderId: string; shipped: boolean; trackingNo?: string }>;
  /** 到货状态 */
  arrivalStatus: Array<{ orderId: string; arrived: boolean; arrivedAt?: string }>;
  /** 结算状态 */
  settlementStatus: Array<{ orderId: string; invoiced: boolean; paid: boolean; outstandingAmount: number }>;
  /** 异常列表 */
  anomalyList: Anomaly[];
}

/** 买卖双方协同看板 */
export interface BuyerSellerDashboard {
  buyerView: BuyerDashboardView;
  sellerView: SellerDashboardView;
  sharedView: SharedDashboardView;
  /** 整体对账健康度 0-100 */
  reconciliationHealthScore: number;
  /** 生成时间 */
  generatedAt: string;
}

/** 对账摘要（用于 ChainHealth 集成） */
export interface ReconciliationSummary {
  /** 总对账项数 */
  totalItems: number;
  /** 匹配数 */
  matchedCount: number;
  /** 警告数 */
  warningCount: number;
  /** 不匹配数 */
  mismatchCount: number;
  /** 不匹配率 */
  mismatchRate: number;
  /** 涉及维度 */
  dimensions: ReconciliationDimension[];
  /** 活跃异常数 */
  activeAnomalies: number;
  /** 对账健康分（100 - mismatchRate*100 - warningRate*30） */
  healthScore: number;
}
