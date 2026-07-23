# Agent 蜂群协作机制设计

> **版本**：v1.0 | **日期**：2026-07-02 | **作者**：夏亮Iris
> **定位**：多学科专家 Agent 的动态组合、协作、反证与整合协议

---

## 一、架构总览

```
用户事件/查询
    ↓
[Orchestrator] ← 事件分类器 + 路由引擎
    ↓ 动态激活
┌─────────────────────────────────────┐
│     Domain Expert Agents            │
│  ┌──────────┬──────────┬─────────┐  │
│  │Economist │Geographer│Political│  │
│  │          │          │Scientist│  │
│  ├──────────┼──────────┼─────────┤  │
│  │Sociolo-  │Environ-  │Technol- │  │
│  │gist      │mental    │ogist    │  │
│  └──────────┴──────────┴─────────┘  │
└─────────────────────────────────────┘
    ↓ 并行执行
[Devil's Advocate] ← 跨学科一致性检查
    ↓ 发现矛盾？
    ├─ YES → [Feedback Loop] → 重新验证数据源/调整假设
    └─ NO  → 继续
    ↓
[Synthesizer] ← 多学科结论整合
    ↓
综合报告（含各学科视角 + 冲突点 + 共识 + 行动建议）
```

---

## 二、核心组件规格

### 2.1 Orchestrator（协调器）

**职责**：接收用户事件/查询，分类并动态激活相关学科专家。

#### 输入格式
```json
{
  "event_type": "<price_shock | policy_change | tech_breakthrough | supply_disruption | climate_event | social_trend>",
  "description": "<事件描述>",
  "industry": "<textile | electronics | agriculture | energy | pharmaceutical | all>",
  "geographic_scope": "<global | regional | national | local>",
  "urgency": "<high | medium | low>",
  "metadata": {
    "timestamp": "ISO8601",
    "source": "<data_source_id>",
    "confidence": <float>
  }
}
```

#### 事件分类规则表

| 事件类型 | 关键词匹配 | 激活学科 | 优先级 |
|---------|-----------|---------|--------|
| **price_shock** | "价格上涨" / "成本增加" / "价格暴跌" | Economist + Geographer | P0 |
| **policy_change** | "关税" / "制裁" / "政策变动" / "贸易协定" | Political Scientist + Economist | P0 |
| **tech_breakthrough** | "新技术" / "专利" / "自动化" / "数字化" | Technologist + Sociologist | P1 |
| **supply_disruption** | "港口拥堵" / "工厂停工" / "物流中断" | Geographer + Political Scientist | P0 |
| **climate_event** | "干旱" / "洪水" / "极端天气" / "气温异常" | Environmental Scientist + Geographer | P1 |
| **social_trend** | "消费趋势" / "劳工问题" / "社会运动" / "舆情" | Sociologist + Economist | P2 |

#### 路由算法（伪代码）
```python
def route_event(event):
    # Step 1: 基于 event_type 初筛
    base_experts = EVENT_TYPE_MAP[event.event_type]
    
    # Step 2: 基于 industry 过滤（如果学科有行业限制）
    filtered_experts = []
    for expert in base_experts:
        if expert.industry_scope == "all" or event.industry in expert.industry_scope:
            filtered_experts.append(expert)
    
    # Step 3: 基于 urgency 调整并发度
    if event.urgency == "high":
        max_concurrent = len(filtered_experts)  # 全并发
    elif event.urgency == "medium":
        max_concurrent = min(3, len(filtered_experts))  # 最多3个并发
    else:
        max_concurrent = 2  # 最多2个并发
    
    # Step 4: 返回激活列表
    return {
        "activated_experts": filtered_experts[:max_concurrent],
        "execution_mode": "parallel" if max_concurrent > 1 else "sequential",
        "timeout_seconds": 300 if event.urgency == "high" else 600
    }
```

#### 输出格式
```json
{
  "activated_experts": ["economist", "geographer"],
  "execution_mode": "parallel",
  "timeout_seconds": 300,
  "shared_context": {
    "event_id": "<uuid>",
    "industry": "textile",
    "geographic_scope": "global",
    "common_data_sources": ["UN_Comtrade", "World_Bank"]
  }
}
```

---

### 2.2 Domain Expert Agents（学科专家）

每个学科专家遵循统一的接口规范，但内部逻辑和工具集不同。

#### 统一接口

**输入**：
```json
{
  "event": <共享事件对象>,
  "expert_role": "<economist | geographer | ...>",
  "context": {
    "other_experts_outputs": [<可选，其他专家的初步结论>],
    "shared_data": [<共享数据源结果>]
  }
}
```

**输出**：
```json
{
  "expert_role": "<role_name>",
  "analysis": {
    "key_findings": ["<发现1>", "<发现2>"],
    "quantitative_impact": {
      "metric": "<指标名>",
      "predicted_change": <float>,
      "confidence_interval": [<lower>, <upper>],
      "time_horizon_weeks": <int>
    },
    "risk_factors": ["<风险1>", "<风险2>"],
    "opportunities": ["<机会1>", "<机会2>"]
  },
  "data_sources_used": [
    {
      "source_id": "<mcp_server_id>",
      "quality_level": "<A+ | A | B>",
      "timestamp": "ISO8601"
    }
  ],
  "assumptions": ["<假设1>", "<假设2>"],
  "credibility_score": <float, 0-1>,
  "contradictions_detected": [
    {
      "conflicts_with": "<other_expert_role>",
      "conflict_point": "<具体矛盾点>",
      "severity": "<high | medium | low>"
    }
  ]
}
```

#### 各学科专家详细规格

##### 2.2.1 Economist（经济学家）

**专长领域**：宏观经济、贸易政策、汇率影响、需求弹性

**工具集**：
- `fetch_world_bank`: 全球宏观经济数据
- `fetch_fred`: 美联储经济数据（利率、通胀、就业）
- `calculate_elasticity`: 计算价格弹性
- `forecast_gdp_impact`: GDP 影响预测模型

**分析框架**：
1. 识别直接影响（如原材料价格上涨 → 生产成本增加）
2. 计算传导率（基于历史回归系数）
3. 评估二次效应（如汇率波动对出口竞争力的影响）
4. 预测时间序列（短期/中期/长期）

**示例输出**：
```json
{
  "expert_role": "economist",
  "analysis": {
    "key_findings": [
      "棉花价格上涨 10% 将导致纱线成本增加 7.2%",
      "考虑到需求弹性 -0.3，最终零售价上涨约 2.1%"
    ],
    "quantitative_impact": {
      "metric": "retail_price_change",
      "predicted_change": 2.1,
      "confidence_interval": [1.5, 2.8],
      "time_horizon_weeks": 12
    },
    "risk_factors": ["需求萎缩可能抵消成本传导", "替代材料竞争"],
    "opportunities": ["高端品牌可通过提价转嫁成本"]
  },
  "data_sources_used": [
    {"source_id": "world_bank", "quality_level": "A+", "timestamp": "2026-07-02T10:00:00Z"}
  ],
  "assumptions": ["需求弹性保持不变", "无重大政策干预"],
  "credibility_score": 0.85,
  "contradictions_detected": []
}
```

##### 2.2.2 Geographer（地理学家）

**专长领域**：供应链地图、物流优化、气候风险、区域依赖关系

**工具集**：
- `fetch_shipping_routes`: 全球航运路线数据
- `fetch_weather_data`: 气象数据（NOAA/ECMWF）
- `map_supply_chain`: 绘制供应链依赖图
- `assess_logistics_risk`: 评估物流中断风险

**分析框架**：
1. 定位事件发生地的全球供应链位置
2. 识别关键节点（瓶颈、单点故障）
3. 评估替代路径可行性
4. 量化物流成本变化

##### 2.2.3 Political Scientist（政治学家）

**专长领域**：地缘政治风险、贸易战影响、监管变化、制裁评估

**工具集**：
- `fetch_policy_changes`: 政策变更数据库
- `assess_sanctions`: 制裁清单查询
- `predict_regulation`: 监管趋势预测
- `analyze_trade_agreements`: 贸易协定分析

**分析框架**：
1. 识别相关政策主体（政府、国际组织）
2. 评估政策稳定性与可预测性
3. 分析利益相关方博弈
4. 预测政策演变路径

##### 2.2.4 Sociologist（社会学家）

**专长领域**：消费者行为、劳动力市场、社会趋势、舆情分析

**工具集**：
- `fetch_social_media_sentiment`: 社交媒体情感分析
- `analyze_demographics`: 人口统计数据
- `track_consumer_trends`: 消费趋势追踪
- `assess_labor_market`: 劳动力市场分析

**分析框架**：
1. 识别受影响的社会群体
2. 分析行为模式变化
3. 评估社会情绪（正面/负面/中性）
4. 预测长期社会影响

##### 2.2.5 Environmental Scientist（环境科学家）

**专长领域**：碳足迹、可持续性合规、气候影响、ESG 评级

**工具集**：
- `fetch_carbon_prices`: 碳交易价格
- `assess_esg_risk`: ESG 风险评估
- `calculate_emissions`: 排放量计算
- `monitor_climate_impact`: 气候影响监测

**分析框架**：
1. 量化环境影响（碳排放、水资源、废弃物）
2. 评估合规风险（环保法规、碳税）
3. 分析 ESG 评级变化
4. 提出可持续发展建议

##### 2.2.6 Technologist（技术专家）

**专长领域**：技术颠覆、创新影响、自动化风险、数字化转型

**工具集**：
- `fetch_patent_data`: 专利申请数据
- `track_tech_adoption`: 技术采用率追踪
- `assess_disruption`: 技术颠覆风险评估
- `analyze_automation_potential`: 自动化潜力分析

**分析框架**：
1. 识别相关技术趋势
2. 评估技术成熟度（TRL 等级）
3. 分析 adoption curve（采用曲线）
4. 预测颠覆时间表

---

### 2.3 Devil's Advocate（反证搜索者）

**职责**：检查各学科专家结论的一致性，发现矛盾点，触发重新验证。

#### 工作流程

```
1. 收集所有学科专家的 output
2. 提取关键主张（key_findings + quantitative_impact）
3. 两两对比，检测矛盾
   - 数值矛盾：同一指标预测值差异 > 20%
   - 逻辑矛盾：A 说"依赖中国"，B 说"中越关系紧张"
   - 数据源矛盾：使用互斥的数据源
4. 对每个矛盾点评分（severity）
5. 如果有 high severity 矛盾，触发 Feedback Loop
```

#### 矛盾检测规则

| 矛盾类型 | 检测条件 | 严重性 | 处理方式 |
|---------|---------|--------|---------|
| **数值矛盾** | 同一指标预测值差异 > 20% | High | 要求双方重新校准数据源 |
| **逻辑矛盾** | A 的结论与 B 的前提冲突 | High | 要求澄清假设 |
| **数据源冲突** | 使用质量等级差异 > 2 级的数据源 | Medium | 优先采纳高质量数据源 |
| **时间范围不一致** | 预测时间跨度差异 > 50% | Low | 标准化时间范围后重新对比 |

#### 输出格式
```json
{
  "contradictions": [
    {
      "id": "contradiction_001",
      "type": "logical",
      "experts_involved": ["geographer", "political_scientist"],
      "conflict_point": "Geographer 指出'越南 66% 面料依赖中国'，但 Political Scientist 指出'中越关系紧张可能导致供应中断'",
      "severity": "high",
      "resolution_suggestion": "要求 Geographer 提供数据来源的时间戳，要求 Political Scientist 量化'关系紧张'的实际影响概率"
    }
  ],
  "consensus_points": [
    "所有专家一致认为短期价格上涨 2-3%",
    "Economist 和 Sociologist 均认为需求弹性较低"
  ],
  "requires_feedback_loop": true
}
```

---

### 2.4 Synthesizer（整合器）

**职责**：整合多学科结论，生成综合报告，突出共识与分歧。

#### 整合逻辑

```python
def synthesize(expert_outputs, devil_report):
    report = {
        "executive_summary": "",
        "disciplinary_perspectives": {},
        "consensus": [],
        "conflicts": devil_report.contradictions,
        "action_recommendations": [],
        "confidence_level": calculate_overall_confidence(expert_outputs)
    }
    
    # Step 1: 为每个学科生成独立章节
    for output in expert_outputs:
        report["disciplinary_perspectives"][output.expert_role] = {
            "findings": output.analysis.key_findings,
            "quantitative_impact": output.analysis.quantitative_impact,
            "risks": output.analysis.risk_factors,
            "opportunities": output.analysis.opportunities
        }
    
    # Step 2: 提取共识（未被 Devil 标记为矛盾的结论）
    report["consensus"] = devil_report.consensus_points
    
    # Step 3: 生成行动建议（基于共识 + 高风险点）
    report["action_recommendations"] = generate_recommendations(
        consensus=report["consensus"],
        high_risks=[r for r in all_risks if r.severity == "high"],
        conflicts=report["conflicts"]
    )
    
    # Step 4: 计算整体置信度
    report["confidence_level"] = weighted_average(
        weights=[e.credibility_score for e in expert_outputs],
        values=[e.analysis.quantitative_impact.confidence_interval_width for e in expert_outputs]
    )
    
    return report
```

#### 输出格式（综合报告）
```json
{
  "report_id": "<uuid>",
  "timestamp": "ISO8601",
  "event_summary": "<事件描述>",
  "executive_summary": "<200字以内的核心结论>",
  "disciplinary_perspectives": {
    "economist": {...},
    "geographer": {...},
    "political_scientist": {...}
  },
  "consensus": [
    "短期价格上涨 2-3%",
    "需求弹性较低，成本可部分转嫁"
  ],
  "conflicts": [
    {
      "type": "logical",
      "description": "越南对中国面料依赖 vs 中越关系紧张",
      "status": "unresolved"
    }
  ],
  "action_recommendations": [
    {
      "priority": "P0",
      "action": "增加印度/孟加拉备份产能",
      "rationale": "降低对单一国家的依赖",
      "estimated_cost": "<cost_estimate>",
      "timeline": "<weeks>"
    }
  ],
  "confidence_level": 0.78,
  "data_quality_summary": {
    "A+_sources": 3,
    "A_sources": 5,
    "B_sources": 2,
    "cross_validation_rate": 0.85
  }
}
```

---

## 三、协作协议详解

### 3.1 并行执行协议

当 Orchestrator 决定并行激活多个专家时：

```yaml
protocol: parallel_execution
steps:
  1. Orchestrator 广播 shared_context 给所有激活的专家
  2. 各专家独立执行分析（不互相等待）
  3. 设置 timeout（根据 urgency 决定）
  4. 收集所有专家输出（超时则标记为 incomplete）
  5. 传递给 Devil's Advocate
```

**优势**：速度快，适合紧急事件  
**劣势**：无法利用其他专家的中间结果

### 3.2 串行执行协议

当需要专家之间传递中间结果时：

```yaml
protocol: sequential_execution
steps:
  1. Orchestrator 激活第一个专家（通常是 Economist 或 Geographer）
  2. 第一个专家输出传递给第二个专家作为 context
  3. 第二个专家结合前序结果深化分析
  4. 依次传递，直到所有专家完成
  5. 传递给 Devil's Advocate
```

**优势**：分析更深入，可利用前序结论  
**劣势**：速度慢，存在级联延迟风险

### 3.3 混合执行协议（推荐）

```yaml
protocol: hybrid_execution
steps:
  1. 第一层并行：Economist + Geographer（基础数据分析）
  2. 第二层串行：Political Scientist 读取第一层结果，进行政策风险评估
  3. 第三层并行：Sociologist + Technologist（独立分析社会/技术影响）
  4. 汇聚到 Devil's Advocate
```

**适用场景**：复杂事件，需要兼顾速度与深度

---

## 四、冲突解决机制

### 4.1 自动解决规则

| 冲突类型 | 解决策略 |
|---------|---------|
| **数据源质量差异** | 优先采纳 A+/A 级数据源的结论 |
| **时间范围不一致** | 标准化为相同时间窗口后重新计算 |
| **模型参数差异** | 取加权平均（权重 = credibility_score） |

### 4.2 人工介入触发条件

以下情况需要人工介入：

1. **High severity 矛盾超过 3 个**
2. **整体置信度 < 0.6**
3. **关键假设存在根本性分歧**（如一方假设"需求不变"，另一方假设"需求暴跌"）
4. **数据源全部为 B 级或以下**

**人工介入流程**：
```
1. 系统生成"冲突报告"，列出所有未解决的矛盾
2. 推送给用户（通过钉钉消息/邮件）
3. 用户提供额外信息或裁决
4. 系统根据用户反馈重新运行受影响的专家
5. 更新综合报告
```

---

## 五、可信度评分体系

### 5.1 单个专家的可信度计算

```python
credibility_score = (
    0.4 * data_quality_score +      # 数据源质量
    0.3 * historical_accuracy +     # 历史预测准确率
    0.2 * cross_validation_rate +   # 交叉验证覆盖率
    0.1 * assumption_transparency   # 假设透明度（是否明确列出假设）
)
```

**各分项说明**：
- **data_quality_score**: A+=1.0, A=0.9, B+=0.7, B=0.5, C=0.3
- **historical_accuracy**: 过去 30 天预测误差的反向映射（误差越小，分数越高）
- **cross_validation_rate**: 有多少结论被其他专家或外部数据验证
- **assumption_transparency**: 是否明确列出所有假设（是=1.0，否=0.5）

### 5.2 整体报告的可信度计算

```python
overall_confidence = weighted_average(
    weights=[expert.credibility_score for expert in activated_experts],
    values=[1.0] * len(activated_experts)  # 简单平均
) * (1 - contradiction_penalty)

# contradiction_penalty: 每个 high severity 矛盾扣 0.1，最多扣 0.3
contradiction_penalty = min(0.3, 0.1 * count_high_severity_contradictions)
```

---

## 六、工作流程示例

### 场景：越南工厂停工事件

#### Step 1: Orchestrator 接收事件
```json
{
  "event_type": "supply_disruption",
  "description": "越南胡志明市多家服装工厂因疫情停工",
  "industry": "textile",
  "geographic_scope": "regional",
  "urgency": "high"
}
```

#### Step 2: Orchestrator 路由
```
激活专家：Geographer + Political Scientist + Economist
执行模式：parallel
超时：300秒
```

#### Step 3: 专家并行执行

**Geographer 输出**：
- 越南占全球服装出口 12%
- 功能性面料 66% 依赖中国进口
- 替代产能：印度（8%）、孟加拉（6%）

**Political Scientist 输出**：
- RCEP 框架下关税稳定
- 但中越地缘紧张指数上升至 0.65（阈值 0.7）
- 物流中断概率：15%

**Economist 输出**：
- 短期价格上涨 2-3%
- 长期取决于替代产能启用速度（预计 8-12 周）
- 需求弹性低，成本可部分转嫁

#### Step 4: Devil's Advocate 检测矛盾
```
发现矛盾：
- Geographer 说"66% 面料依赖中国"
- Political Scientist 说"中越关系紧张，物流中断概率 15%"
→ 矛盾点：如果关系紧张，为何还能维持 66% 依赖？
→ 严重性：Medium
→ 建议：要求 Geographer 提供数据时间戳，要求 Political Scientist 量化实际影响
```

#### Step 5: Synthesizer 整合
```json
{
  "executive_summary": "越南工厂停工将导致短期服装价格上涨 2-3%，但长期影响可控。需警惕中越关系紧张对供应链的潜在冲击。",
  "consensus": ["短期价格上涨 2-3%", "替代产能可在 8-12 周内启用"],
  "conflicts": [
    {
      "type": "logical",
      "description": "越南对中国面料高依赖 vs 中越关系紧张",
      "status": "requires_clarification"
    }
  ],
  "action_recommendations": [
    {
      "priority": "P0",
      "action": "增加印度/孟加拉订单比例至 30%",
      "rationale": "降低对越南的单一依赖"
    },
    {
      "priority": "P1",
      "action": "监控中越关系指数，设定 0.7 为预警阈值",
      "rationale": "提前应对可能的物流中断"
    }
  ],
  "confidence_level": 0.75
}
```

---

## 七、技术实现要点

### 7.1 通信协议

- **内部通信**：JSON-RPC 2.0（与 MCP 协议兼容）
- **消息队列**：RabbitMQ / Kafka（支持异步并行）
- **状态存储**：Redis（临时状态）+ SQLite（持久化）

### 7.2 容错机制

- **超时重试**：专家执行超时后自动重试 1 次
- **降级策略**：如果某专家持续失败，跳过该专家并标注"incomplete"
- **熔断器**：如果错误率 > 50%，暂停该专家并告警

### 7.3 监控与日志

- **Tracing**：记录每次专家调用的输入、输出、耗时
- **Metrics**：采集激活频率、平均响应时间、矛盾检测率
- **Alerting**：当整体置信度 < 0.6 或 high severity 矛盾 > 3 时触发告警

---

## 八、扩展路线图

### Phase 1（当前）：基础协作
- ✅ Orchestrator 路由
- ✅ 6 个学科专家
- ✅ Devil's Advocate 矛盾检测
- ✅ Synthesizer 整合

### Phase 2（下一步）：自学习
- 基于历史事件优化路由规则
- 自动调整专家权重
- 建立专家信誉排行榜

### Phase 3：跨行业迁移
- 从纺织学到的规律应用到电子/农业
- 建立行业间知识图谱
- 实现"类比推理"（analogical reasoning）

### Phase 4：完全自主
- Orchestrator 自动发现新的事件类型
- 自动注册新的学科专家
- 无需人工干预的端到端分析

---

> **核心理念**：Agent 蜂群不是简单的多 Agent 并行，而是**有组织的分工协作**——Orchestrator 是大脑，学科专家是感官，Devil's Advocate 是免疫系统，Synthesizer 是记忆。只有协同工作，才能产生超越单一 Agent 的智能。
