# Skills / MCP 平台 + 工作流 — 执行摘要

> **版本**：v1.2 | **日期**：2026-07-01 | **完整版**：SKILL_PLATFORM_TRUST_AND_SELECTION_RULES.md

---

## 一、25 个平台可信度一览

| 等级 | 数量 | 平台 | 用法 |
|------|------|------|------|
| **A+** | 1 | affaan-m/ECC（224K★） | 生产直接用，最大 harness 优化 |
| **A** | 7 | Anthropic Skills / Composio / Smithery / Skills.sh / VoltAgent/awesome-openclaw-skills / coreyhaines31/marketingskills / Agent-Reach | 生产直接用 |
| **B+** | 3 | AgenticSkills.io / Manus.im / joeseesun/qiaomu-design-advisor | Vetting 后用 |
| **B** | 5 | AITmpl / ClawHub / Skill-CN / NanoSkill.ai / 微信文章×3 | Vetting 后用 |
| **C** | 3 | SkillsMP / AgentSkillsHub / SkillCast | 仅测试环境 |
| **D** | 2 | Qoder Community / SkillHub.cn | **禁止安装** |

---

## 二、MCP 安全现状（AgenticSkills 审计）

```
73% 公共 MCP 服务器至少一项安全检查失败
├── 100% 公网暴露服务器无认证（Knostic 119 样本）
├── 43% 命令注入（Equixly）
├── 53% 静态密钥（Astrix 5,200+ 仓库）
├── 82% 路径遍历风险（Endor 2,614 实现）
├── 仅 8.5% 使用 OAuth
└── 首个恶意 MCP 在野：postmark-mcp（2025-09）
```

**致命三角**（v3 必须隔离）：
```
私有数据访问 + 不可信内容 + 外部通信 = 数据外泄
v3 的 Collector→Writer 流水线天然触发此组合
```

---

## 三、v3 安全铁律（8 条）

| # | 规则 | 强制 |
|---|------|------|
| 1 | 安装前跑 12 分钟审计（mcp-scan + 手动审查） | ✅ |
| 2 | 致命三角隔离（Collector 读私有数据时禁止同时连公共 MCP） | ✅ |
| 3 | 所有社区 MCP 用 mcp-context-protector 包裹 | ✅ |
| 4 | Docker 沙箱运行（--no-new-privileges --read-only --no-host-network） | ✅ |
| 5 | 用 scoped token，不用长期静态密钥 | ✅ |
| 6 | 工具调用频率 >1.5/s 持续 10s → 自动熔断 | ✅ |
| 7 | 工具描述 ≤280 tokens（禁止 >1400） | ✅ |
| 8 | 版本锁定，Dependabot PR 需人工审批 | ✅ |

---

## 四、三种范式统一

```
SKILL.md（指令）  → Agent 按指令执行专业任务
MCP（工具）       → Agent 通过 JSON-RPC 调用外部服务
Playbook（入口）  → 非技术用户一键启动工作流（Manus 模式）
         ↓
    WorkflowEngine 编排
         ↓
    10 个标准工作流模板
```

---

## 五、10 个标准工作流

| # | 工作流 | 触发方式 | 参与角色 | 成本 |
|---|--------|---------|---------|------|
| 1 | 每日情报简报 | 每日 08:00 | Collector→Cleaner→Weigher→Writer | ~¥0.5 |
| 2 | 价格异动分析 | 价格变化>3% | Collector→Reasoner→Devil→Writer | ~¥2 |
| 3 | 客户健康度评估 | 手动/对话 | Collector→Reasoner→Predictor→Writer | ~¥3 |
| 4 | 竞品情报监控 | 每周一 09:00 | Collector→Cleaner→Weigher→Reasoner→Writer | ~¥4 |
| 5 | 关税/政策影响 | 政策公告 | Collector→Reasoner→Devil→Predictor→Writer | ~¥5 |
| 6 | 供应链中断预警 | 港口拥堵/物流延误 | Collector→Reasoner→Writer | ~¥2 |
| 7 | 汇率风险评估 | JPY/USD 变化>1.5% | Collector→Reasoner→Predictor→Writer | ~¥2 |
| 8 | 老板对话式探索 | 对话触发 | Reasoner→Devil（可选） | ~¥1 |
| 9 | 月度综合报告 | 每月 1 日 | All 7 roles | ~¥10 |
| 10 | 新数据源接入 | 手动请求 | Collector→Cleaner→Weigher→Writer | ~¥1 |

---

## 六、7 角色 × Skills/MCP 配置

| 角色 | 必需 Skills | 必需 MCP | 风格 | 模型 |
|------|------------|---------|------|------|
| **Collector** | 8 个（fetch_* + watch_*） | official-source-adapters + weighted-websearch | 保守 | Flash（便宜） |
| **Cleaner** | 3 个（schema/dedup/normalizer） | 无（规则引擎） | 保守 | 无需 LLM |
| **Weigher** | 3 个（scorer/confidence/cross） | evidence-ledger | 均衡 | 无需 LLM |
| **Reasoner** | 3 个（causal/scenario/lookup） | ark-memory + evidence-ledger | 均衡 | Opus（强推理） |
| **Devil** | 3 个（counter/fallacy/bias） | weighted-websearch | 激进 | DeepSeek Pro（异源） |
| **Predictor** | 3 个（forecast/risk/opportunity） | ark-memory | 探索 | Sonnet |
| **Writer** | 3 个（obsidian/format/summary） | 无 | 均衡 | Flash（简单写入） |

---

## 七、用户角色 × 自动组合

| 用户 | 主要角色 | 自动 Skills | 交互模式 |
|------|---------|------------|---------|
| **老板** | Reasoner+Predictor+Writer | causal_dag + scenario_predict + obsidian_writer | 对话式 |
| **销售总监** | Collector+Reasoner+Writer | fetch_comtrade + causal_dag + obsidian_writer | 看板式 |
| **采购经理** | Collector+Reasoner+Predictor | fetch_world_bank + fetch_fred + trend_forecast | 告警式 |
| **生产厂长** | Collector+Reasoner+Writer | watch_excel + causal_dag + obsidian_writer | 看板式 |

---

## 八、12 分钟 MCP 审计流程

```
1. 找源码（拒绝无可验证 git 仓库）
2. 查维护者（新账户+少量包 = 视为恶意）
3. 读 SECURITY.md（无文件 = 降级）
4. Diff 近期发布（npm diff）
5. 跑 mcp-scan（npx @invariantlabs/mcp-scan）
6. 用 mcp-context-protector 包裹
7. Docker 沙箱运行
8. 检查 OAuth 握手
9. 审计 token 存储
10. 检查原始 JSON 工具描述
11. 对照 vulnerablemcp.info 测试
12. 设 kill switch（频率熔断）
```

---

## 九、实施路径

| Phase | 时间 | 内容 |
|-------|------|------|
| **Phase 0** | Week 0 | MCP 安全加固（mcp-scan + 沙箱 + 致命三角隔离） |
| **Phase 1** | Week 1-2 | 基础规则引擎（trust_filter + skill_selection + cost_optimization） |
| **Phase 2** | Week 3-4 | 工作流编排引擎（10 模板 + Scheduler + SkillRouter） |
| **Phase 3** | Week 5-6 | 平台集成（A 级平台 + Agent-Reach + ECC） |
| **Phase 4** | Week 7-8 | 扩展（Manus Playbook + AgenticSkills + 剩余工作流） |

---

> **一句话总结**：25 平台 A/B/C/D 分级 → 73% MCP 安全问题必须前置加固 → 7 角色 × 10 工作流 × 8 安全规则 → Phase 0 先跑审计再建功能。
