# 产链引擎 重启规划 v3 — 继承已有资产

> **更新日期**：2026-06-30 晚
> **核心转向**：v2 的方向对，但"从 0 造 M0 骨架"是错的；v3 改为"在 `verify:intelligence` 已跑通的基础上，补齐 4 授权源 + 4 P0 MCP + 真实 6 账本联动 + 4 大可观测面板 + 多行业扩展点"。
> **配套文档**：`04b_M0_DESIGN.md` / `04_CODE_SOP.md` / `03_AGENT_SOP.md` 已作废；`v2` 整体作废。

---

## 一、v2 作废原因（我之前犯的错）

| v2 错处 | 实际情况 |
|---|---|
| ❌ 重新设计 Pydantic schema | ✅ 已有 `src/intelligence/evidenceLedger.ts` + Zod schema |
| ❌ 重新写 4 支撑模块（M0） | ✅ 已有 `verify:intelligence` + `outputs/.../verification-latest.json` |
| ❌ 自己造 7 角色 Agent | ✅ 已有 `OpenAI Agents SDK`（package.json 真实依赖） |
| ❌ FastAPI 后端 | ✅ 已有 Express + tsx（`dev:server` / `start:server`） |
| ❌ 7 agent handoff | ✅ 已有 `src/agent/` + `src/server/` + `src/intelligence/` 三层 |
| ❌ 引用 FRED/Comtrade/Massive 重新接入 | ✅ World Bank/SEC/Eurostat/ECB/BLS 已 verified，Comtrade/FRED/Census/OS Hub 已规范化 missing |
| ❌ 推 Claude Opus 4.8 | ✅ 模型路由文档明确：**自动化 Agent → 国内原厂 API → 海外网关只兜底**（DeepSeek V4 / MiMo V2.5 / Doubao / 火山 Agent Plan） |
| ❌ 删 04b_M0_DESIGN | ✅ 归档；4 授权源 + 4 P0 MCP 是真实 P0 缺口 |

---

## 二、当前真实架构（盘点结果）

```
D:\Documents\New project 2\
├── package.json                     OpenAI Agents SDK + Vite + React + Express + Zod
├── data/
│   └── intelligence-source-registry.seed.json     23 个 S/A+/A/B+ 级源
├── src/
│   ├── intelligence/                ★ 核心：证据账本 + 6 账本 + 物料对账
│   │   ├── evidenceLedger.ts        写入/评分/反证/结论门槛
│   │   ├── officialApis.ts          5 verified + 4 auth-required + 3 candidate
│   │   ├── brandChainGate.ts        6 账本门禁 (GAP 试点 partial_chain)
│   │   ├── materialReconciliation.ts  BOM/纱线/纤维对账
│   │   ├── coverage.ts              7 维度覆盖状态
│   │   ├── visualizationReadiness.ts  可视化门槛
│   │   ├── sourceRegistry.ts        注册表解析
│   │   └── types.ts
│   ├── agent/                       ★ OpenAI Agents 编排
│   ├── server/                      ★ Express + Zod
│   ├── client/                      ★ React + Vite
│   └── tests/                       ★ vitest
├── scripts/
│   ├── verify-intelligence-sources.ts   ★ 真实跑通
│   └── verify-stream.mjs
├── outputs/
│   └── intelligence/
│       └── verification-latest.json  ★ bounded artifact
└── docs/产链引擎/                   ★ 文档（保留 v0-v2 作废 v3 当前）

D:\obesidian\知识库\
├── _元数据/                         API 凭据存储规则 / 存储分层规则
├── _SOP/                            业务 SOP
├── 主动情报/
│   ├── _渠道/                       10+ 渠道（成本/制造/进出口/数据采集实操手册）
│   └── _产业链图谱/                 9 环节（原料/面料/设计/制造/渠道/消费者/回收）
└── AI学习记忆/                      经验沉淀
```

---

## 三、v3 关键决策（用户已确认的继承 v2）

| # | 项 | 决策 |
|---|---|---|
| 1 | 后端栈 | **Express + tsx**（已运行）+ Node.js 生态 |
| 2 | Agent 框架 | **OpenAI Agents SDK**（已依赖）+ Zod schema |
| 3 | 前端 | 已有 client/（React + Vite），复用基建 |
| 4 | 数据库 | 沿用当前 artifact 模式（JSON bounded）→ 后续 SQLite |
| 5 | Token 模型 | 按 `AI_MODEL_ROUTING_PLAN_CN.md` §6 路由矩阵：自动化 Agent → 国内原厂 API |
| 6 | LLM 主力 | **DeepSeek V4 Pro** (Reasoner) + **MiMo V2.5** (Cleaner/Weigher) + **DeepSeek V4 Flash** (降级) + **Claude Opus 4.8** (L3 兜底，限 5-10% 调用) |
| 7 | Token 硬上限 | ¥1.5 告警 / ¥2 降级（沿用 v2 决策） |
| 8 | 多行业 | 删除抽象，仅服装（M2 推迟） |
| 9 | 数据保留 | 全部永久（沿用 v2） |
| 10 | 扩展点 | Protocol + Union（沿用 v2） |

---

## 四、v3 实施路线（8 个 P-block，对应任务表）

### P-Block 1: 4 授权源 adapter（P0，**已规范未实现**）

```
src/intelligence/officialApis.ts 已有 4 个待补:
  ① fetchFredLatestObservation       → FRED_API_KEY
  ② fetchUsCensusImportHs            → CENSUS_API_KEY
  ③ fetchOpenSupplyHubSearch         → OPEN_SUPPLY_HUB_API_KEY
  ④ fetchComtradeFlowSummary         → UN_COMTRADE_API_KEY (注: 当前叫 UN_COMTRADE_API_KEY 单 key)

动作:
  - 不需写新文件, 补全 officialApis.ts 4 个函数的 fetch 逻辑
  - 每函数: HTTP 调真实 API + 错误处理 + 转 evidence
  - 完成后: verify:intelligence 跑通 → confidenceScore 提升, 且海关账本进入 Evidence Graph

风险: 真实 API 调用可能因网络/限速失败
缓解: 重试 + 降级到 mock + 显式 skipped_auth_required
```

### P-Block 2: 3 candidate adapter（P0，**官方规范未调通**）

```
③ fetchWitsApi                     → 公开, 但 HS6 样例超时
④ fetchOecdDataExplorer            → 公开, SDMX 维度复杂
⑤ fetchIloStat                     → 公开, 样例需校准

动作:
  - 单独迭代, 不阻塞 P-Block 1
  - 每个 adapter 一次只解决 1 个超时/参数问题
  - 全部 verified 后, 提升 cross-source agreement, 但不再用 source 数量替代真实性
```

### P-Block 3: 4 P0 MCP（缺口补齐，**真实工作**）

```
MCP1 official-source-adapters-mcp
  - 把 5+4+3=12 个官方源统一成 MCP
  - 接 OpenAI Agents SDK @function_tool
  - 产出: evidence ledger 条目

MCP2 weighted-websearch-mcp
  - 搜索结果按来源等级 + 时间 + 域名 + 是否官方加权
  - 用于 A/B 级源补充线索
  - 对接 arkcli askecho / dataPro

MCP3 ark-memory-search-vector-mcp
  - 统一 Ark Memory + 专业搜索 + 向量
  - 用于决策上下文持久化
  - 持久层: 已有 wiki + 新增 evidence-ledger 索引

MCP4 evidence-ledger-mcp
  - 写 evidence / decision / action / audit 四类
  - 强制来源 + 口径 + 权重 + 换算 + 反证
  - 接受 agent / API 写入, 落 JSONL bounded artifact
```

### P-Block 4: 真实 6 账本联动（**核心价值**）

```
当前 GAP 试点: 2/6 ledgers passed
  ✓ 财务 (SEC)         passed
  ✓ 宏观扰动 (WB+ES+ECB+BLS)  passed
  ~ 贸易/海关 (Census+Comtrade)  partial (key 缺)
  ~ 供应商 (OS Hub)     partial
  ✗ 平台 (Temu/Shopee/1688)  missing
  ✗ 物料 (BOM/损耗)    missing

动作:
  - P-Block 1 完成后, 海关 → passed
  - OS Hub 替代: 企查查/天眼查 + 海关反推 (06 §3.4)
  - 平台: 申请 Temu 授权 (卖家账号), 或暂用 mock
  - 物料: 真实 BOM + 损耗率 (从工厂报价/海关数量对账)
  
目标: brandChainGate 5-6/6 ledgers passed (不要求 6/6)
```

### P-Block 5: 前端 4 大可观测性面板（**继承 client/，不重造**）

```
复用 client/ 基建, 新增 4 路由:

① /ops/agents         调度面板
   - 数据源: src/server 暴露 /api/agents/* (Express)
   - WS: WebSocket 推送 agent.* 事件
   - 显示: running/queued/failed/done + 详情 + step history

② /ops/tokens         Token 消耗
   - 数据源: 每次 LLM 调用写入 token_usage.jsonl
   - 5h 窗口 + 月度预算 + 按 agent/model 拆分
   - 告警徽章 (¥1.5 告警 / ¥2 降级)

③ /ops/data-flow      数据流对照
   - 点击决策 → 7 步 diff 视图
   - 数据源: evidence ledger + handoff trace
   - 字段映射表文档化

④ /ops/audit          决策审计时间线
   - 数据源: decision + audit_trail
   - 重放按钮: 相同 evidence + 相同 LLM 重推
   - 因果图 (React Flow)

技术栈: 沿用 client/ 的 React + Vite + Zod, 加 React Flow / Recharts
```

### P-Block 6: 多账本 UI + 多行业扩展点（M2 部分）

```
UI 端:
  - 6 账本切换 Tab (财务/海关/供应商/平台/物料/宏观)
  - 跨账本联动视图 (财务库存 vs 海关单价 vs 物料数量)
  - 按品牌 (GAP/UNIQLO/NKE/LULU) 切换

后端:
  - IndustryAdapter Protocol+Union 留扩展点
  - 当前实现: KnitwearAdapter
  - 加新行业时, 只改 Union 不动现有代码
  - schema: src/intelligence/industryAdapters/{base,knitwear}.ts
```

### P-Block 7: 触发 + Action + 审计（M3+M4）

```
触发 (P-Block 7a):
  - triggers/ruleEngine.ts
  - 规则: 阈值 / Z-score / 事件 / 复合 (AND/OR)
  - 接 verify:intelligence 输出 → 触发对应 action

Action (P-Block 7b):
  - actions/registry.ts
  - 6 种 ActionType (adjust_quote / trigger_purchase / ...)
  - 飞书/微信 webhook 通知
  - 审批流程 (requires_approval 标志)

审计 (P-Block 7c):
  - audit/replay.ts (用相同 evidence 重推)
  - audit/pdfExport.ts (决策报告 PDF)
  - audit/trail.ts (决策链可视化)
  - RuoYi RBAC 集成 (可选, 不阻塞 MVP)
```

### P-Block 8: 一键部署 (M4 部分)

```
- docker-compose.yml: server + client + sqlite + cron
- README: 5 分钟部署指南
- seed: 2026-Q2 真实快照 (verify:intelligence 已具备)
- 自检脚本: verify:intelligence → 1/2 → 6/6 ledgers
```

---

## 五、8 个 P-Block 优先级

```
P0 (先做):
  P-Block 1   4 授权源 adapter
  P-Block 2   3 candidate adapter
  P-Block 4   真实 6 账本联动 (GAP 试点变 chain_verified)

P1 (核心可见):
  P-Block 3   4 P0 MCP
  P-Block 5   前端 4 面板

P2 (扩展):
  P-Block 6   多账本 UI + 多行业
  P-Block 7   触发 + Action + 审计
  P-Block 8   一键部署
```

---

## 六、风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| FRED/Census/OS Hub/Comtrade 申请被拒 | 海关账本停滞 | 用替代 (Wiki 已有: U.S. Census 替代为 USITC / WITS / Eurostat) |
| 平台授权审批慢 (Temu/Shopee/1688) | 平台账本缺 | 用 mock + 公开网页 (价格/评论) |
| OS Hub Key 受限 | 供应商账本 partial | 企查查/天眼查 + 海关反推 |
| 物料 BOM 拿不到 | 物料账本缺 | 用海关数量 + 行业典型损耗率 (B 级源) |
| 4 P0 MCP 工期超 | 阻塞 P-Block 5/7 | MCP 1+4 优先 (evidence-ledger 是底座), 2+3 后做 |
| 真实 6 账本拿不下 chain_verified | 5 面板演示缩水 | brandChainGate 4/6 passed 已可演示, 不强求 6/6 |
| React Flow 在 client/ 集成复杂 | UI 延期 | 简化: 用 D3 散点 + 表格代替 (功能保留, 视觉降级) |

---

## 七、与 v2 的差异

```
v2:  "全行业通用 AI 决策平台"  → v3: "在 verify:intelligence 之上, 补 4 授权源 + 6 账本 + 4 面板 + 4 MCP"
v2:  "FastAPI + Pydantic + 7 Agent"  → v3: "Express + Zod + OpenAI Agents SDK (已运行)"
v2:  "Claude Opus 主力"  → v3: "DeepSeek V4 Pro 主力, Claude 限 5-10%"
v2:  "6 个里程碑 25 天"  → v3: "8 个 P-Block, 4 周内可演示"
v2:  "M0 从 0 设计"  → v3: "M0 已运行 (verify:intelligence), P-Block 1/2 补缺口"
v2:  "04b_M0_DESIGN.md 详设"  → v3: "作废 (栈错, 已删)"
```

---

## 八、版本历史

- **v0.x** (早期): 产链文档体系 v0
- **v1.0** (2026-06-30 早): 服装行业情报工具文档
- **v2.0 / v2.1 / v2.2** (2026-06-30 中): 全行业通用 AI 决策平台 + 多 Agent + 可观测性
- **v3.0** (2026-06-30 晚): **继承已有资产** — 8 P-Block 路线, 对齐真实栈 (Express + Zod + OpenAI Agents SDK)
