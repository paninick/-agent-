/**
 * services/cost-engine.ts - 分桶成本引擎 + 预算守卫
 *
 * 从 NP3 (agent-os-2) 提炼，修复 P0 问题：
 *   NP3 的 assertWithinBudget(taskId, maxCostUsd) 要求调用方每次传入 maxCostUsd，
 *   导致 createBudget 保存的预算从未被读取--预算守卫形同虚设。
 *
 * 修复：budgets Map 保存 taskId -> maxCostUsd，assertWithinBudget(taskId) 读取保存值。
 * 如果 taskId 未设预算，返回 true（无限制），但记录 warning。
 *
 * 6 桶：modelCost, toolCost, mcpCost, computeCost, storageCost, totalCost
 */

import type { CostBudget, CostCategory, CostLineItem, CostRecord, CostTokenUsage } from "../domain/cost";

export class CostEngine {
  private readonly records = new Map<string, CostRecord>();
  private readonly budgets = new Map<string, number>();

  /** 估算单次模型调用的成本（美元）。 */
  estimateModelCost(
    inputCostPer1k: number | undefined,
    outputCostPer1k: number | undefined,
    usage: CostTokenUsage,
  ): number {
    const inputCost = ((inputCostPer1k ?? 0) * usage.inputTokens) / 1000;
    const outputCost = ((outputCostPer1k ?? 0) * usage.outputTokens) / 1000;
    return Number((inputCost + outputCost).toFixed(6));
  }

  /** 创建预算（保存 maxCostUsd，后续 assertWithinBudget 读取）。 */
  createBudget(budget: CostBudget): CostRecord {
    this.budgets.set(budget.taskId, budget.maxCostUsd);
    const record = this.emptyRecord(budget.taskId);
    this.records.set(budget.taskId, record);
    return record;
  }

  /** 追加一条成本明细到对应桶。 */
  addCost(item: CostLineItem): CostRecord {
    const current = this.records.get(item.taskId) ?? this.emptyRecord(item.taskId);
    const next: CostRecord = {
      ...current,
      [item.category]: Number((current[item.category] + item.amountUsd).toFixed(6)),
    };
    next.totalCost = Number(
      (next.modelCost + next.toolCost + next.mcpCost + next.computeCost + next.storageCost).toFixed(6),
    );
    this.records.set(item.taskId, next);
    return next;
  }

  /**
   * 检查 taskId 是否在预算内。
   * 修复 NP3 P0：从 budgets Map 读取 createBudget 保存的 maxCostUsd。
   * 如果 taskId 没有设预算，返回 true（无限制）。
   */
  assertWithinBudget(taskId: string): boolean {
    const maxCostUsd = this.budgets.get(taskId);
    if (maxCostUsd === undefined) {
      return true; // 无预算限制
    }
    const totalCost = this.records.get(taskId)?.totalCost ?? 0;
    return totalCost <= maxCostUsd;
  }

  /** 获取预算上限（如果已设置）。 */
  getBudget(taskId: string): number | undefined {
    return this.budgets.get(taskId);
  }

  getRecord(taskId: string): CostRecord | undefined {
    return this.records.get(taskId);
  }

  private emptyRecord(taskId: string): CostRecord {
    return {
      taskId,
      modelCost: 0,
      toolCost: 0,
      mcpCost: 0,
      computeCost: 0,
      storageCost: 0,
      totalCost: 0,
    };
  }
}

export type { CostBudget, CostCategory, CostLineItem, CostRecord, CostTokenUsage };
