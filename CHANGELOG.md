# Changelog

## 2026-07-24

### Release Integrity and Production Safety Hotfix

- Declared all ten pinned third-party skill repositories in `.gitmodules`; a
  recursive clone now reconstructs the recorded vendor tree.
- Made CI initialize submodules, use reproducible installs, enforce the skill
  integrity gate, and block high-severity production dependency advisories.
- Made production startup fail closed unless authentication and PostgreSQL
  persistence are explicitly enabled and configured.
- Fixed CRLF skill frontmatter discovery and stabilized deterministic tests and
  bounded test concurrency.
- Updated the dependency lockfile to remove the previously reported high
  severity production advisory. Remaining moderate advisories are documented
  upstream transitive dependencies and are not silently force-downgraded.
- No credentials, external deployment, MCP connection, or N7 seal action was
  performed.

## 2026-07-06

### P17 Visual Brand Assets

- Generated two 4K brand assets using Seedream 5.0 (free platform quota): `public/favicon.jpeg` (4096×4096 app icon — white rocket on indigo-to-blue gradient) and `public/og-banner.jpeg` (4096×2304 hero banner — isometric launch pipeline illustration). Both assets are ultra-high-definition 4K.
- Updated `index.html` with favicon link, page description, Open Graph meta tags (type, title, description, image, dimensions), and Twitter Card meta tags (summary_large_image, title, description, image).
- No `src/*` code changes, no `package.json` changes, no `vite.config.ts` changes, no `tsconfig.json` changes, no new npm dependencies, no CI/channel/headless automation, no API keys or credentials in source, and no `skills/ECC` internal commit or rollback.
- Image generation used the platform profile free Seedream 5.0 quota (29 images remaining after this phase — 4 consumed total across 2K draft + 4K final). No video tokens were consumed. No paid API calls were made.

### P16 Client UI Component Test

- Added `src/tests/client-ui.test.tsx` — the project's first client-side React component test file. 13 tests in 5 sections: `parseSseBlock` helper (3), `Field` component rendering + interaction (3), `App` initial render & form state (3), `App` SSE stream consumption (3), and a fetch boundary assertion (1). Uses `// @vitest-environment jsdom` file-level pragma, React's own `act` utility, and `ReadableStream`/`TextDecoder` polyfills — zero new npm dependencies.
- Updated `src/client/main.tsx` to export `App`, `Field`, `parseSseBlock`, and types for testability. Guarded the `createRoot` side-effect with `typeof document !== "undefined"` so test imports don't require a DOM `#root` element. Added a minimal robustness fix: `parsed.type` defaults to the SSE `event:` field when the JSON data payload lacks an explicit `type`.
- Updated `package.json` test script to include `src/tests/client-ui.test.tsx`.
- No `src/runtime/**`, `src/agent/**`, `src/server/**`, `src/integration/**`, `src/models/**`, `src/skills/**`, `src/mcp/**`, `src/governance/**`, `src/release/**`, `api/**`, `vercel.json`, `vite.config.ts`, or `tsconfig.json` changes. No new npm dependencies, no real API calls, no real browser, no CI/channel/headless automation, and no `skills/ECC` internal commit or rollback.

### P15 Vercel Deployment Execution Gate

- Added `docs/AGENT_OS_V2_P15_VERCEL_DEPLOYMENT_EXECUTION_GATE_CN.md` to define the auth gate, project-link gate, deploy command sequence, release evidence required, and production deploy boundary after P14 readiness.
- Added `.agent-os/runs/2026-07-06-p15-vercel-deployment-execution-gate/` N0-N3 run artifacts for the documentation-only gate.
- Updated README with the P15 execution gate summary.
- Documentation-only change: no `src/*`, `api/*`, `vercel.json`, package files, `.vercel/**`, `.env*`, CI files, or credential-bearing files were modified.
- No real Vercel deploy, no Vercel token handling, no `.vercel/**` link files, no CI/channel/headless automation, no sealed runtime semantic changes, and no `skills/ECC` internal commit or rollback.

## 2026-07-05

### P14 Vercel Deployment Readiness

- Added `vercel.json` with `npm run build`, `dist/client` output, `/api/*` rewrite to the serverless entry, and SPA fallback to `index.html`.
- Added `api/index.ts`, which exports the existing Express `createApp()` as the Vercel serverless handler.
- Updated `tsconfig.json` to include `api` files in TypeScript validation.
- Added `src/tests/vercel-deployment-readiness.test.ts` covering Vercel config shape, API handler export, TypeScript inclusion, and absence of Vercel token/project id material.
- Updated the test script to include the P14 readiness test.
- No real Vercel deploy, no `.vercel/**` link files, no Vercel token handling, no CI/channel/headless automation, no sealed runtime semantic changes, and no `skills/ECC` internal commit or rollback.

### P13 Agent Runtime Bridge

- Added `runId?: string` and `approval_required` to Launch Desk SSE event typing in `src/agent/streamLaunchPlan.ts`.
- Updated `src/server/index.ts` so `/api/launch-plan` can create a runtime run when an orchestrator is injected, attach `runId` to `run_started`, emit `approval_required`, and coordinate active SSE approval/rejection through `/api/runs/:runId/approve` and `/api/runs/:runId/reject`.
- Preserved backward compatibility: `createApp(gateway)` still emits `run_completed` directly with no approval gate; the runtime bridge is active only when `createApp(gateway, orchestrator)` is used.
- Added `src/tests/agent-runtime-bridge.test.ts` covering runId propagation, approval_required, approve/resume completion, reject error path, audit lifecycle, backward compatibility, gateway error status, and fetch boundary.
- Updated the test script to include the P13 test file.
- No `src/runtime/**` changes, no sealed runtime semantic changes, no real MCP/API integration, no new dependencies, no CI/channel/headless automation, and no `skills/ECC` internal commit or rollback.

### P12 Runs API Surface

- Added 7 REST endpoints to `src/server/index.ts` to expose the `SwarmOrchestrator` approval/resume workflow over HTTP: `POST /api/runs`, `GET /api/runs`, `GET /api/runs/:runId`, `POST /api/runs/:runId/approve`, `POST /api/runs/:runId/reject`, `POST /api/runs/:runId/resume`, `GET /api/runs/:runId/audit`.
- Extended `createApp` factory with a second optional `orchestrator?: SwarmOrchestrator` parameter — backward-compatible with P11 tests that call `createApp(gw)`.
- Added `src/tests/http-runs-api.test.ts` — 13 HTTP integration tests using Node built-in `http` module: run creation (201, 400 for missing/empty intent), run listing, run state retrieval (200 + 404), approve/reject/resume lifecycle (happy path + 409 invalid state), and audit event retrieval.
- Updated `package.json` test script to include the new file.
- No `src/runtime/**` changes — sealed layer. No `src/agent/**`, `src/integration/**`, `src/models/**`, `src/skills/**`, `src/mcp/**`, `src/governance/**`, `src/release/**` changes. No new npm dependencies, no real API calls, no CI/channel/headless automation, and no `skills/ECC` internal commit.

### P11 HTTP/SSE Integration Test

- Added `src/tests/http-sse-integration.test.ts` — 10-test HTTP-level integration covering `GET /api/health` (ok flag, availableModels, hasProviderKey) and `POST /api/launch-plan` (SSE framing, happy path, Zod validation, missing fields, preflight failure, gateway error propagation, fetch boundary). Uses Node built-in `http` module only — zero new dependencies.
- Refactored `src/server/index.ts` to export a `createApp(gateway?)` factory so tests can inject a `FakeModelGateway` without starting the listener. Guarded `app.listen()` with an ESM entry-point check (`import.meta.url === pathToFileURL(process.argv[1]).href`).
- Fixed Express 5 wildcard route: `app.get("*", ...)` → `app.get("*path", ...)` — Express 5 requires named wildcard parameters.
- Updated `package.json` test script to include the new file.
- No `src/*` sealed semantic changes, no real MCP/API integration, no API key or credential handling, no CI/channel/headless automation, and no `skills/ECC` internal commit or rollback.

### P10 E2E Runtime Smoke Test

- Added `src/tests/e2e-runtime-smoke.test.ts` — 8-test end-to-end smoke covering the full agent run path: happy-path streaming, skill injection, `ModelRouter` integration + fallback, gateway error handling, tool-call extraction from embedded JSON, and a `fetch` boundary assertion.
- Added three minimal test-injection exports to `src/agent/streamLaunchPlan.ts` (`setGateway`, `setSkillRegistry`, `resetInjection`) so E2E tests can substitute a `FakeModelGateway` and an empty skill registry without scanning the filesystem. The production lazy-init path is unchanged — the exports only override module-level singletons.
- Relaxed `setGateway` parameter from the concrete `ModelGatewayImpl` to the `ModelGateway` interface so tests can inject fakes without provider config.
- Updated `package.json` test script to include the new file.
- No `src/*` sealed semantic changes, no real MCP/API integration, no API key or credential handling, no CI/channel/headless automation, and no `skills/ECC` internal commit or rollback.

### P9 Node Runner Config Sync

- Updated `.agent-os/node-runner.config.json` and `.agent-os/node-runner.yaml` from stale P4.1 metadata to P9 Node Runner Config Sync metadata.
- Expanded node-runner sealed phase metadata to include P0-P8 and GOV.
- Updated N3 implementation boundaries to the approved P9 config/docs/run metadata files plus one narrow `scripts/agent-node-runner.mjs` compatibility fix; `src/*`, `package.json`, `.mcp.json`, CI files, credentials, and `skills/ECC` internal files remain out of scope.
- Updated N5 validation command metadata to include `npm run verify:release`.
- Added `documentedDirtyFiles` / `documented_dirty_files` runner metadata and a narrow `check-diff` compatibility fix so documented `skills/ECC` vendor drift is reported without being attributed to the active node.
- Clarified in `docs/AGENT_NODE_RUNNER_MVP_CN.md` that node-runner config is operator convenience metadata, not canonical sealed-phase truth.
- No `src/*` semantic changes, no real MCP/API integration, no API key or credential handling, no CI/channel/headless automation, and no `skills/ECC` internal commit or rollback.

### P8 Release Governance Console

- Added `src/release/` as a local static release governance layer for sealed phase registry, validation baseline, vendor dirty report, skills health report, and Handoff Packet generation.
- Added `scripts/verify-release.ts` and `npm run verify:release`; the command is read-only and does not mutate Git state, connect external services, or read credentials.
- Added `src/tests/release-governance.test.ts` covering phase registry, validation artifact parsing, documented `skills/ECC` lockfile drift, unexpected dirty-file blocking, skills health, snapshot creation, and Handoff Packet formatting.
- Added `docs/RELEASE_GOVERNANCE_CONSOLE_RUNBOOK_CN.md`.
- Added `docs/AGENT_OS_V2_P8_RELEASE_SEAL_CN.md` and marked P8 in the release phase registry.
- No real MCP integration, no API key handling, no CI/channel/headless automation, no UI rewrite, and no `skills/ECC` internal commit or rollback.

### P7 Release Seal

- Added `docs/AGENT_OS_V2_P7_RELEASE_SEAL_CN.md` as the release seal record for P0-P7 and GOV governance layers.
- Recorded fresh validation baseline: lint PASS, typecheck PASS, test PASS (22 files / 252 tests), build PASS, verify:all PASS.
- Recorded current `verify:intelligence` baseline: 23 sources / 4 healthy / 18 degraded / 1 failed / containsSecrets=false. The BLS public API daily-threshold response is classified as `adapter_error` and does not crash validation.
- Updated `outputs/intelligence/verification-latest.json` with the latest verification artifact.
- No src/* semantic changes, no real MCP integration, no new API key handling, no CI/channel/headless integration, and no vendor runtime bypass.

### P7 ModelRouter + Skill Scanner Integration

- Added `src/agent/modelRouterIntegration.ts` — Launch Desk builds a static release-planning `ModelSelectionRequest`, uses `StaticModelRouter`, filters fallback chains through `ModelGateway.getAvailableModels()`, and preserves the SDK default string model path when no provider model is available.
- Added `src/skills/skillScanner.ts` — recursive `SKILL.md` scanner with injected filesystem callbacks, frontmatter parsing, descriptor creation, inaccessible-directory skip behavior, and no skill execution.
- Updated `src/agent/streamLaunchPlan.ts` — uses router-selected `ModelGatewayModel` with fallback ids; scans `SKILLS_ROOT` (`skills/ECC/skills` by default), registers descriptors, and best-effort injects loaded skill content into agent instructions.
- Updated `src/skills/index.ts` — exports skill scanner APIs.
- Added `src/tests/model-router-integration.test.ts` and `src/tests/skill-scanner.test.ts`.
- Updated validation helpers: `verify:env` is non-strict by default and keeps `--strict` for real credential-backed runs; `verify:secrets` scans Git-tracked files by default, supports `--staged`, and filters generated/vendor false positives.
- No real MCP integration, no hook/plugin activation, and no API key or credential handling beyond the existing ModelGateway provider-key availability checks.
- Validation: lint PASS, typecheck PASS, test PASS (22 files / 252 tests), build PASS, verify:all PASS, verify:intelligence PASS (23 sources / 5 healthy / 18 degraded / 0 failed / containsSecrets=false).

### Vendor nested repo status

- Added `docs/VENDOR_NESTED_REPO_STATUS_CN.md` to record the remaining `skills/ECC` nested Git repository state.
- `skills/ECC` is tracked by the parent repository as a gitlink at `81af40761939056ab3dc54732fd4f562a27309d0`, but no `.gitmodules` file exists.
- Remaining dirty state is limited to `skills/ECC/package-lock.json` and `skills/ECC/yarn.lock`; no Agent OS parent `src/*` implementation change is implied.
- No rollback or commit was made inside the third-party nested skill repository.
- No src/* code changes, no MCP transport implementation, no real external service integration, and no API key or credential handling.

### P6 Model Gateway Integration + Skill Injection

- Added ModelGateway streaming capability — `callModelStream(request): AsyncGenerator<ModelStreamChunk>` on the `ModelGateway` interface, with `ModelStreamChunk` discriminated union (`text_delta` / `done` / `tool_call`). `ModelGatewayImpl.callProviderStream` sends `stream: true` in the request body, parses the provider's SSE stream via `ReadableStream` reader, and yields `text_delta` chunks followed by a `done` chunk with `usage` + `modelId` + `provider`. Errors throw `ModelStreamError`.
- Added `src/agent/modelGatewayAdapter.ts` — `ModelGatewayModel implements Model` (SDK `Model` interface). `getResponse` calls `gateway.callModel` (one-shot); `getStreamedResponse` calls `gateway.callModelStream` and yields `output_text_delta` events then a `response_done` event carrying `usage` + `output`. Maps `AgentInputItem[]` → `ChatMessage[]` (user/assistant/system/function_call/function_call_result). Tool-call loop stays SDK-managed.
- Added `src/agent/skillInjector.ts` — `loadSkillsForAgent` loads skill content per-request: classifies skills (always/sometimes/rarely), loads always-needed mandatorily, loads sometimes-needed while budget remains, skips rarely-needed. Returns `{ skillContent, report }`. readFile injected for testability.
- Updated `src/agent/launchAgent.ts` — `createLaunchDeskAgent(options?)` accepts `{ skillContent?, model? }`. Skill content prepended to instructions as `## Loaded Skills` block. Model accepts `Model` instance or string (backward compat with `DEFAULT_MODEL`).
- Updated `src/agent/streamLaunchPlan.ts` — wires `createModelGateway()` (module-level lazy singleton) + `ModelGatewayModel` into the agent. Falls back to `DEFAULT_MODEL` string if no provider keys configured. `run_started` event reports the actual modelId used.
- Updated `src/server/index.ts` — pre-flight check relaxed: requires at least one provider key OR `OPENAI_API_KEY` (not just `OPENAI_API_KEY`). Health endpoint exposes `hasProviderKey`, `availableModels`, and the first available model.
- Updated `src/integration/fakeModelGateway.ts` — `FakeModelGateway.callModelStream` simulates streaming by yielding content in chunks + a `done` chunk. Supports `errorOverrides` (throws on match). Does not call `fetch`.
- Updated `src/integration/types.ts` — added `ModelStreamChunk`, `ModelStreamError`, and `callModelStream` on `ModelGateway` interface.
- Updated `src/integration/index.ts` — exports `ModelStreamChunk`, `ModelStreamError`.
- Created `src/tests/model-gateway-stream.test.ts` — 13 tests (8 FakeGateway streaming + 4 ModelGatewayImpl SSE parsing with fetch mock + 2 boundary).
- Created `src/tests/model-gateway-adapter.test.ts` — 15 tests (5 getResponse + 5 getStreamedResponse + 2 launchAgent integration + 3 boundary).
- Created `src/tests/skill-injector.test.ts` — 13 tests (3 happy + 3 budget enforcement + 3 edge cases + 2 boundary + 2 hints).
- All sealed layers (P0-P5, GOV) remain unmodified. 241/241 tests pass. `src/skills/` imports nothing from sealed layers; `FakeModelGateway` does not call `fetch`.

### P5 Skill Progressive Loading + Context Budget

- Added `src/skills/` static layer — token estimation, skill registry, priority classification, context-budget allocation, and progressive skill loading with budget enforcement.
- Created `src/skills/types.ts` — `SkillDescriptor`, `TokenEstimate`, `ContextBudgetConfig`, `ContextBudgetAllocation`, `ClassifiedSkill`, `SkillLoadResult` (discriminated union `ok: true | false`), `SkillRegistryEntry`, `BudgetReport`.
- Created `src/skills/tokenEstimator.ts` — `estimateTokens` (auto-detects prose/code/mixed) and `estimateTokensFromSize` (size-based, no content read). Heuristics from `skills/ECC/skills/context-budget/SKILL.md`: prose `words × 1.3`, code `chars / 4`, avg word ≈ 5 chars.
- Created `src/skills/skillRegistry.ts` — `SkillRegistry` class (in-memory `Map`) + `createSkillRegistry` factory.
- Created `src/skills/contextBudget.ts` — `defaultConfigForTier`, `classifySkill`, `classifyAll`, `computeAllocation`, `generateReport`. Tier defaults: `small: 8_000`, `medium: 32_000`, `large: 200_000` tokens; reserved `MODEL=4_000`, `SYSTEM=2_000`. Warns at >80% utilization, flags budget exceeded, suggests removing rarely-needed skills and lazy-loading >5 sometimes-needed skills.
- Created `src/skills/skillLoader.ts` — `loadSkill` returns `SkillLoadResult` (`loaded` / `not_found` / `exceeds_budget` / `parse_error`) with an injected `readFile` so tests stay filesystem-free; `buildRegistryEntry` for the registry scan phase.
- Created `src/skills/index.ts` — barrel exports.
- Created `src/tests/skill-progressive-loading.test.ts` — 28 tests (4 happy + 5 estimation + 5 classification + 5 budget + 5 loader + 1 registry builder + 3 boundary).
- `src/skills/` is a pure static library: no `fetch`, no `process.env`, no RunStore, no MCP, no governance hooks. It imports nothing from `src/integration`, `src/governance`, `src/runtime`, `src/mcp`, `src/models`, or `src/intelligence`.
- All sealed layers (P0-P4.2, Model Gateway) remain unmodified. 201/201 tests pass.

### P4.2 Tool Execution Adapter + Audit Bridge

- Added `src/integration/toolExecutionAdapter.ts` — `ToolExecutionAdapter` class that assembles the full chain: `buildInvocationRequest → preToolUseHook (P3) → McpTransport.callTool (P4.1) → postToolUseHook (P3) → persistToolAudit (RunStore)`.
- Added `src/integration/auditBridge.ts` — `mapToolAuditToRunEvent`, `mapMcpPayloadToRunEvent`, `persistToolAudit`, `persistMcpPayload`, `summarizeTransportResponse`. Bridges P3 `ToolAuditEvent` and P4.1 `AuditEventPayload` into P1 `RunStore.appendAuditEvent`.
- Added `src/tests/tool-execution-adapter.test.ts` — 16 tests (4 happy + 5 effect mapping + 4 boundary + 3 audit bridge).
- `McpDeclaredEffect → ToolEffect` mapping: read→read, write→write, destructive→delete, network→external_send, compute→execute.
- `src/runtime/dagExecutor.ts` NOT modified — adapter lives in `src/integration/` and calls sealed layers through their public interfaces.
- All sealed layers (P0-P4.1, Model Gateway) remain unmodified. 173/173 tests pass.

### Model Gateway — Third-Party Model Routing with Auto-Switch

- Added `src/integration/` integration layer — the first module allowed to read API keys and make real HTTP calls.
- Created `src/integration/types.ts` — `ModelGateway` interface, `ModelCallRequest`, `ModelCallResponse` (discriminated union `ok: true | false`), `ModelGatewayErrorKind` (8 kinds), `ProviderConfig`, `ModelGatewayConfig`, `TokenUsage`, `ChatMessage`.
- Created `src/integration/providerConfig.ts` — 4 default providers: DeepSeek (`api.deepseek.com`), 火山引擎 (`ark.cn-beijing.volces.com`), OpenRouter (`openrouter.ai`), longcat (`api.longcat.chat`). All use OpenAI-compatible chat completions. `resolveProvider` / `resolveApiKey` / `resolveProviderModelId` / `listKnownModelIds` helpers.
- Created `src/integration/modelGateway.ts` — `ModelGatewayImpl` with automatic primary→fallback switching. Retryable errors (rate_limited, server_error, network_error, timeout) auto-retry within `maxRetries`, then switch to next fallback. Non-retryable errors (auth_failed, invalid_response) switch immediately. `createModelGateway(config?)` factory.
- Created `src/integration/fakeModelGateway.ts` — `FakeModelGateway` for testing without real API keys. Supports `errorOverrides` (per-modelId + catch-all) and synthetic responses.
- Created `src/integration/index.ts` — barrel exports.
- Created `src/tests/model-gateway.test.ts` — 28 tests (5 happy + 8 safe failure + 6 fallback auto-switch + 5 boundary + 4 provider config). Tests verify `src/models/` is unmodified (`"callModel" in router === false`), `FakeModelGateway` does not call `fetch`, no hardcoded API keys in source.
- Created `docs/MODEL_GATEWAY_RUNBOOK_CN.md` — 8-section runbook.
- Updated `README.md` — added `## Model Gateway` section.
- Updated `.env.example` — added `DEEPSEEK_API_KEY`, `ARK_API_KEY`, `OPENROUTER_API_KEY`, `LONGCAT_API_KEY` placeholders.
- `src/models/` remains sealed and unmodified. Existing 22 model-router tests still pass. The boundary-protection test asserting `"callModel" in router === false` and `"fetch" in router === false` still passes.
- API keys are read from `process.env` only, never hardcoded, never logged, never returned in responses.

### P4.1 MCP Transport Interface + Fake Transport Harness v1

- Added P4.1 MCP transport abstraction and fake transport harness in `src/mcp`.
- Created `src/mcp/transport.ts` — `McpTransport` interface (`healthProbe`, `listTools`, `callTool`), `McpTransportRequest`, `McpTransportResponse` (discriminated union), `McpTransportError` (reuses `McpErrorKind`, maps via `createMcpError`).
- Created `src/mcp/fakeTransport.ts` — `FakeMcpTransport` class implementing `McpTransport` against `McpGatewayRegistry` (P4.0) + `FakeTransportConfig`. Returns synthetic success results and synthetic errors per `errorOverrides` (per-server / per-tool / per-callIndex targeting).
- Created `src/tests/mcp-transport.test.ts` — 25 tests (3 happy path + 8 safe failure + 14 boundary protection).
- Updated `src/mcp/index.ts` — re-exports new transport symbols.
- Created `docs/MCP_TRANSPORT_INTERFACE_RUNBOOK_CN.md` — P4.1 runbook.
- Updated `README.md` — added `## MCP Transport Interface` section.
- Resolved design debt: `__mockErrorKind` magic string (`mockToolCall.ts:25-28`) replaced by `FakeTransportConfig.errorOverrides`; duplicated `errorKinds` literal (`mockToolCall.ts:6-15`) removed from P4.1 path; `mockToolCall.ts` deprecated (kept for P4.0 back-compat).
- P4.1 remains fake-only: no real MCP transport, no real API key, no real OAuth, no network, no P3 hook invocation, no RunStore audit write, no DAGExecutor integration. `src/mcp` does not import from `runtime` / `governance` / `models` / `intelligence`.
- Node runner flow N0→N7 completed: N0 PRD lock PASS, N1 architecture review PASS, N2 tech review PASS, N3 implementation, N4 file structure review, N5 validation, N6 doc sync, N7 release seal.

### GOV-OPS Node Runner MVP

- Added GOV-OPS Node Runner MVP as a local tooling-only helper under `.agent-os` and `scripts/agent-node-runner.mjs`.
- Added prompt generation, output checking, diff boundary checking, and validation command runner.
- Added `.agent-os/node-runner.config.json` and Agent Node Runner Chinese runbook.
- Added third-party planning-with-files reference rules for optional file-based `task_plan.md`, `findings.md`, and `progress.md` planning inside `.agent-os/runs/<run>/`.
- No `src/*` runtime changes.
- No model API integration.
- No MCP integration.
- No credential handling.
- No package dependency changes.

### P4.0 implementation

- Added P4.0 MCP Gateway Static Registry + Tool Descriptor v1 implementation in `src/mcp` with static server profiles, tool descriptors, registry queries, declared health status, mock tool call results, MCP error classification, retryable mapping, and registry tests. It remains static only: no real MCP transport, no real API key, no external tool execution, no P3 hook invocation, and no RunStore audit persistence.
- Added P4.0 documentation preparation: MCP Gateway Static Registry + Tool Descriptor v1 runbook and README section. Documents `McpServerProfile`, `McpToolDescriptor`, `McpTransportType`, `McpAuthRequirement`, `McpHealthStatus`, `ToolCallRequest`, `ToolCallResult`, `McpError`, and the `McpGatewayRegistry` query contract. Documentation only; no `src/mcp` code, no real MCP transport, no real API key, no external tool calls, no P3 hook invocation, and no RunStore audit. Records the six blocking boundaries: `McpAuthRequirement` is a static declaration and not `CredentialStatus`; `declaredEffect` is a P3 risk-calculation input and not `riskLevel`; P4.0 does not call `preToolUseHook` / `postToolUseHook` including the mock path; `ToolCallRequest` does not carry `credentialStatus`; `McpHealthStatus` is independent of P0 `SourceResultStatus`; and mock tool call results are synthetic and do not execute real tools.

### Governance documentation

- Added multi-model consistency governance documentation.
- Added code guardrails and anti-monolith development rules.
- Added vendor tooling standard for AGENTS.md, CLAUDE.md, skills, hooks, and MCP references.
- Added ZCode official-docs governance for Goal, MCP Services, Command, Skill, Subagents, and Plugin surfaces.
- Clarified that ZCode Goal is not RunStore, Goal resume is not P1 resume, and Goal auto-check is not N5/N7 validation.
- Added ZCode vendor surface guardrails and Handoff Packet requirements.
- Added Claude Code context-window governance rules.
- Added Claude Code official-docs-based vendor adapter rules.
- Added context/session discipline for Claude Code workflows.
- Added context budget guardrails for CLAUDE.md, AGENTS.md, skills, and MCP descriptors.
- Added Claude Code security, CI, Slack, and parallel agent governance rules.
- Added Claude Code advanced surfaces governance rules.
- Covered workflows, worktrees, MCP, skills, plugins, hooks, channels, scheduled/headless/deep-link entry points, Agent SDK, settings, monitoring, costs, and troubleshooting.
- Added OpenAI legacy docs ingestion governance.
- Marked openai.xiniushu.com as legacy mirror reference.
- Added API key discipline, legacy Completions boundary, Chat Plugins vs MCP distinction, and vendor doc freshness rules.
- Added OpenAI official help / Codex Security / prompt engineering governance rules.
- Added legacy mirror handling rules for openai.xiniushu.com.
- Added prompt discipline for multi-model tasks.
- Added OpenAI vendor surface guardrails.
- Documentation-only change: no `src/*` code changes.
- No OpenAI API implementation.
- No Codex Security integration.
- No GitHub Actions or GitLab CI implementation.
- No Slack integration.
- No MCP transport implementation.
- No real external service integration.
- No CI/CD implementation.
- No channels / Slack / Discord / Telegram integration.
- No API key or credential handling.

### GOV-N2 consistency patch

- Added missing model role routing governance document.
- Removed stale `requiresApproval` references from P3 tests and kept `requires_approval` as the decision status signal.
- Added `src/runtime` to the import boundary matrix.
- Added P3 `requires_approval` boundary protection test for RunStore state-machine isolation.
- Consistency patch included test-only updates under `src/tests/tool-permission.test.ts`; no runtime behavior changes.
- No MCP transport implementation.
- No real external service integration.
- No API key or credential handling.
- N5_VALIDATION: PASS — lint, typecheck, test, build, and verify:intelligence passed; 13 test files / 103 tests passed.

## 2026-07-04

- Added P3 Tool Permission Hooks + Credential Gating + AgentRiskVector v1 as a static governance layer with credential decisions, risk scoring, pre/post hook audit payloads, and tests. It does not execute tools, read real credentials, call MCP, or use external APIs.
- Added P3 landing consistency patch: removed `ToolPermissionDecision.requiresApproval`, documented `requires_approval` versus P1 `waiting_approval`, clarified scope coverage gating, `ToolAuditEvent` payload metadata, and that P3 v1 has no `log_only` status.
- Added Model Router v1 as a static routing decision layer with model profiles, policy scoring, fallback chains, explanations, and tests. It does not call real model APIs or use API keys.
- Aligned Model Router v1 types and seed profiles with the P2 PRD: Doubao Pro, DeepSeek Flash, Ark Code, PRD capability labels, `normal` latency, `quality_first` preferences, and boundary tests.
- Added post-model-router consistency checks for safe success/failure result typing, fallback loop/missing/disabled handling, deterministic tie-breaks, and sensitive privacy warning semantics.
- Added RunStore v1 and Approval Resume v1 as an in-memory runtime.
- Added `Run`, `ResumePoint`, `MemoryRunStore`, `DAGExecutor`, and `SwarmOrchestrator`.
- Added approval interruption, checkpoint persistence, approve/reject/resume transitions, and runtime tests.
- Added post-runtime consistency checks for legal state transitions, approval queue semantics, failed node tracking, and invalid state handling.
- Clarified that RunStore v1 is memory-only and loses run state on process restart.
- Added Adapter Result Classification v1 without adding sources, credentials, UI, or model integrations.
- Added `SourceResultStatus` and top-level `sourceResultBreakdown`, `failedSourceBreakdown`, and `unavailableSourceBreakdown` to `verify:intelligence`.
- Added `unavailableSourceCount` as the sum of `unavailableSourceBreakdown`.
- Fixed missing credential handling so `missing_credentials` is degraded/unavailable rather than an ordinary failed fetch.
- Split unprobed sources into `not_probed` and `adapter_not_implemented`.
- Tightened `confidenceScore` so unavailable sources do not receive partial-data confidence and single-source agreement is not overstated.
- Added EntityNode and IndicatorNode provenance `url`/`rawRef` propagation.

## 2026-07-03

- Added Intelligence Verification Stabilization v1.
- Replaced source-count-driven verification with adapter health counts: `healthySourceCount`, `degradedSourceCount`, and `failedSourceCount`.
- Added Evidence Graph v1 output with `SourceNode`, `DataPointNode`, `EntityNode`, `IndicatorNode`, and typed evidence edges.
- Added rule-based `confidenceScore` with source reliability, data completeness, freshness, cross-source agreement, and conflict penalty.
- Added graceful degradation readiness states: `ready`, `degraded`, and `blocked`.
- Kept `verifiedSourceCount` out of top-level output; compatibility is available only as `compatibility.deprecatedVerifiedSourceCount`.
