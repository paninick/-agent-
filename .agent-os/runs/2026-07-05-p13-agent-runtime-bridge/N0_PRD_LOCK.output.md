STATUS: PASS
NEXT_NODE: N1_LONG_CONTEXT_ARCH_REVIEW
NEXT_MODEL: longcat
BLOCKING_ISSUES: None
NON_BLOCKING_ISSUES: |
  - skills/ECC vendor lockfile drift remains documented non-blocking.
  - verify:release currently READY (0 blocking) — P12 committed at e80367d.
SCOPE:
  - Edit `src/agent/streamLaunchPlan.ts` — add `runId?` to `run_started` event type, add `approval_required` event type.
  - Edit `src/server/index.ts` — add approval gate: create runtime run before streamLaunchPlan, intercept run_started to inject runId, intercept run_completed to emit approval_required, pendingApprovals Map for coordinating approve→SSE resume, wire `/api/runs/:runId/approve` to check pendingApprovals. Change `orchestrator` param from default to optional (`orchestrator?`), use internal `_orchestrator`.
  - Create `src/tests/agent-runtime-bridge.test.ts` — ~10-12 tests covering full approval lifecycle.
  - Edit `package.json` — append test path.
  - Edit `README.md` + `CHANGELOG.md` — P13 sections.
NON_GOALS:
  - No src/agent/streamLaunchPlan.ts logic changes — only type additions.
  - No src/runtime/** changes — sealed.
  - No src/integration/**, src/models/**, src/skills/**, src/mcp/**, src/governance/**, src/release/** changes.
  - No new npm dependencies.
  - No real API calls.
  - No CI/channel/headless.
  - No skills/ECC internal commit.
FILES_ALLOWED: src/agent/streamLaunchPlan.ts (EDIT — type only), src/server/index.ts (EDIT), src/tests/agent-runtime-bridge.test.ts (CREATE), package.json (EDIT), README.md (EDIT), CHANGELOG.md (EDIT), .agent-os/runs/2026-07-05-p13-agent-runtime-bridge/**
FILES_FORBIDDEN: src/runtime/**, src/integration/**, src/models/**, src/skills/**, src/mcp/**, src/governance/**, src/release/**, .agent-os/node-runner.config.json, .mcp.json, .env, .github/**, skills/ECC/**
VALIDATION_BASELINE:
  - lint: PASS (tsc --noEmit, 0 errors)
  - test: PASS (26 files / 292 tests)
  - build: PASS
  - verify:secrets: PASS (0 findings)
  - verify:release: READY (0 blocking)
HANDOFF_PACKET:
```text
CURRENT_PHASE: P13_AGENT_RUNTIME_BRIDGE
SEALED_PHASES: P0,P1,P2,P3,P4.0,P4.1,P4.2,P5,P6,P7,P8,P9,P10,P11,P12,GOV
CURRENT_NODE: N0_PRD_LOCK
STATUS: PASS
NEXT_MODEL: longcat
NEXT_NODE: N1_LONG_CONTEXT_ARCH_REVIEW
```