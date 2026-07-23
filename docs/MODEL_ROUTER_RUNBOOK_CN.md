# Model Router v1 运行手册

更新日期：2026-07-05

## 1. ModelRouter 是什么

ModelRouter 是 Agent OS v2 的模型选择与路由决策层。它根据任务类型、能力需求、复杂度、成本偏好、延迟偏好和隐私等级，从静态 `ModelProfile` 列表中选择一个最合适的模型 profile，并输出选择原因、置信度、成本层级和 fallback chain。

本轮只实现路由决策，不接真实模型 API，不读取 API key，不调用 OpenAI / Claude / Gemini / 豆包，不做 UI，不改 DAG / Swarm 主流程语义。

Model Router v1 不做权限阻断、不做 credential policy、不保证敏感数据治理。`privacyLevel = sensitive` 只输出 warning；真正的审批、阻断、凭据校验和敏感数据治理放到 P3 Tool Permission Hooks / Credential Gating。

## 2. ModelProfile 字段

| 字段 | 含义 |
|---|---|
| `modelId` | 系统内部模型标识。 |
| `provider` | provider 标识；当前只作为静态画像字段，不代表已经接入真实 API。 |
| `capabilities` | 模型能力，如 `reasoning`、`coding`、`structured_output`、`web_research`、`long_context`、`vision`、`fast_classification`、`creative_writing`、`tool_calling`。 |
| `costTier` | 成本层级：`low` / `medium` / `high`。 |
| `latencyTier` | 延迟层级：`fast` / `normal` / `slow`。 |
| `contextWindowTier` | 上下文窗口层级：`small` / `medium` / `large`。 |
| `defaultFor` | 默认适用任务类型。 |
| `fallbackModelIds` | 当前模型不可用或不适合时的候选 fallback 顺序。 |
| `enabled` | 是否可被选中。`enabled = false` 的模型不会被路由选中。 |

## 3. ModelSelectionRequest 字段

| 字段 | 含义 |
|---|---|
| `taskType` | 任务类型，如 `simple_classification`、`complex_reasoning`、`code_task`、`document_analysis`。 |
| `requiredCapabilities` | 必须精确满足的能力列表。 |
| `complexity` | 复杂度：`simple` / `standard` / `complex` / `critical`。 |
| `costPreference` | 成本偏好：`minimize` / `balanced` / `quality_first`。 |
| `latencyPreference` | 延迟偏好：`fast` / `balanced` / `quality_first`。 |
| `privacyLevel` | 隐私等级：`public` / `internal` / `sensitive`。 |

## 4. ModelSelectionResult 字段

| 字段 | 含义 |
|---|---|
| `ok` | 是否成功选到模型。 |
| `selectedModelId` | 仅成功分支包含，选中的模型 id。 |
| `fallbackModelIds` | 可查询的 fallback chain。 |
| `reason` | 选择或失败原因。 |
| `confidence` | 成功分支为路由置信度，失败分支为 0。 |
| `estimatedCostTier` | 仅成功分支包含，选中模型的成本层级。 |
| `warnings` | 隐私、策略或后续集成注意事项。 |
| `error` | 仅失败分支包含；当前支持 `no_model_available`。 |

`ModelSelectionResult` 是安全结果类型：

```ts
type ModelSelectionResult = ModelSelectionSuccess | ModelSelectionFailure
```

失败分支返回 `ok: false`、`error: "no_model_available"`、`reason`、`warnings`，不要求 `selectedModelId`。

## 5. 路由规则

1. `requiredCapabilities` 精确匹配优先，不满足必需能力的 profile 不会进入候选。
2. `costPreference = minimize` 时优先低成本。
3. `latencyPreference = fast` 时优先低延迟。
4. `complexity = complex / critical` 时优先具备 `reasoning` 能力。
5. `taskType = code_task` 时优先具备 `coding` 能力。
6. `taskType = document_analysis` 时优先具备 `long_context` 能力。
7. `privacyLevel = sensitive` 时只输出 warning，不阻断。
8. `enabled = false` 的模型不会被选中，也不会进入 fallback chain。
9. 没有任何 enabled 模型满足必需能力时返回安全错误，不抛未捕获异常。
10. 排序稳定性 tie-break：policy score -> cost tier -> latency tier -> context window tier -> profile order。

## 6. fallback chain 的作用

fallback chain 是可解释的后备模型顺序，用于后续真实模型网关接入时做降级策略。本轮它只返回模型 id，不执行调用、不探活、不做队列。

边界规则：

- disabled fallback model 会被跳过。
- missing fallback model 会被忽略，不 crash。
- fallback loop 会被 `seen` 集合截断，不会无限递归。
- fallback chain 会去重并保持 first-seen 顺序。
- unknown `modelId` 返回空 chain。

示例：

```ts
new StaticModelRouter().getFallbackChain("ark-code-latest")
// ["deepseek-v4-flash"]
```

当前种子 profiles：

- `doubao-seed-2.0-pro`: reasoning / structured_output / long_context / web_research，默认用于 research、business_analysis、document_summary。
- `deepseek-v4-flash`: fast_classification / structured_output / reasoning，默认用于 classification、extraction、logic_review。
- `ark-code-latest`: coding / structured_output / tool_calling，默认用于 code_task、api_schema、mcp_config。

## 7. ModelRegistry 与 ModelRouter

如果后续引入 `ModelRegistry`，它应只负责模型注册与画像来源；`ModelRouter` 负责在给定 profiles 上做选择决策。两者不能成为两套互相冲突的模型来源。

## 8. 当前限制

- 不接真实模型 API。
- 不接 API key。
- 不做模型调用。
- 不做权限阻断。
- 不做 credential policy。
- `privacyLevel = sensitive` 只 warning，不保证敏感数据治理。
- 不做 Tool Permission Hooks。
- 不做 MCP Gateway。
- 不做 Eval Engine。
- 不改变 RunStore / Approval Resume / DAG / Swarm 主流程语义。
- 当前 provider 只是静态画像字段，只用于路由决策测试。
