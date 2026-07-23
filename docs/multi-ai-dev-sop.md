# Multi-AI 开发 SOP（7 角色 RACI + 9 阶段门禁）

> **⚠️ DEPRECATED · 2026-07-02**
>
> 本 SOP 的 RACI + 9 门禁框架**已被 `obra/superpowers` 14 件完全覆盖**。v3 启动任何任务时应改用：
>
> ```
> /skill using-superpowers            # 任何任务开始（meta 入口）
> /skill brainstorming               # 任何写代码/设计前
> /skill writing-plans                # 多步任务
> /skill test-driven-development      # 写代码
> /skill systematic-debugging         # 任何 bug
> /skill verification-before-completion  # 任何"完成"声明
> /skill requesting-code-review      # PR 评审
> /skill executing-plans             # 写好的 plan 执行
> ```
>
> superpowers 已 git clone 到 `skills/superpowers/`，可直接装入 v3 任务流。
>
> **保留原因**：本文件 §一 7 角色（需求/主理/产品/架构/工程/QA/审计）仍可作为 v3 Owner 角色分工参考。
>
> **不要做**：(1) 不要再基于本文档设计新流程；(2) 不要把本文档作为审计依据。


> **更新日期**：2026-07-01
> **目的**：在多 AI 模型协作（DeepSeek / MiMo / GLM / Kimi / Codex / Claude / Gemini）下，避免"谁都能改任何文件"造成的责任分散
> **覆盖范围**：v3 产链引擎所有 8 个 P-Block + 未来扩展

---

## 一、7 角色 RACI 矩阵

> **关键澄清**：这里的"7 角色"是**开发流程角色**，与 `产链引擎/03_AGENT_SOP.md` 中数据流的 7 个 Agent（Collector/Cleaner/...）**命名空间独立**，不要混淆。

| 角色 | 真实职责 | 产出 | 禁止 |
|---|---|---|---|
| **需求提出人**（Owner） | 业务目标 / 用户场景 / 约束 | 原始需求 + 优先级 | 不直接分头指挥 AI |
| **主理人**（Coordinator） | 统一调度 AI / 推进流程 | 项目计划 + 任务池 + 风险看板 | 不跳过需求直接堆代码 |
| **产品 AI**（Product AI） | 输出 PRD / 验收标准 | PRD + 需求池 + 用户故事 | 不擅自扩大范围 |
| **架构 AI**（Architecture AI） | 模块边界 / 接口 / 数据模型 | 架构文档 + 接口规范 + Schema | 不直接堆业务代码 |
| **工程 AI**（Engineering AI） | 按任务实现 | 源码 + 单元测试 + commit | 不跨模块乱改 / 不改 schema |
| **QA AI**（QA AI） | 功能 / 边界 / 异常 / 契约测试 | 测试报告 + 缺陷清单 | 不只跑 happy path |
| **审计 AI**（Audit AI） | 一致性 / 架构 / 巨石化 / 安全 | 审计报告 + 风险清单 | 不代替工程 AI 重写 |

### R/A/C/I 责任分配（v3 当前任务）

| 任务类型 | R（执行） | A（问责） | C（咨询） | I（知情） |
|---|---|---|---|---|
| 新增 P-Block | 工程 AI | 主理人 | 架构 AI / 产品 AI | 需求提出人 / 审计 AI |
| 改 schema | 架构 AI | 主理人 | 工程 AI / QA AI | 需求提出人 / 审计 AI |
| 修 bug | 工程 AI | 主理人 | QA AI | 审计 AI |
| 出报告 | QA AI / 工程 AI | 主理人 | 审计 AI | 需求提出人 |
| 上线决策 | 主理人 | 需求提出人 | 审计 AI / 工程 AI | 全部 |

---

## 二、9 阶段门禁

| 阶段 | 门禁 | 不通过的后果 |
|---|---|---|
| **G0 需求接收** | 5 句话 / 目标用户 / 成功标准 | 不能进入 G1 |
| **G1 PRD 定义** | 8 字段（背景 / 目标 / 用户 / 场景 / 边界 / KPI / 风险 / 反证）| 不能进入 G2 |
| **G2 架构设计** | 9 接口 / 8 数据模型 / 防巨石化 7 指标 | 不能进入 G3 |
| **G3 任务拆解** | 51 任务 / 9 字段上下文包（任务 ID / 阶段 / 角色 / 输入 / 输出 / 模型 / 验收 / 阻塞 / 防返工） | 不能进入 G4 |
| **G4 工程实现** | 5 大质量门（build / lint / typecheck / test ≥80% / contract）+ 7 防巨石化 | 不能进入 G5 |
| **G5 QA 验证** | 边界用例 / 契约 / 安全 / 性能 | 不能进入 G6 |
| **G6 审计治理** | P0 阻断 / 7 审计维度 / 一致性 / 凭证审计 | 不能进入 G7 |
| **G7 交付确认** | 可运行 / 可验证 / 已知问题透明 | 不能进入 G8 |
| **G8 迭代变更** | 变更单 / 影响范围 / 回滚方案 | 不能进入下一轮 |

### 2.1 7 个防巨石化硬指标（不可妥协）

```
单文件行数     > 800 行 → P0 阻断 / > 500 行 → P1 整改
单函数行数     > 120 行 → P0 阻断 / > 80 行 → P1 整改
圈复杂度       > 20 → P0 阻断 / > 12 → P1 整改
参数数量       > 8 → P0 阻断 / > 5 → P1 整改
嵌套深度       > 5 → P0 阻断 / > 3 → P1 整改
单模块文件数   > 40 → P0 阻断 / > 25 → P1 整改
循环依赖       任意 → P0 阻断
```

### 2.2 5 大质量门（G4 通过条件）

| 门 | 命令 | 通过条件 |
|---|---|---|
| build | `npm run build` | 0 错误 |
| lint | `npm run lint` | 0 错误 |
| typecheck | `npm run typecheck`（= tsc --noEmit）| 0 错误 |
| test | `npm test -- --coverage` | 行覆盖 ≥ 80%，关键路径 100% |
| contract | OpenAPI / Zod 一致性 | 0 差异 |

---

## 三、模型分工（与 `AI_MODEL_ROUTING_PLAN_CN.md` 配套）

| 任务类型 | 主模型 | 备 |
|---|---|---|
| 接口 / 类型 / skeleton | GLM-4.7 | MiMo V2.5 |
| 核心逻辑 / 算法 / state machine | DeepSeek V4 Pro | Codex |
| 简单任务 / 单元测试 / 数据搬运 | MiMo V2.5 | GLM-4.7 |
| 长 prompt / 长 PDF 解析 | Kimi K2.7-code | DeepSeek |
| 反证机制 / 复杂 schema / TS discriminated union | Codex | DeepSeek |
| 多模态（PPT / 图文 / 视频） | Gemini Pro 2.5 | — |
| 最终架构审查 | Claude Opus 4.8 | — |
| Reasoner / Devil 异源 | 一用 Claude Opus 一用 DeepSeek | — |

### 3.1 强制异源规则

**Reasoner 与 Devil's Advocate 必须用不同厂商的模型**。原因：同源模型无法真正对抗自己的输出，会变成"自我背书"。

当前默认组合：
- Reasoner = DeepSeek V4 Pro
- Devil's Advocate = Claude Opus 4.8（异源）

---

## 四、命名 / 编码 / 提交规范

### 4.1 命名

```
文件名         snake_case
类名           PascalCase
函数 / 变量    snake_case
常量           UPPER_SNAKE_CASE
接口           I 前缀 + PascalCase
Prompt 模板    UPPER_SNAKE_CASE
分支名         <type>/<scope>（如 feat/official-apis）
```

### 4.2 提交

```bash
git commit -m "[<model_name>] <type>(<scope>): <subject>
<body>
<footer>"

# 示例
[deepseek] feat(official-apis): add FRED adapter for PCOTTINDUSDM series
[claude] test(reasoner): add Devil's Advocate异源 test cases
[mimo] docs(readme): update MVP-0 quick start
```

### 4.3 API 凭证

```typescript
// 全部用 ENV 占位, 不写明文
const apiKey = process.env.UN_COMTRADE_API_KEY ?? "${UN_COMTRADE_API_KEY}";
```

> **唯一真源**：`docs/产链引擎/02_DATA_SOURCE_REGISTRY.md §顶部 ENV 变量名统一表`

---

## 五、9 阶段 + RACI 交叉矩阵（执行表）

| 阶段 | 需求提出人 | 主理人 | 产品 AI | 架构 AI | 工程 AI | QA AI | 审计 AI |
|---|---|---|---|---|---|---|---|
| G0 | R | A | C | C | I | I | I |
| G1 | C | A | R | C | I | I | I |
| G2 | C | A | C | R | I | I | C |
| G3 | I | A | C | C | R | C | I |
| G4 | I | A | I | C | R | C | I |
| G5 | I | A | I | I | C | R | C |
| G6 | I | A | I | C | C | C | R |
| G7 | R | A | C | C | C | C | C |
| G8 | C | A | C | C | R | C | C |

---

## 六、与现有文档的关系

```
本 SOP 是 STATE.md §十二 "7 角色 RACI" 的完整落地
本 SOP 是 STATE.md §十三 "9 阶段门禁" 的执行规范
本 SOP 是 PROJECT_HANDBOOK.md §6 "命名/编码/提交规范" 的统一入口
本 SOP 是 AI_MODEL_ROUTING_PLAN_CN.md §6 "任务路由矩阵" 的开发场景映射

不替代：
- 产链引擎/03_AGENT_SOP.md — 那是数据流的 7 个 Agent SOP
- INTELLIGENCE_VERIFICATION_RUNBOOK_CN.md — 那是情报管线验证 Runbook
```

---

**版本 v1.0 · 2026-07-01 · 多 AI 协作唯一入口**
