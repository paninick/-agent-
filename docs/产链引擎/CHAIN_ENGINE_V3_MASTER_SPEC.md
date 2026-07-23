# 产链引擎 v3 — 可落地主规格文档

> **版本**：v3.0-master | **日期**：2026-07-02 | **作者**：基于 Obsidian 文档 + 国内外公开资料整合
> **定位**：**通用产业链情报分析平台** · 单点事件传导影响分析 · 多学科 Agent 蜂群 · 全球覆盖
> **当前验证场景**：纺织服装产业链（可扩展至任意行业）

---

## 一、系统架构总览

```
用户层（老板/销售/采购/生产厂长）
    ↓ 对话/看板/告警
编排层（OpenAI Agents SDK / 火山引擎 AgentKit）
    ├── Runner → 7 个 Agent 角色（Handoff 机制）
    ├── Guardrail → 输入/输出安全校验
    └── Tracing → 全链路可观测
    ↓
工具层（MCP 协议 + Skills）
    ├── official-source-adapters（A 级 MCP：World Bank / FRED / Comtrade）
    ├── weighted-websearch（B+ 级：柯桥指数 / 小红书）
    ├── evidence-ledger（内部：数据质量账本）
    └── ark-memory（火山引擎 Viking 记忆库）
    ↓
数据层（Obsidian 知识库 · 9 环节 · 56 信息源）
```

---

## 二、9 条因果边 — 每条边的完整规格

| 边 | 因果关系 | 传导率 | 滞后期 | 数据质量 | 数据源 | MCP | 优先级 |
|----|---------|--------|--------|---------|-------|-----|--------|
| ①→② | 棉花→化纤 | 0.72-0.88 | 0-2 周 | A+ | ICE 期货 + World Bank | official-source-adapters | P0 |
| ②→③ | 化纤→面料 | 0.60-0.80 | 2-4 周 | A | PTA 期货 + 柯桥指数 | official-source-adapters | P1 |
| ③→④ | 面料→设计 | 0.30-0.50 | 1-2 月 | B | 柯桥指数 + 品牌上新节奏 | weighted-websearch | P3 |
| ④→⑤ | 设计→制造 | 0.80-1.00 | 2-4 月 | A | 品牌订货会 + 工厂排产 | evidence-ledger | P1 |
| ⑤→⑥ | 制造→品牌 | 0.75（实测） | 3-6 月 | A | 申洲/晶苑年报 + 工厂出厂价 | ark-memory | P0 |
| ⑥→⑦ | 品牌→渠道 | 1.00（即时） | 即时 | B | 天猫 GMV + 抖音 | weighted-websearch | P2 |
| ⑦→⑧ | 渠道→消费者 | 0.50-0.80 | 即时 | A | 国统局 CPI + 社零 | official-source-adapters | P0 |
| ⑧→⑨ | 消费者→回收 | 0.10-0.30 | 1-3 年 | C | Textile Exchange + GRS | official-source-adapters | P3 |
| ⑨→① | 回收→农业 | 0.05-0.10 | 3-5 年 | C | 再生纤维占比 + 原棉需求 | ark-memory | P3 |

### 关键校准发现（来自 REGRESSION_RESULTS.md）
- PPI 纺织 → CPI 衣着传导率：**0.068**（p=0.401，不显著）→ 原假设 0.30-0.50 被推翻
- CPI 衣着 → 零售弹性：**-6.87**（p=0.012，显著）→ 模型有缺陷，不可直接用
- 越南棉花来自中国仅 **25.1%**（非 75%）→ 高估 4 倍风险

---

## 三、7 个 Agent 角色 — 每个角色完整规格

### 3.1 Collector（数据采集）
```yaml
角色: Collector
模型: DeepSeek Flash（便宜，高频调用）
工具: [fetch_world_bank, fetch_comtrade, fetch_fred, fetch_kqindex, watch_excel_file, websearch]
MCP: official-source-adapters + weighted-websearch
安全规则: 致命三角隔离（读私有数据时禁止同时连公共 MCP）
输出格式: JSON Schema 标准化
成本估算: ~¥0.1/次
指标:
  - 数据采集成功率: ≥ 95%
  - 数据延迟: ≤ 2 小时
  - 数据质量等级: ≥ B（A 级源必须交叉验证）
```

### 3.2 Cleaner（数据清洗）
```yaml
角色: Cleaner
模型: 无需 LLM（规则引擎）
工具: [schema_validator, dedup_filter, normalizer]
MCP: 无（规则引擎，不连外部）
安全规则: 无外部连接，最安全
成本估算: ~¥0/次
指标:
  - 去重率: ≥ 99%
  - 格式规范率: 100%
  - 异常数据拦截率: ≥ 98%
```

### 3.3 Weigher（置信度评分）
```yaml
角色: Weigher
模型: 无需 LLM（规则引擎）
工具: [source_scorer, confidence_calculator, cross_validator]
MCP: evidence-ledger
安全规则: 数据质量 < A 不可单独引用
成本估算: ~¥0/次
指标:
  - 评分准确率: ≥ 90%（与人工评分对比）
  - 交叉验证覆盖率: ≥ 80%
  - A 级数据占比: ≥ 60%
```

### 3.4 Reasoner（因果推理）
```yaml
角色: Reasoner
模型: DeepSeek V4 Pro（强推理）
工具: [causal_dag, scenario_predict, lookup_coefficient]
MCP: ark-memory + evidence-ledger
安全规则: 推理结果必须有数据支撑，不可凭空推断
成本估算: ~¥0.5/次
指标:
  - 因果推理准确率: ≥ 85%（与历史数据对比）
  - 场景覆盖度: 3 个场景（乐观/基准/悲观）
  - 推理链路透明度: 100%（每步有数据来源）
```

### 3.5 Devil's Advocate（反证搜索）
```yaml
角色: Devil
模型: DeepSeek V4 Pro（异源视角）
工具: [counter_evidence_search, fallacy_detector, bias_checker]
MCP: weighted-websearch
安全规则: 反证必须有 A/B+ 级数据源支撑
成本估算: ~¥0.5/次
指标:
  - 反证发现率: ≥ 30%（有效反证占总分析比例）
  - 偏见检测率: ≥ 80%
  - 假阳性率: ≤ 15%
```

### 3.6 Predictor（预测建模）
```yaml
角色: Predictor
模型: Claude Sonnet（复杂推理，限 5-10% 调用）
工具: [trend_forecast, risk_assessor, opportunity_finder]
MCP: ark-memory
安全规则: 预测区间必须包含置信度，禁止点预测
成本估算: ~¥1/次
指标:
  - 预测准确率: ≥ 70%（30 天后回测）
  - 风险识别率: ≥ 80%
  - 机会发现精准率: ≥ 60%
```

### 3.7 Writer（报告生成）
```yaml
角色: Writer
模型: DeepSeek Flash（简单写入，便宜）
工具: [obsidian_writer, report_formatter, summary_generator]
MCP: 无（只写 Obsidian）
安全规则: 不引用 C/D 级数据源，不做未经验证的结论
成本估算: ~¥0.1/次
指标:
  - 报告完整率: 100%（必含：数据来源 + 置信度 + 行动建议）
  - 写入成功率: ≥ 99%
  - 报告可读性评分: ≥ 4/5（用户反馈）
```

---

## 四、10 个标准工作流 — 每个工作流完整规格

| # | 工作流 | 触发条件 | 执行链 | 成本 | SLA | 优先级 |
|---|--------|---------|-------|------|-----|--------|
| 1 | **每日情报简报** | 每日 08:00 | Collector→Cleaner→Weigher→Writer | ¥0.5 | 30 分钟内完成 | P0 |
| 2 | **价格异动分析** | 价格变化 >3% | Collector→Reasoner→Devil→Writer | ¥2 | 2 小时内完成 | P0 |
| 3 | **客户健康度评估** | 手动/对话触发 | Collector→Reasoner→Predictor→Writer | ¥3 | 4 小时内完成 | P1 |
| 4 | **竞品情报监控** | 每周一 09:00 | Collector→Cleaner→Weigher→Reasoner→Writer | ¥4 | 当天完成 | P1 |
| 5 | **关税/政策影响** | 政策公告触发 | Collector→Reasoner→Devil→Predictor→Writer | ¥5 | 6 小时内完成 | P1 |
| 6 | **供应链中断预警** | 港口拥堵/延误 | Collector→Reasoner→Writer | ¥2 | 1 小时内完成 | P0 |
| 7 | **汇率风险评估** | JPY/USD 变化 >1.5% | Collector→Reasoner→Predictor→Writer | ¥2 | 2 小时内完成 | P0 |
| 8 | **老板对话式探索** | 对话触发 | Reasoner→Devil（可选） | ¥1 | 实时 | P0 |
| 9 | **月度综合报告** | 每月 1 日 | All 7 roles | ¥10 | 当天完成 | P1 |
| 10 | **新数据源接入** | 手动请求 | Collector→Cleaner→Weigher→Writer | ¥1 | 1 天内完成 | P2 |

---

## 五、技术栈选型（国内外大厂对比）

### 5.1 Agent 编排框架对比

| 框架 | 定位 | 优势 | 劣势 | 产链引擎适配度 |
|------|------|------|------|--------------|
| **OpenAI Agents SDK** | 轻量级多 Agent | Handoff 机制精巧，原语简洁（Agent+Tool+Handoff） | 强依赖 OpenAI 格式 | ⭐⭐⭐⭐ |
| **火山引擎 AgentKit** | 企业级全栈平台 | HTTP-to-MCP 零代码转换，Viking 记忆库毫秒召回 | 国内部署，有锁定 | ⭐⭐⭐⭐⭐ |
| **mcp-agent（lastmile）** | MCP 原生框架 | 完整 MCP 支持，Temporal 持久化 | 社区维护，较新 | ⭐⭐⭐ |
| **LangGraph** | 图编排框架 | 状态机流程控制，社区成熟 | 学习曲线高，不如 AgentKit 生产友好 | ⭐⭐⭐ |

**产链引擎选型**：火山引擎 AgentKit（生产部署）+ OpenAI Agents SDK 兼容层（开发调试）

### 5.2 MCP 协议规范（Anthropic 标准）

```
MCP 三层架构：
  Host（Claude/AgentKit/自研）
    ↓ JSON-RPC 2.0
  Client（MCP Client）
    ↓ stdio / HTTP+SSE
  Server（MCP Server）
    ├── Tools（工具调用）
    ├── Resources（资源读取）
    └── Prompts（提示词模板）

产链引擎 MCP 服务器：
  official-source-adapters → World Bank / FRED / Comtrade / 国统局
  weighted-websearch → 柯桥指数 / 小红书 / 舆情
  evidence-ledger → 内部数据质量账本
  ark-memory → 火山引擎 Viking 记忆库
```

### 5.3 安全架构（8 条铁律）

| # | 规则 | 实现方式 | 状态 |
|---|------|---------|------|
| 1 | 安装前 12 分钟审计 | mcp-scan + 手动审查 | 待执行 |
| 2 | 致命三角隔离 | Collector 读私有数据时禁止连公共 MCP | 待实现 |
| 3 | 社区 MCP 沙箱包裹 | mcp-context-protector | 待配置 |
| 4 | Docker 隔离 | --no-new-privileges --read-only | 待配置 |
| 5 | Scoped Token | 不用长期静态密钥 | 待实现 |
| 6 | 频率熔断 | >1.5 次/s 持续 10s → 自动断开 | 待实现 |
| 7 | 工具描述 ≤280 tokens | 工具注册时校验 | 待实现 |
| 8 | 版本锁定 | Dependabot PR 需人工审批 | 待配置 |

---

## 六、14 节点 × 技能需求矩阵

| 节点 | 数据采集 Skills | 分析推理 Skills | 输出 Skills | 核心 MCP | 关键指标 |
|------|---------------|---------------|------------|---------|---------|
| ①棉花/化纤 | fetch_world_bank + fetch_ice_futures | causal_dag + trend_forecast | obsidian_writer | official-source-adapters | 棉花价格波动率、开工率 |
| ②纺纱厂 | fetch_pta_futures + fetch_kqindex | causal_dag + risk_assessor | obsidian_writer | official-source-adapters | 纱线报价、产能利用率 |
| ③织造/针织 | fetch_comtrade + fetch_kqindex | scenario_predict | obsidian_writer | official-source-adapters | 织机开台率、面料出厂价 |
| ④染整厂 | fetch_fred + watch_excel | causal_dag | obsidian_writer | official-source-adapters | 染化料成本、产能利用率 |
| ⑤成衣厂（富泉） | watch_excel + fetch_comtrade | causal_dag + scenario_predict + counter_evidence | obsidian_writer + report_formatter | ark-memory + evidence-ledger | 接单指数、良品率、交期达成率 |
| ⑥辅料商 | fetch_1688 + watch_excel | trend_forecast | obsidian_writer | weighted-websearch | 辅料价格指数、库存天数 |
| ⑦裁剪缝制 | watch_excel | risk_assessor | obsidian_writer | evidence-ledger | 计件效率、工人流失率 |
| ⑧后整理 | watch_excel | causal_dag | obsidian_writer | evidence-ledger | 质量合格率、交期 |
| ⑨质检/检品 | watch_excel + fetch_sgs | source_scorer | obsidian_writer | evidence-ledger | 缺陷率、标准符合率 |
| ⑩仓储物流 | fetch_vessel_tracker + watch_excel | scenario_predict | obsidian_writer | weighted-websearch | 港口吞吐量、船期准时率 |
| ⑪品牌/零售 | fetch_hkex_pdf + websearch_舆情 | causal_dag + scenario_predict | obsidian_writer | weighted-websearch | 同店销售、库存周转 |
| ⑫海关/贸易 | fetch_comtrade + fetch_japan_customs | causal_dag | obsidian_writer | official-source-adapters | HS 编码关税变动 |
| ⑬金融/保险 | fetch_fred + fetch_world_bank | risk_assessor + trend_forecast | obsidian_writer | official-source-adapters | 汇率波动率、信用评级 |
| ⑭回收/可持续 | fetch_textile_exchange | causal_dag + trend_forecast | obsidian_writer | official-source-adapters | GRS 认证率、再生纤维占比 |

---

## 七、实施路径（Phase 0-5）

### Phase 0（Week 0）：MCP 安全加固 ← 今天开始
```
1. 对已有 4 个 MCP 服务器跑 mcp-scan 审计（12 分钟/个）
2. 配置 Docker 沙箱（--no-new-privileges --read-only）
3. 致命三角隔离：Collector 读内部 Excel 时断开公共 MCP
4. 设置频率熔断：>1.5 次/s 持续 10s → 自动断开

验证门：mcp-scan 0 个 CRITICAL，沙箱运行正常
```

### Phase 1（Week 1-2）：单节点 MVP ← 最小闭环
```
节点：⑤ 成衣厂（富泉）
角色：老板
工作流：每日情报简报（工作流 #1）
MCP：national-stats-mcp（国统局）+ weighted-websearch（柯桥指数）

验证门：老板每天 08:00 收到 ≤1 页的棉花价格 + 客户动态简报
成本预算：≤ ¥15/月
```

### Phase 2（Week 3-4）：单节点扩展
```
扩展角色：销售总监 + 采购经理 + 生产厂长
新增工作流：价格异动分析（#2）+ 汇率风险评估（#7）
新增 MCP：FRED（汇率）+ Comtrade（贸易流）

验证门：4 个角色都有专属看板，价格异动 2 小时内触发报告
```

### Phase 3（Week 5-8）：因果链路打通
```
扩展节点：① 原料端 + ⑪ 品牌端
核心工作流：全链路价格传导追踪（棉花 → 零售）
新增 Skills：causal_dag 跨节点推理

验证门：棉花价格变动 → 整条链的传导可见（8 个节点）
```

### Phase 4（Week 9-12）：全链路 14 节点
```
扩展到 14 个节点
上线产业链健康度指数
月度综合报告（工作流 #9）自动生成

验证门：任意环节的变动 → 整条链的影响可追溯
```

### Phase 5（Week 13+）：自进化
```
上线因果边参数自动学习
Skills 自动替换机制
跨节点学习：一个节点的发现自动帮助其他节点

验证门：系统自动发现新的因果关系（每月 ≥ 1 条）
```

---

## 八、数据质量标准

| 等级 | 标准 | 用法 |
|------|------|------|
| **A+** | 官方统计 + 机器可读 API | 直接引用，无需交叉验证 |
| **A** | 权威机构发布 + 可追溯 | 直接引用 |
| **B+** | 专业机构 + 需 Vetting | 需 A 级源交叉验证 |
| **B** | 行业经验 / 非官方 | 必须有 A 级源交叉，不可单独引用 |
| **C** | 推断 / 单一来源 | 仅测试环境，不进生产报告 |
| **D** | 不可信 / 无法验证 | **禁止使用** |

---

## 九、关键 API 与环境变量（安全规则）

```
# .env.local（不得出现在文档中，只写变量名）
NATIONAL_STATS_MCP_KEY=           # 国统局 MCP
FRED_API_KEY=                      # 美联储经济数据
COMTRADE_API_KEY=                  # UN Comtrade 贸易数据
WORLD_BANK_API_KEY=                # 世界银行
VOLCENGINE_API_KEY=                # 火山引擎 AgentKit
DEEPSEEK_API_KEY=                  # DeepSeek V4 Pro（主力）
ANTHROPIC_API_KEY=                 # Claude（限 5-10%）
OBSIDIAN_VAULT_PATH=               # Obsidian 知识库路径
```

---

## 十、产业链健康度指数（KPI 体系）

| 维度 | 指标 | 数据源 | 更新频率 | 权重 |
|------|------|-------|---------|------|
| 原料端 | 棉花价格波动率 | ICE 期货 | 日更 | 15% |
| 原料端 | 化纤开工率 | 中国化纤协会 | 周更 | 10% |
| 制造端 | 纺纱开机率 | 国统局 | 月更 | 10% |
| 制造端 | 成衣接单指数 | 内部 Excel | 日更 | 20% |
| 流通端 | 港口吞吐量 | 交通部 | 周更 | 10% |
| 流通端 | 库存周转天数 | 内部 Excel | 周更 | 15% |
| 终端 | 品牌同店销售 | 港交所财报 | 季更 | 10% |
| 终端 | 消费者信心指数 | 国统局 | 月更 | 10% |

**产业链健康度 = Σ(各指标标准化值 × 权重)**
- ≥ 0.7：健康，正常运营
- 0.5-0.7：警戒，加强监控
- < 0.5：危险，启动应急预案

---

> **一句话总结**：产链引擎 v3 = 9 条因果边 × 7 个 Agent 角色 × 14 个产业链节点 × 10 个标准工作流
> **最小闭环**：Phase 1 — 富泉老板每天 08:00 收到 ≤1 页情报简报（成本 ≤ ¥15/月）
> **技术底座**：火山引擎 AgentKit（生产）+ OpenAI Agents SDK（编排）+ MCP 协议（工具）

---

## 十一、通用化架构设计 — 从服装行业到全行业扩展

### 11.1 核心设计理念

产链引擎的本质是**通用产业链情报分析平台**，当前以纺织服装为验证场景，但架构设计必须支持：

1. **行业无关性**：因果边模板可配置，不硬编码特定行业逻辑
2. **全球覆盖**：数据源涵盖全球大宗商品、地缘政治、气候、贸易流
3. **多学科融合**：经济学、社会学、地理学、政治学、环境科学等多维度分析
4. **Agent 蜂群进化**：多 Agent 自主协作、自学习、自适应新场景

### 11.2 通用因果边模板机制

#### 当前状态（服装行业示例）
```yaml
edge_id: cotton_to_chemical_fiber
source_node: 棉花
target_node: 化纤
transmission_rate: 0.72-0.88
lag_weeks: 0-2
data_sources: [ICE期货, World Bank]
```

#### 通用化改造
```yaml
# 因果边模板（行业无关）
edge_template:
  id: <auto-generated>
  industry: <industry_tag>  # 如 "textile", "electronics", "agriculture"
  source_category: <category>  # 如 "raw_material", "component", "service"
  target_category: <category>
  transmission_model:
    type: <linear | exponential | logistic>  # 传导模型类型
    base_rate: <float>  # 基础传导率
    adjustment_factors:  # 动态调整因子
      - factor: geopolitical_risk  # 地缘政治风险
        weight: 0.15
      - factor: supply_chain_disruption  # 供应链中断
        weight: 0.25
      - factor: demand_elasticity  # 需求弹性
        weight: 0.20
  lag_distribution:
    type: <normal | lognormal | custom>
    mean_weeks: <float>
    std_dev: <float>
  data_requirements:
    min_quality_level: A
    cross_validation_required: true
    sources: [<MCP_server_ids>]
```

#### 多行业适配示例
| 行业 | 因果边示例 | 传导率 | 滞后期 | 关键调整因子 |
|------|-----------|--------|--------|-------------|
| **电子** | 芯片短缺→手机产量 | 0.85 | 4-8周 | 库存水平、替代方案可用性 |
| **农业** | 干旱→粮食价格 | 0.60 | 2-6月 | 灌溉覆盖率、政府储备 |
| **能源** | 油价上涨→航空成本 | 0.70 | 即时-2周 | 燃油对冲比例、航线优化 |
| **医药** | 原料药涨价→成品药 | 0.45 | 3-12月 | 专利到期、仿制药竞争 |

### 11.3 多学科 Agent 蜂群架构

#### 当前状态（7 个功能角色）
Collector → Cleaner → Weigher → Reasoner → Devil → Predictor → Writer

#### 扩展为多学科专家蜂群
```yaml
agent_swarm:
  # 基础层（保持不变）
  infrastructure_agents:
    - Collector: 数据采集
    - Cleaner: 数据清洗
    - Weigher: 置信度评分
  
  # 学科专家层（新增，按需激活）
  domain_experts:
    economist:
      specialty: [macro_economics, trade_policy, currency_impact]
      tools: [fetch_world_bank, fetch_fred, calculate_elasticity]
      trigger: "经济影响分析" / "汇率波动" / "关税政策"
    
    geographer:
      specialty: [supply_chain_mapping, logistics_optimization, climate_risk]
      tools: [fetch_shipping_routes, fetch_weather_data, map_disruption]
      trigger: "港口拥堵" / "极端天气" / "物流中断"
    
    political_scientist:
      specialty: [geopolitical_risk, trade_war_impact, regulatory_change]
      tools: [fetch_policy_changes, assess_sanctions, predict_regulation]
      trigger: "贸易战" / "制裁" / "政策变动"
    
    sociologist:
      specialty: [consumer_behavior, labor_market, social_trend]
      tools: [fetch_social_media_sentiment, analyze_demographics]
      trigger: "消费趋势" / "劳工问题" / "社会运动"
    
    environmental_scientist:
      specialty: [carbon_footprint, sustainability_compliance, climate_impact]
      tools: [fetch_carbon_prices, assess_esg_risk, calculate_emissions]
      trigger: "碳税" / "环保法规" / "ESG评级"
    
    technologist:
      specialty: [technology_disruption, innovation_impact, automation_risk]
      tools: [fetch_patent_data, track_tech_adoption, assess_disruption]
      trigger: "新技术" / "自动化" / "数字化转型"
  
  # 协调层（增强）
  coordination_agents:
    orchestrator:
      role: 根据事件类型动态组合学科专家
      logic: |
        IF event.type == "price_shock":
          ACTIVATE [economist, geographer]
        ELIF event.type == "policy_change":
          ACTIVATE [political_scientist, economist]
        ELIF event.type == "tech_breakthrough":
          ACTIVATE [technologist, sociologist]
    
    devil_advocate:
      role: 跨学科反证搜索
      logic: 检查各学科结论的一致性，发现矛盾点
    
    synthesizer:
      role: 多学科结论整合
      output: 综合报告（含各学科视角 + 冲突点 + 共识）
```

#### 工作流程示例：分析"越南工厂停工"事件
```
1. Collector: 采集越南疫情数据、工厂分布、出口占比
2. Orchestrator: 识别为"供应链中断 + 地缘政治"事件
   → 激活 Geographer + Political Scientist + Economist
3. Geographer: 分析越南工厂在全球供应链中的位置
   → 输出：越南占全球服装出口 12%，功能性面料 66% 依赖中国
4. Political Scientist: 评估中越关系、贸易政策风险
   → 输出：RCEP 框架下关税稳定，但地缘紧张可能影响物流
5. Economist: 计算对全球价格的传导影响
   → 输出：短期价格上涨 2-3%，长期取决于替代产能
6. Devil's Advocate: 发现矛盾
   → Geographer 说"依赖中国面料"，但 Political Scientist 说"关系紧张"
   → 要求重新验证数据源
7. Synthesizer: 整合报告
   → 结论：短期冲击可控（2-3%），但需监控中越关系；建议增加印度/孟加拉备份产能
```

### 11.4 全球数据源扩展计划

#### 当前数据源（聚焦国内）
- 国统局、柯桥指数、中国棉花信息网、UN Comtrade

#### 全球扩展路线图
| 数据类型 | 当前覆盖 | 目标覆盖 | 关键 MCP | 优先级 |
|---------|---------|---------|---------|--------|
| **大宗商品** | 棉花、PTA | 原油、铜、锂、稀土 | ICE/LME/SHFE MCP | P0 |
| **宏观经济** | 中国 CPI/PPI | 全球主要经济体 GDP/通胀/就业 | FRED/World Bank/OECD | P0 |
| **贸易流** | 中国进出口 | 全球双边贸易、转口贸易 | UN Comtrade/WTO | P1 |
| **地缘政治** | 无 | 制裁清单、贸易协定、冲突指数 | GDELT/ACLED | P1 |
| **气候数据** | 无 | 全球气温、降水、极端天气 | NOAA/ECMWF | P2 |
| **航运物流** | 无 | 全球港口吞吐量、船期、运费 | Drewry/Clarksons | P2 |
| **社交媒体** | 小红书 | Twitter/Reddit/LinkedIn 舆情 | Social Media MCP | P3 |
| **专利科技** | 无 | 全球专利申请、技术突破 | USPTO/EPO/WIPO | P3 |

### 11.5 自进化机制升级

#### 当前机制（单参数学习）
```python
new_rate = old_rate * 0.7 + (actual_change / predicted_change) * 0.3
```

#### 升级为多维参数学习
```python
# 传导率动态调整模型
transmission_rate = base_rate * (
    1 + w1 * geopolitical_risk_index +
    w2 * supply_chain_resilience +
    w3 * demand_elasticity +
    w4 * technology_substitution_rate
)

# 权重自学习（基于历史误差反向传播）
for each historical_event:
    error = actual_impact - predicted_impact
    adjust_weights(error, learning_rate=0.01)
    
# 学科专家可信度评分
expert_credibility[discipline] = f(
    prediction_accuracy,
    cross_discipline_consensus,
    data_quality_used
)
```

### 11.6 实施建议：分阶段通用化

#### Phase 0（已完成）：服装行业验证
- ✅ 9 条因果边
- ✅ 7 个 Agent 角色
- ✅ 14 个产业链节点

#### Phase 1（下一步）：抽象因果边模板
- 将 9 条边重构为通用模板
- 定义 `industry`、`source_category`、`target_category` 字段
- 测试在电子行业的应用（芯片→手机）

#### Phase 2：引入多学科专家
- 新增 Economist、Geographer、Political Scientist 3 个学科 Agent
- 配置触发规则与工具集
- 测试"贸易战"场景的多学科分析

#### Phase 3：全球数据源接入
- 接入 FRED、World Bank、GDELT、NOAA
- 建立全球事件监控看板
- 测试"极端天气→农业→食品价格"链条

#### Phase 4：Agent 蜂群自组织
- 实现 Orchestrator 动态组合专家
- 上线跨学科反证搜索
- 测试复杂事件（如"新冠疫情+贸易战+能源危机"叠加）

#### Phase 5：完全通用化
- 支持用户自定义行业模板
- 开放 Skill 市场，第三方贡献学科专家
- 实现跨行业知识迁移（如从纺织学到的传导规律应用到电子）

---

> **战略愿景**：产链引擎不是"服装行业情报系统"，而是**全球产业链的神经系统**——感知单点事件，预测连锁反应，提供多学科视角的决策支持。服装只是第一个验证场景，目标是成为任意行业、任意地区、任意规模企业的基础设施。
