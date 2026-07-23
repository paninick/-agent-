# Tool Permission Hooks + Credential Gating + AgentRiskVector v1 运行手册

更新日期：2026-07-05

## 1. P3 是什么

P3 是 Agent OS v2 的静态工具治理层。它在工具执行前做 rule-based 判断：

- 工具是否允许调用
- 是否缺凭据
- 是否权限不足
- 是否需要人工审批
- 风险等级多少
- 为什么给出该决策
- 是否应写入 audit event

本轮不执行真实工具，不读取真实 credential，不接真实 MCP，不接真实 API，不做 Secret Manager，不接数据库、Redis、BullMQ、Sandbox 或 Eval Engine。

当前实现目录固定为 `src/governance/`，这是 P3 v1 的 policy-as-library 位置。本轮不迁移到 `src/policy`。

注意：P3 的 `CredentialStatus` 与 P0 Intelligence Verification 的 `SourceResultStatus` 可以有相似命名，但属于不同层。P3 面向工具调用治理；P0 面向数据源探针/适配器分类。

## 2. 核心模块

| 文件 | 作用 |
|---|---|
| `src/governance/types.ts` | P3 类型定义。 |
| `src/governance/credentialPolicy.ts` | 静态凭据状态与 scope 校验。 |
| `src/governance/agentRiskVector.ts` | AgentRiskVector 与风险等级计算。 |
| `src/governance/toolRiskPolicy.ts` | 工具风险策略与审批判断。 |
| `src/governance/toolPermissionHook.ts` | `preToolUseHook` / `postToolUseHook`。 |

## 3. CredentialStatus

```ts
type CredentialStatus =
  | "not_required"
  | "missing_credentials"
  | "invalid_credentials"
  | "permission_denied"
  | "rate_limited"
  | "available"
```

`CredentialStatus` 是调用方传入的静态状态。P3 v1 不读取 `.env`，不访问 Secret Manager，不验证真实 token。

## 4. ToolPermissionDecision

`preToolUseHook(request)` 返回：

- `status`: `allow` / `deny` / `requires_approval`
- `allowed`: 是否允许继续
- `credentialStatus`: 凭据门禁结果
- `riskLevel`: `low` / `medium` / `high` / `critical`
- `riskScore`: rule-based 风险分
- `riskVector`: 风险向量
- `reasons`: 决策原因
- `warnings`: 警告
- `auditEventRequired`: 是否需要写审计
- `auditEvent`: 可写入 RunStore / Audit system 的 payload

P3 v1 只有三态：`allow` / `deny` / `requires_approval`。不实现 `log_only`。如需“允许执行但强制审计”，使用 `status = "allow"` 且 `auditEventRequired = true` 表达。

## 5. 决策规则

1. `toolEnabled = false` 直接 `deny`。
2. `missing_credentials` / `invalid_credentials` / `permission_denied` / `rate_limited` 直接 `deny`。
3. `credentialStatus = available` 时，`requestedScopes` 必须被 `grantedScopes` 覆盖，否则返回 `permission_denied`。
4. `riskLevel = high / critical` 返回 `requires_approval`。
5. 调用方显式标记需要审批时返回 `requires_approval`。
6. 低风险且凭据通过时返回 `allow`。

## 6. Scope Coverage Gating

Scope gate 是 CredentialStatus Gating 的补充规则：

- `requestedScopes` / `grantedScopes` 是调用方传入的静态 scope 信息。
- P3 不读取真实 token，不验证真实 OAuth scope，不访问 Secret Manager。
- 如果 `credentialStatus = available`，但 `requestedScopes` 中存在 `grantedScopes` 没覆盖的 scope，则策略降级为 `permission_denied` / `deny`。
- scope gate 不等于 RBAC，不等于 OAuth 校验，不等于 Secret Manager。

## 7. requires_approval 与 P1 waiting_approval

`requires_approval` 只是 P3 decision status，不等于 P1 `waiting_approval`。

P3 不做以下事情：

- 不调用 `runStore.updateRun`。
- 不调用 `runStore.appendAuditEvent`。
- 不创建 `ResumePoint`。
- 不改变 `RunStatus`。
- 不自动进入 P1 Approval Resume 状态机。

是否把 P3 `requires_approval` 映射到 P1 审批流，由未来上层 orchestration 显式决定。

## 8. AgentRiskVector

风险向量包括：

- `dataSensitivity`
- `toolEffect`
- `credentialExposure`
- `networkExposure`
- `externalWrite`
- `destructiveAction`
- `costExposure`

分数是 rule-based，不是真实概率。它用于静态治理和测试，不代表生产安全认证。
它不是 CVSS，不是安全认证评分。

## 9. Audit

P3 v1 会生成 audit event payload：

- `tool_permission_decision`
- `tool_execution_observed`

这些 payload 当前不自动写数据库，也不自动接 RunStore。后续如果接入 runtime audit，应由调用方显式写入。

`ToolAuditEvent.metadata` 契约：

- `p3StaticOnly = true` 表示该事件来自 P3 静态决策层。
- `executedByHook = false` 表示 P3 未执行真实工具。
- `ToolAuditEvent` 是 payload，不自动落库。

## 10. 当前限制

- 不执行工具。
- 不读取真实 credential。
- 不接 Secret Manager。
- 不接真实 MCP。
- 不接真实 API。
- 不做组织 RBAC。
- 不做 UI。
- 不做 Sandbox。
- 不做 Eval Engine。
- 不改变 P0/P1/P2 主语义。
- 不实现 `log_only` status。
