/**
 * domain/cost.ts - 成本核算类型
 *
 * 从 NP3 (agent-os-2) 提炼的 6 桶成本模型。
 * 修复 NP3 P0：CostBudget 保存 maxCostUsd，CostEngine.assertWithinBudget 读取保存值而非重新传入。
 *
 * 注意：NP2 integration/types.ts 已有 TokenUsage（含 totalTokens），
 * 此处用 CostTokenUsage 避免命名冲突--仅含 input/output，不含派生总量。
 */

export interface CostTokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface CostRecord {
  taskId: string;
  modelCost: number;
  toolCost: number;
  mcpCost: number;
  computeCost: number;
  storageCost: number;
  totalCost: number;
}

export interface CostBudget {
  taskId: string;
  maxCostUsd: number;
}

export type CostCategory = Exclude<keyof CostRecord, "taskId" | "totalCost">;

export interface CostLineItem {
  taskId: string;
  category: CostCategory;
  amountUsd: number;
  sourceId: string;
}
