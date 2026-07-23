# P10 E2E Runtime Smoke Test — Task Plan

## Phase: P10_E2E_RUNTIME_SMOKE_TEST

## Goal
Create end-to-end runtime smoke tests that exercise the full agent run path through `streamLaunchPlan` with a `FakeModelGateway`-backed `ModelGatewayModel`, verifying the complete SSE event chain and skill injection integration.

## Scope
- `src/tests/e2e-runtime-smoke.test.ts` (CREATE)
- `package.json` (EDIT — append test path to `test` script)
- `.agent-os/runs/2026-07-05-p10-e2e-runtime-smoke/**` (status tracking)

## Non-Goals
- No new production code
- No real API calls or file IO
- No sealed layer modifications
- No skills/ECC internal changes

## Test Matrix (6 tests)
1. Happy path — text response → run_started + text_delta + run_completed
2. Tool-call extraction — embedded JSON tool_call in content
3. Skill injection — skillContent + ModelGatewayModel together
4. ModelRouter integration — selectModelForLaunchDesk
5. Error path — gateway error → error event
6. Boundary — no fetch, no sealed layer imports

## Nodes
- [x] N0 PRD Lock — PASS
- [ ] N1 Arch Review
- [ ] N2 Tech Review
- [ ] N3 Implementation
- [ ] N4 File Structure
- [ ] N5 Validation
- [ ] N6 Doc Sync
- [ ] N7 Release Seal
