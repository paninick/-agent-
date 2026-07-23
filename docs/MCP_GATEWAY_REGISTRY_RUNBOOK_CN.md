# MCP Gateway Static Registry + Tool Descriptor v1 运行手册

更新日期：2026-07-05

---

## 1. P4.0 定义

P4.0 是 MCP Gateway 的静态注册表和工具描述层。它只定义：

- server profile
- tool descriptor
- transport 声明
- auth requirement 声明
- health status
- mock result
- 错误分类

P4.0 不连接真实 MCP server，不读取真实 API key，不调用外部工具，不调用 P3 hook，不写 RunStore audit。

P4.0 是**静态注册与描述层**，不是运行时 gateway 进程。registry 只做注册、查询、过滤；它不在工具执行管道上做拦截，也不驱动任何状态机。

当前实现已落地在 `src/mcp`：

- `types.ts`：P4.0 类型契约。
- `descriptors.ts`：seed MCP server profile 与 tool descriptor。
- `registry.ts`：`McpGatewayRegistry` 静态注册与查询。
- `mockToolCall.ts`：合成工具调用结果，不执行真实工具。
- `errorClassification.ts`：`McpError.kind` 与 `retryable` 映射。
- `health.ts`：声明式 health status 读取。

---

## 2. Roadmap 位置

P4.0 在 Agent OS v2 的阶段顺序中位于 P3 之后：

- P0 Intelligence Verification / Source Classification（已封版）
- P1 RunStore + Approval Resume（已封版）
- P2 Model Selection / Model Router v1（已封版）
- P3 Tool Permission Governance v1（已封版）
- **P4.0 MCP Gateway Static Registry + Tool Descriptor v1（本轮）**

P4.0 必须在 P3 之后的理由：

- P3 已建立 `ToolPermissionDecision` / `CredentialStatus` / `AgentRiskVector` 等治理原语。
- P4.0 提供被治理的**工具描述来源**（descriptor），供后续阶段组装成"descriptor → preToolUseHook → 执行 → postToolUseHook"链路。
- 反序会导致 P4 自造权限字段与风险字段，与 P3 形成两个真相源，retrofit 成本高。

P4.0 只提供 descriptor 和 mock result 两端，不负责中间的治理调用与真实执行。

---

## 3. 术语表

| 中文 | 英文 | 层级 | 一句话定义 |
|---|---|---|---|
| MCP server 画像 | McpServerProfile | P4.0 | 静态声明的 server 注册项。 |
| MCP 工具描述 | McpToolDescriptor | P4.0 | 静态声明的工具描述，含 inputSchema 与 declaredEffect。 |
| transport 类型 | McpTransportType | P4.0 | 静态声明的传输方式枚举，不是连接动作。 |
| 认证需求声明 | McpAuthRequirement | P4.0 | 静态声明该 server 需要什么认证方式；不是 credentialStatus。 |
| MCP 健康状态 | McpHealthStatus | P4.0 | registry 维度的静态健康分类，独立于 P0。 |
| 工具调用请求 | ToolCallRequest | P4.0 | 被治理的调用载荷，只含 toolId / serverId / arguments。 |
| 工具调用结果 | ToolCallResult | P4.0 | 工具调用的结果载荷，含 ok / result / error / auditPayload。 |
| MCP 网关注册表 | McpGatewayRegistry | P4.0 | 静态注册与查询接口，不是运行时 gateway 进程。 |
| mock 工具调用结果 | mock tool call result | P4.0 | 合成结果，不执行真实工具。 |
| MCP 错误分类 | McpError | P4.0 | 错误 kind 与 retryable 映射。 |
| 声明效应 | declaredEffect | P4.0 | 工具静态效应声明，是 P3 风险计算输入，不是 riskLevel。 |

---

## 4. 核心类型说明

下列类型形状是 P4.0 的**文档契约**，用于明确字段边界与禁止字段，不是实现指令。

### 4.1 McpTransportType

```ts
type McpTransportType = "stdio" | "sse" | "streamable_http"
```

`McpTransportType` 是**静态声明的枚举值**，表示 server 声称支持的传输方式。P4.0 不建立任何 transport 连接，不区分本地 / 远程，不做能力探测。

### 4.2 McpAuthRequirement

```ts
type McpAuthRequirement = "none" | "api_key" | "bearer_token" | "oauth"
```

`McpAuthRequirement` 是**静态声明**：该 server 需要什么认证方式才能工作。它**不是** `CredentialStatus`。

- `authRequirement` 回答："这个 server 声明需要什么认证？"
- `credentialStatus` 回答："调用方当前凭据是否可用？"

后者是 P3 运行态输入，P4.0 不包含、不计算、不读取。

### 4.3 McpServerProfile

```ts
type McpServerProfile = {
  serverId: string
  name: string
  transport: McpTransportType
  authRequirement: McpAuthRequirement
  toolDescriptors: McpToolDescriptor[]
  enabled: boolean
  healthStatus: McpHealthStatus
  description?: string
}
```

禁止字段：

- 无 `credentialStatus`（P3 职责）
- 无 `riskLevel` / `requiresApproval`（P3 输出）
- 无 `apiKey` / `token` / `secret`（不读真实凭据）

### 4.4 McpToolDescriptor

```ts
type McpDeclaredEffect = "read" | "write" | "destructive" | "network" | "compute"

type McpToolDescriptor = {
  toolId: string
  serverId: string
  name: string
  description: string
  inputSchema: Record<string, unknown>
  declaredEffect: McpDeclaredEffect
}
```

`declaredEffect` 是**P3 风险计算的输入**，不是 `ToolRiskLevel`。P3 根据 `declaredEffect` 与其他输入（数据敏感度、凭据暴露、网络暴露等）计算 `ToolRiskLevel` 与 `requiresApproval`。P4.0 不输出风险，也不输出审批建议。

`McpDeclaredEffect` 在 P4.0 v1 是**单值枚举**：

- 一个 `McpToolDescriptor` 只能声明一个 `declaredEffect`。
- 多效应工具选择**主导效应**作为 `declaredEffect`（例如"从远程 API 读数据"的工具，主导效应是 `read` 而不是 `network`）。
- P4.0 v1 **不实现** `McpDeclaredEffect[]`（多效应数组）；v2 可扩展为数组形式，届时需同步更新 P3 消费方约定。
- P4.0 不做主导效应选择规则的标准定义，由 descriptor 注册方判断。

禁止字段：

- 无 `riskLevel`（P3 计算结果）
- 无 `requiresApproval`（P3 决策输出）
- 无 `credentialStatus`（P3 运行态输入）

### 4.5 McpHealthStatus

```ts
type McpHealthStatus =
  | "registered"
  | "healthy"
  | "degraded"
  | "unreachable"
  | "not_implemented"
```

`McpHealthStatus` 是 MCP server 维度的静态健康分类，**独立于 P0 `SourceResultStatus`**。

- 允许与 P0 同名值（如 `degraded`）语义平行。
- 禁止 import P0 的 `SourceResultStatus` 或 `AdapterHealth` 类型。
- `McpHealthStatus.not_implemented` 与 P0 `SourceResultStatus.adapter_not_implemented` 是两个不同层的概念，不能互相赋值。

### 4.6 ToolCallRequest

```ts
type ToolCallRequest = {
  toolId: string
  serverId: string
  arguments: Record<string, unknown>
}
```

`ToolCallRequest` 是被治理的载荷，shape 应可被 P3 `preToolUseHook` 消费（前向兼容）。但 `credentialStatus` 是 P3 hook 的**单独入参**，不是 request 的字段。

禁止字段：

- 无 `credentialStatus`（P3 入参，不属于 request）
- 无 `riskLevel` / `requiresApproval`（P3 输出）

### 4.7 ToolCallResult

`ToolCallResult` 是 discriminated union，与 P2 `ModelSelectionResult` 的安全结果类型模式一致。`ok: true` 时不得有 `error`，`ok: false` 时不得有 `result`。

```ts
type ToolCallSuccess = {
  ok: true
  result: unknown
  auditPayload?: AuditEventPayload
}

type ToolCallFailure = {
  ok: false
  error: McpError
  auditPayload?: AuditEventPayload
}

type ToolCallResult = ToolCallSuccess | ToolCallFailure
```

边界：

- `ToolCallSuccess` 只有 `result`，没有 `error`。
- `ToolCallFailure` 只有 `error`，没有 `result`。
- `auditPayload` 在两个分支都是可选的。
- `auditPayload` 是可写入审计的 payload，**不自动落库**。P4.0 不调用 `runStore.appendAuditEvent`，由调用方显式写入。
- 这与 P3 `ToolAuditEvent` 的边界一致：payload，不是写入动作。

### 4.8 AuditEventPayload

`AuditEventPayload` 是 P4.0 产出的审计载荷最小 shape，用于 `ToolCallResult.auditPayload`。

```ts
type AuditEventPayload = {
  eventType: string
  timestamp: string
  metadata: Record<string, unknown>
}
```

边界：

- `AuditEventPayload` 只是 payload，**不自动落库**，不调用 `runStore.appendAuditEvent`。
- **不 import P3 governance**（`src/governance`）；P4.0 不依赖 P3 类型定义。
- **不 import P1 runtime**（`src/runtime`）；P4.0 不依赖 RunStore / DAGExecutor / SwarmOrchestrator。
- `metadata` 是开放结构，用于携带 P4.0 维度的审计元数据（如 `toolId`、`serverId`、`mcpStaticOnly` 等）；具体字段语义由调用方或后续版本约定。
- 与 P3 `ToolAuditEvent` 的 shape 方向兼容，但 P4.0 不强制要求字段对齐；后续 P4.2 运行时集成时再做显式映射。

### 4.9 McpError

```ts
type McpError = {
  kind:
    | "transport_unavailable"
    | "auth_required"
    | "tool_not_found"
    | "timeout"
    | "server_error"
    | "schema_invalid"
    | "rate_limited"
    | "unknown"
  message: string
  retryable: boolean
}
```

`McpError` 是错误分类与 retryable 映射，P4.0 不做真实错误归因，不接入日志系统。

---

## 5. 与 P0 / P1 / P2 / P3 的关系

### 5.1 与 P0 Intelligence Verification 的关系

P4.0 与 P0 **类型独立**。

- P0 `SourceResultStatus` 是数据源探针后的运维分类。
- P4.0 `McpHealthStatus` 是 MCP server 维度的静态健康分类。
- 二者同名值允许语义平行，但类型必须独立，禁止互相 import 或赋值。

### 5.2 与 P1 RunStore + Approval Resume 的关系

P4.0 **不接 RunStore**。

- P4.0 不创建 Run，不改 run status，不创建 ResumePoint。
- `ToolCallResult.auditPayload` 是 payload，不自动写入 `runStore.appendAuditEvent`。
- 是否真的进入 P1 审批流由上层调用方决定，P4.0 不触发 P1 `waiting_approval` 状态机。

### 5.3 与 P2 Model Router 的关系

P4.0 与 P2 在 v1 **解耦**。

- P2 `tool_calling` capability 表示模型是否支持工具调用。
- P4.0 registry 表示工具是否存在。
- 两者正交，P4.0 不查"模型能否调此工具"，P2 不查 registry。
- 后续若需交叉判断（"选中模型 + 选中工具"的联合决策），放到 P4.2 运行时集成。

### 5.4 与 P3 Tool Permission Governance 的关系

P4.0 为 P3 提供**可消费字段**，但不调用 P3。

- P4.0 `McpToolDescriptor.declaredEffect` 是 P3 `AgentRiskVector` 的输入之一。
- P4.0 `McpServerProfile.authRequirement` 描述认证需求，供后续阶段映射成期望凭据。
- P4.0 **不调用** `preToolUseHook` / `postToolUseHook`，包括 mock tool call 路径也不调用。
- P4.0 不输出 `ToolPermissionDecision`、不输出 `ToolRiskLevel`、不输出 `requiresApproval`。

集成方向（留给后续阶段，不在 P4.0）：

```text
build ToolCallRequest from descriptor
  → preToolUseHook (P3)
  → 真实/mock 执行
  → postToolUseHook (P3)
```

P4.0 只负责两端：提供 descriptor、提供 mock result。中间的治理调用不在 P4.0。

---

## 6. 静态 registry 规则

`McpGatewayRegistry` 是静态注册与查询接口，不是运行时 gateway 进程。

### 6.1 注册

- `McpServerProfile` 通过 seed descriptor 注册。
- `serverId` 全局唯一，重复注册安全返回错误，不抛未捕获异常。
- `toolId` 在同一 server 内唯一。
- 当前 API：`register(profile)`、`getServer(serverId)`、`getTool(toolId)`、`listServers()`、`listTools(serverId)`、`validateServerProfile(profile)`、`validateToolDescriptor(descriptor, serverId)`。

### 6.2 查询

- 按 `serverId` 查 server profile。
- 按 `toolId` 查 tool descriptor。
- 列出全部 enabled server。
- 列出某 server 下全部 enabled tool。
- unknown `serverId` / `toolId` 安全返回错误，不 crash。

### 6.3 enabled 语义

- `serverProfile.enabled = false` 的 server 不会被查询返回，其 tool 也不可被列出。
- `enabled` 是静态声明值，P4.0 不做探活、不做健康检查、不做熔断。

### 6.4 不做的事

- 不动态发现 tool（从真实 server 拉 tool list）。
- 不做连接池 / 生命周期管理 / 重试调度。
- 不做工具结果缓存。
- 不持久化 registry（无数据库、无文件落盘，进程重启后 registry 由 seed 重建）。

---

## 7. mock tool call 规则

mock tool call result 是**纯合成结果**，不是真实调用的包装。

### 7.1 允许做什么

- 根据 `toolId` / `arguments` 返回合成 `ToolCallResult`。
- 用规则或 fixture 生成结果。
- 返回 `ok: true` / `ok: false` 与 `McpError` 以覆盖测试矩阵。
- 返回 `auditPayload`，但不自动落库。

### 7.2 禁止做什么

mock tool call 必须：

- 不发网络请求。
- 不连接 MCP server。
- 不读取 API key。
- 不触发 P3 hook（`preToolUseHook` / `postToolUseHook` 都不调用）。
- 不写 RunStore audit。
- 不伪装成真实执行结果。

mock 与真实执行的边界：mock 是"提供合成结果以验证 registry 与载荷契约"，不是"包装真实调用但返回假数据"。后者会模糊 P4.0 "不接真实 MCP" 的边界。

---

## 8. MCP 错误分类

`McpError.kind` 是中等粒度的错误分类，P4.0 不做真实错误归因。

| kind | retryable | 说明 |
|---|---|---|
| `transport_unavailable` | true | 声明的 transport 不可用（P4.0 仅静态分类，不探测）。 |
| `auth_required` | false | 缺认证或认证被拒。 |
| `tool_not_found` | false | toolId 不存在或已 disabled。 |
| `timeout` | true | 调用超时（P4.0 仅分类，不真实等待）。 |
| `server_error` | true | server 侧错误。 |
| `schema_invalid` | false | inputSchema 不符合预期。 |
| `rate_limited` | true | 限流。 |
| `unknown` | false | 未分类错误。 |

边界：

- P4.0 不照搬 P0 的 13 个 `SourceResultStatus`。
- P4.0 不接入日志系统、不上报错误、不做错误聚合。
- `retryable` 是声明值，P4.0 不执行重试。

---

## 9. 禁止事项

P4.0 明确不做以下内容：

1. 不连接真实 MCP transport（SSE / streamable_http / stdio 实际连接）。
2. 不执行真实工具。
3. 不读取真实 API key / token / secret。
4. 不访问 Secret Manager。
5. 不计算 `credentialStatus`（P3 职责）。
6. 不计算 `riskLevel` / `requiresApproval`（P3 职责）。
7. 不调用 `preToolUseHook` / `postToolUseHook`（含 mock 路径）。
8. 不调用 `RunStore` / `DAGExecutor` / `SwarmOrchestrator` 的任何方法（P1 职责）。
9. 不调用 `runStore.appendAuditEvent`；`ToolCallResult.auditPayload` / `AuditEventPayload` 只是 payload，不自动落库。
10. 不改变 `RunStatus`，不创建 `ResumePoint`，不触发 P1 `waiting_approval` 状态机。
11. 不 import `src/runtime`（P1 RunStore / DAGExecutor / SwarmOrchestrator 所在目录）。
12. 不 import P0 `SourceResultStatus` / `AdapterHealth`。
13. 不 import P3 governance 函数（`src/governance`）。
14. 不动态发现 tool。
15. 不做连接池 / 重试调度 / 结果缓存。
16. 不与 P2 ModelRouter 交叉判断"模型能否调此工具"。
17. 不做 UI / 审批面板。
18. 不做数据库 / 持久化 registry。
19. 不做组织级 RBAC。
20. 不做 Sandbox。
21. 不做 Eval Engine。

---

## 10. 后续 P4.1 / P4.2 范围

> **更新说明 (2026-07-05)**：P4.1 已完成实现，实际范围与最初设想不同。P4.1 是 **MCP Transport Interface + Fake Transport Harness**（抽象接口 + 假实现），不是真实 MCP transport。真实 transport / 真实执行已推迟到 P4.2+。

### P4.1 MCP Transport Interface + Fake Transport Harness（已完成）

- `McpTransport` 抽象接口（`healthProbe` / `listTools` / `callTool`）。
- `FakeMcpTransport` 假实现，基于 `McpGatewayRegistry`（P4.0）返回合成成功 / 合成错误。
- `FakeTransportConfig.errorOverrides` 结构化错误注入（per-server / per-tool / per-callIndex / catch-all），最具体匹配优先。
- `McpTransportResponse` 区分联合类型（`ok: true` / `ok: false`），`McpTransportError` 复用 `McpErrorKind`。
- `__mockErrorKind` 魔法字符串被 `errorOverrides` 替代；`mockToolCall.ts` 标记 deprecated（保留 P4.0 向后兼容）。
- 仍然不连接真实 MCP server，不读 key，不调 P3 hook，不写 RunStore audit。

详见 [docs/MCP_TRANSPORT_INTERFACE_RUNBOOK_CN.md](MCP_TRANSPORT_INTERFACE_RUNBOOK_CN.md)。

### P4.2+ 真实 MCP transport 与运行时治理（未实现）

- 真实 SSE / streamable_http / stdio 连接。
- 真实工具执行。
- 真实 server 探活 / health probing。
- OAuth 流程 / token 交换。
- 凭据解析（从 `.env` / Secret Manager 读 key，并映射成期望凭据）。
- 动态工具发现（从真实 server 拉 tool list）。
- 连接池 / 生命周期管理 / 重试调度。
- 工具结果缓存。
- 组装 `descriptor → preToolUseHook (P3) → 执行 → postToolUseHook (P3)` 链路。
- 调用 `runStore.appendAuditEvent` 写 audit。
- P3 `requires_approval` decision 触发 P1 `waiting_approval` 状态机的衔接。
- P2 ModelRouter 与 P4 registry 的联合决策（"选中模型 + 选中工具"）。
- 真实错误归因与上报。

P4.0 / P4.1 不实现以上任何一项。

---

## 11. 验收标准

P4.0 通过验收需满足：

1. `McpServerProfile` / `McpToolDescriptor` / `McpTransportType` / `McpAuthRequirement` / `McpHealthStatus` / `ToolCallRequest` / `ToolCallResult` / `McpError` / `AuditEventPayload` 类型契约与本文档第 4 节一致。
2. registry 支持注册、查询、enabled 过滤、去重，unknown id 安全返回错误。
3. mock tool call 返回合成结果，且不发网络、不连 MCP、不读 key、不调 P3 hook、不写 RunStore audit。
4. `McpServerProfile` 不含 `credentialStatus` / `riskLevel` / `requiresApproval` / `apiKey` / `token` 字段。
5. `McpToolDescriptor` 不含 `riskLevel` / `requiresApproval` / `credentialStatus` 字段。
6. `ToolCallRequest` 不含 `credentialStatus` / `riskLevel` / `requiresApproval` 字段。
7. `McpHealthStatus` 不 import P0 类型，与 `SourceResultStatus` 类型独立。
8. `McpError` 每个 kind 的 `retryable` 映射与第 8 节一致。
9. 无任何真实 transport / 真实 key / 真实 MCP 连接。
10. registry 与 P2 ModelRouter 解耦，不查"模型能否调此工具"。
11. `auditPayload` / `AuditEventPayload` 不自动落库。
12. README `## MCP Gateway Registry` 章节与本文档边界一致。
13. `ToolCallResult` 是 discriminated union：`ok: true` 时无 `error`，`ok: false` 时无 `result`，与 P2 `ModelSelectionResult` 模式一致。
14. `AuditEventPayload` 最小 shape 为 `{ eventType, timestamp, metadata }`，且不 import P3 governance、不 import P1 runtime。
15. `McpDeclaredEffect` 在 v1 是单值枚举；多效应工具选择主导效应；P4.0 不实现 `McpDeclaredEffect[]`。
16. 不 import `src/runtime`（P1 RunStore / DAGExecutor / SwarmOrchestrator 所在目录）。
17. 不调用 `RunStore` / `DAGExecutor` / `SwarmOrchestrator` 的任何方法。
18. 不改变 `RunStatus`，不创建 `ResumePoint`，不触发 P1 `waiting_approval` 状态机。

通过验收**仅表示** P4.0 静态注册与工具描述层契约成立，**不表示** MCP Gateway 已可接入真实 server，**不表示** 工具可被真实调用，**不表示** 治理链路已集成。
