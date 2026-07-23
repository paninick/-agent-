# N0 Output — Model Gateway PRD Lock

STATUS: PASS

NEXT_NODE: N1_LONG_CONTEXT_ARCH_REVIEW

NEXT_MODEL: longcat

---

## 1. Goal

在 `src/integration/` 新建集成层，实现 ModelGateway — 模型路由网关，支持 primary→fallback 自动切换、多供应商真实 API 调用。`src/models/` 保持密封不变。

## 2. Scope

- `ModelGateway` 接口 + `ModelGatewayImpl`（真实 HTTP 调用）
- `FakeModelGateway`（测试用假实现）
- 4 个供应商配置（DeepSeek / 火山引擎 / OpenRouter / longcat）
- 自动切换逻辑：primary 失败 → 切 fallback → 全部失败 → `all_providers_failed`
- API key 从 `process.env` 读取，不硬编码

## 3. Non-Goals (14)

1. 不修改 `src/models/`（P2 密封）
2. 不修改 `src/governance/`（P3 密封）
3. 不修改 `src/mcp/`（P4.0/P4.1 密封）
4. 不修改 `src/runtime/dagExecutor.ts`（P4.2 完整运行时集成是后续工作）
5. 不实现 ToolExecutionAdapter（preToolUseHook → callTool → postToolUseHook 链路）
6. 不实现 RunStore audit 桥接
7. 不实现 DAGExecutor 策略注入
8. 不创建 `.mcp.json` / `.env` / `.github/**`
9. 不硬编码 API key
10. 不在返回值/日志/错误消息中暴露 API key
11. 不实现 OAuth / token 交换
12. 不实现连接池 / 生命周期管理
13. 不实现工具结果缓存
14. 不实现 P2 ModelRouter + P4 registry 联合决策

## 4. File Boundaries

ALLOWED:
- `src/integration/types.ts` (CREATE)
- `src/integration/providerConfig.ts` (CREATE)
- `src/integration/modelGateway.ts` (CREATE)
- `src/integration/fakeModelGateway.ts` (CREATE)
- `src/integration/index.ts` (CREATE)
- `src/tests/model-gateway.test.ts` (CREATE)
- `docs/MODEL_GATEWAY_RUNBOOK_CN.md` (CREATE)
- `README.md` (EDIT)
- `CHANGELOG.md` (EDIT)
- `.env.example` (EDIT)
- `package.json` (EDIT, test script only)

FORBIDDEN:
- `src/models/**`, `src/governance/**`, `src/mcp/**`, `src/runtime/**`, `src/intelligence/**`
- `.mcp.json`, `.github/**`, `.env`

## 5. Core Types

- `ModelGateway { callModel(request): Promise<ModelCallResponse>; getAvailableModels(): string[] }`
- `ModelCallRequest { modelId, messages, maxTokens?, temperature?, taskType?, fallbackModelIds? }`
- `ModelCallResponse = ModelCallSuccess | ModelCallFailure` (discriminated union on `ok`)
- `ModelGatewayErrorKind`: 8 kinds (no_provider, auth_failed, rate_limited, timeout, server_error, network_error, all_providers_failed, invalid_response)
- `ProviderConfig { providerId, baseUrl, apiKeyEnv, modelMapping, extraHeaders? }`
- `ModelGatewayConfig { providers, maxRetries, timeoutMs, fallbackEnabled }`

## 6. Acceptance Criteria

1. `src/integration/` 存在且可独立编译
2. `src/models/` 零修改，现有 22 个测试全绿
3. lint/typecheck/test/build/verify:intelligence 全 PASS
4. 自动切换：primary 失败时自动切到 fallback 并成功
5. 4 个供应商配置齐全
6. API key 只在 `src/integration/` 中读取
7. FakeModelGateway 可用于无 key 环境的测试
8. 28+ 测试覆盖 happy/failure/fallback/boundary
9. Runbook 文档完整
10. `.env.example` 包含所有 4 个 key 的占位符
