/**
 * server/skills-routes.ts - 技能与工具 REST 端点
 *
 * 1 个端点，为 SkillsView UI 提供数据：
 *   GET /api/skills  -> SkillViewSummary
 *
 * 数据源策略（阶段化）：
 *   阶段1（当前）: 返回 mock 技能注册表数据（SkillRegistry 尚未在启动时填充）。
 *   阶段2（后续）: 启动时用 scanSkillsSync 扫描 skills/ 目录下的 SKILL.md 文件，
 *                  注册到 SkillRegistry 实例并从此返回真实数据。
 *   阶段3（未来）: 从数据库加载远程技能注册表 + 用户自定义技能。
 *
 * 约束：
 *   - 不改 server/index.ts 现有端点（仅追加 app.use）
 *   - 不新增 npm 依赖
 *   - 类型与前端 skillViewTypes.ts 保持一致
 */

import { Router } from "express";
import { createMockSkillViewSummary, type SkillContextTier, type SkillViewSummary } from "../client/skillViewTypes";

// ============================================================
// 路由工厂
// ============================================================

/**
 * 创建技能与工具路由。
 * 导出为函数以便 server/index.ts 调用 app.use("/api/skills", createSkillsRouter())。
 */
export function createSkillsRouter(): Router {
  const router = Router();

  // ============================================================
  // GET /api/skills - 技能注册表 + 上下文预算汇总
  // ============================================================
  router.get("/", (req, res) => {
    // 阶段2：从 SkillRegistry 实例读取真实注册数据
    // const entries = skillRegistry.list().map(...);
    // 目前使用 mock（阶段1）

    const tierParam = typeof req.query.tier === "string" ? req.query.tier : undefined;
    const validTiers: SkillContextTier[] = ["small", "medium", "large"];
    const tier = tierParam && validTiers.includes(tierParam as SkillContextTier)
      ? (tierParam as SkillContextTier)
      : "medium";

    res.json(createMockSkillViewSummary(tier));
  });

  return router;
}
