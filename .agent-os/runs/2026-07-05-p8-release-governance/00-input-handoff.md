# P8 Release Governance Console Input Handoff

CURRENT_PHASE: P8_RELEASE_GOVERNANCE_CONSOLE
SEALED_PHASES: P0,P1,P2,P3,P4.0,P4.1,P4.2,P5,P6,P7,GOV
CURRENT_NODE: N0_PRD_LOCK
STATUS: READY_FOR_PRD_LOCK

## Background

P7 has been sealed at `agent-os-v2-p7-sealed` / `7bee5250`.

Fresh validation baseline from P7:

- `npm run lint`: PASS
- `npm run typecheck`: PASS
- `npm test`: PASS, 22 files / 252 tests
- `npm run build`: PASS
- `npm run verify:all`: PASS
- `verify:intelligence`: PASS with 23 sources / 4 healthy / 18 degraded / 1 failed / containsSecrets=false

Known non-blocking boundary:

- `skills/ECC` is a nested git repository tracked as a gitlink.
- No `.gitmodules` exists.
- It remains dirty only inside `skills/ECC/package-lock.json` and `skills/ECC/yarn.lock`.
- This is documented in `docs/VENDOR_NESTED_REPO_STATUS_CN.md`.

## P8 Candidate

P8 should implement a local static release governance layer:

- sealed phase registry
- validation baseline registry
- vendor dirty report
- skills registry health report
- release handoff packet generator
- `verify:release` aggregation command

## Prohibitions

- Do not change sealed P0-P7 semantics.
- Do not connect real MCP.
- Do not create `.mcp.json`.
- Do not read or commit API key / token / credential files.
- Do not add GitHub Actions, GitLab CI, Slack, channels, headless, or scheduled automation.
- Do not implement a UI rewrite.
- Do not commit or revert `skills/ECC` internal lockfile drift without an explicit vendor decision.

## HANDOFF_PACKET

```text
CURRENT_PHASE: P8_RELEASE_GOVERNANCE_CONSOLE
SEALED_PHASES: P0,P1,P2,P3,P4.0,P4.1,P4.2,P5,P6,P7,GOV
CURRENT_NODE: N0_PRD_LOCK
STATUS: READY_FOR_PRD_LOCK
FILES_ALLOWED: .agent-os/runs/2026-07-05-p8-release-governance/**
FILES_FORBIDDEN: src/* semantic changes, package.json, .env, .mcp.json, .github/*, .gitlab-ci.yml, credential files, skills/ECC internal files
RULES_LOCKED: P8 is PRD lock only until N1/N2 pass.
TESTS_REQUIRED: N0 requires output-field validation only; implementation validation is deferred until N3/N5.
BOUNDARY_WARNINGS: node-runner config still names P4.1 and must not be treated as current P8 runtime truth until a future allowed config-sync patch.
NEXT_MODEL: glm-5.2
NEXT_NODE: N0_PRD_LOCK
```
