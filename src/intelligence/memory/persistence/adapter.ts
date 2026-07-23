/**
 * memory/persistence/adapter.ts — 文件持久化适配器
 *
 * 用 Node 内置 fs/promises 写 JSONL 文件（不接数据库，不新增依赖）。
 *
 * 4 道防线：
 *   1. 容量上限 + LRU 淘汰 (容量超限时淘汰最旧/最低权重)
 *   2. WAL + Compaction (先写 WAL 再写 JSONL；超阈值触发 compaction 去重)
 *   3. 行业分区 (按 industry 路由到子目录，单文件不跨行业混合)
 *   4. 轻量索引 (index.json 维护 key → file 映射)
 *
 * 文件布局：
 *   .data/memory/
 *   ├── index.json                  # 轻量索引
 *   ├── wal.log                     # Write-Ahead Log
 *   ├── apparel/                    # 行业分区
 *   │   ├── memories.jsonl
 *   │   ├── associations.jsonl
 *   │   └── reflexes.jsonl
 *   └── default/
 *       └── ...
 *
 * 所有写入都是 append-only（JSONL），保证写入性能。
 * compaction 时读全文件 → 去重 → 写临时文件 → 原子 rename。
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { MemoryEntry } from "../../spine/types";
import type { MemoryAssociation, ReflexPathway } from "../types";
import {
  DEFAULT_PERSISTENCE_CONFIG,
  DEFAULT_DATA_DIR,
  WAL_FILENAME,
  INDEX_FILENAME,
  partitionDir,
  type PersistenceConfig,
} from "./config";

/** 持久化状态 — load() 返回的全部数据 */
export interface PersistedState {
  entries: MemoryEntry[];
  associations: MemoryAssociation[];
  reflexes: ReflexPathway[];
}

/**
 * 持久化后端接口 — 文件系统 (PersistenceAdapter) 和 Neon PostgreSQL
 * (NeonPersistenceAdapter) 共同实现。
 *
 * MemoryBroker 接受此接口，可透明切换文件/数据库后端。
 */
export interface PersistenceBackend {
  ensureDirs(partition?: string): Promise<void>;
  load(): Promise<PersistedState>;
  commitEntry(entry: MemoryEntry, industry?: string): Promise<void>;
  commitAssociation(edge: MemoryAssociation, industry?: string): Promise<void>;
  commitReflex(reflex: ReflexPathway, industry?: string): Promise<void>;
  compact(partition: string): Promise<void>;
  compactAll(): Promise<void>;
  rebuildIndex(): Promise<void>;
  clear(): Promise<void>;
}

/** WAL 操作记录 */
interface WalEntry {
  op: "commit" | "evict";
  kind: "entry" | "association" | "reflex";
  partition: string;
  data?: unknown;
  evictKey?: string;
}

/** 索引条目 */
interface IndexEntry {
  file: string;
}

/** 索引文件结构 */
interface IndexFile {
  entries: Record<string, IndexEntry>; // key → { file }
  updatedAt: string;
}

/** LRU 淘汰候选评估器 */
type EvictionCandidate<T> = (items: T[]) => T | undefined;

/** MemoryEntry LRU: 淘汰 createdAt 最旧的 */
const evictOldestEntry: EvictionCandidate<MemoryEntry> = (items) =>
  items.slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];

/** MemoryAssociation LRU: 淘汰 weight 最低的 */
const evictLowestWeight: EvictionCandidate<MemoryAssociation> = (items) =>
  items.slice().sort((a, b) => a.weight - b.weight)[0];

/** ReflexPathway LRU: 淘汰 hitCount 最低且 lastTriggeredAt 最旧的 */
const evictColdestReflex: EvictionCandidate<ReflexPathway> = (items) =>
  items
    .slice()
    .sort((a, b) => {
      if (a.hitCount !== b.hitCount) return a.hitCount - b.hitCount;
      return (a.lastTriggeredAt ?? a.createdAt).localeCompare(b.lastTriggeredAt ?? b.createdAt);
    })[0];

export class PersistenceAdapter implements PersistenceBackend {
  private readonly rootDir: string;
  private readonly walPath: string;
  private readonly indexPath: string;
  private commitCount = 0;

  constructor(
    rootDir: string = DEFAULT_DATA_DIR,
    private readonly config: PersistenceConfig = DEFAULT_PERSISTENCE_CONFIG,
  ) {
    this.rootDir = path.resolve(rootDir);
    this.walPath = path.join(this.rootDir, WAL_FILENAME);
    this.indexPath = path.join(this.rootDir, INDEX_FILENAME);
  }

  // === 初始化 ===

  /** 确保目录结构存在 */
  async ensureDirs(partition?: string): Promise<void> {
    await fs.mkdir(this.rootDir, { recursive: true });
    if (partition) {
      await fs.mkdir(path.join(this.rootDir, partition), { recursive: true });
    }
  }

  // === 加载 (含 WAL 回放) ===

  /**
   * 从文件加载全部数据。先读 JSONL，再回放 WAL 恢复未完成写入。
   */
  async load(): Promise<PersistedState> {
    await this.ensureDirs();
    const entries = await this.loadAllEntries();
    const associations = await this.loadAllAssociations();
    const reflexes = await this.loadAllReflexes();

    // 回放 WAL（恢复崩溃前未写入 JSONL 的操作）
    await this.replayWAL();

    // WAL 回放后重新加载（如果 WAL 有新数据）
    const state: PersistedState = {
      entries: entries.length > 0 ? entries : await this.loadAllEntries(),
      associations: associations.length > 0 ? associations : await this.loadAllAssociations(),
      reflexes: reflexes.length > 0 ? reflexes : await this.loadAllReflexes(),
    };

    return state;
  }

  // === 写入 ===

  /** 写入 MemoryEntry (Layer 1) */
  async commitEntry(entry: MemoryEntry, industry?: string): Promise<void> {
    const partition = partitionDir(industry);
    await this.ensureDirs(partition);
    const filePath = path.join(this.rootDir, partition, "memories.jsonl");

    // 先写 WAL
    await this.writeWAL({ op: "commit", kind: "entry", partition, data: entry });
    // 再写 JSONL
    await this.appendJsonl(filePath, entry);
    // 更新索引
    await this.updateIndex(entry.key, filePath);

    this.commitCount++;
    await this.maybeCompact(partition);
  }

  /** 写入 MemoryAssociation (Layer 2) */
  async commitAssociation(edge: MemoryAssociation, industry?: string): Promise<void> {
    const partition = partitionDir(industry);
    await this.ensureDirs(partition);
    const filePath = path.join(this.rootDir, partition, "associations.jsonl");

    await this.writeWAL({ op: "commit", kind: "association", partition, data: edge });
    await this.appendJsonl(filePath, edge);
    await this.updateIndex(edge.id, filePath);

    this.commitCount++;
  }

  /** 写入 ReflexPathway (Layer 3) */
  async commitReflex(reflex: ReflexPathway, industry?: string): Promise<void> {
    const partition = partitionDir(industry ?? reflex.industry);
    await this.ensureDirs(partition);
    const filePath = path.join(this.rootDir, partition, "reflexes.jsonl");

    await this.writeWAL({ op: "commit", kind: "reflex", partition, data: reflex });
    await this.appendJsonl(filePath, reflex);
    await this.updateIndex(reflex.id, filePath);

    this.commitCount++;
  }

  // === Compaction (防线 2) ===

  /**
   * 压实指定分区的 JSONL 文件。
   * 读全文件 → 按 key/id 去重（保留最后一条）→ 写临时文件 → 原子 rename。
   */
  async compact(partition: string): Promise<void> {
    await this.compactFile<MemoryEntry>(
      path.join(this.rootDir, partition, "memories.jsonl"),
      (e) => e.key,
      this.config.maxEntriesPerPartition,
      evictOldestEntry,
    );
    await this.compactFile<MemoryAssociation>(
      path.join(this.rootDir, partition, "associations.jsonl"),
      (a) => a.id,
      this.config.maxAssociations,
      evictLowestWeight,
    );
    await this.compactFile<ReflexPathway>(
      path.join(this.rootDir, partition, "reflexes.jsonl"),
      (r) => r.id,
      this.config.maxReflexes,
      evictColdestReflex,
    );
  }

  /** 压实全部分区 */
  async compactAll(): Promise<void> {
    const partitions = await this.listPartitions();
    for (const p of partitions) {
      await this.compact(p);
    }
  }

  // === 索引 (防线 4) ===

  /** 重建索引 — 扫描全部 JSONL 文件 */
  async rebuildIndex(): Promise<void> {
    await this.ensureDirs();
    const index: IndexFile = { entries: {}, updatedAt: new Date().toISOString() };
    const partitions = await this.listPartitions();

    for (const partition of partitions) {
      for (const filename of ["memories.jsonl", "associations.jsonl", "reflexes.jsonl"]) {
        const filePath = path.join(this.rootDir, partition, filename);
        try {
          const content = await fs.readFile(filePath, "utf-8");
          for (const line of content.split("\n")) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const obj = JSON.parse(trimmed);
              const key = obj.key ?? obj.id;
              if (key) {
                index.entries[key] = { file: filePath };
              }
            } catch {
              // 跳过损坏行
            }
          }
        } catch {
          // 文件不存在，跳过
        }
      }
    }

    await fs.writeFile(this.indexPath, JSON.stringify(index, null, 2), "utf-8");
  }

  // === 清理 ===

  /** 清空全部持久化数据（测试用） */
  async clear(): Promise<void> {
    try {
      await fs.rm(this.rootDir, { recursive: true, force: true });
    } catch {
      // 忽略 — 目录可能不存在
    }
  }

  // === 内部方法 ===

  /** 写 WAL 条目（追加） */
  private async writeWAL(entry: WalEntry): Promise<void> {
    const line = JSON.stringify(entry) + "\n";
    await fs.appendFile(this.walPath, line, "utf-8");
  }

  /** 回放 WAL — 恢复未完成写入 */
  private async replayWAL(): Promise<void> {
    let walContent: string;
    try {
      walContent = await fs.readFile(this.walPath, "utf-8");
    } catch {
      return; // WAL 不存在，无需回放
    }

    const lines = walContent.split("\n").filter((l) => l.trim());
    for (const line of lines) {
      try {
        const entry: WalEntry = JSON.parse(line);
        if (entry.op === "commit" && entry.data) {
          // WAL 条目表示"已开始写入但可能未完成" — 检查 JSONL 是否已有此条
          // 如果没有，补写（幂等）
          const filePath = this.filePathFor(entry.kind, entry.partition);
          const exists = await this.keyExistsInFile(filePath, entry.data as { key?: string; id?: string });
          if (!exists) {
            await this.appendJsonl(filePath, entry.data);
          }
        }
      } catch {
        // 跳过损坏的 WAL 行
      }
    }

    // 回放完成后清空 WAL
    await fs.writeFile(this.walPath, "", "utf-8");
  }

  /** 追加写 JSONL */
  private async appendJsonl(filePath: string, data: unknown): Promise<void> {
    const line = JSON.stringify(data) + "\n";
    await fs.appendFile(filePath, line, "utf-8");
  }

  /** 更新索引 */
  private async updateIndex(key: string, file: string): Promise<void> {
    let index: IndexFile;
    try {
      const content = await fs.readFile(this.indexPath, "utf-8");
      index = JSON.parse(content);
    } catch {
      index = { entries: {}, updatedAt: "" };
    }
    index.entries[key] = { file };
    index.updatedAt = new Date().toISOString();
    await fs.writeFile(this.indexPath, JSON.stringify(index, null, 2), "utf-8");
  }

  /** 检查 key/id 是否已存在于文件中 */
  private async keyExistsInFile(filePath: string, obj: { key?: string; id?: string }): Promise<boolean> {
    const key = obj.key ?? obj.id;
    if (!key) return false;
    try {
      const content = await fs.readFile(filePath, "utf-8");
      return content.includes(`"key":"${key}"`) || content.includes(`"id":"${key}"`);
    } catch {
      return false;
    }
  }

  /** 按 kind 取文件路径 */
  private filePathFor(kind: WalEntry["kind"], partition: string): string {
    const filename =
      kind === "entry" ? "memories.jsonl" :
      kind === "association" ? "associations.jsonl" :
      "reflexes.jsonl";
    return path.join(this.rootDir, partition, filename);
  }

  /** 加载全部 entries（跨分区） */
  private async loadAllEntries(): Promise<MemoryEntry[]> {
    const partitions = await this.listPartitions();
    const all: MemoryEntry[] = [];
    for (const p of partitions) {
      const items = await this.loadJsonl<MemoryEntry>(path.join(this.rootDir, p, "memories.jsonl"));
      all.push(...items);
    }
    return this.enforceCapacity(all, this.config.maxEntriesPerPartition, evictOldestEntry);
  }

  /** 加载全部 associations */
  private async loadAllAssociations(): Promise<MemoryAssociation[]> {
    const partitions = await this.listPartitions();
    const all: MemoryAssociation[] = [];
    for (const p of partitions) {
      const items = await this.loadJsonl<MemoryAssociation>(path.join(this.rootDir, p, "associations.jsonl"));
      all.push(...items);
    }
    return this.enforceCapacity(all, this.config.maxAssociations, evictLowestWeight);
  }

  /** 加载全部 reflexes */
  private async loadAllReflexes(): Promise<ReflexPathway[]> {
    const partitions = await this.listPartitions();
    const all: ReflexPathway[] = [];
    for (const p of partitions) {
      const items = await this.loadJsonl<ReflexPathway>(path.join(this.rootDir, p, "reflexes.jsonl"));
      all.push(...items);
    }
    return this.enforceCapacity(all, this.config.maxReflexes, evictColdestReflex);
  }

  /** 加载 JSONL 文件 */
  private async loadJsonl<T>(filePath: string): Promise<T[]> {
    try {
      const content = await fs.readFile(filePath, "utf-8");
      const items: T[] = [];
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          items.push(JSON.parse(trimmed));
        } catch {
          // 跳过损坏行
        }
      }
      return items;
    } catch {
      return [];
    }
  }

  /** 容量上限 + LRU 淘汰 (防线 1) */
  private enforceCapacity<T>(items: T[], max: number, evict: EvictionCandidate<T>): T[] {
    if (items.length <= max) return items;
    // 去重（按 key/id）
    const seen = new Map<string, T>();
    for (const item of items) {
      const key = (item as { key?: string; id?: string }).key ?? (item as { id?: string }).id ?? JSON.stringify(item);
      seen.set(key, item); // 保留最后一条
    }
    let deduped = Array.from(seen.values());
    while (deduped.length > max) {
      const candidate = evict(deduped);
      if (!candidate) break;
      deduped = deduped.filter((x) => x !== candidate);
    }
    return deduped;
  }

  /** 压实单个 JSONL 文件 */
  private async compactFile<T>(
    filePath: string,
    getKey: (item: T) => string,
    max: number,
    evict: EvictionCandidate<T>,
  ): Promise<void> {
    let items: T[];
    try {
      const content = await fs.readFile(filePath, "utf-8");
      items = content.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
    } catch {
      return; // 文件不存在，无需压实
    }

    // 去重（保留最后一条）
    const seen = new Map<string, T>();
    for (const item of items) {
      seen.set(getKey(item), item);
    }
    let deduped = Array.from(seen.values());

    // LRU 淘汰
    while (deduped.length > max) {
      const candidate = evict(deduped);
      if (!candidate) break;
      deduped = deduped.filter((x) => x !== candidate);
    }

    // 写临时文件 → 原子 rename
    const tmpPath = filePath + ".tmp";
    const content = deduped.map((item) => JSON.stringify(item)).join("\n") + "\n";
    await fs.writeFile(tmpPath, content, "utf-8");
    await fs.rename(tmpPath, filePath);
  }

  /** 列出全部分区目录 */
  private async listPartitions(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.rootDir, { withFileTypes: true });
      return entries.filter((e) => e.isDirectory()).map((e) => e.name);
    } catch {
      return [];
    }
  }

  /** 达到阈值时触发 compaction */
  private async maybeCompact(partition: string): Promise<void> {
    if (this.commitCount < this.config.compactionThreshold) return;
    this.commitCount = 0;
    await this.compact(partition);
  }
}
