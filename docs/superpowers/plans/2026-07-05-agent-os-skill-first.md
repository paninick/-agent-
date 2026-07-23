# Agent OS Skill-First Governance Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `planning-with-files` plus `superpowers:executing-plans` or `superpowers:verification-before-completion` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Agent OS v2 project work start from persistent planning, Superpowers execution discipline, and Karpathy-style surgical implementation.

**Architecture:** This is a workflow-governance layer over existing local skills. It does not change runtime code, connect MCP, enable hooks, or read credentials.

**Tech Stack:** Markdown planning files, local Codex skills, existing npm validation scripts, Agent OS local docs.

---

## File Structure

- Create: `.planning/agent-os-skill-first/task_plan.md`
  - Persistent phase plan and success criteria.
- Create: `.planning/agent-os-skill-first/findings.md`
  - Research and validation findings.
- Create: `.planning/agent-os-skill-first/progress.md`
  - Session progress and command outcomes.
- Create: `.planning/.active_plan`
  - Active scoped plan pointer.
- Modify or create later: `docs/LOCAL_SKILL_TRIAGE_POLICY_CN.md`
  - Future allow/review/reject policy derived from `verify:skills`.

## Task 1: Confirm Planning Baseline

**Files:**
- Read: `.planning/agent-os-skill-first/task_plan.md`
- Read: `.planning/agent-os-skill-first/findings.md`
- Read: `.planning/agent-os-skill-first/progress.md`

- [ ] **Step 1: Read the active plan**

Run:

```powershell
Get-Content .planning\.active_plan
Get-Content .planning\agent-os-skill-first\task_plan.md
```

Expected: active plan is `agent-os-skill-first`.

- [ ] **Step 2: Confirm inventory files exist**

Run:

```powershell
Test-Path docs\LOCAL_SKILL_INVENTORY_CN.md
Test-Path docs\LOCAL_SKILL_INVENTORY.csv
```

Expected: both commands return `True`.

## Task 2: Triage Skill Audit Report

**Files:**
- Read: `outputs/skill-audit-report.json`
- Create: `docs/LOCAL_SKILL_TRIAGE_POLICY_CN.md`

- [ ] **Step 1: Summarize audit families**

Run:

```powershell
Get-Content outputs\skill-audit-report.json -TotalCount 80
```

Expected: report shows accept, manual_review, and reject classifications.

- [ ] **Step 2: Draft triage policy**

Create `docs/LOCAL_SKILL_TRIAGE_POLICY_CN.md` with:

```markdown
# 本地 Skill 准入策略

## 状态

- accept: 可作为本地 instruction skill 使用。
- manual_review: 需要按任务和凭据边界人工复核。
- reject: 不进入当前 Agent OS v2 主工作流。

## 默认边界

- 不启用真实 MCP。
- 不启用 hooks。
- 不读取 credential。
- 不把 vendor 示例升级为 runtime。
- 不让外部 skill 绕过 N0-N7。
```

## Task 3: Verify After Any Policy Change

**Files:**
- Read: `package.json`
- Read: validation outputs

- [ ] **Step 1: Run core validation**

Run:

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npm run verify:intelligence
```

Expected: all commands exit `0`.

- [ ] **Step 2: Run skill audit as governance signal**

Run:

```powershell
npm run verify:skills
```

Expected: may exit `1` until manual/reject classes are explicitly resolved. Treat this as a governance backlog, not a core runtime failure.

## Self-Review

- Spec coverage: this plan covers planning-with-files, Superpowers, and Karpathy-first execution.
- Placeholder scan: no placeholder markers.
- Type consistency: all files are markdown or existing npm scripts; no runtime type changes.
