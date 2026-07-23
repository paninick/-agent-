# Agent OS Node Prompt

NODE: N1_LONG_CONTEXT_ARCH_REVIEW
MODEL: longcat
CURRENT_PHASE: P4.1 MCP Transport Interface + Fake Transport Harness
SEALED_PHASES: P0 Intelligence Verification / Source Classification | P1 RunStore + Approval Resume | P2 Model Selection / Model Router | P3 Tool Permission Governance | P4.0 MCP Gateway Static Registry + Tool Descriptor | GOV governance documentation and consistency patches
WRITE_ALLOWED: false

## FILES_ALLOWED
- NONE

## FILES_FORBIDDEN
- src/**
- .mcp.json
- .env

## REQUIRED_OUTPUT_FIELDS
- STATUS:
- NEXT_NODE:
- NEXT_MODEL:
- BLOCKING_ISSUES:
- NON_BLOCKING_ISSUES:
- REQUIRED_ACTION:
- HANDOFF_PACKET:

## PROMPT_TEMPLATE
# N1_LONG_CONTEXT_ARCH_REVIEW

Role: Long Context Architecture Reviewer
Model: longcat

Goal:
Review the locked scope against the whole project context and identify architecture drift before technical review.

Rules:
- Review only; do not modify files.
- Check whether the scope preserves sealed phase boundaries.
- Identify missing architecture constraints, oversized abstractions, and phase confusion.
- Do not announce SEALED.

Required output format:
```text
STATUS:
NEXT_NODE:
NEXT_MODEL:
BLOCKING_ISSUES:
NON_BLOCKING_ISSUES:
REQUIRED_ACTION:
HANDOFF_PACKET:
```


## INPUT_HANDOFF
SOURCE: .agent-os/runs/2026-07-05-p4-1/00-input-handoff.md

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
