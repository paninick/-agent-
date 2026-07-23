/**
 * memory/persistence/index.ts — 持久化模块 barrel export
 *
 * 4 道防线：
 *   1. 容量上限 + LRU 淘汰 (config.ts)
 *   2. WAL + Compaction (adapter.ts)
 *   3. 行业分区 (config.ts partitionDir)
 *   4. 轻量索引 (adapter.ts rebuildIndex)
 *
 * 后端选择：
 *   - NEON_PERSISTENCE=1 + DATABASE_URL → NeonPersistenceAdapter (PostgreSQL)
 *   - 其它 → PersistenceAdapter (文件系统)
 */

export * from "./config";
export * from "./adapter";
export * from "./neon";

import { PersistenceAdapter, type PersistenceBackend } from "./adapter";
import { NeonPersistenceAdapter } from "./neon";

/**
 * 从环境变量创建持久化后端。
 *
 * 选择规则：
 *   - NEON_PERSISTENCE=1 且 DATABASE_URL 已设置 → NeonPersistenceAdapter
 *   - 否则 → null（不持久化，纯内存）
 *
 * 若需文件持久化，直接 `new PersistenceAdapter(dir)`。
 */
export function createPersistenceFromEnv(): PersistenceBackend | null {
  const useNeon = process.env.NEON_PERSISTENCE === "1";
  if (useNeon) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      return null;
    }
    return new NeonPersistenceAdapter({ connectionString });
  }
  return null;
}
