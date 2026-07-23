# AGENTS.md - Agent OS v2

## Canonical Sources

Read these files before acting:

1. README.md
2. CHANGELOG.md
3. docs/AGENT_OS_V2_PRD_TODO_CN.md
4. docs/AGENT_OS_V2_MODEL_ROLE_ROUTING_CN.md
5. docs/AGENT_OS_V2_MULTI_MODEL_CONSISTENCY_CN.md
6. docs/AGENT_OS_V2_CODE_GUARDRAILS_CN.md
7. docs/AGENT_OS_V2_VENDOR_TOOLING_STANDARD_CN.md
8. Current phase Runbook

## Current Roadmap

P0: Intelligence Verification / Source Classification - sealed
P1: RunStore + Approval Resume - sealed
P2: Model Selection / Model Router - sealed
P3: Tool Permission Governance - sealed
P4.0: MCP Gateway Static Registry + Tool Descriptor - sealed
P4.1: MCP Transport Interface + Fake Transport Harness - next

## Model Role Routing

Follow `docs/AGENT_OS_V2_MODEL_ROLE_ROUTING_CN.md` for node ownership:

- N0_PRD_LOCK: glm-5.2
- N1_LONG_CONTEXT_ARCH_REVIEW: longcat
- N2_TECH_REVIEW: deepseek-v4-pro
- N3_IMPLEMENTATION: doubao-seed-2.0-code / Codex
- N4_FILE_STRUCTURE_REVIEW: doubao-seed-2.0-code / Codex
- N5_VALIDATION: deepseek-v4-pro
- N6_DOC_SYNC: doubao-seed-2.0-pro
- N7_RELEASE_SEAL: glm-5.2

Kimi is optional only and is not a required release gate.

## Required Node Format

Every agent response must include:

```text
STATUS:
NEXT_NODE:
BLOCKING_ISSUES:
NON_BLOCKING_ISSUES:
REQUIRED_ACTION:
HANDOFF_PACKET:
```

## Prohibitions

Do not redefine roadmap.
Do not change sealed phase semantics.
Do not cross-import layers.
Do not connect real APIs unless current phase explicitly permits it.
Do not ask open-ended continuation questions unless STATUS = BLOCK.

## Context Window Discipline

Keep adapter files concise.
Use Handoff Packet instead of long chat memory.
Do not copy full Runbooks into CLAUDE.md, AGENTS.md, Skill descriptions, or MCP descriptors.
Use LongCat, subagents, or independent review models for long-document review.
Use /compact or /clear when crossing phases or after context-heavy work.
After /resume, restate the Handoff Packet before acting.
Vendor security, CI, Slack, and parallel agent surfaces follow `docs/AGENT_OS_V2_VENDOR_TOOLING_STANDARD_CN.md`.
Advanced Claude Code surfaces remain reference-only unless the current phase explicitly enables them.
