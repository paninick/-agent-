STATUS: PASS
NEXT_NODE: N2_TECH_REVIEW
NEXT_MODEL: deepseek-v4-flash
BLOCKING_ISSUES: None
NON_BLOCKING_ISSUES: |
  - `createApp(gateway?, orchestrator?)` second parameter is backward-compatible — P11 tests calling `createApp(gw)` (single arg) are unaffected because `orchestrator` is optional and defaults to `new SwarmOrchestrator()` when omitted.
  - The orchestrator singleton created at module level (`const orchestrator = new SwarmOrchestrator()`) shares a single `MemoryRunStore` across all requests. This is correct for a single-process server — all runs are visible through any endpoint.
  - No sealed layer is imported into server — `src/runtime/index.ts` is a public API surface that exports `SwarmOrchestrator`, `MemoryRunStore`, `RunStore`, `Run`, etc. These are allowed imports.
  - New routes at `/api/runs` do not collide with existing `/api/health` or `/api/launch-plan` paths.
  - Express 5 `:runId` named params are used consistently — Express 5 requires named params in route patterns (e.g., `"/api/runs/:runId"`). This is already the pattern used in the existing codebase.
  - Error mapping is deterministic: `RunStoreResult` with `.ok === false` and `.error` field maps to HTTP status codes via a `mapErrorToStatus()` helper. `run_not_found` → 404, `invalid_state` → 409, ZodError → 400.
  - The `createApp` factory still creates its own `__dirname` binding — the new routes are added inside the factory closure, so they have access to the same scope.
  - No SSE or streaming for runs API — these are synchronous REST endpoints returning JSON. The SSE streaming path remains exclusively at `/api/launch-plan`.
SEALED_LAYERS_CHECK:
  - src/runtime/** — NOT sealed from server. Server is allowed to import from runtime.
  - src/agent/** — sealed, not imported by new routes.
  - src/integration/** — sealed, not imported by new routes (only via createApp gateway param).
  - src/models/** — sealed, not imported.
  - src/skills/** — sealed, not imported.
  - src/mcp/** — sealed, not imported.
  - src/governance/** — sealed, not imported.
  - src/release/** — sealed, forbidden to modify.
HANDOFF_PACKET:
```text
CURRENT_PHASE: P12_RUNS_API_SURFACE
SEALED_PHASES: P0,P1,P2,P3,P4.0,P4.1,P4.2,P5,P6,P7,P8,P9,P10,P11,GOV
CURRENT_NODE: N1_LONG_CONTEXT_ARCH_REVIEW
STATUS: PASS
NEXT_MODEL: deepseek-v4-flash
NEXT_NODE: N2_TECH_REVIEW
```