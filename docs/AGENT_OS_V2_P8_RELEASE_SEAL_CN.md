# Agent OS v2 P8 Release Seal

封版日期：2026-07-05

## RELEASE_STATUS

`SEALED`

## 阶段

本次封版对象：

- P8 Release Governance Console

已封版前置阶段：

- P0 Intelligence Verification / Source Classification
- P1 RunStore + Approval Resume
- P2 Model Selection / Model Router
- P3 Tool Permission Governance
- P4.0 MCP Gateway Static Registry + Tool Descriptor
- P4.1 MCP Transport Interface + Fake Transport Harness
- P4.2 Tool Execution Adapter + Audit Bridge
- P5 Skill Progressive Loading + Context Budget
- P6 ModelGateway streaming + Skill Injection
- P7 ModelRouter + Skill Scanner Integration
- GOV governance documentation and vendor boundary rules

## 完成能力

- 新增 `src/release/` 静态发布治理层。
- 新增 sealed phase registry。
- 新增 validation baseline reader。
- 新增 vendor dirty report，能把 `skills/ECC` gitlink / lockfile drift 分类为 documented non-blocking。
- 新增 skills health report。
- 新增 release handoff packet generator。
- 新增 `npm run verify:release`。

## 验证基线

P8 N5 验证结果：

| 命令 | 结果 |
|---|---|
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm test` | PASS，23 test files / 261 tests |
| `npm run build` | PASS |
| `npm run verify:all` | PASS |
| `npm run verify:release` | PASS，`ok=true`, `releaseStatus=ready`, `blockingReasons=[]` |

提交后复核：

- `npm run verify:release` PASS。
- 工作区仅剩 `skills/ECC` 已记录 vendor nested repo dirty 状态。

## 当前限制

- `verify:release` 不运行完整 lint / typecheck / test / build；完整验证仍由 N5 显式执行。
- `skills/ECC` 仍有 `package-lock.json` / `yarn.lock` lockfile drift；P8 只报告，不回滚、不提交。
- `.agent-os/node-runner.config.json` 与 `.agent-os/node-runner.yaml` 仍记录旧 P4.1 current phase；P8 仅报告该配置漂移，未在本阶段修复。
- P8 不接真实 MCP，不创建 `.mcp.json`，不读取 API key，不接 CI/channel/headless 自动化，不做 UI 重构。

## HANDOFF_PACKET

```text
CURRENT_PHASE: P8_RELEASE_SEAL
SEALED_PHASES: P0,P1,P2,P3,P4.0,P4.1,P4.2,P5,P6,P7,P8,GOV
CURRENT_NODE: N7_RELEASE_SEAL
STATUS: SEALED
DECISION: P8 Release Governance Console is sealed as a local static reporting/governance layer.
FILES_CHANGED: src/release/**; scripts/verify-release.ts; src/tests/release-governance.test.ts; docs/RELEASE_GOVERNANCE_CONSOLE_RUNBOOK_CN.md; docs/AGENT_OS_V2_P8_RELEASE_SEAL_CN.md; README.md; CHANGELOG.md; package.json; .agent-os/runs/2026-07-05-p8-release-governance/**
VALIDATION_RESULTS: lint PASS; typecheck PASS; test PASS 23 files / 261 tests; build PASS; verify:all PASS; verify:release PASS
BOUNDARY_WARNINGS: skills/ECC vendor lockfile drift remains; node-runner config still names P4.1.
NEXT_MODEL: glm-5.2
NEXT_NODE: P9_PRD_LOCK
```
