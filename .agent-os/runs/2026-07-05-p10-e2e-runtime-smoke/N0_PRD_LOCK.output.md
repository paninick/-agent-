STATUS: PASS
NEXT_NODE: N1_LONG_CONTEXT_ARCH_REVIEW
NEXT_MODEL: longcat
BLOCKING_ISSUES: None
NON_BLOCKING_ISSUES: `skills/ECC` remains dirty as documented nested vendor lockfile drift (`package-lock.json` + `yarn.lock`). P8 `verify:release` reports it as non-blocking with `blockingReasons=[]`. P10 does not touch `skills/ECC` internals.
REQUIRED_ACTION: Send this run directory to N1 for long-context architecture review before any test implementation. Do not modify P0-P9 sealed semantics or `src/release` phase registry.
HANDOFF_PACKET:
```text
CURRENT_PHASE: P10_E2E_RUNTIME_SMOKE_TEST
SEALED_PHASES: P0,P1,P2,P3,P4.0,P4.1,P4.2,P5,P6,P7,P8,P9,GOV
CURRENT_NODE: N0_PRD_LOCK
STATUS: PASS
DECISION: P10 scope is locked as End-to-End Runtime Smoke Test — a new test-only phase that exercises the full agent run path (streamLaunchPlan → createLaunchDeskAgent → ModelGatewayModel → FakeModelGateway → SDK run → SSE events) to verify the integrated chain works end-to-end. No new production code; test + harness only.
SCOPE: Create `src/tests/e2e-runtime-smoke.test.ts` that (1) constructs a FakeModelGateway with a canned response, (2) calls streamLaunchPlan with a minimal LaunchInput, (3) collects all LaunchStreamEvent yields, (4) asserts the event sequence: run_started → (text_delta | tool_progress)* → run_completed. Add a FakeModelGateway variant that returns content containing a tool-call JSON block to verify tool_call extraction in the adapter. Add a second test that verifies skill content injection via createLaunchDeskAgent({ skillContent }) and ModelGatewayModel together. Add a third test that exercises ModelRouter → ModelGateway integration via selectModelForLaunchDesk. Update package.json test script to include the new file.
NON_GOALS: no new production code in src/agent/, src/integration/, src/skills/, src/models/; no real API calls (FakeModelGateway only); no real file IO (injected readFile); no SDK run() with real model (uses FakeModelGateway-backed ModelGatewayModel); no src/release phase registry changes; no .agent-os config changes; no skills/ECC internal commit; no CI/channel/headless automation; no new MCP transport; no governance hook invocation.
FILES_ALLOWED_FOR_N3: src/tests/e2e-runtime-smoke.test.ts (CREATE); package.json (EDIT — append test path only); .agent-os/runs/2026-07-05-p10-e2e-runtime-smoke/** (status tracking)
FILES_FORBIDDEN_FOR_N3: src/agent/**, src/integration/**, src/skills/**, src/models/**, src/runtime/**, src/governance/**, src/mcp/**, src/release/**, .agent-os/node-runner.config.json, .mcp.json, .env, .github/**, skills/ECC/**
IMPLEMENTATION_FILES_PROPOSED_FOR_N2_REVIEW: src/tests/e2e-runtime-smoke.test.ts; package.json (line 12 test script append only)
VALIDATION_COMMANDS_PROPOSED: npm run lint; npm run typecheck; npm test; npm run build; npm run verify:release
BOUNDARY_WARNINGS: skills/ECC vendor lockfile drift remains documented non-blocking. P10 is test-only — no sealed layer modifications.
TEST_MATRIX_PROPOSED: (1) happy path — FakeModelGateway returns text, streamLaunchPlan yields run_started + text_delta + run_completed; (2) tool-call path — FakeModelGateway returns content with embedded tool_call JSON, adapter extracts FunctionCallItem; (3) skill injection — createLaunchDeskAgent with skillContent + ModelGatewayModel, verify instructions contain skill block; (4) ModelRouter integration — selectModelForLaunchDesk picks available model, fallback chain filtered through gateway; (5) error path — FakeModelGateway errorOverride, streamLaunchPlan yields error event; (6) boundary — e2e test does not call fetch, does not touch sealed layers.
NEXT_MODEL: longcat
NEXT_NODE: N1_LONG_CONTEXT_ARCH_REVIEW
```
