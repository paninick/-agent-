/**
 * scripts/init-neon-schema.js — Neon 数据库 schema 初始化
 * 运行: node scripts/init-neon-schema.js
 */
import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("ERROR: DATABASE_URL env var not set");
  process.exit(1);
}

const sql = neon(databaseUrl);

async function main() {
  try {
    const r = await sql`SELECT current_database() AS db, current_user AS user, now() AS time`;
    console.log("CONN OK:", JSON.stringify(r[0]));

    await sql`CREATE TABLE IF NOT EXISTS memory_entries (
      id TEXT PRIMARY KEY,
      key TEXT NOT NULL,
      kind TEXT NOT NULL,
      value TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      tags TEXT[] DEFAULT '{}',
      industry TEXT DEFAULT NULL
    )`;

    await sql`CREATE TABLE IF NOT EXISTS memory_associations (
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
    )`;

    await sql`CREATE TABLE IF NOT EXISTS reflex_pathways (
      id TEXT PRIMARY KEY,
      trigger TEXT NOT NULL,
      action TEXT NOT NULL,
      confidence DOUBLE PRECISION NOT NULL DEFAULT 0.5,
      hit_count INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL,
      last_triggered_at TIMESTAMPTZ,
      tags TEXT[] DEFAULT '{}',
      industry TEXT DEFAULT NULL
    )`;

    await sql`CREATE INDEX IF NOT EXISTS idx_entries_key ON memory_entries(key)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_entries_industry ON memory_entries(industry)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_assoc_from ON memory_associations(from_key)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_assoc_to ON memory_associations(to_key)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_reflex_trigger ON reflex_pathways(trigger)`;

    console.log("SCHEMA CREATED");

    const tables = await sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`;
    console.log("TABLES:", tables.map((t) => t.tablename).join(", "));

    const indexes = await sql`SELECT indexname FROM pg_indexes WHERE schemaname = 'public' ORDER BY indexname`;
    console.log("INDEXES:", indexes.map((i) => i.indexname).join(", "));
  } catch (e) {
    console.error("ERROR:", e.message);
    process.exit(1);
  }
}

main();
