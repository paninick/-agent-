# 项目状态记录 (STATE.md)

> **更新日期**：2026-07-11
> **状态**：可运行 - 后端引擎 + 前端面板 + 并行采集 + 超时保护 + 成本追踪（预算守卫+超支中止+UI 指示器+分桶明细）+ DAG 可视化 + NP3 多因子模型路由 + 组件级测试 + E2E 测试 + 性能基准 + ARIA 可访问性 + API 文档

---

## 一、项目定位

**自动化情报蜂群系统** - 面向服装行业供应链情报的多 Agent 采集、验证、分析引擎。

两大子系统：
1. **Launch Desk** - 基于 OpenAI Agents SDK 的发布计划代理，SSE 流式 + DAG 审批工作流
2. **Intelligence Swarm** - 手写 TypeScript 蜂群，6 角色管道，9 个真实数据源采集

### NP3 合并（2026-07-10）

从 `D:/Documents/New project 3` (agent-os-2) 吸收 6 个设计模式，丢弃 4 个 P0 问题实现：
- ✅ 吸收：CostEngine 6 桶记账、WorkflowValidator、InMemoryRegistry 基类、模型定价字段、React Flow DAG 可视化、IntentCompiler
- ❌ 丢弃：DagExecutor（假执行）、McpGateway（伪造身份）、PolicyEngine（NP2 已有 governance/）、NP3 Domain 类型层原样移植

### v3 增量改进（2026-07-10）

**第一批 A-F**（提交 2b41851）：
- **A: IntelligencePanel 组件测试** — 12 个组件级测试（渲染 + fetch mock + cost/intent/budget/collection log/evidence/synthesis 全验证 + 超支视觉状态 + loading 态）
- **B: McpGatewayRegistry 迁移** — 组合 InMemoryRegistry 基类（消除 ad-hoc Map，新增 delete/clear 方法，保留 RegistryResult + 深拷贝 + 校验逻辑完全向后兼容）
- **C: 30s 超时 HTTP 测试** — vi.doMock + vi.resetModules 模拟 reject("swarm_timeout_30s")，验证路由 catch 映射 504
- **D: 前端成本明细展示** — 可折叠成本分桶面板（model/tool/mcp 按比例条形图 + 预算使用率百分比）
- **E: Orchestrator 性能优化** — 预计算 modelTier→ModelProfile Map（消除每步 find() 调用）
- **F: API 文档** — `docs/INTELLIGENCE_SWARM_API_CN.md`（请求/响应/意图/成本/安全/约束完整文档）

**第二批 G-J**（提交 53f6eef）：
- **G: 死代码移除** — McpGatewayRegistry.getTool() 零调用删除
- **H: 成本拆解面板单元测试** — 5 个测试（渲染/值/预算百分比/超支样式/无 costRecord）
- **I: 500 错误路径测试** — 模拟 runLiveSwarm reject 非 timeout 错误 → 验证 500 + "swarm_failed"
- **J: 预算守卫边缘用例** — memory 步骤豁免预算中断 + 无 budget 时不限制执行

**第三批 K-M**（提交 ffaefb9）：
- **K: InMemoryRegistry 基类测试** — `src/tests/services/registry.test.ts`，12 个测试覆盖 register/get/require/list/enabled/delete/clear + 重复 ID 错误 + 重新注册
- **L: McpGatewayRegistry delete/clear 测试** — mcp-registry.test.ts 新增 4 个测试（delete 成功/未找到、clear 清空、删除后重新注册）
- **M: 清理 v2 遗留 Python 脚本** — 移除 12 个 `scripts/*.py`（transmission_engine, cotton_*, chemical_fiber_15pct, export_csv, national_stats_integration, perfect_information_model, regression_analysis）

**第四批 N-S**（提交 bce8fce）：
- **N: 注册表迁移评估** — ProgressiveDisclosureRegistry 语义不匹配（分层加载是核心，无 id/enabled）；SkillRegistry 需重塑类型+改 7 调用方，收益不抵风险。结论：不迁移
- **O: E2E 测试** — `src/tests/http-panel-e2e.test.tsx`，3 个测试：真实 HTTP 服务器 → jsdom 渲染 IntelligencePanel，relay fetch → 采集日志/预算/成本明细/蜂群步骤全链路验证
- **P: 前端可访问性** — IntelligencePanel ARIA 标签：section aria-label、textarea id+aria-required+aria-invalid+aria-describedby、button aria-label+aria-busy、error banner role=alert、loading role=status+aria-live=polite、metrics role=list+listitem
- **Q: 服务层 API 文档** — `docs/API_SERVICES_CN.md`，7 个接口完整文档（InMemoryRegistry、CostEngine、WorkflowValidator、IntentCompiler、ExecutionResult/AppError、McpGatewayRegistry、ModelProfile 定价字段）
- **R: 性能基准** — `src/tests/services/orchestrator-bench.test.ts`，3 个基准：empty records 10ms / 50 records 8ms / registry parse 0.57ms，5s 回归阈值
- **S: vite build 验证** — 生产构建通过（432ms），8 个 chunk（react/xyflow/lucide vendor 分包正常）

**第五批 T-V**：
- **T: 消除 `as any`** — IntelligencePanel 中 `r.role as any` 改为 `r.role`（WorkflowDesigner steps prop 从 `AgentRole[]` 改为 `string[]` 后类型兼容），生产代码零 `as any`
- **U: WorkflowDesigner ARIA** — `role="region" aria-label="工作流 DAG 可视化"`、成本徽章 `aria-label`、ReactFlow `aria-label="蜂群工作流节点图"`、节点详情 `role="status" aria-live="polite"`
- **V: React Error Boundary** — `src/client/ErrorBoundary.tsx`（class 组件 getDerivedStateFromError + componentDidCatch），包裹 `main.tsx` 中的 `<App />`，渲染错误时显示降级 UI + 重试按钮，`.error-boundary-fallback` CSS 样式

### 技术栈（实际代码，非规划）

| 层 | 技术 |
|----|------|
| 后端 | Express + tsx |
| 前端 | React + Vite + lucide-react + @xyflow/react |
| Agent SDK | @openai/agents |
| 验证 | Zod |
| 测试 | Vitest (48 文件, 679 测试) |
| 类型 | TypeScript strict |
| 部署 | Vercel serverless |

> **注意**：项目不使用 LangGraph、Mem0、CrewAI、Milvus。这些是早期规划中的候选方案，从未实际引入。

---

## 二、系统架构

```
HTTP 请求 (POST /api/intelligence/swarm)
  │
  ├─ CostEngine: 创建预算 (maxCostUsd=1.0)
  │
  ├─ Scout: 匹配数据源（同步，无网络）
  │
  ├─ Collector: 并行采集 9 源（Promise.all + 15s 单源超时）
  │   ├─ world-bank (3 指标)
  │   ├─ sec-edgar (GAP CIK 39911)
  │   ├─ eurostat
  │   ├─ ecb-eurofxref
  │   ├─ bls-public-api (CUSR0000SAA)
  │   ├─ fred (需 key)
  │   ├─ us-census-trade (需 key)
  │   ├─ open-supply-hub (需 key)
  │   └─ un-comtrade (需 key)
  │
  ├─ Verifier: 并行验证（Promise.all, 6 门 × N 条证据）
  │   provenance -> schema -> range -> freshness -> cross_source -> historical
  │
  ├─ Analyst: 因果边构建（串行，需全部已验证证据）
  ├─ Synthesizer: 简报生成（串行）
  └─ Memory: 持久化 + 后续任务（串行）
  │
  └─ 每步执行后 -> CostEngine.addCost(modelCost) -> 6 桶 CostRecord
```

### 新增架构层（NP3 合并）

```
src/
├── domain/              ← 桥接类型层（从 NP3 提炼）
│   ├── common.ts        ← ExecutionResult<T>, AppError, RegistryItem
│   ├── cost.ts          ← CostRecord(6桶), CostBudget, CostLineItem
│   └── index.ts
├── services/            ← 跨模块服务（NP3 模式 + NP2 修复）
│   ├── registry.ts      ← InMemoryRegistry<T> 泛型基类
│   ├── cost-engine.ts   ← CostEngine（修复 NP3 P0：预算实际保存）
│   ├── workflow-validator.ts ← SwarmWorkflow 结构校验
│   ├── intent-compiler.ts ← 意图->SwarmTask 编译（服装情报 3 类意图）
│   └── index.ts
```

### 两个 SwarmOrchestrator（命名歧义，已文档化）

| 类 | 路径 | 用途 |
|----|------|------|
| `SwarmOrchestrator` (class) | `src/runtime/swarmOrchestrator.ts` | **Launch Desk** DAG 执行 + 审批门 |
| `orchestrateSwarm` (function) | `src/intelligence/swarm/orchestrator.ts` | **Intelligence Swarm** 6 角色管道 |

两者共享零类型，同名不同物。保留类名以兼容 `server/index.ts`（不可修改约束）。

---

## 三、数据源注册

- **24 个**注册数据源 (`data/intelligence-source-registry.seed.json`)
- **9 个**有工作适配器
- **4 个**需要 API key (FRED, Census, Open Supply Hub, Comtrade)
- **15 个**未实现

API key 从 `process.env` 读取，不硬编码，不日志输出。缺 key 的源 graceful skip。

---

## 四、供应链节点

15 环节服装产业链 DAG (`src/intelligence/analysis/industryPacks/apparel/nodes.ts`)：

```
raw_material -> agri_inputs -> petrochemical -> fiber_exchange -> yarn -> fabric -> accessories
-> design -> manufacturing -> trading_co -> brand -> channel -> consumer -> recycling -> secondhand
```

附加：`trend_signal`（趋势信号）、`competition`（竞争格局）

---

## 五、运行时特性

| 特性 | 状态 |
|------|------|
| 采集并行化 | ✅ Promise.all, 9 源并行 |
| 单源超时 | ✅ 15s AbortController + Promise.race 双保险 |
| HTTP 总量超时 | ✅ 30s, 超时返回 504 |
| Verifier 并行 | ✅ Promise.all, N 条证据并行 |
| 部分失败容忍 | ✅ 单源失败不阻塞其他源 |
| 成本追踪 | ✅ CostEngine 6 桶记账 + 预算守卫（每步 assertWithinBudget，超支中止+UI 红色警示） |
| 工作流校验 | ✅ WorkflowValidator 结构校验 (NP3 合并) |
| 意图编译 | ✅ IntentCompiler 3 类意图 (NP3 合并) |
| DAG 可视化 | ✅ React Flow WorkflowDesigner (NP3 合并) |
| NP3 多因子模型路由 | ✅ 6 因子加权打分：quality/taskFit/reliability/costEfficiency/latency/contextFit + preferredBoost |
| 性能基准 | ✅ orchestrator < 10ms (empty), registry parse < 1ms |
| 生产构建 | ✅ vite build 432ms, 8 chunks 正确分包 |
| 可访问性 | ✅ ARIA 标签：aria-label/aria-required/aria-invalid/aria-busy/role=alert/role=status/role=region/aria-live=polite |
| 错误边界 | ✅ React ErrorBoundary 包裹 App，渲染错误降级 UI + 重试 |
| API 文档 | ✅ INTELLIGENCE_SWARM_API_CN.md + API_SERVICES_CN.md |
| API key 安全 | ✅ process.env, 不日志 |
| 无数据库 | ✅ MemoryStore 进程内 Map |
| 无登录系统 | ✅ |
| 无新增外部服务 | ✅ |

---

## 六、测试

| 范围 | 文件数 | 测试数 | 状态 |
|------|--------|--------|------|
| 情报引擎核心 | 8 | 168 | ✅ 全绿 |
| NP3 合并服务（含 cost-engine, registry, bench） | 6 | 49 | ✅ 全绿 |
| WorkflowDesigner | 1 | 5 | ✅ 全绿 |
| HTTP 路由 (intelligence) | 1 | 9 | ✅ 全绿 |
| 前端 UI（含 IntelligencePanel 组件 + E2E + ErrorBoundary） | 6 | ~78 | ✅ |
| Launch Desk 运行时 | 6 | ~60 | ✅ |
| MCP 注册表 | 1 | 25 | ✅ 全绿 |
| 其他 (model/mcp/skill/release) | ~16 | ~285 | ✅ |
| **合计** | **48** | **679** | ✅ 全绿 |

```bash
# 快速验证
npx tsc --noEmit
npx vitest run src/tests/intelligence.test.ts src/tests/services/ src/tests/workflow-designer.test.tsx

# 仿真脚本（真实网络，含意图编译+成本追踪+预算守卫）
npx tsx scripts/simulate-live-swarm.ts
```

---

## 七、已知技术债

| 优先级 | 问题 | 影响 |
|--------|------|------|
| LOW | `AuthFlag` (4 级 legacy) vs `AuthenticityFlag` (3 级 new) 并存 | 不影响运行，`scoreToFlag` 和 `scoreToAuthenticityFlag` 各有调用方 |
| LOW | `Range`/`FreshnessConfig` 从 3 处重导出 | 不影响运行，冗余但无冲突 |
| LOW | `validation/` 重导出 `agents/validators.ts` | 门面模式，上层统一入口 |
| INFO | ✅ 注册表迁移评估完成 | McpGatewayRegistry 已组合迁移；ProbeRegistry 已迁移；ProgressiveDisclosureRegistry 语义不匹配（无 id/enabled，分层加载是核心）；SkillRegistry 需重塑类型+改 7 个调用方，收益不抵风险；sourceRegistry/phaseRegistry 是函数模块非 Map 类 |
| INFO | `evidence-graph.ts` 仅被 `verify-intelligence-sources.ts` 调用 | 非孤儿，类型被 confidence-engine/conflict-detection 使用 |
| INFO | `spine/types.ts` (488行) 与 `types.ts` 分裂 | 类型太多但无冲突 |
| INFO | `domain/` 与 `runtime/types.ts` 的 `ExecutionResult`/`RunStoreResult` 独立共存 | 不同形状（data vs value），不冲突 |

---

## 八、前端状态

- `IntelligencePanel.tsx` (460行) - 情报蜂群面板（含成本/预算展示+超支警示 + 意图编译结果 + 工作流图）
- `WorkflowDesigner.tsx` (180行) - React Flow DAG 工作流可视化 (NP3 合并，含 ARIA)
- `ErrorBoundary.tsx` - React 错误边界（包裹 App，渲染错误降级 UI）
- `main.tsx` - Tab 切换 (Launch Desk / Intelligence Swarm)，ErrorBoundary 包裹
- `styles.css` - 暗色主题 + 情报面板样式 + React Flow 主题覆盖 + 错误边界降级 UI
- `docs/FRONTEND_DESIGN_SPEC.md` (1210行) - AI Studio 前端重构规格

---

## 九、项目约束（仍生效）

- 不可以付费，无额度则提醒
- API key 只从 `process.env` 读
- 不改 `src/server/index.ts` 现有端点
- 不改 Launch Desk approval / SSE / UI
- 不新增 npm 依赖（除非必要并说明）— 已新增 `@xyflow/react`（MIT 免费，DAG 可视化必需）
- 不接数据库
- 不新增外部服务
- 不做登录系统
- 真实 key 存 `.env.local`，不入 git

---

## 十、恢复指南

```bash
cd "D:/Documents/New project 2"

# 安装依赖
npm install

# 启动后端
npm run dev:server

# 启动前端
npm run dev:web

# 运行测试（全套，需 8GB heap）
NODE_OPTIONS="--max-old-space-size=8192" npm test

# 快速验证（核心模块）
npx vitest run src/tests/intelligence.test.ts src/tests/services/ src/tests/workflow-designer.test.tsx src/tests/mcp-registry.test.ts

# 生产构建验证
npx vite build

# 仿真脚本
npx tsx scripts/simulate-live-swarm.ts
```

**关键文件**：
- 入口：`src/server/index.ts`
- 情报引擎：`src/intelligence/`
- 采集桥：`src/intelligence/collection/live-collector.ts`
- 蜂群编排：`src/intelligence/swarm/orchestrator.ts`
- 端到端：`src/intelligence/swarm/live-swarm.ts`
- 成本引擎：`src/services/cost-engine.ts`
- 注册表基类：`src/services/registry.ts`
- 模型路由策略：`src/models/modelPolicy.ts` (NP3 6 因子加权打分)
- 工作流校验：`src/services/workflow-validator.ts`
- 意图编译：`src/services/intent-compiler.ts`
- DAG 可视化：`src/client/WorkflowDesigner.tsx`
- 前端面板：`src/client/IntelligencePanel.tsx` (含 ARIA 可访问性)
- 前端：`src/client/`
- API 文档：`docs/API_SERVICES_CN.md`, `docs/INTELLIGENCE_SWARM_API_CN.md`
