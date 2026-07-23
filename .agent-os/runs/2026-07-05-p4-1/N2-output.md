# N2 Output — P4.1 Technical Review

STATUS: PASS

NEXT_NODE: N3_IMPLEMENTATION

NEXT_MODEL: doubao-seed-2.0-code / Codex

BLOCKING_ISSUES:
- (none)

NON_BLOCKING_ISSUES:
- `callIndex` counter is global per `FakeMcpTransport` instance (incremented on every `callTool` invocation, regardless of serverId/toolId). Matching precedence: most-specific match wins (callIndex > toolId > serverId > catch-all). N3 must implement this precisely.
- `mockToolCall.ts` kept as deprecated for P4.0 back-compat. P4.1 code path must not import or call it.

REQUIRED_ACTION:
- N3 (doubao-seed-2.0-code) must implement `transport.ts`, `fakeTransport.ts`, `mcp-transport.test.ts`, runbook, and edit `types.ts`/`index.ts`/`README`/`CHANGELOG` per the locked contract below.

---

## 1. Locked Type Shapes (verbatim — N3 must implement exactly)

### src/mcp/transport.ts

```ts
import type { AuditEventPayload, McpErrorKind, McpHealthStatus, McpToolDescriptor } from "./types";

export interface McpTransport {
  healthProbe(serverId: string): Promise<McpHealthStatus>;
  listTools(serverId: string): Promise<McpToolDescriptor[]>;
  callTool(request: McpTransportRequest): Promise<McpTransportResponse>;
}

export interface McpTransportRequest {
  serverId: string;
  toolId: string;
  arguments: Record<string, unknown>;
}

export interface McpTransportSuccess {
  ok: true;
  result: unknown;
  auditPayload?: AuditEventPayload;
}

export interface McpTransportFailure {
  ok: false;
  error: McpTransportError;
  auditPayload?: AuditEventPayload;
}

export type McpTransportResponse = McpTransportSuccess | McpTransportFailure;

export interface McpTransportError {
  kind: McpErrorKind;
  message: string;
  retryable: boolean;
  cause?: unknown;
}
```

### src/mcp/fakeTransport.ts

```ts
import { createMcpError } from "./errorClassification";
import type { McpGatewayRegistry } from "./registry";
import type {
  McpErrorKind,
  McpHealthStatus,
  McpToolDescriptor,
  McpTransport,
  McpTransportRequest,
  McpTransportResponse
} from "./transport";
import type { AuditEventPayload } from "./types";

export interface FakeErrorOverride {
  serverId?: string;
  toolId?: string;
  callIndex?: number;
  errorKind: McpErrorKind;
  message?: string;
}

export interface FakeTransportConfig {
  errorOverrides: FakeErrorOverride[];
}

export class FakeMcpTransport implements McpTransport {
  private readonly registry: McpGatewayRegistry;
  private readonly config: FakeTransportConfig;
  private callCounter = 0;

  constructor(registry: McpGatewayRegistry, config: FakeTransportConfig) {
    this.registry = registry;
    this.config = config;
  }

  async healthProbe(serverId: string): Promise<McpHealthStatus> {
    const server = this.registry.getServer(serverId);
    if (!server) return "not_implemented";
    return server.healthStatus;
  }

  async listTools(serverId: string): Promise<McpToolDescriptor[]> {
    return this.registry.listTools(serverId);
  }

  async callTool(request: McpTransportRequest): Promise<McpTransportResponse> {
    const currentIndex = this.callCounter++;
    const server = this.registry.getServer(request.serverId);
    if (!server) return this.failure("tool_not_found", `Server ${request.serverId} was not found.`, request);
    if (!server.enabled) return this.failure("transport_unavailable", `Server ${request.serverId} is disabled.`, request);

    const tool = this.registry.listTools(request.serverId).find((d) => d.toolId === request.toolId);
    if (!tool) return this.failure("tool_not_found", `Tool ${request.toolId} was not found on server ${request.serverId}.`, request);

    const override = this.matchOverride(request, currentIndex);
    if (override) return this.failure(override.errorKind, override.message ?? `Synthetic MCP error: ${override.errorKind}.`, request);

    return {
      ok: true,
      result: {
        serverId: request.serverId,
        toolId: request.toolId,
        name: tool.name,
        arguments: request.arguments,
        synthetic: true
      },
      auditPayload: this.audit("mcp_fake_transport_succeeded", request, { synthetic: true })
    };
  }

  private matchOverride(request: McpTransportRequest, callIndex: number): FakeErrorOverride | undefined {
    // Most-specific match wins: callIndex > toolId > serverId > catch-all
    return this.config.errorOverrides.find((o) => {
      if (o.callIndex !== undefined && o.callIndex !== callIndex) return false;
      if (o.serverId !== undefined && o.serverId !== request.serverId) return false;
      if (o.toolId !== undefined && o.toolId !== request.toolId) return false;
      return true;
    });
  }

  private failure(kind: McpErrorKind, message: string, request: McpTransportRequest): McpTransportResponse {
    const error = createMcpError(kind, message);
    return {
      ok: false,
      error: { kind: error.kind, message: error.message, retryable: error.retryable },
      auditPayload: this.audit("mcp_fake_transport_failed", request, { kind })
    };
  }

  private audit(eventType: string, request: McpTransportRequest, metadata: Record<string, unknown>): AuditEventPayload {
    return {
      eventType,
      timestamp: "1970-01-01T00:00:00.000Z",
      metadata: { ...metadata, serverId: request.serverId, toolId: request.toolId, p4StaticOnly: true, executedByMock: false }
    };
  }
}
```

### src/mcp/index.ts additions

```ts
export type { McpTransport, McpTransportRequest, McpTransportResponse, McpTransportError, McpTransportSuccess, McpTransportFailure } from "./transport";
export { FakeMcpTransport } from "./fakeTransport";
export type { FakeErrorOverride, FakeTransportConfig } from "./fakeTransport";
```

## 2. Test Matrix (25 tests — N3 must implement in src/tests/mcp-transport.test.ts)

| # | Category | Test |
| --- | --- | --- |
| 1 | Happy | healthProbe returns registered health status for existing server |
| 2 | Happy | healthProbe returns "not_implemented" for missing server |
| 3 | Happy | listTools returns enabled tool descriptors |
| 4 | Happy | callTool returns synthetic success with correct shape |
| 5 | Safe-fail | callTool returns timeout via errorOverrides |
| 6 | Safe-fail | callTool returns rate_limited via errorOverrides |
| 7 | Safe-fail | callTool returns server_error via errorOverrides |
| 8 | Safe-fail | callTool returns auth_required via errorOverrides |
| 9 | Safe-fail | callTool returns tool_not_found for missing tool |
| 10 | Safe-fail | callTool returns transport_unavailable for disabled server |
| 11 | Safe-fail | callTool returns tool_not_found for missing server |
| 12 | Safe-fail | callTool returns unknown error kind via errorOverrides |
| 13 | Safe-fail | callTool returns schema_invalid via errorOverrides |
| 14 | Boundary | errorOverrides match by serverId only |
| 15 | Boundary | errorOverrides match by toolId only |
| 16 | Boundary | errorOverrides match by callIndex only |
| 17 | Boundary | errorOverrides most-specific match wins (callIndex+toolId beats serverId-only) |
| 18 | Boundary | errorOverrides catch-all (no serverId/toolId/callIndex) matches every call |
| 19 | Boundary | FakeMcpTransport constructor requires config (no default) |
| 20 | Boundary | success result marked synthetic: true |
| 21 | Boundary | auditPayload present on success |
| 22 | Boundary | auditPayload present on failure |
| 23 | Boundary | retryable sourced from createMcpError (matches RETRYABLE_MAP) |
| 24 | Boundary | disabled server returns transport_unavailable (not tool_not_found) |
| 25 | Boundary | multiple calls increment callCounter correctly |

## 3. Acceptance Criteria for N3/N4/N5

1. `src/mcp/transport.ts` created with exact types from §1.
2. `src/mcp/fakeTransport.ts` created with `FakeMcpTransport` class per §1.
3. `src/mcp/types.ts` — NO changes to TYPES_LOCKED (additive new types go in `transport.ts`/`fakeTransport.ts`, not `types.ts`).
4. `src/mcp/index.ts` re-exports new symbols per §1.
5. `src/tests/mcp-transport.test.ts` — 25 tests, all PASS.
6. `npm run lint` / `typecheck` / `test` / `build` / `verify:intelligence` all PASS.
7. `git diff --name-only` — all changed files within N3 allowedFiles (10 entries).
8. No imports from `src/runtime` / `src/governance` / `src/models` / `src/intelligence` in new files.
9. No `__mockErrorKind` in `transport.ts` or `fakeTransport.ts`.
10. `FakeMcpTransport` constructor requires both `registry` and `config` (no defaults).
11. No `.mcp.json`, `.env`, `.github/**` created.
12. `docs/MCP_TRANSPORT_INTERFACE_RUNBOOK_CN.md` created (stub OK — N6 finalizes).
13. README + CHANGELOG updated (N6 may finalize).
14. Existing 103 tests remain PASS.
15. No real MCP / API key / OAuth / network / P3 hook / RunStore audit / DAGExecutor.

## 4. mockToolCall.ts Disposition

**Decision: deprecated, kept for P4.0 back-compat.** N3 must NOT delete `mockToolCall.ts` or modify its behavior. P4.0 `mcp-registry.test.ts` may still use `mockToolCall`. P4.1 `mcp-transport.test.ts` uses `FakeMcpTransport` exclusively. The two coexist until P4.2 runtime integration.

## 5. callIndex Counter Semantics

- Counter is **global per `FakeMcpTransport` instance**.
- Incremented on every `callTool` invocation (before override matching), regardless of serverId/toolId.
- Starts at 0; first call has `callIndex=0`.
- `errorOverrides` with `callIndex: 0` matches only the first call; `callIndex` undefined matches all calls.
- Most-specific match wins: an override specifying `callIndex` + `toolId` beats one specifying only `serverId`.

---

## Handoff Packet

```text
HANDOFF_PACKET

CURRENT_PHASE: P4.1 — MCP Transport Interface + Fake Transport Harness
SEALED_PHASES: P0, P1, P2, P3, P4.0, GOV
CURRENT_NODE: N2_TECH_REVIEW
STATUS: PASS
DECISION: Technical contract locked. Types, test matrix (25), acceptance criteria (15), mockToolCall disposition (deprecated), callIndex semantics (global per instance) all finalized. N3 may implement.
FILES_ALLOWED: (read-only, no writes)
NEXT_NODE: N3_IMPLEMENTATION
NEXT_MODEL: doubao-seed-2.0-code / Codex
```
