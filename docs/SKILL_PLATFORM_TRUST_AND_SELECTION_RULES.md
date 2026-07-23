# Skills / MCP 平台可信度评估 + 岗位自动选取规则

> **版本**：v1.2
> **更新日期**：2026-07-01
> **目的**：评估 25 个 Skills/MCP 平台的可信度 + MCP 安全审计（73% 失败率），设计不同岗位的 Skills + MCP + 工作流自动组合选取规则
> **适用范围**：v3 产链引擎 7 角色 + 4 用户角色 + 未来扩展

---

## ⭐ 铁律

```
1. 优先使用官方源（Anthropic Skills / Composio / Smithery）——经过社区审计
2. 第三方平台按可信度分级（A/B/C/D），D 级禁止自动安装
3. 安装前必须跑 SKILL VETTING REPORT（来源审查→代码审查→权限评估→报告→确认）
4. 岗位自动选取 = 角色 × 任务类型 × 可信度等级 → 最优 Skills/MCP 组合
5. 所有新 Skill 必须在 sandbox 隔离测试 5 天后才能进入生产
```

---

## 一、25 个平台可信度评估

### 1.1 可信度分级标准

| 等级 | 标准 | 可用场景 |
|------|------|---------|
| **A（金标）** | 官方组织维护、开源、社区审计、透明治理 | 生产环境直接使用 |
| **B（可靠）** | 已知运营者、开源或半开源、有审计机制 | 生产环境使用（需 Vetting） |
| **C（可用）** | 有运营者但不透明、社区驱动、小规模 | 测试环境使用，人工审核后上生产 |
| **D（危险）** | 无法验证运营者、无审计、有恶意迹象 | 禁止安装 |

### 1.2 完整评估表

| # | 平台 | URL | 运营者 | 格式 | 技能数 | 可信度 | 红旗 |
|---|------|-----|--------|------|--------|--------|------|
| 1 | **Anthropic Skills** | github.com/anthropics/skills | Anthropic（官方） | SKILL.md + YAML frontmatter | ~10 官方 | **A** | 无。规范源头，157K★ |
| 2 | **Composio awesome-claude-skills** | github.com/ComposioHQ/awesome-claude-skills | Composio（商业公司） | SKILL.md 链接 | 1000+ | **A** | 营销漏斗动机，但技能本身开源 |
| 3 | **Smithery** | smithery.ai/skills | Smithery（商业平台） | MCP + SKILL.md | 18,719 | **A** | 有定价页，freemium 模式 |
| 4 | **Skills.sh** | skills.sh | Vercel（大厂背书） | SKILL.md + `npx skills add` | 855K 安装量 | **A** | 通用安装器，质量参差 |
| 5 | **AITmpl** | aitmpl.com/skills | Ivan Davila（GitHub 个人） | SKILL.md + MCP + Hooks | 未知 | **B** | 个人维护，但有 Vercel/Neon 赞助 |
| 6 | **ClawHub** | clawhub.ai | OpenClaw 项目（GitHub org） | SKILL.md + MCP 插件 | 30 技能 + 12 插件 | **B** | 透明治理，签名清单 |
| 7 | **Skill-CN** | skill-cn.com | xgaicoding（GitHub 个人） | 外链 GitHub | 63 技能 + 268 教程 | **B** | 小社区，含联盟链接 |
| 8 | **SkillsMP** | skillsmp.com/zh | 匿名/社区 | SKILL.md + MCP + API | 200万+（声称） | **C** | 规模声称不可验证，运营者不明 |
| 9 | **AgentSkillsHub** | agentskillshub.top | Jason Zhu（个人） | MCP + Claude/Codex Skill | 12.6万+（声称） | **C** | `.top` 域名，个人运营，规模夸大 |
| 10 | **SkillCast** | skillcast.cn/skill.md | 未知中国运营者 | SKILL.md（OpenClaw） | 未知 | **C** | 代币激励机制膨胀下载量，运营者不透明 |
| 11 | **Qoder Community** | qoder-community.pages.dev/zh/skills/ | 未知 | 未知 | 未知 | **D** | 无法访问，Cloudflare Pages 免费托管 |
| 12 | **SkillHub.cn** | skillhub.cn | 未知 | 未知 | 未知 | **D** | 页面无实质内容，运营者不明 |
| 13 | **SkillHub 评测文** | mp.weixin.qq.com/s/wD14DNQx88vwzjUC1R0feA | SkillHub（腾讯科技背景） | TRACE 评测框架文章 | N/A | **B** | 推广 SkillHub 平台，但 TRACE 五维度评测框架有参考价值 |
| 14 | **骁哥 AI 编程** | mp.weixin.qq.com/s/agL1SczUDZ5VePfV4fXN9Q | 技术博主 | agent-browser 实战教程 | N/A | **B** | 技术教程为主，登录态持久化方案实用（`--profile` 参数） |
| 15 | **机器之心** | mp.weixin.qq.com/s/WNvEhNUv0BaZaW-W_Tec4A | 机器之心（知名 AI 媒体） | TRAE Skills 平台介绍 | N/A | **B** | 推广字节跳动 TRAE 产品，引用 Karpathy 观点，Skill vs Rules 区分有价值 |

### 1.3 可信度总结

```
A 级（4 个）= 官方/大厂/成熟平台 → 生产环境直接用
  Anthropic Skills / Composio / Smithery / Skills.sh

B 级（6 个）= 可验证运营者 → Vetting 后上生产
  AITmpl / ClawHub / Skill-CN / SkillHub评测文 / 骁哥AI编程 / 机器之心

C 级（3 个）= 运营者不透明或小规模 → 仅测试环境，人工逐个审核
  SkillsMP / AgentSkillsHub / SkillCast

D 级（2 个）= 无法验证 → 禁止安装
  Qoder Community / SkillHub.cn
```

### 1.4 域名可信度速查

| TLD | 信号 | 示例 |
|-----|------|------|
| `.ai` / `.com` / `.org` | 正常 | anthropics.com, smithery.ai |
| `.dev` / `.app` | Google 域名，需验证 | — |
| `.cn` | 中国域名，需额外审查 | skill-cn.com, skillhub.cn |
| `.top` | 低成本/一次性域名，高风险 | agentskillshub.top |
| `pages.dev` | Cloudflare 免费托管，无身份验证 | qoder-community.pages.dev |

---

## 二、v3 7 角色 × Skills/MCP 自动组合规则

### 2.1 角色-技能映射总表

```yaml
# v3 7 角色的 Skills + MCP 自动组合配置

roles:
  # ═══════════════════════════════════════════
  # 角色 1：Collector（数据采集员）
  # ═══════════════════════════════════════════
  collector:
    profession: "Data Collector"
    basedOn: "Anthropic Cookbook: API Integration Patterns"
    style_preset: "conservative"  # 最小化 API 调用
    
    required_skills:
      - name: "fetch_world_bank"
        source: "anthropic-skills"
        trust_level: A
        cost: 0
        description: "调 World Bank API 拉 GDP/贸易指标"
        
      - name: "fetch_comtrade_flow"
        source: "anthropic-skills"
        trust_level: A
        cost: 0
        description: "调 UN Comtrade 拉进出口流量"
        
      - name: "fetch_fred_observation"
        source: "anthropic-skills"
        trust_level: A
        cost: 0
        description: "调 FRED API 拉美国经济指标"
        
      - name: "fetch_eurostat_point"
        source: "anthropic-skills"
        trust_level: A
        cost: 0
        description: "调 Eurostat API 拉欧盟数据"
        
      - name: "fetch_japan_customs_excel"
        source: "custom-playwright"
        trust_level: B
        cost: 0
        description: "Playwright 抓日本海关 Excel"
        
      - name: "fetch_hkex_pdf"
        source: "custom-playwright"
        trust_level: B
        cost: 0
        description: "Playwright 抓港交所 PDF"
        
      - name: "watch_excel_file"
        source: "custom-watchdog"
        trust_level: B
        cost: 0
        description: "监控本地 Excel 文件变化"
        
      - name: "read_manual_input_form"
        source: "custom-form"
        trust_level: B
        cost: 0
        description: "读取人工录入表单"
    
    required_mcp:
      - name: "official-source-adapters-mcp"
        trust_level: A
        description: "9 个外部数据源适配器"
        
      - name: "weighted-websearch-mcp"
        trust_level: A
        description: "加权网页搜索"
    
    optional_skills:
      - name: "fetch_cotlook"
        source: "skill-cn"
        trust_level: B
        description: "Cotlook 棉花价格（需 API Key）"
        
      - name: "fetch_1688_price"
        source: "custom-scraping"
        trust_level: C
        description: "1688 原料价格（需 Playwright）"
    
    excluded_platforms:
      - "qoder-community.pages.dev"  # D 级
      - "skillhub.cn"                 # D 级

  # ═══════════════════════════════════════════
  # 角色 2：Cleaner（数据清洗员）
  # ═══════════════════════════════════════════
  cleaner:
    profession: "Data Cleaner"
    basedOn: "Data Engineering Cookbook (O'Reilly)"
    style_preset: "conservative"  # 规则引擎为主
    
    required_skills:
      - name: "schema_validator"
        source: "custom-rule-engine"
        trust_level: B
        cost: 0
        description: "JSON Schema 验证（7 要素）"
        
      - name: "dedup_engine"
        source: "custom-rule-engine"
        trust_level: B
        cost: 0
        description: "去重引擎（基于 evidence hash）"
        
      - name: "format_normalizer"
        source: "custom-rule-engine"
        trust_level: B
        cost: 0
        description: "格式标准化（日期/货币/单位）"
    
    required_mcp: []  # 纯规则引擎，不需要 MCP
    
    optional_skills:
      - name: "pdf_extractor"
        source: "anthropic-skills"
        trust_level: A
        cost: 0
        description: "PDF 字段抽取（pdfplumber）"
        
      - name: "excel_parser"
        source: "anthropic-skills"
        trust_level: A
        cost: 0
        description: "Excel 解析（openpyxl）"

  # ═══════════════════════════════════════════
  # 角色 3：Weigher（证据加权员）
  # ═══════════════════════════════════════════
  weigher:
    profession: "Evidence Weigher"
    basedOn: "CIA Triad + OSINT Standards"
    style_preset: "balanced"
    
    required_skills:
      - name: "source_scorer"
        source: "custom-rule-engine"
        trust_level: B
        cost: 0
        description: "信源评分（10 分制，56 源权重）"
        
      - name: "confidence_calculator"
        source: "custom-rule-engine"
        trust_level: B
        cost: 0
        description: "置信度计算（3 级：实证/共识/推断）"
        
      - name: "cross_validation"
        source: "custom-rule-engine"
        trust_level: B
        cost: 0
        description: "多源交叉验证（≥2 源确认）"
    
    required_mcp:
      - name: "evidence-ledger-mcp"
        trust_level: A
        description: "证据账本（写入/查询/评分）"

  # ═══════════════════════════════════════════
  # 角色 4：Reasoner（推理分析师）
  # ═══════════════════════════════════════════
  reasoner:
    profession: "Data Analyst / Reasoner"
    basedOn: "McKinsey Problem Solving 7 Steps"
    style_preset: "balanced"
    
    required_skills:
      - name: "causal_dag"
        source: "custom-llm"
        trust_level: B
        cost: 0.02  # 每次推理成本
        description: "因果 DAG 推理（5 步法）"
        
      - name: "scenario_predict"
        source: "custom-llm"
        trust_level: B
        cost: 0.02
        description: "3 场景模拟（乐观/基准/悲观）"
        
      - name: "evidence_lookup"
        source: "custom-rule-engine"
        trust_level: B
        cost: 0
        description: "证据检索（从 evidence ledger）"
    
    required_mcp:
      - name: "ark-memory-search-vector-mcp"
        trust_level: A
        description: "向量记忆搜索（语义检索）"
        
      - name: "evidence-ledger-mcp"
        trust_level: A
        description: "证据账本查询"
    
    optional_skills:
      - name: "counter_evidence_search"
        source: "custom-llm"
        trust_level: B
        cost: 0.01
        description: "反证搜索（Devil's Advocate 预备）"

  # ═══════════════════════════════════════════
  # 角色 5：Devil（反证挑战者）
  # ═══════════════════════════════════════════
  devil:
    profession: "Devil's Advocate / Auditor"
    basedOn: "ISACA IT Audit Standards"
    style_preset: "aggressive"  # 激进 = 找反证
    
    required_skills:
      - name: "counter_evidence_search"
        source: "custom-llm"
        trust_level: B
        cost: 0.01
        description: "反证搜索（找矛盾证据）"
        
      - name: "logical_fallacy_detector"
        source: "custom-llm"
        trust_level: B
        cost: 0.01
        description: "逻辑谬误检测"
        
      - name: "bias_identifier"
        source: "custom-llm"
        trust_level: B
        cost: 0.01
        description: "偏见识别（确认偏见/幸存者偏见）"
    
    required_mcp:
      - name: "weighted-websearch-mcp"
        trust_level: A
        description: "搜索反面证据"
    
    # 关键约束：Devil 必须用异源模型（不能和 Reasoner 同模型）
    model_constraint: "must_be_different_from_reasoner"

  # ═══════════════════════════════════════════
  # 角色 6：Predictor（预测师）
  # ═══════════════════════════════════════════
  predictor:
    profession: "Business Intelligence Analyst"
    basedOn: "SCIP Competitive Intelligence Standards"
    style_preset: "exploratory"  # 探索性 = 多场景
    
    required_skills:
      - name: "trend_forecast"
        source: "custom-llm"
        trust_level: B
        cost: 0.02
        description: "趋势预测（时间序列 + 因果）"
        
      - name: "risk_assessor"
        source: "custom-llm"
        trust_level: B
        cost: 0.02
        description: "风险评估（概率 × 影响）"
        
      - name: "opportunity_mapper"
        source: "custom-llm"
        trust_level: B
        cost: 0.01
        description: "机会映射（市场缺口分析）"
    
    required_mcp:
      - name: "ark-memory-search-vector-mcp"
        trust_level: A
        description: "历史预测回溯验证"

  # ═══════════════════════════════════════════
  # 角色 7：Writer（报告撰写员）
  # ═══════════════════════════════════════════
  writer:
    profession: "Report Writer / Documentation"
    basedOn: "Technical Writing Standards"
    style_preset: "balanced"
    
    required_skills:
      - name: "obsidian_writer"
        source: "custom-file-io"
        trust_level: B
        cost: 0
        description: "写入 Obsidian 知识库（.md 文件）"
        
      - name: "report_formatter"
        source: "custom-template"
        trust_level: B
        cost: 0
        description: "报告格式化（JSON → Markdown）"
        
      - name: "summary_generator"
        source: "custom-llm"
        trust_level: B
        cost: 0.005
        description: "摘要生成（1 句话 + 3 要点）"
    
    required_mcp: []  # 写入本地文件，不需要 MCP
    
    optional_skills:
      - name: "email_sender"
        source: "custom-integration"
        trust_level: B
        cost: 0
        description: "邮件发送（通知用户）"
        
      - name: "feishu_webhook"
        source: "custom-integration"
        trust_level: B
        cost: 0
        description: "飞书 Webhook 推送"
```

### 2.2 自动组合选取规则（SkillRouter）

```yaml
# 岗位自动组合选取规则

skill_selection_rules:
  # ═══ 规则 1：按任务类型自动选技能 ═══
  task_type_routing:
    data_collection:
      required_role: "Collector"
      auto_select_skills:
        - "fetch_*"          # 所有 fetch 开头的技能
        - "watch_*"          # 所有 watch 开头的技能
      auto_select_mcp:
        - "official-source-adapters-mcp"
        - "weighted-websearch-mcp"
      exclude_platforms: ["D级平台"]
      
    data_analysis:
      required_role: "Reasoner"
      auto_select_skills:
        - "causal_dag"
        - "scenario_predict"
        - "evidence_lookup"
      auto_select_mcp:
        - "ark-memory-search-vector-mcp"
        - "evidence-ledger-mcp"
        
    risk_assessment:
      required_role: ["Reasoner", "Devil"]
      auto_select_skills:
        - "counter_evidence_search"
        - "risk_assessor"
        - "bias_identifier"
      auto_select_mcp:
        - "weighted-websearch-mcp"
      model_constraint: "reasoner_and_devil_must_differ"
      
    report_generation:
      required_role: "Writer"
      auto_select_skills:
        - "obsidian_writer"
        - "report_formatter"
        - "summary_generator"
      auto_select_mcp: []
      
    audit:
      required_role: ["Devil", "Weigher"]
      auto_select_skills:
        - "source_scorer"
        - "confidence_calculator"
        - "logical_fallacy_detector"
      auto_select_mcp:
        - "evidence-ledger-mcp"

  # ═══ 规则 2：按用户角色自动组合 ═══
  user_role_combinations:
    owner:  # 老板
      primary_roles: ["Reasoner", "Predictor", "Writer"]
      secondary_roles: ["Devil"]  # 老板说"你确定？"时触发
      auto_skills:
        - "causal_dag"          # 因果分析
        - "scenario_predict"    # 场景模拟
        - "risk_assessor"       # 风险评估
        - "obsidian_writer"     # 写报告
      auto_mcp:
        - "ark-memory-search-vector-mcp"
        - "evidence-ledger-mcp"
      interaction_mode: "chat"  # 老板用对话模式
      
    sales_director:  # 销售总监
      primary_roles: ["Collector", "Reasoner", "Writer"]
      secondary_roles: ["Predictor"]
      auto_skills:
        - "fetch_comtrade_flow"   # 贸易数据
        - "causal_dag"            # 客户变化原因
        - "obsidian_writer"       # 写客户报告
      auto_mcp:
        - "official-source-adapters-mcp"
        - "evidence-ledger-mcp"
      interaction_mode: "dashboard"  # 销售用看板模式
      
    procurement_manager:  # 采购经理
      primary_roles: ["Collector", "Reasoner", "Predictor"]
      secondary_roles: ["Weigher"]
      auto_skills:
        - "fetch_world_bank"      # 大宗商品价格
        - "fetch_fred_observation" # 汇率/利率
        - "trend_forecast"        # 价格趋势预测
        - "source_scorer"         # 信源评分
      auto_mcp:
        - "official-source-adapters-mcp"
        - "weighted-websearch-mcp"
      interaction_mode: "alert"  # 采购用告警模式
      
    production_manager:  # 生产厂长
      primary_roles: ["Collector", "Reasoner", "Writer"]
      secondary_roles: ["Weigher"]
      auto_skills:
        - "watch_excel_file"      # 监控 Excel 报工
        - "causal_dag"            # 良品率下降原因
        - "obsidian_writer"       # 写生产报告
      auto_mcp:
        - "evidence-ledger-mcp"
      interaction_mode: "dashboard"  # 生产用看板模式

  # ═══ 规则 3：按成本约束自动裁剪 ═══
  cost_optimization:
    # 月度预算分配（总预算 900 AFP）
    monthly_budget:
      collector: 2000    # 采集 = 低消耗（API 免费为主）
      cleaner: 100       # 清洗 = 几乎零消耗（规则引擎）
      weigher: 100       # 加权 = 几乎零消耗（规则引擎）
      reasoner: 4000     # 推理 = 主要消耗（LLM 调用）
      devil: 1500        # 反证 = 中等消耗（异源模型）
      predictor: 2000    # 预测 = 中等消耗（LLM 调用）
      writer: 300        # 写入 = 低消耗（规则 + 偶尔 LLM）
      
    # 自动降级规则
    degradation_rules:
      - condition: "budget_remaining < 20%"
        action: "switch_to_cheapest_model"
        affected_roles: ["Reasoner", "Predictor", "Devil"]
        fallback_model: "deepseek-v4-flash"
        
      - condition: "budget_remaining < 5%"
        action: "disable_optional_skills"
        affected_roles: ["All"]
        keep_only: "required_skills"
        
      - condition: "budget_remaining < 1%"
        action: "rule_engine_only"
        affected_roles: ["All"]
        description: "所有角色切换为纯规则引擎，不调 LLM"

  # ═══ 规则 4：按可信度等级过滤 ═══
  trust_filter:
    production:
      allowed_levels: ["A", "B"]
      require_vetting: true
      vetting_steps:
        - "检查来源（是否在 approved_sources 列表）"
        - "审查代码（静态分析 + 依赖检查）"
        - "评估权限（请求了哪些系统资源）"
        - "输出 SKILL VETTING REPORT"
        - "等待用户确认"
        
    testing:
      allowed_levels: ["A", "B", "C"]
      require_vetting: true
      isolation: "sandbox_only"  # 只在沙箱中运行
      
    forbidden:
      allowed_levels: []  # D 级永远不允许
      action: "block_install"
      notify: "admin"

  # ═══ 规则 5：新 Skill 引入流程 ═══
  new_skill_introduction:
    step1: "在 skills_registry 中注册（source, trust_level, cost）"
    step2: "在 SkillsSandbox 隔离测试 5 天"
    step3: "5 维评估（功能/安全/性能/兼容/成本）"
    step4: "owner 审批（critical 技能必须人工确认）"
    step5: "影子流量 10% 运行 7 天"
    step6: "灰度 5% → 25% → 50% → 100%"
    step7: "加入 v3 baseline skills"
```

---

## 三、MCP 自动组合规则

### 3.1 MCP 路由表

```yaml
mcp_routing:
  # 按任务类型自动选 MCP
  task_mcp_mapping:
    data_fetch:
      mcp: ["official-source-adapters-mcp"]
      max_concurrent: 3  # 单次任务最多 3 个 MCP 并发
      
    evidence_management:
      mcp: ["evidence-ledger-mcp"]
      max_concurrent: 2
      
    semantic_search:
      mcp: ["ark-memory-search-vector-mcp"]
      max_concurrent: 1
      
    web_research:
      mcp: ["weighted-websearch-mcp"]
      max_concurrent: 2
      
    full_pipeline:  # 完整流水线（Collector → ... → Writer）
      mcp: [
        "official-source-adapters-mcp",
        "evidence-ledger-mcp",
        "ark-memory-search-vector-mcp",
        "weighted-websearch-mcp"
      ]
      max_concurrent: 4
      cost_estimate: "~¥2/次"

  # MCP 成本约束
  mcp_cost_rules:
    - rule: "单次任务 MCP 调用总成本 < ¥5"
    - rule: "免费 MCP 优先（official-source-adapters > weighted-websearch）"
    - rule: "付费 MCP 需 owner 审批"
```

---

## 四、Obsidian 写入规则（Writer 角色）

### 4.1 写入分类

```yaml
obsidian_write_rules:
  # 写入目标 = Obsidian 知识库
  target_dir: "D:\\obesidian\\知识库\\"
  
  # 按角色自动选写入路径
  write_paths:
    collector_output:
      path: "主动情报/_数据采集/{YYYY-MM-DD}/{source_name}.md"
      format: "evidence_card"  # 7 要素格式
      
    reasoner_output:
      path: "主动情报/_分析报告/{YYYY-MM-DD}/{topic}.md"
      format: "analysis_report"  # 结论+置信度+边界
      
    devil_output:
      path: "主动情报/_反证记录/{YYYY-MM-DD}/{topic}-反证.md"
      format: "counter_evidence"  # 反证+逻辑谬误
      
    predictor_output:
      path: "主动情报/_预测报告/{YYYY-MM-DD}/{topic}.md"
      format: "prediction"  # 3场景+概率
      
    writer_output:
      path: "主动情报/_决策建议/{YYYY-MM-DD}/{topic}-建议.md"
      format: "recommendation"  # 1句话+3要点+行动
      
    audit_output:
      path: "主动情报/_审计报告/{YYYY-MM-DD}/{topic}-审计.md"
      format: "audit_report"  # PASS/WARN/FAIL
      
  # 存储分层铁律（从 _元数据/存储分层规则.md 继承）
  storage_layer_rules:
    always_local:  # 永远留在本地
      - "公司具体数据（富泉/南通/客户清单）"
      - "价格/成本数据"
      - "财务细节"
      - "API 凭据"
      - "内部决策过程"
      - "竞品数据/采购单价"
      
    sanitize_before_upload:  # 脱敏后才上传 ima
      - "通用方法论"
      - "公开行业报告"
      - "标准化 SOP"
      
    never_upload:  # 永远不上云
      - "客户名/客户清单"
      - "个人偏好"
      - "用户身份信息"
```

---

## 五、平台优先级排序（推荐使用顺序）

### 5.1 生产环境推荐

| 优先级 | 平台 | 用途 | 信任等级 |
|--------|------|------|---------|
| 1 | Anthropic Skills (GitHub) | 官方技能规范 + 参考实现 | A |
| 2 | Composio awesome-claude-skills | 社区策展技能列表 | A |
| 3 | Smithery | MCP 服务器注册 + 安装 | A |
| 4 | Skills.sh | 通用安装器 + 排行榜 | A |
| 5 | ClawHub | OpenClaw 生态技能 | B |
| 6 | AITmpl | Claude Code 模板 | B |
| 7 | Skill-CN | 中文技能导航 | B |

### 5.2 禁止使用

| 平台 | 原因 |
|------|------|
| qoder-community.pages.dev | D 级，无法访问，身份不明 |
| skillhub.cn | D 级，无实质内容，运营者不明 |

### 5.3 需人工审核

| 平台 | 原因 | 审核方式 |
|------|------|---------|
| skillsmp.com/zh | C 级，规模声称不可验证 | 逐个 Skill 代码审查 |
| agentskillshub.top | C 级，个人运营 | 逐个 Skill 代码审查 |
| skillcast.cn | C 级，代币膨胀 | 跳过下载量，看代码 |
| 微信文章 ×3 | 已抓取，B 级可用 | TRACE 框架 + agent-browser + TRAE 信息已整合 |

---

## 六、微信文章关键发现（已整合到规则中）

### 6.1 TRACE 五维度 Skill 评测框架（SkillHub）

```yaml
# 评估任何 Skill 的 5 个维度
trace_evaluation:
  T - Trust:        来源可信度（官方/社区/个人/匿名）
  R - Reliability:  可靠性（测试通过率/错误处理/边界情况）
  A - Adaptability: 适应性（不同场景/模型/平台的兼容性）
  C - Convention:   规范性（遵循 SKILL.md 标准/MCP spec）
  E - Effectiveness: 有效性（实际完成任务的成功率）
  
  # 评分标准（0-10）
  scoring:
    9-10: "生产环境直接用"
    7-8:  "Vetting 后上生产"
    5-6:  "仅测试环境"
    <5:   "禁止安装"
    
  # v3 采纳：将 TRACE 嵌入 SKILL VETTING REPORT
  integration: "在 Step 3（评估权限）后增加 TRACE 五维度打分"
```

### 6.2 Skill vs Rules 区别（TRAE 平台文章）

```yaml
# 关键认知：Skill 不是 Rules
skill_vs_rules:
  rules:
    description: "全局加载，每次会话都注入"
    cost: "每次会话都消耗 token"
    适用: "行为规范、编码风格、安全规则"
    示例: "不要加注释 / 用 2 空格缩进 / 禁止 console.log"
    
  skill:
    description: "按需调用，只在匹配时加载"
    cost: "只在触发时消耗 token"
    适用: "专业任务、工具集成、复杂工作流"
    示例: "生图 / 浏览器自动化 / 数据分析 / 写报告"
    
  v3 采纳: "7 角色的行为规范用 Rules，专业能力用 Skills"
```

### 6.3 agent-browser 登录态持久化方案

```yaml
# 实用技术：登录态保持
browser_login_persistence:
  method: "--profile 参数存储浏览器状态"
  command: "agent-browser --profile ./browser-state"
  use_case: "需要登录的网站（通达信/企查查/天眼查）"
  v3 采纳: "Collector 角色的 Playwright 技能使用 profile 持久化登录态"
```

---

## 七、实施路径

### Phase 1（Week 1-2）：基础规则引擎
```
1. 实现 trust_filter（A/B/C/D 分级过滤）
2. 实现 skill_selection_rules（任务类型 → 角色 → 技能自动映射）
3. 实现 cost_optimization（预算约束 + 自动降级）
4. 在 Obsidian 中创建 _元数据/Skills注册表.md
```

### Phase 2（Week 3-4）：自动组合引擎
```
1. 实现 SkillRouter（角色 × 任务类型 → 最优组合）
2. 实现 McpRouter（MCP 路由 + 成本约束）
3. 实现 new_skill_introduction（新技能引入流程）
4. 在 v3 Web UI 中添加 Agent 配置中心
```

### Phase 3（Week 5-6）：平台集成
```
1. 集成 Anthropic Skills 官方源（自动同步）
2. 集成 Smithery MCP 注册表
3. 集成 Skills.sh 安装器
4. 实现 SKILL VETTING REPORT 自动化
```

---

> **v3 Skills/MCP 自动选取规则 = 7 角色 × 5 规则 × 4 用户角色 × 4 触发层 = 完整覆盖**
>
> **核心原则**：A 级直接用，B 级 Vetting 后用，C 级测试用，D 级禁止。
>
> **下一步**：Phase 1 实现 → 验证 → Phase 2 → Phase 3

---

## 八、新增平台评估（v1.1 补充）

### 8.1 新增平台总表

| # | 平台 | URL | 运营者 | 格式 | 规模 | 可信度 | 红旗 |
|---|------|-----|--------|------|------|--------|------|
| 16 | **Manus.im** | manus.im | Meta 收购 | Playbook（GUI 工作流模板） | 50+ Playbooks | **A** | 平台锁定，Agent 内部不透明 |
| 17 | **AgenticSkills.io** | agenticskills.io | 未知（独立开发者） | SKILL.md + MCP + Workflow | 181 技能 / 200 MCP / 21 工作流 | **B+** | 运营者匿名，但上游贡献者可信 |
| 18 | **VoltAgent/awesome-openclaw-skills** | GitHub | VoltAgent（开源社区） | SKILL.md 链接 | 5,199+ 技能 | **A** | 50.8K★，MIT，最大 OpenClaw 技能库 |
| 19 | **affaan-m/ECC** | GitHub | affaan-m | 多 harness 优化 | 224K★ | **A+** | 最大 agent harness 优化项目，2,232 commits |
| 20 | **coreyhaines31/marketingskills** | GitHub | Corey Haines（知名营销人） | SKILL.md | 40+ 营销技能 | **A** | 35.7K★，MIT，v2.5.1 活跃 |
| 21 | **Panniantong/Agent-Reach** | GitHub | Panniantong | 多平台互联网读取器 | 47.9K★ | **A** | 299 commits，支持 Twitter/Reddit/B站/小红书 |
| 22 | **joeseesun/qiaomu-design-advisor** | GitHub | joeseesun | 设计顾问 Skill | 247★ | **B+** | 双语，58 个设计系统引用，小而精 |
| 23 | **joeseesun/yt-search-download** | GitHub | joeseesun | YouTube 搜索下载 | 112★ | **B** | 需 API Key，5 commits，薄封装 |
| 24 | **joeseesun/defuddle-skill** | GitHub | joeseesun | 文章提取 | 106★ | **B** | 薄封装 kepano/defuddle |
| 25 | **NanoSkill.ai** | nanoskill.ai/tw | 台湾团队（@NanoSkill-AI） | SKILL.md 目录 | 48 营销技能 | **B** | 有隐私政策/条款/GitHub org，无知名背书 |

### 8.2 可信度更新（v1.0 → v1.1）

```
v1.1 全量分级（25 个平台）：

A 级（8 个）= 官方/大厂/成熟开源 → 生产直接用
  Anthropic Skills / Composio / Smithery / Skills.sh
  VoltAgent/awesome-openclaw-skills / affaan-m/ECC
  coreyhaines31/marketingskills / Agent-Reach

B 级（8 个）= 可验证运营者 → Vetting 后上生产
  AITmpl / ClawHub / Skill-CN / Manus.im / AgenticSkills.io
  joeseesun/qiaomu-design-advisor / NanoSkill.ai
  微信文章×3（SkillHub评测/骁哥AI/机器之心）

C 级（3 个）= 运营者不透明或小规模 → 仅测试环境
  SkillsMP / AgentSkillsHub / SkillCast

D 级（2 个）= 无法验证 → 禁止安装
  Qoder Community / SkillHub.cn
```

### 8.3 Manus Playbook vs SKILL.md vs MCP（关键认知）

```yaml
# 三种工作流范式对比
workflow_paradigms:
  playbook:  # Manus.im
    nature: "GUI 驱动的自主 Agent 工作流模板"
    execution: "云端 Agent 自主执行"
    user_interaction: "填空式表单 → 一键启动"
    output: "成品（PDF/视频/表格/仪表盘）"
    composability: "低（每个 Playbook 独立）"
    portability: "平台锁定（manus.im）"
    transparency: "不透明（看不到推理过程）"
    适用: "非技术用户，需要成品交付"
    
  skill_md:  # Anthropic/Claude/Codex
    nature: "本地 Markdown 指令文件"
    execution: "Agent 在会话中解释执行"
    user_interaction: "代码级，开发者面向"
    output: "指令/模式，Agent 按指令执行"
    composability: "高（Skills 可与其他 Skills/工具组合）"
    portability: "文件级，跨 Agent 可移植"
    transparency: "完全透明（Markdown 可读）"
    适用: "开发者，需要精确控制"
    
  mcp:  # Anthropic MCP 协议
    nature: "协议级工具服务器"
    execution: "Agent 通过 JSON-RPC 调用"
    user_interaction: "开发者配置服务器"
    output: "原始数据/函数结果"
    composability: "高（工具可自由链式调用）"
    portability: "协议标准，跨 Agent 可移植"
    transparency: "开放协议规范"
    适用: "工具集成，需要标准接口"
    
  # v3 选择：三者结合
  v3_strategy: "SKILL.md（指令）+ MCP（工具）+ Playbook 模式（非技术用户入口）"
```

---

## 九、工作流组合框架（核心新增）

### 9.1 工作流三层架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Layer 3：用户入口                          │
│  Chat（对话式）/ Dashboard（看板式）/ Alert（告警式）          │
│  对应 Manus Playbook 模式（非技术用户一键启动）                │
└────────────────────────┬────────────────────────────────────┘
                         │ 触发
┌────────────────────────▼────────────────────────────────────┐
│                    Layer 2：工作流编排                        │
│  WorkflowEngine = 角色 × 任务类型 × Skills × MCPs            │
│  对应 SKILL.md 模式（开发者精确定义）                          │
└────────────────────────┬────────────────────────────────────┘
                         │ 调用
┌────────────────────────▼────────────────────────────────────┐
│                    Layer 1：工具执行                          │
│  MCP Servers + API Adapters + Rule Engines                  │
│  对应 MCP 协议模式（标准工具接口）                             │
└─────────────────────────────────────────────────────────────┘
```

### 9.2 标准工作流定义格式

```yaml
# 工作流 = Skills + MCPs + Rules 的编排组合
workflow:
  id: "wf-intelligence-pipeline"
  name: "完整情报流水线"
  description: "从数据采集到决策建议的端到端流程"
  
  # 触发条件
  trigger:
    type: "scheduled" | "event" | "manual" | "chat"
    schedule: "daily 08:00 CST"  # scheduled 类型
    event: "price_change > 3%"   # event 类型
    
  # 参与角色（按顺序）
  stages:
    - role: "Collector"
      skills: ["fetch_world_bank", "fetch_comtrade_flow", "fetch_fred"]
      mcp: ["official-source-adapters-mcp"]
      output: "evidence_cards.jsonl"
      
    - role: "Cleaner"
      skills: ["schema_validator", "dedup_engine", "format_normalizer"]
      mcp: []
      output: "clean_evidence.jsonl"
      
    - role: "Weigher"
      skills: ["source_scorer", "confidence_calculator", "cross_validation"]
      mcp: ["evidence-ledger-mcp"]
      output: "weighed_evidence.jsonl"
      
    - role: "Reasoner"
      skills: ["causal_dag", "scenario_predict", "evidence_lookup"]
      mcp: ["ark-memory-search-vector-mcp", "evidence-ledger-mcp"]
      model: "claude-opus-4-8"  # 复杂推理用强模型
      output: "analysis_report.jsonl"
      
    - role: "Devil"
      skills: ["counter_evidence_search", "logical_fallacy_detector"]
      mcp: ["weighted-websearch-mcp"]
      model: "deepseek-v4-pro"  # 必须异源
      output: "counter_evidence.jsonl"
      
    - role: "Predictor"
      skills: ["trend_forecast", "risk_assessor"]
      mcp: ["ark-memory-search-vector-mcp"]
      model: "claude-sonnet-4-6"
      output: "prediction.jsonl"
      
    - role: "Writer"
      skills: ["obsidian_writer", "report_formatter", "summary_generator"]
      mcp: []
      output: "recommendation.md"
      
  # 成本约束
  budget:
    max_per_run: "¥5"
    max_monthly: "¥150"
    degradation: "switch_to_flash_on_budget_80pct"
```

### 9.3 10 个标准工作流模板

```yaml
workflows:
  # ═══ 工作流 1：每日情报简报 ═══
  daily_briefing:
    id: "wf-daily-briefing"
    trigger: "scheduled daily 08:00"
    stages: [Collector → Cleaner → Weigher → Writer]
    skills: ["fetch_*", "schema_validator", "source_scorer", "obsidian_writer"]
    mcp: ["official-source-adapters-mcp", "evidence-ledger-mcp"]
    output: "D:\\obesidian\\知识库\\主动情报\\_每日简报\\{date}.md"
    cost: "~¥0.5/次"
    roles_involved: ["Collector", "Cleaner", "Weigher", "Writer"]

  # ═══ 工作流 2：价格异动分析 ═══
  price_alert_analysis:
    id: "wf-price-alert"
    trigger: "event price_change > 3%"
    stages: [Collector → Reasoner → Devil → Writer]
    skills: ["fetch_world_bank", "causal_dag", "counter_evidence_search", "obsidian_writer"]
    mcp: ["official-source-adapters-mcp", "ark-memory-search-vector-mcp", "weighted-websearch-mcp"]
    output: "D:\\obesidian\\知识库\\主动情报\\_价格异动\\{commodity}-{date}.md"
    cost: "~¥2/次"
    roles_involved: ["Collector", "Reasoner", "Devil", "Writer"]

  # ═══ 工作流 3：客户健康度评估 ═══
  client_health_assessment:
    id: "wf-client-health"
    trigger: "manual or chat"
    stages: [Collector → Reasoner → Predictor → Writer]
    skills: ["fetch_comtrade_flow", "causal_dag", "trend_forecast", "obsidian_writer"]
    mcp: ["official-source-adapters-mcp", "ark-memory-search-vector-mcp"]
    output: "D:\\obesidian\\知识库\\主动情报\\_客户画像\\{client}.md"
    cost: "~¥3/次"
    roles_involved: ["Collector", "Reasoner", "Predictor", "Writer"]

  # ═══ 工作流 4：竞品情报监控 ═══
  competitor_intelligence:
    id: "wf-competitor-intel"
    trigger: "scheduled weekly Monday 09:00"
    stages: [Collector → Cleaner → Weigher → Reasoner → Writer]
    skills: ["fetch_*", "schema_validator", "source_scorer", "causal_dag", "obsidian_writer"]
    mcp: ["official-source-adapters-mcp", "evidence-ledger-mcp", "weighted-websearch-mcp"]
    output: "D:\\obesidian\\知识库\\主动情报\\_竞品监控\\week-{week}.md"
    cost: "~¥4/次"
    roles_involved: ["Collector", "Cleaner", "Weigher", "Reasoner", "Writer"]

  # ═══ 工作流 5：关税/政策影响分析 ═══
  tariff_impact_analysis:
    id: "wf-tariff-impact"
    trigger: "event tariff_announcement"
    stages: [Collector → Reasoner → Devil → Predictor → Writer]
    skills: ["fetch_*", "causal_dag", "counter_evidence_search", "risk_assessor", "obsidian_writer"]
    mcp: ["official-source-adapters-mcp", "weighted-websearch-mcp", "ark-memory-search-vector-mcp"]
    output: "D:\\obesidian\\知识库\\主动情报\\_政策影响\\{policy}-{date}.md"
    cost: "~¥5/次"
    roles_involved: ["Collector", "Reasoner", "Devil", "Predictor", "Writer"]

  # ═══ 工作流 6：供应链中断预警 ═══
  supply_chain_disruption:
    id: "wf-supply-disruption"
    trigger: "event port_congestion OR logistics_delay"
    stages: [Collector → Reasoner → Writer]
    skills: ["fetch_*", "causal_dag", "obsidian_writer"]
    mcp: ["official-source-adapters-mcp", "ark-memory-search-vector-mcp"]
    output: "D:\\obesidian\\知识库\\主动情报\\_供应链\\{event}-{date}.md"
    cost: "~¥2/次"
    roles_involved: ["Collector", "Reasoner", "Writer"]

  # ═══ 工作流 7：汇率风险评估 ═══
  forex_risk_assessment:
    id: "wf-forex-risk"
    trigger: "event jpy_usd_change > 1.5%"
    stages: [Collector → Reasoner → Predictor → Writer]
    skills: ["fetch_fred", "causal_dag", "trend_forecast", "obsidian_writer"]
    mcp: ["official-source-adapters-mcp", "ark-memory-search-vector-mcp"]
    output: "D:\\obesidian\\知识库\\主动情报\\_汇率风险\\{pair}-{date}.md"
    cost: "~¥2/次"
    roles_involved: ["Collector", "Reasoner", "Predictor", "Writer"]

  # ═══ 工作流 8：老板对话式探索 ═══
  owner_chat_exploration:
    id: "wf-owner-chat"
    trigger: "chat owner asks question"
    stages: [Reasoner → optional Devil]
    skills: ["causal_dag", "scenario_predict", "evidence_lookup"]
    mcp: ["ark-memory-search-vector-mcp", "evidence-ledger-mcp"]
    model: "claude-opus-4-8"
    output: "chat response + optional obsidian write"
    cost: "~¥1/次"
    roles_involved: ["Reasoner", "Devil（可选）"]
    interaction: "对话式，老板提问 → v3 反问确认 → 拉数据 → 推理 → 答"

  # ═══ 工作流 9：月度综合报告 ═══
  monthly_comprehensive_report:
    id: "wf-monthly-report"
    trigger: "scheduled monthly 1st 09:00"
    stages: [Collector → Cleaner → Weigher → Reasoner → Devil → Predictor → Writer]
    skills: ["fetch_*", "schema_validator", "source_scorer", "causal_dag", "counter_evidence_search", "risk_assessor", "obsidian_writer"]
    mcp: ["official-source-adapters-mcp", "evidence-ledger-mcp", "ark-memory-search-vector-mcp", "weighted-websearch-mcp"]
    model: "claude-opus-4-8"
    output: "D:\\obesidian\\知识库\\主动情报\\_月度报告\\{month}.md"
    cost: "~¥10/次（全角色参与）"
    roles_involved: ["All 7 roles"]

  # ═══ 工作流 10：新数据源接入 ═══
  new_source_onboarding:
    id: "wf-new-source"
    trigger: "manual owner request"
    stages: [Collector → Cleaner → Weigher → Writer]
    skills: ["fetch_*", "schema_validator", "source_scorer", "obsidian_writer"]
    mcp: ["official-source-adapters-mcp", "evidence-ledger-mcp"]
    output: "D:\\obesidian\\知识库\\_元数据\\数据源\\{source}.md"
    cost: "~¥1/次"
    roles_involved: ["Collector", "Cleaner", "Weigher", "Writer"]
    special: "需 owner 审批后才能加入 production"
```

### 9.4 工作流组合矩阵（角色 × 工作流）

```yaml
# 角色在各工作流中的参与度
role_workflow_matrix:
  Collector:
    daily_briefing: "★★★"        # 核心
    price_alert: "★★★"
    client_health: "★★★"
    competitor_intel: "★★★"
    tariff_impact: "★★★"
    supply_disruption: "★★★"
    forex_risk: "★★★"
    owner_chat: "☆"              # 极少（只在需要拉数据时）
    monthly_report: "★★★"
    new_source: "★★★"
    
  Cleaner:
    daily_briefing: "★★"
    price_alert: "☆"
    client_health: "☆"
    competitor_intel: "★★"
    tariff_impact: "☆"
    supply_disruption: "☆"
    forex_risk: "☆"
    owner_chat: "☆"
    monthly_report: "★★"
    new_source: "★★"
    
  Weigher:
    daily_briefing: "★★"
    price_alert: "☆"
    client_health: "☆"
    competitor_intel: "★★"
    tariff_impact: "☆"
    supply_disruption: "☆"
    forex_risk: "☆"
    owner_chat: "☆"
    monthly_report: "★★"
    new_source: "★★"
    
  Reasoner:
    daily_briefing: "☆"
    price_alert: "★★★"
    client_health: "★★★"
    competitor_intel: "★★"
    tariff_impact: "★★★"
    supply_disruption: "★★★"
    forex_risk: "★★★"
    owner_chat: "★★★"
    monthly_report: "★★★"
    new_source: "☆"
    
  Devil:
    daily_briefing: "☆"
    price_alert: "★★"
    client_health: "☆"
    competitor_intel: "☆"
    tariff_impact: "★★"
    supply_disruption: "☆"
    forex_risk: "☆"
    owner_chat: "★"              # 老板说"你确定？"时
    monthly_report: "★★"
    new_source: "☆"
    
  Predictor:
    daily_briefing: "☆"
    price_alert: "☆"
    client_health: "★★"
    competitor_intel: "☆"
    tariff_impact: "★★"
    supply_disruption: "☆"
    forex_risk: "★★"
    owner_chat: "★"
    monthly_report: "★★"
    new_source: "☆"
    
  Writer:
    daily_briefing: "★★★"
    price_alert: "★★"
    client_health: "★★"
    competitor_intel: "★★"
    tariff_impact: "★★"
    supply_disruption: "★★"
    forex_risk: "★★"
    owner_chat: "★"              # 写入 Obsidian
    monthly_report: "★★★"
    new_source: "★★"
```

### 9.5 工作流调度器（WorkflowScheduler）

```yaml
# 工作流调度配置
workflow_scheduler:
  # 调度方式
  modes:
    scheduled: "APScheduler cron 表达式"
    event_driven: "探针检测到变化 → 触发"
    manual: "用户在 Chat/Dashboard 点击启动"
    chat: "对话中自然语言触发"
    
  # 并发控制
  concurrency:
    max_parallel_workflows: 3
    max_parallel_mcp_calls: 4
    queue_strategy: "priority"  # high > medium > low
    
  # 优先级规则
  priority_rules:
    - workflow: "supply_chain_disruption"
      priority: "high"
      reason: "供应链中断影响交期"
    - workflow: "tariff_impact_analysis"
      priority: "high"
      reason: "政策变动影响成本"
    - workflow: "price_alert_analysis"
      priority: "medium"
      reason: "价格波动需要关注"
    - workflow: "daily_briefing"
      priority: "low"
      reason: "每日例行，可排队"
    - workflow: "monthly_comprehensive_report"
      priority: "low"
      reason: "月度报告，可延迟"
      
  # 失败重试
  retry_policy:
    max_retries: 3
    backoff: "exponential"
    fallback_model: "deepseek-v4-flash"
    
  # 成本熔断
  circuit_breaker:
    daily_limit: "¥20"
    monthly_limit: "¥300"
    action_on_breach: "pause_all_workflows + notify_owner"
```

---

## 十、平台 × 工作流适配矩阵

```yaml
# 不同平台适合支撑哪些工作流
platform_workflow_fit:
  # A 级平台 = 生产工作流
  anthropic_skills:
    fit_workflows: ["all"]
    reason: "官方规范，最高可信度"
    
  composio:
    fit_workflows: ["daily_briefing", "competitor_intel", "monthly_report"]
    reason: "1000+ 社区技能，覆盖面广"
    
  smithery:
    fit_workflows: ["price_alert", "forex_risk", "tariff_impact"]
    reason: "18K MCP 服务器，数据源丰富"
    
  skills_sh:
    fit_workflows: ["all"]
    reason: "通用安装器，855K 安装量"
    
  voltabent_openclaw_skills:
    fit_workflows: ["daily_briefing", "competitor_intel", "new_source"]
    reason: "5199+ OpenClaw 技能，覆盖面最广"
    
  ecc:
    fit_workflows: ["all"]
    reason: "224K★，多 harness 优化，兼容性最好"
    
  marketingskills:
    fit_workflows: ["competitor_intel", "client_health"]
    reason: "40+ 营销技能，竞品分析专用"
    
  agent_reach:
    fit_workflows: ["competitor_intel", "client_health", "daily_briefing"]
    reason: "多平台读取（Twitter/Reddit/B站/小红书）"

  # B 级平台 = 特定场景
  manus_im:
    fit_workflows: ["owner_chat_exploration", "monthly_report"]
    reason: "Playbook 模式适合非技术用户，成品交付"
    constraint: "平台锁定，不透明"
    
  agentic_skills_io:
    fit_workflows: ["all"]
    reason: "181 技能 + 200 MCP + 21 工作流包，最完整的目录"
    constraint: "运营者匿名"
    
  nanoskill:
    fit_workflows: ["competitor_intel", "client_health"]
    reason: "48 营销技能，台湾市场视角"
    
  skill_cn:
    fit_workflows: ["new_source", "daily_briefing"]
    reason: "中文技能导航，63 技能 + 268 教程"
```

---

## 十一、MCP 安全审计（AgenticSkills 1,862 发现综述）

> **来源**：AgenticSkills.io — "Why 73% of Public MCP Servers Fail Basic Security Checks"
> **数据**：综合 8 独立审计，覆盖 23,000+ 公共 MCP 服务器
> **日期**：2026-05-11

### 11.1 核心数据

| 发现 | 来源 | 样本量 | 日期 |
|------|------|--------|------|
| 119/119 公网 MCP 服务器无认证即可枚举工具 | Knostic | 1,862 发现/119 探测 | 2025-07 |
| 43% 含命令注入漏洞 | Equixly | 未公开 N | 2025-03 |
| 30% 含 SSRF 漏洞 | Equixly | 未公开 N | 2025-03 |
| 22% 含路径遍历/任意文件读取 | Equixly | 未公开 N | 2025-03 |
| 53% 依赖长期静态密钥（API Key/PAT） | Astrix Security | 5,200+ 仓库 | 2025-10 |
| 仅 8.5% 使用 OAuth | Astrix Security | 5,200+ 仓库 | 2025-10 |
| 82% 使用易受 CWE-22 攻击的文件系统 API | Endor Labs | 2,614 实现 | 2026-01 |
| 67% 使用易受 CWE-94 攻击的 API | Endor Labs | 2,614 实现 | 2026-01 |
| 首个恶意 MCP 服务器在野发现 | Koi Security/Snyk | postmark-mcp | 2025-09 |
| Anthropic 官方 SDK 架构性 RCE（14 CVE） | OX Security | 7,000+ 服务器/150M+ 下载 | 2026-04 |

**73% 综合失败率** = 至少一项 Tier-1 检查失败的加权估算

### 11.2 13 类攻击向量

| # | 攻击类型 | 描述 | v3 影响 |
|---|---------|------|---------|
| 1 | **Tool Poisoning（Line Jumping）** | MCP 服务器返回的工具描述中藏有隐藏指令，模型在调用前就执行 | HIGH — v3 的 MCP 调用链可能被注入 |
| 2 | **Full-Schema Poisoning** | 攻击面扩展到整个工具 schema（参数名/类型/默认值/枚举） | HIGH — schema 每轮消耗 token |
| 3 | **间接 Prompt 注入** | 通过工具返回值注入指令（"致命三角"：私有数据+不可信内容+外部通信） | CRITICAL — v3 Collector+Writer 组合 |
| 4 | **MCP Rug Pull** | 服务器连接后静默更换工具描述 | MEDIUM — v3 有版本锁定机制 |
| 5 | **跨服务器工具遮蔽** | 被攻陷的服务器发布指令劫持其他服务器的合法工具 | HIGH — v3 同时连接 4 个 MCP |
| 6 | **Token 传递（Confused Deputy）** | 服务器将用户 token 转发给上游 API 而不验证 audience | MEDIUM |
| 7 | **凭证窃取** | 长期 API Key 明文存储在本地文件系统 | HIGH — v3 使用环境变量 |
| 8 | **供应链攻击** | 恶意包/依赖混淆（postmark-mcp 事件） | HIGH |
| 9 | **命令注入** | 工具实现中 shell=True/exec/eval | CRITICAL — 43% 的流行服务器 |
| 10 | **路径遍历** | 文件系统服务器的 CWE-22 漏洞 | HIGH — 82% 的服务器 |
| 11 | **SSRF/NeighborJack** | 服务器绑定 0.0.0.0 暴露给局域网 | LOW — v3 用 stdio 传输 |
| 12 | **Shadow MCP** | 开发者通过 npx 安装，安全团队无感知 | MEDIUM |
| 13 | **Resource 注入** | 通过 MCP Resources 原语注入指令 | MEDIUM |

### 11.3 "致命三角"（Lethal Trifecta）

```
Simon Willison 2025-06-16 定义：

  ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
  │  ① 私有数据访问  │────▶│  ② 不可信内容暴露 │────▶│  ③ 外部通信能力  │
  │  (读取私有仓库)  │     │  (公共数据源)     │     │  (发送邮件/API)  │
  └─────────────────┘     └─────────────────┘     └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 ▼
                    🔴 数据外泄（每个单独服务器正常，
                       漏洞在三者组合中）

v3 风险评估：
  Collector 读取私有数据 ✅ + 公共数据源 ✅ + Writer 写入 Obsidian ✅
  = 致命三角在 v3 流水线中天然存在
  → 必须在 Collector→Writer 之间加 mcp-context-protector 隔离
```

### 11.4 12 分钟 MCP 审计流程

```yaml
# 安装任何 MCP 服务器前必须跑的 12 步审计
mcp_audit_drill:
  step_1: "找源码——拒绝任何无可验证 git 仓库的安装"
  step_2: "查维护者——新 npm 账户 + 少量包 + 低活跃 = 视为恶意"
  step_3: "读 SECURITY.md——无文件 = 降级信任评分"
  step_4: "Diff 近期发布——npm diff <pkg>@<old>..<new>"
  step_5: "跑 mcp-scan——npx @invariantlabs/mcp-scan 检测投毒描述"
  step_6: "用 mcp-context-protector 包裹——Trail of Bits 工具，固定工具描述"
  step_7: "Docker 沙箱运行——--security-opt=no-new-privileges，无宿主网络"
  step_8: "检查 OAuth 握手——curl /.well-known/oauth-protected-resource"
  step_9: "审计 token 存储——grep -rn 'writeFile|fs.writeSync' ."
  step_10: "检查原始 JSON 工具描述——隐藏 Unicode/<IMPORTANT> 标签"
  step_11: "对照 vulnerablemcp.info 攻击模式测试"
  step_12: "设 kill switch——工具调用频率 >1.5/s 持续 10s → 自动熔断"
```

### 11.5 AgenticSkills 审计框架 v1（7 类 32 项）

```yaml
# 评估任何 MCP 服务器的 32 项检查
audit_framework:
  # A 类：身份认证（7 项）
  A_identity:
    A1: "实现 OAuth 2.1（MCP 规范 2025-11-25）"
    A2: "支持 PKCE（S256）"
    A3: "使用 Resource Indicators（RFC 8707）"
    A4: "Token 有效期 ≤1 小时"
    A5: "不向上传 API 传递用户 token"
    A6: "拒绝 0.0.0.0 绑定请求"
    A7: "非 stdio 传输使用 TLS"

  # B 类：授权与范围（3 项）
  B_authorization:
    B1: "文档中以纯英文说明每个请求的 scope"
    B2: "支持 per-tool scope（非全服务器权限）"
    B3: "实现最小权限默认值"

  # C 类：输入验证与输出净化（5 项）
  C_input_validation:
    C1: "无 shell 拼接（shell=True/exec/eval）"
    C2: "文件参数有路径遍历防护"
    C3: "HTTP/fetch 服务器有 URL 白名单"
    C4: "工具返回值剥离 ANSI/控制字符"
    C5: "每个工具输入做 schema 验证"

  # D 类：供应链（5 项）
  D_supply_chain:
    D1: "签名发布（sigstore/npm provenance）"
    D2: "依赖版本锁定（lockfile 提交）"
    D3: "发布 SBOM"
    D4: "配置 Dependabot/Renovate 冷却期"
    D5: "无 postinstall 脚本获取远程代码"

  # E 类：运维安全（4 项）
  E_ops:
    E1: "容器内运行无 new-privileges"
    E2: "不记录 secrets/PII"
    E3: "沙箱友好（无宿主网络需求）"
    E4: "密钥从环境变量读取，不嵌入代码"

  # F 类：透明度（4 项）
  F_transparency:
    F1: "有 SECURITY.md + 联系方式 + SLA"
    F2: "工具描述列举访问的数据"
    F3: "语义版本 + 签名发布"
    F4: "每个发布发布工具描述 SHA-256"

  # G 类：维护信号（4 项）
  G_maintenance:
    G1: "90 天内有 commit"
    G2: "≥2 活跃贡献者（过去 1 年）"
    G3: "Issue 中位响应时间 ≤30 天"
    G4: "CI 流水线运行且通过"
```

### 11.6 v3 MCP 安全加固规则（从审计报告提炼）

```yaml
# v3 必须实施的 MCP 安全规则
v3_mcp_security:
  # 规则 1：所有 MCP 服务器必须通过 12 分钟审计
  rule_1_audit:
    description: "安装前必须跑完整审计流程"
    enforced: true
    tool: "mcp-scan + manual review"

  # 规则 2：致命三角隔离
  rule_2_lethal_trifecta:
    description: "不允许同时连接公共数据源+私有数据访问+外部通信"
    enforcement: "在 WorkflowEngine 中检查，违反则阻断"
    v3_specific: "Collector 读私有数据时，禁止同时连接公共数据源的 MCP"

  # 规则 3：mcp-context-protector 包裹
  rule_3_protector:
    description: "所有社区 MCP 必须用 Trail of Bits 的 mcp-context-protector 包裹"
    enforced: true
    purpose: "固定工具描述，防止 rug pull 和 tool poisoning"

  # 规则 4：Docker 沙箱
  rule_4_sandbox:
    description: "所有 MCP 服务器在 Docker 沙箱中运行"
    options: "--security-opt=no-new-privileges --read-only --no-host-network"
    enforced: true

  # 规则 5：Token 管理
  rule_5_tokens:
    description: "使用 scoped token，不使用长期静态密钥"
    enforcement: "GitHub fine-grained PAT / OAuth 2.1 + PKCE"
    v3_specific: "FRED/Comtrade/World Bank 使用环境变量，不硬编码"

  # 规则 6：工具调用频率监控
  rule_6_rate_monitor:
    description: "工具调用频率 >1.5/s 持续 10s → 自动熔断"
    implementation: "Prometheus alert rule"
    purpose: "检测数据外泄行为"

  # 规则 7：Schema 最小化
  rule_7_schema_min:
    description: "工具描述 ≤280 tokens（中位数），禁止 >1400 tokens"
    purpose: "减少 FSP 攻击面 + 降低 token 成本"
    tool: "mcp-scan --schema-budget"

  # 规则 8：版本锁定
  rule_8_version_pin:
    description: "MCP 服务器版本锁定，不自动更新"
    enforcement: "lockfile + Dependabot PR 需人工审批"
    purpose: "防止 rug pull"
```

---

## 十二、实施路径（更新版）

### Phase 0（Week 0）：MCP 安全加固（前置）
```
1. 安装 mcp-scan（Invariant Labs）+ mcp-context-protector（Trail of Bits）
2. 对所有已安装 MCP 服务器跑 12 分钟审计
3. 配置 Docker 沙箱（--security-opt=no-new-privileges）
4. 实现致命三角隔离规则（Collector 读私有数据时禁止同时连接公共 MCP）
5. 配置工具调用频率监控（Prometheus alert >1.5/s → 熔断）
6. 审计所有 token 存储（环境变量 vs 明文文件）
```

### Phase 1（Week 1-2）：基础规则引擎
```
1. 实现 trust_filter（A/B/C/D 分级过滤，25 个平台）
2. 实现 skill_selection_rules（任务类型 → 角色 → 技能自动映射）
3. 实现 cost_optimization（预算约束 + 自动降级）
4. 在 Obsidian 中创建 _元数据/Skills注册表.md
```

### Phase 2（Week 3-4）：工作流编排引擎
```
1. 实现 WorkflowEngine（10 个标准工作流模板）
2. 实现 WorkflowScheduler（APScheduler + 事件驱动）
3. 实现 SkillRouter + McpRouter（角色 × 任务 → 最优组合）
4. 实现 WorkflowComposer（Skills + MCPs + Rules 编排）
```

### Phase 3（Week 5-6）：平台集成 + 工作流上线
```
1. 集成 A 级平台（Anthropic Skills / Composio / Smithery / Skills.sh）
2. 集成 Agent-Reach（多平台互联网读取）
3. 集成 ECC（多 harness 优化）
4. 上线 daily_briefing + price_alert 两个核心工作流
```

### Phase 4（Week 7-8）：扩展 + 优化
```
1. 集成 Manus Playbook 模式（非技术用户入口）
2. 集成 AgenticSkills.io 工作流包
3. 上线剩余 8 个标准工作流
4. 实现 SKILL VETTING REPORT 自动化（TRACE 五维度）
```

---

> **v3 完整架构 = 25 平台 × 7 角色 × 10 工作流 × 4 触发层 × 32 项安全审计 = 全覆盖**
>
> **三种范式统一**：SKILL.md（指令）+ MCP（工具）+ Playbook（入口）
>
> **可信度铁律**：A 级直接用 → B 级 Vetting 后用 → C 级测试用 → D 级禁止
>
> **安全铁律**：73% 公共 MCP 服务器有安全问题 → 必须跑 12 分钟审计 → 必须用 mcp-context-protector → 必须 Docker 沙箱 → 致命三角必须隔离
