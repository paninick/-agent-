# P9 Node Runner Config Sync Input Handoff

CURRENT_PHASE: P9_NODE_RUNNER_CONFIG_SYNC
SEALED_PHASES: P0,P1,P2,P3,P4.0,P4.1,P4.2,P5,P6,P7,P8,GOV
CURRENT_NODE: N0_PRD_LOCK
STATUS: READY_FOR_PRD_LOCK

## Background

P8 has been sealed at `agent-os-v2-p8-sealed` / `584cda01`.

P8 completed:

- `src/release/` static release governance layer.
- `npm run verify:release`.
- P8 release seal document.
- Release registry includes P8.

Known non-blocking boundary:

- `skills/ECC` remains dirty only as documented nested vendor lockfile drift.
- `.agent-os/node-runner.config.json` and `.agent-os/node-runner.yaml` still name P4.1 as current phase.

## P9 Candidate

P9 should synchronize Agent Node Runner local configuration with the sealed project state.

The goal is not to change runtime behavior or sealed phase semantics. The goal is to make local node-runner prompts, sealed phase lists, validation commands, and current run metadata reflect P8/P9 instead of stale P4.1 state.

## Prohibitions

- Do not modify P0-P8 sealed semantics.
- Do not change `src/runtime`, `src/models`, `src/governance`, `src/mcp`, or `src/intelligence`.
- Do not connect real MCP.
- Do not create `.mcp.json`.
- Do not read or commit API key / token / credential files.
- Do not add GitHub Actions, GitLab CI, Slack, channels, headless, or scheduled automation.
- Do not commit or revert `skills/ECC` internal lockfile drift.

## HANDOFF_PACKET

```text
CURRENT_PHASE: P9_NODE_RUNNER_CONFIG_SYNC
SEALED_PHASES: P0,P1,P2,P3,P4.0,P4.1,P4.2,P5,P6,P7,P8,GOV
CURRENT_NODE: N0_PRD_LOCK
STATUS: READY_FOR_PRD_LOCK
FILES_ALLOWED: .agent-os/runs/2026-07-05-p9-node-runner-config-sync/**
FILES_FORBIDDEN: src/* semantic changes, package.json, .env, .mcp.json, .github/*, .gitlab-ci.yml, credential files, skills/ECC internal files
RULES_LOCKED: P9 is PRD lock only until N1/N2 pass.
TESTS_REQUIRED: N0 requires output-field validation and secret scan only; implementation validation is deferred until N3/N5.
BOUNDARY_WARNINGS: node-runner config still names P4.1; skills/ECC vendor lockfile drift remains.
NEXT_MODEL: glm-5.2
NEXT_NODE: N0_PRD_LOCK
```
