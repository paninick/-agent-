/**
 * server/habitat-routes.ts — Habitat 工作空间 REST 端点
 *
 * 6 个端点，为 HabitatWorkspace UI 提供数据：
 *   GET    /snapshot                         → HabitatSnapshot
 *   POST   /requests/:id/approve             → RequestActionResult
 *   POST   /requests/:id/reject              → RequestActionResult
 *   POST   /requests/:id/auto-authorize      → RequestActionResult
 *   PATCH  /goals/:id/autonomy               → GoalAutonomyResult
 *   POST   /memories/:id/confirm             → MemoryConfirmResult
 *
 * 数据源策略（阶段化）：
 *   阶段1（当前）: 内存态 store，初始化自 createMockHabitatSnapshot()
 *   阶段2（后续）: 从 RunStore / MemoryStore 映射真实 swarm 状态
 *   阶段3（未来）: 从 Neon 持久化层加载
 *
 * 约束：
 *   - 不改 server/index.ts 现有端点（仅追加 app.use）
 *   - 不新增 npm 依赖
 *   - 类型与 domain/agentHabitat.ts + client/habitat/habitatApi.ts 保持一致
 */

import { Router } from "express";
import type {
  HabitatSnapshot,
  AutonomyLevel,
} from "../domain/agentHabitat";
import { createMockHabitatSnapshot } from "../client/habitat/habitatMock";

// ============================================================
// 类型：API 响应（与 client/habitat/habitatApi.ts 对齐）
// ============================================================

interface RequestActionResult {
  ok: boolean;
  requestId: string;
  status: "approved" | "rejected" | "auto_authorized";
  autonomyLevel?: AutonomyLevel;
}

interface GoalAutonomyResult {
  ok: boolean;
  goalId: string;
  autonomy: AutonomyLevel;
}

interface MemoryConfirmResult {
  ok: boolean;
  memoryId: string;
  confirmed: boolean;
}

// ============================================================
// 内存态 Habitat Store
// ============================================================

/**
 * 内存态 store：单例快照 + 增量操作。
 *
 * 设计原则：
 *   - snapshot 在首次访问时懒加载自 mock 工厂
 *   - approve/reject/auto-authorize 从 userRequests 中移除该请求
 *   - updateGoalAutonomy 修改对应 goal 的 autonomy 字段
 *   - confirmMemory 修改对应 memory 的 userConfirmed 字段
 *
 * 阶段2/3 将替换为 RunStore / Neon 持久化层。
 */
class HabitatStore {
  private snapshot: HabitatSnapshot;

  constructor() {
    this.snapshot = createMockHabitatSnapshot();
  }

  /** 获取快照（刷新 capturedAt 为当前时间） */
  getSnapshot(): HabitatSnapshot {
    return {
      ...this.snapshot,
      capturedAt: new Date().toISOString(),
    };
  }

  /** 批准请求：从 userRequests 中移除 */
  approveRequest(requestId: string): RequestActionResult | null {
    const idx = this.snapshot.userRequests.findIndex((r) => r.id === requestId);
    if (idx < 0) return null;
    this.snapshot.userRequests.splice(idx, 1);
    return { ok: true, requestId, status: "approved" };
  }

  /** 拒绝请求：从 userRequests 中移除 */
  rejectRequest(requestId: string): RequestActionResult | null {
    const idx = this.snapshot.userRequests.findIndex((r) => r.id === requestId);
    if (idx < 0) return null;
    this.snapshot.userRequests.splice(idx, 1);
    return { ok: true, requestId, status: "rejected" };
  }

  /** 自动授权：移除请求并提升对应 goal 的自治等级 */
  autoAuthorize(
    requestId: string,
    autonomyLevel: AutonomyLevel = "auto_within_limits",
  ): RequestActionResult | null {
    const idx = this.snapshot.userRequests.findIndex((r) => r.id === requestId);
    if (idx < 0) return null;
    const request = this.snapshot.userRequests[idx];
    this.snapshot.userRequests.splice(idx, 1);

    // 提升对应 goal 的自治等级
    const goal = this.snapshot.goals.find((g) => g.id === request.goalId);
    if (goal) {
      goal.autonomy = autonomyLevel;
    }

    return { ok: true, requestId, status: "auto_authorized", autonomyLevel };
  }

  /** 更新目标自治等级 */
  updateGoalAutonomy(goalId: string, autonomy: AutonomyLevel): GoalAutonomyResult | null {
    const goal = this.snapshot.goals.find((g) => g.id === goalId);
    if (!goal) return null;
    goal.autonomy = autonomy;
    return { ok: true, goalId, autonomy };
  }

  /** 确认记忆：标记 userConfirmed = true */
  confirmMemory(memoryId: string): MemoryConfirmResult | null {
    const memory = this.snapshot.memories.find((m) => m.id === memoryId);
    if (!memory) return null;
    memory.userConfirmed = true;
    return { ok: true, memoryId, confirmed: true };
  }
}

// ============================================================
// 路由工厂
// ============================================================

/**
 * 创建 Habitat 路由。
 * 导出为函数以便 server/index.ts 调用 app.use("/api/habitat", createHabitatRouter())。
 */
export function createHabitatRouter(): Router {
  const router = Router();
  const store = new HabitatStore();

  // ============================================================
  // 1. 获取当前活动空间快照
  // ============================================================
  router.get("/snapshot", (_req, res) => {
    res.json(store.getSnapshot());
  });

  // ============================================================
  // 2. 批准用户请求
  // ============================================================
  router.post("/requests/:id/approve", (req, res) => {
    const result = store.approveRequest(req.params.id);
    if (!result) {
      res.status(404).json({ ok: false, error: "request_not_found" });
      return;
    }
    res.json(result);
  });

  // ============================================================
  // 3. 拒绝用户请求
  // ============================================================
  router.post("/requests/:id/reject", (req, res) => {
    const result = store.rejectRequest(req.params.id);
    if (!result) {
      res.status(404).json({ ok: false, error: "request_not_found" });
      return;
    }
    res.json(result);
  });

  // ============================================================
  // 4. 自动授权（提升自治等级）
  // ============================================================
  router.post("/requests/:id/auto-authorize", (req, res) => {
    const body = (req.body ?? {}) as { autonomyLevel?: AutonomyLevel };
    const autonomyLevel: AutonomyLevel = body.autonomyLevel ?? "auto_within_limits";
    const result = store.autoAuthorize(req.params.id, autonomyLevel);
    if (!result) {
      res.status(404).json({ ok: false, error: "request_not_found" });
      return;
    }
    res.json(result);
  });

  // ============================================================
  // 5. 更新目标自治等级
  // ============================================================
  router.patch("/goals/:id/autonomy", (req, res) => {
    const body = (req.body ?? {}) as { autonomy?: AutonomyLevel };
    const autonomy = body.autonomy;
    if (!autonomy || !["observe_only", "prepare_draft", "ask_before_action", "auto_within_limits", "denied"].includes(autonomy)) {
      res.status(400).json({ ok: false, error: "invalid_autonomy" });
      return;
    }
    const result = store.updateGoalAutonomy(req.params.id, autonomy);
    if (!result) {
      res.status(404).json({ ok: false, error: "goal_not_found" });
      return;
    }
    res.json(result);
  });

  // ============================================================
  // 6. 确认记忆
  // ============================================================
  router.post("/memories/:id/confirm", (req, res) => {
    const result = store.confirmMemory(req.params.id);
    if (!result) {
      res.status(404).json({ ok: false, error: "memory_not_found" });
      return;
    }
    res.json(result);
  });

  return router;
}
