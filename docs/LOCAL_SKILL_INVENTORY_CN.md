# 本地 Skill 盘点与工作流分层

生成时间：2026-07-05

## 范围

- Project skills: `.agents/skills`
- User Codex skills: `C:/Users/91306/.codex/skills`
- 本轮只做本地技能治理，不启用 hook、MCP、plugin、API key 或真实外部连接。

## 总览

- Skill 总数：125
- Project skills：94
- User Codex skills：31

### 按可用性

| 可用性 | 数量 |
| --- | --- |
| conditional | 45 |
| low | 14 |
| ready | 66 |

### 按功能分类

| 分类 | 数量 |
| --- | --- |
| Agent OS / planning workflow | 7 |
| Design / frontend / media | 19 |
| Docs / content / documents | 4 |
| Engineering domain / platform | 14 |
| Engineering quality / validation | 29 |
| General utility | 27 |
| Meta skills / automation | 10 |
| Research / business intelligence | 8 |
| Security / observability | 7 |

## 新增 Agent OS 工作流 Skill

| 工作流 | 入口 Skill | 用途 |
| --- | --- | --- |
| Skill governance | agent-os-skill-governance | 盘点、分类、低可用标注、缺失 skill 建议 |
| 产业链情报 | agent-os-intelligence-workflow + market-research + search-first | 品牌、供应链、海关、财报、证据图、冲突验证 |
| 节点执行 | agent-os-node-runner-workflow + planning-with-files | N0-N7 prompt、diff、handoff、validation |
| 实现验收 | agent-os-implementation-validation + tdd-workflow + verification-before-completion | 代码/文档改动、测试、build、verify:intelligence |
| 供应商准入 | agent-os-vendor-gate + skill-installer + skill-creator | 第三方 skill/hook/MCP/plugin 安装前分级 |
| 设计前端 | frontend-design + figma-* conditional + remotion-best-practices | 产品界面、设计稿、视频/动效；外部工具按条件启用 |
| 安全观测 | security-review + security-best-practices + sentry conditional | 静态安全审查、运行观测；不自动写 RunStore |

## 本轮补齐的缺失 Skill

- `openai-docs`：已安装。标注为 `conditional`，仅用于官方 OpenAI 文档查询；不读取 API key；安装器报告过 critical risk，因此需要按治理边界使用。
- `define-goal`：已安装。用于目标定义与范围收敛，标注为规划类辅助技能。

## 低可用 / 条件可用样例

| Skill | Root | 可用性 | 原因 |
| --- | --- | --- | --- |
| api-design | project | conditional | large context footprint; load only when directly needed |
| figma-code-connect | project | conditional | requires external tool, credential, account, connector, MCP, or cloud context; large context footprint; load only when directly needed |
| figma-create-new-file | project | conditional | requires external tool, credential, account, connector, MCP, or cloud context |
| figma-generate-design | project | conditional | requires external tool, credential, account, connector, MCP, or cloud context; large context footprint; load only when directly needed |
| figma-generate-diagram | project | conditional | requires external tool, credential, account, connector, MCP, or cloud context |
| figma-generate-library | project | low | requires external tool, credential, account, connector, MCP, or cloud context; broad automation, demo/example, hook/plugin-like, or governance-risk surface |
| figma-implement-motion | project | conditional | requires external tool, credential, account, connector, MCP, or cloud context |
| figma-swiftui | project | conditional | requires external tool, credential, account, connector, MCP, or cloud context |
| figma-use | project | conditional | requires external tool, credential, account, connector, MCP, or cloud context |
| figma-use-figjam | project | conditional | requires external tool, credential, account, connector, MCP, or cloud context |
| figma-use-motion | project | conditional | requires external tool, credential, account, connector, MCP, or cloud context |
| figma-use-slides | project | conditional | requires external tool, credential, account, connector, MCP, or cloud context |
| frontend-patterns | project | conditional | large context footprint; load only when directly needed |
| -2chat-automation | user-codex | conditional | requires external tool, credential, account, connector, MCP, or cloud context |
| ably-automation | user-codex | conditional | requires external tool, credential, account, connector, MCP, or cloud context |
| abstract-automation | user-codex | conditional | requires external tool, credential, account, connector, MCP, or cloud context |
| abuselpdb-automation | user-codex | conditional | requires external tool, credential, account, connector, MCP, or cloud context |
| abyssale-automation | user-codex | conditional | requires external tool, credential, account, connector, MCP, or cloud context |
| addresszen-automation | user-codex | conditional | requires external tool, credential, account, connector, MCP, or cloud context |
| adobe-automation | user-codex | conditional | requires external tool, credential, account, connector, MCP, or cloud context |
| backend-patterns | project | conditional | large context footprint; load only when directly needed |
| cli-creator | user-codex | low | requires external tool, credential, account, connector, MCP, or cloud context; broad automation, demo/example, hook/plugin-like, or governance-risk surface |
| django-patterns | project | conditional | large context footprint; load only when directly needed |
| postgres-patterns | project | conditional | requires external tool, credential, account, connector, MCP, or cloud context |
| diagnose | user-codex | low | broad automation, demo/example, hook/plugin-like, or governance-risk surface |
| django-tdd | project | conditional | large context footprint; load only when directly needed |
| gh-fix-ci | user-codex | low | requires external tool, credential, account, connector, MCP, or cloud context; broad automation, demo/example, hook/plugin-like, or governance-risk surface |
| golang-testing | project | conditional | large context footprint; load only when directly needed |
| playwright | user-codex | conditional | requires external tool, credential, account, connector, MCP, or cloud context |
| playwright-interactive | user-codex | conditional | requires external tool, credential, account, connector, MCP, or cloud context; large context footprint; load only when directly needed |
| python-testing | project | conditional | large context footprint; load only when directly needed |
| tdd | user-codex | low | requires external tool, credential, account, connector, MCP, or cloud context; broad automation, demo/example, hook/plugin-like, or governance-risk surface |
| test-driven-development | project | conditional | requires external tool, credential, account, connector, MCP, or cloud context |
| triage | user-codex | conditional | requires external tool, credential, account, connector, MCP, or cloud context |
| autonomous-loops | project | low | broad automation, demo/example, hook/plugin-like, or governance-risk surface; large context footprint; load only when directly needed |
| coding-standards | project | conditional | large context footprint; load only when directly needed |
| cpp-coding-standards | project | conditional | large context footprint; load only when directly needed |
| django-verification | project | conditional | large context footprint; load only when directly needed |
| golang-patterns | project | conditional | large context footprint; load only when directly needed |
| python-patterns | project | conditional | large context footprint; load only when directly needed |
| subagent-driven-development | project | conditional | requires external tool, credential, account, connector, MCP, or cloud context |
| verification-loop | project | low | broad automation, demo/example, hook/plugin-like, or governance-risk surface |
| byted-ark-seedance-skill | user-codex | conditional | large context footprint; load only when directly needed |
| configure-ecc | project | low | broad automation, demo/example, hook/plugin-like, or governance-risk surface |
| continuous-learning | project | low | broad automation, demo/example, hook/plugin-like, or governance-risk surface |
| continuous-learning-v2 | project | low | broad automation, demo/example, hook/plugin-like, or governance-risk surface |
| oneskill | project | low | broad automation, demo/example, hook/plugin-like, or governance-risk surface |
| project-guidelines-example | project | low | broad automation, demo/example, hook/plugin-like, or governance-risk surface |
| writing-skills | project | conditional | large context footprint; load only when directly needed |
| notion-research-documentation | user-codex | conditional | requires external tool, credential, account, connector, MCP, or cloud context |
| openai-docs | project | conditional | requires external tool, credential, account, connector, MCP, or cloud context; installer reported critical risk; use only for official docs lookup and do not read credentials |
| openai-docs | user-codex | conditional | requires external tool, credential, account, connector, MCP, or cloud context; installer reported critical risk; use only for official docs lookup and do not read credentials |
| openai-docs | user-codex | conditional | requires external tool, credential, account, connector, MCP, or cloud context; installer reported critical risk; use only for official docs lookup and do not read credentials |
| plugin-creator | user-codex | low | requires external tool, credential, account, connector, MCP, or cloud context; broad automation, demo/example, hook/plugin-like, or governance-risk surface |
| -21risk-automation | user-codex | conditional | requires external tool, credential, account, connector, MCP, or cloud context |
| django-security | project | conditional | large context footprint; load only when directly needed |
| security-review | project | conditional | large context footprint; load only when directly needed |
| security-scan | project | low | requires external tool, credential, account, connector, MCP, or cloud context; broad automation, demo/example, hook/plugin-like, or governance-risk surface |
| sentry | project | conditional | requires external tool, credential, account, connector, MCP, or cloud context; observability workflow may require Sentry auth or project configuration |

## 使用建议

1. 默认优先使用新增的 `agent-os-*` 工作流 skill 作为调度入口。
2. 外部平台类 skill 先按 `conditional` 处理，只有任务明确需要且凭据治理阶段允许时才启用。
3. 自动循环、hook、plugin、MCP、headless、scheduled 类能力默认不进入当前运行时。
4. 大体量 skill 只在明确命中任务时加载，避免污染上下文窗口。
5. 第三方仓库里的 hook、MCP 配置、plugin 示例保留在 `.agents/vendor-reference`，不得直接升级为 runtime。

## 边界确认

- 未创建根目录 `.mcp.json`。
- 未创建或读取 `.env` / token / credential 文件。
- 未启用真实 MCP、hook、plugin、CI、channels 或 headless 自动化。
- 本文件是 skill governance 盘点，不改变 Agent OS P0-P4 已封版语义。
