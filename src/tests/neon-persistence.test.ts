/**
 * neon-persistence.test.ts — Neon PostgreSQL 持久化适配器测试
 *
 * 两层测试：
 *   1. 单元测试（始终运行）— 工厂函数、接口合规性、配置处理
 *   2. 集成测试（需要 DATABASE_URL）— 实际读写 Neon 数据库
 *
 * 集成测试通过 `describe.skipIf` 在无 DATABASE_URL 时自动跳过。
 * 运行集成测试需要 .env.local 中设置 DATABASE_URL 和 NEON_PERSISTENCE=1。
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  NeonPersistenceAdapter,
  createNeonPersistenceFromEnv,
  createPersistenceFromEnv,
  type PersistenceBackend,
} from "../intelligence";
import type { MemoryEntry, MemoryAssociation, ReflexPathway } from "../intelligence";

const CONNECTION_STRING = process.env.DATABASE_URL;
const HAS_NEON = Boolean(CONNECTION_STRING);

function makeEntry(key: string, createdAt: string = "2026-07-11T12:00:00Z"): MemoryEntry {
  return {
    id: `neon-test-id-${key}`,
    key,
    kind: "synthesis",
    value: `neon value for ${key}`,
    createdAt,
    tags: ["neon-test"],
  };
}

function makeAssociation(id: string, weight: number = 0.5): MemoryAssociation {
  return {
    id: `neon-test-assoc-${id}`,
    fromKey: `from-${id}`,
    toKey: `to-${id}`,
    relation: "semantic",
    weight,
    createdAt: "2026-07-11T12:00:00Z",
    lastReinforcedAt: "2026-07-11T12:00:00Z",
    coOccurrenceCount: 1,
  };
}

function makeReflex(id: string, hitCount: number = 1): ReflexPathway {
  return {
    id: `neon-test-reflex-${id}`,
    trigger: `trigger-${id}`,
    action: `action-${id}`,
    confidence: 0.5,
    hitCount,
    createdAt: "2026-07-11T12:00:00Z",
    lastTriggeredAt: "2026-07-11T12:00:00Z",
    tags: ["neon-test"],
    industry: "apparel",
  };
}

// === 单元测试（始终运行，不需要数据库连接） ===

describe("NeonPersistenceAdapter (unit)", () => {
  it("NeonPersistenceAdapter implements PersistenceBackend interface", () => {
    const adapter = new NeonPersistenceAdapter({
      connectionString: "postgresql://fake:fake@fake.neon.tech/fakedb?sslmode=require",
    });
    // 结构性检查 — 确保所有 PersistenceBackend 方法都存在
    expect(typeof adapter.ensureDirs).toBe("function");
    expect(typeof adapter.load).toBe("function");
    expect(typeof adapter.commitEntry).toBe("function");
    expect(typeof adapter.commitAssociation).toBe("function");
    expect(typeof adapter.commitReflex).toBe("function");
    expect(typeof adapter.compact).toBe("function");
    expect(typeof adapter.compactAll).toBe("function");
    expect(typeof adapter.rebuildIndex).toBe("function");
    expect(typeof adapter.clear).toBe("function");
  });

  it("createNeonPersistenceFromEnv returns null when DATABASE_URL is unset", () => {
    const saved = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    const result = createNeonPersistenceFromEnv();
    expect(result).toBeNull();
    process.env.DATABASE_URL = saved;
  });

  it("createNeonPersistenceFromEnv returns adapter when DATABASE_URL is set", () => {
    const saved = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "postgresql://fake:fake@fake.neon.tech/fakedb?sslmode=require";
    const result = createNeonPersistenceFromEnv();
    expect(result).toBeInstanceOf(NeonPersistenceAdapter);
    process.env.DATABASE_URL = saved;
  });

  it("createPersistenceFromEnv returns null when NEON_PERSISTENCE is not 1", () => {
    const savedNeon = process.env.NEON_PERSISTENCE;
    const savedDb = process.env.DATABASE_URL;
    process.env.NEON_PERSISTENCE = "0";
    process.env.DATABASE_URL = "postgresql://fake:fake@fake.neon.tech/fakedb?sslmode=require";
    const result = createPersistenceFromEnv();
    expect(result).toBeNull();
    process.env.NEON_PERSISTENCE = savedNeon;
    process.env.DATABASE_URL = savedDb;
  });

  it("createPersistenceFromEnv returns Neon adapter when NEON_PERSISTENCE=1 and DATABASE_URL set", () => {
    const savedNeon = process.env.NEON_PERSISTENCE;
    const savedDb = process.env.DATABASE_URL;
    process.env.NEON_PERSISTENCE = "1";
    process.env.DATABASE_URL = "postgresql://fake:fake@fake.neon.tech/fakedb?sslmode=require";
    const result = createPersistenceFromEnv();
    expect(result).toBeInstanceOf(NeonPersistenceAdapter);
    process.env.NEON_PERSISTENCE = savedNeon;
    process.env.DATABASE_URL = savedDb;
  });

  it("createPersistenceFromEnv returns null when NEON_PERSISTENCE=1 but DATABASE_URL unset", () => {
    const savedNeon = process.env.NEON_PERSISTENCE;
    const savedDb = process.env.DATABASE_URL;
    process.env.NEON_PERSISTENCE = "1";
    delete process.env.DATABASE_URL;
    const result = createPersistenceFromEnv();
    expect(result).toBeNull();
    process.env.NEON_PERSISTENCE = savedNeon;
    process.env.DATABASE_URL = savedDb;
  });

  it("compact/compactAll/rebuildIndex are no-ops (PostgreSQL self-manages)", async () => {
    const adapter = new NeonPersistenceAdapter({
      connectionString: "postgresql://fake:fake@fake.neon.tech/fakedb?sslmode=require",
    });
    // 这些方法应该是 no-op，不抛错
    await expect(adapter.compact("apparel")).resolves.toBeUndefined();
    await expect(adapter.compactAll()).resolves.toBeUndefined();
    await expect(adapter.rebuildIndex()).resolves.toBeUndefined();
  });
});

// === 集成测试（需要 DATABASE_URL，实际读写 Neon 数据库） ===

describe.skipIf(!HAS_NEON)("NeonPersistenceAdapter (integration)", () => {
  let adapter: NeonPersistenceAdapter;

  beforeEach(async () => {
    adapter = new NeonPersistenceAdapter({ connectionString: CONNECTION_STRING! });
    await adapter.clear();
  });

  afterEach(async () => {
    await adapter.clear().catch(() => {});
  });

  it("ensureSchema is idempotent — calling twice does not throw", async () => {
    await adapter.ensureSchema();
    await adapter.ensureSchema();
  });

  it("ensureDirs delegates to ensureSchema", async () => {
    await adapter.ensureDirs("apparel");
    await adapter.ensureDirs();
  });

  it("commits and loads a MemoryEntry", async () => {
    const entry = makeEntry("load-test");
    await adapter.commitEntry(entry, "apparel");

    const state = await adapter.load();
    const found = state.entries.find((e) => e.id === entry.id);
    expect(found).toBeDefined();
    expect(found?.key).toBe(entry.key);
    expect(found?.value).toBe(entry.value);
    expect(found?.kind).toBe(entry.kind);
  });

  it("UPSERT — committing same id overwrites previous value", async () => {
    const entry1 = makeEntry("upsert-test");
    entry1.value = "original value";
    await adapter.commitEntry(entry1, "apparel");

    const entry2 = { ...entry1, value: "updated value" };
    await adapter.commitEntry(entry2, "apparel");

    const state = await adapter.load();
    const found = state.entries.find((e) => e.id === entry1.id);
    expect(found).toBeDefined();
    expect(found?.value).toBe("updated value");
    expect(state.entries.filter((e) => e.id === entry1.id)).toHaveLength(1);
  });

  it("commits and loads a MemoryAssociation", async () => {
    const assoc = makeAssociation("assoc-1");
    await adapter.commitAssociation(assoc, "apparel");

    const state = await adapter.load();
    const found = state.associations.find((a) => a.id === assoc.id);
    expect(found).toBeDefined();
    expect(found?.fromKey).toBe(assoc.fromKey);
    expect(found?.toKey).toBe(assoc.toKey);
    expect(found?.relation).toBe(assoc.relation);
    expect(found?.weight).toBe(assoc.weight);
  });

  it("commits and loads a ReflexPathway", async () => {
    const reflex = makeReflex("reflex-1");
    await adapter.commitReflex(reflex, "apparel");

    const state = await adapter.load();
    const found = state.reflexes.find((r) => r.id === reflex.id);
    expect(found).toBeDefined();
    expect(found?.trigger).toBe(reflex.trigger);
    expect(found?.action).toBe(reflex.action);
    expect(found?.confidence).toBe(reflex.confidence);
    expect(found?.hitCount).toBe(reflex.hitCount);
    expect(found?.industry).toBe(reflex.industry);
  });

  it("loads all three data types together", async () => {
    await adapter.commitEntry(makeEntry("multi-entry"), "apparel");
    await adapter.commitAssociation(makeAssociation("multi-assoc"), "apparel");
    await adapter.commitReflex(makeReflex("multi-reflex"), "apparel");

    const state = await adapter.load();
    expect(state.entries.length).toBeGreaterThanOrEqual(1);
    expect(state.associations.length).toBeGreaterThanOrEqual(1);
    expect(state.reflexes.length).toBeGreaterThanOrEqual(1);
  });

  it("clear removes all data from all three tables", async () => {
    await adapter.commitEntry(makeEntry("clear-test"), "apparel");
    await adapter.commitAssociation(makeAssociation("clear-assoc"), "apparel");
    await adapter.commitReflex(makeReflex("clear-reflex"), "apparel");

    await adapter.clear();

    const state = await adapter.load();
    expect(state.entries).toHaveLength(0);
    expect(state.associations).toHaveLength(0);
    expect(state.reflexes).toHaveLength(0);
  });

  it("commits entry with null sourceTaskId and empty tags", async () => {
    const entry: MemoryEntry = {
      id: "neon-test-null-fields",
      key: "null-fields",
      kind: "fact",
      value: "no tags, no source",
      createdAt: "2026-07-11T12:00:00Z",
    };
    await adapter.commitEntry(entry, "default");

    const state = await adapter.load();
    const found = state.entries.find((e) => e.id === entry.id);
    expect(found).toBeDefined();
    expect(found?.value).toBe(entry.value);
  });

  it("commits reflex without lastTriggeredAt", async () => {
    const reflex: ReflexPathway = {
      id: "neon-test-no-last-trigger",
      trigger: "no-last-trigger",
      action: "some-action",
      confidence: 0.7,
      hitCount: 2,
      createdAt: "2026-07-11T12:00:00Z",
      tags: [],
      industry: "default",
    };
    await adapter.commitReflex(reflex, "default");

    const state = await adapter.load();
    const found = state.reflexes.find((r) => r.id === reflex.id);
    expect(found).toBeDefined();
    expect(found?.trigger).toBe(reflex.trigger);
  });
});
