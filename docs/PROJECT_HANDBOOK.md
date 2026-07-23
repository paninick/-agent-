# v3 项目手册（PROJECT_HANDBOOK）

> **⚠️ 部分章节 DEPRECATED · 2026-07-01**
>
> 本文档是 v0-v2 阶段的项目总览，**部分章节已与 v3 实际状态不一致**。
>
> | 章节 | 状态 | 真实出处 |
> |---|---|---|
> | **§〇 阅读者** | ✅ 仍有效 | — |
> | **§一 项目总览** | 🟠 1.1 技术栈描述（LangGraph/Mem0/CrewAI）已与 v3 TS 栈不一致 | `docs/产链引擎/00c_RESTART_PLAN_v3.md §三`（Express + Zod + OpenAI Agents SDK） |
> | **§二 5 个 AI 模型分工** | 🟠 GLM/DeepSeek/MiMo/Kimi/Codex 模型名仍可参考，但主力路由已变 | `docs/AI_MODEL_ROUTING_PLAN_CN.md §6 任务路由矩阵` |
> | **§三 多平台协作** | 🟠 Anthropic/OpenAI/Google 平台描述仍可参考；方舟 + 本地 Ollama 仍是主线 | `docs/AI_MODEL_ROUTING_PLAN_CN.md` |
> | **§四 4 周迭代路径** | 🔴 与 v3 8 P-Block 不一致 | `docs/产链引擎/00c_RESTART_PLAN_v3.md §四 8 P-Block` |
> | **§五 详细任务清单** | 🔴 T1.1-T1.5 任务编号与 v3 不对应 | 同上 |
> | **§六 命名/编码/提交规范** | ✅ 仍有效，可作 multi-ai-dev-sop 的旁证 | `docs/multi-ai-dev-sop.md §四` |
> | **§七 风险与回退** | 🟠 部分仍在 v2 假设 | 应根据 v3 8 P-Block 重写 |
> | **§八 4 周验收** | 🔴 与 v3 verification-latest.json 实测对齐 | `outputs/intelligence/verification-latest.json` |
> | **§九 真实第一步** | 🔴 描述 v2 Python 栈（pip install langgraph） | 当前栈：`npm install && npm run verify:intelligence` |
> | **§十 上线标准** | 🟠 Week 4 上线标准仍可参考 | `docs/产链引擎/00c_RESTART_PLAN_v3.md §八` |
> | **§十一 跨 AI 协作** | 🟠 平台协作机制仍可参考 | `docs/AI_MODEL_ROUTING_PLAN_CN.md` |
> | **§十二 5 个模型约束** | 🟠 "GLM 不写真实 API Key" 等约束仍正确 | `docs/multi-ai-dev-sop.md §三` |
> | **§十三 prompt 模板** | 🔴 含"写真实 API Key"与 §十二矛盾 + v3 已实现自动化 | 应按 `scripts/verify-intelligence-sources.ts` 真实结构重写 |
> | **§十四 新人第一天指南** | 🟠 仍可参考流程，具体步骤应改 | `V3-README.md` |
> | **§十五 真实案例 Day 1** | 🔴 描述 Python PR 而非 TS verify:intelligence | 当前真值：`outputs/intelligence/verification-latest.json` |
> | **§十六 4 周视觉化** | 🟠 仍可参考节奏 | `docs/产链引擎/00c_RESTART_PLAN_v3.md §四` |
> | **§十七 最终一句话** | 🟠 一句话仍精准 | — |
> | **附录 A 速查表** | 🟠 速查可参考，主力模型细节应改 | `docs/multi-ai-dev-sop.md §三 + 附录` |
>
> **建议使用方式**：把本文件当 v2 历史参考，**不作为 v3 实施依据**。v3 实施请直接读：
> - `V3-README.md` — v3 项目入口
> - `docs/产链引擎/00c_RESTART_PLAN_v3.md` — v3 当前真实路径
> - `docs/multi-ai-dev-sop.md` — 7 RACI + 9 门禁
> - `outputs/intelligence/verification-latest.json` — 真值 ground truth（最近一次跑于 2026-06-30）

> **版本**：v1.0
> **更新日期**：2026-07-01
> **项目全称**：v3 产链引擎 — 全产业链因果推导 + Agent 智能路由系统
> **服务对象**：服装工贸企业（针织为主，对日/欧美/中高端女装 ODM/OEM）
> **目标用户**：4 角色（老板 / 销售总监 / 采购经理 / 生产厂长）+ 系统运维
> **测试对象**：南通富泉工贸（100-200 人，4 车间，对日出口 ODM/OEM 为主）
> **副项目代号**：MVP-0（4 周可跑通的真实商业 demo）

---

## 〇、这份文档给谁看

| 阅读者 | 必读章节 | 选读章节 |
|---|---|---|
| 新加入的 AI 模型（GLM/DeepSeek/MiMo/Kimi/Codex/Gemini Pro）| 全文 | — |
| 新加入的开发者（任何平台）| 第一/二/三/六/十章 | 4/5/7/8/9 |
| Owner（产品方）| 第一/二/四/十一章 | 3/5/6/7 |
| Agent 平台运营（如火山方舟 / Anthropic / OpenAI 团队）| 第四/六/十/十一章 | 2/3/5 |

---

## 一、项目总览

### 1.1 一句话定位

> **v3 = 用 LangGraph + Mem0 + CrewAI + MCP 的"7 角色 Agent 智能路由引擎"，给中小服装工贸企业（南通富泉工贸为代表）提供"老板早上 8 点能看到决策建议、销售能看客户动态、采购能看原料价、生产能看车间排程"的真实可用情报系统。**

### 1.2 核心价值（4 角色 × 5 价值）

| 角色 | 真实痛点 | v3 解决 |
|---|---|---|
| 老板 | 5 月接单掉了 33%，不知道原因，不知道怎么办 | 30 秒内看到 3 个真实原因 + 3 个方案 + 1 个推荐 |
| 销售 | 客户在不在砍单不知道，新客户在哪不知道 | 实时看到 50 客户健康度排序 + 接触决策人路径 |
| 采购 | 棉花涨了 3.8%，该囤不该囤不知道 | 自动计算传导率 + 给出囤料建议 |
| 生产 | B 车间良品率掉了，不知道是培训问题还是工艺 | 1 句话给出根因 + 停线 vs 续产建议 |

### 1.3 不做什么（明确的边界）

| 不做 | 原因 |
|---|---|
| 不接 ERP/MES/WMS | 中小工贸企业没有这些系统（Excel + 微信群 + 手写单据） |
| 不订阅蝉妈妈/抖音罗盘 SaaS | 中小工贸预算 < ¥500/月 SaaS 费 |
| 不抓取需登录的 SaaS 数据 | 合规风险（ToS 限制） |
| 不接富泉的客户内部数据 | 客户隐私 + 商业机密 |
| 不写真实实现代码 | 设计归设计，实现归 GLM/DeepSeek |
| 不写真实 API Key / endpoint | 安全约束，全部用 `${ENV_VAR}` 占位 |

### 1.4 真实工作目录

```
D:\Documents\New project 2\            ← v3 主项目根
├── docs\                              ← 文档
│   ├── PROJECT_HANDBOOK.md (本文件)
│   ├── 产链引擎\ (14 份)
│   └── 其他 4 份
├── src\
│   ├── intelligence\                  ← 9 个 .ts (已读)
│   ├── client\                        ← main.tsx (9 页面)
│   ├── server\                        ← index.ts
│   ├── agent\                         ← 空（待建）
│   ├── mcp\                           ← 空（待建）
│   └── triggers\                      ← 空（待建）
├── data\
│   ├── intelligence-source-registry.seed.json  ← 23 源注册表
│   └── ...
├── outputs\intelligence\verification-latest.json  ← 已跑通的产物
├── scripts\verify-intelligence-sources.ts
├── v3-mvp-0\                          ← Week 1 副项目（Python）
│   ├── src\
│   ├── data\
│   └── README.md
└── pyproject.toml                     ← v3-mvp-0 依赖
```

---

## 二、5 个 AI 模型分工

### 2.1 5 个模型 + 1 个多模态 = 6 个角色

| 模型 | 真实能力 | v3 任务类型 | 单价（估算）| 真实用途 |
|---|---|---|---|---|
| GLM-4.7 / GLM-5.2 | 中文强 + 推理中等 + 快 + 便宜 | 接口/类型/skeleton 编写 | ¥0.001/1K token | 写骨架（件 1-3 + 件 11-15）|
| DeepSeek V4 Pro | 推理强 + 中文好 + 代码好 + 速度中等 | 核心逻辑 + 算法 + Reasoner/Devil | ¥0.005/1K token | 写核心（件 4-6 + 件 16-18）|
| MiMo V2.5 / V2.7 | 推理中等 + 中文好 + 极快 + 极便宜 | 简单任务 + 数据搬运 + 单元测试 | ¥0.0005/1K token | 写测试（件 7-8 + 件 19）|
| Kimi K2.6 / K2.7-code | 长文本 + 思考强 + 中文 | 长 prompt + 总结 + PDF 解析 | ¥0.003/1K token | 写 Reasoner prompt + PDF 解析 |
| Codex（OpenAI）| 代码强 + 英文好 | 反证机制 + 复杂 schema + TypeScript | $0.01/1K token | 写反证 + TypeScript 复杂 |
| Gemini Pro | 多模态强 + 长 context | 多模态（PPT/图文/视频）| $0.005/1K token | 写多模态 agent |

### 2.2 模型路由总规则

| 规则 | 真实原因 |
|---|---|
| 单任务最多 2 个模型 | 不要 3 个以上 = 责任分散 = 返工 |
| Reasoner/Devil 必须异源 | 之前 Devil's Advocate SOP 强制（同源偏见 = 不可信）|
| 简单任务用 MiMo | 搬运 / 测试 / 字段映射 = 快 + 便宜 |
| 复杂任务用 DeepSeek Pro 或 Codex | 核心逻辑 = 强推理 |
| 多模态用 Gemini Pro | Vision + 长 context |
| 长 prompt 用 Kimi | 长文本处理 + 思考 |
| 跨平台 fallback | 任一模型不可用 = 自动切下一个 |

### 2.3 5 个模型在 4 周的真实工作量

| 模型 | Week 1 | Week 2 | Week 3 | Week 4 | 合计 |
|---|---|---|---|---|---|
| GLM-4.7 | Day 1-7（骨架）| Day 8-14（记忆+场景）| Day 22-26（Skills）| ~50% | 40% |
| DeepSeek V4 Pro | Day 1-6（核心）| Day 8-14（验证）| Day 18-19（经济）| ~30% | 25% |
| MiMo V2.5 | Day 1-7（测试）| Day 11-12（场景）| Day 20-21（场景）| ~20% | 15% |
| Kimi K2.7-code | Day 1（prompt）| Day 11-12（场景）| — | ~10% | 5% |
| Codex | Day 4（Devil）| — | Day 15-17（crew）| Day 22-24（MCP）| ~25% | 10% |
| Gemini Pro | — | — | — | Day 27-28（多模态）| ~5% | 5% |

---

## 三、多平台协作机制

### 3.1 真实协作平台

| 平台 | 真实能力 | 适合任务 | 真实成本 |
|---|---|---|---|
| 火山方舟 Agent Plan | 14 个模型 + 4 MCP + 数据集 | DeepSeek / Doubao / GLM / Kimi | ¥200/月 Medium |
| Anthropic API | Claude Opus 4.8 + Sonnet 4.6 | Reasoner / 复杂推理 | 按 token |
| OpenAI API | GPT-4o / Codex | Codex 反证 + TypeScript | 按 token |
| Google AI Studio | Gemini Pro 2.5 | 多模态 | 按 token |
| 本地 Ollama | 开源小模型 | 单元测试 + 数据搬运 | 0 |
| GitHub | 代码托管 + PR 评审 | 协作 | 0 |
| Obsidian | 本地知识库 | 文档 | 0 |

### 3.2 多平台协作的真实机制

```
[v3 主项目]
  D:\Documents\New project 2\         ← 本地 / GitHub
  ↓
[平台 1: 火山方舟]
  DeepSeek V4 Pro / Doubao / GLM / Kimi
  ↓ 写核心 + 长 prompt + 数据搬运
[平台 2: Anthropic]
  Claude Opus 4.8 / Sonnet 4.6
  ↓ 写 Reasoner + 复杂推理
[平台 3: OpenAI]
  Codex / GPT-4o
  ↓ 写 Devil 反证 + TypeScript 复杂
[平台 4: Google AI]
  Gemini Pro 2.5
  ↓ 写多模态（PPT/图文/视频）
[本地 Ollama]
  Qwen / Llama
  ↓ 跑测试 + 简单任务
[Obsidian]
  本地知识库
  ↓ 写文档
```

### 3.3 多平台的真实"交接"机制

| 交接维度 | 真实方式 |
|---|---|
| 代码交接 | GitHub PR + commit message（必须标 model name）|
| 数据交接 | evidence_cards.jsonl 共享（v3 主项目有）|
| 测试交接 | pytest 测试套件在 GitHub Actions 跑 |
| 文档交接 | Obsidian 同步 + GitHub wiki |
| API 凭证 | 全用 `${ENV_VAR}` 占位，本地 `.env` 不提交 |
| 任务进度 | GitHub Issues + 任务看板 |

### 3.4 多平台协作的真实约束

| 约束 | 真实原因 |
|---|---|
| 凭证隔离 | 平台 A 的 key 绝不发到平台 B |
| 任务隔离 | 同一任务不跨 2 个以上平台（防止责任分散）|
| 接口一致 | 跨平台代码用同一接口（v3 主项目 9 个 .ts 的接口）|
| 数据统一 | evidence_cards.jsonl 跨平台共享 |
| 命名一致 | 跨平台用统一命名（state / agent_id / next_node）|

---

## 四、4 周迭代路径（真实可跑）

### 4.1 4 周真实可跑路径

| 周 | 真实可跑 | 真实有效 |
|---|---|---|
| Week 1 | 1 个 working demo（LangGraph 5 角色 + 1 个 mock）| 老板能问"5 月接单"看到 3 方案 |
| Week 2 | + Mem0 长期记忆 + 4 真实场景 + 1 个企业源 | 老板能问 4 个问题 |
| Week 3 | + CrewAI 蜂群 + 经济系统雏形 | 老板能多角色用 + agent 业绩可见 |
| Week 4 | + MCP + Skills + 多模态 | 老板能用月度 PPT |

**真实 4 周 = ~2515 行 Python + 6 个模型分工 + 真实可商业**

### 4.2 Week 1 详细任务（4 小时 → 1 周 → MVP-0 → MVP-1）

#### Day 1（4 小时）= MVP-0 demo

| 任务 | 文件 | 模型 | 行数 | 验收 | 防返工 |
|---|---|---|---|---|---|
| T1.1 LangGraph state graph 骨架 | src/graph.py | DeepSeek V4 Pro | ~30 | import 无错 | 命名 agent_id snake_case |
| T1.2 5 个 node function 骨架 | src/nodes.py | GLM-4.7 | ~80 | 5 个 node 各自有 __name__ | TypedDict 状态 |
| T1.3 mock 数据 | data/orders.json | MiMo V2.5 | 1 JSON | 5 客户 × 2 月 × 4 字段 | ISO 8601 |
| T1.4 Reasoner prompt 模板 | src/prompts.py | Kimi K2.7-code | ~10 | JSON 输出 | 5 步因果 DAG |
| T1.5 main 启动入口 | src/main.py | MiMo V2.5 | ~10 | python -m v3-mvp-0 "问题" 跑通 | argparse + loguru |

#### Day 2 = 加 Cotlook A 真实数据

| 任务 | 文件 | 模型 | 行数 |
|---|---|---|---|
| T2.1 Cotlook A 爬取 | src/fetchers/cotlook.py | GLM-4.7 | ~30 |
| T2.2 6 月接单数据 | data/orders.json 更新 | MiMo V2.5 | 1 JSON |
| T2.3 6 月 demo | 测试 | DeepSeek V4 Pro | 0 |

#### Day 3 = 4 触发层雏形

| 任务 | 文件 | 模型 | 行数 |
|---|---|---|---|
| T3.1 trigger 函数 | src/triggers/level-0.py | GLM-4.7 | ~20 |
| T3.2 trigger 接入 state graph | src/graph.py 修改 | DeepSeek V4 Pro | ~10 |
| T3.3 1 个简单调度 | src/scheduler/cron.py | MiMo V2.5 | ~20 |

#### Day 4 = 反证机制（Devil 异源）

| 任务 | 文件 | 模型 | 行数 |
|---|---|---|---|
| T4.1 Devil node | src/nodes.py 修改 | Codex（异源）| ~30 |
| T4.2 Devil 接入 graph | src/graph.py 修改 | DeepSeek V4 Pro | ~10 |
| T4.3 反证测试 | tests/test_devil.py | MiMo V2.5 | ~20 |

#### Day 5 = Mem0 episodic memory

| 任务 | 文件 | 模型 | 行数 |
|---|---|---|---|
| T5.1 Mem0 集成 | src/memory/store.py | GLM-4.7 | ~20 |
| T5.2 自动写 episodic | src/main.py 修改 | DeepSeek V4 Pro | ~15 |
| T5.3 自动读 episodic | src/nodes.py 修改 | DeepSeek V4 Pro | ~15 |

#### Day 6 = prompt auto-rewriter

| 任务 | 文件 | 模型 | 行数 |
|---|---|---|---|
| T6.1 prompt rewriter | src/evolution/prompt_writer.py | DeepSeek V4 Pro | ~25 |
| T6.2 接入 Reasoner | src/nodes.py 修改 | DeepSeek V4 Pro | ~10 |
| T6.3 进化日志 | data/evolution.jsonl | MiMo V2.5 | 1 JSONL |

#### Day 7 = 验收

| 任务 | 文件 | 模型 | 行数 |
|---|---|---|---|
| T7.1 端到端测试 | tests/test_e2e.py | MiMo V2.5 | ~30 |
| T7.2 README | README.md | GLM-4.7 | ~30 |
| T7.3 老板验收 | 真实 | 真实 | 0 |

### 4.3 Week 2-4 关键任务

| 周 | 真实工作 | 模型主用 |
|---|---|---|
| Week 2 | Mem0 3 类记忆 + 4 真实场景 + 1 个企业源 | GLM + DeepSeek + Kimi |
| Week 3 | CrewAI 1 个 crew + 经济系统 | Codex + DeepSeek |
| Week 4 | MCP + Skills + 多模态 | Codex + GLM + Gemini |

---

## 五、详细任务清单

### 5.1 Week 1 完整（7 天 = 415 行）

| 任务 ID | 文件 | 模型 | 行数 | 时间 | 验收 |
|---|---|---|---|---|---|
| T1.1 | src/graph.py | DeepSeek | 30 | Day 1 | import 无错 |
| T1.2 | src/nodes.py | GLM | 80 | Day 1 | 5 node 函数 |
| T1.3 | data/orders.json | MiMo | 1 JSON | Day 1 | 5 客户 × 2 月 |
| T1.4 | src/prompts.py | Kimi | 10 | Day 1 | JSON 输出 prompt |
| T1.5 | src/main.py | MiMo | 10 | Day 1 | CLI 入口 |
| T2.1 | src/fetchers/cotlook.py | GLM | 30 | Day 2 | playwright 爬 |
| T2.2 | data/orders.json | MiMo | 1 JSON | Day 2 | 6 月数据 |
| T2.3 | test | DeepSeek | 0 | Day 2 | 真实数据 demo |
| T3.1 | src/triggers/level-0.py | GLM | 20 | Day 3 | trigger 函数 |
| T3.2 | src/graph.py 修改 | DeepSeek | 10 | Day 3 | conditional entry |
| T3.3 | src/scheduler/cron.py | MiMo | 20 | Day 3 | APScheduler 跑 1 个 cron |
| T4.1 | src/nodes.py 修改 | Codex | 30 | Day 4 | Devil 异源 |
| T4.2 | src/graph.py 修改 | DeepSeek | 10 | Day 4 | Devil 分支 |
| T4.3 | tests/test_devil.py | MiMo | 20 | Day 4 | 1 个测试 |
| T5.1 | src/memory/store.py | GLM | 20 | Day 5 | Mem0 集成 |
| T5.2 | src/main.py 修改 | DeepSeek | 15 | Day 5 | 自动写 episodic |
| T5.3 | src/nodes.py 修改 | DeepSeek | 15 | Day 5 | 自动读 episodic |
| T6.1 | src/evolution/prompt_writer.py | DeepSeek | 25 | Day 6 | prompt rewriter |
| T6.2 | src/nodes.py 修改 | DeepSeek | 10 | Day 6 | 接入 Reasoner |
| T6.3 | data/evolution.jsonl | MiMo | 1 JSONL | Day 6 | 进化日志 |
| T7.1 | tests/test_e2e.py | MiMo | 30 | Day 7 | 端到端测试 |
| T7.2 | README.md | GLM | 30 | Day 7 | 老板能跑 |
| T7.3 | 老板验收 | 真实 | 0 | Day 7 | 老板说"OK / 不行" |

### 5.2 Week 2-4 任务方向

| 周 | 任务类 | 行数（估）| 模型主用 |
|---|---|---|---|
| Week 2 | Mem0 3 类记忆 | ~200 | GLM + DeepSeek |
| Week 2 | 4 个真实场景 prompt | ~150 | Kimi |
| Week 2 | 1 个企业源（UN Comtrade）| ~150 | GLM |
| Week 2 | 端到端测试 + 文档 | ~100 | MiMo + GLM |
| Week 3 | CrewAI 1 个 crew | ~350 | Codex |
| Week 3 | 经济系统雏形 | ~200 | DeepSeek |
| Week 3 | 5 个真实场景 | ~150 | MiMo |
| Week 4 | MCP 配置 | ~300 | Codex |
| Week 4 | Skills 治理 | ~250 | GLM |
| Week 4 | 多模态 | ~250 | Gemini |

---

## 六、命名/编码/提交规范

### 6.1 命名规范

| 类型 | 规则 | 示例 |
|---|---|---|
| 文件名 | snake_case | node_collector.py / fetch_cotlook.py |
| 类名 | PascalCase | V3State / FetcherAdapter |
| 函数名 | snake_case | def run_collector(state) |
| 变量 | snake_case | agent_id / task_input |
| 常量 | UPPER_SNAKE_CASE | MAX_TOKEN = 100000 |
| 接口 | I 前缀 + PascalCase | IFetcher / IRouter |
| Prompt | UPPER_SNAKE_CASE | REASONER_PROMPT |

### 6.2 编码规范

| 规范 | 真实要求 |
|---|---|
| 类型注解 | 所有函数必须有 Type Hint（Python）或 TypeScript 注解 |
| 异常处理 | 自定义异常类（V3Error / V3AgentError / V3FetcherError）|
| 日志 | 全部用 loguru，统一格式 |
| 配置 | 全部用 pydantic v2 或 zod（TS）|
| API 客户端 | 全部用 httpx（异步友好）+ tenacity（重试）|
| Prompt | 全部用 JSON 输出（v3 主项目能直接 parse）|
| 测试 | 全部用 pytest + parametrize |
| Lint | Python: ruff check + mypy --strict；TS: tsc --noEmit + eslint |
| 测试覆盖 | 行覆盖 ≥ 80%，关键路径 100% |

### 6.3 提交规范

```bash
# 提交格式（强制）
git commit -m "[<model_name>] <type>(<scope>): <subject>

<body>

<footer>"

# 示例
git commit -m "[deepseek] feat(graph): add LangGraph state machine for 5-agent pipeline

- Add 5 agent nodes (Collector, Cleaner, Weigher, Reasoner, Writer)
- Add conditional edges between agents
- Add state TypedDict for inter-agent data flow

Refs: T1.1, T1.2"
```

| 类型 | 说明 |
|---|---|
| feat | 新功能 |
| fix | 修复 bug |
| refactor | 重构（不改变行为）|
| test | 测试 |
| docs | 文档 |
| chore | 构建/工具/CI |

### 6.4 文档规范

```python
# 每个文件必须有 docstring
"""
模块用途: 5 角色 LangGraph state graph
输入: state (V3State)
输出: state (V3State)
依赖: langgraph, src.nodes
防返工要点: 用 v3 主项目一样的 state 命名
"""
```

### 6.5 API 凭证规范

```python
# 全部用 ${ENV_VAR} 占位
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "${OPENAI_API_KEY}")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "${ANTHROPIC_API_KEY}")
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "${DEEPSEEK_API_KEY}")

# 真实 .env 不提交到 GitHub
# .env.example 必须提交
```

---

## 七、风险与回退

### 7.1 真实风险

| 风险 | 真实概率 | 真实影响 | 真实回退 |
|---|---|---|---|
| GLM/DeepSeek 写真实实现代码 | 高 | 返工 | 强制 prompt 加 "不写真实写真实代码，只写真实接口" |
| 跨平台 API key 互串 | 中 | 凭证泄露 | 每个平台独立 key，本地 .env 隔离 |
| Reasoner/Devil 同源 | 中 | 反证失效 | 强制用 2 个不同平台的模型 |
| 接口命名不一致 | 高 | 集成失败 | 用 v3 主项目 9 个 .ts 的接口 100% 一致 |
| 超时/限流 | 中 | 任务失败 | httpx + tenacity 重试 3 次 + fallback 模型 |
| 凭证审核不过 | 低 | 上线延期 | 上线前 5 天做凭证审计 |

### 7.2 真实回退机制

```python
# 每个任务必须有 fallback
def run_with_fallback(primary_fn, fallback_fn, *args, **kwargs):
    try:
        return primary_fn(*args, **kwargs)
    except Exception as e:
        logger.warning("primary_failed", fn=primary_fn.__name__, error=str(e))
        return fallback_fn(*args, **kwargs)
```

### 7.3 真实质量门

| 门 | 真实要求 | 真实检查工具 |
|---|---|---|
| 门 1：类型安全 | 所有函数有 Type Hint | mypy --strict |
| 门 2：测试覆盖 | 行覆盖 ≥ 80% | pytest --cov |
| 门 3：lint | 0 错误 | ruff check + mypy --strict |
| 门 4：接口一致 | 与 v3 主项目 100% 一致 | grep 检查关键接口名 |
| 门 5：文档完整 | 每个文件有 docstring | pydocstyle |

---

## 八、4 周真实可跑路径的验收

### 8.1 Week 1 验收

```
[ ] Day 1: 4 小时内跑通 MVP-0 demo
    [ ] python -m v3-mvp-0 "5 月接单掉了 33%，我该怎么办？"
    [ ] 30 秒内输出 Markdown
    [ ] 输出含 3 段（数据 / 原因 / 方案）+ 1 个推荐
    [ ] 真实调用 Claude API（不是 mock）
    [ ] 跑 3 次不同问题 = 3 次合理输出

[ ] Day 7: 1 周后 MVP-1 完成
    [ ] 全部 21 个任务通过
    [ ] 端到端测试 = 5 个真实场景全部通过
    [ ] 老板看 5 个真实场景输出 = 至少 3 个说"有用"
    [ ] 反证机制真实工作
    [ ] 记忆机制真实工作
    [ ] 自进化真实工作
```

### 8.2 Week 2 验收

```
[ ] Mem0 3 类记忆跑通（episodic + semantic + procedural）
[ ] 4 个真实场景能跑（5 月接单 / 6 月接单 / 优衣库砍单 / 棉花涨）
[ ] 1 个企业级数据源接入（UN Comtrade 1 个 Key）
[ ] consolidate 跑通
[ ] prompt 越跑越好
```

### 8.3 Week 3 验收

```
[ ] CrewAI 1 个 crew 跑通（5 agent 协作）
[ ] 经济系统雏形跑通（wallet + 评分）
[ ] 5 个真实场景（多角色用）
[ ] agent "业绩" 可见
[ ] 多 agent 协作跑通
```

### 8.4 Week 4 验收

```
[ ] MCP 配置 4 个 MCP 接入
[ ] Skills 治理（LangChain Hub 200+ skills 可调）
[ ] 多模态（PPT 生成）
[ ] 月度 PPT 自动生成
[ ] v3 真实可商业
```

### 8.5 4 周总验收

```
[ ] 全部 4 周任务通过
[ ] 端到端测试 = 20 个真实场景全部通过
[ ] 老板能用 v3 = 真实可商业
[ ] 月度 PPT 自动生成
[ ] 经济系统跑通
[ ] CrewAI 蜂群跑通
[ ] MCP 4 个接入跑通
[ ] Skills 200+ 可调
[ ] 多模态 3 类跑通
[ ] 5 大质量门全部通过
[ ] 10 大防返工标准全部遵守
```

---

## 九、真实第一步（4 小时 MVP-0）

### 9.1 4 小时内能跑通的真实场景

**老板问**："5 月接单掉了 33%，我该怎么办？"

**v3 在 30 秒内输出**：
```markdown
# 5 月接单分析

## 数据
- 5 月：8 单 / ¥224 万
- 4 月：12 单 / ¥336 万
- 同比：-33% / -21%

## 33% 下降的真实原因
1. 优衣库补单 -40%（库存压力 DIO 14.36%）
2. MUJI 返单 -25%（25 天交期压力）
3. CHICJOC +2 单（直播款新客户）

## 3 个方案
- 方案 A：主动给优衣库降价 2%，锁定 6 月 1 单 ¥28 万
- 方案 B：维持报价，全力接 CHICJOC 大单
- 方案 C：双管齐下（推荐）

## 推荐
方案 C。1% 降价损失可被 CHICJOC 大单 2 倍覆盖。
```

**真实工作 = 4 小时 = pip install langgraph + 50 行 Python + mock 数据**。

### 9.2 4 小时内能写的文件

```
v3-mvp-0/
├── pyproject.toml              # 1 个文件
├── data/
│   └── orders.json             # 1 个文件
├── src/
│   ├── graph.py                # 1 个文件（约 30 行）
│   ├── nodes.py                # 1 个文件（约 80 行）
│   ├── prompts.py              # 1 个文件（约 10 行）
│   └── main.py                 # 1 个文件（约 10 行）
└── README.md                   # 1 个文件（约 30 行）
```

**真实总代码 = 约 160 行 Python + 1 个 JSON = 4 小时能写**。

---

## 十、上线标准

### 10.1 Week 1 上线（MVP-0 demo）

```
[ ] 真实跑通 1 个 working demo
[ ] 老板能问 1 个问题
[ ] 30 秒内看到 Markdown 输出
[ ] 5 个真实场景全部跑通
[ ] 老板说"OK"或"需要改进"
[ ] 写真实实现代码
[ ] 写真实 API 凭证
```

### 10.2 Week 4 上线（v3 真实可商业）

```
[ ] 老板能问 20 个真实场景
[ ] 老板能用月度 PPT
[ ] 老板能看到 agent "业绩"
[ ] 老板能看到自动报告
[ ] 老板能多角色用
[ ] 真实跑通 1 个企业源（UN Comtrade）
[ ] 5 大质量门全部通过
[ ] 10 大防返工标准全部遵守
[ ] 5 个模型分工清晰
[ ] 6 个平台协作清晰
[ ] 真实跑通 4 周迭代
[ ] 写真实凭证管理
[ ] 写真实上线流程
```

### 10.3 上线前 5 天真实检查

| 检查项 | 真实工具 | 真实标准 |
|---|---|---|
| 类型安全 | mypy --strict | 0 错误 |
| 测试覆盖 | pytest --cov | 大于等于 80% |
| Lint | ruff + eslint | 0 错误 |
| 接口一致 | grep + 手工 | 100% 一致 |
| 凭证审计 | 手工 + 脚本 | 0 明文 |
| 性能 | k6 / locust | 小于 5s p95 |
| 安全 | bandit / snyk | 0 高危 |
| 文档 | pydocstyle | 100% 覆盖 |

---

## 十一、跨多 AI / 多模型 / 多平台的真实协作

### 11.1 真实协作流

```
[Owner 提任务]
  ↓
[任务分发到平台 1: 火山方舟]
  GLM-4.7 写骨架（Day 1 任务 T1.1）
  ↓ GitHub PR
[任务分发到平台 2: Anthropic]
  Claude Opus 4.8 测试骨架（Day 1 任务 T1.2）
  ↓ GitHub PR
[任务分发到平台 3: OpenAI]
  Codex 写反证（Day 4 任务 T4.1）
  ↓ GitHub PR
[任务分发到平台 4: Google AI]
  Gemini Pro 写多模态（Week 4 任务 T9.1）
  ↓ GitHub PR
[本地 Ollama]
  MiMo / Qwen 跑测试
  ↓
[集成]
  4 个 PR 合并到 main 分支
  ↓
[Obsidian 写文档]
  本地知识库同步
  ↓
[交付]
  v3 真实可商业
```

### 11.2 真实跨平台代码交接机制

```bash
# 每个 PR 必须标 model name
git commit -m "[<model_name>] <type>(<scope>): <subject>"

# 示例
[deepseek] feat(graph): add LangGraph state machine
[claude] test(nodes): add Reasoner test cases
[codex] refactor(Devil): 异源 LLM implementation
[gemini] feat(multimodal): add PPT generator
[mimo] docs(readme): update MVP-0 README
```

### 11.3 真实跨平台数据交接

```python
# 跨平台共享 evidence_cards.jsonl
# 火山方舟读 + 写
# Anthropic 读
# OpenAI 读
# Google AI 读
# 本地 Ollama 读

# 跨平台 API 调用
class V3Client:
    def __init__(self):
        self.deepseek = DeepSeekClient()
        self.claude = ClaudeClient()
        self.openai = OpenAIClient()
        self.gemini = GeminiClient()
        self.ollama = OllamaClient()
```

---

## 十二、5 个模型的具体约束（防返工）

### 12.1 GLM-4.7 / GLM-5.2 约束

- 只用中文 prompt
- 不写真实 API Key / endpoint URL（用 ${ENV_VAR} 占位）
- 不写真实 prompt 模板（用变量替换）
- 不写真实 JSX / CSS / fetch body
- 输出 = 干净骨架 + TODO 注释 + 类型注解

### 12.2 DeepSeek V4 Pro 约束

- 写核心逻辑（state graph / 推理 / 算法）
- 不写真实 prompt 模板
- 不写真实 API Key
- 输出 = 完整 Type Hint + 异常处理 + 日志

### 12.3 MiMo V2.5 约束

- 写简单任务（搬运 / 测试 / 字段映射）
- 不写真实业务逻辑
- 输出 = 简短 + 单元测试覆盖

### 12.4 Kimi K2.7-code 约束

- 写长 prompt + 长文本处理
- 不写真实短代码
- 输出 = 中文 + 完整 prompt 模板

### 12.5 Codex 约束

- 写反证机制 + 复杂 schema + TypeScript discriminated union
- 不写真实简单任务
- 输出 = 完整类型 + 边界条件

### 12.6 Gemini Pro 约束

- 写多模态 agent
- 不写真实数据流
- 输出 = 多模态调用 + JSON 输出

---

## 十三、给每个模型的具体 prompt 模板（用于派发）

### 13.1 GLM-4.7 prompt 模板

```
你是 v3 项目的 GLM-4.7。
任务: 写 T1.2 - 5 个 node function 骨架
文件: src/nodes.py
要求:
- 每个 node function 有 Type Hint
- 用 TypedDict 定义 state
- 5 个 node: collector / cleaner / weigher / reasoner / writer
- 每个 node 输出 state["key"] = value
- 写真实 API Key / endpoint URL
- 写真实 prompt 模板（用占位符）
- 输出: 完整代码 + TODO 注释
时间: 4 小时
验收: import 无错 + 5 个 node 各自有 __name__ 属性
```

### 13.2 DeepSeek V4 Pro prompt 模板

```
你是 v3 项目的 DeepSeek V4 Pro。
任务: 写 T1.1 - LangGraph state graph 骨架
文件: src/graph.py
要求:
- 用 LangGraph StateGraph 创建 5 个 node
- 用 add_conditional_edges 处理 4 触发层
- 用 add_edge 处理 5 角色流水线
- 用 RunnableConfig 支持 checkpoint
- 写真实 API Key
- 输出: 完整代码 + 类型注解
时间: 30 分钟
验收: import 无错 + graph 跑通
```

### 13.3 MiMo V2.5 prompt 模板

```
你是 v3 项目的 MiMo V2.5。
任务: 写 T1.3 - mock 数据
文件: data/orders.json
要求:
- 5 客户 × 2 月 × 4 字段
- 字段: customer_name / month / order_count / amount_wan / order_type
- ISO 8601 时间戳
- 写真实业务数据
- 输出: 1 个 JSON
时间: 30 分钟
验收: JSON 可 parse + 40 行
```

### 13.4 Kimi K2.7-code prompt 模板

```
你是 v3 项目的 Kimi K2.7-code。
任务: 写 T1.4 - Reasoner prompt 模板
文件: src/prompts.py
要求:
- 5 步因果 DAG（data → analysis → paths → scenarios → recommendation）
- 中文 prompt
- JSON 输出格式
- 写真实业务数据
- 输出: 1 个 prompt 字符串
时间: 30 分钟
验收: JSON 可 parse + 10 行
```

### 13.5 Codex prompt 模板

```
你是 v3 项目的 Codex。
任务: 写 T4.1 - Devil node 实现
文件: src/nodes.py 修改
要求:
- 异源 LLM 调（用 DeepSeek，不用 Claude）
- 反证 Reasoner 的结论
- 失败时回到 Reasoner 重试
- TypeScript discriminated union
- 写真实业务逻辑
- 输出: 完整代码 + 类型
时间: 2 小时
验收: Devil 真的反证 Reasoner + 测试用例通过
```

### 13.6 Gemini Pro prompt 模板

```
你是 v3 项目的 Gemini Pro。
任务: 写 Week 4 T9.1 - PPT 生成
文件: src/multimodal/ppt.py
要求:
- 用 python-pptx
- 接收 v3 数据 → 生成月度 PPT
- 输出 Markdown 报告 + PPT 文件
- 写真实 API Key
- 输出: 完整代码
时间: 1 天
验收: 老板能下载 PPT
```

---

## 十四、给新加入的 AI / 开发者的第一天指南

### 14.1 拿到这个文档后，第一步做什么

```
1. 读第一/二/三章（10 分钟）
2. 读第六章命名/编码/提交规范（10 分钟）
3. 读第十/十一/十二章模型约束（10 分钟）
4. 看 GitHub 任务看板（10 分钟）
5. 接受 1 个 Day 1 任务（30 分钟）
6. 写真实实现（4 小时）
7. 写真实 commit + PR（30 分钟）
```

### 14.2 第一次卡住怎么办

| 卡住类型 | 真实解法 |
|---|---|
| 不知道用哪个模型 | 看第二章分工表 |
| 写真实实现代码但模型写真实 | 在 prompt 加 写真实写真实，只写真实接口 |
| 接口命名不一致 | 看 v3 主项目 src/intelligence/types.ts |
| 跨平台 API key 不对 | 用 ${ENV_VAR} 占位，本地 .env 不提交 |
| 测试不通过 | 看 pytest 输出 + 问 GLM/DeepSeek 调试 |
| 其他 AI 写真实错 | 在 commit message 标 model name，PR 评审时纠正 |

### 14.3 真实的工作节奏

```
每天:
- 09:00 看 GitHub Issues（昨天任务是否完成）
- 09:30 接受今日任务
- 10:00 写真实实现（4-6 小时）
- 16:00 commit + PR
- 17:00 写真实 README / 写真实测试
- 18:00 提交日报

每周:
- 周一: 看周任务分配
- 周三: 中期检查（5 大质量门）
- 周五: 周末验收（10 大防返工标准）
- 周日: 周报 + 下周计划
```

---

## 十五、真实案例：Day 1 真实工作

### 15.1 09:00 任务接收

- Owner 提任务：T1.1 - LangGraph state graph 骨架
- 平台分配：火山方舟（DeepSeek V4 Pro）
- 提交者：开发者 A
- PR 链接：github.com/v3-team/v3/pull/1

### 15.2 09:30 写真实实现

（由 GLM/DeepSeek 按 §13.2 prompt 写真实 src/graph.py，含 5 个 node 和 conditional edges，不写真实 API key）

### 15.3 16:00 commit + PR

```bash
git add src/graph.py
git commit -m "[deepseek] feat(graph): add LangGraph state machine for 5-agent pipeline

- Add 5 agent nodes (Collector, Cleaner, Weigher, Reasoner, Writer)
- Add sequential edges between agents
- Add MemorySaver checkpoint for state persistence
- Refs: T1.1"
git push origin feat/graph-skeleton
```

### 15.4 17:00 写真实测试

```python
# tests/test_graph.py
import pytest
from src.graph import app

def test_graph_compiles():
    assert app is not None

def test_collector_to_cleaner():
    state = {"task_input": "test", "raw_data": {}}
    result = app.invoke(state)
    assert "cleaned_data" in result
```

### 15.5 18:00 提交日报

```markdown
# 2026-07-01 日报

## 完成任务
- T1.1: LangGraph state machine 骨架 (30 行 Python)
- T1.2: 5 个 node function 骨架 (80 行 Python)
- T1.3: mock 数据 (40 行 JSON)
- T1.4: Reasoner prompt 模板 (10 行 Python)
- T1.5: main 启动入口 (10 行 Python)
- T7.1: 端到端测试 (30 行 Python)

## 提交
- PR #1: feat(graph): add LangGraph state machine
- 写真实实现代码 约 200 行

## 阻塞
- 无

## 明日计划
- T2.1-T2.3: 加 Cotlook A 真实数据
```

---

## 十六、4 周真实可跑路径（视觉化）

```
Week 1: MVP-0 → MVP-1
  Day 1: 4 小时跑通 demo (老板能看到效果)
  Day 2-3: 加真实数据 + 4 触发层
  Day 4-5: 加反证 + 记忆
  Day 6-7: 加自进化 + 验收

Week 2: MVP-2
  Day 8-10: Mem0 3 类记忆
  Day 11-12: 4 个真实场景
  Day 13-14: 1 个企业源

Week 3: MVP-3
  Day 15-17: CrewAI 蜂群
  Day 18-19: 经济系统
  Day 20-21: 5 个真实场景

Week 4: MVP-4
  Day 22-24: MCP 配置
  Day 25-26: Skills 治理
  Day 27-28: 多模态
```

---

## 十七、最终一句话

> **v3 完整项目文档 = 4 周派发清单 + 5 个模型分工 + 6 个平台协作 + 10 大防返工标准 + 5 大质量门 + 真实第一步 = 4 小时可跑通**。
>
> **任何 AI（GLM/DeepSeek/MiMo/Kimi/Codex/Gemini Pro）拿起来就能干**。
>
> **任何开发者（任何平台）拿起来就能写真实**。
>
> **老板 4 周后能用真实可商业的 v3**。

---

## 附录 A：速查表

### A.1 5 个模型分工速查

| 任务类型 | 主模型 | 备 |
|---|---|---|
| 接口/类型/skeleton | GLM-4.7 | MiMo |
| 核心逻辑/算法 | DeepSeek V4 Pro | Codex |
| 简单任务/测试 | MiMo V2.5 | GLM-4.7 |
| 长 prompt/PDF | Kimi K2.7-code | DeepSeek |
| 反证/复杂 schema | Codex | DeepSeek |
| 多模态 | Gemini Pro | - |

### A.2 4 周派发速查

| 周 | 主任务 | 行数 | 主模型 |
|---|---|---|---|
| Week 1 | 5 角色 + 4 触发 + 反证 + 记忆 + 自进化 | 415 | 6 模型 |
| Week 2 | 3 类记忆 + 4 场景 + 1 企业源 | 600 | 3 模型 |
| Week 3 | CrewAI + 经济系统 | 700 | 3 模型 |
| Week 4 | MCP + Skills + 多模态 | 800 | 3 模型 |

### A.3 真实第一步速查

```
pip install langgraph langchain-anthropic langchain-openai mem0ai crewai
python -m v3-mvp-0 "5 月接单掉了 33%，我该怎么办？"
```

**真实可跑 = 4 小时 + 1 个 mock + 50 行 Python = 老板能用**。

---

**文档结束**。
**版本 v1.0 · 2026-07-01 · 真实可跑**。
