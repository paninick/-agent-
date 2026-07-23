# 自进化 Skills / MCP / 工作流生态

> **版本**：v1.0 | **日期**：2026-07-01
> **目的**：实时监控 + 自动替换 + 自主生成新技能，让 Skills 生态自我进化
> **核心理念**：Agent 不只是用技能，而是**思考技能**——评估、替换、创造

---

## ⭐ 铁律

```
1. 每个 Skill/MCP 必须有生命周期（引入→监控→评估→替换/退役）
2. 自动替换必须在 sandbox 验证后才上生产（不盲换）
3. 新技能生成 = 使用模式分析 → 原型 → 测试 → 灰度 → 上线
4. Agent 在执行任务前，必须先"思考"选哪个技能（不是硬编码）
5. 所有自进化行为必须可审计、可回滚
```

---

## 一、系统架构（五层）

```
┌─────────────────────────────────────────────────────────────────┐
│                    Layer 5：思考层（Skill Thinker）               │
│  "我要做什么任务？→ 哪个技能最合适？→ 需要创造新技能吗？"          │
└────────────────────────────┬────────────────────────────────────┘
                             │ 决策
┌────────────────────────────▼────────────────────────────────────┐
│                    Layer 4：进化层（Skill Evolver）               │
│  "哪些技能表现差？→ 找替代品 → 自动替换 → 生成新技能"              │
└────────────────────────────┬────────────────────────────────────┘
                             │ 指令
┌────────────────────────────▼────────────────────────────────────┐
│                    Layer 3：编排层（Workflow Engine）             │
│  "Skills + MCPs + Rules 按工作流组合执行"                         │
└────────────────────────────┬────────────────────────────────────┘
                             │ 调用
┌────────────────────────────▼────────────────────────────────────┐
│                    Layer 2：执行层（Skill Runner）                │
│  "实际执行技能，记录每次调用的指标"                                │
└────────────────────────────┬────────────────────────────────────┘
                             │ 数据
┌────────────────────────────▼────────────────────────────────────┐
│                    Layer 1：监控层（Skill Monitor）               │
│  "采集成功率/成本/延迟/用户满意度，写入 metrics DB"                │
└─────────────────────────────────────────────────────────────────┘
```

---

## 二、Layer 1：监控层（Skill Monitor）

### 2.1 监控指标

```yaml
# 每次 Skill/MCP 调用记录
skill_metrics:
  # 基础指标
  skill_id: "causal_dag"
  skill_version: "1.2.0"
  mcp_server: "ark-memory-search-vector-mcp"
  role: "Reasoner"
  workflow: "price_alert_analysis"
  user_role: "owner"
  
  # 执行指标
  status: "success" | "failed" | "timeout" | "degraded"
  latency_ms: 1200
  tokens_used: 3500
  cost_yuan: 0.02
  retry_count: 0
  
  # 质量指标
  output_quality_score: 0.85  # 0-1，基于输出 schema 验证
  user_satisfaction: null      # 用户反馈（对话式探索时收集）
  
  # 上下文
  timestamp: "2026-07-01T09:23:45+08:00"
  input_complexity: "medium"   # low/medium/high
  output_size_bytes: 2048

# 聚合指标（每日/每周/每月）
skill_aggregates:
  skill_id: "causal_dag"
  period: "2026-06"  # 月度
  total_calls: 47
  success_rate: 0.936  # 44/47
  avg_latency_ms: 1350
  p99_latency_ms: 4200
  total_cost_yuan: 0.94
  avg_quality_score: 0.82
  failure_reasons:
    - reason: "timeout"
      count: 2
    - reason: "invalid_output_schema"
      count: 1
  trend: "stable"  # improving / stable / degrading
```

### 2.2 监控存储

```yaml
# metrics DB 设计
metrics_db:
  type: "sqlite"  # 轻量级，本地
  
  tables:
    # 每次调用记录
    skill_calls:
      columns:
        - "id INTEGER PRIMARY KEY"
        - "skill_id TEXT"
        - "mcp_server TEXT"
        - "role TEXT"
        - "workflow TEXT"
        - "status TEXT"
        - "latency_ms INTEGER"
        - "tokens_used INTEGER"
        - "cost_yuan REAL"
        - "quality_score REAL"
        - "timestamp DATETIME"
        
    # 每日聚合
    skill_daily:
      columns:
        - "skill_id TEXT"
        - "date DATE"
        - "total_calls INTEGER"
        - "success_rate REAL"
        - "avg_latency_ms REAL"
        - "total_cost_yuan REAL"
        - "avg_quality_score REAL"
        - "PRIMARY KEY (skill_id, date)"
        
    # 每周聚合
    skill_weekly:
      columns:
        - "skill_id TEXT"
        - "week DATE"
        - "total_calls INTEGER"
        - "success_rate REAL"
        - "avg_latency_ms REAL"
        - "total_cost_yuan REAL"
        - "avg_quality_score REAL"
        - "trend TEXT"
        
    # 替换记录
    skill_replacements:
      columns:
        - "id INTEGER PRIMARY KEY"
        - "old_skill_id TEXT"
        - "new_skill_id TEXT"
        - "reason TEXT"
        - "auto BOOLEAN"
        - "timestamp DATETIME"
        - "rollback_available BOOLEAN"
        
    # 新技能生成记录
    skill_generations:
      columns:
        - "id INTEGER PRIMARY KEY"
        - "generated_skill_id TEXT"
        - "based_on_pattern TEXT"
        - "prototype_version TEXT"
        - "status TEXT"  # prototype / testing / active / retired
        - "created_at DATETIME"
```

### 2.3 监控采集（自动）

```yaml
# 每次 Skill 调用自动采集
auto_collect:
  # 在 SkillRunner 执行后自动记录
  trigger: "after_each_skill_call"
  action: "INSERT INTO skill_calls ..."
  
  # 每日 00:00 聚合
  daily_aggregate:
    schedule: "cron 0 0 * * *"
    action: |
      INSERT INTO skill_daily
      SELECT skill_id, DATE(timestamp), COUNT(*), 
             AVG(CASE WHEN status='success' THEN 1 ELSE 0 END),
             AVG(latency_ms), SUM(cost_yuan), AVG(quality_score)
      FROM skill_calls
      WHERE DATE(timestamp) = DATE('now', '-1 day')
      GROUP BY skill_id, DATE(timestamp)
      
  # 每周日 00:00 聚合 + 趋势判断
  weekly_aggregate:
    schedule: "cron 0 0 * * 0"
    action: |
      -- 聚合 + 与上周对比判断趋势
      INSERT INTO skill_weekly
      SELECT skill_id, DATE(timestamp, 'weekday 0', '-7 days'),
             COUNT(*), AVG(success_rate), AVG(avg_latency_ms),
             SUM(total_cost_yuan), AVG(avg_quality_score),
             CASE 
               WHEN this_week.success_rate > last_week.success_rate + 0.05 THEN 'improving'
               WHEN this_week.success_rate < last_week.success_rate - 0.05 THEN 'degrading'
               ELSE 'stable'
             END
      FROM ...
```

---

## 三、Layer 2：执行层（Skill Runner）

### 3.1 执行流程

```yaml
# Skill 执行前的"思考"流程
skill_execution_flow:
  step_1: "接收任务"
    input: "任务描述 + 任务类型 + 用户角色"
    
  step_2: "思考选技能（Skill Thinker）"
    input: "任务类型 + 历史 metrics"
    action: "查询 skill_daily 表，按 success_rate × quality_score × (1/avg_cost) 排序"
    output: "候选技能列表（Top 3）"
    
  step_3: "检查替换规则"
    input: "候选技能列表 + Skill Evolver 的替换建议"
    action: "如果有待替换的技能，自动切换到替代品"
    output: "最终选定的技能"
    
  step 4: "执行"
    input: "选定的技能 + 输入参数"
    action: "调用技能，记录开始时间"
    
  step_5: "验证输出"
    input: "技能输出 + 预期 schema"
    action: "schema 验证 + 质量评分"
    output: "output_quality_score"
    
  step_6: "记录指标"
    input: "执行结果 + 质量评分 + 延迟 + 成本"
    action: "INSERT INTO skill_calls"
    
  step 7: "反馈进化"
    input: "本次执行结果"
    action: "如果连续 3 次失败 → 触发 Skill Evolver 评估"
```

### 3.2 执行器代码

```typescript
// skill-runner.ts（v3 核心执行器）

interface SkillRunner {
  // 执行一个技能
  execute(
    taskId: string,
    skillId: string,
    args: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<SkillResult>;
  
  // 思考选哪个技能
  think(
    taskType: TaskType,
    userRole: UserRole,
    constraints: SkillConstraints
  ): Promise<SkillCandidate[]>;
}

interface ExecutionContext {
  role: AgentRole;
  workflow: WorkflowId;
  userRole: UserRole;
  budget_remaining: number;
  timestamp: string;
}

interface SkillResult {
  status: "success" | "failed" | "timeout" | "degraded";
  output: unknown;
  metrics: {
    latency_ms: number;
    tokens_used: number;
    cost_yuan: number;
    quality_score: number;
    retry_count: number;
  };
}

// 思考函数：基于历史 metrics 选最优技能
async function think(
  taskType: TaskType,
  userRole: UserRole,
  constraints: SkillConstraints
): Promise<SkillCandidate[]> {
  // 1. 查找所有匹配任务类型的技能
  const candidates = await db.query(`
    SELECT s.skill_id, s.name, s.trust_level,
           d.success_rate, d.avg_latency_ms, d.total_cost_yuan, d.avg_quality_score
    FROM skills s
    JOIN skill_daily d ON s.skill_id = d.skill_id
    WHERE s.task_type = ? AND s.trust_level IN ('A', 'B')
    AND d.date >= DATE('now', '-7 days')
    ORDER BY d.success_rate * d.avg_quality_score * (1.0 / MAX(d.total_cost_yuan, 0.001)) DESC
    LIMIT 3
  `, [taskType]);
  
  // 2. 检查是否有替换建议
  const replacements = await db.query(`
    SELECT * FROM skill_replacements
    WHERE old_skill_id IN (?) AND auto = 1 AND rollback_available = 1
  `, [candidates.map(c => c.skill_id)]);
  
  // 3. 如果有待替换的，用替代品替换
  for (const rep of replacements) {
    const idx = candidates.findIndex(c => c.skill_id === rep.old_skill_id);
    if (idx >= 0) {
      const replacement = await getSkillById(rep.new_skill_id);
      candidates[idx] = { ...replacement, source: 'auto_replacement' };
    }
  }
  
  // 4. 预算过滤
  return candidates.filter(c => c.total_cost_yuan <= constraints.max_cost);
}
```

---

## 四、Layer 3：编排层（Workflow Engine）

### 4.1 工作流动态替换

```yaml
# 工作流中的技能可以被动态替换
workflow_dynamic_replacement:
  # 规则：工作流执行时，如果某技能失败，自动找替代品
  fallback_rules:
    - trigger: "skill_status = 'failed' OR skill_status = 'timeout'"
      action: "query alternative_skills WHERE task_type = ? AND trust_level IN ('A','B')"
      max_alternatives: 3
      retry_with_alternative: true
      
    - trigger: "skill_status = 'degraded' AND quality_score < 0.6"
      action: "log_degradation + suggest_replacement"
      auto_replace: false  # 降级不自动替换，需人工确认
      
    - trigger: "skill_status = 'failed' 3 times consecutively"
      action: "trigger_skill_evolver_assessment"
      auto_replace: true   # 连续失败自动触发评估

  # 示例：价格异动分析工作流的动态替换
  example_workflow:
    name: "price_alert_analysis"
    stages:
      - role: "Collector"
        primary_skill: "fetch_world_bank"
        alternatives: ["fetch_comtrade_flow", "fetch_fred_observation"]
        fallback_mcp: "weighted-websearch"  # 最后兜底用搜索
        
      - role: "Reasoner"
        primary_skill: "causal_dag"
        alternatives: ["scenario_predict"]
        fallback_model: "deepseek-v4-flash"  # 主模型不可用时降级
        
      - role: "Writer"
        primary_skill: "obsidian_writer"
        alternatives: ["report_formatter"]  # 写不了 Obsidian 就输出 Markdown
```

---

## 五、Layer 4：进化层（Skill Evolver）

### 5.1 评估引擎

```yaml
# 每周日 00:00 自动评估所有技能
skill_evaluation:
  schedule: "cron 0 0 * * 0"
  
  # 评估维度（5 维度，每维度 0-10 分）
  dimensions:
    - name: "Reliability"
      weight: 0.25
      metric: "success_rate"
      scoring: "success_rate * 10"
      
    - name: "Performance"
      weight: 0.20
      metric: "avg_latency_ms"
      scoring: "MAX(0, 10 - (avg_latency_ms / 1000))"  # 1s=9分, 5s=5分, 10s=0分
      
    - name: "Cost"
      weight: 0.20
      metric: "total_cost_yuan"
      scoring: "MAX(0, 10 - (total_cost_yuan * 10))"  # ¥0=10分, ¥0.5=5分, ¥1=0分
      
    - name: "Quality"
      weight: 0.20
      metric: "avg_quality_score"
      scoring: "avg_quality_score * 10"
      
    - name: "Trend"
      weight: 0.15
      metric: "trend"
      scoring: "improving=10, stable=7, degrading=3"
      
  # 综合评分
  total_score: "SUM(dimension_score * dimension_weight)"
  
  # 评级
  ratings:
    - grade: "A"
      range: "8.0-10.0"
      action: "保持，推荐为首选"
      
    - grade: "B"
      range: "6.0-7.9"
      action: "保持，可被 A 级替换"
      
    - grade: "C"
      range: "4.0-5.9"
      action: "标记为候选替换，寻找替代品"
      
    - grade: "D"
      range: "0-3.9"
      action: "自动退役，强制替换"
```

### 5.2 自动替换流程

```yaml
# 替换流程
auto_replacement_flow:
  step_1: "评估结果出炉，标记 C/D 级技能"
  step_2: "在 AgenticSkills.io / Smithery / Composio 搜索同任务类型替代品"
  step_3: "按信任等级过滤（A/B 级优先）"
  step 4: "在 sandbox 中测试替代品（5 天）"
  step 5: "对比 metrics：替代品必须优于原技能 ≥15%"
  step 6: "写入 skill_replacements 表（标记 auto=1）"
  step 7: "下一个工作流执行时自动切换"
  step 8: "保留 rollback_available=1（30 天内可回滚）"

  # 替换决策矩阵
  replacement_decision:
    # C 级技能：寻找替代品
    c_grade:
      action: "search_alternatives"
      threshold: "新技能必须 success_rate > 0.9 AND cost < 原技能 * 1.2"
      auto_replace: false  # 需人工确认
      
    # D 级技能：自动退役
    d_grade:
      action: "auto_retire"
      threshold: "连续 2 周 D 级"
      auto_replace: true   # 自动替换
      notification: "notify_owner"
      
    # 连续失败：紧急替换
    consecutive_failures:
      threshold: "3 次连续失败"
      action: "emergency_replace"
      auto_replace: true
      notification: "notify_owner_urgent"
```

### 5.3 自主生成新技能

```yaml
# 根据使用模式自动生成新技能
skill_generation:
  # 触发条件
  triggers:
    - trigger: "多次使用组合技能完成同一类任务"
      example: "用户反复问'棉花价格+汇率+关税'组合问题"
      action: "分析使用模式，提议生成组合技能"
      
    - trigger: "某角色频繁手动补充缺失能力"
      example: "Reasoner 每次都需要额外调 websearch 补充数据"
      action: "提议将 websearch 集成为 Reasoner 的内置技能"
      
    - trigger: "工作流中某步骤反复超时"
      example: "fetch_japan_customs_excel 每次都超时（Playwright 抓取慢）"
      action: "提议生成缓存版本或替代方案"

  # 生成流程
  generation_flow:
    step_1: "模式发现（Pattern Discovery）"
      description: "分析 skill_calls 表，发现重复模式"
      tools: ["SQL 聚合分析", "LLM 模式识别"]
      output: "pattern_report.md"
      
    step_2: "技能设计（Skill Design）"
      description: "基于模式设计新技能的接口和实现"
      tools: ["LLM 设计", "参考 Anthropic Skills 规范"]
      output: "new_skill_spec.md"
      
    step_3: "原型实现（Prototype）"
      description: "用 LLM 生成技能代码骨架"
      tools: ["LLM 代码生成", "Skill Creator 规范"]
      output: "skill prototype SKILL.md"
      
    step 4: "沙箱测试（Sandbox Test）"
      description: "在隔离环境中测试 5 天"
      tools: ["Docker sandbox", "mcp-scan"]
      output: "test_results.md"
      
    step 5: "对比验证（Comparison）"
      description: "新技能 vs 旧方案，metrics 对比"
      tools: ["A/B 测试", "metrics DB"]
      output: "comparison_report.md"
      
    step 6: "人工审批（Human Review）"
      description: "owner 审批新技能"
      tools: ["通知 owner", "审批界面"]
      output: "approval decision"
      
    step 7: "灰度上线（Gradual Rollout）"
      description: "5% → 25% → 50% → 100%"
      tools: ["流量分配", "metrics 监控"]
      output: "rollout status"

  # 示例：自动生成"棉花价格综合分析"技能
  example_generation:
    discovered_pattern: |
      过去 30 天，47 次调用中：
      - 32 次（68%）同时调用 fetch_world_bank + fetch_fred_observation + causal_dag
      - 28 次（60%）结果需要写入 Obsidian
      - 用户角色：采购经理 72%，老板 18%，销售 10%
      
    proposed_skill:
      name: "cotton_price_analysis"
      description: "棉花价格综合分析：拉取国际棉花价格 + 汇率 + 传导率 + 给出囤料建议"
      based_on: "fetch_world_bank + fetch_fred_observation + causal_dag + trend_forecast"
      estimated_cost: "~¥0.01/次（比分开调用省 40%）"
      estimated_latency: "~800ms（比分开调用快 60%）"
      
    benefits:
      - "减少 token 消耗（1 次调用 vs 4 次）"
      - "减少延迟（并行拉取 vs 串行）"
      - "提升质量（组合优化 vs 独立调用）"
      - "简化工作流（1 个技能 vs 4 个技能）"
```

---

## 六、Layer 5：思考层（Skill Thinker）

### 6.1 Agent 执行前的"思考"协议

```yaml
# Agent 在执行任何任务前必须先"思考"
skill_thinking_protocol:
  # 触发条件：每次 Agent 开始执行任务
  trigger: "before_each_task_execution"
  
  # 思考步骤
  thinking_steps:
    step_1_understand: "理解任务"
      question: "这个任务的核心目标是什么？"
      action: "解析任务描述，提取 task_type + required_output"
      
    step_2_assess: "评估能力"
      question: "我当前的技能组合能完成这个任务吗？"
      action: "查询 skill_daily 表，检查相关技能的 success_rate"
      
    step_3_select: "选择技能"
      question: "哪个技能最适合？成本和质量如何？"
      action: "按 success_rate × quality_score × (1/cost) 排序，选 Top 3"
      
    step_4_consider: "考虑替代"
      question: "有没有更好的替代品？最近有新技能上线吗？"
      action: "检查 skill_replacements + skill_generations 表"
      
    step_5_plan: "制定计划"
      question: "执行计划是什么？需要哪些技能？预估成本？"
      action: "生成执行计划，包含技能序列 + 预估成本"
      
    step_6_execute: "执行"
      question: "按计划执行"
      action: "调用技能，记录 metrics"
      
    step_7_reflect: "反思"
      question: "这次执行效果如何？有什么可以改进的？"
      action: "更新 metrics，如果效果差则触发 Skill Evolver"

  # 思考输出格式
  thinking_output:
    format: |
      ## 技能思考报告
      - **任务**：{task_description}
      - **任务类型**：{task_type}
      - **选定技能**：{selected_skills}
      - **替代方案**：{alternatives}
      - **预估成本**：{estimated_cost}
      - **预估延迟**：{estimated_latency}
      - **风险评估**：{risk_assessment}
      - **决策理由**：{reasoning}
```

### 6.2 思考引擎代码

```typescript
// skill-thinker.ts（v3 思考引擎）

interface SkillThinker {
  // 执行前思考
  think(
    task: Task,
    context: ExecutionContext
  ): Promise<ThinkingReport>;
  
  // 执行后反思
  reflect(
    task: Task,
    result: SkillResult,
    report: ThinkingReport
  ): Promise<ReflectionReport>;
}

interface ThinkingReport {
  task: Task;
  taskType: TaskType;
  selectedSkills: SkillCandidate[];
  alternatives: SkillCandidate[];
  estimatedCost: number;
  estimatedLatency: number;
  riskAssessment: string;
  reasoning: string;
}

interface ReflectionReport {
  performance: {
    actualCost: number;
    actualLatency: number;
    qualityScore: number;
    success: boolean;
  };
  comparison: {
    estimatedVsActual: string;
    skillEffectiveness: number;  // 0-1
  };
  suggestions: string[];  // "建议替换 X 为 Y" / "建议生成新技能 Z"
  triggerEvolver: boolean;  // 是否触发进化层
}

// 思考函数
async function think(
  task: Task,
  context: ExecutionContext
): Promise<ThinkingReport> {
  // 1. 理解任务
  const taskType = classifyTask(task.description);
  
  // 2. 评估能力：查历史 metrics
  const candidates = await db.query(`
    SELECT s.*, d.success_rate, d.avg_latency_ms, d.total_cost_yuan, d.avg_quality_score
    FROM skills s
    LEFT JOIN skill_daily d ON s.skill_id = d.skill_id
    WHERE s.task_type = ? AND s.trust_level IN ('A', 'B')
    AND (d.date IS NULL OR d.date >= DATE('now', '-7 days'))
    ORDER BY COALESCE(d.success_rate, 0.5) * COALESCE(d.avg_quality_score, 0.5) DESC
    LIMIT 5
  `, [taskType]);
  
  // 3. 选择最优
  const selected = candidates[0];
  const alternatives = candidates.slice(1, 3);
  
  // 4. 考虑替换
  const pendingReplacements = await db.query(`
    SELECT * FROM skill_replacements
    WHERE old_skill_id = ? AND auto = 1
  `, [selected.skill_id]);
  
  // 5. 制定计划
  return {
    task,
    taskType,
    selectedSkills: pendingReplacements.length > 0
      ? [await getSkillById(pendingReplacements[0].new_skill_id)]
      : [selected],
    alternatives,
    estimatedCost: selected.total_cost_yuan || 0.01,
    estimatedLatency: selected.avg_latency_ms || 1000,
    riskAssessment: selected.success_rate < 0.8 ? 'medium' : 'low',
    reasoning: `选择 ${selected.name}：成功率 ${selected.success_rate || '未知'}，` +
               `成本 ¥${selected.total_cost_yuan || '未知'}，` +
               `质量 ${(selected.avg_quality_score || 0).toFixed(2)}`
  };
}

// 反思函数
async function reflect(
  task: Task,
  result: SkillResult,
  report: ThinkingReport
): Promise<ReflectionReport> {
  const suggestions: string[] = [];
  let triggerEvolver = false;
  
  // 检查是否需要替换
  if (result.status === 'failed') {
    suggestions.push(`技能 ${report.selectedSkills[0].skill_id} 失败，建议查找替代品`);
    triggerEvolver = true;
  }
  
  if (result.metrics.quality_score < 0.6) {
    suggestions.push(`技能 ${report.selectedSkills[0].skill_id} 质量偏低 (${result.metrics.quality_score})，建议评估`);
  }
  
  if (result.metrics.cost_yuan > report.estimatedCost * 2) {
    suggestions.push(`成本超支：实际 ¥${result.metrics.cost_yuan} vs 预估 ¥${report.estimatedCost}`);
  }
  
  // 检查是否需要生成新技能
  const similarPatterns = await db.query(`
    SELECT task_type, COUNT(*) as cnt
    FROM skill_calls
    WHERE task_type = ? AND timestamp >= DATE('now', '-7 days')
    GROUP BY task_type
    HAVING cnt >= 10
  `, [report.taskType]);
  
  if (similarPatterns.length > 0 && similarPatterns[0].cnt >= 10) {
    suggestions.push(`任务类型 ${report.taskType} 过去 7 天调用 ${similarPatterns[0].cnt} 次，建议生成专用技能`);
  }
  
  return {
    performance: {
      actualCost: result.metrics.cost_yuan,
      actualLatency: result.metrics.latency_ms,
      qualityScore: result.metrics.quality_score,
      success: result.status === 'success'
    },
    comparison: {
      estimatedVsActual: result.status === 'success' ? '匹配' : '偏差',
      skillEffectiveness: result.metrics.quality_score * (result.status === 'success' ? 1 : 0.3)
    },
    suggestions,
    triggerEvolver
  };
}
```

---

## 七、自进化闭环

```yaml
# 完整的自进化闭环
evolution_loop:
  # 每日循环
  daily:
    - "00:00 聚合昨日 metrics"
    - "检查连续失败技能（≥3 次）"
    - "如果有 → 触发紧急评估"
    
  # 每周循环
  weekly:
    - "周日 00:00 全量评估（5 维度评分）"
    - "标记 C/D 级技能"
    - "搜索替代品（A/B 级平台）"
    - "sandbox 测试替代品"
    - "写入 skill_replacements 表"
    
  # 每月循环
  monthly:
    - "月度 1 日分析使用模式"
    - "发现重复模式 → 提议生成新技能"
    - "新技能 prototype → sandbox 测试"
    - "owner 审批 → 灰度上线"
    - "退役连续 2 月 D 级的旧技能"
    
  # 实时循环
  realtime:
    - "每次 Skill 调用后记录 metrics"
    - "每次 Skill 失败后检查替代品"
    - "每次 Agent 执行前先思考选技能"
    - "每次执行后反思改进"
```

---

## 八、实施路径

### Phase 1（Week 1）：监控层
```
1. 创建 metrics DB（SQLite）
2. 实现 skill_calls 表自动采集
3. 实现每日/每周聚合
4. 在 Obsidian 中创建 _元数据/SkillsMetrics.md
```

### Phase 2（Week 2）：思考层
```
1. 实现 SkillThinker（think + reflect）
2. 在 Agent 执行前插入思考步骤
3. 在 Agent 执行后插入反思步骤
4. 生成 ThinkingReport + ReflectionReport
```

### Phase 3（Week 3）：进化层
```
1. 实现 SkillEvaluator（5 维度评分）
2. 实现 AutoReplacer（自动替换流程）
3. 实现 SkillGenerator（自主生成新技能）
4. 配置替换规则 + 生成触发条件
```

### Phase 4（Week 4）：闭环验证
```
1. 端到端测试：监控→思考→执行→反思→进化
2. 模拟失败场景，验证自动替换
3. 模拟重复使用场景，验证新技能生成
4. 验证回滚机制
```

---

> **自进化生态 = 监控 + 思考 + 执行 + 反思 + 进化 = 5 层闭环**
>
> **核心理念**：Agent 不只是用技能，而是**思考技能**——每次执行前评估、每次执行后反思、每周全量进化
>
> **最终目标**：Skills 生态自我优化，无需人工干预就能越来越好
