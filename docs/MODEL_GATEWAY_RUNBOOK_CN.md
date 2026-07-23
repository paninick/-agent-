# Model Gateway 运行手册

更新日期：2026-07-05

## 1. ModelGateway 是什么

ModelGateway 是 Agent OS v2 集成层的模型路由网关。它接收 `ModelRouter`（P2）的输出（`selectedModelId` + `fallbackModelIds`），执行真实的模型 API 调用，并在 primary 失败时自动切换到 fallback 模型。

与 `src/models/StaticModelRouter` 的区别：
- `StaticModelRouter` 是**静态决策层**——只返回模型 id，不调用 API。
- `ModelGateway` 是**执行层**——调用真实 API，执行 primary→fallback 自动切换。

`src/models/` 保持密封，不做任何修改。ModelGateway 位于 `src/integration/`，是唯一允许读取 API key 和发起网络请求的模块。

## 2. 架构位置

```
src/models/ (SEALED P2)
  ↓ selectModel() → { selectedModelId, fallbackModelIds }
src/integration/ (NEW)
  ├─ ModelGateway.callModel(request)
  │    ├─ resolveProvider(modelId)
  │    ├─ resolveApiKey(provider) ← process.env
  │    ├─ callProvider(provider, modelId, request) ← fetch HTTP
  │    └─ primary 失败 → 自动切 fallback
  └─ FakeModelGateway (测试用，不调真实 API)
```

## 3. 供应商配置

| 供应商 | Provider ID | API 端点 | 环境变量 | 映射模型 |
|---|---|---|---|---|
| DeepSeek | `deepseek` | `https://api.deepseek.com/v1/chat/completions` | `DEEPSEEK_API_KEY` | deepseek-v4-flash → deepseek-chat, deepseek-v4-pro → deepseek-reasoner |
| 火山引擎 | `volcengine` | `https://ark.cn-beijing.volces.com/api/v3/chat/completions` | `ARK_API_KEY` | doubao-seed-2.0-pro → doubao-seed-2-0-pro-241215, ark-code-latest → ark-code-20250423 |
| OpenRouter | `openrouter` | `https://openrouter.ai/api/v1/chat/completions` | `OPENROUTER_API_KEY` | claude-sonnet-4.6 → anthropic/claude-sonnet-4.6, gpt-5.4 → openai/gpt-5.4 |
| longcat | `longcat` | `https://api.longcat.chat/v1/chat/completions` | `LONGCAT_API_KEY` | longcat-v1, longcat-flash |

所有供应商使用 OpenAI-compatible chat completions API 格式。火山引擎需要额外 header `X-Source: openai-agents`。

## 4. 自动切换规则

```
callModel(request)
  candidates = [request.modelId, ...request.fallbackModelIds]
  for each candidate:
    1. resolveProvider(candidate) → 查找供应商
    2. resolveApiKey(provider) → 读 process.env
    3. if no provider or no key → 尝试下一个 fallback
    4. callProvider(provider, model, request)
    5. if success → 返回成功 (fallbackUsed = candidate !== primary)
    6. if rate_limited / server_error / network_error → 尝试下一个 fallback
    7. if auth_failed → 尝试下一个 fallback
    8. if invalid_response → 尝试下一个 fallback
  all failed → { ok: false, error: "all_providers_failed" }
```

可重试错误类型：`rate_limited`、`server_error`、`network_error`、`timeout`。这些错误在 `maxRetries` 范围内会自动重试同一供应商，超过后切 fallback。

## 5. 错误分类

| 错误类型 | 触发条件 | 行为 |
|---|---|---|
| `no_provider` | modelId 不在任何供应商的 modelMapping 中 | 直接失败 |
| `auth_failed` | API key 缺失或 HTTP 401/403 | 切 fallback |
| `rate_limited` | HTTP 429 | 重试后切 fallback |
| `timeout` | 请求超过 timeoutMs | 重试后切 fallback |
| `server_error` | HTTP 5xx | 重试后切 fallback |
| `network_error` | fetch 抛出异常（非 timeout） | 重试后切 fallback |
| `invalid_response` | 响应体无法解析 | 切 fallback |
| `all_providers_failed` | primary 和所有 fallback 都失败 | 最终失败 |

## 6. API Key 安全

- API key 只通过 `process.env` 读取，不硬编码。
- key 不出现在日志、错误消息、返回值中。
- `resolveApiKey()` 是唯一读取 `process.env` 的函数。
- `src/models/` 不读取 key，不调用 API。
- `.env` 在 `.gitignore` 中，不提交到版本控制。
- `.env.example` 只包含空占位符。

## 7. 使用示例

### 与 ModelRouter 配合使用

```ts
import { StaticModelRouter } from "../models";
import { createModelGateway } from "../integration";

const router = new StaticModelRouter();
const gateway = createModelGateway();

const selection = router.selectModel({
  taskType: "code_task",
  requiredCapabilities: ["coding"],
  complexity: "complex",
  costPreference: "balanced",
  latencyPreference: "balanced",
  privacyLevel: "internal"
});

if (selection.ok) {
  const result = await gateway.callModel({
    modelId: selection.selectedModelId,
    fallbackModelIds: selection.fallbackModelIds,
    messages: [{ role: "user", content: "Write a function" }],
    maxTokens: 500
  });
}
```

### 使用 FakeModelGateway（测试环境）

```ts
import { FakeModelGateway } from "../integration";

const gateway = new FakeModelGateway({
  responses: {
    "deepseek-v4-flash": { content: "Synthetic response." }
  },
  errorOverrides: [
    { modelId: "deepseek-v4-pro", errorKind: "rate_limited" }
  ]
});
```

## 8. 边界规则

1. `src/integration/` 可以 import `src/models/` 和 `src/runtime/types.ts`。
2. `src/models/` 不修改，不添加 `callModel`。
3. `src/integration/` 是唯一允许 `process.env` 读取 API key 的模块。
4. `FakeModelGateway` 不调用 `fetch`，用于无 API key 的测试环境。
5. `ModelGatewayImpl` 调用真实 `fetch`，需要 API key。
6. API key 不出现在任何返回值或错误消息中。
7. 自动切换在 `fallbackEnabled: true` 时自动执行，可通过 `fallbackEnabled: false` 禁用。
8. `maxRetries` 控制同一供应商的重试次数（仅对可重试错误生效）。
