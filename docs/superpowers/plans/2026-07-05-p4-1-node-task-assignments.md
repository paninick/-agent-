# P4.1 Node Task Assignments — Per-Agent Briefs

> Generated 2026-07-05 by orchestrator (glm-5.2).
> Source evidence: 4 Explore agents gathered handoff packet, allowed/forbidden matrix, N0 prompt template, and P4.0 type inventory.
> This file is project state data. Each brief is self-contained for the assigned agent.

## Governance Constraint (read first)

The Agent OS v2 node runner enforces strict N0→N7 ordering for WRITE tasks. Per `agent-os-node-runner-workflow`: "Do not let a workflow, subagent, vendor hook, or external review bypass N0-N7." Therefore:

- **N0_PRD_LOCK must complete (STATUS: PASS) before N1/N2/N3 can start.**
- N1 (longcat) and N2 (deepseek-v4-pro) are READ-ONLY review nodes — they can prepare their review briefs in parallel only AFTER N0 produces the PRD, because their reviews must cite the PRD content.
- N3 (doubao-seed-2.0-code / Codex) is the only IMPLEMENTATION write node; it runs strictly after N2 PASS.

This means the realistic execution is sequential: N0 → N1 → N2 → N3 → N4 → N5 → N6 → N7, with N1/N2 prep work parallelizable only in the sense of pre-loading context.

## Pre-Assigned READ-ONLY Investigation Tasks (parallelizable now)

These 4 investigations are already COMPLETE (the Explore agents above did them). They form the evidence base for all node briefs below:

| Investigation | Done by | Output |
| --- | --- | --- |
| P4.1 PRD input facts (handoff packet, types/rules/files locked) | Explore agent 1 | HANDOFF_PACKET, TYPES_LOCKED (10), RULES_LOCKED (7), FILES_FORBIDDEN (9), BOUNDARY_WARNINGS (3) captured |
| P4.1 allowed/forbidden matrix cross-reference | Explore agent 2 | N3 allowedFiles (10), N3 forbiddenFiles (7), §10 允许 (11), §10 禁止 (12); no contradictions; `transport.ts` + `fakeTransport.ts` confirmed absent |
| N0 prompt template + status word rules | Explore agent 3 | N0 requiredOutputFields (7), model=glm-5.2, writeAllowed=true (runs/** only); 7 accepted STATUS values; BLOCK/REVISE/ENV_BLOCK stop flow |
| P4.0 type inventory for P4.1 extension | Explore agent 4 | 15 types in types.ts (all REUSE); 6 new types/modules to add (EXTEND); `__mockErrorKind` magic string + duplicated `errorKinds` literal identified as design debt to replace |

---

## Node Briefs

### Brief A — N0_PRD_LOCK (assigned: glm-5.2)

**Role**: PRD Lock Owner. **Goal**: Lock P4.1 scope before any implementation starts.

**Input evidence (already gathered — do NOT re-investigate)**:
- Handoff packet: `CURRENT_PHASE: P4.1 — MCP Transport Interface + Fake Transport Harness`. SEALED: P0,P1,P2,P3,P4.0,GOV. CURRENT_NODE: N0_PRD_LOCK. STATUS currently PENDING (must become PASS).
- TYPES_LOCKED (do NOT redefine, only extend): McpServerProfile, McpToolDescriptor, McpAuthRequirement, McpHealthStatus, ToolCallRequest, ToolCallResult discriminated union, AuditEventPayload, McpError, McpErrorKind, McpDeclaredEffect v1 single value.
- RULES_LOCKED: P4.0 stays static registry; P4.1 may define fake transport only after PRD lock; no real MCP transport; no API key/token/credential; no P3 hook invocation; no RunStore audit write; src/mcp must not import runtime/governance/intelligence.
- N3 allowedFiles (the PRD must ratify these): `src/mcp/transport.ts`, `src/mcp/fakeTransport.ts`, `src/mcp/types.ts`, `src/mcp/health.ts`, `src/mcp/errorClassification.ts`, `src/mcp/index.ts`, `src/tests/mcp-transport.test.ts`, `docs/MCP_TRANSPORT_INTERFACE_RUNBOOK_CN.md`, `README.md`, `CHANGELOG.md`.
- §10 允许: McpTransport interface, FakeMcpTransport, TransportRequest, TransportResponse, TransportError, healthProbe mock, listTools mock, callTool mock, timeout synthetic, rate_limited synthetic, server_error synthetic.
- §10 禁止: real SSE, real streamable_http, real stdio subprocess, real MCP client, real API key, real OAuth, real network, real list_tools, real call_tool, P3 hook calls, RunStore audit write, DAGExecutor integration.
- Design debt to replace: `__mockErrorKind` magic string in `mockToolCall.ts:25-28` + duplicated `errorKinds` literal `mockToolCall.ts:6-15` → structured `FakeTransportConfig.errorOverrides`.

**Required output**: Write `.agent-os/runs/2026-07-05-p4-1/N0-output.md` with these 7 fields (verbatim field names required):
```
STATUS: PASS
NEXT_NODE: N1_LONG_CONTEXT_ARCH_REVIEW
NEXT_MODEL: longcat
BLOCKING_ISSUES: (none, or list)
NON_BLOCKING_ISSUES: (list)
REQUIRED_ACTION: (what N1 must do)
HANDOFF_PACKET: (fenced block with CURRENT_PHASE, SEALED_PHASES, CURRENT_NODE, STATUS, DECISION, FILES_ALLOWED, FILES_FORBIDDEN, TYPES_LOCKED, RULES_LOCKED, TESTS_REQUIRED, VALIDATION_COMMANDS, BOUNDARY_WARNINGS, NEXT_NODE, NEXT_MODEL)
```
The PRD body (above the handoff packet) must define: task scope, explicit non-goals, file boundaries, validation baseline, and (recommended but not prompt-mandated) core types to add, test matrix outline, acceptance criteria. The N0 prompt mandates only scope/non-goals/file-boundaries/validation-baseline; types/test-matrix/acceptance are strongly recommended for N1/N2 to consume.

**Write surface**: `.agent-os/runs/**` only. Forbidden: `src/**`, `.mcp.json`, `.env`.

**Status word**: Must be `PASS` to advance. `PENDING` (current) is NOT in the accepted runner status list — it is a pre-lock placeholder only.

**Acceptance check**: output contains all 7 required fields; STATUS: PASS; HANDOFF_PACKET advances NEXT_NODE to N1_LONG_CONTEXT_ARCH_REVIEW and NEXT_MODEL to longcat; no redefinition of TYPES_LOCKED; no relaxation of RULES_LOCKED or FILES_FORBIDDEN.

---

### Brief B — N1_LONG_CONTEXT_ARCH_REVIEW (assigned: longcat)

**Role**: Long-Context Architecture Reviewer. **Cannot start until N0 STATUS: PASS.**

**Review mandate (3 architectural questions)**:
1. **Transport interface vs P4.0 registry boundary integrity**: Does `McpTransport` interface cleanly separate from `McpGatewayRegistry` (P4.0 static registry)? The interface should consume registry output, not duplicate it. Confirm `McpTransport` methods (`healthProbe`, `listTools`, `callTool`) do not re-implement registry lookup.
2. **McpTransportError reuse of McpError coupling risk**: `McpTransportError` should map down to `McpError` via existing `createMcpError` rather than introduce new `McpErrorKind` values (TYPES_LOCKED forbids changing McpErrorKind). Verify the mapping is lossless for the 8 existing kinds.
3. **FakeTransportConfig.errorOverrides synthetic error injection safety**: Does the structured config (keyed by serverId/toolId, possibly call index) fully replace the `__mockErrorKind` magic string? Confirm no residual magic-string path remains. Confirm errorOverrides cannot leak into production (FakeMcpTransport must be constructable only with explicit config, never as a default).

**Constraints**: READ-ONLY (writeAllowed=false). Forbidden: `src/**`, `.mcp.json`, `.env`.

**Required output**: `.agent-os/runs/2026-07-05-p4-1/N1-output.md` with 7 fields; STATUS must be PASS to advance, BLOCK/REVISE if architectural issues found.

---

### Brief C — N2_TECH_REVIEW (assigned: deepseek-v4-pro)

**Role**: Technical Reviewer. **Cannot start until N1 STATUS: PASS.**

**Lock mandate (finalize the contract N3 will implement)**:
1. **Final type shapes** (verbatim TS): `McpTransport` interface, `McpTransportRequest`, `McpTransportResponse` (discriminated union ok/fail), `McpTransportError` (reuses McpError kind/message/retryable + optional cause), `FakeTransportConfig` (with `errorOverrides: Array<{ serverId?: string; toolId?: string; callIndex?: number; errorKind: McpErrorKind; message?: string }>`), `FakeMcpTransport` class signature.
2. **Test matrix** (target ~25 tests): 3 happy path (healthProbe ok / listTools ok / callTool ok), 8 safe-failure (timeout/rate_limited/server_error/auth_required/tool_not_found/transport_unavailable/schema_invalid/unknown), 14 boundary (forbidden imports, no real network, no P3 hook, no RunStore audit, errorOverrides isolation, FakeMcpTransport not default-constructable, types.ts not redefining locked types, etc.).
3. **Acceptance criteria** for N3/N4/N5: diff stays in N3 allowedFiles; 103 existing tests stay green + new tests; lint/typecheck/build/verify:intelligence pass.

**Constraints**: READ-ONLY. Forbidden: `src/**`, `.mcp.json`, `.env`.

**Required output**: `.agent-os/runs/2026-07-05-p4-1/N2-output.md`; STATUS PASS to advance.

---

### Brief D — N3_IMPLEMENTATION (assigned: doubao-seed-2.0-code / Codex)

**Role**: Implementer. **Cannot start until N2 STATUS: PASS.**

**Implementation scope** (exactly these files, no others):
1. CREATE `src/mcp/transport.ts` — `McpTransport` interface, `McpTransportRequest`, `McpTransportResponse`, `McpTransportError` types.
2. CREATE `src/mcp/fakeTransport.ts` — `FakeTransportConfig` (with `errorOverrides`), `FakeMcpTransport` class implementing `McpTransport` (healthProbe/listTools/callTool mocks + timeout/rate_limited/server_error synthetics).
3. EDIT `src/mcp/types.ts` — add the new transport types alongside existing (do NOT modify TYPES_LOCKED).
4. EDIT `src/mcp/index.ts` — re-export new transport symbols.
5. CREATE `src/tests/mcp-transport.test.ts` — per N2 test matrix (~25 tests).
6. CREATE `docs/MCP_TRANSPORT_INTERFACE_RUNBOOK_CN.md` — runbook.
7. EDIT `README.md` + `CHANGELOG.md` — sync (or defer detailed doc sync to N6).

**Hard prohibitions**: real SSE/streamable_http/stdio/MCP client/API key/OAuth/network/list_tools/call_tool; P3 hook calls; RunStore audit writes; DAGExecutor integration; imports from `src/runtime`/`src/governance`/`src/models`/`src/intelligence`; `.mcp.json`; `.github/**`; `.env`.

**Design debt to resolve**: replace `__mockErrorKind` magic string (`mockToolCall.ts:25-28`) + duplicated `errorKinds` literal (`mockToolCall.ts:6-15`) with `FakeTransportConfig.errorOverrides`. Decide whether `mockToolCall.ts` is deprecated, removed, or refactored to delegate to `FakeMcpTransport` — N2 should lock this decision.

**Constraints**: writeAllowed=true but ONLY to the 10 allowedFiles. Forbidden everything else.

**Required output**: `.agent-os/runs/2026-07-05-p4-1/N3-output.md` with files changed, tests changed, risks, handoff to N4.

---

### Brief E — N4_FILE_STRUCTURE_REVIEW (assigned: doubao-seed-2.0-code)

**Role**: File Structure Reviewer. READ-ONLY. **Cannot start until N3 STATUS: PASS (DONE).**

**Check mandate**:
1. `git diff --name-only` — every changed file is in N3 allowedFiles (the 10-entry list). No forbidden file touched.
2. `grep -rn "from " src/mcp/transport.ts src/mcp/fakeTransport.ts` — no imports from `runtime`/`governance`/`models`/`intelligence`. Only `./` intra-module imports allowed.
3. `grep -rn "__mockErrorKind" src/` — if `mockToolCall.ts` still has the magic string, confirm N2/N3 decided to keep it; if removed, confirm zero residual references.
4. Confirm `transport.ts` + `fakeTransport.ts` exist; confirm no real-transport files (realSseTransport.ts, realStdioTransport.ts, etc.) were created.

**Required output**: `N4-output.md`; STATUS PASS to advance to N5.

---

### Brief F — N5_VALIDATION (assigned: deepseek-v4-pro)

**Role**: Validator. READ-ONLY. **Cannot start until N4 STATUS: PASS.**

**Run + report** (required `VALIDATION_RESULTS:` field, unique to N5):
1. `npm run lint` — must PASS.
2. `npm run typecheck` — must PASS.
3. `npm test` — must PASS; expect 103 + N new P4.1 tests (target ~128).
4. `npm run build` — must PASS.
5. `npm run verify:intelligence` — must PASS (23 sources / containsSecrets=false; degraded 18 expected, not P4.1 scope).

**Required output**: `N5-output.md` with `VALIDATION_RESULTS:` listing each command + real outcome; STATUS PASS to advance to N6.

---

### Brief G — N6_DOC_SYNC (assigned: doubao-seed-2.0-pro)

**Role**: Doc Sync. **Cannot start until N5 STATUS: PASS.**

**Sync mandate** (allowedFiles: `README.md`, `CHANGELOG.md`, `docs/**`):
1. README.md — add/update `## MCP Transport Interface` section (transport abstraction + fake harness, no real MCP).
2. CHANGELOG.md — add P4.1 entry under current date.
3. `docs/MCP_TRANSPORT_INTERFACE_RUNBOOK_CN.md` — finalize runbook (if N3 only stubbed it).
4. Reconcile the known non-blocking stale item: `docs/MCP_GATEWAY_REGISTRY_RUNBOOK_CN.md` §10 describes P4.1 as "real MCP transport" but Code Guardrails §10 (higher priority) defines P4.1 as "Fake Transport Harness" — add a note pointing to Code Guardrails as authoritative.

**Required output**: `N6-output.md`; STATUS PASS to advance to N7.

---

### Brief H — N7_RELEASE_SEAL (assigned: glm-5.2)

**Role**: Release Seal Judge. READ-ONLY. **Cannot start until N6 STATUS: PASS.**

**Seal mandate (12 must-check)**:
1. No changes to sealed P0–P4.0 semantics (diff `src/intelligence`, `src/runtime`, `src/models`, `src/governance`, `src/mcp` P4.0 files — only `types.ts`/`index.ts`/`health.ts`/`errorClassification.ts` may have additive changes, no semantic changes to locked types).
2. No real MCP transport / API key / OAuth / network.
3. No P3 hook calls (grep `preToolUseHook`/`postToolUseHook` in `src/mcp/`).
4. No RunStore audit writes (grep `appendAuditEvent` in `src/mcp/`).
5. No `.mcp.json`.
6. No `.env` / credentials.
7. No `.github/**` / CI / Slack / channels.
8. N5 validation all PASS.
9. N3 diff within allowedFiles.
10. TYPES_LOCKED not redefined.
11. RULES_LOCKED not relaxed.
12. `__mockErrorKind` design debt resolved (or explicitly deferred with reason).

**Required output**: `N7-output.md`; STATUS `SEALED` to seal P4.1, or `NOT_SEALED` / `BLOCK` if any check fails.

---

## Execution Sequencing (concrete)

```
NOW (parallel, read-only):
  [DONE] 4 Explore investigations (evidence base complete)

STEP 1 (sequential, write):
  Brief A — N0 glm-5.2 writes N0-output.md (STATUS: PASS)
  ▼ gate: N0 PASS

STEP 2 (sequential, read):
  Brief B — N1 longcat writes N1-output.md (STATUS: PASS)
  ▼ gate: N1 PASS

STEP 3 (sequential, read):
  Brief C — N2 deepseek-v4-pro writes N2-output.md (STATUS: PASS)
  ▼ gate: N2 PASS

STEP 4 (sequential, write):
  Brief D — N3 doubao-seed-2.0-code implements transport.ts + fakeTransport.ts + tests
  ▼ gate: N3 DONE

STEP 5 (sequential, read):
  Brief E — N4 doubao-seed-2.0-code file-structure review
  ▼ gate: N4 PASS

STEP 6 (sequential, read):
  Brief F — N5 deepseek-v4-pro runs 5 validation commands
  ▼ gate: N5 PASS

STEP 7 (sequential, write):
  Brief G — N6 doubao-seed-2.0-pro doc sync
  ▼ gate: N6 PASS

STEP 8 (sequential, read):
  Brief H — N7 glm-5.2 release seal (STATUS: SEALED)
  ▼ gate: P4.1 SEALED
```

## Success Criteria for This Assignment Document

- [ ] Each node has a self-contained brief with: role, model, input evidence, required output, write surface, status word, acceptance check.
- [ ] No brief instructs bypassing N0→N7 ordering.
- [ ] No brief authorizes real MCP / API key / P3 hook / RunStore audit / forbidden imports.
- [ ] Brief A (N0) is immediately actionable — it has all input facts pre-gathered.
- [ ] Briefs B-H reference their predecessor's gate.

## Open Decisions for User

1. **Should I (orchestrator) execute Brief A now?** I am glm-5.2, the N0-assigned model. I have all the input evidence. I can write `N0-output.md` with STATUS: PASS immediately. (Recommended — it unblocks the whole chain.)
2. **mockToolCall.ts disposition**: should N3 deprecate it (keep for P4.0 back-compat), remove it (clean break), or refactor it to delegate to FakeMcpTransport? N2 should lock this, but if you have a preference, state it now.
3. **First git commit**: do you want a `git add -A && git commit` after P4.1 seals, to establish the recovery baseline? (Currently zero commits on master.)
