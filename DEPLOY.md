# Deploy: Launch Desk + v3

Production is **not** zero-config. Local/dev can use in-memory storage and auth off; production fails closed.

## Target

| Layer | Target |
|-------|--------|
| Frontend + serverless API | [Vercel](https://vercel.com) (`vercel.json` → `api/index.ts`, SPA `dist/client`) |
| Database | PostgreSQL via Neon (`DATABASE_URL` / Neon env vars) |
| Auth | JWT auth **must** be enabled in production |

## Production gates (hard requirements)

Server startup throws unless **all** of the following hold:

1. `AUTH_ENABLED=true`
2. Persistent store configured (Neon / `DATABASE_URL` — not in-memory)
3. Auth secrets present (`JWT_SECRET` / related keys from `.env.example`)

Optional but recommended: `OPENAI_API_KEY`, intelligence L1 keys, Sentry, CORS origins.

See `.env.example` for the full variable list.

## Deploy steps (Vercel)

```bash
git clone --recurse-submodules https://github.com/paninick/-agent-.git
cd ./-agent-
npm ci
npm run build
# Link project once: vercel link
vercel --prod
```

Or connect the GitHub repo in the Vercel dashboard (build: `npm run build`, output: `dist/client` per `vercel.json`).

### Environment variables on Vercel

Minimum for a live production process:

- `AUTH_ENABLED=true`
- `DATABASE_URL` (Neon connection string) **or** equivalent Neon vars used by the app
- `JWT_SECRET` (long random)
- `OPENAI_API_KEY` (Launch Desk / agents)
- `CORS_ORIGIN` / allowed origins as needed

Without these, the serverless function will not pass production startup checks.

## Verify before go-live

```bash
npm ci
npm run typecheck
npm run test
npm run build
npm run verify:skills   # needs submodules
# optional with real keys:
npm run verify:intelligence
npm run verify:stream   # local server + OPENAI_API_KEY
```

CI (`v3-verify`) runs typecheck, secret scan, skills audit, vitest, and build on `main` (also `workflow_dispatch` and daily schedule).

## Not included in CI deploy

There is **no** automated production deploy from GitHub Actions. Release = green CI + manual Vercel (or other host) with secrets configured.

## Related docs

- [README.md](./README.md) — local setup
- [V3-README.md](./V3-README.md) / [HANDOVER.md](./HANDOVER.md) — product architecture
- [LICENSE](./LICENSE) — MIT
