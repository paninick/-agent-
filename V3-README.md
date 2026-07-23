# v3 产链引擎 — Project Entry

> **v3 = 用真实数据 + Agent 智能路由，给中小服装工贸企业提供"老板 30 秒看到 3 方案"的决策支持**
>
> **服务对象**：南通富泉工贸（100-200 人，4 车间，对日/欧美 ODM/OEM）
> **当前阶段**：v3 路线已确立（`docs/产链引擎/00c_RESTART_PLAN_v3.md`），进入 P-Block 1 实施
> **最后更新**：2026-07-01

> **本文件与 `README.md` 的关系**：
> - `README.md`（项目根）描述 **Launch Desk**（OpenAI Agents SDK release-planning agent，端口 5173/8787，`npm run verify:stream`）
> - `V3-README.md`（本文件）描述 **v3 产链引擎**（证据账本 + 6 账本 + 物料对账，`npm run verify:intelligence`）
> 两项目并存于同一 monorepo，独立脚本独立端口独立数据流。

---

## 1. 一句话定位

`Weekly + On-demand 商业决策简报，6 账本 + 7 监控维度 + 5 可视化门槛，每跑 `verify:intelligence` 输出 bounded artifact。`

> **本版本（v3）定位取代 v2 全栈规划**：v2 是"7-agent 全产业链因果推导平台"，v3 是"先在 verify:intelligence 上跑通 5 个公开源 + 4 个授权源 + 3 个 candidate，再扩张"。
> v2 文档已归档于 `docs/产链引擎/` 子目录，**不再维护**。

---

## 2. 5 分钟上手

```bash
# 克隆 + 装依赖
git clone <repo>
cd "D:\Documents\New project 2"
npm install

# 配置密钥（仅本地 .env.local，不入 git）
cp .env.example .env.local
# 编辑 .env.local，填入（真源变量名见 docs/产链引擎/02_DATA_SOURCE_REGISTRY.md §顶部 ENV 变量名统一表）:
#   UN_COMTRADE_API_KEY=<your_key>      # 4 个授权源，按需填写
#   FRED_API_KEY=<your_key>
#   CENSUS_API_KEY=<your_key>
#   OPEN_SUPPLY_HUB_API_KEY=<your_key>

# 一键验证 v3 产链引擎
npm run verify:intelligence
# → outputs/intelligence/verification-latest.json
# → 检查 verifiedSourceCount / brandChainGate.status / visualizationReadiness.status
```

如果 `verify:intelligence` 输出 `visualizationReadiness.status = blocked`，意味着进入正式可视化/安装包阶段被硬门槛拦截；按 `docs/INTELLIGENCE_VERIFICATION_RUNBOOK_CN.md §7` 顺序补源。

---

## 3. v3 项目结构（实际代码）

```
D:\Documents\New project 2\
├── package.json                       同时声明 verify:intelligence + verify:stream
├── data/
│   └── intelligence-source-registry.seed.json     ★ 23 个 S/A+/A/B/C 级源
├── src/
│   ├── intelligence/                  ★ v3 核心
│   │   ├── index.ts                   barrel export
│   │   ├── types.ts                   5 Type 枚举 + 6 接口
│   │   ├── sourceRegistry.ts          Zod schema + parse/assert
│   │   ├── evidenceLedger.ts          createEvidenceEntry / scoreEvidence / evaluateConclusionGate
│   │   ├── officialApis.ts            ★ 9 个 fetch adapter + 9 个 evidence 转换
│   │   ├── brandChainGate.ts          ★ 6 账本门禁 + evaluate
│   │   ├── materialReconciliation.ts ★ BOM 反推 + 物理量对账
│   │   ├── coverage.ts                7 维度覆盖评估
│   │   └── visualizationReadiness.ts  5 门槛评估
│   ├── tests/
│   │   └── intelligence.test.ts
│   ├── agent/                         ← Launch Desk（另一项目，不属 v3）
│   ├── client/                        ← Launch Desk
│   └── server/                        ← Launch Desk
├── scripts/
│   ├── verify-intelligence-sources.ts ★ v3 验证入口（输出 bounded artifact）
│   └── verify-stream.mjs              ← Launch Desk
├── outputs/
│   └── intelligence/
│       └── verification-latest.json   ★ bounded artifact（运行后生成）
└── docs/
    ├── PROJECT_HANDBOOK.md            ← 项目总览（部分章节与 v3 不一致）
    ├── STATE.md                       ← 当前状态（2026-07-01 已修正笔误）
    ├── multi-ai-dev-sop.md            ← 7 角色 RACI + 9 阶段门禁
    ├── 产链引擎/                      
    │   ├── 00_INDEX.md
    │   ├── 00c_RESTART_PLAN_v3.md     ← v3 当前真实路径
    │   ├── 01_MASTER_PLAN.md
    │   ├── 02_DATA_SOURCE_REGISTRY.md ← ★ 顶部 ENV 变量名统一表 + 数据源状态矩阵
    │   ├── 03_AGENT_SOP.md            ← ★ §三权重表已对齐代码真值
    │   ├── 04_CODE_SOP.md             ← ⚠️ DEPRECATED（Python 栈已作废）
    │   ├── 05_VERIFICATION_STANDARDS.md
    │   ├── 06_USER_REQUIREMENTS.md
    │   ├── 07_BRANCH_ROADMAP.md
    │   ├── 10_PROBE_RESULTS.md        ← ★ §三 Massive.com 已标 DEPRECATED
    │   ├── 20_REAL_DATA_INSIGHTS.md
    │   ├── 30_DOWNLOADED_DATA_INDEX.md
    │   ├── 40_MVP_DESIGN.md           ← ⚠️ DEPRECATED（与 00c 互斥）
    │   ├── 04b_M0_DESIGN.md           ← ⚠️ DEPRECATED
    │   └── 99_CHANGELOG.md
    ├── INDUSTRY_INTELLIGENCE_AGENT_SPEC_CN.md
    ├── INTELLIGENCE_VERIFICATION_RUNBOOK_CN.md
    ├── AI_MODEL_ROUTING_PLAN_CN.md
    ├── LOCAL_WIKI_CONFIG_AUDIT_CN.md
    └── VALIDATION_CHECKLIST.md
```

---

## 4. 当前在做哪一件

按 `00c_RESTART_PLAN_v3.md §五` 优先级：

| P-Block | 状态 | 说明 |
|---|---|---|
| **P-Block 1** | ⏳ 进行中 | 4 授权源 adapter（FRED / U.S. Census / Open Supply Hub / UN Comtrade）— **adapter 已写，只差 key 接入 .env.local** |
| **P-Block 2** | ⏳ 待启 | 3 candidate adapter（WITS / OECD / ILOSTAT） |
| **P-Block 3** | ⏳ 待启 | 4 P0 MCP |
| **P-Block 4** | ⏳ 待启 | 真实 6 账本联动（GAP 试点 partial_chain → chain_verified） |
| **P-Block 5** | ⏳ 待启 | 前端 4 大可观测面板 |
| **P-Block 6** | ⏳ 待启 | 多账本 UI + 多行业扩展点 |
| **P-Block 7** | ⏳ 待启 | 触发 + Action + 审计 |
| **P-Block 8** | ⏳ 待启 | 一键部署 |

---

## 5. 文档导航

| 我想找 | 文档 |
|---|---|
| **v3 当前真实路径** | `docs/产链引擎/00c_RESTART_PLAN_v3.md` |
| 数据源分级 + ENV 变量统一表 | `docs/产链引擎/02_DATA_SOURCE_REGISTRY.md`（顶部） |
| 7 监控维度 / 6 账本 / 5 门槛 | `docs/产链引擎/03_AGENT_SOP.md` + `docs/INTELLIGENCE_VERIFICATION_RUNBOOK_CN.md` |
| 验证 Runbook | `docs/INTELLIGENCE_VERIFICATION_RUNBOOK_CN.md` |
| Token 路由 / 模型分工 | `docs/AI_MODEL_ROUTING_PLAN_CN.md` |
| 7 角色 RACI + 9 阶段门禁 | `docs/multi-ai-dev-sop.md` |
| 当前状态 | `docs/STATE.md` |
| 项目总览（注意部分章节与 v3 不一致）| `docs/PROJECT_HANDBOOK.md` |
| 早期规范 | `docs/INDUSTRY_INTELLIGENCE_AGENT_SPEC_CN.md` |
| 本地 wiki 审计 | `docs/LOCAL_WIKI_CONFIG_AUDIT_CN.md` |
| 验证 checklist | `docs/VALIDATION_CHECKLIST.md` |

---

## 6. 已知重要警告（2026-07-01 校准）

1. **PROJECT_HANDBOOK.md §1, §4 与 v3 不一致**：HANDBOOK 描述的是 v2 旧栈（LangGraph/Mem0/CrewAI 的 Python 方案），v3 实际栈是 Express + Zod + OpenAI Agents SDK（与 Launch Desk 共用 monorepo）。以 `产链引擎/00c_RESTART_PLAN_v3.md` 为准。
2. **40_MVP_DESIGN.md 已标 DEPRECATED**：当前活跃方案是 v3，仅在 4 周决策点 PIVOT/KILL 时作为备选参考。
3. **04_CODE_SOP.md 已标 DEPRECATED**：原 Python + D:\ERP 栈示例已与 v3 TS + 当前 monorepo 栈不一致。
4. **04b_M0_DESIGN.md 早已作废**：00c_RESTART_PLAN_v3.md §一 显式标"v2 整体作废"。
5. **10_PROBE_RESULTS.md §三 Massive.com 已标 DEPRECATED**：代码侧无 fetchMassiveAdapter，NKE/LULU/TJX/HBI 验证为历史归档。
6. **ENV 变量名不一致**：所有 ENV 变量名的唯一真源是 `docs/产链引擎/02_DATA_SOURCE_REGISTRY.md §顶部 ENV 变量名统一表`。如与其他文档冲突，以真源表为准。
7. **API Key 不入文档**：所有 ENV 变量已脱敏；真值在 `.env.local`。
8. **真实状态以代码为准**：当 docs 与代码冲突时，以 `npm run verify:intelligence` 实际输出 + `src/intelligence/*.ts` 实现为准。

---

## 7. 三步快速验证

```bash
# 1. 检查包与脚本
cat package.json | grep -E "verify|intelligence"

# 2. 看真实 adapter 实现
ls -la src/intelligence/

# 3. 跑一次（无 key 也能跑，输出会含 skipped_auth_required）
npm run verify:intelligence
cat outputs/intelligence/verification-latest.json | head -100
```

---

**版本 v1.0 · 2026-07-01 · v3 产链引擎专用 README**
