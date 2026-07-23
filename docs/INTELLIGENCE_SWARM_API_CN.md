# Intelligence Swarm API

`POST /api/intelligence/swarm`

## 概述

情报蜂群 HTTP 端点 — 从公开数据源采集真实情报，经过 6 角色蜂群管道（Scout → Collector → Verifier → Analyst → Synthesizer → Memory）产出综合简报。

本端点独立于 Launch Desk，不影响现有审批/SSE/UI 流程。

## 请求

### HTTP

| 字段 | 值 |
|------|-----|
| Method | `POST` |
| Path | `/api/intelligence/swarm` |
| Content-Type | `application/json` |

### Body

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `objective` | `string` | 是 | 情报目标描述，至少 8 个字符 |
| `packId` | `string` | 否 | 行业包 ID，默认 `"apparel"`。目前仅支持 `"apparel"` |

### 示例

```bash
curl -X POST http://localhost:3000/api/intelligence/swarm \
  -H "Content-Type: application/json" \
  -d '{"objective": "apparel cotton price cost transmission Vietnam Bangladesh"}'
```

```json
{
  "objective": "apparel cotton price cost transmission Vietnam Bangladesh",
  "packId": "apparel"
}
```

## 响应

### 成功 (200)

```jsonc
{
  "ok": true,
  "result": {
    "candidateSourceIds": ["src-cotton-index", "src-fiber-exchange"],
    "collectionLog": [
      {
        "sourceId": "src-cotton-index",
        "status": "collected",        // collected | skipped_no_key | failed | not_implemented
        "recordCount": 3,
        "error": null                  // 仅 status !== "collected" 时有值
      }
    ],
    "rawRecordCount": 5,
    "swarmRun": {
      "triggerId": "trigger-api-1700000000000",
      "results": [
        {
          "taskId": "task-collector-1",
          "role": "collector",
          "status": "completed",       // completed | done_with_concerns | failed | blocked | needs_context
          "evidence": { /* EvidenceEntry */ },
          "evidenceList": [ /* EvidenceEntry[] */ ],
          "finding": { /* AnalysisFinding */ },
          "synthesis": { /* SynthesisOutput */ },
          "concerns": ["budget overrun: ..."]
        }
      ],
      "synthesis": {
        "title": "Cotton Price Weekly Brief",
        "brief": "...",
        "confidence": 0.78,
        "evidenceIds": ["ev-1", "ev-2"]
      },
      "followUps": [
        { "id": "fu-1", "kind": "probe", "objective": "...", "rationale": "..." }
      ],
      "costRecord": {
        "modelCost": 0.0336,
        "toolCost": 0.0,
        "mcpCost": 0.0084,
        "computeCost": 0.0,
        "storageCost": 0.0,
        "totalCost": 0.042
      }
    }
  },
  "intent": {
    "detectedIntent": "price_intelligence",   // price_intelligence | supply_chain_risk | general_intelligence
    "assumptions": [
      "User wants current price/cost intelligence for apparel supply chain.",
      "Scout will match data sources covering raw materials, fibers, yarns, and fabrics."
    ],
    "riskLevel": "medium"                       // low | medium | high
  },
  "budget": {
    "maxCostUsd": 1.0,
    "withinBudget": true
  }
}
```

### 错误

| HTTP Status | error | 触发条件 |
|------------|-------|---------|
| 400 | `invalid_input` | objective 缺失或 < 8 字符 |
| 504 | `swarm_timeout` | 蜂群执行超过 30s 总量超时 |
| 500 | `swarm_failed` | 蜂群执行内部错误 |

错误响应体：

```json
{
  "ok": false,
  "error": "swarm_timeout",
  "message": "swarm_timeout_30s"
}
```

## 意图类型

端点通过正则匹配中英双语关键词自动检测三种意图类型，选择不同工作流：

| 意图 | 关键词示例 | 工作流 | riskLevel |
|------|-----------|--------|-----------|
| `price_intelligence` | price, cost, 棉花, cotton, 化纤, 面料, 原料 | 完整 6 步（含 Scout） | medium |
| `supply_chain_risk` | risk, disruption, tariff, tariff, 风险, 中断, 关税, 制裁 | 完整 6 步 + 增强验证门 | high |
| `general_intelligence` | （无匹配关键词） | 精简 5 步（跳过 Scout） | low |

> **注意**：Live swarm 模式下 Scout 步骤由 `runLiveSwarm` 单独执行（匹配数据源），编译工作流中的 scout 步骤会被路由层剥离后传给编排器，避免重复执行。

## 成本追踪

每次请求创建独立的 `CostEngine` 实例，预算上限 $1.00。

- 每步执行后估算模型成本（按 modelTier → costTier → per-1k 定价 × 默认 2000 input + 1000 output tokens）
- 记录到 6 桶 CostRecord：`modelCost` / `toolCost` / `mcpCost` / `computeCost` / `storageCost` / `totalCost`
- 预算守卫：超预算后标记当前步骤 `done_with_concerns`（含 "budget overrun" concern），中止后续步骤（Memory 步骤豁免，允许持久化已有结果）

## API Key 安全

- 所有 API Key 从 `process.env` 读取，不硬编码，不日志输出
- 缺 Key 的源 graceful skip（`status: "skipped_no_key"`）
- 支持的 Key 环境变量：
  - `FRED_API_KEY`
  - `CENSUS_API_KEY`
  - `OPEN_SUPPLY_HUB_API_KEY`
  - `UN_COMTRADE_API_KEY`

## 约束

- 不修改 `server/index.ts` 现有端点
- 不接数据库（MemoryStore 是进程内 Map，不持久化）
- 请求超时 30s（`Promise.race` + `setTimeout`）
- 无新增 npm 依赖
- 不新增外部服务