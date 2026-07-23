# N0 Output — P4.1 PRD Lock

STATUS: PASS

NEXT_NODE: N1_LONG_CONTEXT_ARCH_REVIEW

NEXT_MODEL: longcat

BLOCKING_ISSUES:
- (none)

NON_BLOCKING_ISSUES:
- `docs/MCP_GATEWAY_REGISTRY_RUNBOOK_CN.md` §10 still describes P4.1 as "real MCP transport", conflicting with Code Guardrails §10 (higher priority) defining P4.1 as "Fake Transport Harness". Code Guardrails is authoritative. N6 must reconcile.
- `McpToolDescriptor.enabled` field exists in P4.0 implementation but is not documented in P4.0 Runbook §4.4. Non-blocking; N6 may address.
- `verify:intelligence` remains degraded (18/23) due to missing credentials. Expected, NOT P4.1 scope.
- Git `master` has zero commits. First commit recommended after P4.1 seal.

REQUIRED_ACTION:
- N1 (longcat) must review 3 architectural questions: (1) McpTransport interface vs P4.0 registry boundary integrity, (2) McpTransportError reuse of McpError coupling risk, (3) FakeTransportConfig.errorOverrides synthetic error injection safety. N1 is READ-ONLY; output to N1-output.md with STATUS: PASS or BLOCK.

---

## P4.1 PRD — MCP Transport Interface + Fake Transport Harness v1

### 1. One-Sentence Goal

Define the MCP transport abstraction (`McpTransport` interface) and a fake transport harness (`FakeMcpTransport`) that produces synthetic results and synthetic errors for testing — no real MCP connection, no API key, no P3 hook, no RunStore audit write.

### 2. Task Scope

- **`McpTransport` interface** — behavioral contract: `healthProbe`, `listTools`, `callTool`.
- **`FakeMcpTransport` class** — implements `McpTransport` against `FakeTransportConfig` + `McpGatewayRegistry`. Returns synthetic success and synthetic errors (timeout / rate_limited / server_error) per `errorOverrides`. No network, no subprocess, no real MCP client.
- **Structured error injection** — `FakeTransportConfig.errorOverrides` replaces the P4.0 `__mockErrorKind` magic string (`mockToolCall.ts:25-28`) and duplicated `errorKinds` literal (`mockToolCall.ts:6-15`).
- **Transport-layer types** — `McpTransportRequest`, `McpTransportResponse` (discriminated union), `McpTransportError` (reuses `McpError` kind/message/retryable via `createMcpError`).

### 3. Explicit Non-Goals

P4.1 does NOT: implement real MCP transport (SSE/streamable_http/stdio); connect to real servers; read/store/transmit API keys/tokens/OAuth; make network requests; call P3 hooks; write RunStore audit; integrate DAGExecutor; discover tools dynamically over network; execute tools really; redefine TYPES_LOCKED; relax RULES_LOCKED; touch sealed modules; create `.mcp.json`/`.env`/`.github/**`; import from `src/runtime`/`src/governance`/`src/models`/`src/intelligence`.

### 4. File Boundaries

#### Allowed (N3 implementation, ratified from node-runner.config.json)

| File | Action |
| --- | --- |
| `src/mcp/transport.ts` | CREATE — McpTransport interface + transport types |
| `src/mcp/fakeTransport.ts` | CREATE — FakeTransportConfig + FakeMcpTransport |
| `src/mcp/types.ts` | EDIT (additive) — do NOT modify TYPES_LOCKED |
| `src/mcp/health.ts` | EDIT (additive, if needed) |
| `src/mcp/errorClassification.ts` | EDIT (additive, if needed) — RETRYABLE_MAP unchanged |
| `src/mcp/index.ts` | EDIT — re-export new symbols |
| `src/tests/mcp-transport.test.ts` | CREATE — P4.1 test suite |
| `docs/MCP_TRANSPORT_INTERFACE_RUNBOOK_CN.md` | CREATE — runbook |
| `README.md` | EDIT — MCP Transport section |
| `CHANGELOG.md` | EDIT — P4.1 entry |

#### Forbidden

`src/runtime/**`, `src/governance/**`, `src/models/**`, `src/intelligence/**`, `.mcp.json`, `.github/**`, `.env`, credential files.

#### §10 capability matrix (Code Guardrails, authoritative)

**Allowed**: McpTransport interface, FakeMcpTransport, TransportRequest, TransportResponse, TransportError, healthProbe mock, listTools mock, callTool mock, timeout synthetic, rate_limited synthetic, server_error synthetic.

**Forbidden**: real SSE, real streamable_http, real stdio subprocess, real MCP client, real API key, real OAuth, real network, real list_tools, real call_tool, P3 hook, RunStore audit, DAGExecutor integration.

### 5. Validation Baseline

| Command | Baseline | P4.1 requirement |
| --- | --- | --- |
| `npm run lint` | PASS | PASS |
| `npm run typecheck` | PASS | PASS |
| `npm test` | 13 files / 103 PASS | PASS, 103 + P4.1 new |
| `npm run build` | PASS | PASS |
| `npm run verify:intelligence` | PASS (23 sources) | PASS (degraded 18 pre-existing) |

### 6. Core Types (recommended for N1/N2)

```ts
// src/mcp/transport.ts
export interface McpTransport {
  healthProbe(serverId: string): Promise<McpHealthStatus>;
  listTools(serverId: string): Promise<McpToolDescriptor[]>;
  callTool(request: McpTransportRequest): Promise<McpTransportResponse>;
}
export interface McpTransportRequest {
  serverId: string; toolId: string; arguments: Record<string, unknown>;
}
export interface McpTransportSuccess { ok: true; result: unknown; auditPayload?: AuditEventPayload; }
export interface McpTransportFailure { ok: false; error: McpTransportError; auditPayload?: AuditEventPayload; }
export type McpTransportResponse = McpTransportSuccess | McpTransportFailure;
export interface McpTransportError {
  kind: McpErrorKind; message: string; retryable: boolean; cause?: unknown;
}

// src/mcp/fakeTransport.ts
export interface FakeErrorOverride {
  serverId?: string; toolId?: string; callIndex?: number;
  errorKind: McpErrorKind; message?: string;
}
export interface FakeTransportConfig { errorOverrides: FakeErrorOverride[]; }
export class FakeMcpTransport implements McpTransport {
  constructor(registry: McpGatewayRegistry, config: FakeTransportConfig);
  healthProbe(serverId: string): Promise<McpHealthStatus>;
  listTools(serverId: string): Promise<McpToolDescriptor[]>;
  callTool(request: McpTransportRequest): Promise<McpTransportResponse>;
}
```

#### Design debt resolved

- `__mockErrorKind` magic string (`mockToolCall.ts:25-28`) → replaced by `FakeTransportConfig.errorOverrides`
- duplicated `errorKinds` literal (`mockToolCall.ts:6-15`) → removed; `McpErrorKind` union is single source
- `mockToolCall.ts` disposition: deprecated (kept for P4.0 back-compat), N2 may revise

### 7. Test Matrix (recommended outline for N2)

Target ~25 tests in `src/tests/mcp-transport.test.ts`:

| Category | Count | Tests |
| --- | --- | --- |
| Happy path | 3 | healthProbe ok; listTools returns enabled descriptors; callTool synthetic success |
| Safe failure | 8 | timeout, rate_limited, server_error, auth_required, tool_not_found, transport_unavailable, schema_invalid, unknown — via errorOverrides |
| Boundary | 14 | no real network, no P3 hook import, no RunStore import, no runtime/governance/models/intelligence import, errorOverrides isolation (per-server/per-tool/per-callIndex), FakeMcpTransport not default-constructable, TYPES_LOCKED unchanged, RETRYABLE_MAP unchanged, __mockErrorKind removed from P4.1 path, synthetic result marked, auditPayload present, disabled server → transport_unavailable, disabled tool → tool_not_found |

### 8. Acceptance Criteria (N3/N4/N5)

1. `transport.ts` exists with McpTransport interface + 3 transport types. 2. `fakeTransport.ts` exists with FakeTransportConfig + FakeMcpTransport. 3. `types.ts` additive only; TYPES_LOCKED unchanged. 4. `index.ts` re-exports new symbols. 5. `mcp-transport.test.ts` ~25 tests PASS. 6. lint/typecheck/test/build/verify:intelligence all PASS. 7. diff within N3 allowedFiles (10 entries). 8. no forbidden imports. 9. no `__mockErrorKind` in P4.1 path. 10. FakeMcpTransport requires config. 11. no `.mcp.json`/`.env`/`.github/**`. 12. runbook created. 13. README+CHANGELOG updated. 14. 103 existing tests remain PASS. 15. no real MCP/key/hook/audit/DAGExecutor.

### 9. Handoff Packet

```text
HANDOFF_PACKET

CURRENT_PHASE: P4.1 — MCP Transport Interface + Fake Transport Harness
SEALED_PHASES:
  P0 Intelligence Verification / Source Classification
  P1 RunStore + Approval Resume
  P2 Model Selection / Model Router
  P3 Tool Permission Governance
  P4.0 MCP Gateway Static Registry + Tool Descriptor
  GOV governance documentation and consistency patches
CURRENT_NODE: N0_PRD_LOCK
STATUS: PASS
DECISION: P4.1 PRD is locked. N1 may begin architecture review.
FILES_ALLOWED:
  src/mcp/transport.ts (CREATE)
  src/mcp/fakeTransport.ts (CREATE)
  src/mcp/types.ts (EDIT, additive)
  src/mcp/health.ts (EDIT, additive)
  src/mcp/errorClassification.ts (EDIT, additive)
  src/mcp/index.ts (EDIT)
  src/tests/mcp-transport.test.ts (CREATE)
  docs/MCP_TRANSPORT_INTERFACE_RUNBOOK_CN.md (CREATE)
  README.md (EDIT)
  CHANGELOG.md (EDIT)
FILES_FORBIDDEN:
  src/runtime/**, src/governance/**, src/models/**, src/intelligence/**
  .mcp.json, .github/**, .env, credential files
TYPES_LOCKED (do NOT redefine):
  McpServerProfile, McpToolDescriptor, McpAuthRequirement, McpHealthStatus,
  ToolCallRequest, ToolCallResult, AuditEventPayload, McpError, McpErrorKind,
  McpDeclaredEffect v1 single value
TYPES_EXTENDED (new, additive):
  McpTransport, McpTransportRequest, McpTransportResponse,
  McpTransportError, FakeErrorOverride, FakeTransportConfig, FakeMcpTransport
RULES_LOCKED:
  P4.0 static registry only. P4.1 fake transport only after PRD lock. [NOW LOCKED]
  No real MCP. No API key/token/credential. No P3 hook. No RunStore audit.
  src/mcp must not import runtime/governance/intelligence/models.
DESIGN_DEBT_RESOLVED:
  __mockErrorKind → FakeTransportConfig.errorOverrides
  duplicated errorKinds literal → removed
  mockToolCall.ts → deprecated (P4.0 back-compat), N2 may revise
TESTS_REQUIRED:
  Keep 103 existing passing. Add ~25 P4.1 tests after N2 locks matrix.
VALIDATION_COMMANDS:
  npm run lint, npm run typecheck, npm test, npm run build, npm run verify:intelligence
BOUNDARY_WARNINGS:
  .github/workflows/ci.yml is pre-existing v3, not P4.1 output.
  verify:intelligence degraded (18/23) due to missing credentials, not P4.1 scope.
  docs/MCP_GATEWAY_REGISTRY_RUNBOOK_CN.md §10 stale — Code Guardrails §10 authoritative. N6 reconcile.
  Git master zero commits — first commit recommended after P4.1 seal.
NEXT_NODE: N1_LONG_CONTEXT_ARCH_REVIEW
NEXT_MODEL: longcat
```
