# HANDOVER.md — v3 产链引擎 AI 接手文档

> **目的**：让任何 AI 助手（GLM / DeepSeek / MiMo / Kimi / Codex / Claude / Gemini）能在 5 分钟内理解 v3 状态并安全接手
> **更新日期**：2026-07-02
> **上一位 AI**：Claude Opus 4.8

---

## 一、v3 是什 么

**v3 产链引擎** = 给中小服装工贸企业（南通富泉为代表，100-200 人，4 车间，对日/欧美 ODM/OEM）的因果世界模型 + Agent 智能路由系统。

```
核心: 9 环节因果 DAG（农业→化纤→面料→设计→制造→品牌→渠道→消费→回收）
     + 24 个数学模型 + 30 个参数 + 6 验证门
     + 13 agent 架构（9 NodeAgent + 3 Verifier + 1 Orchestrator）
     + 23 个 seed 数据源（14 S 级 / 4 A+ / 4 A / 1 B）
输出: 老板 30 秒看到 3 方案 + 4 立场全貌图
验证: npm run verify:intelligence 跑通 5 verified + 4 skipped + 7/7 covered
```

---

## 二、当前 monorepo 结构

```
D:\Documents\New project 2\
├── README.md                ← Launch Desk 入口（不改）
├── V3-README.md            ← v3 产链引擎入口（**新 AI 必读**）
├── package.json             ← 8 个 scripts（见 §四）
├── .env.example             ← 4 个 L1 hint，不含真值
├── .gitignore               ← .env* 忽略
│
├── docs/                    ← 21 份核心文档（见 §三）
├── src/                     ← 22 个 TS 文件
│   ├── intelligence/        ← v3 核心（9 fetch + 6 ledger + 7 监控 + 5 门槛）
│   ├── agent/ client/ server/  ← Launch Desk（**不属于 v3**）
│   └── tests/               ← 2 个 test 文件
├── scripts/                 ← 19 个脚本（含 4 个本会话新增的 verify）
├── skills/                  ← 14 个已装 Git 仓库（superpowers / anthropic-skills / ECC 等）
├── data/                    ← intelligence-source-registry.seed.json
└── outputs/                 ← verification-latest.json + skill-audit-report.json
```

---

## 三、21 份 docs 优先级（AI 必读顺序）

| 序 | 文件 | 行数 | 必读性 | 内容 |
|---|---|---|---|---|
| 1 | **V3-README.md** | 173 | ⭐⭐⭐ | v3 项目入口 |
| 2 | **docs/AGENT_ARCHITECTURE.md** | 250 | ⭐⭐⭐ | 13 agent + 6 验证门完整设计 |
| 3 | **docs/MATHEMATICAL_MODEL.md** | 904 | ⭐⭐⭐ | 24 模型 + 30 参数 + 9 环节 + 6 元模型 |
| 4 | **docs/SECURITY.md** | 270 | ⭐⭐⭐ | 5 红线 + 凭据管理 + pipeworx 风险 |
| 5 | **docs/RESEARCH_FOUNDATIONS.md** | 280 | ⭐⭐ | 7/18 项溯源 |
| 6 | **docs/SKILLS_REGISTRY.md** | 330 | ⭐⭐ | 14 已装项目矩阵 |
| 7 | **docs/INCIDENTS/2026-07-02-pwx-leak.md** | 175 | ⭐⭐ | pipeworx key 泄露事件 |
| 8 | **docs/产链引擎/00c_RESTART_PLAN_v3.md** | 280 | ⭐⭐ | v3 8 P-Block 路线 |
| 9 | docs/产链引擎/02_DATA_SOURCE_REGISTRY.md | 320 | ⭐ | 23 源 ENV 变量名统一表 |
| 10 | docs/产链引擎/01_MASTER_PLAN.md | 313 | ⭐ | 7 层架构 + 3 角色 |
| 11 | docs/INTELLIGENCE_VERIFICATION_RUNBOOK_CN.md | 230 | ⭐ | 验证 Runbook |
| 12 | docs/产链引擎/03_AGENT_SOP.md | 190 | 参考 | 7 角色 Agent SOP（**DEPRECATED 标 multi-ai-dev-sop**） |
| 13 | docs/产链引擎/04_CODE_SOP.md | 290 | 参考 | **DEPRECATED**（Python 栈已作废）|
| 14 | docs/产链引擎/04b_M0_DESIGN.md | 250 | 参考 | **DEPRECATED**（00c 已删）|
| 15 | docs/产链引擎/40_MVP_DESIGN.md | 467 | 参考 | **DEPRECATED**（与 00c 互斥）|
| 16 | docs/PROJECT_HANDBOOK.md | 998 | 参考 | **DEPRECATED**（v2 旧栈）|
| 17 | docs/multi-ai-dev-sop.md | 350 | 参考 | **DEPRECATED**（superpowers 14 件覆盖）|
| 18 | docs/STATE.md | 330 | 历史 | 当前状态画像（已去"画像实"笔误）|
| 19 | docs/AI_MODEL_ROUTING_PLAN_CN.md | 365 | 参考 | Token 路由 |
| 20 | docs/产链引擎/06_USER_REQUIREMENTS.md | 577 | 参考 | 用户需求 |
| 21 | docs/产链引擎/07_BRANCH_ROADMAP.md | 360 | 参考 | 流水线 |

**AI 接手只读前 8 份**。其余按需。

---

## 四、scripts 与 npm 命令（必用 9 个）

```bash
# 启动前必跑
npm run verify:env          # check-env.ts 验证 .env.local + 6 类 ENV

# 必跑（建议 pre-commit）
npm run verify:secrets      # scan-secrets.ts 扫 8 类 key 泄漏
npm run verify:intelligence # 跑 9 探针 + 写 bounded artifact

# 选跑
npm run verify:skills       # skill-audit-local.ts 跑 14 已装项目审计
npm run verify:all          # 4 个 verify 串行

# Launch Desk（不属于 v3）
npm run dev:server          # 启动 Express API
npm run dev:web             # 启动 Vite
npm run build               # tsc + vite build
npm run test                # vitest run
```

---

## 五、跑 verify:intelligence 看现状

```bash
$ npm run verify:intelligence
# 输出 outputs/intelligence/verification-latest.json
# 当前 (2026-06-30): 5 verified + 4 skipped + 2/6 brandChainGate passed
```

期望 5 verified：
- `world-bank` (VNM GDP / 关税 / 孟加拉女性劳动率)
- `sec-edgar` (GAP 2025 revenue $15.366B / grossMargin 40.79%)
- `eurostat` (DE 2024 人口 83,456,045)
- `ecb-eurofxref` (USD/JPY 161.86 from EUR-base 1.1406 × 184.62)
- `bls-public-api` (CUSR0000SAA 137.069)

期望 4 skipped（需 .env.local 写真实 key 才跑通）：
- `fred` (DEXJPUS)
- `us-census-trade` (US HS 进口)
- `un-comtrade` (越南/孟加拉 HS 60 涤纶)
- `open-supply-hub` (工厂身份)

跑通 5→8/9 verified 需要：
1. cp .env.example .env.local
2. 编辑 .env.local 写真实 4 个 L1 key
3. 重跑 verify:intelligence

---

## 六、安全红线（任何 AI 接手必须遵守的 5 条）

```
🚫 绝不在 AI 聊天 / 截图 / commit / URL query string 写真实 key
🚫 绝不用 pipeworx 等无 SOC2 的 hosted gateway 接 L2+ 业务数据
🚫 绝不删除 .gitignore 里的 .env* 规则
🚫 绝不直接采纳论文数字不写溯源（v3 RESEARCH_FOUNDATIONS.md 维护溯源）
🚫 绝不把 mcp-bis 等 0 star / 2 commit 的仓库当主生产源
```

详细见 `docs/SECURITY.md`。

**历史教训**：2026-07-02 pipeworx API key 泄露事件。Owner 在 AI 聊天贴 key，Claude 立即警告，Owner 撤销。详见 `docs/INCIDENTS/2026-07-02-pwx-leak.md`。

---

## 七、不要做的事（边界）

```
❌ 不要：跑"自动装"任何未审 skill（参照 SECURITY.md + SKILLS_REGISTRY.md Tier 0 手动）
❌ 不要：把 Launch Desk 代码（src/agent/ client/ server/）和 v3 intelligence 代码混
❌ 不要：恢复被 DEPRECATED 标记的 6 份老文档（除非明确撤销）
❌ 不要：把 v3 docs 写到 docs/产链引擎/ 之外的目录（v0-v2 历史）
❌ 不要：移除任何 .env.example 占位符
❌ 不要：写带真值 key 的代码或注释
❌ 不要：相信未在 RESEARCH_FOUNDATIONS.md 溯源的数字
```

---

## 八、怎么开始一项 v3 任务（推荐流程）

```
1. 读 V3-README.md  5 分钟（理解 v3 是什么）
2. 读 AGENT_ARCHITECTURE.md  10 分钟（理解 13 agent + 6 验证门）
3. 读 MATHEMATICAL_MODEL.md §0 §一 §十七  10 分钟（理解 9 节点 + 验证层）
4. 读 INCIDENTS/  5 分钟（理解安全事件）
5. 跑 npm run verify:all  5 分钟（看现状）
6. 用 superpowers 5 件套执行（using-superpowers / brainstorming / writing-plans / TDD / verification-before-completion）
7. 不确定先问 Owner，**绝对不脑补安全相关决策**
```

**新 AI 启动的 5 个必跑命令**：

```bash
cd "D:/Documents/New project 2"
npx tsx scripts/check-env.ts
npx tsx scripts/scan-secrets.ts
npx tsx scripts/skill-audit-local.ts --skip-c1
npm run verify:intelligence
git log --oneline -20
```

---

## 九、当前必须由 Owner 提供的输入

1. **.env.local** 4 个 L1 key 写真实值（让 verify 5→8）
2. **1Password / Bitwarden** 凭据管理流程（避免下次 key 泄露）
3. **4 个 L1 key 申请**（UN Comtrade / FRED / Census / OS Hub 各自的申请 URL）
4. **1Password / Vault** key 备份（Owner 自做）

**当前 v3 状态**：5 verified / 8 P-Block 0 个完成 / 24 模型 9 个实装 / 13 agent 设计 0 个实装

---

## 十、给下一位 AI 的最后一句

v3 是 2026-07-02 当前最完整的"因果世界模型 + 6 验证门 + 13 agent 设计"实现。
**安全是硬约束**（SECURITY.md），**溯源是软要求**（RESEARCH_FOUNDATIONS.md），**所有 Owner 决策都需要 2 周冷静期**。

**加油**。如果发现 v3 当前真源有矛盾/漂移/缺失，立即**写 INCIDENTS/** 报告并**修 HANDOVER.md**，让下一位 AI 能从你的发现继续。
