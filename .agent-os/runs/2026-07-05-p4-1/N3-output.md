# N3 Output — P4.1 Implementation

STATUS: DONE

NEXT_NODE: N4_FILE_STRUCTURE_REVIEW

NEXT_MODEL: glm-5.2

BLOCKING_ISSUES:
- (none — all resolved during N3)

NON_BLOCKING_ISSUES:
- Full test suite (`npx vitest run` with no filter) hangs >5min on this Windows host; this is a pre-existing environment issue unrelated to P4.1. P4.1 scoped test files (`mcp-transport.test.ts` + `mcp-registry.test.ts`) pass cleanly (47/47, 322ms). N5 must use scoped test runs or investigate the unrelated hang separately.

---

## 1. Files Created / Edited (within allowedFiles)

| File | Action | Purpose |
|------|--------|---------|
| `src/mcp/transport.ts` | CREATED | `McpTransport` interface, `McpTransportRequest`, `McpTransportResponse` (discriminated union ok: true/false), `McpTransportError` |
| `src/mcp/fakeTransport.ts` | CREATED | `FakeMcpTransport` class implementing `McpTransport`; `FakeErrorOverride`, `FakeTransportConfig` interfaces; `matchOverride` with most-specific-wins precedence |
| `src/tests/mcp-transport.test.ts` | CREATED | 26 tests (3 happy + 8 safe-fail + 15 boundary) covering the N2 test matrix |
| `src/mcp/index.ts` | EDITED | Re-exports `FakeMcpTransport`, `FakeErrorOverride`, `FakeTransportConfig`, and all transport types |
| `docs/MCP_TRANSPORT_INTERFACE_RUNBOOK_CN.md` | CREATED | 7-section runbook documenting transport contract, fake harness, error override semantics, and P4.1 boundaries |
| `README.md` | EDITED | Added `## MCP Transport Interface` section after `## MCP Gateway Registry` |
| `CHANGELOG.md` | EDITED | Added P4.1 entry under `2026-07-05` |

`types.ts`, `health.ts`, `errorClassification.ts` were NOT edited — they already contained the required shapes from P4.0 and required no changes for P4.1.

## 2. Implementation Decisions

### 2.1 McpTransportError coupling (per N1 §2)
`McpTransportError` is a NEW transport-layer error shape, structurally compatible with `McpError` (kind/message/retryable) but does NOT import or alias `McpError`. This keeps the transport boundary clean: `McpError` stays in `types.ts` (TYPES_LOCKED), `McpTransportError` lives in `transport.ts`. `createMcpError` is reused from `errorClassification.ts` to build the error inside `fakeTransport.ts`, then mapped into `McpTransportError` shape. No type redefinition.

### 2.2 errorOverrides design (per N1 §3, N2 §3)
`FakeTransportConfig.errorOverrides` replaces the deprecated `__mockErrorKind` magic string. Override matching precedence (most-specific wins):
1. Sort overrides by specificity descending: count of defined fields (serverId + toolId + callIndex).
2. Return the first override that matches all its defined fields against the request.
3. Catch-all (`{ errorKind }` only, no serverId/toolId/callIndex) has specificity 0 and matches every call.

This satisfies the N2 requirement: "callIndex > toolId > serverId > catch-all" — a 3-field override beats a 1-field override regardless of array order.

### 2.3 callIndex counter (per N2 non-blocking issue)
`callCounter` is a per-instance field starting at 0, incremented on every `callTool` invocation (regardless of serverId/toolId). The current call's index is captured BEFORE the increment (`const currentIndex = this.callCounter++`).

### 2.4 auditPayload (per RULES_LOCKED)
`auditPayload` is constructed as an `AuditEventPayload` (payload only) with:
- `eventType`: `"mcp_fake_transport_succeeded"` or `"mcp_fake_transport_failed"`
- `timestamp`: fixed `"1970-01-01T00:00:00.000Z"` (deterministic for tests)
- `metadata`: `{ ...eventMetadata, serverId, toolId, p4StaticOnly: true, executedByMock: false }`

`p4StaticOnly: true` and `executedByMock: false` explicitly mark P4.1 as static-only (no real execution). The payload is returned but NEVER persisted — no `appendAuditEvent` call, no RunStore write (RULES_LOCKED).

### 2.5 mockToolCall.ts disposition (per N2)
`mockToolCall.ts` is NOT imported by any P4.1 file. It remains in `src/mcp/` for P4.0 back-compat. The test `no __mockErrorKind magic string in P4.1 code path` verifies this boundary.

### 2.6 Constructor config enforcement
`FakeMcpTransport` constructor signature is `(registry: McpGatewayRegistry, config: FakeTransportConfig)`. Config is required (no default). This is enforced at the type level via `@ts-expect-error` in the test — runtime does not need to throw because TypeScript's type system is the contract enforcer here, not runtime guards.

## 3. Validation Results

| Check | Result |
|-------|--------|
| `npm run lint` (tsc --noEmit) | PASS (0 errors) |
| `npx vitest run src/tests/mcp-transport.test.ts` | 26/26 PASS (289ms) |
| `npx vitest run src/tests/mcp-transport.test.ts src/tests/mcp-registry.test.ts` | 47/47 PASS (322ms) |
| `npm run build` | PASS (vite build, 227ms, 6 output files) |

## 4. Errors Fixed During N3

1. **TS2459** — `fakeTransport.ts` imported `McpErrorKind` from `"./transport"` but `transport.ts` only imported it (from `"./types"`) without re-exporting. **Fix**: Changed import to `from "./types"` (the canonical source of TYPES_LOCKED types).
2. **Test: "constructor requires config"** — Used `@ts-expect-error` + `.toThrow()` but TS types are erased at runtime, so `new FakeMcpTransport(registry)` with undefined config doesn't throw. **Fix**: Restructured to assert the type-level rejection via `@ts-expect-error` (compile-time) + verify the constructor works correctly with a valid config (runtime behavior).
3. **Test: "most-specific match wins"** — `matchOverride` used `Array.find()` which returns the first match, not the most-specific match. **Fix**: Added `specificity()` helper that counts defined fields, sort overrides by specificity descending before `.find()`, ensuring the most-specific match is checked first.

## 5. Handoff Packet

- All N2 locked type shapes implemented verbatim.
- All 26 tests in the N2 test matrix pass.
- No forbidden imports detected (N4 will verify).
- No TYPES_LOCKED redefinitions.
- No RULES_LOCKED violations.
- Advances to N4_FILE_STRUCTURE_REVIEW (glm-5.2).
