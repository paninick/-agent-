/**
 * reconciliation/anomaly-tracker.ts - 异常闭环机制
 *
 * 异常生命周期（7 步闭环）：
 *   1. detected      - 对账引擎发现差异
 *   2. evidence_collected - 收集支持/反对证据
 *   3. attributed    - 责任归因完成
 *   4. resolved      - 达成解决方案
 *   5. closed        - 结案 + 评分影响记录
 *
 * 责任归因逻辑：
 *   - quantity mismatch + 卖方少发 -> seller
 *   - quantity mismatch + 买方少收 -> logistics
 *   - price mismatch + 卖方涨价 -> seller
 *   - delivery delay + 卖方原因 -> seller
 *   - delivery delay + 买方变更 -> buyer
 *   - quality mismatch -> seller
 *   - demand forecast error -> buyer
 *   - capacity shortfall -> seller
 *   - payment delay -> buyer
 *   - tax/compliance mismatch -> shared
 */

import type {
  Anomaly,
  AnomalyType,
  AnomalyStatus,
  ResponsibleParty,
  ReconciliationResult,
  ReconciliationDimension,
} from "./types";

// ============================================================================
// 异常 ID 生成
// ============================================================================

let anomalyCounter = 0;

function nextAnomalyId(): string {
  anomalyCounter += 1;
  return `anomaly-${anomalyCounter}`;
}

// ============================================================================
// 维度 -> 异常类型映射
// ============================================================================

const DIMENSION_TO_ANOMALY_TYPE: Partial<Record<ReconciliationDimension, AnomalyType>> = {
  quantity: "quantity",
  price: "price",
  delivery: "delivery",
  quality: "quality",
  inventory: "inventory",
  financial: "payment",
  tax: "tax",
  demand: "quantity",
  capacity: "logistics",
};

// ============================================================================
// 从对账结果生成异常
// ============================================================================

/**
 * 从对账结果中提取异常。
 * 只在 status 为 warning 或 mismatch 时生成异常。
 * matched 状态不生成异常。
 */
export function trackAnomaly<T>(reconciliation: ReconciliationResult<T>): Anomaly | null {
  if (reconciliation.status === "matched") return null;

  const anomalyType = DIMENSION_TO_ANOMALY_TYPE[reconciliation.dimension] ?? "compliance";
  const orderId = reconciliation.transactionRef.poId
    ?? reconciliation.transactionRef.soId
    ?? reconciliation.transactionRef.quoteId
    ?? "unknown";

  // 从 variances 中构建描述
  const mismatchVariances = reconciliation.variances.filter((v) => v.status === "mismatch");
  const warningVariances = reconciliation.variances.filter((v) => v.status === "warning");
  const details = [...mismatchVariances, ...warningVariances];

  const description = details.length > 0
    ? details.map((v) => `${v.field}: ${v.note ?? "差异"}`).join("; ")
    : `${reconciliation.dimension} 对账异常`;

  // 估算财务影响（简化：从 data 中尝试取金额）
  const data = reconciliation.data as Record<string, unknown>;
  let financialImpact: number | undefined;
  if (typeof data["orderAmount"] === "number" && typeof data["invoiceAmount"] === "number") {
    financialImpact = Math.abs(data["orderAmount"] as number - data["invoiceAmount"] as number);
  } else if (typeof data["totalAmount"] === "number") {
    financialImpact = data["totalAmount"] as number * (reconciliation.variances[0]?.varianceRate ?? 0);
  }

  return {
    id: nextAnomalyId(),
    type: anomalyType,
    orderId,
    description: `[${reconciliation.dimension}] ${description}`,
    status: "detected",
    evidenceIds: [],
    financialImpact: financialImpact !== undefined ? Math.round(financialImpact * 100) / 100 : undefined,
    detectedAt: reconciliation.reconciledAt,
  };
}

// ============================================================================
// 责任归因
// ============================================================================

export interface ResponsibilityInput {
  /** 异常类型 */
  type: AnomalyType;
  /** 买方相关数据 */
  buyerData: {
    /** 买方确认数量 */
    confirmedQuantity?: number;
    /** 买方变更次数 */
    changeCount?: number;
    /** 买方付款及时性 0-1 */
    paymentTimeliness?: number;
    /** 买方预测准确率 0-1 */
    forecastAccuracy?: number;
  };
  /** 卖方相关数据 */
  sellerData: {
    /** 卖方发货数量 */
    shippedQuantity?: number;
    /** 卖方实际产能 */
    actualCapacity?: number;
    /** 卖方质量合格率 0-1 */
    passRate?: number;
    /** 卖方报价变化率 */
    priceChangeRate?: number;
  };
}

/**
 * 责任归因 - 根据异常类型和买卖双方数据判定责任方。
 */
export function attributeResponsibility(input: ResponsibilityInput): ResponsibleParty {
  const { type, buyerData, sellerData } = input;

  switch (type) {
    case "quantity": {
      // 卖方少发 -> seller；买方少收 -> logistics
      if (buyerData.confirmedQuantity !== undefined && sellerData.shippedQuantity !== undefined) {
        if (sellerData.shippedQuantity < buyerData.confirmedQuantity * 0.97) {
          return "seller";
        }
      }
      return "shared";
    }

    case "price": {
      // 卖方涨价 -> seller
      if (sellerData.priceChangeRate !== undefined && sellerData.priceChangeRate > 0.05) {
        return "seller";
      }
      return "shared";
    }

    case "delivery": {
      // 买方频繁变更 -> buyer；否则 -> seller
      if (buyerData.changeCount !== undefined && buyerData.changeCount >= 3) {
        return "buyer";
      }
      return "seller";
    }

    case "quality": {
      // 质量问题 -> seller
      if (sellerData.passRate !== undefined && sellerData.passRate < 0.95) {
        return "seller";
      }
      return "seller";
    }

    case "inventory": {
      // 预测不准 -> buyer
      if (buyerData.forecastAccuracy !== undefined && buyerData.forecastAccuracy < 0.6) {
        return "buyer";
      }
      return "shared";
    }

    case "payment": {
      // 付款延迟 -> buyer
      if (buyerData.paymentTimeliness !== undefined && buyerData.paymentTimeliness < 0.8) {
        return "buyer";
      }
      return "buyer";
    }

    case "tax":
    case "compliance": {
      return "shared";
    }

    case "logistics": {
      // 产能不足 -> seller
      if (sellerData.actualCapacity !== undefined && sellerData.actualCapacity < 1) {
        return "seller";
      }
      return "third_party";
    }

    default:
      return "unattributed";
  }
}

/**
 * 将异常状态从 detected 推进到 evidence_collected。
 */
export function collectEvidence(
  anomaly: Anomaly,
  evidenceIds: string[],
): Anomaly {
  return {
    ...anomaly,
    status: "evidence_collected",
    evidenceIds: [...new Set([...anomaly.evidenceIds, ...evidenceIds])],
  };
}

/**
 * 将异常状态从 evidence_collected 推进到 attributed。
 */
export function attributeAnomaly(
  anomaly: Anomaly,
  responsibleParty: ResponsibleParty,
): Anomaly {
  return {
    ...anomaly,
    status: "attributed",
    responsibleParty,
  };
}

/**
 * 将异常状态从 attributed 推进到 resolved。
 */
export function resolveAnomaly(
  anomaly: Anomaly,
  resolution: string,
): Anomaly {
  return {
    ...anomaly,
    status: "resolved",
    resolution,
    resolvedAt: new Date().toISOString(),
  };
}

/**
 * 将异常状态从 resolved 推进到 closed，并记录评分影响。
 *
 * 评分影响规则：
 *   - buyer 责任：买方信用评分 -5
 *   - seller 责任：卖方信用评分 -5
 *   - shared 责任：双方各 -3
 *   - third_party：不扣分
 *   - unattributed：双方各 -2（未查明原因也是管理缺陷）
 */
export function closeAnomaly(
  anomaly: Anomaly,
  scoreImpact?: number,
): Anomaly {
  if (anomaly.status !== "resolved") {
    throw new Error(`Cannot close anomaly ${anomaly.id}: status is ${anomaly.status}, expected resolved`);
  }

  // 自动计算评分影响
  let impact = scoreImpact;
  if (impact === undefined) {
    switch (anomaly.responsibleParty) {
      case "buyer":
      case "seller":
        impact = -5;
        break;
      case "shared":
        impact = -3;
        break;
      case "third_party":
        impact = 0;
        break;
      case "unattributed":
        impact = -2;
        break;
      default:
        impact = -2;
    }
  }

  return {
    ...anomaly,
    status: "closed",
    scoreImpact: impact,
  };
}

// ============================================================================
// 异常批量管理
// ============================================================================

/**
 * 异常看板 - 汇总异常状态。
 */
export interface AnomalyDashboard {
  total: number;
  byStatus: Record<AnomalyStatus, number>;
  byType: Record<AnomalyType, number>;
  byResponsibility: Record<ResponsibleParty, number>;
  /** 活跃异常数（非 closed） */
  activeCount: number;
  /** 总财务影响 */
  totalFinancialImpact: number;
  /** 平均处理时长（天） */
  avgResolutionDays?: number;
}

export function summarizeAnomalies(anomalies: Anomaly[]): AnomalyDashboard {
  const byStatus: Record<AnomalyStatus, number> = {
    detected: 0,
    evidence_collected: 0,
    attributed: 0,
    resolved: 0,
    closed: 0,
  };
  const byType: Record<AnomalyType, number> = {
    quantity: 0,
    price: 0,
    delivery: 0,
    quality: 0,
    inventory: 0,
    payment: 0,
    tax: 0,
    logistics: 0,
    compliance: 0,
  };
  const byResponsibility: Record<ResponsibleParty, number> = {
    buyer: 0,
    seller: 0,
    shared: 0,
    designer: 0,
    third_party: 0,
    unattributed: 0,
  };

  let totalFinancialImpact = 0;
  let activeCount = 0;
  let resolutionDaysSum = 0;
  let resolutionCount = 0;

  for (const a of anomalies) {
    byStatus[a.status]++;
    byType[a.type]++;
    if (a.responsibleParty) byResponsibility[a.responsibleParty]++;
    if (a.financialImpact) totalFinancialImpact += a.financialImpact;
    if (a.status !== "closed") activeCount++;
    if (a.resolvedAt) {
      resolutionDaysSum += daysBetween(a.detectedAt, a.resolvedAt);
      resolutionCount++;
    }
  }

  return {
    total: anomalies.length,
    byStatus,
    byType,
    byResponsibility,
    activeCount,
    totalFinancialImpact: Math.round(totalFinancialImpact * 100) / 100,
    avgResolutionDays: resolutionCount > 0 ? Math.round(resolutionDaysSum / resolutionCount) : undefined,
  };
}

function daysBetween(d1: string, d2: string): number {
  const t1 = new Date(d1).getTime();
  const t2 = new Date(d2).getTime();
  return Math.round((t2 - t1) / (1000 * 60 * 60 * 24));
}

// ============================================================================
// 异常格式化
// ============================================================================

/**
 * 格式化异常为 Agent 输出格式：
 * 异常类型 / 影响订单 / 支持证据 / 反对证据 / 置信度 / 影响金额 / 建议动作 / 需要人工确认
 */
export function formatAnomalyForAgent(anomaly: Anomaly): string {
  const lines: string[] = [];
  lines.push(`异常类型: ${anomaly.type}`);
  lines.push(`影响订单: ${anomaly.orderId}`);
  lines.push(`描述: ${anomaly.description}`);
  lines.push(`状态: ${anomaly.status}`);
  lines.push(`责任方: ${anomaly.responsibleParty ?? "未归因"}`);
  lines.push(`支持证据: ${anomaly.evidenceIds.length > 0 ? anomaly.evidenceIds.join(", ") : "无"}`);
  lines.push(`影响金额: ${anomaly.financialImpact !== undefined ? anomaly.financialImpact.toFixed(2) : "未估算"}`);
  lines.push(`建议动作: ${getRecommendedAction(anomaly)}`);
  lines.push(`需要人工确认: ${anomaly.status === "detected" || anomaly.status === "evidence_collected" ? "是" : "否"}`);
  return lines.join("\n");
}

function getRecommendedAction(anomaly: Anomaly): string {
  switch (anomaly.type) {
    case "quantity":
      return anomaly.status === "detected" ? "冻结结算，人工核查数量差异" : "按责任方处理差异";
    case "price":
      return "进行成本拆解验证，确认价格涨幅合理性";
    case "delivery":
      return "反查延误原因（原料/排产/质检/物流/清关/付款）";
    case "quality":
      return "暂停发货，安排第三方质检，协商返修/折价";
    case "payment":
      return "催收账款，评估信用风险";
    case "tax":
      return "核对报关单据，确认 HS Code 和金额一致性";
    default:
      return "调查原因，协商解决方案";
  }
}
