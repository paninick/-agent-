# Release Governance Console Runbook

## 定位

P8 Release Governance Console 是本地静态发布治理层。

它把已封版阶段、验证基线、vendor dirty 状态、技能健康度和下一节点 Handoff Packet 汇总成可重复检查的本地报告。

它不是 UI，不是 runtime，不是 MCP gateway，不是 CI/CD，不是 Secret Manager。

## 组件

- `src/release/phaseRegistry.ts`：P0-P7/GOV sealed phase registry。
- `src/release/validationBaseline.ts`：读取 `outputs/intelligence/verification-latest.json` 的验证摘要。
- `src/release/vendorStatus.ts`：分类父仓库和 `skills/ECC` 嵌套仓库 dirty 状态。
- `src/release/skillsHealth.ts`：基于本地 `SKILL.md` descriptor 做静态健康摘要。
- `src/release/handoffPacket.ts`：生成下一节点 Handoff Packet。
- `src/release/releaseGovernance.ts`：组装 `ReleaseGovernanceSnapshot`。
- `scripts/verify-release.ts`：只读本地命令，输出 JSON + Handoff Packet。

## 命令

```bash
npm run verify:release
```

该命令：

- 读取 Git dirty 状态。
- 读取 `outputs/intelligence/verification-latest.json`。
- 扫描 `SKILLS_ROOT`，默认 `skills/ECC/skills`。
- 输出 `ReleaseGovernanceSnapshot` JSON。
- 输出下一节点 Handoff Packet。

该命令不运行完整 `lint` / `typecheck` / `test` / `build`。完整验证仍由 N5 显式执行；`verify:release` 只聚合当前本地可读取的 release 状态。

## 通过条件

`verify:release` 在以下情况下返回 0：

- 没有未知 dirty 文件。
- `skills/ECC` dirty 状态仅限已记录的 gitlink / lockfile drift。
- intelligence artifact 不包含 secrets。
- release snapshot 能正常构建。

## 阻塞条件

`verify:release` 在以下情况下返回非 0：

- 出现未记录的 dirty 文件，例如 `src/runtime/*`、`.env`、`.mcp.json`。
- intelligence artifact 标记 `containsSecrets=true`。
- release snapshot 发现结构性 blocking reasons。

## `skills/ECC` 规则

当前 `skills/ECC` 是嵌套 Git 仓库，父仓库记录为 gitlink，但没有 `.gitmodules`。

已知非阻塞 dirty：

- `skills/ECC`
- `skills/ECC/package-lock.json`
- `skills/ECC/yarn.lock`

P8 不会回滚或提交 `skills/ECC` 内部变更。

## 边界

- 不接真实 MCP。
- 不创建 `.mcp.json`。
- 不读取 API key / token / credential。
- 不新增 GitHub Actions / GitLab CI。
- 不接 Slack / channel / headless / scheduled task。
- 不改 P0-P7 已封版语义。
- 不修改 `skills/ECC` 内部文件。
- 不替代 N5 validation，也不自动宣布 N7 `SEALED`。

## 输出用途

`ReleaseGovernanceSnapshot` 适合作为：

- 本地 release readiness 报告。
- N4/N5/N7 审查输入。
- 下一阶段 PRD 的 Handoff Packet 来源。

它不是自动封版系统；最终 `SEALED` 仍只能由 N7 输出。
