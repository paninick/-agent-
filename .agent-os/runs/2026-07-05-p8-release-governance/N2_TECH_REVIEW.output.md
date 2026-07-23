STATUS: PASS
NEXT_NODE: N3_IMPLEMENTATION
NEXT_MODEL: doubao-seed-2.0-code / Codex
BLOCKING_ISSUES: None
NON_BLOCKING_ISSUES: The first implementation should keep `verify:release` bounded and not run full `npm test` internally by default; full validation remains N5 responsibility. The command may read Git status through local `git` commands but must not mutate Git state.
REQUIRED_ACTION: Implement P8 as a static local release governance/report layer. Add focused tests for happy path, safe failure path, and boundary protection path.
HANDOFF_PACKET:
```text
CURRENT_PHASE: P8_RELEASE_GOVERNANCE_CONSOLE
SEALED_PHASES: P0,P1,P2,P3,P4.0,P4.1,P4.2,P5,P6,P7,GOV
CURRENT_NODE: N2_TECH_REVIEW
STATUS: PASS
DECISION: P8 implementation is approved as a new `src/release/` layer plus `scripts/verify-release.ts`, tests, runbook, README, CHANGELOG, and package script.
FILES_ALLOWED_FOR_N3: src/release/**; scripts/verify-release.ts; src/tests/release-governance.test.ts; docs/RELEASE_GOVERNANCE_CONSOLE_RUNBOOK_CN.md; README.md; CHANGELOG.md; package.json; outputs/intelligence/verification-latest.json; .agent-os/runs/2026-07-05-p8-release-governance/**
FILES_FORBIDDEN_FOR_N3: src/runtime/**; src/models/**; src/governance/**; src/mcp/**; src/intelligence/** semantic changes; .env; .mcp.json; .github/**; .gitlab-ci.yml; credential files; skills/ECC internal files
TYPES_TO_ADD: ReleasePhaseRecord; ValidationBaseline; ValidationCheckResult; VendorDirtyReport; SkillsHealthReport; ReleaseHandoffPacket; ReleaseGovernanceSnapshot
MODULES_TO_ADD: phaseRegistry.ts; validationBaseline.ts; vendorStatus.ts; skillsHealth.ts; handoffPacket.ts; releaseGovernance.ts; index.ts
COMMAND_TO_ADD: `npm run verify:release` via `tsx scripts/verify-release.ts`
COMMAND_BEHAVIOR: read-only; no API calls; no credential reads; no Git mutation; exit non-zero only for structural release-governance failures or blocking dirty state outside documented vendor exceptions.
TESTS_REQUIRED: release snapshot creation; sealed phase registry includes P0-P7/GOV; vendor dirty report classifies skills/ECC lockfile drift as documented non-blocking; unexpected dirty file blocks; skills health handles missing root safely; handoff packet includes current/next phase fields; verify-release script remains static/read-only by construction.
VALIDATION_COMMANDS: npm run lint; npm run typecheck; npm test; npm run build; npm run verify:all; npm run verify:release
BOUNDARY_WARNINGS: Do not fix node-runner config drift in this implementation unless separately documented as allowed; report it as a warning.
NEXT_MODEL: doubao-seed-2.0-code / Codex
NEXT_NODE: N3_IMPLEMENTATION
```
