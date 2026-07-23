# Agent OS v2 原厂工具适配标准

更新日期：2026-07-05

## 1. 目的

原厂工具可以参考，但不能成为 Agent OS v2 的真相源。Codex、Claude Code、ZCode、Skill、MCP、Hooks、Settings 都是适配层，不能覆盖项目 Roadmap、release gates、模块边界和运行时语义。

## 2. 文件优先级

| Level | 类型 | 文件 |
|---|---|---|
| Level 0 | 项目真相源 | `README.md`、`CHANGELOG.md`、`docs/*_RUNBOOK_CN.md`、`docs/AGENT_OS_V2_PRD_TODO_CN.md` |
| Level 1 | 项目治理协议 | `docs/AGENT_OS_V2_MODEL_ROLE_ROUTING_CN.md`、`docs/AGENT_OS_V2_MULTI_MODEL_CONSISTENCY_CN.md`、`docs/AGENT_OS_V2_CODE_GUARDRAILS_CN.md`、`docs/AGENT_OS_V2_VENDOR_TOOLING_STANDARD_CN.md` |
| Level 2 | 原厂工具适配文件 | `AGENTS.md`、`CLAUDE.md`、`.claude/`、ZCode 配置、Skill 配置、MCP 配置 |
| Level 3 | 可复用能力包 | `skills/`、`prompts/`、`templates/`、`checklists/` |
| Level 4 | 真实外部工具 | MCP servers、API connectors、shell/browser/file tools |

低优先级文件不得覆盖高优先级文件。

## 3. AGENTS.md 标准

`AGENTS.md` 是 Codex / ZCode / Kimi Code / Doubao Code 等 coding agent 主入口。它只能引用项目真相源，不得重新定义 Roadmap，不得创造新 release gate，不得重写模块边界。

模型角色路由以 `docs/AGENT_OS_V2_MODEL_ROLE_ROUTING_CN.md` 为准。Kimi 当前不是必经节点；如出现，只能作为 optional reviewer，不得成为放行节点。

## 4. CLAUDE.md 标准

`CLAUDE.md` 是 Claude Code adapter。它不是项目真相源。

不得用 Claude-specific hooks / skills / MCP configuration 覆盖 Agent OS v2 Roadmap、release gates、module boundaries。

## 4.1 Claude Code Vendor Adapter Standard

Claude Code 官方文档说明：`CLAUDE.md`、auto memory、MCP tool names、Skill descriptions 等会进入会话上下文；长会话可通过 `/compact` 压缩，复杂读取可交给 subagent 独立上下文处理。因此 Agent OS v2 对 Claude Code 适配文件设定以下标准：

- `CLAUDE.md` 会自动进入上下文，因此只能做 adapter，不得复制 Roadmap、Runbook 或长篇规则。
- `AGENTS.md` / `docs/*` 是 canonical source；`CLAUDE.md` 只引用它们。
- `.claude/rules` 是路径或主题范围规则，只能补充局部上下文，不得重定义项目 Roadmap、release gates 或 module boundaries。
- Skill description 和 MCP tool name 会进入上下文，因此必须短、稳定、可扫描，不能包含真实连接信息。
- skills 是按需加载的可复用工作流；长流程应放在 skill body 或引用文档，不放进 `CLAUDE.md`。
- subagents 是隔离上下文执行者；长文档审查、批量搜索、日志阅读等高上下文任务应交给 LongCat / subagent / 独立审查模型。
- MCP 是外部工具 / 服务连接协议；当前只允许 `MCP_DESCRIPTOR_REF` 与 `MCP_MOCK_TRANSPORT_REF`，不得配置真实 server。
- hooks 是生命周期事件自动化，不等于 Agent OS v2 governance hook；不得把 Claude Code hook 视为 P3 `preToolUseHook` / `postToolUseHook`。
- plugins 是打包层，不是项目真相源；插件提供的 skills、agents、hooks、MCP 仍必须服从本项目治理文档。
- P4.0 / GOV 阶段禁止真实 MCP server 配置，禁止把 URL、token、API key、OAuth 信息写进 MCP 描述或 vendor settings。
- `settings.local.json` 不得入库；本地设置只放个人机器差异，不承载项目真相源。
- 不得提交真实 API key、token、真实生产 MCP server。
- Prompt caching 受模型切换、MCP 连接变化、插件变化、`/compact` 等影响；同一节点内不要频繁切换模型、插件或 MCP 连接面。
- Session SOP：`/compact` 用于同阶段长任务，`/clear` 用于跨阶段，`/context` 用于检查污染，`/resume` 后必须重贴 Handoff Packet。

## 4.2 Claude Code Security / CI / Agents Standard

Claude Code 官方文档提供 security、code review、CI/CD、Slack、agent teams、background agents、hooks、plugins、MCP 等能力。Agent OS v2 允许学习其产品形态，但当前 GOV 阶段只记录治理标准，不启用真实集成。

- Security Guidance plugin 是 vendor security layer，不是 P3 governance hook，不得替代 `src/governance/toolPermissionHook.ts`。
- Code Review 是 PR 级 vendor review，不是 `N7_RELEASE_SEAL`，不得宣布 `SEALED`。
- GitHub Actions / GitLab CI 当前只允许记录标准，不创建真实 workflow，不写 `.github/*` 或 `.gitlab-ci.yml`。
- Slack 是远程交互入口，不是项目真相源，不得通过 Slack 改写 Roadmap、Runbook 或 release gate。
- Agents / Agent View 只能作为开发工具，不是 Agent OS v2 runtime，不得等同于 `RunStore` / `DAGExecutor` / `SwarmOrchestrator`。
- 并行 agent 必须使用 worktree / branch 隔离，避免并发写同一文件。
- 禁止默认启用 `bypassPermissions` / `dangerously-skip-permissions`。
- API key 只能通过 Secrets / masked variables 管理，不得入库，不得写入 vendor settings、Runbook 或 adapter 文件。
- 不得提交真实 API key、token、cookie、private key、生产 MCP server URL。
- 不得通过 vendor 工具绕过 `N0`-`N7` 节点；vendor 输出必须转成 Handoff Packet 后进入项目流程。

## 4.3 Claude Code Advanced Surfaces Standard

Claude Code 官方文档覆盖 workflows、worktrees、MCP quickstart / reference、skills、plugins / plugin marketplaces / plugin hints、hooks、channels、scheduled tasks、goal mode、headless mode、deep links、large codebases、troubleshooting、monitoring / costs、settings，以及 Agent SDK 的 agent loop、session storage、streaming、user input、custom tools、MCP、tool search、system prompts、skills、slash commands。Agent OS v2 当前只把这些能力作为 vendor surface 记录，不实现真实集成。

### Workflows / Ultracode

- workflow 是 vendor-side orchestration，不是 Agent OS v2 runtime。
- workflow 输出只能作为 `N1_LONG_CONTEXT_ARCH_REVIEW` / `N2_TECH_REVIEW` / `N4_FILE_STRUCTURE_REVIEW` 输入。
- workflow 不得直接封版，不得输出 `SEALED`。
- 不默认启用 ultracode。
- 不允许 workflow 绕过 `N0`-`N7`。

### Worktrees

- 并行 agent 必须使用 worktree / branch 隔离。
- 不得多个 agent 同时修改同一文件。
- `.worktreeinclude` 不得复制 `.env` / `.env.local` / `secrets.json` / token 文件。
- 只允许复制 `.env.example` / mock fixture / 非敏感模板。

### MCP

- 当前只允许 `MCP_DESCRIPTOR_REF`。
- P4.1 以后才允许 `MCP_MOCK_TRANSPORT_REF`。
- 当前禁止 `MCP_RUNTIME_ADAPTER_REF` / `MCP_REAL_SERVER_REF`。
- 禁止真实 `.mcp.json`、真实 server、dynamic discovery、live health ping、runtime call。

### Skills

- Skill 是节点流程包，不是项目真相源。
- `SKILL.md` 前 30 行必须包含 purpose / allowed files / forbidden files / status format / blocking rules / handoff packet。
- Skill 不得包含真实 API key / MCP URL / 完整 Roadmap / 完整 Runbook。

### Plugins / Marketplaces

- plugin 是 vendor package layer，不是项目真相源。
- 当前不安装、不启用真实 plugin marketplace。
- 插件不得覆盖 `AGENTS.md` / `CLAUDE.md` / docs canonical sources。

### Hooks

- vendor hook 不等于 P3 governance hook。
- hook 不得直接改变 `RunStatus`。
- hook 不得写 `RunStore` audit。
- hook 不得自动批准 `requires_approval`。
- hook findings 只能作为 `N4_FILE_STRUCTURE_REVIEW` / `N5_VALIDATION` 输入。

### Channels / Scheduled / Goal / Headless / Deep Links

- channels、scheduled tasks、goal mode、headless mode、deep links 都属于外部入口或无人值守入口。
- 当前 GOV 阶段禁止接入。
- 不得绕过 `N0`-`N7`。
- 不得触发真实写库、merge、deploy。

### Agent SDK

- Agent SDK 的 agent loop / session storage / streaming / user input / custom tools / MCP / tool search / system prompts / skills / slash commands 只作为未来 SDK adapter 参考。
- 当前禁止接 Agent SDK runtime。
- 当前禁止 custom tools / tool search / SDK MCP adapter。

### Settings / Credentials

- `settings.local.json` 不得入库。
- 不提交真实 token / API key / cookie / private key / production MCP URL。
- project settings 只允许非敏感共享规则。
- local settings 只允许个人机器差异。

### Monitoring / Costs / Errors / Troubleshooting

- 当前只写操作治理。
- 不接真实 OpenTelemetry。
- 不接真实 cost monitor。
- 不新增 CI/CD scanner。
- troubleshooting 文档只作为人工排障参考。

## 4.4 OpenAI Legacy Docs Standard

`openai.xiniushu.com` 当前作为旧版 OpenAI API 中文镜像参考，内容包含 Completions endpoint、`text-davinci-003`、Chat Plugins Alpha / Beta、旧 Fine-tunes API 等历史材料。它不是 Agent OS v2 当前 OpenAI API canonical source，不得覆盖 `developers.openai.com` / `platform.openai.com` 当前官方标准。

### openai.xiniushu.com 定位

- 作为旧版 OpenAI API 中文镜像参考。
- 不是 Agent OS v2 当前 OpenAI API canonical source。
- 不得覆盖 `developers.openai.com` / `platform.openai.com` 当前标准。

### Legacy API boundary

- `text-davinci-003` / Completions / old Fine-tunes / Chat Plugins 均为 legacy reference。
- 不得直接写入当前模型路由标准。
- 不得作为 P4.1 / P4.2 实现依据。

### API key discipline

- API key 只能服务端使用。
- 不得放入前端代码。
- 不得提交 `.env`。
- 不得写入 `AGENTS.md` / `CLAUDE.md` / Skill / MCP descriptor。
- 只允许 `.env.example` 占位符。

### Chat Plugins vs MCP

- Chat Plugins manifest / OpenAPI spec 可作为 P4.0 descriptor 历史参考。
- 不等于 MCP runtime。
- 不等于当前 Apps SDK。
- 不得接真实 plugin server。
- 不得创建真实 OAuth flow。

### Authentication mapping

- `none` / `service_http` / `user_http` / `oauth` 可作为 `authRequirement` 历史参考。
- P4.0 只允许静态 `authRequirement` 声明。
- P4.1 不允许真实 credential。
- P4.2+ 才讨论 runtime adapter。

### Production / safety / rate limit

旧文档中的 production、safety、rate limit 内容只吸收为治理规则：

- retryable classification
- rate limit backoff
- moderation / safety as review signal
- production checklist as future P6 input

当前不实现真实 API 调用。

## 4.5 OpenAI Official Help / Legacy Mirror Standard

OpenAI Help Center、OpenAI Platform / Developers docs、Codex Security、prompt engineering 文档、第三方镜像文档属于不同 source type。Agent OS v2 必须先判定来源层级，再决定是否能进入实现。

### Source hierarchy

- OpenAI Help Center 可作为当前产品帮助参考。
- OpenAI Platform / Developers docs 才能作为当前 API / SDK / runtime 实现依据。
- `openai.xiniushu.com` 是旧版中文镜像，只能作为 legacy mirror / historical reference。
- 第三方镜像不得覆盖官方当前文档。

### ChatGPT product surfaces

ChatGPT Help Center 中的 ChatGPT、Connected Apps、GPTs、Memory、Search、File Uploads、Data Controls、Apps with Sync 等只能作为 vendor product surface 参考。

规则：

- 不得把 ChatGPT 产品能力直接写成 Agent OS v2 runtime 能力。
- 不得把 ChatGPT connected apps 直接写成 P4.0 / P4.1 MCP runtime。
- 不得绕过 P3 governance / P4.0 descriptor / P4.1 fake transport / P4.2 runtime adapter。

### Codex Security

Codex Security 是 vendor security review layer，不是 Agent OS v2 P3 governance。

规则：

- findings 可作为 N4 / N5 输入。
- 不得自动修改代码。
- 不得自动改变 `RunStatus`。
- 不得自动写 `RunStore` audit。
- 不得替代 lint / typecheck / test / build / verify:intelligence。
- 不得替代 `N7_RELEASE_SEAL`。
- 未来如连接 GitHub repo，必须另开 CI / Security Governance PRD。

### Prompt Engineering

OpenAI prompt engineering best practices 可吸收为多模型提示词标准：

- prompt 必须清晰具体。
- 必须提供足够上下文。
- 必须给输出格式。
- 必须允许迭代 refinement。
- 必须指定 tone / style 时才调整语言风格。
- 多模型任务必须写明 `CURRENT_PHASE` / `SEALED_PHASES` / `CURRENT_NODE` / `MODEL_ROLE` / `FILES_ALLOWED` / `FILES_FORBIDDEN` / `VALIDATION_COMMANDS` / `HANDOFF_PACKET`。

### Legacy mirror rule

`openai.xiniushu.com` 中的旧 Completions、`text-davinci-003`、`gpt-3.5-turbo` ChatCompletion 示例、Chat Plugins、旧 Fine-tunes API 只能作为历史参考。

必须标记：

```text
SOURCE_TYPE: legacy_mirror
FRESHNESS_RISK: high
CURRENT_OFFICIAL_CHECK_REQUIRED: true
```

禁止：

- 不把旧 Completions endpoint 当当前默认接口。
- 不把 `text-davinci-003` 写入当前 model profiles。
- 不把 Chat Plugins 写成 MCP runtime。
- 不把 old fine-tunes API 写入当前 runtime。
- 不基于 legacy mirror 创建真实 OpenAI client。

## 4.6 ZCode Official Docs Standard

ZCode 官方文档中的 Goal、MCP Services、Command、Skill、Subagents、Plugin 都属于 vendor-side development surface。Agent OS v2 可以吸收其操作治理经验，但不得把它们直接升级为 Agent OS runtime、P4.1 transport、P1 RunStore、P3 governance hook 或 N7 release seal。

### Source hierarchy

- `zcode.z.ai/cn/docs/*` 是 ZCode vendor product docs。
- ZCode docs 可作为 ZCode adapter / operator SOP 参考。
- ZCode docs 不得覆盖 Agent OS v2 Roadmap、sealed phase semantics、module boundaries、N0-N7 release gates。
- 引用 ZCode docs 时，Handoff Packet 应标记 `SOURCE_TYPE: vendor_official_docs`，并说明是否只是治理参考。

### Goal mode

- ZCode `/goal` 是会话级长任务目标模式，用于让 ZCode Agent 围绕目标持续迭代。
- `/goal resume` 不等于 P1 `resumeRun(runId)`。
- Goal 自动校验不等于 N5 validation，也不等于 N7 release seal。
- Goal 输出必须转成 Handoff Packet 后才允许进入下一节点。
- Goal 不得绕过 `N0`-`N7`，不得自动宣布 `SEALED`。

### MCP Services

- ZCode MCP Services 支持 stdio、HTTP、SSE 以及从外部 Agent 配置导入。
- 当前 GOV / P4.1 前置阶段不得创建真实 `.zcode/config.json`、`.agents/mcp.json` 或真实 `.mcp.json` 连接。
- ZCode MCP 配置路径和导入机制只能作为 vendor configuration reference。
- ZCode MCP Services 不等于 Agent OS v2 P4.1 `FakeMcpTransport`，也不等于 P4.2 runtime adapter。
- 不得把真实 Authorization header、API token、生产 MCP URL 写入项目文档、Skill、Command、Plugin 或 descriptor。

### Command

- ZCode Command 是快捷提示词 / 流程入口，可用于沉淀 N0-N7 节点提示词。
- Command 不等于 Agent Node Runner，不得自动放行节点。
- Command 输出必须包含标准状态词和 Handoff Packet。
- Command 不得保存真实 credential、生产 URL、完整 Roadmap 或完整 Runbook。

### Skill

- ZCode Skill 是 `SKILL.md` 工作流说明，可复用固定流程。
- Skill 不是项目真相源，不得覆盖 `AGENTS.md` / `CLAUDE.md` / `docs/*`。
- ZCode Skill 可用于包装节点操作，但必须声明 purpose、allowed files、forbidden files、status format、blocking rules、handoff packet。
- Skill 不得跨阶段授权，不得包含真实 API key、MCP URL 或完整 Roadmap。

### Subagents

- ZCode subagents 是 vendor-side 独立上下文执行者。
- `Explore` 类只读子智能体适合 N1 / N4 前的只读调研。
- 可写子智能体必须绑定明确节点，并声明 `FILES_ALLOWED` / `FILES_FORBIDDEN`。
- 子智能体不得宣布 `SEALED`，不得修改 Roadmap，不能绕过 N2 / N5 / N7。
- 并行子智能体不得编辑同一文件；需要写文件时优先使用 worktree / branch 隔离。

### Plugin

- ZCode Plugin 可打包 Skill、Command、Subagent、MCP server、Hook、LSP 等能力，是 vendor package layer。
- Plugin 不是项目真相源，不能覆盖 canonical docs。
- 当前 GOV 阶段不安装、不启用真实 marketplace plugin，不新增真实 MCP server。
- Plugin MCP server 仍属于 vendor MCP surface，不得绕过 Agent OS v2 P4.0 descriptor / P4.1 fake transport / P4.2 runtime adapter。
- Plugin 配置中的敏感项不得入库；真实 credential 只能由未来明确阶段处理。

## 4.7 Planning-with-Files Reference Standard

`OthmanAdi/planning-with-files` 是第三方开源 file-based planning skill。它的核心思想是把 `task_plan.md`、`findings.md`、`progress.md` 等计划文件落盘，让长任务在上下文丢失、`/clear`、崩溃或多 agent 切换后仍能恢复。Agent OS v2 可以吸收这种持久化计划模式，但不得直接安装、启用或继承其 hooks / completion gate / plugin 行为，除非另开独立 PRD。

### Source classification

- Source type: `third_party_open_source`。
- Freshness risk: `medium`，使用前必须记录访问日期和版本 / commit。
- 只能作为 planning pattern reference，不是 Agent OS v2 canonical source。
- 不得覆盖 `README.md`、`CHANGELOG.md`、`docs/*`、`.agent-os/node-runner.config.json` 或 N0-N7 节点规则。

### Allowed pattern import

允许吸收的模式：

- 文件化计划：`task_plan.md`。
- 文件化发现：`findings.md`。
- 文件化进度：`progress.md`。
- 上下文恢复提示：在 Handoff Packet 中引用 run directory。
- 多代理共享状态：所有节点读取同一 run 目录下的计划文件。

当前不允许直接引入：

- 外部 `SKILL.md` 安装。
- 外部 hooks。
- 外部 completion gate / stop gate。
- 外部 plugin。
- 外部脚本作为项目依赖。
- 自动阻塞 agent stop / auto-continue 的行为。

### Agent OS mapping

- Agent OS v2 的持久状态主目录仍是 `.agent-os/runs/<run>/`。
- `task_plan.md` 可作为 Node Runner 的人工计划文件，不等于 P1 `Run.taskPlan`。
- `progress.md` 可作为节点进度记录，不等于 P1 `Run.status`。
- `findings.md` 可作为审查发现记录，不等于 N5 validation 结果。
- 文件化计划不得绕过 `check-output`、`check-diff`、`run-validation` 或 `N7_RELEASE_SEAL`。

## 5. ZCode 暂定标准

ZCode 暂时作为可选代码执行工具和 vendor-side workflow surface。它不是项目规则来源，不得重定义 `AGENTS.md` / Roadmap / Runbook / MCP 规则 / Skill 规则。ZCode 官方文档的 Goal / MCP / Command / Skill / Subagent / Plugin 能力必须遵守第 4.6 节边界。

## 6. Skill 标准

Skill 是可复用流程包，不是项目真相源。

建议目录：

```text
skills/prd-lock/SKILL.md
skills/architecture-review/SKILL.md
skills/tech-review/SKILL.md
skills/implementation/SKILL.md
skills/code-review/SKILL.md
skills/validation/SKILL.md
skills/doc-sync/SKILL.md
skills/release-seal/SKILL.md
```

每个 Skill 必须包含：

- name
- purpose
- allowed stage
- allowed files
- forbidden files
- inputs
- outputs
- status format
- handoff packet
- blocking rules

Skill 不得跨阶段授权，也不得把未来阶段能力带入当前阶段。

## 7. MCP 引用标准

MCP 引用分层：

- `MCP_DESCRIPTOR_REF`
- `MCP_MOCK_TRANSPORT_REF`
- `MCP_RUNTIME_ADAPTER_REF`
- `MCP_REAL_SERVER_REF`

当前允许：

- `MCP_DESCRIPTOR_REF`
- `MCP_MOCK_TRANSPORT_REF`

当前禁止：

- `MCP_RUNTIME_ADAPTER_REF`
- `MCP_REAL_SERVER_REF`

## 8. Hooks 标准

必须区分：

- vendor hook
- project policy hook
- runtime adapter hook

禁止把 Claude/Codex hook 直接等同于 Agent OS v2 governance hook。P3 `preToolUseHook` / `postToolUseHook` 是项目 policy hook，不是 vendor hook，也不是 runtime adapter hook。

## 9. Settings / Config 标准

禁止把 API key、真实 token、生产 MCP server 写进项目共享配置。

- local settings 只放个人机器差异。
- project settings 只放团队共享的非敏感规则。
- 任何真实 secret 都不得进入 README、Runbook、AGENTS、CLAUDE、Skill 或 MCP 配置样例。

## 10. 禁止事项

- vendor 文件不得重新定义 Roadmap。
- vendor 文件不得放 API key。
- vendor MCP 配置不得提前接真实 server。
- Skill 不得跨阶段授权。
- Hook 不得绕过 governance。
- `AGENTS.md` / `CLAUDE.md` 不得互相写两套冲突规则。

## 11. Handoff 标准

vendor tool 输出也必须遵守统一 Handoff Packet：

```text
HANDOFF_PACKET

CURRENT_STAGE:
CURRENT_NODE:
STATUS:
DECISION:
FILES_ALLOWED:
FILES_FORBIDDEN:
TYPES_LOCKED:
RULES_LOCKED:
TESTS_REQUIRED:
BOUNDARY_WARNINGS:
NEXT_MODEL:
NEXT_NODE:
```
