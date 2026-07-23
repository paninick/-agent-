# Input Handoff — P4.1

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
DECISION: GOV governance layer is SEALED. Begin P4.1 PRD lock.
FILES_ALLOWED: To be defined by P4.1 PRD.
FILES_FORBIDDEN:
  src/governance/*
  src/runtime/*
  src/models/*
  src/intelligence/*
  .mcp.json
  .github/workflows/*
  .gitlab-ci.yml
  .env
  credential files
TYPES_LOCKED:
  McpServerProfile
  McpToolDescriptor
  McpAuthRequirement
  McpHealthStatus
  ToolCallRequest
  ToolCallResult discriminated union
  AuditEventPayload
  McpError
  McpErrorKind
  McpDeclaredEffect v1 single value
RULES_LOCKED:
  P4.0 remains static registry / descriptor only.
  P4.1 may define fake transport only after PRD lock.
  No real MCP transport.
  No API key / token / credential.
  No P3 hook invocation.
  No RunStore audit write.
  src/mcp must not import runtime / governance / intelligence.
TESTS_REQUIRED:
  Keep existing 103 tests passing.
  Add P4.1 happy path / safe failure / boundary protection tests only after N2 locks PRD.
VALIDATION_COMMANDS:
  npm run lint
  npm run typecheck
  npm test
  npm run build
  npm run verify:intelligence
BOUNDARY_WARNINGS:
  .github/workflows/ci.yml is existing v3-verify workflow, not GOV patch output.
  verify:intelligence remains degraded due missing credentials, not P4.1 scope.
  GOV rules are documentation governance, not runtime enforcement.
NEXT_MODEL: deepseek-v4-pro
NEXT_NODE: N2_TECH_REVIEW
```
