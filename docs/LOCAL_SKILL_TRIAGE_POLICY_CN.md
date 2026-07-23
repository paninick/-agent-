# 本地 Skill 准入策略

生成时间：2026-07-05

## 目的

把本地 skill、第三方 skill 仓库、vendor 示例、hook、MCP 配置和自动化能力分成可用、待复核和拒绝三类，避免把外部工具误升级为 Agent OS v2 runtime。

## 当前审计基线

来源：`outputs/skill-audit-report.json`

| 指标 | 数量 |
| --- | ---: |
| totalChecked | 1940 |
| accept | 21 |
| manual_review | 1066 |
| reject | 853 |

## 按仓库族群

| Repo | Total | Accept | Manual Review | Reject | 当前处理 |
| --- | ---: | ---: | ---: | ---: | --- |
| agent-reach | 1 | 0 | 1 | 0 | manual_review |
| anthropic-skills | 18 | 1 | 14 | 3 | 仅启用已明确安装的低风险 skill |
| composio-skills | 864 | 0 | 15 | 849 | 默认 reject，automation 需要独立 PRD |
| ECC | 887 | 11 | 876 | 0 | 默认 manual_review，不批量启用 |
| marketing-skills | 45 | 0 | 45 | 0 | manual_review |
| mattpocock-skills | 36 | 0 | 36 | 0 | manual_review |
| superpowers | 14 | 0 | 14 | 0 | manual_review，但可作为流程参考按需读取 |
| trailofbits-skills | 75 | 9 | 65 | 1 | security 类按需 manual_review |

## 状态定义

### accept

可作为本地 instruction skill 使用。必须满足：

- 有清晰 frontmatter `name` 和 `description`。
- 不读取 credential。
- 不创建 root `.mcp.json`。
- 不启用 hook、plugin、CI、headless、scheduled task。
- 不调用真实外部服务。
- 不改变 RunStore、RunStatus、P0-P4 sealed semantics。

### manual_review

需要人工复核后才能进入工作流。命中任一条件即保持 manual_review：

- 需要账号、浏览器、Figma、Sentry、cloud provider、MCP、OAuth、API key。
- 上下文体积大，容易污染主实现会话。
- 来自 vendor demo、marketplace、template、example、SDK sample。
- 安全、扫描、自动修复、PR review、CI、agent loop、custom tool 等可能影响边界。
- 能力有价值，但触发条件不够窄。

### reject

不进入当前 Agent OS v2 主工作流。命中任一条件直接 reject：

- automation skill 需要真实 MCP / third-party connector / hosted service。
- 可能读取、写入、传递 credential、token、cookie、private key。
- 可能创建 root `.mcp.json`、`.env`、CI workflow、hook 或 plugin activation。
- 会自动执行外部操作、无人值守操作、批量调用工具。
- 试图绕过 N0-N7、P3 governance、P4 descriptor boundary。
- 与当前封版语义冲突。

## 当前优先使用顺序

1. `planning-with-files`
2. `superpowers` process skills
3. `karpathy-guidelines`
4. `agent-os-*` workflow skills
5. 领域 skill，按任务明确加载
6. vendor / external / automation skill，先走 `agent-os-vendor-gate`

## 对指定 Skill 的处理

| Skill / Family | 当前状态 | 说明 |
| --- | --- | --- |
| planning-with-files | accept | 用于持久化计划、发现、进度。 |
| superpowers | manual_review but usable as process reference | 作为流程纪律读取，不批量启用其自动化边界。 |
| karpathy-guidelines | accept | 用于小步、外科式实现与可验证成功标准。 |
| openai-docs | manual_review / conditional | 仅用于官方文档查询；不读取 API key。安装器曾提示 critical risk。 |
| define-goal | accept | 用于目标定义和范围收敛。 |
| figma-* | manual_review / conditional | 需要 Figma connector 或 MCP 上下文；当前不启用真实连接。 |
| sentry | manual_review / conditional | 需要 Sentry 项目或认证；当前只作为观测工作流参考。 |
| composio automation | reject by default | 大量外部自动化连接器，不进入当前 Agent OS runtime。 |

## 禁止升级路径

- Vendor skill 不得直接升级为 runtime adapter。
- MCP descriptor 不得直接升级为 live MCP server。
- Hook 示例不得直接升级为 Agent OS governance hook。
- Plugin 示例不得覆盖 AGENTS.md、CLAUDE.md 或 docs canonical sources。
- Security scanner finding 不得直接改变 RunStatus 或写 RunStore audit。

## 下一步

1. 对 `manual_review` skill 按实际业务场景分批复核。
2. 建立小型 allowlist，先覆盖 Agent OS、情报、验证、安全审查、前端设计。
3. 对 `reject` 类保持 reference-only 或删除候选安装路径。
4. 任一外部连接进入实现前，必须另开 PRD 和节点审批。
