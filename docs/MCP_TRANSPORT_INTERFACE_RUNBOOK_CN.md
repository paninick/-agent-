# MCP Transport Interface + Fake Transport Harness Runbook (CN)

> P4.1 — 本文档定义 MCP 传输接口与 Fake Transport Harness 的边界、类型与使用规则。
> 封版状态：P4.1 SEALED。本文件为 N6 文档同步产物。

## 1. 定义

- **McpTransport interface** — MCP 传输层行为契约，包含 `healthProbe`、`listTools`、`callTool` 三个方法。
- **FakeMcpTransport** — 实现 `McpTransport` 的合成传输，用于测试。基于 `FakeTransportConfig` + `McpGatewayRegistry` 产出合成成功与合成错误，无真实网络调用。
- **FakeTransportConfig.errorOverrides** — 结构化错误注入配置，替代 P4.0 的 `__mockErrorKind` 魔法字符串。

## 2. Roadmap 位置

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| P4.0 | MCP Gateway Static Registry + Tool Descriptor | SEALED |
| **P4.1** | **MCP Transport Interface + Fake Transport Harness** | **SEALED** |
| P4.2 | Runtime Integration (真实 transport 绑定, P3 hook 链路, RunStore audit) | 未开始 |

## 3. 核心类型

### transport.ts

```ts
interface McpTransport {
  healthProbe(serverId: string): Promise<McpHealthStatus>;
  listTools(serverId: string): Promise<McpToolDescriptor[]>;
  callTool(request: McpTransportRequest): Promise<McpTransportResponse>;
}
interface McpTransportRequest { serverId: string; toolId: string; arguments: Record<string, unknown>; }
interface McpTransportSuccess { ok: true; result: unknown; auditPayload?: AuditEventPayload; }
interface McpTransportFailure { ok: false; error: McpTransportError; auditPayload?: AuditEventPayload; }
type McpTransportResponse = McpTransportSuccess | McpTransportFailure;
interface McpTransportError { kind: McpErrorKind; message: string; retryable: boolean; cause?: unknown; }
```

### fakeTransport.ts

```ts
interface FakeErrorOverride { serverId?: string; toolId?: string; callIndex?: number; errorKind: McpErrorKind; message?: string; }
interface FakeTransportConfig { errorOverrides: FakeErrorOverride[]; }
class FakeMcpTransport implements McpTransport { constructor(registry, config); ... }
```

## 4. 边界规则

- `McpTransport` 接口与 P4.0 `McpGatewayRegistry` 分离：registry 声明"有什么"，transport 声明"怎么调用"。
- `McpTransportError` 复用 `McpErrorKind`（TYPES_LOCKED），不新增错误类型。
- `FakeMcpTransport` 构造函数必须接收 `config` 参数（无默认值）。
- `errorOverrides` 匹配优先级：最具体匹配胜出（callIndex > toolId > serverId > catch-all）。
- `callIndex` 计数器为每个 `FakeMcpTransport` 实例全局递增，从 0 开始。
- `mockToolCall.ts` 标记为 deprecated，保留 P4.0 兼容；P4.1 测试使用 `FakeMcpTransport`。

## 5. 禁止事项

1. 不实现真实 MCP transport（SSE / streamable_http / stdio）。
2. 不连接真实 MCP server 或使用真实 MCP client。
3. 不读取/存储/传输 API key / token / OAuth。
4. 不发起网络请求。
5. 不调用 P3 `preToolUseHook` / `postToolUseHook`。
6. 不写入 P1 `RunStore` audit。
7. 不集成 `DAGExecutor`。
8. 不从 `src/runtime` / `src/governance` / `src/models` / `src/intelligence` 导入。
9. 不重新定义 TYPES_LOCKED 类型。
10. 不在 P4.1 代码路径使用 `__mockErrorKind`。

## 6. 与 P4.0 的关系

- P4.0 提供静态注册表（`McpGatewayRegistry`），P4.1 的 `FakeMcpTransport` 以 registry 为依赖注入。
- P4.0 的 `mockToolCall` 保留用于 P4.0 测试，P4.1 使用 `FakeMcpTransport`。
- P4.2 将绑定真实 transport 到 `McpTransport` 接口，并组装 P3 hook + RunStore audit 链路。

## 7. 验证命令

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run verify:intelligence
```
