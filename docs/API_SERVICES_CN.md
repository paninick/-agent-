# 服务层 API 文档

> 自动生成参考 — 公共服务层接口说明
> 更新日期：2026-07-11

---

## 1. InMemoryRegistry\<T\>

**路径**：`src/services/registry.ts`
**泛型约束**：`T extends RegistryItem`（`{ id: string; enabled: boolean }`）

通用内存注册表基类。提供统一的注册/查询/枚举/删除接口，消除 ad-hoc `Map` 模式。

### 方法

| 方法签名 | 返回类型 | 说明 |
|---------|---------|------|
| `register(item: T)` | `ExecutionResult<T>` | 注册条目，重复 ID 返回 `{ ok: false, error: REGISTRY_DUPLICATE_ID }` |
| `get(id: string)` | `T \| undefined` | 按 ID 查找，不存在返回 `undefined` |
| `require(id: string)` | `ExecutionResult<T>` | 按 ID 查找，不存在返回 `{ ok: false, error: REGISTRY_ITEM_NOT_FOUND, recoverable: true, fallback }` |
| `list()` | `T[]` | 返回所有已注册条目（不筛选） |
| `enabled()` | `T[]` | 仅返回 `enabled === true` 的条目 |
| `delete(id: string)` | `boolean` | 移除条目，返回是否实际移除 |
| `clear()` | `void` | 清空全部条目 |

### 构造参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `registryName` | `string` | 注册表名称（用于错误消息中标识来源） |

### 使用示例

```typescript
import { InMemoryRegistry } from "../services/registry";
import type { RegistryItem } from "../domain/common";

type MyItem = RegistryItem & { label: string };
const reg = new InMemoryRegistry<MyItem>("MyRegistry");
const result = reg.register({ id: "a", enabled: true, label: "Alpha" });
if (result.ok) {
  console.log(reg.get("a")?.label); // "Alpha"
}
```

### 已迁移的注册表

- `McpGatewayRegistry` — 组合模式（不继承，因 `McpServerProfile` 用 `serverId` 而非 `id`）
- `ProbeRegistry` — 直接继承

### 不迁移的注册表

- `SkillRegistry` — 无顶层 `id`/`enabled`，`register` 是两参数且静默覆盖（重扫描依赖覆盖行为）
- `ProgressiveDisclosureRegistry` — 存储 `DisclosureMetadata`+`content`，分层加载是核心功能
- `sourceRegistry`/`phaseRegistry` — 是函数模块非 Map 类

---

## 2. CostEngine

**路径**：`src/services/cost-engine.ts`
**依赖**：`src/domain/cost.ts`（`CostRecord`, `CostBudget`, `CostLineItem`）

6 桶成本记账引擎 + 预算守卫。修复了 NP3 P0 问题：`createBudget` 实际将 `maxCostUsd` 保存到内部 Map。

### 方法

| 方法签名 | 返回类型 | 说明 |
|---------|---------|------|
| `createBudget(budget: CostBudget)` | `void` | 为 `taskId` 创建预算（保存 `maxCostUsd` 到内部 Map） |
| `addCost(lineItem: CostLineItem)` | `void` | 追加成本到 6 桶之一，自动更新 `totalCost` |
| `assertWithinBudget(taskId: string)` | `boolean` | 检查是否超支（读取已保存的预算）；未创建预算时返回 `true`（不限制） |
| `getRecord(taskId: string)` | `CostRecord \| undefined` | 获取当前成本记录 |
| `estimateModelCost(profile, inputTokens, outputTokens)` | `number` | 估算模型调用成本（USD） |

### 6 桶

| 桶名 | 类别 | 说明 |
|------|------|------|
| `modelCost` | modelCost | LLM 调用成本（按 token 估算） |
| `toolCost` | toolCost | 工具执行成本 |
| `mcpCost` | mcpCost | MCP 协议调用成本 |
| `computeCost` | computeCost | 计算资源成本 |
| `storageCost` | storageCost | 存储成本 |
| `totalCost` | — | 上述 5 桶之和 |

### 预算守卫规则

1. 每步执行后调用 `assertWithinBudget(taskId)`
2. 超支时中止后续步骤，当前步骤标记 `"budget overrun"` concern
3. `memory` 步骤豁免预算中断（始终执行）
4. 未创建预算（无 `createBudget` 调用）时不限制执行

---

## 3. WorkflowValidator

**路径**：`src/services/workflow-validator.ts`
**输入**：`SwarmWorkflow`（`steps: AgentRole[]`）

工作流结构校验器。在执行前拦截无效工作流。

### 校验规则

| 规则 | 说明 |
|------|------|
| steps 非空 | 至少 1 个步骤 |
| 首步为 scout | LIVE_WORKFLOW 例外：首步为 `collector` |
| 角色合法 | 所有 AgentRole 在 6 角色联合内 |
| 无重复角色 | 除 `memory` 外不允许重复 |
| 尾步为 memory | 必须以 `memory` 结尾 |

### 返回值

```typescript
{ valid: boolean; issues: WorkflowValidationIssue[] }
```

---

## 4. IntentCompiler

**路径**：`src/services/intent-compiler.ts`
**输入**：`intent: string`（用户目标描述）

意图→任务的自动编译器。适配服装供应链情报场景。

### 3 种意图类型

| 类型 | 关键词匹配 | 工作流 | 风险等级 |
|------|-----------|--------|---------|
| `price_intelligence` | price/cost/cotton/化纤/价格/成本/纤维 | 完整 6 步 | medium |
| `supply_chain_risk` | risk/disrupt/tariff/sanction/风险/中断/关税/制裁 | 完整 6 步 + 增强 verification | high |
| `general_intelligence` | 默认（无匹配） | LIVE_WORKFLOW（跳过 scout） | low |

### 返回值

```typescript
{
  detectedIntent: string;
  workflow: SwarmWorkflow;
  assumptions: string[];
  riskLevel: string;
}
```

---

## 5. ExecutionResult\<T\> / AppError

**路径**：`src/domain/common.ts`

### ExecutionResult\<T\>

```typescript
type ExecutionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: AppError };
```

### AppError

```typescript
interface AppError {
  code: string;       // 错误代码（如 REGISTRY_DUPLICATE_ID）
  message: string;    // 人类可读消息
  source: string;     // 来源模块名
  recoverable: boolean; // 是否可恢复（true = 调用方可重试或降级）
  fallback?: string;  // 恢复建议
}
```

### 已注册的错误代码

| 代码 | 来源 | recoverable | 说明 |
|------|------|-------------|------|
| `REGISTRY_DUPLICATE_ID` | InMemoryRegistry | false | 重复 ID |
| `REGISTRY_ITEM_NOT_FOUND` | InMemoryRegistry | true | 未找到项 |

---

## 6. McpGatewayRegistry

**路径**：`src/mcp/registry.ts`
**内部存储**：`InMemoryRegistry<McpServerEntry>`（组合模式）

MCP 服务器注册表。适配 `McpServerProfile`（用 `serverId` 而非 `id`）到 `RegistryItem`（`id`）。

### 方法

| 方法 | 定位 |
|------|------|
| `register(profile)` | 验证 + 克隆 + 适配（`id = serverId`）+ 委托 `InMemoryRegistry.register` |
| `getServer(serverId)` | 等价于 `get`，返回深拷贝 |
| `listServers()` | 等价于 `enabled()` |
| `listTools(serverId)` | 返回某服务器的工具列表 |
| `delete(serverId)` | 委托 `InMemoryRegistry.delete` |
| `clear()` | 委托 `InMemoryRegistry.clear` |
| `validateServerProfile(profile)` | 校验（禁止 `credentialStatus`/`riskLevel`/`apiKey` 等治理字段） |
| `validateToolDescriptor(descriptor, serverId)` | 同上，针对工具描述 |

---

## 7. 模型定价字段（ModelProfile）

**路径**：`src/models/types.ts`

NP3 合并后新增的 optional 字段（不传则不影响现有行为）：

| 字段 | 类型 | 说明 |
|------|------|------|
| `inputCostPer1k` | `number?` | 输入 token 每 1k 美元 |
| `outputCostPer1k` | `number?` | 输出 token 每 1k 美元 |
| `qualityScore` | `number?` | 质量评分 (0-1) |
| `reliabilityScore` | `number?` | 可靠性评分 (0-1) |
| `latencyScore` | `number?` | 延迟评分 (0-1, 高=快) |
| `contextWindow` | `number?` | 精确上下文窗口大小 |

### NP3 6 因子模型路由

```
score = quality * 0.30
      + taskFit * 0.20
      + reliability * 0.15
      + costEfficiency * 0.15
      + latency * 0.10
      + contextFit * 0.10
      + preferredBoost * 0.15
```