# Frontend Design Specification for Google AI Studio

> **INSTRUCTIONS FOR AI STUDIO**: You are rebuilding the frontend of a production app.
> The backend is fully implemented and running at `http://127.0.0.1:8787`.
> Use this document as the single source of truth. Generate **complete, runnable React code**
> (not pseudocode, not partial snippets). Output each file with its filename as a header.
> The code must work with: React 19 + Vite + lucide-react, dark theme, no extra dependencies.
>
> **What to generate** (in this order):
> 1. `index.html` - HTML entry point
> 2. `src/main.tsx` - React root + App shell with tab navigation
> 3. `src/IntelligencePanel.tsx` - Intelligence Swarm tab (POST /api/intelligence/swarm)
> 4. `src/LaunchDeskPanel.tsx` - Launch Desk tab (SSE streaming via POST /api/launch-plan)
> 5. `src/runHistoryStore.ts` - localStorage persistence for completed Launch Desk runs
> 6. `src/styles.css` - Complete stylesheet using the design tokens below
> 7. `vite.config.ts` - Vite config with `/api` proxy to `http://127.0.0.1:8787`
> 8. `package.json` - Dependencies
>
> Read the entire document before writing any code. Every type, API endpoint, color value,
> and layout detail below is intentional and must be followed exactly.

---

> This document provides the complete API contract, type system, UI design, and implementation guide
> for rebuilding the frontend of the **Automation Intelligence Swarm Engine** (自动化情报蜂群系统).
> The backend is fully implemented and committed. The frontend needs to be rebuilt from scratch.

---

## 1. Project Overview

### What the system does

An **apparel industry supply chain intelligence engine** that:
1. Collects real-time data from 9 public data sources (World Bank, SEC EDGAR, Eurostat, ECB, BLS, FRED, US Census, Open Supply Hub, UN Comtrade)
2. Runs a 6-role agent swarm pipeline: Scout → Collector → Verifier → Analyst → Synthesizer → Memory
3. Produces a synthesized intelligence brief with confidence score, evidence list, and follow-up tasks
4. Optionally estimates supply chain health (deviation, bottleneck, pressure level)

### Business goal

> A small apparel trading company boss sees 3 decision options in 30 seconds.

### Two UI domains

| Tab | API Pattern | Description |
|-----|-------------|-------------|
| **Launch Desk** | SSE streaming (POST → text/event-stream) | Release plan generation with approval gate |
| **Intelligence Swarm** | Request/response (POST → JSON) | Supply chain intelligence collection + swarm analysis |

---

## 2. Design System

### Color tokens (dark theme)

```css
:root {
  color-scheme: dark;
  font-family: "Aptos", "Segoe UI", sans-serif;
  background: #0d1110;
  color: #eef2e8;

  /* Panels */
  --panel: #151a17;
  --panel-strong: #1d241f;

  /* Borders */
  --line: #334038;

  /* Text */
  --ink-muted: #aab7ac;

  /* Status colors */
  --mint: #8ef0bf;    /* success / completed / verified */
  --cyan: #79d9ee;    /* info / running / streaming */
  --amber: #ffc35a;   /* warning / concerns / needs_context */
  --red: #ff7a6f;     /* error / failed / blocked / rejected */
  --steel: #9fb6c7;   /* neutral / metadata */
}
```

### Typography

- Base font: `"Aptos", "Segoe UI", sans-serif`
- Panel titles: `0.72rem`, `font-weight: 800`, `letter-spacing: 0.14em`, `text-transform: uppercase`, color: `--amber`
- Metrics values: `1.4rem`, `font-weight: 800`, `font-variant-numeric: tabular-nums`, color: `--cyan`
- Code/source IDs: `monospace`, color: `--cyan`

### Status color mapping

| Status | Color | CSS Variable |
|--------|-------|-------------|
| `completed` | Green | `--mint` |
| `done_with_concerns` | Amber | `--amber` |
| `failed` / `blocked` | Red | `--red` |
| `needs_context` | Amber | `--amber` |
| `running` | Cyan | `--cyan` |
| `verified` | Green | `--mint` |
| `degraded` | Amber | `--amber` |
| `rejected` | Red | `--red` |
| `matched` | Green | `--mint` |
| `warning` | Amber | `--amber` |
| `mismatch` | Red | `--red` |

### Source tier badges

| Tier | Background | Text Color | Meaning |
|------|-----------|------------|---------|
| S | `--mint` | `#0d1110` | Official API / primary source |
| A+ | `--cyan` | `#0d1110` | Authorized platform / structured filing |
| A | `--steel` | `#0d1110` | Government statistics / reputable research |
| B | `--amber` | `#0d1110` | Professional media / consulting report |
| C | `--ink-muted` | `#0d1110` | Unverified / second-hand |

### Layout

```
┌─ shell (full viewport, padding: 28px) ────────────────────────────────┐
│  workspace (max-width: 1480px, centered)                               │
│  ┌─ mast (flex, space-between) ──────────────────────────────────────┐ │
│  │  eyebrow + h1 + subhead          signal indicator (icon + text)    │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│  ┌─ tab-bar (flex, border-bottom) ───────────────────────────────────┐ │
│  │  [Launch Desk]  [Intelligence Swarm]                               │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│  ┌─ active tab content ──────────────────────────────────────────────┐ │
│  │  ... (grid or panel)                                                │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────┘
```

### Dependencies

```json
{
  "react": "latest",
  "react-dom": "latest",
  "lucide-react": "latest"
}
```

Icons are imported from `lucide-react/dist/esm/lucide-react.mjs`. Build tool: Vite.

---

## 3. Complete API Contract

### Base URL

```
http://127.0.0.1:8787
```

Vite dev proxy: `/api` → `http://127.0.0.1:8787`

---

### 3.1 Intelligence Swarm API

#### POST `/api/intelligence/swarm`

**Request body:**
```json
{
  "objective": "apparel cotton price cost transmission macro economic Vietnam Bangladesh",
  "packId": "apparel"
}
```

- `objective`: string, min 8 characters (required)
- `packId`: string, optional (defaults to `"apparel"`, currently only `"apparel"` supported)

**Response 200:**
```json
{
  "ok": true,
  "result": {
    "candidateSourceIds": ["world-bank", "sec-edgar", "ecb-eurofxref", ...],
    "collectionLog": [
      {
        "sourceId": "world-bank",
        "status": "collected",
        "recordCount": 3,
        "error": null
      },
      {
        "sourceId": "fred",
        "status": "skipped_no_key",
        "recordCount": 0,
        "error": null
      }
    ],
    "rawRecordCount": 6,
    "swarmRun": {
      "triggerId": "trigger-api-1234567890",
      "results": [
        {
          "taskId": "task-collector-...",
          "role": "collector",
          "status": "completed",
          "evidence": { ... },
          "evidenceList": [ ... ],
          "concerns": null
        },
        {
          "taskId": "task-verifier-...",
          "role": "verifier",
          "status": "completed",
          "authenticity": { ... }
        },
        {
          "taskId": "task-analyst-...",
          "role": "analyst",
          "status": "completed",
          "finding": { ... }
        },
        {
          "taskId": "task-synthesizer-...",
          "role": "synthesizer",
          "status": "completed",
          "synthesis": { ... }
        },
        {
          "taskId": "task-memory-...",
          "role": "memory",
          "status": "completed",
          "memoryEntry": { ... },
          "followUp": [ ... ]
        }
      ],
      "synthesis": {
        "id": "synth-...",
        "triggerId": "trigger-api-...",
        "title": "Apparel Cost Pressure: Cotton and Labor Transmission Analysis",
        "brief": "## Executive Summary\n\nCotton prices in Vietnam...",
        "findings": [ ... ],
        "evidenceIds": ["ev-001", "ev-002", ...],
        "confidence": 0.837,
        "generatedAt": "2026-07-09T12:00:00.000Z",
        "chainEstimate": { ... }
      },
      "followUps": [
        {
          "id": "fu-001",
          "originTaskId": "task-memory-...",
          "kind": "probe",
          "objective": "Monitor cotton futures for price breakout above $1.10/lb",
          "rationale": "Current price near resistance level with elevated volatility"
        }
      ]
    }
  }
}
```

**Response 400:**
```json
{
  "ok": false,
  "error": "invalid_input",
  "message": "Objective must be at least 8 characters."
}
```

**Response 500:**
```json
{
  "ok": false,
  "error": "swarm_failed",
  "message": "error description"
}
```

---

### 3.2 Launch Desk API (SSE Streaming)

#### POST `/api/launch-plan`

**Request body:**
```json
{
  "productBrief": "Launch a self-serve analytics export API...",
  "audience": "Enterprise admins, data engineers",
  "launchDate": "2026-07-30",
  "constraints": "Security review pending, billing limits...",
  "assets": "API docs draft, dashboard screenshots..."
}
```

**Response:** Server-Sent Events stream (`text/event-stream`)

SSE event format:
```
event: <event_type>
data: <json_object>

```

Events emitted (in order):

| Event type | Data shape | Description |
|------------|------------|-------------|
| `run_started` | `{ type, model, runId, timestamp }` | Run initiated |
| `tool_progress` | `{ type, name, status, timestamp }` | Tool called (status: "called"/"completed") |
| `text_delta` | `{ type, delta }` | Streaming text chunk (accumulate into output) |
| `error` | `{ message }` | Error occurred (stream ends) |
| `approval_required` | `{ type, runId, approvalId, title, reason, riskLevel, toolName, requestedAction, payloadPreview, timestamp }` | Approval gate opened |
| `approval_resolved` | `{ type, runId, approvalId, decision, timestamp }` | Approval decided |
| `run_completed` | `{}` | Run finished (stream ends) |

**Approval payload fields:**
- `riskLevel`: `"low" | "medium" | "high"`
- `payloadPreview`: `Record<string, unknown>` (JSON object, display in `<details>`)
- Timeout: 5 minutes (auto-reject)

#### POST `/api/launch-plan/approval`

```json
{
  "runId": "run_...",
  "approvalId": "appr_...",
  "decision": "approved"
}
```

Response: `{ ok: true }` or 404 `{ ok: false, error: "approval_not_found" }`

---

### 3.3 Runs API (DAG Orchestrator)

| Method | Path | Body | Response |
|--------|------|------|----------|
| POST | `/api/runs` | `{ intent: string }` | `RunIntentResult` (201) |
| GET | `/api/runs` | — | `{ runs: Run[] }` |
| GET | `/api/runs/:runId` | — | `Run` (200) / 404 / 409 |
| POST | `/api/runs/:runId/approve` | — | `Run` or `{ status: "approved" }` |
| POST | `/api/runs/:runId/reject` | — | `Run` or `{ status: "rejected" }` |
| POST | `/api/runs/:runId/resume` | — | `Run` |
| GET | `/api/runs/:runId/audit` | — | `{ events: AuditEvent[] }` |

---

### 3.4 Health Check

#### GET `/api/health`

Response:
```json
{
  "ok": true,
  "hasOpenAIKey": false,
  "hasProviderKey": true,
  "model": "deepseek-chat",
  "availableModels": ["deepseek-chat", "doubao-pro-32k"]
}
```

---

## 4. Complete Type System

### 4.1 Intelligence Swarm Types

```typescript
// === Collection ===

type CollectionLogEntry = {
  sourceId: string;
  status: "collected" | "skipped_no_key" | "failed" | "not_implemented";
  recordCount: number;
  error?: string;
};

// === Evidence ===

type SourceTier = "S" | "A+" | "A" | "B" | "C";

type EvidenceKind =
  | "financial_primary"
  | "trade_flow_primary"
  | "macro_control"
  | "platform_sales_primary"
  | "supplier_identity"
  | "compliance_risk"
  | "material_quantity"
  | "market_signal"
  | "research_context"
  | "pipeline_health";

interface EvidenceEntry {
  id: string;
  sourceId: string;
  sourceTier: SourceTier;
  sourceWeight: number;
  kind: EvidenceKind;
  subject: string;
  claim: string;
  observedAt: string;          // ISO timestamp
  period?: string;             // e.g. "2026-Q2", "2026-06"
  geography?: string;          // e.g. "VN", "BD", "global"
  unit?: string;               // e.g. "USD", "%", "USD/lb"
  value?: number | string | boolean;
  method: "api" | "filing" | "authorized_platform" | "manual" | "web" | "report";
  url?: string;
  rawRef?: string;
  conversions: string[];       // e.g. ["USD to CNY at 7.25", "monthly to quarterly"]
  crossChecks: string[];       // evidence IDs that cross-check this
  contradictions: string[];    // evidence IDs that contradict this
  notes: string[];
}

// === Verification ===

type ValidationGateName =
  | "provenance"
  | "schema_match"
  | "range_plausibility"
  | "freshness"
  | "cross_source"
  | "historical";

interface ValidationGateResult {
  gate: ValidationGateName;
  pass: boolean;
  score: number;               // 0-1
  blocking: boolean;
  reasons: string[];
  affectedDataPointIds: string[];
}

type AuthenticityFlag = "verified" | "degraded" | "rejected";

interface AuthenticityResult {
  authenticityScore: number;   // 0-1
  flag: AuthenticityFlag;
  gateResults: ValidationGateResult[];
  blockingReasons: string[];
  checkedAt: string;           // ISO timestamp
}

// === Analysis ===

interface AnalysisFinding {
  id: string;
  taskId: string;
  evidenceIds: string[];
  summary: string;
  confidence: number;          // 0-1
  signals: string[];           // e.g. ["demand_up", "cost_rising", "capacity_bottleneck"]
}

// === Synthesis ===

interface SynthesisOutput {
  id: string;
  triggerId: string;
  title: string;
  brief: string;               // Markdown-formatted intelligence brief
  findings: AnalysisFinding[];
  evidenceIds: string[];
  confidence: number;          // 0-1
  generatedAt: string;         // ISO timestamp
  chainEstimate?: ChainHealth;  // Optional supply chain health estimate
}

// === Chain Health (optional, in synthesis.chainEstimate) ===

type PressureLevel = "normal" | "elevated" | "critical";

interface NodePressure {
  nodeId: string;
  observed: number | null;
  expected: number | null;
  deviation: number | null;
  deviationRate: number | null;
  severity: "none" | "low" | "moderate" | "high";
  sourceDisagreement: number;
  confidence: number;
}

interface ChainHealth {
  healthScore: number;         // 0-100 (>=75 normal, >=50 elevated, <50 critical)
  pressureLevel: PressureLevel;
  nodePressure: NodePressure[];
  bottleneckNode: string | null;
  chainDeviation: number;
  coverage: number;
  riskSignals: string[];
  trueValueSummary: Array<{
    nodeId: string;
    subject: string;
    consensusValue: number;
    expected: number | null;
  }>;
}

// === Memory ===

interface MemoryEntry {
  id: string;
  key: string;
  kind: "finding" | "synthesis" | "signal" | "fact";
  value: string;
  sourceTaskId?: string;
  createdAt: string;
  tags?: string[];
}

// === Follow-up Tasks ===

interface FollowUpTask {
  id: string;
  originTaskId: string;
  kind: "probe" | "task";
  objective: string;
  rationale: string;
}

// === Agent Results ===

type AgentRole = "scout" | "collector" | "verifier" | "analyst" | "synthesizer" | "memory";

type AgentStatus =
  | "completed"
  | "failed"
  | "done_with_concerns"
  | "needs_context"
  | "blocked";

interface AgentRunResult {
  taskId: string;
  role: AgentRole;
  status: AgentStatus;
  evidence?: EvidenceEntry;
  evidenceList?: EvidenceEntry[];
  authenticity?: AuthenticityResult;
  finding?: AnalysisFinding;
  synthesis?: SynthesisOutput;
  memoryEntry?: MemoryEntry;
  followUp?: FollowUpTask[];
  candidateSourceIds?: string[];
  error?: string;
  concerns?: string[];
  missingContext?: string[];
  blockerReason?: string;
}

// === Swarm Run ===

interface SwarmRunResult {
  triggerId: string;
  results: AgentRunResult[];
  synthesis?: SynthesisOutput;
  followUps?: FollowUpTask[];
}

// === Live Swarm Result (top-level API response) ===

interface LiveSwarmResult {
  candidateSourceIds: string[];
  collectionLog: CollectionLogEntry[];
  rawRecordCount: number;
  swarmRun: SwarmRunResult;
}
```

### 4.2 Launch Desk Types

```typescript
type RunStatus =
  | "running"
  | "waiting_approval"
  | "paused"
  | "completed"
  | "failed"
  | "rejected";

interface WorkflowNode {
  nodeId: string;
  type: "task" | "human_approval" | "waiting_approval";
  label: string;
  dependsOn?: string[];
  cost?: number;
  outputKey?: string;
  outputValue?: unknown;
}

interface Workflow {
  workflowId: string;
  nodes: WorkflowNode[];
}

interface CostSnapshot {
  estimatedTotal: number;
  actualTotal: number;
  currency: "USD" | "CNY" | "JPY" | "EUR";
}

interface AuditEvent {
  eventId: string;
  runId: string;
  type:
    | "run_created" | "node_started" | "node_completed"
    | "waiting_approval" | "approved" | "rejected"
    | "resumed" | "run_completed" | "run_failed";
  message: string;
  nodeId?: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

interface Run {
  runId: string;
  intent: string;
  taskPlan: { planId: string; intent: string; tasks: Array<{ taskId: string; title: string; nodeId?: string }> };
  workflow: Workflow;
  status: RunStatus;
  currentNodeId?: string;
  completedNodeIds: string[];
  failedNodeIds: string[];
  waitingApprovalNodeId?: string;
  contextSnapshot: Record<string, unknown>;
  costSnapshot: CostSnapshot;
  auditEventIds?: string[];
  createdAt: string;
  updatedAt: string;
}

interface RunIntentResult {
  runId: string;
  status: RunStatus;
  workflow: Workflow;
  costSummary: CostSnapshot;
  auditSummary: { eventCount: number; eventIds: string[] };
  approvalRequired?: boolean;
  waitingApprovalNodeId?: string;
}
```

---

## 5. UI Component Design

### 5.1 App Shell

```
App
├── Mast (title + signal indicator)
├── TabBar
│   ├── Tab: "Launch Desk"
│   └── Tab: "Intelligence Swarm"
└── Active Tab Content
    ├── LaunchDeskPanel (existing, SSE streaming)
    └── IntelligencePanel (new, request/response)
```

### 5.2 Intelligence Panel Layout

```
┌─ intel-panel ──────────────────────────────────────────────────────┐
│  panel-heading: "INTELLIGENCE SWARM"                                │
│  panel-desc: "从公开数据源采集真实情报，蜂群 6 角色管道产出综合简报"  │
│                                                                     │
│  ┌─ intel-input ─────────────────────────────────────────────────┐  │
│  │  [objective textarea]                                          │  │
│  │  [pack select: apparel ▾]  [运行蜂群 button]                    │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌─ intel-metrics (6 metric cards, flex row) ────────────────────┐  │
│  │  3    1    0    6    4    5                                     │  │
│  │  采集  缺key 失败  Raw  证据  步骤                               │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌─ details: 采集日志 (open) ────────────────────────────────────┐  │
│  │  Scout 匹配: world-bank, sec-edgar, ecb-eurofxref              │  │
│  │  ┌──────────────────────────────────────────────────────────┐  │  │
│  │  │ ✅ world-bank    COLLECTED    3 条                        │  │  │
│  │  │ ✅ sec-edgar     COLLECTED    1 条                        │  │  │
│  │  │ ✅ ecb-eurofxref COLLECTED    1 条                        │  │  │
│  │  │ ✅ bls-public-api COLLECTED   1 条                        │  │  │
│  │  │ ⏭️ fred          SKIPPED_NO_KEY  0 条                     │  │  │
│  │  └──────────────────────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌─ details: 蜂群执行 (open) ────────────────────────────────────┐  │
│  │  collector    COMPLETED                                         │  │
│  │  verifier     COMPLETED                                         │  │
│  │  analyst      COMPLETED  -> 2 signals (85%)                     │  │
│  │  synthesizer  COMPLETED  -> "Apparel Cost Pressure..."          │  │
│  │  memory       COMPLETED                                         │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌─ details: 综合简报 (open) ────────────────────────────────────┐  │
│  │  置信度 83.7%                                                   │  │
│  │  Title: "Apparel Cost Pressure: Cotton and Labor..."            │  │
│  │  ┌─ brief body (pre, scrollable, markdown) ──────────────────┐ │  │
│  │  │ ## Executive Summary                                       │ │  │
│  │  │ Cotton prices in Vietnam increased 12% QoQ...              │ │  │
│  │  └────────────────────────────────────────────────────────────┘ │  │
│  │  关联证据: 4 条                                                  │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌─ details: 证据列表 ───────────────────────────────────────────┐  │
│  │  [S] world-bank   Cotton price (VNM)                           │  │
│  │      Cotton export value increased to $2.1B...                  │  │
│  │      值: 2100000000 USD (2026-Q1) @ VNM                        │  │
│  │  [S] sec-edgar    GAP financials                               │  │
│  │      Q2 revenue $3.5B, gross margin 37.4%...                   │  │
│  │  [S] bls-public-api  CPI Apparel                               │  │
│  │      CPI increased 2.1% YoY...                                 │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌─ details: 后续任务 ───────────────────────────────────────────┐  │
│  │  [PROBE] Monitor cotton futures for price breakout             │  │
│  │           Current price near resistance level...                │  │
│  │  [TASK]  Verify Bangladesh labor cost data                     │  │
│  │           Recent ILO data shows 8% increase...                  │  │
│  └────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.3 Launch Desk Panel Layout

```
┌─ grid (2 columns: input-panel | output-panel) ──────────────────────┐
│  ┌─ input-panel ──────────┐  ┌─ output-panel ────────────────────┐  │
│  │  LAUNCH BRIEF           │  │  PLAN OUTPUT                      │  │
│  │                         │  │                                   │  │
│  │  Product brief [textarea]│  │  Tool events: 5  Text deltas: 12 │  │
│  │  Audience      [textarea]│  │  Agent state: [Live]              │  │
│  │  Launch window [textarea]│  │                                   │  │
│  │  Constraints   [textarea]│  │  [event rail: last 8 events]     │  │
│  │  Assets       [textarea]│  │                                   │  │
│  │                         │  │  [Run Review Ledger: collapsible] │  │
│  │  [Generate plan] [Load  │  │  [Approval Gate: if needed]       │  │
│  │   example]              │  │  [Plan output: pre, scrollable]   │  │
│  └─────────────────────────┘  └───────────────────────────────────┘  │
│                                                                     │
│  ┌─ run-history-panel (collapsible, full width) ──────────────────┐ │
│  │  RUN HISTORY (3 records)                                        │ │
│  │  #1  2026-07-09 12:00  completed  5 tool calls, 12 text deltas  │ │
│  │  #2  2026-07-08 15:30  completed  3 tool calls, 8 text deltas   │ │
│  └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 6. Data Source Registry (24 sources)

### Sources with working live adapters (9)

| sourceId | Name | Tier | Needs API Key | Indicators Collected |
|----------|------|------|---------------|---------------------|
| `world-bank` | World Bank Indicators API | S | No | VNM GDP, VNM tariff rate, BGD female labor force |
| `sec-edgar` | SEC EDGAR | S | No | GAP Inc. (CIK 39911) XBRL financial metrics |
| `eurostat` | Eurostat | S | No | DE population (demo_pjan) |
| `ecb-eurofxref` | ECB Euro FX Reference | S | No | EUR reference rates (USD, JPY cross) |
| `bls-public-api` | BLS Public Data API | S | No | CPI Apparel (CUSR0000SAA) |
| `fred` | FRED API | S | **Yes** (`FRED_API_KEY`) | USD/JPY exchange rate (DEXJPUS) |
| `us-census-trade` | US Census Trade API | S | **Yes** (`CENSUS_API_KEY`) | HS 611020 imports from Vietnam |
| `open-supply-hub` | Open Supply Hub | A | **Yes** (`OPEN_SUPPLY_HUB_API_KEY`) | Facility search "Shenzhou" |
| `un-comtrade` | UN Comtrade | S | **Yes** (`UN_COMTRADE_API_KEY`) | Japan-China HS 61 trade flow |

### Sources without adapters (15, show as "not_implemented")

`world-bank-wits`, `edinet-japan`, `estat-japan`, `usitc-dataweb`, `oecd-data-explorer`, `ilostat-api`, `shopee-open-platform`, `temu-partner-api`, `alibaba-open-platform`, `internal-bom-system`, `better-work`, `ilo`, `wto`, `mckinsey-bof-state-of-fashion`

### Collection status display

| Status | Icon | Color |
|--------|------|-------|
| `collected` | ✅ | `--mint` |
| `skipped_no_key` | ⏭️ | `--ink-muted` |
| `failed` | ❌ | `--red` |
| `not_implemented` | 🚫 | `--ink-muted` |

---

## 7. Supply Chain Node Map (Apparel Pack)

The apparel industry pack defines 15+ supply chain nodes:

| Position | Node ID | Label |
|----------|---------|-------|
| 1 | `raw_material` | Raw Material (Cotton / Wool / Silk / Hemp) |
| 2 | `agri_inputs` | Agricultural Inputs (Seeds / Fertilizer / Land) |
| 3 | `petrochemical` | Petrochemical (Crude Oil → PTA → Polyester) |
| 4 | `fiber_exchange` | Fiber Exchange (Futures / Spot / Price Discovery) |
| 5 | `yarn` | Yarn Spinning |
| 6 | `fabric` | Fabric Weaving & Dyeing (Keqao Index) |
| 6.5 | `accessories` | Accessories & Chemicals (Dyes / Zippers / Buttons) |
| 7 | `design` | Design & Development (BOM / Pattern) |
| 8 | `manufacturing` | Manufacturing (Cutting / Sewing / QC) |
| 9 | `trading_co` | Trading Company (Import/Export / Procurement) |
| 10 | `brand` | Brand Operations (Positioning / Pricing) |
| 11 | `channel` | Channel & Retail |
| 12 | `consumer` | Consumer Behavior |
| 13 | `recycling` | Recycling & Circular Economy |
| 14 | `secondhand` | Off-price & Secondhand (Surplus / Discount / Resale) |
| 0 | `trend_signal` | Trend Signal (Social Media / Search / E-commerce) |
| 0 | `competition` | Competition Landscape (Market Share / Competitor Pricing) |

---

## 8. Implementation Notes

### 8.1 Intelligence Panel API Call

```typescript
async function runSwarm(objective: string, packId: string) {
  const response = await fetch("/api/intelligence/swarm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ objective, packId }),
  });
  const data = await response.json();
  if (!data.ok) throw new Error(data.message);
  return data.result as LiveSwarmResult;
}
```

### 8.2 SSE Parsing (Launch Desk)

```typescript
function parseSseBlock(block: string) {
  const lines = block.split("\n");
  const event = lines.find((l) => l.startsWith("event: "))?.slice(7).trim() ?? "message";
  const data = lines.filter((l) => l.startsWith("data: ")).map((l) => l.slice(6)).join("\n");
  return { event, data };
}

// Usage:
const reader = response.body.getReader();
const decoder = new TextDecoder();
let buffer = "";

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  const blocks = buffer.split("\n\n");
  buffer = blocks.pop() ?? "";
  for (const block of blocks) {
    const { event, data } = parseSseBlock(block);
    if (!data) continue;
    const parsed = JSON.parse(data);
    // handle by event type...
  }
}
```

### 8.3 Extracting Evidence from Swarm Results

```typescript
function extractAllEvidence(results: AgentRunResult[]): EvidenceEntry[] {
  const evidence: EvidenceEntry[] = [];
  for (const r of results) {
    if (r.evidenceList) evidence.push(...r.evidenceList);
    else if (r.evidence) evidence.push(r.evidence);
  }
  return evidence;
}
```

### 8.4 Run History (localStorage)

Completed Launch Desk runs should be saved to localStorage:
- Key: `launch-desk-run-history`
- Value: `RunHistoryEntry[]` (max 50, newest first)
- Each entry: `{ runId, completedAt, status, output, brief, toolEventCount, textDeltaCount, approval?, events: PersistedRunEvent[] }`

### 8.5 Constraints

- **No new npm dependencies** beyond React, react-dom, lucide-react
- **No database** - all state is in-memory (server) or localStorage (client)
- **No login system**
- **No complex dashboard** - simple tab-based layout
- **API keys** are server-side only (process.env), never exposed to client
- **Dark theme only**
- **Responsive**: grid collapses to single column below 960px

---

## 9. File Structure (Target)

```
src/
├── client/
│   ├── main.tsx              # App shell + tab bar + Launch Desk panel
│   ├── IntelligencePanel.tsx # Intelligence swarm panel
│   ├── LaunchDeskPanel.tsx   # (optional: extract from main.tsx)
│   ├── runHistoryStore.ts    # localStorage persistence
│   └── styles.css            # All styles
├── server/
│   ├── index.ts              # Express app (Launch Desk + Runs API)
│   └── intelligence-routes.ts # Intelligence Swarm API
└── intelligence/             # Backend engine (do not modify)
```

---

## 10. Default Values

### Intelligence Panel defaults

- `objective`: `"apparel cotton price cost transmission macro economic Vietnam Bangladesh"`
- `packId`: `"apparel"`

### Launch Desk defaults (sample brief)

```typescript
{
  productBrief: "Launch a self-serve analytics export API for enterprise customers...",
  audience: "Enterprise admins, data engineers, and customer success teams",
  launchDate: "2026-07-30",
  constraints: "Security review is pending, billing limits must be documented...",
  assets: "API docs draft, dashboard screenshots, beta customer quotes..."
}
```

### Validation

- Intelligence objective: min 8 characters
- Launch Desk productBrief: min 12 characters

---

## 11. Launch Desk SSE Event Handling (Detailed)

The Launch Desk panel is the most complex component. Here's the complete event flow:

### State machine

```
Idle -> (user clicks "Generate plan") -> Running
  Running -> receives "run_started" -> continues streaming
  Running -> receives "tool_progress" -> update event rail
  Running -> receives "text_delta" -> append to output string
  Running -> receives "approval_required" -> show approval gate (awaiting)
    Awaiting -> user clicks "Approve" -> POST /api/launch-plan/approval
    Awaiting -> user clicks "Reject" -> POST /api/launch-plan/approval
    Awaiting -> receives "approval_resolved" -> dismiss gate
      If approved -> continue receiving text_delta
      If rejected -> receives text_delta (safe message) then run_completed
  Running -> receives "run_completed" -> Done (save to history)
  Running -> receives "error" -> Error state
```

### StreamEvent type (client-side)

```typescript
type StreamEvent = {
  type: string;
  // tool_progress fields
  name?: string;
  status?: string;
  // text_delta fields
  delta?: string;
  // error fields
  message?: string;
  // run_started fields
  model?: string;
  // run identification
  runId?: string;
  approvalId?: string;
  // approval fields
  decision?: "approved" | "rejected";
  title?: string;
  reason?: string;
  riskLevel?: "low" | "medium" | "high";
  toolName?: string;
  requestedAction?: string;
  payloadPreview?: Record<string, unknown>;
  timestamp?: string;
};
```

### Ledger entries (audit timeline)

Derive a ledger from accumulated events for the "Run Review Ledger" panel:

```typescript
type LedgerEntry = {
  seq: number;
  eventType: string;
  label: string;
  detail?: string;
  timestamp?: string;
  isAggregated?: boolean;
};
```

Aggregation rules:
- Consecutive `text_delta` events -> single entry: `"Model text stream"` with detail `"N deltas, M chars"`
- `run_started` -> `"Run started"` with model detail
- `tool_progress` -> `"{status} {name}"` (e.g. `"called search_web"`)
- `approval_required` -> `"Approval required"` with approvalId + riskLevel + toolName
- `approval_resolved` -> `"Approval {decision}"` with approvalId
- `error` -> `"Error"` with message
- `run_completed` -> `"Run completed"`

### Run Review Ledger summary grid

When run completes, show a summary grid:

```
┌─ RUN SUMMARY ─────────────────────────┐
│ Total events    │ 17                  │
│ Tool calls      │ 5                   │
│ Text deltas     │ 12                  │
│ Approval        │ approved            │
│ Final state     │ Done                │
└────────────────────────────────────────┘
```

If an approval occurred, also show:

```
┌─ APPROVAL REVIEW ─────────────────────┐
│ Approval ID  │ appr_1234...           │
│ Risk level   │ [medium]               │
│ Tool         │ create_release_plan    │
│ Decision     │ approved               │
└────────────────────────────────────────┘
```

### Output panel states

1. **Empty**: Show icon + "No run yet" + "Submit a launch brief to stream a prioritized release plan."
2. **Running**: Show accumulated text in `<pre>`, auto-scroll to bottom, show spinner on button
3. **Approval gate**: Show alert dialog with title, reason, risk chip, tool name, payload preview, Approve/Reject buttons
4. **Completed**: Show output with Copy + Export markdown buttons, auto-open Run Review Ledger
5. **Error**: Show error banner with message + "Edit your input and try again."
6. **History detail**: When viewing a past run, show read-only output + ledger + summary, with "Back to current run" button

---

## 12. Vite Configuration

```typescript
// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist/client",
  },
});
```

---

## 13. package.json

```json
{
  "name": "intelligence-swarm-frontend",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "lucide-react": "^0.460.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.0",
    "typescript": "^5.6.0",
    "vite": "^8.0.0"
  }
}
```

---

## 14. runHistoryStore.ts Specification

```typescript
// localStorage key
const STORAGE_KEY = "launch-desk-run-history";
const MAX_HISTORY = 50;

// Persisted event (simplified StreamEvent for localStorage)
interface PersistedRunEvent {
  type: string;
  name?: string;
  status?: string;
  delta?: string;
  message?: string;
  model?: string;
  runId?: string;
  approvalId?: string;
  decision?: "approved" | "rejected";
  title?: string;
  reason?: string;
  riskLevel?: "low" | "medium" | "high";
  toolName?: string;
  requestedAction?: string;
  timestamp?: string;
}

// History entry
interface RunHistoryEntry {
  runId: string;
  completedAt: string;        // ISO timestamp
  status: "completed" | "rejected";
  output: string;             // accumulated text output
  brief: {                    // form state at time of run
    productBrief: string;
    audience: string;
    launchDate: string;
    constraints: string;
    assets: string;
  };
  toolEventCount: number;
  textDeltaCount: number;
  approval?: {
    approvalId?: string;
    riskLevel?: "low" | "medium" | "high";
    toolName?: string;
    decision?: "approved" | "rejected";
  };
  events: PersistedRunEvent[];
}

// Functions to implement:
function loadRunHistory(): RunHistoryEntry[];      // read from localStorage, return [] on error
function saveRunToHistory(entry: RunHistoryEntry): void;  // prepend, trim to MAX_HISTORY
function clearRunHistory(): void;                   // remove key
function buildRunHistoryEntry(params: {
  runId: string;
  events: StreamEvent[];
  output: string;
  brief: FormState;
}): RunHistoryEntry;  // derive counts + approval from events
```

---

## 15. Key Interaction Details

### Copy to clipboard

```typescript
async function copyResult(output: string) {
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(output);
  } else {
    // Fallback for non-secure contexts
    const ta = document.createElement("textarea");
    ta.value = output;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }
}
```

### Export markdown

```typescript
function exportMarkdown(output: string) {
  const date = new Date().toISOString().slice(0, 10);
  const markdown = `# Launch Plan\n\n${output}`;
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `launch-plan-${date}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
```

### Auto-scroll behavior

- When output grows and user is near bottom (< 120px from bottom), auto-scroll to bottom
- If user scrolls up manually, pause auto-scroll
- Show "Jump to latest" button when auto-scroll is paused and run is active

### Confirmation dialogs

- "Load example" button: if current form differs from sample, `window.confirm("This will replace your current input with the example brief. Continue?")`
- "Clear local history": `window.confirm("This will clear all saved run records from your browser. Continue?")`

