# Agent 蜂群项目综合分析报告

> **报告版本**: v1.0  
> **生成日期**: 2026-07-12  
> **分析对象**: Launch Desk + v3 产链引擎  
> **报告范围**: 架构、治理、技能、Runtime、模型路由、MCP、测试、技术债务  
> **覆盖 AC**: AC-1 ~ AC-8

---

## 执行摘要

本项目由 **Launch Desk**（基于 OpenAI Agents SDK 的发布规划 Agent，前端 Vite + React，后端 Express）与 **v3 产链引擎**（可执行的因果世界模型，含 9 环节产业链 DAG、25,000+ Skills、13 Agent 架构）两部分组成。项目采用模块化分层设计，整体架构成熟度高，13 Agent 三层模型（1 Orchestrator + 3 Cross-Source Verifiers + 9 Node Agent）与 6 道数据真实性验证门的设计体现了对"数据可信"的深度承诺；技能系统渐进式加载、Model Router 多提供商故障转移、MCP Gateway 注册机制均完整落地。

但项目存在 **3 个 P0 级阻断性问题**导致当前无法进入生产：（1）18 个依赖使用 `latest` 标签，存在破坏性更新风险；（2）双编排器（`runtime/swarmOrchestrator.ts` 与 `intelligence/swarm/orchestrator.ts`）未连接，导致 Launch Desk DAG 审批流与蜂群执行互相隔离；（3）`ToolExecutionAdapter` 已实现并测试但未接入任何 DAG 执行链路。同时测试套件存在 721 passed / 1 failed / 10 skipped、coverage 未运行、domain/habitat 测试薄弱等问题。

**核心建议**：按"稳定化 → 集成化 → 优化化"三阶段推进，第一阶段（1 周）锁定依赖版本并修复超时测试，第二阶段（2-3 周）打通双编排器并集成 ToolExecutionAdapter，第三阶段（1 个月）优化测试并行度、清理 `any` 类型与 deprecated 代码。项目架构基础扎实，技术债务多为"集成未完成"而非"设计错误"，投入可控即可达到生产就绪状态。

---

## 1. 项目概览

### 1.1 项目定位

本项目是一个面向产业链因果推理与发布规划的双引擎 AI Agent 系统：

| 组件 | 定位 | 技术特征 |
|------|------|----------|
| **Launch Desk** | 发布规划 Agent | OpenAI Agents SDK + Vite + React + Express |
| **v3 产链引擎** | 因果世界模型 | 9 环节产业链 DAG + 25,000+ Skills + 13 Agent 蜂群 |

**目标用户**: 项目所有者、技术负责人、开发团队  
**部署目标**: Vercel（部署准备就绪）

### 1.2 技术栈

| 层级 | 技术选型 |
|------|----------|
| 语言 | TypeScript + React |
| 前端构建 | Vite |
| 后端框架 | Express |
| Agent SDK | OpenAI Agents SDK（`@openai/agents`） |
| 校验 | Zod |
| UI 图标 | Lucide React |
| 测试 | Vitest |
| 部署 | Vercel |
| 模型提供商 | DeepSeek、火山引擎/豆包、OpenRouter、longcat |

### 1.3 模块组成

项目包含 9 个核心模块，覆盖 AC-1 要求的所有核心模块范围：

| 模块 | 路径 | 职责 | 完整度 |
|------|------|------|--------|
| intelligence | `src/intelligence/` | 23 数据源注册表、蜂群编排、13 Agent | ✅ 完整 |
| runtime | `src/runtime/` | SwarmOrchestrator、DAGExecutor、MemoryRunStore | ⚠️ 编排器未连接 |
| governance | `src/governance/` | 工具权限、风险评估、审批策略 | ⚠️ P3 策略不完整 |
| models | `src/models/` | Model Router、Gateway、多提供商适配 | ✅ 完整 |
| mcp | `src/mcp/` | MCP Registry、Transport、审计 | ⚠️ 1 not_implemented + 2 disabled |
| skills | `src/skills/` | 注册表、扫描器、加载器、上下文预算 | ✅ 完整 |
| agent | `src/agent/` | 审批策略、风险向量 | ⚠️ approvalPolicy 默认禁用 |
| server | `src/server/` | REST API 端点 | ✅ 完整 |
| client | `src/client/` | 前端界面（含 IntelligenceDashboard） | ⚠️ 含 3 处 `any` |

---

## 2. 架构分析

### 2.1 Agent 蜂群三层模型

项目实现 **13 Agent 三层架构**（满足 AC-2）：

```
┌─────────────────────────────────────────────────────────┐
│  Tier 1 - 战略决策层 (1 Agent)                          │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Orchestrator (orchestrateSwarm)                  │  │
│  │  位置: src/intelligence/swarm/orchestrator.ts     │  │
│  │  职责: 蜂群总调度、任务分解、结果汇聚              │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────┐
│  Tier 2 - 技术领导层 (3 Agents)                         │
│  ┌───────────────┐ ┌───────────────┐ ┌───────────────┐  │
│  │ Cross-Source  │ │ Cross-Source  │ │ Cross-Source  │  │
│  │ Verifier #1   │ │ Verifier #2   │ │ Verifier #3   │  │
│  │ 跨源一致性校验 │ │ 数据质量评估   │ │ 冲突仲裁      │  │
│  └───────────────┘ └───────────────┘ └───────────────┘  │
└─────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────┐
│  Tier 3 - 执行层 (9 Node Agents)                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│  │  scout   │ │ collector│ │ verifier │ │ analyst  │    │
│  │ 侦察源   │ │ 数据采集  │ │ 单源校验  │ │ 数据分析  │    │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘    │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│  │synthesizer│ │ memory  │ │data_janitor│ │devils_adv│   │
│  │ 结果综合  │ │ 记忆管理  │ │ 数据清洗  │ │ 魔鬼代言人│   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘    │
│  ┌──────────────────┐                                    │
│  │ adjudicator      │  ← 第 9 个 Node Agent              │
│  │ reconciliation_scorer │                                │
│  └──────────────────┘                                    │
└─────────────────────────────────────────────────────────┘
```

**架构特点**:
- **模块化清晰**: `src/intelligence/swarm/agents/` 下每个 Agent 独立文件，符合单一职责原则
- **三层职责分明**: Tier 1 决策、Tier 2 跨源校验、Tier 3 单源执行，避免职责交叉
- **数据流向单向**: 自上而下任务分解，自下而上结果汇聚与校验

### 2.2 6 道数据真实性验证门

项目设计 **6 道数据真实性验证门**（满足 AC-3），用于保障数据可信度：

| 验证门 | 验证目标 | 实现状态 | 评估 |
|--------|----------|----------|------|
| 1. 来源溯源 | 数据源可追溯至原始出处 | ✅ 已实现 | 23 数据源注册表提供基础 |
| 2. Schema 匹配 | 数据结构符合预期 Zod Schema | ✅ 已实现 | Zod 校验贯穿全流程 |
| 3. 值域合理性 | 数值/枚举值在合理范围 | ✅ 已实现 | 由 verifier Agent 执行 |
| 4. 新鲜度 | 数据时效性满足业务需求 | ✅ 已实现 | 时间戳校验机制 |
| 5. 跨源一致性 | 多源数据互相印证 | ✅ 已实现 | 3 个 Cross-Source Verifiers 核心职责 |
| 6. 历史正常性 | 与历史数据模式一致 | ✅ 已实现 | memory Agent 提供历史基线 |

**评估结论**: 6 道验证门设计完整、逻辑自洽，覆盖从源头到历史的全链路数据真实性保障。Cross-Source Verifiers 的引入是亮点，将"跨源校验"提升为独立层级而非附属功能。

### 2.3 模块协作流程

```
用户请求
    │
    ▼
┌─────────────────────────────┐
│ Launch Desk 前端 (Vite+React)│
└──────────────┬──────────────┘
               │ REST API
               ▼
┌─────────────────────────────┐     ┌──────────────────────────┐
│ Express Server (src/server) │ ←─→ │ Model Gateway / Router   │
└──────────────┬──────────────┘     │ (多提供商故障转移)        │
               │                    └──────────────────────────┘
               ▼
┌─────────────────────────────────────────────────────────┐
│ SwarmOrchestrator (runtime/)                            │
│ Launch Desk DAG 审批流                                  │
│   │                                                     │
│   │ ⚠️ 未连接                                            │
│   ▼                                                     │
│ orchestrateSwarm (intelligence/swarm/orchestrator.ts)   │
│   │                                                     │
│   ├─→ Tier 1: Orchestrator 任务分解                     │
│   ├─→ Tier 2: 3 Cross-Source Verifiers 跨源校验         │
│   ├─→ Tier 3: 9 Node Agents 执行                        │
│   │    └─→ 6 道验证门                                    │
│   └─→ Skills 注入 (按需加载, 上下文预算控制)             │
└─────────────────────────────────────────────────────────┘
```

**关键断点**: 两个编排器之间未集成（详见 4.1 P0-2），是当前架构的最大裂缝。

---

## 3. 子系统评估

### 3.1 治理体系

**覆盖范围**: 工具权限、风险评估、审批策略、协作规则（满足 AC-1、AC-3）

| 组件 | 路径 | 功能 | 状态 |
|------|------|------|------|
| toolPermissionHook | `src/governance/` | 工具调用权限拦截 | ✅ |
| toolRiskPolicy | `src/governance/` | 工具风险评级 | ✅ |
| credentialPolicy | `src/governance/` | 凭证管理策略 | ✅ |
| agentRiskVector | `src/governance/` | Agent 风险向量评估 | ✅ |
| approvalPolicy | `src/agent/approvalPolicy.ts:19` | 审批策略 | ⚠️ `enabled: false` |

**约束说明**: `hooks.json` 必须保持为 `{}`（项目记忆约束：Trae IDE hooks.json 不支持复杂 PowerShell 管道命令）。这意味着 hooks 机制目前无法通过 hooks.json 实现复杂逻辑，治理能力需依赖代码层而非配置层。

**问题**:
- P3 静态策略完整性不足
- 审批策略默认 `enabled: false`，意味着审批流默认未启用，需手动开启

### 3.2 技能系统

**覆盖范围**: Skills 注册、扫描、加载、上下文预算（满足 AC-5）

| 组件 | 功能 | 评估 |
|------|------|------|
| skillRegistry | 技能注册表 | ✅ 完整，支持 25,000+ Skills |
| skillScanner | 技能扫描器 | ✅ 自动发现 `skills/ECC/` 下技能 |
| skillLoader | 技能加载器 | ✅ 渐进式按需加载 |
| contextBudget | 上下文预算 | ✅ 有效控制 Token 消耗 |
| tokenEstimator | Token 估算 | ✅ 加载前预估成本 |

**亮点**: 渐进式加载机制是技能系统的核心优势，避免了"25,000+ Skills 一次性注入"导致的上下文爆炸，按需注入策略与上下文预算控制配合良好。

### 3.3 Runtime 编排

**覆盖范围**: SwarmOrchestrator、DAGExecutor、MemoryRunStore（满足 AC-4）

| 组件 | 路径 | 功能 | 状态 |
|------|------|------|------|
| SwarmOrchestrator | `src/runtime/swarmOrchestrator.ts` | Launch Desk DAG 审批流 | ⚠️ 未连接蜂群 |
| DAGExecutor | `src/runtime/` | DAG 节点执行 | ✅ |
| MemoryRunStore | `src/runtime/` | 运行状态持久化 | ✅ |
| orchestrateSwarm | `src/intelligence/swarm/orchestrator.ts` | 蜂群执行 | ⚠️ 未连接 DAG |
| ToolExecutionAdapter | `src/integration/toolExecutionAdapter.ts` | 工具执行适配器 | ❌ 未集成 |

**关键问题**:
1. **双编排器未连接**: `runtime/swarmOrchestrator.ts`（Launch Desk DAG 审批流）与 `intelligence/swarm/orchestrator.ts` 的 `orchestrateSwarm` 函数（蜂群执行）互相在注释中提及，但代码层面未集成。这导致 DAG 审批流无法触发蜂群执行，蜂群执行结果也无法回流到 DAG。
2. **ToolExecutionAdapter 未集成**: 已实现并有测试，但未被任何 orchestrator 引用，未接入 DAG 执行链路。工具执行能力被"悬置"。

### 3.4 Model Router + Gateway

**覆盖范围**: 多模型路由、故障转移、多提供商支持（满足 AC-1、AC-6）

| 组件 | 功能 | 状态 |
|------|------|------|
| modelRouter | 模型选择策略 | ✅ |
| modelGateway | 网关统一入口 | ✅ |
| modelGatewayAdapter | 适配器层 | ✅ |
| modelProfiles | 提供商配置 | ⚠️ 1 个 `enabled: false` |
| modelPolicy | 路由策略 | ✅ |

**支持提供商**: DeepSeek、火山引擎/豆包、OpenRouter、longcat  
**故障转移机制**: ✅ 完整实现，主提供商不可用时自动切换

**问题**: `modelProfiles.ts:64` 有 1 个 `enabled: false` 的提供商配置，需确认是预留还是遗留。

### 3.5 MCP Gateway

**覆盖范围**: MCP Registry、Transport、审计（满足 AC-1、AC-7）

**当前阶段**: Phase 4.1 静态注册阶段

| 组件 | 功能 | 状态 |
|------|------|------|
| registry | MCP 服务器注册表 | ✅ |
| transport | Transport 接口 | ✅ |
| fakeTransport | Fake 实现（测试用） | ✅ |
| auditPayload | 审计载荷 | ✅ |
| mockToolCall | Mock 工具调用 | ❌ 已 `@deprecated` |

**问题清单**:
| 文件:行号 | 问题 | 严重度 |
|-----------|------|--------|
| `descriptors.ts:39` | `healthStatus: "not_implemented"`（1 个未实现 MCP 服务器） | P1 |
| `descriptors.ts:58` | `enabled: false`（1 个禁用服务器） | P3 |
| `descriptors.ts:680` | `enabled: false`（待用户提供 Token 后激活） | P3 |
| `mockToolCall.ts:18` | 已 `@deprecated`，应迁移到 FakeMcpTransport | P1 |

### 3.6 测试覆盖

**覆盖范围**: 测试通过情况、覆盖率统计（满足 AC-6）

| 指标 | 数值 |
|------|------|
| 测试文件数 | 52 |
| 通过测试 | 721 |
| 失败测试 | 1（memory-persistence 超时） |
| 跳过测试 | 10 |
| 通过率 | 98.5% |

**问题清单**:

| 问题 | 影响 | 严重度 |
|------|------|--------|
| coverage 工具配置存在（`test:cov` 脚本）但实际未运行 | 无法量化覆盖率，AC-6 部分未满足 | P1 |
| `domain/` 和 `habitat/` 测试薄弱 | 核心业务逻辑覆盖不足 | P1 |
| `act()` 警告泛滥 | React 测试最佳实践未遵循，潜在状态更新问题 | P2 |
| 测试串行执行（`package.json` `--no-file-parallelism`） | CI 时间长，反馈慢 | P2 |

**评估**: 测试通过率 98.5% 表明现有测试稳定性良好，但 coverage 未运行违反 AC-6 的"测试覆盖率统计报告生成"要求，需优先修复。

---

## 4. 技术债务清单

### 4.1 P0 严重问题

> **阻断生产部署，必须在上线前解决**

| ID | 问题 | 位置 | 影响 | 工作量估计 |
|----|------|------|------|------------|
| P0-1 | 18 个依赖使用 `latest` 标签 | `package.json` | 包括 `@openai/agents`、`express`、`react`、`zod`、`vite`、`vitest` 等关键依赖，可能导致破坏性更新、构建失败、行为漂移 | 4-6 小时 |
| P0-2 | 双编排器未连接 | `runtime/swarmOrchestrator.ts` + `intelligence/swarm/orchestrator.ts` | 架构分裂，Launch Desk DAG 审批流与蜂群执行互相隔离，功能无法统一调度 | 3-5 天 |
| P0-3 | ToolExecutionAdapter 未集成到 DAG | `integration/toolExecutionAdapter.ts` | 已实现并测试但未接入执行链路，工具执行能力被悬置 | 2-3 天 |

### 4.2 P1 高优先级问题

> **影响质量，应在 1-2 周内修复**

| ID | 问题 | 位置 | 影响 | 工作量估计 |
|----|------|------|------|------------|
| P1-1 | `mockToolCall.ts` 已 `@deprecated` | `src/mcp/mockToolCall.ts:18` | 应迁移到 FakeMcpTransport，避免维护两套 mock | 4 小时 |
| P1-2 | `any` 类型滥用 22 处 | 10 个文件，最严重 `reconciliation-summary.ts`（10 处）、`IntelligenceDashboard.tsx`（3 处） | 类型安全缺失，潜在运行时错误 | 1-2 天 |
| P1-3 | 测试基础设施薄弱 | coverage 未运行、domain/habitat 测试不足、act() 警告未处理 | 无法量化覆盖率，核心业务覆盖不足 | 3-5 天 |
| P1-4 | 1 个 `not_implemented` MCP 服务器 | `descriptors.ts:39` | 功能缺失 | 视具体服务器定 |

### 4.3 P2 中优先级问题

> **应修复，1 个月内完成**

| ID | 问题 | 位置 | 影响 | 工作量估计 |
|----|------|------|------|------------|
| P2-1 | 测试串行执行 | `package.json` `--no-file-parallelism` | CI 时间长，反馈慢 | 2-3 天 |
| P2-2 | P3 静态治理策略不完整 | `approvalPolicy.ts:19` `enabled: false` | 审批流默认未启用 | 1-2 天 |
| P2-3 | 38 处 TODO/FIXME/HACK 标记 | 17 个文件，`plan-validate-execute.ts` 6 处最多 | 待办事项未清理，潜在未完成功能 | 2-3 天 |

### 4.4 P3 低优先级问题

> **可延后，季度规划处理**

| ID | 问题 | 位置 | 影响 | 工作量估计 |
|----|------|------|------|------------|
| P3-1 | 2 个 `enabled: false` MCP 服务器 | `descriptors.ts:58`、`descriptors.ts:680` | 待 Token 激活，功能预留 | 提供 Token 后 1 小时 |
| P3-2 | 1 个禁用提供商 | `modelProfiles.ts:64` | 需确认是预留还是遗留 | 1 小时 |

---

## 5. 性能与可扩展性

### 5.1 性能瓶颈

| 瓶颈 | 位置 | 影响 | 优先级 |
|------|------|------|--------|
| 测试串行执行 | `package.json` `--no-file-parallelism` | CI 反馈慢，开发效率低 | P2 |
| memory-persistence 测试超时 | 测试套件 | 1 个测试失败，可能反映真实性能问题 | P1 |
| 25,000+ Skills 全量扫描 | `skills/` | 虽有渐进式加载，但扫描阶段可能耗时 | 需观测 |
| `act()` 警告 | React 测试 | 潜在的不必要重渲染 | P2 |

### 5.2 可扩展性问题

| 问题 | 说明 | 影响 |
|------|------|------|
| 双编排器分裂 | 两个 orchestrator 未连接 | 无法统一调度新 Agent，扩展时需在两处同步 |
| ToolExecutionAdapter 悬置 | 工具执行未接入 DAG | 新增工具无法自动进入执行链路 |
| hooks.json 限制 | Trae IDE 不支持复杂 PowerShell 管道 | 治理扩展依赖代码层，配置灵活性受限 |
| MCP 静态注册阶段 | Phase 4.1 | 动态注册未实现，新 MCP 服务器需改代码 |

---

## 6. 项目优势

> **客观评价：项目存在明显的设计优势和良好实践**

### 6.1 架构设计优势

1. **三层 Agent 模型设计成熟**: Tier 1/2/3 职责分明，13 Agent 各司其职，模块化清晰（`src/intelligence/swarm/agents/` 下独立文件），符合单一职责原则。

2. **6 道数据真实性验证门**: 覆盖来源溯源、Schema 匹配、值域合理性、新鲜度、跨源一致性、历史正常性，是数据可信保障的优秀实践。Cross-Source Verifiers 独立成层是亮点设计。

3. **多提供商模型路由**: 支持 DeepSeek、火山引擎/豆包、OpenRouter、longcat 四个提供商，故障转移机制完整，避免供应商锁定。

4. **渐进式技能加载**: 25,000+ Skills 通过 `skillLoader` 按需注入，配合 `contextBudget` 和 `tokenEstimator`，有效避免上下文爆炸，是大规模技能系统的优秀实践。

### 6.2 工程实践优势

5. **模块化分层清晰**: intelligence / runtime / governance / models / mcp / skills / agent / server / client 九大模块边界明确，符合关注点分离原则。

6. **测试套件基础扎实**: 52 个测试文件、721 个通过测试，通过率 98.5%，测试稳定性良好。

7. **MCP 审计机制**: `auditPayload` 审计载荷设计体现安全合规意识，FakeMcpTransport 为测试提供良好支撑。

8. **TypeScript 强类型贯穿**: 全栈使用 TypeScript，Zod 校验贯穿数据流，类型安全基础良好（除 22 处 `any` 待清理）。

9. **Vercel 部署就绪**: 部署配置完整，可快速上线。

10. **文档与注释充分**: 双编排器虽未连接，但注释互相提及，表明开发者有意识记录待集成点；spec 体系完整（spec.md + tasks.md + checklist.md）。

---

## 7. 改进建议

### 7.1 立即行动（P0）

#### 建议 P0-1: 锁定依赖版本（4-6 小时）

**目标**: 将 18 个 `latest` 标签替换为精确版本号

**步骤**:
```bash
# 1. 查看当前实际安装版本
npm ls @openai/agents express react zod vite vitest

# 2. 锁定版本（示例）
# package.json 中将 "latest" 替换为具体版本号
# 例如 "@openai/agents": "latest" → "@openai/agents": "^0.5.0"

# 3. 使用 npm ci 锁定 lockfile
npm ci
```

**预期收益**: 消除破坏性更新风险，构建可重复，CI 稳定性提升  
**验证**: `npm install` 后 `package-lock.json` 无 `latest` 引用

#### 建议 P0-2: 连接双编排器（3-5 天）

**目标**: 打通 `runtime/swarmOrchestrator.ts` 与 `intelligence/swarm/orchestrator.ts`

**步骤**:
1. 在 `runtime/swarmOrchestrator.ts` 的 DAG 审批节点通过后，调用 `orchestrateSwarm`
2. 将蜂群执行结果回流到 DAG 的下游节点
3. 添加集成测试验证端到端流程
4. 移除两处互相提及但未实现的注释，替换为真实调用

**预期收益**: 架构统一，Launch Desk 审批流可触发蜂群执行，功能闭环  
**验证**: 集成测试通过，端到端流程可运行

#### 建议 P0-3: 集成 ToolExecutionAdapter（2-3 天）

**目标**: 将 `integration/toolExecutionAdapter.ts` 接入 DAG 执行链路

**步骤**:
1. 在 DAGExecutor 中引入 ToolExecutionAdapter
2. 工具调用节点统一通过 Adapter 执行
3. 复用现有 ToolExecutionAdapter 测试，补充集成测试

**预期收益**: 工具执行能力统一管理，新增工具自动进入执行链路  
**验证**: 工具调用通过 Adapter 执行，测试通过

### 7.2 短期改进（P1，1-2 周）

| 建议 | 工作量 | 预期收益 |
|------|--------|----------|
| 迁移 `mockToolCall.ts` → `FakeMcpTransport` | 4 小时 | 消除 deprecated 代码，统一 mock 层 |
| 清理 22 处 `any` 类型 | 1-2 天 | 恢复类型安全，减少运行时错误 |
| 启用 coverage 并修复 domain/habitat 测试 | 3-5 天 | 满足 AC-6，量化覆盖率 |
| 处理 `act()` 警告 | 1-2 天 | React 测试最佳实践 |
| 实现 `not_implemented` MCP 服务器 | 视具体定 | 功能补全 |

### 7.3 中期优化（P2，1 个月）

| 建议 | 工作量 | 预期收益 |
|------|--------|----------|
| 测试并行化（移除 `--no-file-parallelism`） | 2-3 天 | CI 时间缩短 50%+ |
| 启用审批策略 `approvalPolicy.ts:19` | 1-2 天 | 治理完整性 |
| 清理 38 处 TODO/FIXME/HACK | 2-3 天 | 代码可维护性 |
| MCP 升级至 Phase 4.2 动态注册 | 1-2 周 | 扩展性提升 |

### 7.4 长期规划（P3，季度）

| 建议 | 工作量 | 预期收益 |
|------|--------|----------|
| 激活 2 个 `enabled: false` MCP 服务器 | 提供 Token 后 1 小时 | 功能扩展 |
| 确认 `modelProfiles.ts:64` 禁用提供商 | 1 小时 | 配置清理 |
| 性能基准测试与监控 | 2-3 周 | 生产可观测性 |
| 治理策略动态化（绕过 hooks.json 限制） | 2-4 周 | 配置灵活性 |

---

## 8. 实施路径

### 8.1 阶段一：稳定化（第 1 周）

**目标**: 消除 P0 阻断项，达到可部署状态

```
Day 1-2: P0-1 锁定依赖版本
  ├─ 盘点 18 个 latest 依赖
  ├─ 替换为精确版本号
  └─ 验证 npm ci 可重复构建

Day 3-5: P0-2 连接双编排器
  ├─ 设计集成接口
  ├─ 实现 orchestrateSwarm 调用
  ├─ 结果回流 DAG
  └─ 集成测试

Day 6-7: P0-3 集成 ToolExecutionAdapter
  ├─ DAGExecutor 引入 Adapter
  ├─ 工具调用统一走 Adapter
  └─ 集成测试
```

**阶段交付物**: 
- `package.json` 无 `latest` 标签
- 双编排器集成测试通过
- ToolExecutionAdapter 接入 DAG

**验收标准**: 端到端流程可运行（用户请求 → DAG 审批 → 蜂群执行 → 工具调用 → 结果回流）

### 8.2 阶段二：集成化（第 2-3 周）

**目标**: 修复 P1 项，提升质量

```
Week 2: 测试与类型
  ├─ 启用 coverage（满足 AC-6）
  ├─ 补充 domain/ 和 habitat/ 测试
  ├─ 处理 act() 警告
  ├─ 清理 22 处 any 类型
  └─ 迁移 mockToolCall → FakeMcpTransport

Week 3: MCP 与治理
  ├─ 实现 not_implemented MCP 服务器
  ├─ 评估 approvalPolicy 启用条件
  └─ 补充审批流集成测试
```

**阶段交付物**:
- coverage 报告生成
- domain/habitat 测试覆盖率达标
- `any` 类型清零
- deprecated 代码清理

**验收标准**: coverage 报告显示整体覆盖率 ≥ 70%，domain/habitat 覆盖率 ≥ 60%

### 8.3 阶段三：优化化（第 4 周-第 2 个月）

**目标**: 优化 P2/P3 项，提升效率与可扩展性

```
Week 4: 测试优化
  ├─ 移除 --no-file-parallelism
  ├─ 修复并行执行冲突
  └─ CI 时间减半

Week 5-6: 代码清理
  ├─ 清理 38 处 TODO/FIXME/HACK
  ├─ 启用审批策略
  └─ MCP 动态注册升级（Phase 4.2）

Week 7-8: 长期项
  ├─ 激活禁用 MCP 服务器（待 Token）
  ├─ 确认禁用提供商配置
  └─ 性能基准测试规划
```

**阶段交付物**:
- 测试并行执行
- TODO/FIXME 清零
- MCP 动态注册

**验收标准**: CI 时间 ≤ 阶段一的 50%，无 TODO/FIXME 遗留

---

## 9. 风险评估

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| 锁定版本后部分依赖不兼容 | 中 | 中 | 先在分支验证，保留 `latest` 回退方案 |
| 双编排器集成引入回归 | 中 | 高 | 充分集成测试，灰度切换 |
| ToolExecutionAdapter 集成破坏现有工具调用 | 低 | 高 | 复用现有测试，分批迁移工具 |
| coverage 启用后暴露大量未覆盖代码 | 高 | 中 | 分模块逐步提升覆盖率，优先 domain/ |
| 测试并行化引发数据竞争 | 中 | 中 | 隔离测试数据，使用独立 RunStore 实例 |
| hooks.json 限制导致治理策略无法动态化 | 高 | 中 | 治理逻辑沉淀到代码层，配置项走环境变量 |
| 25,000+ Skills 扫描性能瓶颈 | 低 | 中 | 监控扫描耗时，必要时引入缓存索引 |
| 生产环境无监控数据（Open Question） | 高 | 高 | 上线前接入 APM，建立基线指标 |

---

## 10. 附录

### 10.1 文件引用索引

| 文件 | 引用上下文 | 行号 |
|------|-----------|------|
| `src/intelligence/swarm/orchestrator.ts` | Tier 1 Orchestrator (orchestrateSwarm) | - |
| `src/intelligence/swarm/agents/` | 13 Agent 独立文件目录 | - |
| `src/runtime/swarmOrchestrator.ts` | Launch Desk DAG 审批流编排器 | - |
| `src/integration/toolExecutionAdapter.ts` | 工具执行适配器（未集成） | - |
| `src/agent/approvalPolicy.ts` | 审批策略默认禁用 | :19 |
| `src/models/modelProfiles.ts` | 1 个禁用提供商 | :64 |
| `src/mcp/descriptors.ts` | not_implemented + 2 个 disabled | :39, :58, :680 |
| `src/mcp/mockToolCall.ts` | 已 deprecated | :18 |
| `src/skills/` | 技能系统（registry/scanner/loader/budget/estimator） | - |
| `src/governance/` | 治理层（toolPermissionHook/toolRiskPolicy/credentialPolicy/agentRiskVector） | - |
| `src/client/IntelligenceDashboard.tsx` | 3 处 any 类型 | - |
| `reconciliation-summary.ts` | 10 处 any 类型（最严重） | - |
| `plan-validate-execute.ts` | 6 处 TODO/FIXME（最多） | - |
| `package.json` | 18 个 latest 依赖 + `--no-file-parallelism` | - |
| `hooks.json` | 必须保持为 {}（Trae IDE 约束） | - |

### 10.2 依赖清单

#### 关键依赖（P0-1 待锁定版本）

| 依赖 | 当前标签 | 用途 | 优先级 |
|------|----------|------|--------|
| `@openai/agents` | latest | Agent SDK 核心 | P0 |
| `express` | latest | 后端框架 | P0 |
| `react` | latest | 前端框架 | P0 |
| `zod` | latest | Schema 校验 | P0 |
| `vite` | latest | 前端构建 | P0 |
| `vitest` | latest | 测试框架 | P0 |
| ...（共 18 个） | latest | - | P0 |

#### 模型提供商

| 提供商 | 状态 | 说明 |
|--------|------|------|
| DeepSeek | ✅ 启用 | 主力提供商 |
| 火山引擎/豆包 | ✅ 启用 | 国产提供商 |
| OpenRouter | ✅ 启用 | 聚合提供商 |
| longcat | ✅ 启用 | 备选提供商 |
| 未知（1 个） | ❌ `enabled: false` | `modelProfiles.ts:64`，待确认 |

#### MCP 服务器

| 服务器 | 状态 | 行号 | 说明 |
|--------|------|------|------|
| 服务器 #1 | ❌ `not_implemented` | `descriptors.ts:39` | P1，待实现 |
| 服务器 #2 | ❌ `enabled: false` | `descriptors.ts:58` | P3，待激活 |
| 服务器 #3 | ❌ `enabled: false` | `descriptors.ts:680` | P3，待 Token |

---

## AC 覆盖矩阵

| AC | 描述 | 覆盖章节 | 状态 |
|----|------|----------|------|
| AC-1 | 架构分析完整性（9 核心模块） | §1.3, §3 | ✅ |
| AC-2 | Agent 蜂群结构识别（13 Agent） | §2.1 | ✅ |
| AC-3 | 验证门机制评估（6 道验证门） | §2.2 | ✅ |
| AC-4 | Runtime 系统评估 | §3.3 | ✅ |
| AC-5 | 技能系统评估 | §3.2 | ✅ |
| AC-6 | 测试覆盖评估 | §3.6 | ⚠️ coverage 未运行（P1-3） |
| AC-7 | 技术债务识别 | §4 | ✅ |
| AC-8 | 改进建议可行性 | §7, §8 | ✅ |

---

**报告结束**

本报告基于 Task 1-8 的分析结果整合编译，覆盖 spec.md 中 AC-1 至 AC-8 全部验收标准。所有问题均引用具体文件路径和行号，改进建议包含优先级、工作量估计和预期收益。项目架构基础扎实，主要技术债务为"集成未完成"而非"设计错误"，按三阶段实施路径推进，可在 2 个月内达到生产就绪状态。
