STATUS: PASS
NEXT_NODE: N3_IMPLEMENTATION
NEXT_MODEL: doubao-seed-2.0-code / Codex
BLOCKING_ISSUES: None
NON_BLOCKING_ISSUES: `skills/ECC` vendor lockfile drift remains documented non-blocking. The `streamLaunchPlan` module-level `node:fs` scan of `skills/ECC/skills` runs on first `getSkillRegistry()` call — in tests this will scan the real directory (277 SKILL.md files), adding ~50ms overhead per test run. Acceptable for a smoke test; if it becomes a bottleneck, set `SKILLS_ROOT` env to a non-existent path before import to skip scanning.
REQUIRED_ACTION: Proceed to N3 Implementation. Build the test file + injection exports per the tech spec below. Run all validation commands after.
HANDOFF_PACKET:
```text
CURRENT_PHASE: P10_E2E_RUNTIME_SMOKE_TEST
SEALED_PHASES: P0,P1,P2,P3,P4.0,P4.1,P4.2,P5,P6,P7,P8,P9,GOV
CURRENT_NODE: N2_TECH_REVIEW
STATUS: PASS

TECH_SPEC:

== Test Injection Exports (src/agent/streamLaunchPlan.ts, ≤15 lines) ==
- export function setGateway(gw: ModelGateway): resets _gateway singleton. Default lazy init preserved when not called.
- export function setSkillRegistry(reg: SkillRegistry): resets _skillRegistry singleton. Default lazy scan preserved when not called.
- export function resetInjection(): clears _gateway, _router, _skillRegistry back to null (for test cleanup / afterEach).

== Test File: src/tests/e2e-runtime-smoke.test.ts ==
Framework: vitest (describe/it/expect/vi)
Imports: from "../agent/streamLaunchPlan", "../agent/launchAgent", "../agent/modelGatewayAdapter", "../agent/modelRouterIntegration", "../integration", "../skills", "../models"

== Test Matrix (8 tests) ==

1. HAPPY PATH — text response
   - Setup: FakeModelGateway with { "test-model": { content: "Release plan ready." } }
   - Action: setGateway(fake); setUseModelGateway(true); call streamLaunchPlan(validInput)
   - Assert: yields run_started (model="test-model") → text_delta(s) containing "Release plan ready." → run_completed
   - Cleanup: resetInjection()

2. SKILL INJECTION — instructions contain skill block
   - Setup: FakeModelGateway; createLaunchDeskAgent({ skillContent: "## Loaded Skills\n\n### Skill: test", model: new ModelGatewayModel(gw, "m") })
   - Assert: agent.instructions contains "Loaded Skills" AND "Launch Desk"
   - Note: does NOT call streamLaunchPlan (agent construction only)

3. MODEL ROUTER INTEGRATION — selectModelForLaunchDesk picks available model
   - Setup: FakeModelGateway with { "deepseek-v4-flash": { content: "ok" } }; StaticModelRouter
   - Action: selectModelForLaunchDesk(router, gateway, launchDeskSelectionRequest(), "default")
   - Assert: result.ok === true; result.modelId === "deepseek-v4-flash"; result.fallbackModelIds filtered through gateway.getAvailableModels()

4. MODEL ROUTER FALLBACK — selected model not in gateway
   - Setup: FakeModelGateway with { "longcat-v1": { content: "ok" } } (no deepseek)
   - Action: selectModelForLaunchDesk(router, gateway, request, "default-model")
   - Assert: result.ok === false; result.modelId === "longcat-v1" (first available); reason mentions fallback

5. ERROR PATH — gateway error
   - Setup: FakeModelGateway with errorOverrides [{ errorKind: "auth_failed", message: "bad key" }]
   - Action: setGateway(fake); streamLaunchPlan(validInput)
   - Assert: yields run_started → error (message contains "ModelGateway")
   - Cleanup: resetInjection()

6. EMPTY CONTENT — gateway returns empty string
   - Setup: FakeModelGateway with { "m": { content: "" } }
   - Action: setGateway(fake); streamLaunchPlan(validInput)
   - Assert: yields run_started → (no text_delta) → run_completed OR error
   - Note: SDK run() may throw on empty model output — test should handle both outcomes (try/catch, assert at least run_started)

7. TOOL-CALL EXTRACTION — adapter parses embedded tool_call JSON
   - Setup: FakeModelGateway with { "m": { content: '```json\n{"tool_calls":[{"id":"c1","function":{"name":"extract_tasks","arguments":"{}"}}]}\n```' } }
   - Action: new ModelGatewayModel(gw, "m"); adapter.getResponse(modelRequest)
   - Assert: response.output contains a FunctionCallItem with name="extract_tasks"
   - Note: this tests parseContentToOutput, not full streamLaunchPlan

8. BOUNDARY — no fetch, no sealed layer cross-imports
   - Assert: vitest spy on globalThis.fetch; after streamLaunchPlan run, fetch NOT called
   - Assert: e2e test file imports only from ../agent, ../integration, ../skills, ../models (no ../runtime, ../governance, ../mcp, ../release)

== Validation Criteria ==
- All 8 tests pass
- Existing 261 tests still pass (no regressions)
- lint (tsc --noEmit): 0 errors
- build (vite): pass
- verify:release: releaseStatus=ready, blockingReasons=[]
- New test count: 261 + 8 = 269 expected

== Risk Assessment ==
- Risk: SDK run() with a custom Model may trigger unexpected behavior (e.g., tool-call loop that never terminates). Mitigation: FakeModelGateway returns non-tool-call content by default; maxTurns: 8 in streamLaunchPlan provides a safety cap.
- Risk: streamLaunchPlan module-level fs scan may fail in CI. Mitigation: try/catch already wraps the scan; set SKILLS_ROOT to non-existent path if needed.
- Risk: setGateway leak between tests. Mitigation: afterEach(() => resetInjection()).

NEXT_MODEL: doubao-seed-2.0-code / Codex
NEXT_NODE: N3_IMPLEMENTATION
```
