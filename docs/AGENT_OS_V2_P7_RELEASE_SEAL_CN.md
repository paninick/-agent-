# Agent OS v2 P7 Release Seal

封版日期：2026-07-05

## RELEASE_STATUS

`SEALED`

## 阶段

本次封版对象：

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

- Launch Desk 可以通过 ModelGateway 使用 provider model 或 fallback 到 SDK default string model。
- Launch Desk 可以通过 ModelRouter 选择 release-planning 模型，并把 fallback chain 传入 ModelGateway adapter。
- Skill scanner 可以递归扫描 `SKILL.md`，生成 descriptor，并交给 skill injector 做 best-effort 注入。
- P0-P7 已封版层保持分层边界：runtime、models、governance、mcp、integration、skills 各自职责清晰。
- 验证脚本支持无真实凭据的默认开发环境，并保留 strict credential gate。
- Secret scan 默认扫描 Git-tracked files，避免 ignored 本地 repair/vendor/generated 文件阻断封版。

## 验证基线

2026-07-05 本地新鲜验证结果：

| 命令 | 结果 |
|---|---|
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm test` | PASS，22 test files / 252 tests |
| `npm run build` | PASS |
| `npm run verify:all` | PASS |
| `npm run verify:intelligence` | PASS via `verify:all` |

`verify:intelligence` 当前摘要：

- `sourceCount`: 23
- `healthySourceCount`: 4
- `degradedSourceCount`: 18
- `failedSourceCount`: 1
- `sourceResultBreakdown.adapterError`: 1
- `containsSecrets`: false
- `visualizationReadiness.status`: `degraded`

说明：BLS public API 在本次验证中触发日请求限额，被稳定分类为 `adapter_error` / failed source。脚本未崩溃，`verify:all` 仍 PASS。这符合 P0 稳定性规则：外部源失败必须进入分类、warnings 和 degraded/failed 摘要，不得导致未捕获异常退出。

## 修改文件

本轮 N7 seal 只允许文档和验证产物：

- `docs/AGENT_OS_V2_P7_RELEASE_SEAL_CN.md`
- `CHANGELOG.md`
- `outputs/intelligence/verification-latest.json`

## 当前限制

- `skills/ECC` 是父仓库 gitlink 形式的嵌套仓库，但没有 `.gitmodules`。它内部仍有 `package-lock.json` / `yarn.lock` 锁文件漂移，已记录在 `docs/VENDOR_NESTED_REPO_STATUS_CN.md`，不作为主项目 P7 阻塞项。
- 当前没有把 `skills/ECC` 迁移为正式 submodule。
- 当前没有接真实 MCP server。
- 当前没有新增真实 API key / token / credential 处理。
- 当前没有新增 GitHub Actions、GitLab CI、Slack、channels、headless 或 scheduled entry。
- 当前没有把 vendor workflow、hook、plugin 或 agent surface 接入 Agent OS runtime。

## 禁止继续修改

封版后禁止在未开新阶段 PRD 的情况下继续修改：

- P0-P7 已封版主语义。
- `src/runtime/*` 状态机语义。
- `src/models/*` 静态路由语义。
- `src/governance/*` P3 静态治理语义。
- `src/mcp/*` P4.0/P4.1 fake-only 边界。
- `src/integration/*` P4.2 / ModelGateway 已封版链路。
- `src/skills/*` P5/P7 skill registry、scanner、loader 语义。

## 下一阶段

建议下一阶段：`P8_RELEASE_GOVERNANCE_CONSOLE`

建议目标：

- sealed phase registry
- validation baseline registry
- vendor dirty report
- skills registry health report
- release handoff packet generator
- `verify:release` 聚合命令

P8 不应默认接真实 MCP、真实 API key、真实外部工具或 UI 大重构，除非 PRD 显式批准。

## HANDOFF_PACKET

```text
CURRENT_PHASE: P7_RELEASE_SEAL
SEALED_PHASES: P0,P1,P2,P3,P4.0,P4.1,P4.2,P5,P6,P7,GOV
CURRENT_NODE: N7_RELEASE_SEAL
STATUS: SEALED
DECISION: P7 is sealed with fresh validation evidence; skills/ECC lockfile drift is documented as non-blocking vendor nested repo state.
FILES_ALLOWED: docs/AGENT_OS_V2_P7_RELEASE_SEAL_CN.md, CHANGELOG.md, outputs/intelligence/verification-latest.json
FILES_FORBIDDEN: src/* semantic changes, package.json, .env, .mcp.json, .github/*, .gitlab-ci.yml, credential files
RULES_LOCKED: no sealed phase semantic changes; no real MCP; no real API key handling; no vendor runtime bypass; Handoff Packet required across phases.
TESTS_REQUIRED: npm run lint; npm run typecheck; npm test; npm run build; npm run verify:all
BOUNDARY_WARNINGS: skills/ECC nested repo remains dirty in package-lock.json and yarn.lock; verify:intelligence currently has BLS adapter_error due daily threshold.
NEXT_MODEL: glm-5.2
NEXT_NODE: P8_PRD_LOCK_OR_RELEASE_TAGGING
```
