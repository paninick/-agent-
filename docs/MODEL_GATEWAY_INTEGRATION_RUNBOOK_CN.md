# Model Gateway 集成运行手册

更新日期：2026-07-05

## 1. P6 是什么

P6 把 ModelGateway 接入了 Launch Desk 的执行链路。在此之前，ModelGateway 虽然已实现（P4.2 时期），但只被测试调用，agent 运行路径仍走 SDK 内置的 OpenAI 客户端。

P6 的核心改动：
- 给 `ModelGateway` 接口增加了流式方法 `callModelStream`
- 写了一个 SDK 自定义 `Model` 适配器 `ModelGatewayModel`，包住流式 gateway
- 把技能内容 per-request 注入 agent instructions
- 放宽服务器预检：不再强制 `OPENAI_API_KEY`

## 2. 架构位置

```
src/server/index.ts
  ↓ streamLaunchPlan(req.body)
src/agent/streamLaunchPlan.ts
  ├─ createModelGateway()           ← 模块级 lazy 单例
  ├─ new ModelGatewayModel(gateway, modelId)  ← SDK Model 适配器
  ├─ createLaunchDeskAgent({ model, skillContent })
  │     └─ src/agent/launchAgent.ts   ← 参数化 instructions + model
  └─ run(agent, prompt, { stream: true })
        └─ SDK 调 model.getStreamedResponse()
              └─ ModelGatewayModel.getStreamedResponse()
                    └─ gateway.callModelStream()
                          └─ ModelGatewayImpl.callProviderStream()
                                └─ fetch(stream: true) → SSE 解析
```

## 3. 流式协议

`callModelStream` 返回 `AsyncGenerator<ModelStreamChunk>`，chunk 类型：

| type | 字段 | 说明 |
|------|------|------|
| `text_delta` | `delta: string` | 一个文本片段（token 或多 token） |
| `done` | `usage, modelId, provider` | 流结束，携带 token 用量和实际使用的模型 |
| `tool_call` | `toolCallId, name, arguments` | 模型请求工具调用（内嵌在 delta 中的 tool_calls） |

错误处理：流式过程中的错误抛 `ModelStreamError`（`{ error, message, attemptedModels }`），与 `callModel` 失败语义一致。

SSE 解析：`callProviderStream` 用 `response.body.getReader()` 读取字节流，按 `\n` 分行，匹配 `data: {...}` 前缀，解析 `choices[0].delta.content` 为 `text_delta`，末尾从 `usage` 字段（部分 provider 在最后 chunk 给）组装 `done`。

## 4. 自定义 Model 适配器

`ModelGatewayModel implements Model`（SDK 的 `Model` 接口）：

| 方法 | 调用路径 | 说明 |
|------|----------|------|
| `getResponse(request)` | `gateway.callModel` | 一次性调用，返回完整 `ModelResponse` |
| `getStreamedResponse(request)` | `gateway.callModelStream` | 流式调用，yield `output_text_delta` + `response_done` |
| `getRetryAdvice()` | — | 返回 `undefined`（省略，SDK 用默认重试） |

输入映射（`ModelRequest` → `ModelCallRequest`）：
- `request.input`（string 或 `AgentInputItem[]`）→ `ChatMessage[]`
  - string → `{ role: "user", content }`
  - user message → `{ role: "user", content: extractText(content) }`
  - assistant message → `{ role: "assistant", content }`
  - function_call → `{ role: "assistant", content: "[tool_call name=...]\n..." }`
  - function_call_result → `{ role: "user", content: "[tool_result callId=...]\n..." }`
- `request.systemInstructions` → `{ role: "system", content }`
- `request.modelSettings.maxTokens` / `temperature` → 透传

输出映射（`ModelCallResponse` / 流式 assembled → `ModelResponse`）：
- 文本内容 → `AssistantMessageItem`（`{ type: "message", role: "assistant", content: [{ type: "output_text", text }] }`）
- 内嵌的 `tool_calls` JSON → `FunctionCallItem`（`{ type: "function_call", callId, name, arguments }`）
- 工具调用循环由 SDK 管理，适配器只返回请求

## 5. 技能注入

`src/agent/skillInjector.ts` — `loadSkillsForAgent`：

```
SkillRegistry.list()
  → classifyAll (always / sometimes / rarely)
  → computeAllocation (扣保留，算可用预算)
  → 按优先级排序（always 优先）
  → 逐个 loadSkill:
      always_needed → 强制加载（不管预算）
      sometimes_needed → 预算够才加载
      rarely_needed → 跳过
      加载失败(not_found/parse_error) → 跳过，不阻塞
  → 拼接 skillContent: "## Loaded Skills\n\n### Skill: ...\n\n---\n\n..."
  → 返回 { skillContent, report }
```

`createLaunchDeskAgent({ skillContent })` 把 skillContent prepend 到 BASE_INSTRUCTIONS 前。

## 6. 预检规则

服务器 `/api/launch-plan` 预检（旧 vs 新）：

| 条件 | 旧行为 | 新行为 |
|------|--------|--------|
| `OPENAI_API_KEY` 存在 | ✅ 通过 | ✅ 通过 |
| 无 `OPENAI_API_KEY`，有 provider key | ❌ 拒绝 | ✅ 通过 |
| 都没有 | ❌ 拒绝 | ❌ 拒绝 |

Health endpoint `/api/health` 新增字段：
- `hasProviderKey: boolean` — 是否有至少一个 ModelGateway provider key
- `availableModels: string[]` — 当前配置可用的所有 modelId 列表
- `model: string` — 第一个可用模型（或 `DEFAULT_MODEL` 回退）

## 7. 使用示例

### 设置模型

```bash
# .env.local — 选一个 provider
DEEPSEEK_API_KEY=sk-...        # → LAUNCH_DESK_MODEL=deepseek-v4-flash
# 或
ARK_API_KEY=...                # → LAUNCH_DESK_MODEL=doubao-seed-2.0-pro
# 或
OPENROUTER_API_KEY=sk-or-...   # → LAUNCH_DESK_MODEL=claude-sonnet-4.6
# 或
LONGCAT_API_KEY=...            # → LAUNCH_DESK_MODEL=longcat-v1
```

### 无 provider key 时回退

如果没有任何 provider key，agent 自动回退到 `DEFAULT_MODEL` 字符串路径，由 SDK 的默认 OpenAI provider 处理（此时仍需 `OPENAI_API_KEY`）。

### 流式输出

客户端 SSE 事件不变：`run_started`（带 `model` 字段，现在是实际使用的 modelId）→ `text_delta`（逐 token）→ `tool_progress` → `run_completed`。

## 8. 边界规则

1. `src/integration/` 新增 `callModelStream` 是**加法**——既有 `callModel` 接口和实现不变。
2. `src/agent/modelGatewayAdapter.ts` import `@openai/agents`（SDK）和 `../integration`——不直接 `fetch`，通过 gateway 委托。
3. `src/agent/skillInjector.ts` 只 import `../skills`——不 import sealed layers。
4. `src/skills/` 零修改——只被 agent 消费（单向依赖）。
5. SDK 的工具调用循环、tracing、`maxTurns` 全部保留——适配器只替换模型调用层。
6. `DEFAULT_MODEL` 保留导出——向后兼容（字符串路径仍工作）。
7. `FakeModelGateway.callModelStream` 不调 `fetch`——边界测试通过。
8. 所有已密封层（P0-P5、GOV）保持不变。
