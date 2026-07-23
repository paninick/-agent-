/**
 * client/costTypes.ts - 成本中心视图类型 + mock 工厂
 *
 * 数据形状与 domain/cost.ts 的 6 桶模型对齐：
 *   modelCost / toolCost / mcpCost / computeCost / storageCost
 *
 * CostSummary 是 /api/cost/summary 的返回体，聚合所有 run 的成本快照
 * 并提供分桶明细 + 预算守卫告警。
 */

// ===== 6 桶分类（与 domain/cost.ts CostCategory 对齐） =====

export type CostBucketCategory =
  | "modelCost"
  | "toolCost"
  | "mcpCost"
  | "computeCost"
  | "storageCost";

export interface CostBucketBreakdown {
  category: CostBucketCategory;
  label: string;
  amountUsd: number;
  percentage: number;
  color: string;
}

export interface CostRunEntry {
  runId: string;
  intent: string;
  actualTotal: number;
  estimatedTotal: number;
  status: "running" | "waiting_approval" | "paused" | "completed" | "failed" | "rejected";
  createdAt: string;
}

export interface CostBudgetAlert {
  taskId: string;
  budgetLimit: number;
  spent: number;
  remaining: number;
  withinBudget: boolean;
}

export interface CostSummary {
  totalSpent: number;
  totalEstimated: number;
  currency: "USD" | "CNY" | "JPY" | "EUR";
  runCount: number;
  buckets: CostBucketBreakdown[];
  runs: CostRunEntry[];
  budgetAlerts: CostBudgetAlert[];
}

// ===== 桶元数据 =====

export const BUCKET_META: Record<CostBucketCategory, { label: string; color: string }> = {
  modelCost: { label: "模型调用", color: "var(--cyan)" },
  toolCost: { label: "工具执行", color: "var(--mint)" },
  mcpCost: { label: "MCP 服务", color: "var(--amber)" },
  computeCost: { label: "计算资源", color: "#a78bfa" },
  storageCost: { label: "存储", color: "var(--steel)" },
};

// ===== Mock 工厂 =====

export function createMockCostSummary(): CostSummary {
  const buckets: CostBucketBreakdown[] = [
    { category: "modelCost", label: "模型调用", amountUsd: 0.0842, percentage: 52, color: "var(--cyan)" },
    { category: "toolCost", label: "工具执行", amountUsd: 0.0318, percentage: 20, color: "var(--mint)" },
    { category: "mcpCost", label: "MCP 服务", amountUsd: 0.0245, percentage: 15, color: "var(--amber)" },
    { category: "computeCost", label: "计算资源", amountUsd: 0.0129, percentage: 8, color: "#a78bfa" },
    { category: "storageCost", label: "存储", amountUsd: 0.0078, percentage: 5, color: "var(--steel)" },
  ];

  const totalSpent = buckets.reduce((sum, b) => sum + b.amountUsd, 0);

  const runs: CostRunEntry[] = [
    {
      runId: "run_20260722_001",
      intent: "Launch plan: 华东供应链智能定价分析",
      actualTotal: 0.0648,
      estimatedTotal: 0.0800,
      status: "completed",
      createdAt: "2026-07-22T09:14:00Z",
    },
    {
      runId: "run_20260722_002",
      intent: "棉花现货价 + 政策面交叉验证",
      actualTotal: 0.0392,
      estimatedTotal: 0.0450,
      status: "completed",
      createdAt: "2026-07-22T10:32:00Z",
    },
    {
      runId: "run_20260722_003",
      intent: "竞品定价策略情报采集",
      actualTotal: 0.0281,
      estimatedTotal: 0.0350,
      status: "failed",
      createdAt: "2026-07-22T11:05:00Z",
    },
    {
      runId: "run_20260722_004",
      intent: "库存周转率预测 - 待审批",
      actualTotal: 0.0181,
      estimatedTotal: 0.0500,
      status: "waiting_approval",
      createdAt: "2026-07-22T11:48:00Z",
    },
  ];

  const budgetAlerts: CostBudgetAlert[] = [
    { taskId: "task-pricing-model", budgetLimit: 0.1000, spent: 0.0648, remaining: 0.0352, withinBudget: true },
    { taskId: "task-cross-verify", budgetLimit: 0.0400, spent: 0.0392, remaining: 0.0008, withinBudget: true },
    { taskId: "task-competitor-intel", budgetLimit: 0.0300, spent: 0.0281, remaining: 0.0019, withinBudget: true },
    { taskId: "task-inventory-forecast", budgetLimit: 0.0200, spent: 0.0181, remaining: 0.0019, withinBudget: true },
  ];

  const totalEstimated = runs.reduce((sum, r) => sum + r.estimatedTotal, 0);

  return {
    totalSpent: Number(totalSpent.toFixed(6)),
    totalEstimated: Number(totalEstimated.toFixed(6)),
    currency: "USD",
    runCount: runs.length,
    buckets,
    runs,
    budgetAlerts,
  };
}
