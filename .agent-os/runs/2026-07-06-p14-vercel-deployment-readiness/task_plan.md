# P14 Task Plan

## Objective

Prepare Launch Desk for Vercel deployment without performing a real deploy or handling credentials.

P14 should add the minimal static/frontend + serverless/API Vercel shape for the existing Vite + Express app.

## Scope

Allowed files:

- `api/index.ts`
- `vercel.json`
- `tsconfig.json`
- `src/tests/vercel-deployment-readiness.test.ts`
- `package.json`
- `README.md`
- `CHANGELOG.md`
- `.agent-os/runs/2026-07-06-p14-vercel-deployment-readiness/**`

## Non-Goals

- No `src/runtime/**` changes.
- No `src/integration/**`, `src/models/**`, `src/skills/**`, `src/mcp/**`, `src/governance/**`, or `src/release/**` changes.
- No real Vercel deploy in this phase.
- No `.vercel/**` project link files.
- No Vercel token, API key, or credential handling.
- No GitHub Actions / GitLab CI / channel / headless automation.
- No `skills/ECC` internal commit or rollback.

## Validation

- `npx vercel --version`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm run verify:secrets`
- `npm run verify:release`

