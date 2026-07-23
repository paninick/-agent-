/**
 * reconciliation/reconcile.ts - 对账引擎核心函数
 *
 * 实现 10 类对账维度，每类函数：
 *   - 接收买方文档 + 卖方文档（或观测值）
 *   - 逐字段对比，计算差异率
 *   - 按阈值输出 matched / warning / mismatch
 *   - 返回 ReconciliationResult 带差异明细
 *
 * 关键公式：
 *   - 数量差异率 = |买方确认 - 卖方发货| / 买方确认
 *   - 准交率 = 准时交付订单数 / 总订单数
 *   - 一次合格率 = 一次通过数 / 检验数
 *   - 周销比 = 当前库存 / 近7天销量
 *   - 补货点 = 日均销量 × 供应交期 + 安全库存
 *   - DSO = 应收账款 / 日均销售额
 *   - 预测准确率 = 1 - |预测 - 实际| / 预测
 *   - 产能可信度 = 历史准交率×40% + 产量稳定性×30% + 工人设备匹配×20% + 质量×10%
 */

import type {
  ReconciliationResult,
  ReconciliationStatus,
  VarianceDetail,
  TransactionDocument,
  ProductReconciliationData,
  QuantityReconciliationData,
  PriceReconciliationData,
  DeliveryReconciliationData,
  QualityReconciliationData,
  InventoryReconciliationData,
  FinancialReconciliationData,
  TaxReconciliationData,
  DemandReconciliationData,
  CapacityReconciliationData,
  InventoryResponsibility,
} from "./types";

// ============================================================================
// 工具函数
// ============================================================================

let reconCounter = 0;

function nextReconId(): string {
  reconCounter += 1;
  return `recon-${reconCounter}`;
}

/** 计算差异率：|a - b| / max(|a|, |b|, 1) */
function varianceRate(a: number, b: number): number {
  if (a === 0 && b === 0) return 0;
  const denominator = Math.max(Math.abs(a), Math.abs(b), 1);
  return Math.abs(a - b) / denominator;
}

/** 根据差异率判定状态 */
function classifyStatus(rate: number, warningThreshold: number, mismatchThreshold: number): ReconciliationStatus {
  if (rate <= warningThreshold) return "matched";
  if (rate <= mismatchThreshold) return "warning";
  return "mismatch";
}

/** 取所有 variance 中最严重的状态 */
function worstStatus(variances: VarianceDetail[]): ReconciliationStatus {
  if (variances.some((v) => v.status === "mismatch")) return "mismatch";
  if (variances.some((v) => v.status === "warning")) return "warning";
  return "matched";
}

/** 日期差天数（d2 - d1，正数=晚于） */
function daysBetween(d1: string, d2: string): number {
  const t1 = new Date(d1).getTime();
  const t2 = new Date(d2).getTime();
  return Math.round((t2 - t1) / (1000 * 60 * 60 * 24));
}

/** 创建 variance detail */
function makeVariance(
  field: string,
  buyerVal: unknown,
  sellerVal: unknown,
  rate: number,
  status: ReconciliationStatus,
  note?: string,
): VarianceDetail {
  return {
    field,
    buyerValue: buyerVal,
    sellerValue: sellerVal,
    varianceRate: Math.round(rate * 10000) / 10000,
    status,
    note,
  };
}

// ============================================================================
// 1. 商品核对
// ============================================================================

export interface ProductReconInput {
  buyerDoc: TransactionDocument;
  sellerDoc: TransactionDocument;
}

export function reconcileProduct(input: ProductReconInput): ReconciliationResult<ProductReconciliationData> {
  const { buyerDoc, sellerDoc } = input;
  const mismatches: string[] = [];
  const variances: VarianceDetail[] = [];

  const checks: Array<{ field: string; buyer: unknown; seller: unknown; equal: boolean; label: string }> = [
    { field: "styleId", buyer: buyerDoc.styleId, seller: sellerDoc.styleId, equal: buyerDoc.styleId === sellerDoc.styleId, label: "款号" },
    { field: "sku", buyer: buyerDoc.sku, seller: sellerDoc.sku, equal: buyerDoc.sku === sellerDoc.sku, label: "SKU" },
    { field: "fabricComposition", buyer: buyerDoc["fabricComposition"], seller: sellerDoc["fabricComposition"], equal: buyerDoc["fabricComposition"] === sellerDoc["fabricComposition"], label: "面料成分" },
    { field: "fabricWeight", buyer: buyerDoc["fabricWeight"], seller: sellerDoc["fabricWeight"], equal: buyerDoc["fabricWeight"] === sellerDoc["fabricWeight"], label: "克重" },
    { field: "colorSize", buyer: buyerDoc["colorSize"], seller: sellerDoc["colorSize"], equal: buyerDoc["colorSize"] === sellerDoc["colorSize"], label: "颜色尺码" },
    { field: "packaging", buyer: buyerDoc["packaging"], seller: sellerDoc["packaging"], equal: buyerDoc["packaging"] === sellerDoc["packaging"], label: "包装" },
  ];

  for (const c of checks) {
    if (!c.equal) {
      mismatches.push(c.label);
      variances.push(makeVariance(c.field, c.buyer, c.seller, 1, "mismatch", `${c.label}不一致`));
    }
  }

  const data: ProductReconciliationData = {
    styleIdMatch: buyerDoc.styleId === sellerDoc.styleId,
    skuMatch: buyerDoc.sku === sellerDoc.sku,
    fabricCompositionMatch: buyerDoc["fabricComposition"] === sellerDoc["fabricComposition"],
    fabricWeightMatch: buyerDoc["fabricWeight"] === sellerDoc["fabricWeight"],
    colorSizeMatch: buyerDoc["colorSize"] === sellerDoc["colorSize"],
    packagingMatch: buyerDoc["packaging"] === sellerDoc["packaging"],
    mismatches,
  };

  return {
    id: nextReconId(),
    dimension: "product",
    transactionRef: { poId: buyerDoc.poId, soId: sellerDoc.soId },
    status: worstStatus(variances),
    variances,
    data,
    reconciledAt: new Date().toISOString(),
  };
}

// ============================================================================
// 2. 数量核对
// ============================================================================

export interface QuantityReconInput {
  poId: string;
  soId?: string;
  poQuantity: number;
  soQuantity?: number;
  productionQuantity?: number;
  shippedQuantity?: number;
  receivedQuantity?: number;
  /** warning 阈值（默认 1%） */
  warningThreshold?: number;
  /** mismatch 阈值（默认 3%） */
  mismatchThreshold?: number;
}

export function reconcileQuantity(input: QuantityReconInput): ReconciliationResult<QuantityReconciliationData> {
  const warnT = input.warningThreshold ?? 0.01;
  const misT = input.mismatchThreshold ?? 0.03;
  const soQty = input.soQuantity ?? input.poQuantity;
  const prodQty = input.productionQuantity ?? soQty;
  const shipQty = input.shippedQuantity ?? prodQty;
  const recvQty = input.receivedQuantity ?? shipQty;

  const variances: VarianceDetail[] = [];

  // PO vs SO
  const poSoRate = varianceRate(input.poQuantity, soQty);
  variances.push(makeVariance("po_vs_so", input.poQuantity, soQty, poSoRate, classifyStatus(poSoRate, warnT, misT), "采购订单 vs 销售订单"));

  // SO vs Production
  const soProdRate = varianceRate(soQty, prodQty);
  variances.push(makeVariance("so_vs_production", soQty, prodQty, soProdRate, classifyStatus(soProdRate, warnT, misT), "销售订单 vs 生产数量"));

  // Production vs Shipped
  const prodShipRate = varianceRate(prodQty, shipQty);
  variances.push(makeVariance("production_vs_shipped", prodQty, shipQty, prodShipRate, classifyStatus(prodShipRate, warnT, misT), "生产数量 vs 发货数量"));

  // Shipped vs Received
  const shipRecvRate = varianceRate(shipQty, recvQty);
  variances.push(makeVariance("shipped_vs_received", shipQty, recvQty, shipRecvRate, classifyStatus(shipRecvRate, warnT, misT), "发货数量 vs 入库数量"));

  // 最终差异率：PO vs Received
  const finalRate = varianceRate(input.poQuantity, recvQty);

  const data: QuantityReconciliationData = {
    poQuantity: input.poQuantity,
    soQuantity: soQty,
    productionQuantity: prodQty,
    shippedQuantity: shipQty,
    receivedQuantity: recvQty,
    warningThreshold: warnT,
    mismatchThreshold: misT,
    varianceRate: Math.round(finalRate * 10000) / 10000,
  };

  return {
    id: nextReconId(),
    dimension: "quantity",
    transactionRef: { poId: input.poId, soId: input.soId },
    status: worstStatus(variances),
    variances,
    data,
    reconciledAt: new Date().toISOString(),
  };
}

// ============================================================================
// 3. 价格核对
// ============================================================================

export interface PriceReconInput {
  quoteId?: string;
  poId: string;
  quotePrice: number;
  poPrice: number;
  contractPrice?: number;
  invoicePrice?: number;
  paymentPrice?: number;
  warningThreshold?: number;
  mismatchThreshold?: number;
}

export function reconcilePrice(input: PriceReconInput): ReconciliationResult<PriceReconciliationData> {
  const warnT = input.warningThreshold ?? 0.02;
  const misT = input.mismatchThreshold ?? 0.05;
  const contractP = input.contractPrice ?? input.poPrice;
  const invoiceP = input.invoicePrice ?? contractP;
  const paymentP = input.paymentPrice ?? invoiceP;

  const variances: VarianceDetail[] = [];

  const quotePoRate = varianceRate(input.quotePrice, input.poPrice);
  variances.push(makeVariance("quote_vs_po", input.quotePrice, input.poPrice, quotePoRate, classifyStatus(quotePoRate, warnT, misT), "报价 vs 采购订单价"));

  const poContractRate = varianceRate(input.poPrice, contractP);
  variances.push(makeVariance("po_vs_contract", input.poPrice, contractP, poContractRate, classifyStatus(poContractRate, warnT, misT), "采购订单价 vs 合同价"));

  const contractInvoiceRate = varianceRate(contractP, invoiceP);
  variances.push(makeVariance("contract_vs_invoice", contractP, invoiceP, contractInvoiceRate, classifyStatus(contractInvoiceRate, warnT, misT), "合同价 vs 发票价"));

  const invoicePaymentRate = varianceRate(invoiceP, paymentP);
  variances.push(makeVariance("invoice_vs_payment", invoiceP, paymentP, invoicePaymentRate, classifyStatus(invoicePaymentRate, warnT, misT), "发票价 vs 付款价"));

  const finalRate = varianceRate(input.quotePrice, paymentP);

  const data: PriceReconciliationData = {
    quotePrice: input.quotePrice,
    poPrice: input.poPrice,
    contractPrice: contractP,
    invoicePrice: invoiceP,
    paymentPrice: paymentP,
    varianceRate: Math.round(finalRate * 10000) / 10000,
  };

  return {
    id: nextReconId(),
    dimension: "price",
    transactionRef: { quoteId: input.quoteId, poId: input.poId },
    status: worstStatus(variances),
    variances,
    data,
    reconciledAt: new Date().toISOString(),
  };
}

// ============================================================================
// 4. 交期核对
// ============================================================================

export interface DeliveryReconInput {
  poId: string;
  shipmentId?: string;
  requestedDate: string;
  promisedDate: string;
  completedDate?: string;
  shippedDate?: string;
  arrivedDate?: string;
  onShelfDate?: string;
  /** 准交判定阈值天数（默认 0 = 必须在 requestedDate 前完成） */
  onTimeGraceDays?: number;
}

export function reconcileDelivery(input: DeliveryReconInput): ReconciliationResult<DeliveryReconciliationData> {
  const grace = input.onTimeGraceDays ?? 0;
  const variances: VarianceDetail[] = [];

  // requested vs promised
  const reqPromDays = daysBetween(input.requestedDate, input.promisedDate);
  const reqPromStatus: ReconciliationStatus = reqPromDays <= grace ? "matched" : reqPromDays <= 3 ? "warning" : "mismatch";
  variances.push(makeVariance("requested_vs_promised", input.requestedDate, input.promisedDate, Math.abs(reqPromDays) / 30, reqPromStatus, `承诺日期${reqPromDays > 0 ? "晚于" : "早于"}要求${Math.abs(reqPromDays)}天`));

  // promised vs completed
  if (input.completedDate) {
    const promCompDays = daysBetween(input.promisedDate, input.completedDate);
    const promCompStatus: ReconciliationStatus = promCompDays <= 0 ? "matched" : promCompDays <= 2 ? "warning" : "mismatch";
    variances.push(makeVariance("promised_vs_completed", input.promisedDate, input.completedDate, Math.abs(promCompDays) / 30, promCompStatus, `完成日期${promCompDays > 0 ? "晚于" : "早于"}承诺${Math.abs(promCompDays)}天`));
  }

  // completed vs shipped
  if (input.completedDate && input.shippedDate) {
    const compShipDays = daysBetween(input.completedDate, input.shippedDate);
    const compShipStatus: ReconciliationStatus = compShipDays <= 1 ? "matched" : compShipDays <= 3 ? "warning" : "mismatch";
    variances.push(makeVariance("completed_vs_shipped", input.completedDate, input.shippedDate, Math.abs(compShipDays) / 30, compShipStatus, `发货延迟${compShipDays}天`));
  }

  // shipped vs arrived
  if (input.shippedDate && input.arrivedDate) {
    const shipArrDays = daysBetween(input.shippedDate, input.arrivedDate);
    // 物流天数在合理范围内（7-30天）即可
    const shipArrStatus: ReconciliationStatus = shipArrDays <= 30 ? "matched" : shipArrDays <= 45 ? "warning" : "mismatch";
    variances.push(makeVariance("shipped_vs_arrived", input.shippedDate, input.arrivedDate, Math.abs(shipArrDays - 15) / 30, shipArrStatus, `物流耗时${shipArrDays}天`));
  }

  // arrived vs onShelf
  if (input.arrivedDate && input.onShelfDate) {
    const arrShelfDays = daysBetween(input.arrivedDate, input.onShelfDate);
    const arrShelfStatus: ReconciliationStatus = arrShelfDays <= 3 ? "matched" : arrShelfDays <= 7 ? "warning" : "mismatch";
    variances.push(makeVariance("arrived_vs_onshelf", input.arrivedDate, input.onShelfDate, Math.abs(arrShelfDays) / 15, arrShelfStatus, `上架延迟${arrShelfDays}天`));
  }

  // 延误天数 = 实际完成 - 要求
  const completedDate = input.completedDate ?? input.shippedDate ?? input.promisedDate;
  const delayDays = daysBetween(input.requestedDate, completedDate);

  const data: DeliveryReconciliationData = {
    requestedDate: input.requestedDate,
    promisedDate: input.promisedDate,
    completedDate: completedDate,
    shippedDate: input.shippedDate ?? "",
    arrivedDate: input.arrivedDate ?? "",
    onShelfDate: input.onShelfDate ?? "",
    delayDays,
  };

  return {
    id: nextReconId(),
    dimension: "delivery",
    transactionRef: { poId: input.poId, shipmentId: input.shipmentId },
    status: worstStatus(variances),
    variances,
    data,
    reconciledAt: new Date().toISOString(),
  };
}

/** 批量交期对账，计算准交率 */
export function reconcileDeliveryBatch(inputs: DeliveryReconInput[]): { results: ReconciliationResult<DeliveryReconciliationData>[]; onTimeDeliveryRate: number } {
  const results = inputs.map((inp) => {
    const r = reconcileDelivery(inp);
    // 准交 = delayDays <= grace
    const onTime = r.data.delayDays <= (inp.onTimeGraceDays ?? 0);
    return { r, onTime };
  });
  const onTimeCount = results.filter((x) => x.onTime).length;
  const onTimeDeliveryRate = results.length > 0 ? onTimeCount / results.length : 0;

  // 把准交率写回每个结果的 data
  for (const { r } of results) {
    r.data.onTimeDeliveryRate = Math.round(onTimeDeliveryRate * 10000) / 10000;
  }

  return { results: results.map((x) => x.r), onTimeDeliveryRate: Math.round(onTimeDeliveryRate * 10000) / 10000 };
}

// ============================================================================
// 5. 质量核对
// ============================================================================

export interface QualityReconInput {
  poId: string;
  aqlLevel?: string;
  factoryPassRate: number;  // 0-1
  thirdPartyPassRate?: number;
  inboundPassRate?: number;
  reworkRate?: number;
  customerComplaintRate?: number;
  returnRate?: number;
  /** 一次合格率阈值（默认 95%） */
  firstPassThreshold?: number;
}

export function reconcileQuality(input: QualityReconInput): ReconciliationResult<QualityReconciliationData> {
  const threshold = input.firstPassThreshold ?? 0.95;
  const tpPass = input.thirdPartyPassRate ?? input.factoryPassRate;
  const inPass = input.inboundPassRate ?? tpPass;
  const rework = input.reworkRate ?? 0;
  const complaint = input.customerComplaintRate ?? 0;
  const ret = input.returnRate ?? 0;

  const variances: VarianceDetail[] = [];

  // 出厂 vs 第三方
  const factoryTpRate = varianceRate(input.factoryPassRate, tpPass);
  variances.push(makeVariance("factory_vs_thirdparty", input.factoryPassRate, tpPass, factoryTpRate, classifyStatus(factoryTpRate, 0.03, 0.08), "出厂合格率 vs 第三方合格率"));

  // 第三方 vs 入库
  const tpInRate = varianceRate(tpPass, inPass);
  variances.push(makeVariance("thirdparty_vs_inbound", tpPass, inPass, tpInRate, classifyStatus(tpInRate, 0.03, 0.08), "第三方合格率 vs 入库合格率"));

  // 一次合格率判定
  const firstPassYield = input.factoryPassRate;
  const fpStatus: ReconciliationStatus = firstPassYield >= threshold ? "matched" : firstPassYield >= threshold - 0.03 ? "warning" : "mismatch";
  variances.push(makeVariance("first_pass_yield", firstPassYield, threshold, Math.abs(firstPassYield - threshold), fpStatus, `一次合格率 ${firstPassYield.toFixed(4)} vs 阈值 ${threshold}`));

  // 返修率判定
  if (rework > 0.05) {
    variances.push(makeVariance("rework_rate", rework, 0.05, rework, rework <= 0.08 ? "warning" : "mismatch", "返修率超 5%"));
  }

  // 客诉率判定
  if (complaint > 0.02) {
    variances.push(makeVariance("complaint_rate", complaint, 0.02, complaint, complaint <= 0.05 ? "warning" : "mismatch", "客诉率超 2%"));
  }

  // 退货率判定
  if (ret > 0.03) {
    variances.push(makeVariance("return_rate", ret, 0.03, ret, ret <= 0.05 ? "warning" : "mismatch", "退货率超 3%"));
  }

  const data: QualityReconciliationData = {
    aqlLevel: input.aqlLevel ?? "AQL2.5",
    factoryPassRate: input.factoryPassRate,
    thirdPartyPassRate: tpPass,
    inboundPassRate: inPass,
    firstPassYield,
    reworkRate: rework,
    customerComplaintRate: complaint,
    returnRate: ret,
  };

  return {
    id: nextReconId(),
    dimension: "quality",
    transactionRef: { poId: input.poId },
    status: worstStatus(variances),
    variances,
    data,
    reconciledAt: new Date().toISOString(),
  };
}

// ============================================================================
// 6. 库存核对
// ============================================================================

export interface InventoryReconInput {
  poId?: string;
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
  // 销售数据（用于计算周销比和补货点）
  last7DaysSales?: number;
  leadTimeDays?: number;
  safetyStock?: number;
}

export function reconcileInventory(input: InventoryReconInput): ReconciliationResult<InventoryReconciliationData> {
  const variances: VarianceDetail[] = [];

  const buyerTotal = input.buyerInTransit + input.buyerWarehouse + input.buyerStore + input.buyerPlatform;
  const sellerTotal = input.sellerRawMaterial + input.sellerWip + input.sellerFinished + input.sellerPendingShip;

  // 在途 vs 待发：买方在途应大致等于卖方待发
  const transitPendingRate = varianceRate(input.buyerInTransit, input.sellerPendingShip);
  variances.push(makeVariance("intransit_vs_pending", input.buyerInTransit, input.sellerPendingShip, transitPendingRate, classifyStatus(transitPendingRate, 0.1, 0.2), "买方在途 vs 卖方待发"));

  // 周销比 = 当前库存 / 近7天销量
  let weeklySellThrough: number | undefined;
  let reorderPoint: number | undefined;
  if (input.last7DaysSales && input.last7DaysSales > 0) {
    const dailyAvg = input.last7DaysSales / 7;
    weeklySellThrough = Math.round((input.last7DaysSales / Math.max(buyerTotal, 1)) * 10000) / 10000;
    const leadTime = input.leadTimeDays ?? 30;
    const safety = input.safetyStock ?? Math.ceil(dailyAvg * 7);
    reorderPoint = Math.ceil(dailyAvg * leadTime + safety);

    // 库存低于补货点 -> warning
    if (buyerTotal < reorderPoint) {
      variances.push(makeVariance("stock_vs_reorderpoint", buyerTotal, reorderPoint, varianceRate(buyerTotal, reorderPoint), "warning", `买方总库存 ${buyerTotal} 低于补货点 ${reorderPoint}`));
    }
  }

  // 责任划分
  let responsibility: InventoryResponsibility | undefined;
  if (input.buyerReturns > buyerTotal * 0.1) {
    responsibility = "buyer";
    variances.push(makeVariance("returns_ratio", input.buyerReturns, buyerTotal * 0.1, input.buyerReturns / Math.max(buyerTotal, 1), "warning", "退货占比超 10%，买方责任"));
  } else if (input.sellerFinished > sellerTotal * 0.5) {
    responsibility = "seller";
    variances.push(makeVariance("finished_ratio", input.sellerFinished, sellerTotal * 0.5, input.sellerFinished / Math.max(sellerTotal, 1), "warning", "卖方成品积压超 50%，卖方责任"));
  }

  const data: InventoryReconciliationData = {
    buyerInTransit: input.buyerInTransit,
    buyerWarehouse: input.buyerWarehouse,
    buyerStore: input.buyerStore,
    buyerPlatform: input.buyerPlatform,
    buyerReturns: input.buyerReturns,
    sellerRawMaterial: input.sellerRawMaterial,
    sellerWip: input.sellerWip,
    sellerFinished: input.sellerFinished,
    sellerPendingShip: input.sellerPendingShip,
    weeklySellThrough,
    reorderPoint,
    responsibility,
  };

  return {
    id: nextReconId(),
    dimension: "inventory",
    transactionRef: { poId: input.poId },
    status: worstStatus(variances),
    variances,
    data,
    reconciledAt: new Date().toISOString(),
  };
}

// ============================================================================
// 7. 资金核对
// ============================================================================

export interface FinancialReconInput {
  poId: string;
  invoiceId?: string;
  orderAmount: number;
  shippedAmount?: number;
  receivedAmount?: number;
  invoiceAmount?: number;
  collectedAmount?: number;
  /** 应收账款余额 */
  accountsReceivable?: number;
  /** 应付账款余额 */
  accountsPayable?: number;
  /** 年化销售额（用于计算 DSO） */
  annualizedSales?: number;
  /** 年化采购额（用于计算 DPO） */
  annualizedPurchase?: number;
}

export function reconcileFinancial(input: FinancialReconInput): ReconciliationResult<FinancialReconciliationData> {
  const variances: VarianceDetail[] = [];
  const shipAmt = input.shippedAmount ?? input.orderAmount;
  const recvAmt = input.receivedAmount ?? shipAmt;
  const invAmt = input.invoiceAmount ?? recvAmt;
  const colAmt = input.collectedAmount ?? 0;
  const ar = input.accountsReceivable ?? Math.max(0, invAmt - colAmt);
  const ap = input.accountsPayable ?? Math.max(0, invAmt - colAmt);

  // 订单 vs 发货金额
  const orderShipRate = varianceRate(input.orderAmount, shipAmt);
  variances.push(makeVariance("order_vs_shipped", input.orderAmount, shipAmt, orderShipRate, classifyStatus(orderShipRate, 0.02, 0.05), "订单金额 vs 发货金额"));

  // 发货 vs 入库金额
  const shipRecvRate = varianceRate(shipAmt, recvAmt);
  variances.push(makeVariance("shipped_vs_received", shipAmt, recvAmt, shipRecvRate, classifyStatus(shipRecvRate, 0.02, 0.05), "发货金额 vs 入库金额"));

  // 入库 vs 发票金额
  const recvInvRate = varianceRate(recvAmt, invAmt);
  variances.push(makeVariance("received_vs_invoice", recvAmt, invAmt, recvInvRate, classifyStatus(recvInvRate, 0.01, 0.03), "入库金额 vs 发票金额"));

  // 发票 vs 回款
  const invColRate = varianceRate(invAmt, colAmt);
  const invColStatus: ReconciliationStatus = colAmt >= invAmt ? "matched" : classifyStatus(invColRate, 0.05, 0.15);
  variances.push(makeVariance("invoice_vs_collected", invAmt, colAmt, invColRate, invColStatus, colAmt < invAmt ? `未回款 ${invAmt - colAmt}` : "已全额回款"));

  // DSO
  let dsoDays: number | undefined;
  if (input.annualizedSales && input.annualizedSales > 0) {
    dsoDays = Math.round((ar / input.annualizedSales) * 365);
    if (dsoDays > 90) {
      variances.push(makeVariance("dso", dsoDays, 90, (dsoDays - 90) / 90, dsoDays > 120 ? "mismatch" : "warning", `DSO ${dsoDays} 天超阈值`));
    }
  }

  // DPO
  let dpoDays: number | undefined;
  if (input.annualizedPurchase && input.annualizedPurchase > 0) {
    dpoDays = Math.round((ap / input.annualizedPurchase) * 365);
  }

  // 逾期率
  const overdueRate = invAmt > 0 ? Math.max(0, invAmt - colAmt) / invAmt : 0;

  const data: FinancialReconciliationData = {
    orderAmount: input.orderAmount,
    shippedAmount: shipAmt,
    receivedAmount: recvAmt,
    invoiceAmount: invAmt,
    accountsReceivable: ar,
    accountsPayable: ap,
    collectedAmount: colAmt,
    dsoDays,
    dpoDays,
    overdueRate: Math.round(overdueRate * 10000) / 10000,
  };

  return {
    id: nextReconId(),
    dimension: "financial",
    transactionRef: { poId: input.poId, invoiceId: input.invoiceId },
    status: worstStatus(variances),
    variances,
    data,
    reconciledAt: new Date().toISOString(),
  };
}

// ============================================================================
// 8. 税务/关务核对
// ============================================================================

export interface TaxReconInput {
  poId: string;
  invoiceId?: string;
  hsCodeBuyer?: string;
  hsCodeSeller?: string;
  productNameBuyer?: string;
  productNameSeller?: string;
  quantityBuyer?: number;
  quantitySeller?: number;
  amountBuyer?: number;
  amountSeller?: number;
  originBuyer?: string;
  originSeller?: string;
  taxRefundAmount?: number;
  foreignExchangeReceived?: number;
}

export function reconcileTax(input: TaxReconInput): ReconciliationResult<TaxReconciliationData> {
  const variances: VarianceDetail[] = [];

  const hsMatch = (input.hsCodeBuyer ?? "") === (input.hsCodeSeller ?? "");
  if (!hsMatch && input.hsCodeBuyer && input.hsCodeSeller) {
    variances.push(makeVariance("hs_code", input.hsCodeBuyer, input.hsCodeSeller, 1, "mismatch", "HS Code 不一致"));
  }

  const nameMatch = (input.productNameBuyer ?? "") === (input.productNameSeller ?? "");
  if (!nameMatch && input.productNameBuyer && input.productNameSeller) {
    variances.push(makeVariance("product_name", input.productNameBuyer, input.productNameSeller, 1, "mismatch", "品名不一致"));
  }

  let qtyMatch = true;
  if (input.quantityBuyer !== undefined && input.quantitySeller !== undefined) {
    const qtyRate = varianceRate(input.quantityBuyer, input.quantitySeller);
    qtyMatch = qtyRate <= 0.01;
    if (!qtyMatch) {
      variances.push(makeVariance("quantity", input.quantityBuyer, input.quantitySeller, qtyRate, classifyStatus(qtyRate, 0.01, 0.03), "报关数量不一致"));
    }
  }

  let amtMatch = true;
  if (input.amountBuyer !== undefined && input.amountSeller !== undefined) {
    const amtRate = varianceRate(input.amountBuyer, input.amountSeller);
    amtMatch = amtRate <= 0.02;
    if (!amtMatch) {
      variances.push(makeVariance("amount", input.amountBuyer, input.amountSeller, amtRate, classifyStatus(amtRate, 0.02, 0.05), "报关金额不一致"));
    }
  }

  const originMatch = (input.originBuyer ?? "") === (input.originSeller ?? "");
  if (!originMatch && input.originBuyer && input.originSeller) {
    variances.push(makeVariance("origin", input.originBuyer, input.originSeller, 1, "warning", "原产地不一致"));
  }

  const data: TaxReconciliationData = {
    hsCodeMatch: hsMatch,
    productNameMatch: nameMatch,
    quantityMatch: qtyMatch,
    amountMatch: amtMatch,
    originMatch,
    taxRefundAmount: input.taxRefundAmount,
    foreignExchangeReceived: input.foreignExchangeReceived,
  };

  return {
    id: nextReconId(),
    dimension: "tax",
    transactionRef: { poId: input.poId, invoiceId: input.invoiceId },
    status: worstStatus(variances),
    variances,
    data,
    reconciledAt: new Date().toISOString(),
  };
}

// ============================================================================
// 9. 需求核对
// ============================================================================

export interface DemandReconInput {
  poId?: string;
  forecastQuantity: number;
  orderedQuantity: number;
  soldQuantity: number;
  sellThroughRate?: number;
  returnRate?: number;
  discountRate?: number;
}

export function reconcileDemand(input: DemandReconInput): ReconciliationResult<DemandReconciliationData> {
  const variances: VarianceDetail[] = [];

  // 预测 vs 下单
  const forecastOrderRate = varianceRate(input.forecastQuantity, input.orderedQuantity);
  variances.push(makeVariance("forecast_vs_ordered", input.forecastQuantity, input.orderedQuantity, forecastOrderRate, classifyStatus(forecastOrderRate, 0.1, 0.2), "预测 vs 下单"));

  // 下单 vs 销售
  const orderSoldRate = varianceRate(input.orderedQuantity, input.soldQuantity);
  variances.push(makeVariance("ordered_vs_sold", input.orderedQuantity, input.soldQuantity, orderSoldRate, classifyStatus(orderSoldRate, 0.15, 0.3), "下单 vs 实际销售"));

  // 预测准确率 = 1 - |预测 - 实际| / 预测
  const forecastAccuracy = input.forecastQuantity > 0
    ? Math.max(0, 1 - Math.abs(input.forecastQuantity - input.soldQuantity) / input.forecastQuantity)
    : 0;
  const faStatus: ReconciliationStatus = forecastAccuracy >= 0.8 ? "matched" : forecastAccuracy >= 0.6 ? "warning" : "mismatch";
  variances.push(makeVariance("forecast_accuracy", forecastAccuracy, 0.8, Math.abs(forecastAccuracy - 0.8), faStatus, `预测准确率 ${(forecastAccuracy * 100).toFixed(1)}%`));

  const sellThrough = input.sellThroughRate ?? (input.orderedQuantity > 0 ? input.soldQuantity / input.orderedQuantity : 0);
  const ret = input.returnRate ?? 0;
  const discount = input.discountRate ?? 0;

  // 售罄率过低
  if (sellThrough < 0.5) {
    variances.push(makeVariance("sell_through_rate", sellThrough, 0.5, Math.abs(sellThrough - 0.5), sellThrough < 0.3 ? "mismatch" : "warning", "售罄率低于 50%"));
  }

  // 退货率过高
  if (ret > 0.1) {
    variances.push(makeVariance("return_rate", ret, 0.1, ret, ret > 0.2 ? "mismatch" : "warning", "退货率超 10%"));
  }

  // 折扣率过高
  if (discount > 0.3) {
    variances.push(makeVariance("discount_rate", discount, 0.3, discount, discount > 0.5 ? "mismatch" : "warning", "折扣率超 30%"));
  }

  const data: DemandReconciliationData = {
    forecastQuantity: input.forecastQuantity,
    orderedQuantity: input.orderedQuantity,
    soldQuantity: input.soldQuantity,
    sellThroughRate: Math.round(sellThrough * 10000) / 10000,
    returnRate: ret,
    discountRate: discount,
    forecastAccuracy: Math.round(forecastAccuracy * 10000) / 10000,
  };

  return {
    id: nextReconId(),
    dimension: "demand",
    transactionRef: { poId: input.poId },
    status: worstStatus(variances),
    variances,
    data,
    reconciledAt: new Date().toISOString(),
  };
}

// ============================================================================
// 10. 产能核对
// ============================================================================

export interface CapacityReconInput {
  poId?: string;
  sellerId: string;
  claimedDailyOutput: number;
  actualDailyOutput: number;
  workerCount: number;
  equipmentCount: number;
  historicalOnTimeRate: number; // 0-1
  currentOrderLoad: number;
  /** 产量稳定性（0-1，标准差的逆） */
  outputStability?: number;
  /** 质量稳定率（0-1） */
  qualityStability?: number;
}

export function reconcileCapacity(input: CapacityReconInput): ReconciliationResult<CapacityReconciliationData> {
  const variances: VarianceDetail[] = [];

  // 宣称 vs 实际日产量
  const claimedActualRate = varianceRate(input.claimedDailyOutput, input.actualDailyOutput);
  variances.push(makeVariance("claimed_vs_actual", input.claimedDailyOutput, input.actualDailyOutput, claimedActualRate, classifyStatus(claimedActualRate, 0.1, 0.2), "宣称产能 vs 实际产能"));

  // 排单量 vs 产能
  const loadCapacityRate = input.claimedDailyOutput > 0 ? input.currentOrderLoad / input.claimedDailyOutput : 0;
  if (loadCapacityRate > 1) {
    variances.push(makeVariance("load_vs_capacity", input.currentOrderLoad, input.claimedDailyOutput, loadCapacityRate - 1, loadCapacityRate > 1.2 ? "mismatch" : "warning", `排单超产能 ${(loadCapacityRate * 100).toFixed(0)}%`));
  }

  // 产能可信度 = 历史准交率×40% + 产量稳定性×30% + 工人设备匹配×20% + 质量×10%
  const stability = input.outputStability ?? 0.7;
  const quality = input.qualityStability ?? 0.9;
  // 工人设备匹配度：简化为 worker/equipment 比率是否在 2-5 之间
  const workerEquipRatio = input.equipmentCount > 0 ? input.workerCount / input.equipmentCount : 0;
  const matchScore = workerEquipRatio >= 2 && workerEquipRatio <= 5 ? 1 : workerEquipRatio >= 1 && workerEquipRatio <= 8 ? 0.6 : 0.3;

  const capacityCredibilityScore = Math.round(
    (input.historicalOnTimeRate * 0.4 + stability * 0.3 + matchScore * 0.2 + quality * 0.1) * 100,
  );

  if (capacityCredibilityScore < 60) {
    variances.push(makeVariance("credibility_score", capacityCredibilityScore, 60, Math.abs(capacityCredibilityScore - 60) / 100, capacityCredibilityScore < 40 ? "mismatch" : "warning", "产能可信度低于 60"));
  }

  const data: CapacityReconciliationData = {
    claimedDailyOutput: input.claimedDailyOutput,
    actualDailyOutput: input.actualDailyOutput,
    workerCount: input.workerCount,
    equipmentCount: input.equipmentCount,
    historicalOnTimeRate: input.historicalOnTimeRate,
    currentOrderLoad: input.currentOrderLoad,
    capacityCredibilityScore,
  };

  return {
    id: nextReconId(),
    dimension: "capacity",
    transactionRef: { poId: input.poId },
    status: worstStatus(variances),
    variances,
    data,
    reconciledAt: new Date().toISOString(),
  };
}

// ============================================================================
// 统一对账入口
// ============================================================================

/**
 * 批量汇总对账结果为摘要。
 * 用于 ChainHealth 集成。
 */
export function summarizeReconciliations(results: ReconciliationResult[]): {
  total: number;
  matched: number;
  warning: number;
  mismatch: number;
  mismatchRate: number;
  dimensions: string[];
  healthScore: number;
} {
  const total = results.length;
  const matched = results.filter((r) => r.status === "matched").length;
  const warning = results.filter((r) => r.status === "warning").length;
  const mismatch = results.filter((r) => r.status === "mismatch").length;
  const mismatchRate = total > 0 ? mismatch / total : 0;
  const warningRate = total > 0 ? warning / total : 0;
  const dimensions = [...new Set(results.map((r) => r.dimension))];
  const healthScore = Math.max(0, Math.round(100 - mismatchRate * 100 - warningRate * 30));

  return { total, matched, warning, mismatch, mismatchRate, dimensions, healthScore };
}
