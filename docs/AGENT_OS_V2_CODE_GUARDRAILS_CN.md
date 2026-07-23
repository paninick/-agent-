# Agent OS v2 代码护栏与反巨石化规则

更新日期：2026-07-05

## 1. 总原则

每一阶段只实现一个最小闭环。每个模块只负责自己的层级。静态层先行，runtime integration 后置。

## 2. 防巨石化标准

- 单文件建议上限：250 行。
- 单文件警戒线：350 行。
- 超过 350 行必须解释原因。
- 超过 500 行禁止合并，除非是测试 fixture 或生成文件。
- 单函数建议上限：50 行。
- 单函数警戒线：80 行。
- 超过 80 行必须拆分。

## 3. 模块职责边界

| 目录 | 职责 | 禁止事项 |
|---|---|---|
| `src/intelligence/` | 情报源、Evidence Graph、source classification、confidence 和 verification 输出。 | 禁止 import runtime / mcp / governance；禁止执行工具；禁止改 RunStatus。 |
| `src/runtime/` | RunStore、DAGExecutor、SwarmOrchestrator、checkpoint、approval resume。 | 禁止直接塞 model selection、tool permission、mcp transport、credential checking、audit persistence。 |
| `src/models/` | 静态模型画像、模型选择、fallback chain、选择解释。 | 禁止调用真实模型 API；禁止读取 API key；禁止 import runtime / governance / mcp / intelligence。 |
| `src/governance/` | Tool Permission、Credential Gating、AgentRiskVector、静态 policy hook payload。 | 禁止执行工具；禁止连接 MCP；禁止写 RunStore；禁止 import runtime / models / mcp / intelligence。 |
| `src/mcp/` | MCP 静态 registry、descriptor、mock result、error classification、声明式 health。 | 禁止真实 transport；禁止读取 key；禁止 import runtime / governance / intelligence。 |
| `docs/` | PRD、Runbook、治理规则、交接协议。 | 禁止把未实现能力写成已实现；禁止与 README / CHANGELOG 矛盾。 |

## 4. import 禁止矩阵

| 来源 | 禁止 import |
|---|---|
| `src/runtime` | `src/governance` / `src/models` / `src/mcp` / `src/intelligence` |
| `src/models` | `src/runtime` / `src/governance` / `src/mcp` / `src/intelligence` |
| `src/governance` | `src/runtime` / `src/models` / `src/mcp` / `src/intelligence` |
| `src/mcp` | `src/runtime` / `src/governance` / `src/intelligence` |
| `src/intelligence` | `src/runtime` / `src/mcp` / `src/governance` |

跨层集成只能在被 PRD 明确允许的 integration 阶段发生，并且必须通过 adapter。

`src/runtime` 当前不得直接 import `src/governance` / `src/models` / `src/mcp` / `src/intelligence`。未来集成只能通过明确 adapter 阶段，例如 P4.2 Runtime Integration / Tool Execution Adapter。

## 5. Runtime 特殊规则

禁止在 `dagExecutor.ts` 里直接塞：

- model selection
- tool permission
- mcp transport
- credential checking
- audit persistence

后续集成必须通过明确 adapter 阶段，不允许把 runtime 变成所有能力的 god file。

## 6. 阶段门控 G0-G6

| Gate | 名称 | 要求 |
|---|---|---|
| G0 | PRD Gate | 范围、禁止事项、验收标准明确。 |
| G1 | Architecture Gate | 架构边界和跨层影响被审查。 |
| G2 | Technical Gate | 类型、接口、错误处理、测试策略明确。 |
| G3 | Implementation Gate | 只改允许文件，实现最小闭环。 |
| G4 | Code Review Gate | 审查 bug、漂移、跨层 import 和遗漏测试。 |
| G5 | Validation Gate | 执行阶段要求的验证命令。 |
| G6 | Release Seal Gate | 文档、测试、实现和 Handoff 一致。 |

## 7. 代码实现红线

- 不创建 god file。
- 不为了测试方便跨层 import。
- 不读取 `.env` / token / cookie / API key。
- 不新增 `SecretManager` / `CredentialStore` / `ToolExecutor`，除非当前阶段明确要求。
- 不在 registry 层计算权限。
- 不在 policy 层执行工具。
- 不在 model router 层调用真实模型。
- 不在 `DAGExecutor` 中堆积 model / mcp / governance 逻辑。

## 8. 反巨石化拆分规则

以 `src/mcp` 为例：

- `types.ts` 只放类型。
- `registry.ts` 只做注册 / 查询 / enabled / 校验调用。
- `descriptors.ts` 只放 seed descriptors。
- `errorClassification.ts` 只做 error kind -> retryable。
- `mockToolCall.ts` 只做合成 `ToolCallResult`。
- `health.ts` 只做静态 health 分类。

## 9. 测试门控标准

测试必须覆盖：

- happy path
- safe failure path
- boundary protection path

boundary protection 特别要求：

- 不得 import runtime。
- 不得 import governance。
- 不得 import intelligence。
- 不得调用真实网络。
- 不得读取 API key。
- 不得自动落库。
- 不得改 `RunStatus`。
- 不得调用 P3 hook。

## 10. 当前 P4.1 专属门控

本节仅预定义 P4.1 边界，不授权当前阶段实现 P4.1。

P4.1 允许：

- `McpTransport` interface
- `FakeMcpTransport`
- `TransportRequest`
- `TransportResponse`
- `TransportError`
- healthProbe mock
- listTools mock
- callTool mock
- timeout synthetic
- rate_limited synthetic
- server_error synthetic

P4.1 禁止：

- 真实 SSE
- 真实 streamable_http
- 真实 stdio subprocess
- 真实 MCP client
- 真实 API key
- 真实 OAuth
- 真实网络请求
- 真实 list_tools
- 真实 call_tool
- P3 hook 调用
- RunStore audit 写入
- DAGExecutor 集成

## 11. 单一真相源规则

| 事项 | 单一真相源 |
|---|---|
| 模型选择 | `src/models/modelRouter.ts` |
| fallback chain | `src/models/modelRouter.ts` |
| 工具权限 | `src/governance/toolPermissionHook.ts` |
| risk score | `src/governance/agentRiskVector.ts` |
| MCP retryable | `src/mcp/errorClassification.ts` |
| Run status transition | `src/runtime/runStore.ts` |
| Source classification | `src/intelligence/adapter-health.ts` |
| Evidence Graph 构建 | `src/intelligence/evidence-graph.ts` |
| 置信度计算 | `src/intelligence/confidence-engine.ts` |
| MCP 服务注册 | `src/mcp/registry.ts` |

## 12. discriminated union 规则

结果类型优先使用 discriminated union。禁止 `ok:boolean + result? + error?` 的模糊结构。

推荐：

```ts
type Result =
  | { ok: true; result: unknown }
  | { ok: false; error: ErrorPayload };
```

## 13. 禁止同义重复字段

如果一个字段能从 `status` 推导，就不要再放一个 boolean。

例如不要同时使用：

```ts
status: "requires_approval";
requiresApproval: true;
```

重复字段会制造多个真相源，后续模型容易只更新其中一个。

## 14. Context Budget Guardrail

Claude Code 等原厂工具会把 adapter 文件、Skill description、MCP tool name 等内容放入上下文。为了避免上下文窗口被治理文本挤满：

- `CLAUDE.md` 建议 ≤ 80 行，只做 adapter 引用。
- `CLAUDE.md` 最高不得超过 200 行；超过 80 行必须说明为什么不能引用外部文档。
- `AGENTS.md` 建议 ≤ 120 行，只放 canonical source、当前 Roadmap、节点格式和硬边界。
- `SKILL.md` 关键规则放前 30 行；长说明放到引用文档，不放进 description。
- 不复制完整 Runbook 到 adapter 文件。
- 不在 MCP descriptor 写真实连接信息。
- 不在 Skill 描述写长篇实现细节。
- 长文档审查应交给 LongCat / 子代理 / 独立审查模型，主实现上下文只保留 Handoff Packet。
- 更新治理规则后，建议新开会话或使用 `/clear`，再重新注入 Handoff Packet。

## 15. Vendor Security and CI Guardrail

Claude Code 的外部安全插件、PR review、CI scanner、Slack 入口、Agent View、background agents 都属于 vendor tooling surface，不是 Agent OS v2 runtime 或 P3 governance。

- 外部安全插件 / PR review / CI scanner 都不是 P3 governance。
- 外部发现不得直接改变 `RunStatus`。
- 外部发现不得直接写 `RunStore` audit。
- 外部发现不得自动封版。
- 当前 GOV 阶段不得新增真实 GitHub Action / GitLab CI / Slack app / MCP server。
- 禁止提交 API key / token / cookie / private key / production MCP URL。
- 并行 agent 必须隔离文件写入，优先使用 worktree / branch。
- 禁止 dangerous permission bypass，包括默认启用 `bypassPermissions` 或 `dangerously-skip-permissions`。
- vendor 输出必须进入 `N2_TECH_REVIEW` 或 `N5_VALIDATION` 复核，不能直接改变封版状态。

## 16. Vendor Runtime Boundary Guardrail

- 不把 Claude workflow 写成 Agent OS runtime 编排器。
- 不把 MCP quickstart 转成真实 `.mcp.json`。
- 不把 hook 结果写入 `RunStore`。
- 不把 Agent SDK custom tools 当作 P4.0 / P4.1 工具实现。
- 不把 channels / scheduled / headless / deep links 当作生产入口。
- 不提交 credentials。
- 不默认启用 `bypassPermissions` / `dangerously-skip-permissions`。
- 并行 agent 必须 worktree / branch 隔离。
- `.worktreeinclude` 不得复制 secrets、`.env`、`.env.local`、token 文件或生产 MCP URL。

## 17. OpenAI API Legacy Guardrail

- 不把旧 Completions endpoint 当当前默认接口。
- 不把 `text-davinci-003` 写入当前 model profiles。
- 不把 Chat Plugins 写成 MCP runtime。
- 不把 old fine-tunes API 写入当前 runtime。
- 不把 OpenAI API key 写入代码、文档、Skill、MCP descriptor。
- 不在当前 GOV / P4.1 阶段创建真实 OpenAI client。
- 所有 OpenAI API 接入必须另开独立阶段 PRD，并以 `developers.openai.com` / `platform.openai.com` 当前官方文档为准。

## 18. OpenAI Vendor Surface Guardrail

- 不把 ChatGPT product feature 写成 Agent OS runtime。
- 不把 Codex Security 写成 P3 governance。
- 不把 Codex Security 自动修补写入代码。
- 不把 OpenAI Help Center 内容直接写成 runtime implementation。
- 不把 legacy mirror 内容写入当前 model router / API adapter。
- 不把 API key 写入 docs / code / Skill / MCP descriptor。
- 当前 GOV / P4.1 阶段禁止真实 OpenAI API client。
- 所有 OpenAI API 接入必须另开独立 PRD。

## 19. ZCode Vendor Surface Guardrail

- 不把 ZCode `/goal` 写成 Agent OS runtime、queue、scheduler、RunStore 或 approval system。
- 不把 ZCode `/goal resume` 映射为 P1 `resumeRun(runId)`。
- 不把 ZCode Goal 自动校验当作 N5 validation 或 N7 release seal。
- 不把 ZCode MCP Services quickstart 转成真实 `.zcode/config.json`、`.agents/mcp.json`、`.mcp.json` 或 P4.1 real transport。
- 不把 ZCode Command 当作 Agent Node Runner；Command 只保存提示词，不能自动放行节点。
- 不把 ZCode Skill 当作 canonical source；Skill 必须引用 docs / Handoff Packet。
- 不让 ZCode Subagent 宣布 `SEALED`、修改 Roadmap 或绕过 N2 / N5 / N7。
- 不把 ZCode Plugin marketplace 当作项目依赖来源；当前 GOV 阶段不得安装或启用真实 plugin 来改变项目能力面。
- 不提交 ZCode MCP Authorization header、API token、cookie、private key、生产 MCP URL 或本地敏感配置。
- ZCode vendor 输出必须进入 Handoff Packet，并经过当前节点要求的 review / validation。
