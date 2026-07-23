// ===== Postgres optimization rule categories =====

export type PostgresRuleCategory =
  | "query"
  | "connection"
  | "security"
  | "schema"
  | "lock"
  | "data"
  | "monitor"
  | "advanced";

// ===== Postgres optimization rule descriptor =====

export interface PostgresOptimizationRule {
  id: string;
  category: PostgresRuleCategory;
  impact: "critical" | "high" | "medium" | "low";
  title: string;
  description: string;
  incorrectExample?: string;
  correctExample?: string;
}

// ===== Rule collection =====

export const POSTGRES_OPTIMIZATION_RULES: PostgresOptimizationRule[] = [
  // ----- query: write efficient queries -----
  {
    id: "query-use-indexes",
    category: "query",
    impact: "critical",
    title: "Ensure queries use indexes",
    description:
      "Filter and join columns should be backed by indexes; verify with EXPLAIN ANALYZE that a Seq Scan is not used on large tables.",
    incorrectExample: "SELECT * FROM orders WHERE customer_id = 42; -- no index on customer_id",
    correctExample:
      "CREATE INDEX idx_orders_customer_id ON orders(customer_id);\nSELECT * FROM orders WHERE customer_id = 42;",
  },
  {
    id: "query-avoid-select-star",
    category: "query",
    impact: "high",
    title: "Avoid SELECT * in production queries",
    description:
      "Select only the columns you need to reduce I/O, memory, and network transfer.",
    incorrectExample: "SELECT * FROM users;",
    correctExample: "SELECT id, email, display_name FROM users;",
  },
  {
    id: "query-explain-analyze",
    category: "query",
    impact: "high",
    title: "Use EXPLAIN ANALYZE to validate plans",
    description:
      "Inspect the real execution plan, not just the estimated one, to catch bad scans and bad row estimates.",
    correctExample: "EXPLAIN ANALYZE SELECT id FROM orders WHERE status = 'shipped';",
  },
  {
    id: "query-avoid-n-plus-1",
    category: "query",
    impact: "critical",
    title: "Avoid N+1 query patterns",
    description:
      "Use a single JOIN or a batched IN (...) query instead of issuing one query per row.",
    incorrectExample:
      "-- in a loop\nSELECT * FROM comments WHERE post_id = $1;",
    correctExample:
      "SELECT p.*, c.*\nFROM posts p\nLEFT JOIN comments c ON c.post_id = p.id\nWHERE p.author_id = $1;",
  },
  {
    id: "query-use-limit",
    category: "query",
    impact: "medium",
    title: "Add LIMIT to potentially large result sets",
    description:
      "Always bound result sets to protect memory and ensure predictable latency.",
    incorrectExample: "SELECT * FROM events ORDER BY created_at DESC;",
    correctExample: "SELECT * FROM events ORDER BY created_at DESC LIMIT 100;",
  },
  {
    id: "query-avoid-subqueries",
    category: "query",
    impact: "medium",
    title: "Prefer joins over correlated subqueries",
    description:
      "Correlated subqueries often execute per-row; rewrite as joins or CTEs for better planner choices.",
    incorrectExample:
      "SELECT u.id,\n  (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) AS n\nFROM users u;",
    correctExample:
      "SELECT u.id, COUNT(o.id) AS n\nFROM users u\nLEFT JOIN orders o ON o.user_id = u.id\nGROUP BY u.id;",
  },

  // ----- connection: manage connections efficiently -----
  {
    id: "connection-pool-size",
    category: "connection",
    impact: "critical",
    title: "Right-size the connection pool",
    description:
      "Pool size should be tuned to CPU cores and workload; too many connections degrade throughput.",
    correctExample:
      "-- Supabase default pool: 15-30 conns per service instance;\n-- formula: pool_size = ((core_count * 2) + effective_spindle_count)",
  },
  {
    id: "connection-pgbouncer",
    category: "connection",
    impact: "high",
    title: "Use PgBouncer for transaction pooling",
    description:
      "PgBouncer multiplexes many app connections over few server connections, critical for serverless.",
    correctExample:
      "# supavisor / pgbouncer\npool_mode = transaction\nmax_client_conn = 1000",
  },
  {
    id: "connection-avoid-leaks",
    category: "connection",
    impact: "critical",
    title: "Always release connections",
    description:
      "Use a finally block or pooled client.release() to guarantee connections return to the pool.",
    incorrectExample:
      "const client = await pool.connect();\nconst rows = await client.query('SELECT 1');\n// forgot client.release()",
    correctExample:
      "const client = await pool.connect();\ntry {\n  const rows = await client.query('SELECT 1');\n} finally {\n  client.release();\n}",
  },
  {
    id: "connection-statement-timeout",
    category: "connection",
    impact: "high",
    title: "Set a statement timeout",
    description:
      "Prevent runaway queries from holding resources; set statement_timeout per role or session.",
    correctExample: "ALTER ROLE app_user SET statement_timeout = '5s';",
  },

  // ----- security: protect data and access -----
  {
    id: "security-rls-policies",
    category: "security",
    impact: "critical",
    title: "Enable Row Level Security on user tables",
    description:
      "RLS ensures tenants can only read or modify their own rows, even when the client holds the key.",
    correctExample:
      "ALTER TABLE posts ENABLE ROW LEVEL SECURITY;\nCREATE POLICY \"own posts\" ON posts\n  FOR ALL USING (author_id = auth.uid());",
  },
  {
    id: "security-least-privilege",
    category: "security",
    impact: "high",
    title: "Grant least privilege to app roles",
    description:
      "Application roles should only have the privileges they need; avoid using the superuser or postgres role.",
    incorrectExample: "GRANT ALL ON ALL TABLES IN SCHEMA public TO anon;",
    correctExample: "GRANT SELECT, INSERT, UPDATE ON posts TO app_user;",
  },
  {
    id: "security-parameterized-queries",
    category: "security",
    impact: "critical",
    title: "Always use parameterized queries",
    description:
      "Never concatenate user input into SQL; use placeholders to eliminate SQL injection risk.",
    incorrectExample: "pool.query(`SELECT * FROM users WHERE email = '${email}'`);",
    correctExample: "pool.query('SELECT * FROM users WHERE email = $1', [email]);",
  },
  {
    id: "security-avoid-sql-injection",
    category: "security",
    impact: "critical",
    title: "Do not build identifiers from user input",
    description:
      "Use allow-lists for dynamic identifiers (table/column names); quote_ident is not enough alone.",
    incorrectExample: "pool.query(`SELECT * FROM ${tableName}`);",
    correctExample:
      "const ALLOWED = new Set(['posts', 'comments']);\nif (!ALLOWED.has(tableName)) throw new Error('bad table');\npool.query(`SELECT * FROM ${tableName}`);",
  },

  // ----- schema: design scalable schemas -----
  {
    id: "schema-correct-data-types",
    category: "schema",
    impact: "high",
    title: "Choose the smallest correct data type",
    description:
      "Use bigint vs int, timestamptz vs timestamp, numeric for money, and text over varchar(n) unless a constraint is required.",
    incorrectExample: "CREATE TABLE accounts (balance FLOAT, created_at TIMESTAMP);",
    correctExample: "CREATE TABLE accounts (balance NUMERIC(12,2), created_at TIMESTAMPTZ);",
  },
  {
    id: "schema-foreign-key-constraints",
    category: "schema",
    impact: "high",
    title: "Declare foreign keys with ON DELETE behavior",
    description:
      "Foreign keys keep referential integrity; declare ON DELETE CASCADE / SET NULL to avoid orphans.",
    correctExample:
      "CREATE TABLE comments (\n  post_id BIGINT REFERENCES posts(id) ON DELETE CASCADE\n);",
  },
  {
    id: "schema-composite-indexes",
    category: "schema",
    impact: "high",
    title: "Use composite indexes for multi-column filters",
    description:
      "Order index columns by equality then range; cover frequently filtered columns together.",
    incorrectExample:
      "CREATE INDEX idx_a ON orders(user_id);\nCREATE INDEX idx_b ON orders(status);",
    correctExample: "CREATE INDEX idx_orders_user_status ON orders(user_id, status);",
  },
  {
    id: "schema-partitioning",
    category: "schema",
    impact: "medium",
    title: "Partition large append-only tables",
    description:
      "Range-partition time-series tables by created_at to keep indexes small and enable fast drops.",
    correctExample:
      "CREATE TABLE events (id BIGINT, created_at TIMESTAMPTZ)\nPARTITION BY RANGE (created_at);",
  },

  // ----- lock: minimize lock contention -----
  {
    id: "lock-avoid-long-transactions",
    category: "lock",
    impact: "high",
    title: "Keep transactions short",
    description:
      "Long transactions hold locks and bloat the table; commit as soon as the unit of work is done.",
    incorrectExample:
      "BEGIN;\n-- call external API\n-- then UPDATE rows\nCOMMIT;",
    correctExample:
      "BEGIN;\nUPDATE rows SET ...;\nCOMMIT;\n-- call external API after commit",
  },
  {
    id: "lock-advisory-locks",
    category: "lock",
    impact: "medium",
    title: "Use advisory locks for coarse-grained coordination",
    description:
      "Use pg_advisory_lock for application-level mutexes instead of locking entire tables.",
    correctExample: "SELECT pg_advisory_lock(12345);",
  },
  {
    id: "lock-optimistic-concurrency",
    category: "lock",
    impact: "medium",
    title: "Prefer optimistic concurrency for low-contention updates",
    description:
      "Use a version column and conditional UPDATE to avoid holding write locks while waiting on user input.",
    correctExample:
      "UPDATE posts SET body = $1, version = version + 1\nWHERE id = $2 AND version = $3;",
  },

  // ----- data: maintain healthy data and stats -----
  {
    id: "data-archive-strategy",
    category: "data",
    impact: "medium",
    title: "Archive or partition old data",
    description:
      "Move cold rows out of hot tables to keep working sets in memory and indexes tight.",
    correctExample:
      "-- detach and move old partition to archive table\nALTER TABLE events DETACH PARTITION events_2023;",
  },
  {
    id: "data-vacuum-analyze",
    category: "data",
    impact: "high",
    title: "Run VACUUM and ANALYZE regularly",
    description:
      "Reclaim dead tuples and refresh planner statistics so the optimizer picks good plans.",
    correctExample: "VACUUM (ANALYZE) posts;",
  },
  {
    id: "data-avoid-large-delete",
    category: "data",
    impact: "high",
    title: "Avoid large single-statement DELETEs",
    description:
      "Big DELETEs bloat the table and hold locks; delete in batches or drop/truncate a partition instead.",
    incorrectExample: "DELETE FROM events WHERE created_at < NOW() - INTERVAL '1 year';",
    correctExample:
      "DELETE FROM events\nWHERE id IN (\n  SELECT id FROM events WHERE created_at < NOW() - INTERVAL '1 year' LIMIT 10000\n);",
  },

  // ----- monitor: observe and alert -----
  {
    id: "monitor-slow-query-log",
    category: "monitor",
    impact: "high",
    title: "Enable slow query logging",
    description:
      "Set log_min_duration_statement to capture queries slower than a threshold for review.",
    correctExample: "ALTER SYSTEM SET log_min_duration_statement = '500ms';",
  },
  {
    id: "monitor-pg-stat-statements",
    category: "monitor",
    impact: "high",
    title: "Use pg_stat_statements to find hot queries",
    description:
      "Track per-query call counts, total time, and IO to identify optimization targets.",
    correctExample:
      "SELECT query, calls, total_exec_time, mean_exec_time\nFROM pg_stat_statements\nORDER BY total_exec_time DESC\nLIMIT 10;",
  },
  {
    id: "monitor-connection-count",
    category: "monitor",
    impact: "medium",
    title: "Monitor connection count against max_connections",
    description:
      "Alert when active connections approach the limit to avoid refusing new clients.",
    correctExample:
      "SELECT count(*) FROM pg_stat_activity;",
  },

  // ----- advanced: advanced Postgres features -----
  {
    id: "advanced-materialized-views",
    category: "advanced",
    impact: "medium",
    title: "Use materialized views for expensive aggregates",
    description:
      "Precompute heavy aggregations and refresh them on a schedule to speed up dashboards.",
    correctExample:
      "CREATE MATERIALIZED VIEW daily_sales AS\nSELECT date_trunc('day', created_at) AS d, SUM(amount)\nFROM orders GROUP BY 1;\nREFRESH MATERIALIZED VIEW CONCURRENTLY daily_sales;",
  },
  {
    id: "advanced-cte-optimization",
    category: "advanced",
    impact: "medium",
    title: "Use MATERIALIZED / NOT MATERIALIZED CTEs deliberately",
    description:
      "Postgres 12+ inlines CTEs by default; force materialization only when it improves plans.",
    correctExample:
      "WITH heavy AS MATERIALIZED (\n  SELECT ... FROM big_table WHERE ...\n)\nSELECT * FROM heavy;",
  },
  {
    id: "advanced-window-functions",
    category: "advanced",
    impact: "medium",
    title: "Use window functions instead of self-joins",
    description:
      "Window functions compute ranks, running totals, and lag/lead in a single pass.",
    incorrectExample:
      "SELECT u.*,\n  (SELECT MAX(created_at) FROM events e WHERE e.user_id = u.id)\nFROM users u;",
    correctExample:
      "SELECT user_id, created_at,\n  ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC) AS rn\nFROM events;",
  },
  {
    id: "advanced-jsonb-gin",
    category: "advanced",
    impact: "medium",
    title: "Index JSONB with GIN for key lookups",
    description:
      "A GIN index on jsonb columns accelerates containment and key-existence queries.",
    correctExample:
      "CREATE INDEX idx_meta_gin ON events USING GIN (metadata);\nSELECT * FROM events WHERE metadata @> '{\"type\":\"click\"}';",
  },
];

// ===== Query helpers =====

export function getPostgresRulesByCategory(category: PostgresRuleCategory): PostgresOptimizationRule[] {
  return POSTGRES_OPTIMIZATION_RULES.filter((rule) => rule.category === category);
}

// ===== Audit function =====

export function auditSqlQuery(sql: string): { ruleId: string; suggestion: string }[] {
  const results: { ruleId: string; suggestion: string }[] = [];
  const normalized = sql.trim();

  if (/\bSELECT\s+\*/i.test(normalized)) {
    results.push({
      ruleId: "query-avoid-select-star",
      suggestion: "Avoid SELECT * — list only the columns you need.",
    });
  }
  if (/`\$\{[^}]+\}`/.test(sql) || /'\s*\+\s*\w+/.test(sql)) {
    results.push({
      ruleId: "security-parameterized-queries",
      suggestion: "Possible string-interpolated SQL — use parameterized queries with placeholders.",
    });
  }
  if (/FROM\s+\$\{[^}]+\}/.test(sql)) {
    results.push({
      ruleId: "security-avoid-sql-injection",
      suggestion: "Dynamic table name from user input — use an allow-list.",
    });
  }
  if (/SELECT.*\bFROM\b.*\bWHERE\b.*=\s*.*\n.*SELECT.*\bFROM\b/i.test(normalized) === false && /SELECT\s+\w+\s*,\s*\(\s*SELECT/i.test(normalized)) {
    results.push({
      ruleId: "query-avoid-n-plus-1",
      suggestion: "Correlated subquery detected — consider a JOIN or batched IN (...).",
    });
  }
  if (/DELETE\s+FROM\s+\w+\s+WHERE/i.test(normalized) && !/LIMIT/i.test(normalized)) {
    results.push({
      ruleId: "data-avoid-large-delete",
      suggestion: "Unbounded DELETE detected — delete in batches or drop a partition.",
    });
  }
  if (/\bBEGIN\b[\s\S]*?(?:http|fetch|axios|request)/i.test(normalized)) {
    results.push({
      ruleId: "lock-avoid-long-transactions",
      suggestion: "External I/O detected inside a transaction — move it after COMMIT.",
    });
  }
  return results;
}
