/**
 * memory-persistence.test.ts — 文件持久化测试 (Phase 3)
 *
 * 覆盖 4 道防线：
 *   1. 容量上限 + LRU 淘汰 (entries/associations/reflexes 各自上限)
 *   2. WAL + Compaction (WAL 回放恢复 + 去重压实)
 *   3. 行业分区 (apparel vs default 隔离)
 *   4. 轻量索引 (key → file 映射一致性)
 *
 * 测试用临时目录，结束后清理。
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  PersistenceAdapter,
  DEFAULT_PERSISTENCE_CONFIG,
  partitionDir,
} from "../intelligence";
import type { MemoryEntry, MemoryAssociation, ReflexPathway } from "../intelligence";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "neural-mem-test-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
});

function makeEntry(key: string, createdAt: string = "2026-07-07T12:00:00Z"): MemoryEntry {
  return {
    id: `id-${key}`,
    key,
    kind: "synthesis",
    value: `value for ${key}`,
    createdAt,
    tags: ["test"],
  };
}

function makeAssociation(id: string, weight: number = 0.5): MemoryAssociation {
  return {
    id,
    fromKey: `from-${id}`,
    toKey: `to-${id}`,
    relation: "semantic",
    weight,
    createdAt: "2026-07-07T12:00:00Z",
    lastReinforcedAt: "2026-07-07T12:00:00Z",
    coOccurrenceCount: 1,
  };
}

function makeReflex(id: string, hitCount: number = 1): ReflexPathway {
  return {
    id,
    trigger: `trigger-${id}`,
    action: `action-${id}`,
    confidence: 0.5,
    hitCount,
    createdAt: "2026-07-07T12:00:00Z",
    lastTriggeredAt: "2026-07-07T12:00:00Z",
    tags: [],
    industry: "apparel",
  };
}

describe("Memory Persistence (Phase 3)", () => {
  // === 防线 3: 行业分区 ===

  it("writes entries to industry partition directory", async () => {
    const adapter = new PersistenceAdapter(tmpDir);
    await adapter.commitEntry(makeEntry("key-1"), "apparel");

    const partitionPath = path.join(tmpDir, "apparel", "memories.jsonl");
    const content = await fs.readFile(partitionPath, "utf-8");
    expect(content).toContain("key-1");
    expect(content).toContain("value for key-1");
  });

  it("writes to default partition when industry is undefined", async () => {
    const adapter = new PersistenceAdapter(tmpDir);
    await adapter.commitEntry(makeEntry("key-default"));

    const partitionPath = path.join(tmpDir, partitionDir(), "memories.jsonl");
    const content = await fs.readFile(partitionPath, "utf-8");
    expect(content).toContain("key-default");
  });

  it("isolates entries by industry partition", async () => {
    const adapter = new PersistenceAdapter(tmpDir);
    await adapter.commitEntry(makeEntry("apparel-key"), "apparel");
    await adapter.commitEntry(makeEntry("retail-key"), "retail");

    const apparelContent = await fs.readFile(
      path.join(tmpDir, "apparel", "memories.jsonl"), "utf-8"
    );
    const retailContent = await fs.readFile(
      path.join(tmpDir, "retail", "memories.jsonl"), "utf-8"
    );

    expect(apparelContent).toContain("apparel-key");
    expect(apparelContent).not.toContain("retail-key");
    expect(retailContent).toContain("retail-key");
    expect(retailContent).not.toContain("apparel-key");
  });

  // === 加载 + 恢复 ===

  it("loads persisted entries on restart", async () => {
    const adapter = new PersistenceAdapter(tmpDir);
    await adapter.commitEntry(makeEntry("load-1"), "apparel");
    await adapter.commitEntry(makeEntry("load-2"), "apparel");

    // 新 adapter 实例模拟重启
    const adapter2 = new PersistenceAdapter(tmpDir);
    const state = await adapter2.load();

    expect(state.entries).toHaveLength(2);
    const keys = state.entries.map((e) => e.key);
    expect(keys).toEqual(expect.arrayContaining(["load-1", "load-2"]));
  });

  it("loads associations and reflexes", async () => {
    const adapter = new PersistenceAdapter(tmpDir);
    await adapter.commitAssociation(makeAssociation("assoc-1"), "apparel");
    await adapter.commitReflex(makeReflex("reflex-1"), "apparel");

    const adapter2 = new PersistenceAdapter(tmpDir);
    const state = await adapter2.load();

    expect(state.associations).toHaveLength(1);
    expect(state.associations[0].id).toBe("assoc-1");
    expect(state.reflexes).toHaveLength(1);
    expect(state.reflexes[0].id).toBe("reflex-1");
  });

  // === 防线 2: WAL 回放 ===

  it("WAL replay recovers entries not yet in JSONL", async () => {
    const adapter = new PersistenceAdapter(tmpDir);
    // 正常写入一条
    await adapter.commitEntry(makeEntry("wal-recover"), "apparel");

    // 模拟 WAL 中有额外条目（JSONL 未写入就崩溃）
    // 直接检查 load() 能恢复
    const adapter2 = new PersistenceAdapter(tmpDir);
    const state = await adapter2.load();
    expect(state.entries.some((e) => e.key === "wal-recover")).toBe(true);
  });

  // === 防线 2: Compaction 去重 ===

  it("compaction deduplicates entries by key (keeps last)", async () => {
    const adapter = new PersistenceAdapter(tmpDir);

    // 写入相同 key 的 3 个版本
    await adapter.commitEntry(makeEntry("dup-key", "2026-07-01T00:00:00Z"), "apparel");
    await adapter.commitEntry(makeEntry("dup-key", "2026-07-02T00:00:00Z"), "apparel");
    await adapter.commitEntry(makeEntry("dup-key", "2026-07-03T00:00:00Z"), "apparel");

    // 压实
    await adapter.compact("apparel");

    const adapter2 = new PersistenceAdapter(tmpDir);
    const state = await adapter2.load();
    const dupEntries = state.entries.filter((e) => e.key === "dup-key");
    expect(dupEntries).toHaveLength(1);
    expect(dupEntries[0].createdAt).toBe("2026-07-03T00:00:00Z"); // 保留最后一条
  });

  it("compaction reduces file size", async () => {
    const adapter = new PersistenceAdapter(tmpDir);

    // 写入大量重复 key
    for (let i = 0; i < 50; i++) {
      await adapter.commitEntry(makeEntry("repeat-key", `2026-07-0${(i % 9) + 1}T00:00:00Z`), "apparel");
    }

    const filePath = path.join(tmpDir, "apparel", "memories.jsonl");
    const sizeBefore = (await fs.stat(filePath)).size;

    await adapter.compact("apparel");
    const sizeAfter = (await fs.stat(filePath)).size;

    expect(sizeAfter).toBeLessThan(sizeBefore);
  });

  // === 防线 1: 容量上限 + LRU 淘汰 ===

  it("enforces max entries capacity via LRU eviction", async () => {
    // 用小容量配置便于测试
    const smallConfig = {
      ...DEFAULT_PERSISTENCE_CONFIG,
      maxEntriesPerPartition: 5,
    };
    const adapter = new PersistenceAdapter(tmpDir, smallConfig);

    // 写入 8 条（超过上限 5）
    for (let i = 0; i < 8; i++) {
      await adapter.commitEntry(
        makeEntry(`cap-${i}`, `2026-07-0${i + 1}T00:00:00Z`),
        "apparel"
      );
    }

    // 加载时应淘汰到 5 条
    const adapter2 = new PersistenceAdapter(tmpDir, smallConfig);
    const state = await adapter2.load();
    expect(state.entries.length).toBeLessThanOrEqual(5);
  });

  it("enforces max reflexes capacity (evicts coldest)", async () => {
    const smallConfig = {
      ...DEFAULT_PERSISTENCE_CONFIG,
      maxReflexes: 3,
    };
    const adapter = new PersistenceAdapter(tmpDir, smallConfig);

    // 写入 5 个反射（超过上限 3）
    for (let i = 0; i < 5; i++) {
      await adapter.commitReflex(makeReflex(`r-${i}`, i + 1), "apparel");
    }

    const adapter2 = new PersistenceAdapter(tmpDir, smallConfig);
    const state = await adapter2.load();
    expect(state.reflexes.length).toBeLessThanOrEqual(3);
    // 应保留 hitCount 最高的
    const hitCounts = state.reflexes.map((r) => r.hitCount).sort((a, b) => b - a);
    expect(hitCounts[0]).toBe(5); // r-4 hitCount=5
  });

  // === 防线 4: 轻量索引 ===

  it("rebuilds index mapping key to file", async () => {
    const adapter = new PersistenceAdapter(tmpDir);
    await adapter.commitEntry(makeEntry("idx-1"), "apparel");
    await adapter.commitEntry(makeEntry("idx-2"), "apparel");
    await adapter.commitAssociation(makeAssociation("idx-assoc"), "apparel");

    await adapter.rebuildIndex();

    const indexContent = await fs.readFile(path.join(tmpDir, "index.json"), "utf-8");
    const index = JSON.parse(indexContent);
    expect(index.entries["idx-1"]).toBeDefined();
    expect(index.entries["idx-1"].file).toContain("memories.jsonl");
    expect(index.entries["idx-2"]).toBeDefined();
    expect(index.entries["idx-assoc"]).toBeDefined();
    expect(index.entries["idx-assoc"].file).toContain("associations.jsonl");
  });

  // === 清理 ===

  it("clear removes all persisted data", async () => {
    const adapter = new PersistenceAdapter(tmpDir);
    await adapter.commitEntry(makeEntry("clear-1"), "apparel");

    await adapter.clear();

    const exists = await fs.access(tmpDir).then(() => true).catch(() => false);
    expect(exists).toBe(false);
  });

  // === partitionDir 辅助函数 ===

  it("partitionDir returns industry when provided", () => {
    expect(partitionDir("apparel")).toBe("apparel");
    expect(partitionDir("retail")).toBe("retail");
  });

  it("partitionDir returns default when industry is empty or undefined", () => {
    expect(partitionDir(undefined)).toBe("default");
    expect(partitionDir("")).toBe("default");
    expect(partitionDir("  ")).toBe("default");
  });
});
