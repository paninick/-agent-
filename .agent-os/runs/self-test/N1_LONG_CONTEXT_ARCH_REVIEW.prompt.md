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
SOURCE: .agent-os/runs/self-test/handoff.md

CURRENT_PHASE: self-test
HANDOFF_PACKET: self-test
