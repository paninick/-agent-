# 统一 Skills 注册表（按维度分类）

> **版本**：v1.0 | **日期**：2026-07-01
> **原则**：所有发现的 Skills 按 6 个维度统一注册，再交叉匹配产业链环节

---

## 一、6 个维度定义

| 维度 | 说明 | 分类值 |
|------|------|--------|
| **D1 功能** | 这个 Skill 做什么 | 数据采集/分析推理/输出生成/安全审计/工作流编排/网页操作/搜索 |
| **D2 产业链环节** | 服务于哪个环节 | ①原料 ②化纤 ③面料 ④设计 ⑤制造 ⑥品牌 ⑦渠道 ⑧消费者 ⑨回收 全链 |
| **D3 数据源** | 连接什么平台 | 国统局/通达信/企查查/天眼查/WebSearch/Firecrawl/Composio/Smithery/其他 |
| **D4 可信度** | 安全等级 | A（金标）/ B（可靠）/ C（可用）/ D（禁止） |
| **D5 成本** | 调用费用 | 免费/按量付费/订阅制 |
| **D6 自动化** | 执行方式 | 全自动（cron+MCP）/ 半自动（对话触发）/ 手动（人工操作） |

---

## 二、已发现 Skills 完整清单

### 2.1 数据采集类

| # | Skill 名称 | 来源 | D1 | D2 | D3 | D4 | D5 | D6 |
|---|-----------|------|----|----|----|----|----|----|
| 1 | national-stats-mcp | npm（Ddhjx-code） | 数据采集 | 全链 | 国统局 | **A** | 免费 | 全自动 |
| 2 | fetch_world_bank | anthropic-skills | 数据采集 | ①②⑧ | World Bank | **A** | 免费 | 全自动 |
| 3 | fetch_comtrade_flow | anthropic-skills | 数据采集 | ⑤⑫ | UN Comtrade | **A** | 免费 | 全自动 |
| 4 | fetch_fred_observation | anthropic-skills | 数据采集 | ①⑬ | FRED | **A** | 免费 | 全自动 |
| 5 | fetch_eurostat_point | anthropic-skills | 数据采集 | 全链 | Eurostat | **A** | 免费 | 全自动 |
| 6 | fetch_japan_customs_excel | custom-playwright | 数据采集 | ⑤⑫ | 日本海关 | **B** | 免费 | 全自动 |
| 7 | fetch_hkex_pdf | custom-playwright | 数据采集 | ⑥ | 港交所 | **B** | 免费 | 全自动 |
| 8 | watch_excel_file | custom-watchdog | 数据采集 | ⑤ | 本地 Excel | **B** | 免费 | 全自动 |
| 9 | read_manual_input_form | custom-form | 数据采集 | ⑤ | 人工录入 | **B** | 免费 | 手动 |
| 10 | fetch_cotlook | custom-scraping | 数据采集 | ① | Cotlook 棉花 | **B** | 免费 | 半自动 |
| 11 | fetch_1688_price | custom-scraping | 数据采集 | ①② | 1688 | **C** | 免费 | 半自动 |
| 12 | firecrawl-cli | firecrawl（官方） | 数据采集 | 全链 | 任意网页 | **A** | 按量付费 | 全自动 |
| 13 | tdx-mcp-server | npm（oficcejo） | 数据采集 | ⑤⑥ | 通达信（行情） | **B** | 免费 | 全自动 |
| 14 | 通达信 MCP（官方） | 通达信 | 数据采集 | ⑤⑥⑬ | 通达信（财报/宏观） | **A** | 免费积分 | 全自动 |
| 15 | qcc-company | 企查查 MCP | 数据采集 | ⑤⑥ | 企查查 | **A** | 按量付费 | 全自动 |
| 16 | tyc-mcp | 天眼查 MCP | 数据采集 | ⑤⑥ | 天眼查 | **A** | 按量付费 | 全自动 |
| 17 | agent-reach | GitHub（Panniantong） | 数据采集 | ⑧⑦ | Twitter/Reddit/B站/小红书 | **A** | 免费 | 全自动 |

### 2.2 分析推理类

| # | Skill 名称 | 来源 | D1 | D2 | D3 | D4 | D5 | D6 |
|---|-----------|------|----|----|----|----|----|----|
| 18 | causal_dag | custom-llm | 分析推理 | 全链 | LLM 推理 | **B** | ¥0.02/次 | 半自动 |
| 19 | scenario_predict | custom-llm | 分析推理 | 全链 | LLM 推理 | **B** | ¥0.02/次 | 半自动 |
| 20 | trend_forecast | custom-llm | 分析推理 | ①②⑧ | LLM 推理 | **B** | ¥0.02/次 | 半自动 |
| 21 | risk_assessor | custom-llm | 分析推理 | ①⑤⑥⑬ | LLM 推理 | **B** | ¥0.02/次 | 半自动 |
| 22 | counter_evidence_search | custom-llm | 分析推理 | 全链 | LLM + WebSearch | **B** | ¥0.01/次 | 半自动 |
| 23 | logical_fallacy_detector | custom-llm | 分析推理 | 全链 | LLM 推理 | **B** | ¥0.01/次 | 半自动 |
| 24 | bias_identifier | custom-llm | 分析推理 | 全链 | LLM 推理 | **B** | ¥0.01/次 | 半自动 |

### 2.3 输出生成类

| # | Skill 名称 | 来源 | D1 | D2 | D3 | D4 | D5 | D6 |
|---|-----------|------|----|----|----|----|----|----|
| 25 | obsidian_writer | custom-file-io | 输出生成 | 全链 | 本地 Obsidian | **B** | 免费 | 全自动 |
| 26 | report_formatter | custom-template | 输出生成 | 全链 | 本地模板 | **B** | 免费 | 全自动 |
| 27 | summary_generator | custom-llm | 输出生成 | 全链 | LLM 推理 | **B** | ¥0.005/次 | 全自动 |
| 28 | email_sender | custom-integration | 输出生成 | 全链 | 邮件 API | **B** | 免费 | 全自动 |
| 29 | feishu_webhook | custom-integration | 输出生成 | 全链 | 飞书 Webhook | **B** | 免费 | 全自动 |

### 2.4 搜索类

| # | Skill 名称 | 来源 | D1 | D2 | D3 | D4 | D5 | D6 |
|---|-----------|------|----|----|----|----|----|----|
| 30 | websearch_weighted | 内置 | 搜索 | 全链 | WebSearch | **A** | 免费 | 全自动 |
| 31 | find-skills | vercel-labs | 搜索 | 全链 | Skill 生态 | **A** | 免费 | 手动 |
| 32 | social-media-skills | charlie947 | 搜索 | ⑦⑧ | 社交媒体 | **B** | 免费 | 手动 |
| 33 | mcp-builder | anthropics | 搜索 | 全链 | MCP 构建 | **A** | 免费 | 手动 |

### 2.5 证据加权类

| # | Skill 名称 | 来源 | D1 | D2 | D3 | D4 | D5 | D6 |
|---|-----------|------|----|----|----|----|----|----|
| 34 | source_scorer | custom-rule-engine | 分析推理 | 全链 | 权重表 | **B** | 免费 | 全自动 |
| 35 | confidence_calculator | custom-rule-engine | 分析推理 | 全链 | 规则引擎 | **B** | 免费 | 全自动 |
| 36 | cross_validation | custom-rule-engine | 分析推理 | 全链 | 多源比对 | **B** | 免费 | 全自动 |
| 37 | schema_validator | custom-rule-engine | 数据采集 | 全链 | JSON Schema | **B** | 免费 | 全自动 |
| 38 | dedup_engine | custom-rule-engine | 数据采集 | 全链 | Hash 去重 | **B** | 免费 | 全自动 |
| 39 | format_normalizer | custom-rule-engine | 数据采集 | 全链 | 正则转换 | **B** | 免费 | 全自动 |

### 2.6 安全审计类

| # | Skill 名称 | 来源 | D1 | D2 | D3 | D4 | D5 | D6 |
|---|-----------|------|----|----|----|----|----|----|
| 40 | mcp-scan | invariant-labs | 安全审计 | 全链 | MCP 服务器 | **A** | 免费 | 全自动 |
| 41 | mcp-context-protector | trail-of-bits | 安全审计 | 全链 | MCP 工具 | **A** | 免费 | 全自动 |
| 42 | erp-verify | custom-rule-engine | 安全审计 | ⑤ | ERP 代码 | **B** | 免费 | 半自动 |

---

## 三、产业链环节 × Skills 矩阵（热力图）

```
Skill               │①原料│②化纤│③面料│④设计│⑤制造│⑥品牌│⑦渠道│⑧消费│⑨回收│全链
────────────────────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┼────
national-stats-mcp  │  ★  │  ★  │  ★  │  ○  │  ★  │  ★  │  ★  │  ★  │  ○  │  ★
fetch_world_bank    │  ★  │  ★  │  ○  │  ○  │  ○  │  ○  │  ○  │  ★  │  ○  │  ○
fetch_comtrade_flow │  ○  │  ○  │  ○  │  ○  │  ★  │  ★  │  ○  │  ○  │  ○  │  ○
fetch_fred          │  ★  │  ○  │  ○  │  ○  │  ○  │  ○  │  ○  │  ○  │  ○  │  ○
firecrawl-cli       │  ★  │  ★  │  ★  │  ★  │  ★  │  ★  │  ★  │  ★  │  ★  │  ★
agent-reach         │  ○  │  ○  │  ○  │  ○  │  ○  │  ★  │  ★  │  ★  │  ○  │  ○
causal_dag          │  ★  │  ★  │  ★  │  ○  │  ★  │  ★  │  ○  │  ○  │  ○  │  ★
obsidian_writer     │  ○  │  ○  │  ○  │  ○  │  ○  │  ○  │  ○  │  ○  │  ○  │  ★
mcp-scan            │  ○  │  ○  │  ○  │  ○  │  ○  │  ○  │  ○  │  ○  │  ○  │  ★
```

---

## 四、待补充清单（需要你确认/添加）

### 4.1 通达信 MCP 工具（需要账号）

| # | 工具名 | 用途 | D4 | D5 | 状态 |
|---|--------|------|----|----|------|
| 43 | tdx_api_data → 利润表 | 上市公司财报 | A+ | 免费 | 待配置 |
| 44 | tdx_api_data → 资产负债表 | 企业财务健康 | A+ | 免费 | 待配置 |
| 45 | tdx_api_data → 现金流量表 | 投资动向 | A+ | 免费 | 待配置 |
| 46 | tdx_api_data → 主营构成 | 业务拆解 | A+ | 免费 | 待配置 |
| 47 | tdx_quotes | 实时股价/PE | A+ | 免费 | 待配置 |
| 48 | tdx_kline | 期货 K 线 | A+ | 免费 | 待配置 |
| 49 | wenda_report_query | 券商研报 | A | 免费 | 待配置 |
| 50 | wenda_news_query | 行业新闻 | A | 免费 | 待配置 |
| 51 | wenda_notice_query | 公司公告 | A | 免费 | 待配置 |

### 4.2 企查查 MCP 工具

| # | 工具名 | 用途 | D4 | D5 | 状态 |
|---|--------|------|----|----|------|
| 52 | get_company_profile | 企业工商信息 | A | 按量 | 待配置 |
| 53 | get_financial_data | 中小企业财务 | A | 按量 | 待配置 |
| 54 | get_bidding_info | 招投标 | A | 按量 | 待配置 |
| 55 | get_company_risk_scan | 35 项风险扫描 | A | 按量 | 待配置 |
| 56 | get_patent_info | 专利 | A | 按量 | 待配置 |

### 4.3 天眼查 MCP 工具

| # | 工具名 | 用途 | D4 | D5 | 状态 |
|---|--------|------|----|----|------|
| 57 | search_companies_by_industry_region | 产业集群摸底 | A | 按量 | 待配置 |
| 58 | get_company_basic_profile | 企业背景 | A | 按量 | 待配置 |
| 59 | search_patents | 专利搜索 | A | 按量 | 待配置 |

### 4.4 自定义 Skills（v3 需要开发）

| # | Skill 名称 | 用途 | D1 | D2 | D5 | 状态 |
|---|-----------|------|----|----|----|----|
| 60 | cotton_to_fabric_cost | 棉花到面料成本传导 | 分析推理 | ①→③ | ¥0.01 | 待开发 |
| 61 | forex_impact_calculator | 汇率影响计算 | 分析推理 | ⑤⑥ | ¥0.01 | 待开发 |
| 62 | order_volatility_detector | 订单波动检测 | 数据采集 | ⑤⑪ | 免费 | 待开发 |
| 63 | supply_chain_disruption_alert | 供应链中断预警 | 分析推理 | 全链 | ¥0.02 | 待开发 |
| 64 | price_elasticity_calculator | 弹性系数计算 | 分析推理 | ⑦⑧ | ¥0.01 | 待开发 |

---

## 五、安装命令汇总

```bash
# A 级（生产直接用）
npx skills add anthropics/skills          # 官方 Skills 规范
npx skills add ComposioHQ/awesome-claude-skills  # 社区策展
npx skills add vercel-labs/find-skills    # Skill 发现
npx skills add firecrawl/firecrawl-cli    # 网页抓取
npx skills add agenticskills/skills       # 技能目录

# 国统局 MCP
npm i -g national-stats-mcp              # 免费，无需 Key

# B 级（Vetting 后用）
npx skills add charlie947/social-media-skills  # 社交媒体
npx skills add anthropics/mcp-builder    # MCP 构建

# 安全工具
npm i -g @invariantlabs/mcp-scan         # MCP 审计
```

---

> **注册表 = 64 个 Skills × 6 个维度 × 9 个产业链环节**
>
> **下一步**：确认待配置/待开发清单 → 优先接入免费+全自动的 Skills
