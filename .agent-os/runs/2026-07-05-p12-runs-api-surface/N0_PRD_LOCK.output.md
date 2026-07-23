STATUS: PASS
NEXT_NODE: N1_LONG_CONTEXT_ARCH_REVIEW
NEXT_MODEL: longcat
BLOCKING_ISSUES: None
NON_BLOCKING_ISSUES: |
  - skills/ECC vendor lockfile drift remains documented non-blocking (unchanged from P11 baseline).
  - verify:release currently reports READY (0 blocking reasons) — P11 was committed at 30759f02.
REQUIRED_ACTION: |
  Confirm the scope: src/server/index.ts needs a second optional parameter `orchestrator` on `createApp(gateway?, orchestrator?)` to allow test injection of a SwarmOrchestrator. This is a backward-compatible extension — P11 tests that call `createApp(gw)` are unaffected. The production path creates a default orchestrator singleton at module level.
SCOPE:
  - Edit `src/server/index.ts` — add `orchestrator?: SwarmOrchestrator` second parameter to `createApp`, add 5 `/api/runs` routes (POST /api/runs, GET /api/runs, GET /api/runs/:runId, POST /api/runs/:runId/approve, POST /api/runs/:runId/reject, POST /api/runs/:runId/resume, GET /api/runs/:runId/audit), create production orchestrator singleton.
  - Create `src/tests/http-runs-api.test.ts` — 12-14 HTTP integration tests using Node built-in `http` module (no new dependencies).
  - Edit `package.json` — append test path to test script.
  - Edit `README.md` + `CHANGELOG.md` — add P12 section.
  - Create `.agent-os/runs/2026-07-05-p12-runs-api-surface/` governance artifacts.
NON_GOALS:
  - No new npm dependencies (no supertest, no got, no axios).
  - No real API calls (uses FakeModelGateway for /api/health + /api/launch-plan compatibility).
  - No src/runtime/** changes — sealed layer.
  - No src/agent/** changes — sealed layer.
  - No src/integration/**, src/models/**, src/skills/**, src/mcp/**, src/governance/**, src/release/** changes — all sealed.
  - No CI/channel/headless automation.
  - No skills/ECC internal commit.
  - No SSE for runs API — routes are synchronous REST JSON.
FILES_ALLOWED: src/server/index.ts (EDIT — add routes + orchestrator param), src/tests/http-runs-api.test.ts (CREATE), package.json (EDIT — append test path), README.md (EDIT), CHANGELOG.md (EDIT), .agent-os/runs/2026-07-05-p12-runs-api-surface/**
FILES_FORBIDDEN: src/runtime/**, src/agent/**, src/integration/**, src/skills/**, src/models/**, src/governance/**, src/mcp/**, src/release/**, .agent-os/node-runner.config.json, .mcp.json, .env, .github/**, skills/ECC/**
VALIDATION_BASELINE:
  - lint: PASS (tsc --noEmit, 0 errors)
  - test: PASS (25 files / 279 tests)
  - build: PASS (tsc --noEmit && vite build)
  - verify:secrets: PASS (0 findings)
  - verify:release: READY (0 blocking reasons)
HANDOFF_PACKET:
```text
CURRENT_PHASE: P12_RUNS_API_SURFACE
SEALED_PHASES: P0,P1,P2,P3,P4.0,P4.1,P4.2,P5,P6,P7,P8,P9,P10,P11,GOV
CURRENT_NODE: N0_PRD_LOCK
STATUS: PASS
NEXT_MODEL: longcat
NEXT_NODE: N1_LONG_CONTEXT_ARCH_REVIEW
```