# Skills / 能力清单 × 行业 × 岗位矩阵

> **版本**：v1.0 | **日期**：2026-07-01
> **目的**：按行业和岗位梳理所需 Skills + MCP + 工作流，支持 v3 跨行业扩展

---

## ⭐ 使用方式

```
1. 找到你的行业（第二~八节）
2. 找到你的岗位（每个行业的子表）
3. 岗位行 = 该岗位需要的所有 Skills
4. 每个 Skill 标注：✅ 必需 / ⚡ 推荐 / ○ 可选 / ❌ 不需要
5. 对应 MCP 和工作流在右侧列
```

---

## 一、行业覆盖总览

| # | 行业 | 代号 | v3 核心场景 | 优先级 |
|---|------|------|------------|--------|
| 1 | **针织服装工贸** | GARMENT | 订单→生产→出货（当前主业） | P0 |
| 2 | **跨境贸易** | TRADE | 进出口+汇率+关税+物流 | P0 |
| 3 | **供应链管理** | SCM | 原料采购+库存+外协+质检 | P1 |
| 4 | **电商零售** | ECOM | 平台运营+选品+定价+履约 | P2 |
| 5 | **智能制造** | MFG | 生产排程+良品率+设备维护 | P2 |
| 6 | **财务金融** | FINANCE | 成本核算+发票+汇率+融资 | P1 |
| 7 | **人力资源** | HR | 招聘+薪酬+考勤+培训 | P3 |

---

## 二、针织服装工贸（GARMENT）

### 2.1 销售/跟单岗位

| Skill | 说明 | 级别 | MCP | 工作流 |
|-------|------|------|-----|--------|
| fetch_comtrade_flow | 拉客户国进出口数据 | ✅ | official-source-adapters | 客户健康度 |
| fetch_japan_customs_excel | 日本海关 Excel（对日出口） | ✅ | official-source-adapters | 客户健康度 |
| fetch_hkex_pdf | 港交所财报（客户上市信息） | ⚡ | official-source-adapters | 客户健康度 |
| causal_dag | 因果分析（客户为什么砍单） | ✅ | ark-memory + evidence-ledger | 价格异动/对话 |
| scenario_predict | 3 场景模拟（接单预测） | ⚡ | ark-memory | 客户健康度 |
| obsidian_writer | 写客户报告/接单分析 | ✅ | 无 | 所有输出工作流 |
| report_formatter | 报告格式化 | ✅ | 无 | 所有输出工作流 |
| fetch_cotlook | Cotlook 棉花报价 | ⚡ | official-source-adapters | 价格异动 |
| source_scorer | 信源评分 | ○ | evidence-ledger | 竞品情报 |
| websearch_negative | 负面舆情搜索 | ⚡ | weighted-websearch | 竞品情报 |

**完整工作流**：每日简报 → 客户健康度 → 竞品情报 → 月度报告

### 2.2 采购/原料岗位

| Skill | 说明 | 级别 | MCP | 工作流 |
|-------|------|------|-----|--------|
| fetch_world_bank | 大宗商品价格（棉花/化纤） | ✅ | official-source-adapters | 价格异动 |
| fetch_fred_observation | 汇率/利率/美国经济指标 | ✅ | official-source-adapters | 汇率风险 |
| fetch_comtrade_flow | 原料进出口流量 | ✅ | official-source-adapters | 供应链中断 |
| causal_dag | 价格传导分析 | ✅ | ark-memory | 价格异动 |
| trend_forecast | 价格趋势预测 | ✅ | ark-memory | 汇率风险/价格异动 |
| risk_assessor | 囤料风险评估 | ⚡ | ark-memory | 关税影响 |
| obsidian_writer | 写采购分析报告 | ✅ | 无 | 所有输出工作流 |
| watch_excel_file | 监控 Excel 报价单 | ⚡ | 无 | 每日简报 |
| fetch_1688_price | 1688 原料价格 | ⚡ | weighted-websearch | 价格异动 |

**完整工作流**：价格异动 → 汇率风险 → 供应链中断 → 关税影响 → 月度报告

### 2.3 生产/厂长岗位

| Skill | 说明 | 级别 | MCP | 工作流 |
|-------|------|------|-----|--------|
| watch_excel_file | 监控 Excel 报工/良品率 | ✅ | 无 | 每日简报 |
| causal_dag | 良品率下降根因分析 | ✅ | ark-memory | 对话式探索 |
| obsidian_writer | 写生产报告 | ✅ | 无 | 所有输出工作流 |
| source_scorer | 外协厂评分 | ⚡ | evidence-ledger | 竞品情报 |
| confidence_calculator | 质检置信度计算 | ⚡ | evidence-ledger | 每日简报 |
| risk_assessor | 交期风险评估 | ⚡ | ark-memory | 供应链中断 |

**完整工作流**：每日简报 → 对话式探索 → 供应链中断 → 月度报告

### 2.4 财务/成本岗位

| Skill | 说明 | 级别 | MCP | 工作流 |
|-------|------|------|-----|--------|
| fetch_fred_observation | 汇率/利率 | ✅ | official-source-adapters | 汇率风险 |
| causal_dag | 成本变动分析 | ✅ | ark-memory | 价格异动 |
| trend_forecast | 现金流预测 | ⚡ | ark-memory | 月度报告 |
| obsidian_writer | 写财务分析 | ✅ | 无 | 所有输出工作流 |
| report_formatter | 发票/报表格式化 | ✅ | 无 | 月度报告 |
| counter_evidence_search | 成本审计反证 | ⚡ | weighted-websearch | 关税影响 |

**完整工作流**：汇率风险 → 价格异动 → 关税影响 → 月度报告

---

## 三、跨境贸易（TRADE）

### 3.1 外贸业务员

| Skill | 说明 | 级别 | MCP | 工作流 |
|-------|------|------|-----|--------|
| fetch_comtrade_flow | 客户国贸易数据 | ✅ | official-source-adapters | 客户健康度 |
| fetch_japan_customs_excel | 日本海关数据 | ✅ | official-source-adapters | 客户健康度 |
| causal_dag | 客户订单变化原因 | ✅ | ark-memory | 对话式探索 |
| fetch_fred_observation | 汇率趋势 | ✅ | official-source-adapters | 汇率风险 |
| websearch_negative | 客户负面舆情 | ⚡ | weighted-websearch | 竞品情报 |
| obsidian_writer | 写客户分析报告 | ✅ | 无 | 所有输出工作流 |
| scenario_predict | 出口报价模拟 | ⚡ | ark-memory | 客户健康度 |

### 3.2 单证/报关员

| Skill | 说明 | 级别 | MCP | 工作流 |
|-------|------|------|-----|--------|
| watch_excel_file | 监控 HS 编码变更 | ⚡ | 无 | 关税影响 |
| fetch_fred_observation | 汇率（结汇用） | ✅ | official-source-adapters | 汇率风险 |
| report_formatter | 报关单格式化 | ✅ | 无 | 月度报告 |
| obsidian_writer | 写合规报告 | ⚡ | 无 | 关税影响 |

---

## 四、供应链管理（SCM）

### 4.1 供应链经理

| Skill | 说明 | 级别 | MCP | 工作流 |
|-------|------|------|-----|--------|
| fetch_world_bank | 全球供应链指标 | ✅ | official-source-adapters | 供应链中断 |
| fetch_comtrade_flow | 进出口流量 | ✅ | official-source-adapters | 供应链中断 |
| causal_dag | 中断根因分析 | ✅ | ark-memory | 供应链中断 |
| risk_assessor | 供应链风险评分 | ✅ | ark-memory | 供应链中断 |
| trend_forecast | 供应趋势预测 | ⚡ | ark-memory | 月度报告 |
| websearch港口 | 港口拥堵搜索 | ⚡ | weighted-websearch | 供应链中断 |
| obsidian_writer | 写供应链报告 | ✅ | 无 | 所有输出工作流 |

### 4.2 仓储/物流

| Skill | 说明 | 级别 | MCP | 工作流 |
|-------|------|------|-----|--------|
| watch_excel_file | 监控库存变动 | ✅ | 无 | 每日简报 |
| causal_dag | 库存异常分析 | ⚡ | ark-memory | 对话式探索 |
| obsidian_writer | 写库存报告 | ✅ | 无 | 每日简报 |

---

## 五、电商零售（ECOM）

### 5.1 运营/选品

| Skill | 说明 | 级别 | MCP | 工作流 |
|-------|------|------|-----|--------|
| websearch_趋势 | 平台热搜/趋势 | ✅ | weighted-websearch | 竞品情报 |
| fetch_comtrade_flow | 品类进出口数据 | ⚡ | official-source-adapters | 竞品情报 |
| causal_dag | 销量变化原因 | ✅ | ark-memory | 对话式探索 |
| scenario_predict | 定价场景模拟 | ⚡ | ark-memory | 竞品情报 |
| obsidian_writer | 写运营报告 | ✅ | 无 | 所有输出工作流 |

### 5.2 客服/售后

| Skill | 说明 | 级别 | MCP | 工作流 |
|-------|------|------|-----|--------|
| websearch舆情 | 客户评价搜索 | ⚡ | weighted-websearch | 竞品情报 |
| obsidian_writer | 写客诉分析 | ⚡ | 无 | 月度报告 |

---

## 六、智能制造（MFG）

### 6.1 生产计划

| Skill | 说明 | 级别 | MCP | 工作流 |
|-------|------|------|-----|--------|
| watch_excel_file | 监控工单/排程 | ✅ | 无 | 每日简报 |
| causal_dag | 产能瓶颈分析 | ✅ | ark-memory | 对话式探索 |
| trend_forecast | 产能需求预测 | ⚡ | ark-memory | 月度报告 |
| obsidian_writer | 写排程报告 | ✅ | 无 | 所有输出工作流 |

### 6.2 质量管理

| Skill | 说明 | 级别 | MCP | 工作流 |
|-------|------|------|-----|--------|
| watch_excel_file | 监控良品率数据 | ✅ | 无 | 每日简报 |
| causal_dag | 不良品根因分析 | ✅ | ark-memory | 对话式探索 |
| confidence_calculator | 质检置信度 | ⚡ | evidence-ledger | 每日简报 |
| obsidian_writer | 写质量报告 | ✅ | 无 | 所有输出工作流 |

---

## 七、财务金融（FINANCE）

### 7.1 成本会计

| Skill | 说明 | 级别 | MCP | 工作流 |
|-------|------|------|-----|--------|
| fetch_fred_observation | 利率/汇率 | ✅ | official-source-adapters | 汇率风险 |
| causal_dag | 成本变动分析 | ✅ | ark-memory | 价格异动 |
| trend_forecast | 现金流预测 | ⚡ | ark-memory | 月度报告 |
| report_formatter | 财务报表格式化 | ✅ | 无 | 月度报告 |
| obsidian_writer | 写财务分析 | ✅ | 无 | 所有输出工作流 |

### 7.2 融资/风控

| Skill | 说明 | 级别 | MCP | 工作流 |
|-------|------|------|-----|--------|
| fetch_fred_observation | 利率趋势 | ✅ | official-source-adapters | 汇率风险 |
| fetch_world_bank | 宏观经济指标 | ⚡ | official-source-adapters | 月度报告 |
| risk_assessor | 信用风险评估 | ⚡ | ark-memory | 关税影响 |
| counter_evidence_search | 审计反证 | ⚡ | weighted-websearch | 关税影响 |
| obsidian_writer | 写风控报告 | ✅ | 无 | 所有输出工作流 |

---

## 八、人力资源（HR）

### 8.1 招聘/培训

| Skill | 说明 | 级别 | MCP | 工作流 |
|-------|------|------|-----|--------|
| websearch_人才 | 行业人才搜索 | ⚡ | weighted-websearch | 竞品情报 |
| obsidian_writer | 写招聘分析 | ⚡ | 无 | 月度报告 |

### 8.2 薪酬/考勤

| Skill | 说明 | 级别 | MCP | 工作流 |
|-------|------|------|-----|--------|
| watch_excel_file | 监控考勤数据 | ⚡ | 无 | 每日简报 |
| report_formatter | 工资单格式化 | ⚡ | 无 | 月度报告 |
| obsidian_writer | 写薪酬分析 | ⚡ | 无 | 月度报告 |

---

## 九、跨行业通用 Skills

| Skill | 说明 | 所有行业 | MCP |
|-------|------|---------|-----|
| obsidian_writer | 写入 Obsidian 知识库 | ✅ | 无 |
| report_formatter | 报告格式化 | ✅ | 无 |
| summary_generator | 摘要生成 | ✅ | 无 |
| causal_dag | 因果分析 | ✅ | ark-memory |
| websearch_weighted | 加权搜索 | ✅ | weighted-websearch |
| source_scorer | 信源评分 | ✅ | evidence-ledger |
| confidence_calculator | 置信度计算 | ✅ | evidence-ledger |
| cross_validation | 多源交叉验证 | ✅ | evidence-ledger |
| schema_validator | 数据验证 | ✅ | 无 |
| dedup_engine | 去重 | ✅ | 无 |
| format_normalizer | 格式标准化 | ✅ | 无 |

---

## 十、行业 × 岗位 × Skills 热力图

```
Skills          │ 销售 │ 采购 │ 生产 │ 财务 │ 外贸 │ 供应链 │ 电商 │ 智造 │ HR
────────────────┼──────┼──────┼──────┼──────┼──────┼───────┼──────┼──────┼────
fetch_world_bank│  ⚡  │  ✅  │  ❌  │  ⚡  │  ⚡  │  ✅   │  ⚡  │  ❌  │ ❌
fetch_comtrade  │  ✅  │  ✅  │  ❌  │  ❌  │  ✅  │  ✅   │  ⚡  │  ❌  │ ❌
fetch_fred      │  ⚡  │  ✅  │  ❌  │  ✅  │  ✅  │  ⚡   │  ❌  │  ❌  │ ❌
fetch_japan     │  ✅  │  ⚡  │  ❌  │  ❌  │  ✅  │  ❌   │  ❌  │  ❌  │ ❌
causal_dag      │  ✅  │  ✅  │  ✅  │  ✅  │  ✅  │  ✅   │  ✅  │  ✅  │ ⚡
scenario_predict│  ⚡  │  ⚡  │  ❌  │  ⚡  │  ⚡  │  ❌   │  ⚡  │  ❌  │ ❌
trend_forecast  │  ❌  │  ✅  │  ⚡  │  ⚡  │  ❌  │  ⚡   │  ❌  │  ⚡  │ ❌
risk_assessor   │  ❌  │  ⚡  │  ⚡  │  ⚡  │  ❌  │  ✅   │  ❌  │  ❌  │ ❌
counter_evidence│  ❌  │  ❌  │  ❌  │  ⚡  │  ❌  │  ❌   │  ❌  │  ❌  │ ❌
watch_excel     │  ⚡  │  ⚡  │  ✅  │  ❌  │  ❌  │  ✅   │  ❌  │  ✅  │ ⚡
websearch       │  ⚡  │  ❌  │  ❌  │  ❌  │  ❌  │  ⚡   │  ✅  │  ❌  │ ⚡
obsidian_writer │  ✅  │  ✅  │  ✅  │  ✅  │  ✅  │  ✅   │  ✅  │  ✅  │ ⚡
report_formatter│  ✅  │  ❌  │  ❌  │  ✅  │  ✅  │  ❌   │  ❌  │  ❌  │ ⚡
```

---

## 十一、行业 × 工作流适配

| 工作流 | GARMENT | TRADE | SCM | ECOM | MFG | FINANCE | HR |
|--------|---------|-------|-----|------|-----|---------|-----|
| 每日简报 | ✅ | ✅ | ✅ | ⚡ | ✅ | ⚡ | ○ |
| 价格异动 | ✅ | ✅ | ✅ | ⚡ | ⚡ | ✅ | ❌ |
| 客户健康度 | ✅ | ✅ | ⚡ | ✅ | ❌ | ⚡ | ❌ |
| 竞品情报 | ✅ | ⚡ | ❌ | ✅ | ❌ | ❌ | ⚡ |
| 关税影响 | ✅ | ✅ | ✅ | ⚡ | ⚡ | ✅ | ❌ |
| 供应链中断 | ✅ | ✅ | ✅ | ⚡ | ✅ | ⚡ | ❌ |
| 汇率风险 | ✅ | ✅ | ⚡ | ⚡ | ❌ | ✅ | ❌ |
| 对话式探索 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚡ |
| 月度报告 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 新数据源接入 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

---

> **使用方式**：找到你的行业 → 找到你的岗位 → 岗位行 = 你需要的 Skills 清单
>
> **扩展方式**：新行业只需新增行业节 + 热力图行 + 工作流列
