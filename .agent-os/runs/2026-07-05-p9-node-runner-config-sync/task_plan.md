# P9 Task Plan

## Objective

Lock P9 as Agent Node Runner Config Sync.

P9 should align local node-runner configuration and documentation with the sealed P8 state while preserving P0-P8 sealed implementation semantics.

## Scope

P9 may later update:

- `.agent-os/node-runner.config.json`
- `.agent-os/node-runner.yaml`
- `.agent-os/runs/2026-07-05-p9-node-runner-config-sync/**`
- `docs/AGENT_NODE_RUNNER_MVP_CN.md`
- `CHANGELOG.md`
- optionally `scripts/agent-node-runner.mjs` only if N1/N2 approve a minimal config-loading or run-alias fix

## Required Sync Targets

- `currentPhase` should reflect P9 or the latest active run.
- `sealedPhases` should include P0-P8 and GOV.
- N5 validation command list should include `npm run verify:release`.
- Current run metadata should point to the P9 run directory.
- Docs should clarify that runner config is an operator convenience file, not a sealed phase truth source.

## Non-Goals

- No P0-P8 sealed semantic changes.
- No runtime integration.
- No real MCP.
- No API key / credential handling.
- No CI / channel / headless automation.
- No UI work.
- No `skills/ECC` internal commit or rollback.

## Suggested Validation

Future N5 should require:

- `node scripts/agent-node-runner.mjs check-output --run 2026-07-05-p9-node-runner-config-sync --node N0_PRD_LOCK`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm run verify:release`

`npm run verify:all` may be run if the implementation changes validation docs or output artifacts, but P9 should avoid unnecessary external-source probe churn.

## Current N0 Done Criteria

- P9 scope locked.
- non-goals and prohibitions explicit.
- P0-P8 sealed boundaries preserved.
- handoff packet ready for N1 long-context architecture review.
