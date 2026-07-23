# P13 Task Plan

## Objective

Bridge the Launch Desk agent SSE stream with the existing P1/P12 runtime approval surface.

P13 should let `/api/launch-plan` expose a runtime `runId`, emit an `approval_required` SSE event after agent generation completes, and coordinate `/api/runs/:runId/approve` or `/api/runs/:runId/reject` with the open SSE response.

## Scope

Allowed files:

- `src/agent/streamLaunchPlan.ts`
- `src/server/index.ts`
- `src/tests/agent-runtime-bridge.test.ts`
- `package.json`
- `README.md`
- `CHANGELOG.md`
- `.agent-os/runs/2026-07-05-p13-agent-runtime-bridge/**`

## Non-Goals

- No `src/runtime/**` changes.
- No `src/integration/**`, `src/models/**`, `src/skills/**`, `src/mcp/**`, `src/governance/**`, or `src/release/**` changes.
- No new npm dependencies.
- No real API calls beyond existing runtime behavior.
- No real MCP.
- No credentials, CI, channels, headless automation, or UI rewrite.
- No `skills/ECC` internal commit or rollback.

## Validation

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm run verify:secrets`
- `npm run verify:release`

