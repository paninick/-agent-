/**
 * memory/persistence/neon.ts — Neon PostgreSQL 持久化适配器
 *
 * 实现与 PersistenceAdapter 相同的公开接口，但使用 Neon Serverless PostgreSQL
 * 替代文件系统。适用于跨会话、多实例共享的持久化场景。
 *
 * 设计约束：
 *   - 内存仍是 source of truth；Neon 是异步持久化后端
 *   - 不存储 API key/password — 从 process.env.DATABASE_URL 读取连接字符串
 *   - 使用 @neondatabase/serverless 的 HTTP SQL driver（neon() 函数）
 *   - UPSERT 语义：相同 id 的记录覆盖旧值，保证幂等
 *
 * 与 PersistenceAdapter 的对应关系：
 *   - 行业分区 → industry 列（WHERE 过滤）
 *   - JSONL append-only → INSERT ... ON CONFLICT UPDATE
 *   - Compaction → no-op（PostgreSQL 自管理空间）
 *   - WAL → no-op（PostgreSQL 自有 WAL）
 *   - 轻量索引 → PostgreSQL B-tree 索引
 */

import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import type { MemoryEntry } from "../../spine/types";
import type { MemoryAssociation, ReflexPathway } from "../types";
import type { PersistedState, PersistenceBackend } from "./adapter";

export interface NeonPersistenceConfig {
  /** 连接字符串（postgresql://user:pass@host/db?sslmode=require） */
  connectionString: string;
  /** 是否在构造时自动确保 schema 存在（默认 true） */
  autoEnsureSchema?: boolean;
}

const SCHEMA_DDL = [
  `CREATE TABLE IF NOT EXISTS memory_entries (
    id TEXT PRIMARY KEY,
    key TEXT NOT NULL,
    kind TEXT NOT NULL,
    value TEXT NOT NULL,
    source_task_id TEXT DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    tags TEXT[] DEFAULT '{}',
    industry TEXT DEFAULT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS memory_associations (
    id TEXT PRIMARY KEY,
    from_key TEXT NOT NULL,
    to_key TEXT NOT NULL,
    relation TEXT NOT NULL,
    weight DOUBLE PRECISION NOT NULL DEFAULT 0.3,
    created_at TIMESTAMPTZ NOT NULL,
    last_reinforced_at TIMESTAMPTZ NOT NULL,
    co_occurrence_count INTEGER NOT NULL DEFAULT 1,
    metadata JSONB DEFAULT NULL,
    industry TEXT DEFAULT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS reflex_pathways (
    id TEXT PRIMARY KEY,
    trigger TEXT NOT NULL,
    action TEXT NOT NULL,
    confidence DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    hit_count INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL,
    last_triggered_at TIMESTAMPTZ,
    tags TEXT[] DEFAULT '{}',
    industry TEXT DEFAULT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_entries_key ON memory_entries(key)`,
  `CREATE INDEX IF NOT EXISTS idx_entries_industry ON memory_entries(industry)`,
  `CREATE INDEX IF NOT EXISTS idx_assoc_from ON memory_associations(from_key)`,
  `CREATE INDEX IF NOT EXISTS idx_assoc_to ON memory_associations(to_key)`,
  `CREATE INDEX IF NOT EXISTS idx_reflex_trigger ON reflex_pathways(trigger)`,
];

/**
 * Neon PostgreSQL 持久化适配器。
 *
 * 结构兼容 PersistenceAdapter — 可作为 MemoryBroker 的 persistence 参数注入。
 * MemoryBroker 调用 commitEntry/commitAssociation/commitReflex 时，
 * 适配器异步写入 Neon，失败不影响内存状态。
 */
export class NeonPersistenceAdapter implements PersistenceBackend {
  private readonly sql: NeonQueryFunction<false, false>;
  private schemaEnsured = false;

  constructor(private readonly config: NeonPersistenceConfig) {
    this.sql = neon(config.connectionString);
  }

  // === Schema 初始化 ===

  /** 确保 schema（表+索引）存在。幂等。 */
  async ensureSchema(): Promise<void> {
    if (this.schemaEnsured) return;
    for (const ddl of SCHEMA_DDL) {
      await this.sql(ddl as unknown as TemplateStringsArray);
    }
    this.schemaEnsured = true;
  }

  // === 兼容 PersistenceAdapter 接口 ===

  /** no-op — Neon 不需要目录结构 */
  async ensureDirs(_partition?: string): Promise<void> {
    if (this.config.autoEnsureSchema !== false) {
      await this.ensureSchema();
    }
  }

  // === 加载 ===

  /** 从 Neon 加载全部数据（跨全部分区） */
  async load(): Promise<PersistedState> {
    await this.ensureSchema();
    const [entries, associations, reflexes] = await Promise.all([
      this.loadEntries(),
      this.loadAssociations(),
      this.loadReflexes(),
    ]);
    return { entries, associations, reflexes };
  }

  // === 写入（UPSERT 语义） ===

  /** 写入 MemoryEntry (Layer 1) — INSERT ... ON CONFLICT UPDATE */
  async commitEntry(entry: MemoryEntry, industry?: string): Promise<void> {
    await this.ensureSchema();
    const ind = industry ?? null;
    const tags = entry.tags ?? [];
    const sourceTaskId = entry.sourceTaskId ?? null;
    await this.sql`
      INSERT INTO memory_entries (id, key, kind, value, source_task_id, created_at, tags, industry)
      VALUES (${entry.id}, ${entry.key}, ${entry.kind}, ${entry.value}, ${sourceTaskId}, ${entry.createdAt}, ${tags}, ${ind})
      ON CONFLICT (id) DO UPDATE SET
        key = EXCLUDED.key,
        kind = EXCLUDED.kind,
        value = EXCLUDED.value,
        source_task_id = EXCLUDED.source_task_id,
        created_at = EXCLUDED.created_at,
        tags = EXCLUDED.tags,
        industry = EXCLUDED.industry
    `;
  }

  /** 写入 MemoryAssociation (Layer 2) — INSERT ... ON CONFLICT UPDATE */
  async commitAssociation(edge: MemoryAssociation, industry?: string): Promise<void> {
    await this.ensureSchema();
    const ind = industry ?? null;
    const metadata = edge.metadata ? JSON.stringify(edge.metadata) : null;
    await this.sql`
      INSERT INTO memory_associations (id, from_key, to_key, relation, weight, created_at, last_reinforced_at, co_occurrence_count, metadata, industry)
      VALUES (${edge.id}, ${edge.fromKey}, ${edge.toKey}, ${edge.relation}, ${edge.weight}, ${edge.createdAt}, ${edge.lastReinforcedAt}, ${edge.coOccurrenceCount}, ${metadata}::jsonb, ${ind})
      ON CONFLICT (id) DO UPDATE SET
        from_key = EXCLUDED.from_key,
        to_key = EXCLUDED.to_key,
        relation = EXCLUDED.relation,
        weight = EXCLUDED.weight,
        last_reinforced_at = EXCLUDED.last_reinforced_at,
        co_occurrence_count = EXCLUDED.co_occurrence_count,
        metadata = EXCLUDED.metadata,
        industry = EXCLUDED.industry
    `;
  }

  /** 写入 ReflexPathway (Layer 3) — INSERT ... ON CONFLICT UPDATE */
  async commitReflex(reflex: ReflexPathway, industry?: string): Promise<void> {
    await this.ensureSchema();
    const ind = industry ?? reflex.industry ?? null;
    const tags = reflex.tags ?? [];
    const lastTriggered = reflex.lastTriggeredAt ?? null;
    await this.sql`
      INSERT INTO reflex_pathways (id, trigger, action, confidence, hit_count, created_at, last_triggered_at, tags, industry)
      VALUES (${reflex.id}, ${reflex.trigger}, ${reflex.action}, ${reflex.confidence}, ${reflex.hitCount}, ${reflex.createdAt}, ${lastTriggered}, ${tags}, ${ind})
      ON CONFLICT (id) DO UPDATE SET
        trigger = EXCLUDED.trigger,
        action = EXCLUDED.action,
        confidence = EXCLUDED.confidence,
        hit_count = EXCLUDED.hit_count,
        last_triggered_at = EXCLUDED.last_triggered_at,
        tags = EXCLUDED.tags,
        industry = EXCLUDED.industry
    `;
  }

  // === Compaction（no-op — PostgreSQL 自管理空间） ===

  /** no-op — PostgreSQL 自管理空间，不需要 compaction */
  async compact(_partition: string): Promise<void> {
    // intentionally empty
  }

  /** no-op — PostgreSQL 自管理空间 */
  async compactAll(): Promise<void> {
    // intentionally empty
  }

  // === 索引重建（no-op — PostgreSQL 自维护索引） ===

  /** no-op — PostgreSQL 自维护索引 */
  async rebuildIndex(): Promise<void> {
    // intentionally empty
  }

  // === 清理 ===

  /** 清空全部持久化数据（测试用） */
  async clear(): Promise<void> {
    await this.ensureSchema();
    await this.sql`DELETE FROM memory_entries`;
    await this.sql`DELETE FROM memory_associations`;
    await this.sql`DELETE FROM reflex_pathways`;
  }

  // === 内部方法 ===

  /** 加载全部 MemoryEntry */
  private async loadEntries(): Promise<MemoryEntry[]> {
    const rows = await this.sql`
      SELECT id, key, kind, value, source_task_id, created_at, tags
      FROM memory_entries
      ORDER BY created_at ASC
    `;
    const typed = rows as unknown as MemoryEntryRow[];
    return typed.map((r) => ({
      id: r.id,
      key: r.key,
      kind: r.kind as MemoryEntry["kind"],
      value: r.value,
      ...(r.source_task_id ? { sourceTaskId: r.source_task_id } : {}),
      createdAt: r.created_at,
      ...(r.tags && r.tags.length > 0 ? { tags: r.tags } : {}),
    }));
  }

  /** 加载全部 MemoryAssociation */
  private async loadAssociations(): Promise<MemoryAssociation[]> {
    const rows = await this.sql`
      SELECT id, from_key, to_key, relation, weight, created_at, last_reinforced_at, co_occurrence_count, metadata
      FROM memory_associations
      ORDER BY created_at ASC
    `;
    const typed = rows as unknown as AssociationRow[];
    return typed.map((r) => ({
      id: r.id,
      fromKey: r.from_key,
      toKey: r.to_key,
      relation: r.relation as MemoryAssociation["relation"],
      weight: r.weight,
      createdAt: r.created_at,
      lastReinforcedAt: r.last_reinforced_at,
      coOccurrenceCount: r.co_occurrence_count,
      ...(r.metadata ? { metadata: r.metadata } : {}),
    }));
  }

  /** 加载全部 ReflexPathway */
  private async loadReflexes(): Promise<ReflexPathway[]> {
    const rows = await this.sql`
      SELECT id, trigger, action, confidence, hit_count, created_at, last_triggered_at, tags, industry
      FROM reflex_pathways
      ORDER BY created_at ASC
    `;
    const typed = rows as unknown as ReflexRow[];
    return typed.map((r) => ({
      id: r.id,
      trigger: r.trigger,
      action: r.action,
      confidence: r.confidence,
      hitCount: r.hit_count,
      createdAt: r.created_at,
      ...(r.last_triggered_at ? { lastTriggeredAt: r.last_triggered_at } : {}),
      tags: r.tags ?? [],
      ...(r.industry ? { industry: r.industry } : {}),
    }));
  }
}

// === Neon 行类型（内部使用） ===

interface MemoryEntryRow {
  id: string;
  key: string;
  kind: string;
  value: string;
  source_task_id: string | null;
  created_at: string;
  tags: string[] | null;
}

interface AssociationRow {
  id: string;
  from_key: string;
  to_key: string;
  relation: string;
  weight: number;
  created_at: string;
  last_reinforced_at: string;
  co_occurrence_count: number;
  metadata: Record<string, unknown> | null;
}

interface ReflexRow {
  id: string;
  trigger: string;
  action: string;
  confidence: number;
  hit_count: number;
  created_at: string;
  last_triggered_at: string | null;
  tags: string[] | null;
  industry: string | null;
}

// === 工厂函数 ===

/**
 * 从环境变量创建 NeonPersistenceAdapter。
 * 需要 DATABASE_URL 环境变量。
 * 返回 null 如果 DATABASE_URL 未设置。
 */
export function createNeonPersistenceFromEnv(): NeonPersistenceAdapter | null {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return null;
  return new NeonPersistenceAdapter({ connectionString });
}
