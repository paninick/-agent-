# P8 Task Plan

## Objective

Lock P8 as a local release governance console / command layer that turns the existing sealed phase evidence into repeatable machine-checkable reports.

## Scope

P8 may later implement:

- Release phase registry: machine-readable list of sealed phases, tags, commits, validation baselines, and known limitations.
- Validation baseline report: current status of `lint`, `typecheck`, `test`, `build`, `verify:all`, and `verify:intelligence`.
- Vendor dirty report: explicit classification of nested vendor repository drift such as `skills/ECC`.
- Skills health report: static scan summary for local skill descriptors, missing files, low-availability skills, and token footprint.
- Handoff packet generator: normalized next-phase packet from release status.
- `verify:release`: local aggregate command that runs bounded checks and emits JSON / Markdown summaries.

## Non-Goals

- No real MCP integration.
- No real external service integration.
- No API key / token / credential handling.
- No GitHub Actions or GitLab CI.
- No Slack / channel / headless / scheduled task.
- No UI rewrite.
- No changes to sealed P0-P7 semantics.
- No `skills/ECC` internal commit or rollback.

## Suggested Future Implementation Files

These are proposals for N1/N2 review, not authorization yet:

- `src/release/types.ts`
- `src/release/phaseRegistry.ts`
- `src/release/validationBaseline.ts`
- `src/release/vendorStatus.ts`
- `src/release/skillsHealth.ts`
- `src/release/handoffPacket.ts`
- `src/release/index.ts`
- `scripts/verify-release.ts`
- `src/tests/release-governance.test.ts`
- `docs/RELEASE_GOVERNANCE_CONSOLE_RUNBOOK_CN.md`
- `README.md`
- `CHANGELOG.md`
- `package.json` only if adding `verify:release`
- `outputs/intelligence/verification-latest.json` only as a validation artifact refreshed by `verify:all`

## Validation Proposal

Future N5 should require:

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm run verify:all`
- `npm run verify:release` if added

## Current N0 Done Criteria

- PRD scope locked.
- non-goals and prohibitions explicit.
- sealed phase boundaries preserved.
- handoff packet ready for N1 long-context architecture review.
