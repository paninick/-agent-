# Phase 4 PRD — Run Persistence Contract / Local Run History

> **状态：`IMPLEMENTED — DONE`**
>
> 本文件为 Phase 4 方案锁定文档（PRD），不含实现代码。Phase 4 实现需基于本 PRD。
> Mini Patch 修正了隐私/数据模型冲突：events 不再使用完整 `StreamEvent[]`，改为 sanitized `PersistedRunEvent[]`。
> **实现备注**：Phase 4 已实现并通过全部验收（typecheck ✓、test 33 文件 / 373 用例 ✓、build ✓、lint ✓、verify:secrets 0 ✓）。实现文件见 §13 HANDOFF_PACKET。

---

## 1. PHASE_4_ONE_SENTENCE_GOAL

Persist completed runs to browser `localStorage` — brief snapshot + sanitized events + approval summary + final markdown — so the user can review, inspect, and export past run results without changing the SSE or approval contracts or adding backend persistence.

---

## 2. ALLOWED_SCOPE

- Add a `localStorage` read/write wrapper module (`runHistoryStore.ts`) in the client.
- Persist completed runs to `localStorage` on `run_completed` (successful completions only, not in-progress or error runs).
- Add a Run History UI panel (list view + detail review mode).
- Add a "Clear local history" action.
- Reuse existing Export markdown from a history entry.
- Lightweight frontend state: `runHistory` array + `selectedHistoryRun` for detail view.
- New test file `run-history-ui.test.tsx`.
- Forward/backward compatibility via `schemaVersion` field.
- Doc updates to `FRONTEND_USAGE_INTERACTION_SPEC.md`.

---

## 3. FORBIDDEN_SCOPE

- ❌ No SSE event contract changes (7 events unchanged).
- ❌ No approval contract changes.
- ❌ No `run_cancelled` event.
- ❌ No Cancel / Stop Run.
- ❌ No Retry button.
- ❌ No `recoverable` error field.
- ❌ No npm dependencies.
- ❌ No database / backend persistence / new endpoint.
- ❌ No external services.
- ❌ No auth system.
- ❌ No server-side rendering of history — pure client.
- ❌ No persisting in-progress or error runs (only `run_completed`).
- ❌ No persisting secrets (API keys, tokens, headers).
- ❌ No modifications to `src/server/*` or `src/agent/*`.
- ❌ No persisting `payloadPreview` from approval events (sanitization strips it).
- ❌ No persisting any headers / token / authorization-like fields.

---

## 4. DATA_MODEL_DRAFT

### 4.1 PersistedRunEvent (sanitized event for history)

```typescript
// A sanitized subset of StreamEvent, persisted to localStorage.
// Only fields needed for UI history detail and ledger replay are retained.
// Secrets and sensitive context (payloadPreview, headers, tokens) are stripped.
type PersistedRunEvent = {
  type: string;  // "run_started" | "tool_progress" | "text_delta" | "approval_required" | "approval_resolved" | "error" | "run_completed"

  // run_started
  model?: string;
  traceLabel?: string;

  // tool_progress
  name?: string;
  status?: string;

  // text_delta
  delta?: string;

  // error
  message?: string;

  // approval_required — NOTE: payloadPreview is EXCLUDED (not persisted)
  approvalId?: string;
  title?: string;
  reason?: string;
  riskLevel?: "low" | "medium" | "high";
  toolName?: string;
  requestedAction?: string;
  timestamp?: string;

  // approval_resolved
  decision?: "approved" | "rejected";

  // runId (present on approval events)
  runId?: string;
};
```

**Sanitization rule**: `approval_required.payloadPreview` is **never persisted**. Only the following fields from `approval_required` are retained: `approvalId`, `title`, `reason`, `riskLevel`, `toolName`, `requestedAction`, `timestamp`. Any `headers`, `token`, `authorization`, `apiKey`, or similar fields found on any event are stripped.

### 4.2 RunHistoryEntry

```typescript
// A single persisted run record, stored in localStorage.
type RunHistoryEntry = {
  // --- Identity ---
  runId: string;           // from run_started event runId, or fallback `local_{timestamp}_{random}`
  schemaVersion: number;   // = 1 for forward/backward migration; mismatched entries are skipped on read

  // --- Timestamps ---
  createdAt: string;       // ISO 8601 — when run_started was received
  completedAt: string;     // ISO 8601 — when run_completed was received

  // --- Status ---
  status: "completed";     // V1 only persists "completed" (future: may add "rejected")

  // --- Brief snapshot ---
  brief: {
    productBrief: string;
    audience: string;
    launchDate: string;
    constraints: string;
    assets: string;
  };

  // --- Event snapshot (sanitized) ---
  // PersistedRunEvent[] — NOT the raw StreamEvent[].
  // Sanitized via sanitizeStreamEventsForHistory() before persistence.
  // payloadPreview is stripped; no headers/tokens/authorization fields.
  events: PersistedRunEvent[];

  // --- Approval summary (derived, read-only) ---
  approval: {
    required: boolean;
    approvalId: string | null;
    riskLevel: RiskLevel | null;
    toolName: string | null;
    decision: "approved" | "rejected" | null;
  } | null;

  // --- Final result ---
  output: string;          // full markdown plan text (concatenation of all text_delta)

  // --- Extra metadata ---
  toolEventCount: number;
  textDeltaCount: number;
};
```

**Storage key**: `launchdesk:run_history` → JSON-encoded `RunHistoryEntry[]`

**Max entries**: 50 (FIFO — oldest truncated when exceeded).

**Estimated size per entry**: ~5-30 KB (depending on output length and event count). 50 entries ≈ 0.25-1.5 MB — well within `localStorage`'s 5-10 MB limit.

### 4.3 Sanitization function

```typescript
// Strips sensitive fields from StreamEvent[] before persisting to localStorage.
// - Removes approval_required.payloadPreview entirely.
// - Removes any headers / token / authorization / apiKey-like fields.
// - Retains only fields needed for UI history detail and ledger replay.
function sanitizeStreamEventsForHistory(events: StreamEvent[]): PersistedRunEvent[];
```

**Sanitization rules**:
1. For each event, create a `PersistedRunEvent` with only the allowed fields listed in §4.1.
2. **`payloadPreview` is never copied** — it is excluded from `PersistedRunEvent` entirely.
3. Any field matching `/header|token|auth|apiKey|secret|credential/i` is stripped (defensive — should never appear on StreamEvent, but guards against future additions).
4. `text_delta.delta` is retained (needed to reconstruct output, though `output` field is the primary source).
5. `approval_required` retains: `approvalId`, `title`, `reason`, `riskLevel`, `toolName`, `requestedAction`, `timestamp` — **not** `payloadPreview`.

---

## 5. STORAGE_STRATEGY_OPTIONS

| Strategy | Pros | Cons | Recommendation |
|----------|------|------|----------------|
| **`localStorage`** | Persists across sessions, sync API, widely supported, no backend | ~5-10 MB limit, same-origin only, no TTL, blocks main thread | ✅ **Recommended V1** |
| **`sessionStorage`** | Auto-TTL (cleared on tab close), sync API | Lost on tab close — useless for history | ❌ Not suitable |
| **In-memory** | No size limit, no serialization | Lost on refresh — useless for history | ❌ Not suitable |
| **IndexedDB** | Large quota, async, structured | High complexity, needs wrapper, overkill for V1 | ⏳ Future V2 |
| **Backend persistence** | Cross-device sync, durable, queryable | Requires DB + endpoint + auth — explicitly forbidden | ⏳ Future phase |

---

## 6. RECOMMENDED_V1

**`localStorage`** with a single JSON-encoded array key (`launchdesk:run_history`), capped at 50 entries, with `schemaVersion: 1`.

**Module structure**:
```
src/client/
  runHistoryStore.ts     ← new module: load/save/clear, try/catch + quota handling + sanitization
  main.tsx               ← integration: save on completion, history panel UI, clear button
  styles.css             ← history UI styles

src/tests/
  run-history-ui.test.tsx ← new test file
```

**Save timing**:
- In the `run_completed` SSE handler — after detecting completion, build a `RunHistoryEntry` (with sanitized events via `sanitizeStreamEventsForHistory()`), then call `saveRunToHistory(entry)`.
- In-progress and error runs are NOT saved.

**Load timing**:
- On component mount — `useEffect(() => loadRunHistory(), [])` to populate history panel.

**Clear**:
- "Clear local history" button → `clearRunHistory()` → `localStorage.removeItem` + state reset.

---

## 7. UI_SURFACE

**Location**: A new collapsible "Run History" panel below the `.grid` layout, spanning full width, as a sibling of `.grid` inside `.workspace`.

### 7.1 Run History List
```
┌─ RUN HISTORY (3 records) ────────────────────── [Clear local history] ┐
│  #1  2026-07-06 12:00  completed  3 tool calls, 12 text deltas       │
│  #2  2026-07-06 11:30  completed  5 tool calls, 18 text deltas       │
│  #3  2026-07-05 16:00  completed  2 tool calls, 8 text deltas        │
└────────────────────────────────────────────────────────────────────────┘
```
- Collapsible `<details>` (same pattern as ledger).
- Each row: date/time, status chip, tool-call count, text-delta count.
- Click a row → opens detail review mode.

### 7.2 Detail Review Mode
- Replaces the `.output-panel` content with the history entry's data (read-only).
- Shows: brief snapshot (collapsed), event ledger (reuses Phase 3 ledger), output markdown (read-only `<pre>`).
- "Back to current run" button restores live state.
- Approval summary shown if present in the history entry (read-only).

### 7.3 Export Markdown
- Reuses existing `exportMarkdown()` function — pass the history entry's `output` field.
- Filename: `launch-plan-{completedAt date}.md`.

### 7.4 Clear Local History
- Red outline small button in the history panel header.
- `window.confirm("This will clear all saved run records from your browser. Continue?")` → clears `localStorage` key + state.
- Only clears the run history key, does not touch other localStorage keys.

---

## 8. PRIVACY_AND_SECRET_RULES

1. **No API keys**: `ARK_API_KEY`, `DEEPSEEK_API_KEY`, or any environment variable is never stored in `localStorage`.
2. **No auth headers**: No `Authorization` header or token is persisted.
3. **Brief data**: The user's product brief is persisted — it is user-authored data that belongs to the user. No PII filtering (the user controls their own input).
4. **`payloadPreview` is NOT persisted**: The `approval_required.payloadPreview` field is stripped by `sanitizeStreamEventsForHistory()` before storage. Only `approvalId`, `title`, `reason`, `riskLevel`, `toolName`, `requestedAction`, `timestamp` are retained from `approval_required` events.
5. **No server transmission**: History is purely local. No history data is sent to any endpoint.
6. **`verify:secrets`**: Must remain 0 findings. `runHistoryStore.ts` must not hardcode any credentials.
7. **`.gitignore`**: No changes — `localStorage` is runtime browser storage, not a filesystem file.
8. **Clear**: User can clear all history at any time via the button. Browser storage clearing also removes it entirely.
9. **Defensive field stripping**: Any field matching `/header|token|auth|apiKey|secret|credential/i` is stripped from persisted events, guarding against future StreamEvent additions that might carry sensitive data.

---

## 9. FAILURE_MODES

| # | Failure | Handling | User Impact |
|---|---------|----------|-------------|
| 1 | **Storage quota exceeded** | `try/catch` on `QuotaExceededError`; if array is at max, truncate oldest entry and retry once; if still fails, silently skip save | Current run still completes normally; just not saved to history |
| 2 | **Root JSON unparseable** (entire `localStorage` value is garbage) | `JSON.parse` throws → `catch` → discard entire array → reset to `[]` → history panel shows empty state | All history lost (was corrupt); new runs work fine |
| 3 | **Single record malformed** (one entry in the array is bad) | `Array.filter` — validate each entry; filter out bad records; keep valid ones; re-save the filtered array | Bad record lost; good records preserved |
| 4 | **Version mismatch** (future `schemaVersion: 2`) | Check `schemaVersion` on each entry; if > 1, skip that entry (don't crash); V1 entries still load | Old records remain readable; future-version entries gracefully skipped |
| 5 | **User clears browser storage** | `loadRunHistory()` returns `[]`; history panel shows "No saved runs" | History gone; new runs work fine |
| 6 | **localStorage disabled** (private mode) | `try/catch` on access throws → `loadRunHistory()` returns `[]`, `saveRunToHistory()` is a no-op | History feature silently degrades; all other features work |
| 7 | **Single record too large** | No hard limit on output string size; 50-entry cap + quota handling mitigates | Very large outputs may result in fewer history entries (quota hit sooner) |
| 8 | **Concurrent tabs** | Two tabs completing runs simultaneously → last-write-wins; tab A's save may be overwritten by tab B | History is "last-write-wins" — acceptable for V1 |

---

## 10. TEST_MATRIX

### `src/tests/run-history-ui.test.tsx` (new file, ~12 tests)

| # | Test | Setup | Assertion |
|---|------|-------|------------|
| 1 | History list renders from localStorage on mount | Pre-fill localStorage with 2 entries | 2 rows visible with correct dates/counts |
| 2 | Completed run is saved to localStorage | Mock SSE → run_completed | `localStorage.getItem` contains 1 entry with output |
| 3 | Error run is NOT saved | Mock SSE → error event | No new entry in localStorage |
| 4 | In-progress run is NOT saved (mid-stream) | Mock SSE → run_started + text_delta (no run_completed) | No save |
| 5 | Click history row opens detail view | 1 saved entry, click row | Brief snapshot + output + ledger shown; "Back to current run" visible |
| 6 | "Back to current run" restores live state | In detail view, click back | Live output-panel restored |
| 7 | "Clear local history" empties localStorage | 3 entries, click clear + confirm | localStorage key removed; list empty |
| 8 | Export markdown from history entry | In detail view, click export | Blob download triggered with `output` content + dated filename |
| 9 | Empty history state shows "No saved runs" | localStorage empty | Empty state message visible |
| 10 | Malformed root JSON is handled gracefully | localStorage set to `"garbage"` | No crash; history resets to empty; new runs still work |
| 11 | Single malformed record is filtered, good records kept | Array with 1 valid + 1 invalid entry | 1 row visible; invalid entry discarded |
| 12 | Quota exceeded does not crash run completion | Mock `localStorage.setItem` throws `QuotaExceededError` | Run still completes; no uncaught error |
| 13 | Max 50 entries (oldest truncated) | Pre-fill 51 entries | Only 50 exist; oldest removed |
| 14 | payloadPreview is NOT persisted | Mock SSE with approval_required containing payloadPreview | Saved entry's events have no payloadPreview field |

---

## 11. ACCEPTANCE_CRITERIA

1. `npm run typecheck` PASS
2. `npm run test` PASS — 33+ files / 365+ tests (351 existing + ≥14 new)
3. `npm run build` PASS
4. `npm run lint` PASS
5. `npm run verify:secrets` PASS — 0 findings
6. Completed runs persist to `localStorage` across page refresh
7. History list renders from `localStorage` on mount
8. Detail review mode shows history output (read-only)
9. Clear history removes data from `localStorage`
10. Malformed/quota errors do not crash the app
11. **`payloadPreview` is never persisted** — sanitization strips it
12. **No headers/tokens/auth fields persisted** — defensive stripping
13. Existing 351 tests do not regress
14. No SSE event contract changes
15. No approval contract changes
16. No new npm dependencies
17. No backend changes (`src/server/*`, `src/agent/*` untouched)

---

## 12. FUTURE_OUT_OF_SCOPE

| Item | Phase | Reason |
|------|-------|--------|
| Backend run persistence (database) | Future | Requires DB + endpoint + auth |
| Cross-device history sync | Future | Requires backend account system |
| IndexedDB storage | V2 | No need for complexity at current scale |
| Persisting error/failed runs | Future | Requires error classification strategy |
| Run comparison / diff view | Future | New UI paradigm, beyond V1 scope |
| Re-run from history | Future | Requires backend resume capability |
| Search/filter in history | V2 | See how V1 usage patterns evolve |
| TTL/auto-expiry for run history | V2 | localStorage is manual; TTL needs timestamp scan |
| Persisting payloadPreview | Future | Only if sanitization can guarantee no sensitive data |
| Run Cancel / `run_cancelled` | Future | Explicitly forbidden — no backend cancel endpoint |
| Retry button | Future | Needs backend resume |
| `recoverable` error field | Future | Needs backend schema change |

---

## 13. HANDOFF_PACKET

```
PROJECT: Launch Desk
LOCATION: D:/Documents/New project 2/
PHASE: 4 IMPLEMENTED — DONE

PRD STATUS: PASS — implemented and verified

IMPLEMENTATION SCOPE (Phase 4 V1):
  - New module: src/client/runHistoryStore.ts (localStorage wrapper + sanitization)
  - Modified: src/client/main.tsx (persistence + history panel + detail view)
  - Modified: src/client/styles.css (history UI styles)
  - New: src/tests/run-history-ui.test.tsx (~14 tests)
  - Modified: docs/FRONTEND_USAGE_INTERACTION_SPEC.md (Phase 4 docs)
  - Modified: package.json (add test file)

STORAGE: localStorage key "launchdesk:run_history"
  - JSON-encoded RunHistoryEntry[]
  - Max 50 entries, schemaVersion: 1
  - Only run_completed runs saved
  - Error/in-progress runs NOT saved
  - Events sanitized via sanitizeStreamEventsForHistory()
  - payloadPreview NEVER persisted
  - No headers/tokens/auth fields persisted

DATA MODEL: RunHistoryEntry
  - runId, schemaVersion, createdAt, completedAt
  - status: "completed"
  - brief (FormState snapshot)
  - events: PersistedRunEvent[] (sanitized — NOT raw StreamEvent[])
  - approval (derived summary)
  - output (concatenated markdown)
  - toolEventCount, textDeltaCount

SANITIZATION: sanitizeStreamEventsForHistory(events: StreamEvent[]): PersistedRunEvent[]
  - Strips approval_required.payloadPreview
  - Strips any header/token/auth/apiKey/secret/credential fields
  - Retains: type, model, traceLabel, name, status, delta, message,
    approvalId, title, reason, riskLevel, toolName, requestedAction,
    timestamp, decision, runId

UI:
  - History panel: collapsible <details> below .grid (full width)
  - List view: date, status, counts
  - Detail view: replaces output-panel content (read-only)
  - Clear button: window.confirm → localStorage.removeItem
  - Export: reuses exportMarkdown() with history output

FAILURE HANDLING:
  - QuotaExceededError → truncate + retry → silent skip
  - Root JSON unparseable → discard entire array → reset to []
  - Single record malformed → filter bad record → keep good records
  - schemaVersion mismatch → skip entry
  - localStorage disabled → no-op degrade

EVENT CONTRACT (7, frozen): unchanged
APPROVAL CONTRACT (frozen): unchanged
BACKEND: untouched (src/server/*, src/agent/*)

NEXT: Phase 4 complete. All acceptance criteria met.
CONSTRAINTS: same as all prior phases (no new deps, no real API/MCP, no credentials, no skills/ECC)
```
