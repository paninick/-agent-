STATUS: PASS
NEXT_NODE: N3_IMPLEMENTATION
NEXT_MODEL: deepseek-v4-flash
BLOCKING_ISSUES: None
NON_BLOCKING_ISSUES: |
  - Express 5 `app.get("/api/runs/:runId", handler)` uses named params — this is the same pattern used in the existing codebase. The `req.params.runId` is typed as `string` in Express 5.
  - Zod validation for `POST /api/runs` body uses `z.object({ intent: z.string().min(1) })` — ZodError is caught and mapped to 400 with `{ error: "invalid_input", message }`.
  - The `mapErrorToStatus()` helper is a simple function: `run_not_found` → 404, `invalid_state` → 409, default → 500.
  - `POST /api/runs/:runId/approve`, `/reject`, `/resume` all have empty bodies — no Zod validation needed. The orchestrator validates state transitions internally.
  - `GET /api/runs/:runId/audit` returns `{ events: AuditEvent[] }` — the `AuditEvent` type includes `eventId`, `runId`, `type`, `message`, `nodeId?`, `createdAt`, `metadata?`.
  - `GET /api/runs` returns `{ runs: Run[] }` — the `Run` type is serializable to JSON (all fields are primitives, arrays, or plain objects).
  - No middleware needed beyond the existing `cors()` and `express.json()`.
  - The `createApp` return type remains `Express` — no change to the public API surface.
  - Test pattern: reuse `startServer(app)` and `httpRequest()` from P11 test file (copy, not import — each test file is self-contained).
  - Test gateway: `makeGateway({})` (empty gateway) suffices for runs API tests since runs endpoints don't interact with the model gateway.
IMPLEMENTATION_PLAN:
  - Step 1: Edit `src/server/index.ts` — add `orchestrator` param, 7 routes, error mapper, Zod schema.
  - Step 2: Create `src/tests/http-runs-api.test.ts` — 12-14 tests.
  - Step 3: Edit `package.json` — append test path.
HANDOFF_PACKET:
```text
CURRENT_PHASE: P12_RUNS_API_SURFACE
SEALED_PHASES: P0,P1,P2,P3,P4.0,P4.1,P4.2,P5,P6,P7,P8,P9,P10,P11,GOV
CURRENT_NODE: N2_TECH_REVIEW
STATUS: PASS
NEXT_MODEL: deepseek-v4-flash
NEXT_NODE: N3_IMPLEMENTATION
```