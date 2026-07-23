# v3 Skills & MCP Registry — 已装实盘（2026-07-01）

> **核心原则**：每个 skill 必须绑定到 9 环节 DAG + 10 工作流。孤立的 skill 不装。
> **来源**：D:\Documents\New project 2\skills\ 实际目录（不是 GitHub 调研）
> **配套脚本**：`scripts/skill-audit-local.ts`（本地路径 + 跳过 trusted repo）

---

## 一、实盘对账（10 个 Git 仓库 / 3 个 npm 全局包）

| # | 仓库 | 声称数 | 实盘 SKILL.md | 真实可用 | 路径 |
|---|---|---|---|---|---|
| 1 | **ECC** | 67 agents + 277 skills | 37 目录 / 887 文件 | ~5-10 与 v3 相关 | `skills/ECC/.agents/skills/` |
| 2 | **superpowers** | 14 skills | **14** | 14（与 multi-ai-dev-sop 完美对齐）| `skills/superpowers/skills/` |
| 3 | **anthropic-skills** | 17 (官方) | **17** | 8 与 v3 配对 | `skills/anthropic-skills/skills/` |
| 4 | **mattpocock-skills** | 36 | **36** | 3-5 配对 | `skills/mattpocock-skills/skills/` |
| 5 | **composio-skills** | 1000+ | 仓库结构 | 不直接用 | `skills/composio-skills/` |
| 6 | **openclaw-skills** | 5300+ | categories/ | 不直接用 | `skills/openclaw-skills/categories/` |
| 7 | **marketing-skills** | 42 | 待清查 | 营销类（暂不需）| `skills/marketing-skills/` |
| 8 | **agent-reach** | 多平台 | 仓库结构 | 网页读取 | `skills/agent-reach/` |
| 9 | **national-stats-source** | MCP 源码 | `.py + .ts` | 国统局 MCP | `skills/national-stats-source/` |
| 10 | **trailofbits-skills** | 安全审计 | plugins/ 10+ | 安全静态扫描 | `skills/trailofbits-skills/plugins/` |

**npm 全局**：`national-stats-mcp@1.2.0` / `firecrawl@4.29.0` / `@smithery/cli@4.11.1`

---

## 二、9 环节 DAG × 已装 skills 三维矩阵

```
环节 ① 农业（棉花/羊毛/丝麻）                 数据源: ICE/郑商所
   ECC: market-research, deep-research
   national-stats: 国统局农业数据
   superpowers: 任何任务用 brainstorming

环节 ② 化学纤维（涤纶/尼龙/氨纶）            数据源: PTA/MEG 期货 + CCFEI
   ECC: market-research, exa-search
   anthropic: mcp-builder (建 CCFEI adapter)
   superpowers: brainstorming → writing-plans

环节 ③ 面料织造与染整                       数据源: 柯桥指数 + 盛泽指数
   ❌ 当前无专用 skill (需自建)
   ECC: backend-patterns (建柯桥指数 fetcher 时用)
   anthropic: docx / xlsx (输出报告)

环节 ④ 设计开发（趋势/BOM/打版）            数据源: WGSN + Pantone
   ECC: brand-voice, brand-discovery
   anthropic: frontend-design (UI 模板), theme-factory (设计 token)
   ECC: e2e-testing, webapp-testing (BOM 演示 UI 测试)

环节 ⑤ 生产制造（裁剪/缝制/品质）            数据源: 申洲/晶苑年报 + ILO
   ECC: verification-loop, tdd-workflow
   superpowers: test-driven-development
   trailofbits: static-analysis, audit-context-building
   anthropic: skill-creator (写新 skill)

环节 ⑥ 品牌运营（定位/定价/营销）            数据源: LVMH/迅销/H&M 年报
   ECC: market-research, exa-search, deep-research
   marketing-skills: SEO 42 件
   composio-skills: Shopify/HubSpot/Salesforce (待对接)

环节 ⑦ 渠道与零售                          数据源: 阿里/京东 + 蝉妈妈
   agent-reach: 多平台互联网读取
   ECC: content-engine, crosspost, x-api
   anthropic: web-artifacts-builder, canvas-design

环节 ⑧ 消费者行为                          数据源: 国统局 + 麦肯锡
   national-stats-mcp: 国统局月度
   ECC: market-research, iterative-retrieval
   superpowers: using-superpowers (元入口)

环节 ⑨ 回收与循环经济                      数据源: Textile Exchange + GRS
   ❌ 当前无专用 skill
   ECC: backend-patterns, eval-harness (评估回收率)
```

---

## 三、已装 4 仓库 × 6 大工作流配对矩阵

> **6 大工作流** = ARCHITECTURE_SUMMARY §五的 10 个工作流的核心子集。

| 工作流 | 触发 | 关键 Skill 组合 | 已装 → 启用 |
|---|---|---|---|
| **WF1 每日宏观简报** | cron 每日 08:00 | national-stats-mcp + ECC market-research + anthropic xlsx（附件）| ✅ 全装 |
| **WF2 棉花/纱线价格追踪** | cron 工作日 09:00 | national-stats-mcp + ECC deep-research + superpowers TDD (如果写新 fetcher)| ✅ 全装 |
| **WF3 品牌年报分析** | 季度 | ECC market-research + exa-search + anthropic pptx（输出 PPT）| ✅ 全装 |
| **WF4 弹性系数 OLS 回归** | 月度 | superpowers TDD（写新 skill） + ECC eval-harness（验证） + python sandbox | ✅ 全装 |
| **WF5 PR 评审 + 模拟 what-if** | GitHub webhook | superpowers TDD + verification-before-completion + trailofbits static-analysis | ✅ 全装 |
| **WF6 跨平台内容分发** | 手动 | ECC content-engine + crosspost + x-api + composio-skills (Shopify 等) | ✅ 全装 |

---

## 四、v3 工程方法论入口（superpowers 14 件清单）

| # | Skill | 触发 | 与 multi-ai-dev-sop 关系 |
|---|---|---|---|
| 1 | **using-superpowers** | 任何任务开始 | meta 入口（取代原 thinking_mode） |
| 2 | **brainstorming** | 任何写代码/设计前 | 取代 G0/G1 阶段 |
| 3 | **writing-plans** | 多步任务前 | 取代 G3 任务拆解 |
| 4 | **test-driven-development** | 任何写代码前 | 取代 G4 工程实现 |
| 5 | **systematic-debugging** | 任何 bug | 取代 G5 QA 失败时 |
| 6 | **verification-before-completion** | 任何"完成"声明 | 取代 G7 交付确认 |
| 7 | **requesting-code-review** | PR / 重要改动 | 取代 G6 审计 |
| 8 | **receiving-code-review** | 收到 review 后 | 配 #7 |
| 9 | **subagent-driven-development** | 多 subagent 任务 | 取代 multi-ai-dev-sop §三 |
| 10 | **dispatching-parallel-agents** | 2+ 独立任务 | 配 #9 |
| 11 | **executing-plans** | 执行写好的 plan | 配 #3 |
| 12 | **finishing-a-development-branch** | 实现完成 | 配 #11 |
| 13 | **using-git-worktrees** | 隔离 feature | 辅助 |
| 14 | **writing-skills** | 写新 skill | 配 v3 L5 自建 |

**关键洞察**：multi-ai-dev-sop.md §一到 §五 的 7 RACI + 9 门禁 + 5 质量门**全部可由 superpowers 14 件覆盖**。建议把 multi-ai-dev-sop.md 标记 DEPRECATED，引用 superpowers 14 件作为新入口。

---

## 五、anthropic 17 件 × v3 9 环节精准配对

| # | Skill | 与 v3 哪个环节/工作流配对 | 状态 |
|---|---|---|---|
| 1 | **docx** | WF1 简报附件 + WF3 品牌年报 Word 输出 | 🟢 必装 |
| 2 | **pdf** | WF3 品牌年报 PDF 输入 + WF4 合同审查 | 🟢 必装 |
| 3 | **pptx** | WF3 品牌年报 PPT 输出 | 🟢 必装 |
| 4 | **xlsx** | WF1 简报附件（数据快照） | 🟢 必装 |
| 5 | **skill-creator** | v3 L5 自建 skill 引擎 | 🟢 必装 |
| 6 | **mcp-builder** | v3 9 个 fetch adapter 升级为标准 MCP server | 🟢 必装 |
| 7 | **frontend-design** | Launch Desk UI（如未来合并） | 🟡 备 |
| 8 | **webapp-testing** | v3 4 大面板 E2E 测试 | 🟢 必装 |
| 9 | **brand-guidelines** | ECC/Launch Desk 品牌一致性 | 🟡 备 |
| 10 | **theme-factory** | WF6 跨平台主题 | 🟡 备 |
| 11 | **canvas-design** | 内部幻灯片 | 🟡 备 |
| 12 | **web-artifacts-builder** | v3 4 面板的 HTML 原型 | 🟡 备 |
| 13 | **internal-comms** | 团队周报 | 🟡 备 |
| 14 | **doc-coauthoring** | 9 环节文档共同撰写 | 🟡 备 |
| 15 | **slack-gif-creator** | 非必需 | 🟡 备 |
| 16 | **algorithmic-art** | 不适用 | 🔴 不用 |
| 17 | **claude-api** | 元 SDK | 🟡 备 |

---

## 六、ECC 37 个 skill × v3 9 环节筛选结果

### 6.1 直接配对（5 个）

| ECC skill | 配对环节/工作流 | 优先级 |
|---|---|---|
| **market-research** | WF1/WF3 — 决策导向研究 + TAM/SAM/SOM | 🟢 P0 |
| **deep-research** | WF3 — firecrawl + exa 多源研究 | 🟢 P0 |
| **exa-search** | WF3/WF6 — 自然语言 web/code/company 搜索 | 🟢 P0 |
| **content-engine** | WF6 — 平台原生内容系统 | 🟡 P1 |
| **crosspost** | WF6 — X/LinkedIn/Threads/Bluesky 多平台 | 🟡 P1 |

### 6.2 间接相关（10 个）

| ECC skill | 用途 | 优先级 |
|---|---|---|
| **tdd-workflow** | 配 superpowers TDD | 🟢 P0 |
| **verification-loop** | 配 superpowers verification-before-completion | 🟢 P0 |
| **everything-claude-code** | ECC 项目开发约定（已加载） | 🟢 P0 |
| **coding-standards** | 跨项目编码规范 | 🟡 P1 |
| **security-review** | 配 trailofbits static-analysis | 🟡 P1 |
| **backend-patterns** | 写 src/intelligence/*.ts 时 | 🟡 P1 |
| **api-design** | 写 MCP server REST 端点 | 🟡 P1 |
| **mcp-server-patterns** | 配 anthropic mcp-builder | 🟡 P1 |
| **e2e-testing** | 配 anthropic webapp-testing | 🟡 P1 |
| **brand-discovery / brand-voice** | 营销内容 | 🟡 P2 |

### 6.3 不适用（22 个）

所有 C++/Go/Rust/Kotlin/Java/Django/F#/Quarkus/Perl/Swift/Flutter/KMP 专用 review + build-resolver — v3 是 TS + Express，不适用。**保留仓库但不装载**。

---

## 七、装入决策（修订版 / 基于实盘）

### 7.1 现状

```
✅ 已装 14 个项目（INSTALLATION_RECORD）
✅ 3 个 npm 全局包
✅ 与 v3 9 环节直接配对的 skill：~25 个
✅ 与 v3 工程方法论配对：superpowers 14 件全覆盖
✅ 审计脚本：scripts/skill-audit-local.ts（已写）
```

### 7.2 不再"装入新 skill"——改为"启用已装"

```
不再发 npx skills add 任何新仓库
仅审计已装 14 个项目，标 ACCEPT / MANUAL_REVIEW / REJECT
不通过的用 superpowers writing-skills 改写或 sandbox/ 隔离
```

### 7.3 优先级

| 任务 | 工时 | 价值 |
|---|---|---|
| 跑一次 skill-audit-local（基线数据）| 0.5h | 看到 ACCEPT/REJECT 全景 |
| 把 multi-ai-dev-sop.md 标 DEPRECATED，引用 superpowers 14 件 | 0.5h | 消除双轨 |
| 用 brainstorming 走 P-Block 1 启动 | 1h | v3 第一个产线 |
| 用 TDD 改 src/intelligence/officialApis.ts（4 个未通过 key）| 1d | 加 4 个 verified 源 |
| 用 verification-before-completion 跑 verify:intelligence | 0.5h | baseline |

---

## 八、风险与边界

### 已识别

```
1. ECC claim 277 vs 实盘 37 — 大部分是 marketplace 公告，不是真 SKILL.md
2. openclaw-skills 5300+ — 仓库结构，无 SKILL.md
3. composio-skills 1000+ — 仓库结构，需走 Smithery CLI 装
4. trailofbits 走 plugin 结构（非 skill 目录）— 装入机制不同
5. superpowers 14 件的 PR 拒绝率 94% — 装后升级要慎重
6. national-stats-source 真实数据源是 nbs.gov.cn + 1.2.0 npm — 装入双源
```

### 不做

```
❌ 不装新第三方 skill（已装 14 个够用）
❌ 不订阅任何收费 skill 平台
❌ 不修改 INSTALLATION_RECORD 之外的项目
❌ 不假设 npm 全局包自动启用（需 npm link）
```

---

## 九、给 v3 Owner 的 5 个建议

1. **第一优先级**：跑 `npx tsx scripts/skill-audit-local.ts` 看 14 个项目 + 887 个 SKILL.md 的 ACCEPT/REJECT 全景（30 秒）
2. **第二优先级**：用 `superpowers/using-superpowers` 启动每个新任务（覆盖 multi-ai-dev-sop）
3. **第三优先级**：用 `anthropic/mcp-builder` 把 src/intelligence 9 个 adapter 升级为标准 MCP server
4. **第四优先级**：用 `ECC/market-research` 改写 weekly brief（不再依赖 mock）
5. **第五优先级**：用 `trailofbits/static-analysis` 跑 src/intelligence 全部代码

---

**版本 v2.0 · 2026-07-01 · 基于实盘 skills/ 目录**