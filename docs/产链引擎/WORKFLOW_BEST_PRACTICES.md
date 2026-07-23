# 工作流配置最佳实践

基于对国内外主流 Agent 平台（Anthropic MCP、OpenAI Agents SDK、火山引擎 AgentKit、阿里悟空、腾讯 WorkBuddy/Marvis、阿里云骡子快跑、Code Buddy）的深度调研，整理出以下工作流配置与 Skill 架构的最佳实践。

---

## 一、核心设计原则

### 1.1 模块化与解耦
- **Skill = 能力单元**：将知识 + 执行流程 + 代码脚本打包为独立的 Skill，Agent 按需加载
- **工具原子化**：每个工具只做一件事（如 `fetch_price`、`calculate_transmission`），避免大杂烩
- **工作流可组合**：通过标准接口串联多个 Skill/Agent，支持并行、串行、条件分支

### 1.2 标准化协议
- **MCP 优先**：所有外部系统接入统一通过 MCP 协议（或 HTTP-to-MCP 零代码转换）
- **SKILL.md 规范**：采用统一的元数据格式（name/description/triggers/preconditions/steps），便于跨平台复用
- **输入输出契约**：明确定义每个节点的 JSON Schema，确保类型安全

### 1.3 安全与隔离
- **沙箱机制**：代码执行必须在隔离环境中进行（如 Docker、WebAssembly、云端虚拟机）
- **权限最小化**：Agent 只能访问其任务所需的资源，禁止全局读写
- **Guardrail 三层防护**：输入校验 → 工具调用白名单 → 输出审查

---

## 二、工作流编排模式

### 2.1 五种经典模式（来自 Anthropic "Building Effective Agents"）

| 模式 | 适用场景 | 产链引擎映射 |
|------|---------|-------------|
| **Parallel (Map-Reduce)** | 并行采集多数据源后汇总 | Collector 同时拉取棉花价格、汇率、CPI |
| **Orchestrator-Workers** | 协调多个专业 Agent 完成复杂任务 | Reasoner 调度 Cleaner、Weigher、Predictor |
| **Evaluator-Optimizer** | 反复验证与优化结果 | Devil's Advocate 挑战 Reasoner 的结论 |
| **Router** | 根据用户角色/意图路由到不同工作流 | 老板看简报 / 采购看价格 / 生产看排期 |
| **Swarm** | 多 Agent 自主协作解决开放性问题 | 未来扩展：市场预测 Agent 群 |

### 2.2 编排原语（OpenAI Agents SDK 参考）

- **Agent**：具有独立 System Prompt 和工具集的实体
- **Handoff**：将控制权从一个 Agent 转移给另一个（适合流水线式工作流）
- **Tool Call**：调用工具并返回结果（适合数据采集类任务）
- **Guardrail**：在输入/输出/工具调用层设置安全检查点
- **Tracing**：记录每次调用的输入、输出、耗时，用于调试与优化

### 2.3 持久化执行（mcp-agent + Temporal）

- **长时运行工作流**：对于需要等待外部事件（如每周数据更新）的任务，使用 Temporal 等持久化引擎
- **状态恢复**：即使服务重启，也能从上次中断处继续执行
- **重试策略**：自动重试失败的节点，支持指数退避

---

## 三、Skill 定义规范

### 3.1 SKILL.md 标准结构

```markdown
---
name: <skill-name>
description: <one-line description>
version: <semver>
author: <author>
triggers:
  - <keyword1>
  - <keyword2>
preconditions:
  - <required input or state>
steps:
  - <step1>
  - <step2>
references:
  - <link to external docs>
---

# <Skill Name>

## Overview
<brief description>

## When to Use
<trigger conditions>

## How to Use
<step-by-step instructions>

## Examples
<usage examples>
```

### 3.2 关键要素说明

- **triggers**：关键词列表，用于意图识别时的匹配
- **preconditions**：执行前必须满足的条件（如文件存在、API Key 已配置）
- **steps**：详细的执行步骤，包含工具调用顺序和参数
- **references**：外部文档链接，避免在 SKILL.md 中重复长篇内容

### 3.3 示例：产链引擎的 `fetch_cotton_price` Skill

```markdown
---
name: fetch_cotton_price
description: 从中国棉花信息网获取最新棉花价格指数
version: 1.0.0
triggers:
  - 棉花价格
  - cotton price
  - 原料成本
preconditions:
  - 网络连接正常
  - national-stats-mcp 已安装
steps:
  - 调用 mcp_runtime(action=call_tool, server_id=national-stats-mcp, tool_name=get_commodity_price, arguments={commodity:"cotton", date:"latest"})
  - 解析返回的 JSON，提取 price 字段
  - 返回 {price: <number>, unit: "元/吨", source: "中国棉花信息网"}
---

# Fetch Cotton Price

## Overview
获取最新的国内棉花价格指数，用于成本传导分析。

## When to Use
当用户询问棉花价格、原料成本变化，或工作流需要棉花价格作为输入时。

## How to Use
直接调用本 Skill，无需额外参数。

## Examples
输入：无
输出：{"price": 15800, "unit": "元/吨", "source": "中国棉花信息网", "date": "2026-07-02"}
```

---

## 四、安全与合规

### 4.1 API Key 管理

- **环境变量存储**：所有敏感信息（API Key、数据库密码）存储在 `.env.local`，不得出现在代码或文档中
- **运行时注入**：通过进程环境变量传递给 Agent，不在代码中硬编码
- **轮换机制**：定期更换 Key，旧 Key 立即失效

### 4.2 数据质量管控

- **等级标注**：每个数据源标注可信度等级（A+ / A / B / C）
- **交叉验证**：等级 < A 的数据必须有至少一个 A 级源交叉验证
- **来源追溯**：每条数据保留原始 URL 和时间戳，便于审计

### 4.3 执行沙箱

- **代码隔离**：用户提供的脚本在独立容器中执行，无法访问宿主机文件系统
- **网络限制**：仅允许访问白名单域名，防止数据外泄
- **资源配额**：限制 CPU、内存、执行时间，防止恶意消耗

---

## 五、监控与自进化

### 5.1 全链路追踪

- **Tracing**：记录每次 Agent 调用的输入、输出、耗时、Token 消耗
- **日志聚合**：将所有日志集中到统一平台（如 ELK、Loki），支持关键词搜索
- **告警规则**：当错误率 > 5% 或响应时间 > 10s 时触发告警

### 5.2 自进化机制（产链引擎 v3 实现）

- **因果边参数学习**：工作流完成后，对比预测值与实际值，自动更新传导率
  - 公式：`newRate = oldRate * 0.7 + (actualChange / predictedChange) * 0.3`
  - 限制区间：[0.1, 1.0]
- **历史记录**：每次参数变化存入 `causal_edge_history` 表，前端可视化展示
- **人工校准**：提供 UI 让用户手动调整参数，覆盖自动学习结果

### 5.3 评估体系（火山引擎 AgentKit 参考）

- **离线评估**：使用历史数据回放工作流，计算准确率、召回率、F1
- **在线评估**：收集用户反馈（点赞/点踩/修改），实时调整模型权重
- **50+ 官方评估器**：涵盖事实准确性、逻辑一致性、安全性、多样性等维度

---

## 六、国内平台适配要点

### 6.1 阿里悟空 (Wukong)

- **钉钉集成**：通过 MCP 协议直接操作钉钉原子能力（发消息、建群、查日程）
- **OPT 方案**：预编排行业工作流 + 场景化 Skill 套件，快速落地
- **Skill 市场**：兼容开源 Skill 体系，支持企业内部分享与复用

### 6.2 腾讯 WorkBuddy / Marvis

- **SKILL.md 注入**：通过标准格式的 SKILL.md 文件扩展领域知识
- **专家模式**：从对话自动创建"专家"（带工作流的 Agent 模板）
- **多 Agent 并行**：支持 File/Computer/App/Browser/Search Agent 协同工作

### 6.3 阿里云骡子快跑 (MuleRun)

- **云端沙箱**：提供独立云端虚拟机，7x24 持续运行
- **四层记忆**：短期记忆（对话上下文）、中期记忆（任务状态）、长期记忆（知识库）、永久记忆（配置文件）
- **自进化学习**：根据用户反馈自动优化工作流路径

### 6.4 火山引擎 AgentKit

- **HTTP-to-MCP**：零代码将存量 Swagger API 转换为 MCP 工具
- **Memory 双引擎**：Viking（十亿级毫秒召回）+ mem0（开源可控）
- **Serverless 托管**：无需运维，按调用量计费

---

## 七、实施建议

### 7.1 起步阶段（1-2 周）

1. **选择最小闭环**：从 1 个高频场景开始（如"每日棉花价格简报"）
2. **定义 3-5 个核心 Skill**：数据采集、清洗、分析、报告生成
3. **搭建基础框架**：React 前端 + Express 后端 + SQLite 数据库
4. **配置真实 API**：DeepSeek/OpenAI API Key，测试端到端执行

### 7.2 扩展阶段（1-2 月）

1. **增加工作流数量**：从 1 个扩展到 5-10 个（价格分析、需求预测、库存优化等）
2. **引入因果边校准**：实现自进化机制，自动学习传导参数
3. **接入更多数据源**：通过 MCP 协议集成国统局、海关、电商平台
4. **优化用户体验**：增加可视化图表、交互式筛选、导出功能

### 7.3 成熟阶段（3-6 月）

1. **构建 Skill 生态**：开放 Skill 市场，允许第三方开发者贡献
2. **多租户支持**：支持多个企业独立使用，数据隔离
3. **高级分析**：引入机器学习模型（时序预测、异常检测）
4. **移动端适配**：开发钉钉小程序或独立 App

---

## 八、常见陷阱与规避

| 陷阱 | 表现 | 规避方法 |
|------|------|---------|
| **过度工程化** | 一开始就设计复杂的微服务架构 | 从单体应用开始，逐步拆分 |
| **Mock 占位符** | Agent 逻辑用硬编码规则代替 | 尽早接入真实 LLM，哪怕只调 1 次 |
| **忽略安全** | API Key 写在代码中 | 使用环境变量 + `.gitignore` |
| **数据质量失控** | 引用低可信度数据导致结论偏差 | 强制交叉验证，标注来源等级 |
| **缺乏监控** | 工作流失败后无法定位问题 | 全链路 Tracing + 日志聚合 |
| **用户反馈缺失** | 不知道哪些工作流真正有用 | 内置点赞/点踩按钮，收集使用数据 |

---

## 九、参考资源

- **Anthropic**: [Building Effective Agents](https://www.anthropic.com/research/building-effective-agents)
- **OpenAI**: [Agents SDK Documentation](https://platform.openai.com/docs/guides/agents)
- **火山引擎**: [AgentKit 官方文档](https://www.volcengine.com/docs/82379)
- **MCP 协议**: [Model Context Protocol Spec](https://modelcontextprotocol.io/)
- **Temporal**: [Persistent Workflow Execution](https://temporal.io/)

---

*最后更新：2026-07-02*
*作者：夏亮Iris*
*版本：v1.0*
