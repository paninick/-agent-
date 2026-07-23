/**
 * server/cost-routes.ts - 成本中心 REST 端点
 *
 * 1 个端点，为 CostView UI 提供数据：
 *   GET /api/cost/summary  -> CostSummary
 *
 * 数据源策略（阶段化）：
 *   阶段1（当前）: 从 RunStore 聚合所有 run 的 costSnapshot 汇总总成本，
 *                  6 桶明细使用 mock 分配（CostEngine 记录尚未通过 RunStore 暴露），
 *                  预算告警使用 mock。
 *   阶段2（后续）: 接入 CostEngine 实例，暴露真实 6 桶明细 + 预算守卫状态。
 *   阶段3（未来）: 从 Neon 持久化层聚合历史成本数据。
 *
 * 约束：
 *   - 不改 server/index.ts 现有端点（仅追加 app.use）
 *   - 不新增 npm 依赖
 *   - 类型与前端 costTypes.ts 保持一致
 */

import { Router } from "express";
import { createMockCostSummary, type CostSummary, type CostRunEntry } from "../client/costTypes";
import type { RunStore, Run } from "../runtime/types";

// ============================================================
// RunStore -> 成本中心数据映射
// ============================================================

/**
 * 从 RunStore 的所有 run 聚合成本汇总。
 * 如果没有 runs 或没有 RunStore，返回 undefined（由调用方 fallback 到 mock）。
 */
function aggregateFromRunStore(runStore: RunStore | undefined): CostSummary | undefined {
  if (!runStore) return undefined;
  const runs = runStore.listRuns();
  if (runs.length === 0) return undefined;

  const mock = createMockCostSummary();

  const runEntries: CostRunEntry[] = runs.map((run: Run) => ({
    runId: run.runId,
    intent: run.intent,
    actualTotal: run.costSnapshot.actualTotal,
    estimatedTotal: run.costSnapshot.estimatedTotal,
    status: run.status,
    createdAt: run.createdAt,
  }));

  const totalSpent = runEntries.reduce((sum, r) => sum + r.actualTotal, 0);
  const totalEstimated = runEntries.reduce((sum, r) => sum + r.estimatedTotal, 0);

  // 按实际总成本比例重新分配 6 桶（保持 mock 的桶占比结构）
  const ratio = totalSpent > 0 ? totalSpent / mock.totalSpent : 0;
  const buckets = mock.buckets.map((b) => ({
    ...b,
    amountUsd: Number((b.amountUsd * ratio).toFixed(6)),
  }));

  // 预算告警：从 run status 推断（waiting/failed 的 run 预算更紧张）
  const budgetAlerts = runEntries.slice(0, 6).map((r, i) => {
    const spent = r.actualTotal;
    const budgetLimit = Number((r.estimatedTotal * 1.2).toFixed(6));
    return {
      taskId: `task-run-${i + 1}`,
      budgetLimit,
      spent: Number(spent.toFixed(6)),
      remaining: Number((budgetLimit - spent).toFixed(6)),
      withinBudget: spent <= budgetLimit,
    };
  });

  return {
    totalSpent: Number(totalSpent.toFixed(6)),
    totalEstimated: Number(totalEstimated.toFixed(6)),
    currency: runs[0].costSnapshot.currency,
    runCount: runs.length,
    buckets,
    runs: runEntries,
    budgetAlerts,
  };
}

// ============================================================
// 路由工厂
// ============================================================

/**
 * 创建成本中心路由。
 * 导出为函数以便 server/index.ts 调用 app.use("/api/cost", createCostRouter(...))。
 *
 * @param runStoreGetter 可选的 RunStore 获取函数（用于阶段2真实数据映射）
 */
export function createCostRouter(runStoreGetter?: () => RunStore | undefined): Router {
  const router = Router();

  // ============================================================
  // GET /api/cost/summary - 成本汇总
  // ============================================================
  router.get("/summary", (_req, res) => {
    // 尝试从 RunStore 聚合真实数据
    if (runStoreGetter) {
      const runStore = runStoreGetter();
      const aggregated = aggregateFromRunStore(runStore);
      if (aggregated) {
        res.json(aggregated);
        return;
      }
    }

    // Fallback：返回 mock 数据（阶段1 / 无 run 时）
    res.json(createMockCostSummary());
  });

  return router;
}
