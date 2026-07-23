# N1 Output — P4.1 Architecture Review

STATUS: PASS

NEXT_NODE: N2_TECH_REVIEW

NEXT_MODEL: deepseek-v4-pro

BLOCKING_ISSUES:
- (none)

NON_BLOCKING_ISSUES:
- Q2 coupling: `McpTransportError` reuses `McpErrorKind` and `retryable` from `McpError`. The coupling is acceptable because `McpErrorKind` is TYPES_LOCKED and `retryable` is sourced from `RETRYABLE_MAP` (single source of truth). However, `McpTransportError` adds an optional `cause?: unknown` field that `McpError` lacks. This is additive and non-breaking, but N2 should confirm whether `McpTransportError` should be a distinct interface or a type alias extending `McpError`. Recommendation: keep as distinct interface to avoid widening the locked `McpError` shape.
- Q3 safety: `FakeTransportConfig.errorOverrides` uses `callIndex?: number` for per-call error injection. This requires `FakeMcpTransport` to maintain an internal call counter. N2 should specify the counter semantics (per-server, per-tool, or global) to avoid ambiguity at N3.
- `mockToolCall.ts` deprecated-not-removed: the `__mockErrorKind` magic string remains in `mockToolCall.ts` for P4.0 back-compat. N4 must verify P4.1 code path (`transport.ts`/`fakeTransport.ts`) does NOT use `__mockErrorKind`. The P4.0 `mcp-registry.test.ts` may still use it — that is acceptable until P4.2.

REQUIRED_ACTION:
- N2 (deepseek-v4-pro) must lock: (1) final TS type shapes verbatim, (2) test matrix (~25 tests), (3) acceptance criteria for N3/N4/N5, (4) `mockToolCall.ts` disposition decision, (5) callIndex counter semantics.

---

## Architecture Review — 3 Questions

### Q1: McpTransport interface vs P4.0 registry boundary integrity

**Finding: PASS.** The `McpTransport` interface cleanly separates from `McpGatewayRegistry`:

- `McpGatewayRegistry` (P4.0) is a **static descriptor store**: it answers "what servers/tools exist" via `getServer`/`getTool`/`listTools`/`listServers`. It does not perform calls.
- `McpTransport` (P4.1) is a **behavioral contract**: it answers "how to call a server/tool" via `healthProbe`/`listTools`/`callTool`. It consumes registry output as input, not duplicates it.
- The `FakeMcpTransport` constructor takes `McpGatewayRegistry` as a dependency — it reads descriptors from the registry to resolve tool existence, then produces synthetic results. This is dependency injection, not boundary violation.
- `listTools` on the transport interface overlaps in name with `McpGatewayRegistry.listTools`, but they serve different layers: registry returns static descriptors; transport returns live (here: synthetic) descriptors. The transport's `listTools` may delegate to the registry internally, which is correct composition.

**No boundary violation.** The interface consumes registry output; it does not re-implement registry logic.

### Q2: McpTransportError reuse of McpError coupling risk

**Finding: PASS with note.** `McpTransportError` reuses `McpErrorKind` (8 kinds, TYPES_LOCKED) and `retryable` (sourced from `RETRYABLE_MAP`). This is safe because:

- `McpErrorKind` is locked — P4.1 cannot add new kinds, so the transport layer classifies all failures into the existing 8 categories. No lossy mapping.
- `retryable` is derived from `RETRYABLE_MAP` (single source of truth in `errorClassification.ts`), not hardcoded in transport code. The transport calls `createMcpError(kind, message)` which sets `retryable` from the map.
- The `cause?: unknown` field on `McpTransportError` is additive and optional. It carries synthetic error context (e.g., which `errorOverride` triggered). It does NOT widen `McpError` because `McpTransportError` is a separate interface.

**Coupling risk: low.** The transport layer depends on `McpErrorKind` + `createMcpError` + `RETRYABLE_MAP` — all existing, all locked. If a future phase adds new `McpErrorKind` values, the transport layer benefits automatically (no code change). This is desirable forward-compatibility.

### Q3: FakeTransportConfig.errorOverrides synthetic error injection safety

**Finding: PASS.** The structured config replaces the `__mockErrorKind` magic string safely:

- **Old path (P4.0)**: `request.arguments.__mockErrorKind` — a magic property snuck into the caller-supplied arguments record, untyped, unvalidated at the type level, polluting the tool's input contract. It allows only one error kind per call, unconditionally.
- **New path (P4.1)**: `FakeTransportConfig.errorOverrides` — a typed array of `{ serverId?, toolId?, callIndex?, errorKind, message? }`. Overrides are declared on the `FakeMcpTransport` instance, not in request arguments. They support per-server, per-tool, per-call targeting.
- **Production safety**: `FakeMcpTransport` is constructable only with an explicit `FakeTransportConfig` (constructor requires both `registry` and `config` parameters, no defaults). A production code path cannot accidentally use a fake transport unless explicitly wired.
- **Isolation**: errorOverrides match by optional fields. `serverId` undefined = matches all servers; `toolId` undefined = matches all tools; `callIndex` undefined = matches every call. First match wins (N2 should confirm matching precedence).

**No production leak risk.** The fake transport is explicitly constructed for testing; it cannot become a default.

---

## Handoff Packet

```text
HANDOFF_PACKET

CURRENT_PHASE: P4.1 — MCP Transport Interface + Fake Transport Harness
SEALED_PHASES: P0, P1, P2, P3, P4.0, GOV
CURRENT_NODE: N1_LONG_CONTEXT_ARCH_REVIEW
STATUS: PASS
DECISION: Architecture review passed. 3 questions answered: (1) transport/registry boundary intact, (2) McpTransportError coupling low-risk, (3) errorOverrides safe. N2 may lock technical contract.
FILES_ALLOWED: (read-only, no writes)
NEXT_NODE: N2_TECH_REVIEW
NEXT_MODEL: deepseek-v4-pro
```
