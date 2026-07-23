/**
 * memory/persistence/config.ts — 持久化配置 + 容量上限
 *
 * 防线 1: 容量上限 + LRU 淘汰
 *   - Layer 3 reflexes:   上限 200 条
 *   - Layer 2 associations: 上限 2000 条
 *   - Layer 1 entries:    上限 5000 条/分区
 *
 * 防线 2: WAL + Compaction
 *   - JSONL 超过 compactionThreshold 条触发压实
 *
 * 防线 3: 行业分区
 *   - 按 industry 字段路由到子目录
 *
 * 防线 4: 轻量索引
 *   - index.json 维护 key → { file, line } 映射
 */

/** 持久化容量配置 */
export interface PersistenceConfig {
  /** Layer 1 entries 每分区上限 */
  maxEntriesPerPartition: number;
  /** Layer 2 associations 全局上限 */
  maxAssociations: number;
  /** Layer 3 reflexes 全局上限 */
  maxReflexes: number;
  /** JSONL 超过此条数触发 compaction */
  compactionThreshold: number;
}

/** 默认配置 — 对应 4 道防线的容量上限 */
export const DEFAULT_PERSISTENCE_CONFIG: PersistenceConfig = {
  maxEntriesPerPartition: 5000,
  maxAssociations: 2000,
  maxReflexes: 200,
  compactionThreshold: 500,
};

/** 默认数据根目录（相对项目根） */
export const DEFAULT_DATA_DIR = ".data/memory";

/** WAL 文件名 */
export const WAL_FILENAME = "wal.log";

/** 索引文件名 */
export const INDEX_FILENAME = "index.json";

/** 行业分区目录名（无 industry 标记时的默认分区） */
export const DEFAULT_PARTITION = "default";

/** 取分区目录名 — industry 为空时用 default */
export function partitionDir(industry?: string): string {
  return industry && industry.trim().length > 0 ? industry.trim() : DEFAULT_PARTITION;
}
