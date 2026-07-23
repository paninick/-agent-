# Agent OS v2 P15 Vercel Deployment Execution Gate

## Status

P15 is a deployment execution gate, not a credential implementation.

P14 sealed the repository readiness shape for Vercel:

- `api/index.ts` exports the existing Express app through `createApp()`.
- `vercel.json` declares the static output directory and API/SPA rewrites.
- TypeScript and tests cover the Vercel entry/config shape.

P15 defines the required operator steps before any real Vercel build or deploy can be treated as release evidence.

## Scope

Allowed in P15:

- Document the Vercel auth and project-link gate.
- Document the manual deploy command sequence.
- Record local verification evidence.
- Keep deployment credentials outside the repository.
- Keep `.vercel/**` out of committed source control.

Forbidden in P15:

- Do not read, print, or commit `VERCEL_TOKEN`.
- Do not commit `.vercel/project.json` or `.vercel/repo.json`.
- Do not add GitHub Actions, GitLab CI, Slack, channels, headless automation, or scheduled deploys.
- Do not change sealed P0-P14 runtime semantics.
- Do not modify `src/runtime/**`, `src/integration/**`, `src/models/**`, `src/skills/**`, `src/mcp/**`, `src/governance/**`, or `src/release/**`.
- Do not deploy production automatically from an agent without an explicit future deployment PRD.

## Auth Gate

Real Vercel CLI deployment requires a valid local login or a valid token supplied outside the repository.

Valid operator paths:

```bash
vercel login
vercel whoami
```

or, in a secure external shell/CI context:

```bash
vercel whoami
```

If an operator uses token-based auth, the token must be supplied by a secure external secret store and must not be placed in `.env`, `.env.local`, `AGENTS.md`, `CLAUDE.md`, skills, MCP descriptors, run artifacts, command logs, or source files.

## Project Link Gate

The project must be linked before `vercel pull`, `vercel build`, or `vercel deploy` can be used as release evidence.

Expected local operator sequence:

```bash
vercel link
vercel pull --yes
```

`.vercel/**` files may be created locally by the CLI, but they must not be committed. If a future CI phase requires `VERCEL_ORG_ID` or `VERCEL_PROJECT_ID`, they must be configured as masked CI secrets or generated from a trusted external setup flow, not checked into the repo.

## Deploy Gate

After auth and project linking are valid, the operator can run:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run verify:secrets
npm run verify:release
vercel build --yes
vercel deploy --prebuilt
```

Production deployment remains a separate explicit action:

```bash
vercel deploy --prebuilt --prod
```

P15 does not approve production deployment automatically. A future release node must record the deployment URL, target, status, commit, build duration, and post-deploy log scan before production can be considered sealed.

## Current Evidence

Current local status:

- Vercel CLI is installed and can report a version.
- Repository readiness checks pass.
- `vercel build --yes` is blocked by invalid Vercel authentication in the current environment.
- `vercel whoami` did not produce a successful identity check in the current environment.
- No token was read, printed, or committed.
- No `.vercel/**` project link files were committed.

## Release Evidence Required

P15 can only advance from gate documentation to real deployment when all of the following evidence exists:

- `vercel whoami` returns a valid account/team identity without exposing secrets.
- `vercel link` completes for the intended Vercel project.
- `vercel pull --yes` completes without committing generated credentials or project ids.
- `vercel build --yes` passes.
- `vercel deploy --prebuilt` returns a preview URL.
- Optional production seal requires `vercel deploy --prebuilt --prod` plus post-deploy verification.

## Boundary

P15 keeps deployment execution separate from application runtime. It does not add a Vercel API client, does not add CI/CD automation, does not add secret management, and does not convert P14 readiness into proof of a live deployment.
