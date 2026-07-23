# Agent 蜂群项目 - 产品需求文档

## Overview
- **Summary**: 分析和评估 "Launch Desk + v3 产链引擎" Agent 蜂群项目的当前状态、架构设计、功能完整性和技术债务，提供全面的项目分析报告和优化建议。
- **Purpose**: 为项目所有者提供清晰的项目全景视图，识别优势、风险和改进机会，支持决策制定和后续开发规划。
- **Target Users**: 项目所有者、技术负责人、开发团队

## Goals
- 全面分析 Agent 蜂群架构体系（三层模型、13 Agent、6 验证门）
- 评估治理体系（hooks、验证机制、协作规则）
- 分析技能系统（Skills）和上下文管理
- 评估 Runtime Orchestrator 和工作流执行
- 识别技术债务和优化机会
- 输出可操作的改进建议和实施路径

## Non-Goals（Out of Scope）
- 不修改现有代码实现
- 不执行实际部署或环境配置
- 不进行性能基准测试
- 不创建新的功能模块

## Background & Context
本项目包含两个核心部分：
1. **Launch Desk** - 基于 OpenAI Agents SDK 的发布规划 Agent，前端使用 Vite + React，后端使用 Express
2. **v3 产链引擎** - 可执行的因果世界模型，包含 9 环节产业链 DAG、25,000+ Skills、13 Agent 架构

项目采用模块化分层设计，包含：
- Intelligence Layer（23 数据源注册表）
- Runtime Layer（DAG 执行器、RunStore）
- Governance Layer（工具权限、风险评估）
- Model Router + Gateway（多模型路由）
- MCP Gateway Registry（工具注册）
- Skills Layer（渐进式加载、上下文预算）

## Functional Requirements
- **FR-1**: 分析 Agent 蜂群三层架构模型（Tier 1: 战略决策 Agent、Tier 2: 技术领导 Agent、Tier 3: 执行 Agent）
- **FR-2**: 评估治理体系，包括 hooks 机制、验证流程、协作规则和安全策略
- **FR-3**: 分析技能系统，包括 Skills 注册表、渐进式加载、上下文预算控制
- **FR-4**: 评估 Runtime Orchestrator、DAG 执行器、RunStore 和审批工作流
- **FR-5**: 分析 6 道数据真实性验证门（来源溯源、Schema 匹配、值域合理性、新鲜度、跨源一致性、历史正常性）
- **FR-6**: 评估 Model Router + Gateway 多模型路由和故障转移机制
- **FR-7**: 分析 MCP Gateway Registry 和 Transport 层设计
- **FR-8**: 评估测试覆盖和代码质量

## Non-Functional Requirements
- **NFR-1**: 分析报告应清晰、结构化，便于决策者理解
- **NFR-2**: 识别的问题应包含严重程度和影响范围评估
- **NFR-3**: 改进建议应具有可操作性和明确的优先级
- **NFR-4**: 评估应基于实际代码分析，而非主观判断

## Constraints
- **技术**: Node.js + TypeScript + React + Vite 技术栈
- **依赖**: OpenAI Agents SDK、Zod、Express、Lucide React 等
- **测试**: Vitest 测试框架
- **部署**: Vercel 部署准备就绪

## Assumptions
- 项目代码已完整存在于 `D:\Documents\New project 2` 目录
- 项目依赖已安装
- 测试套件可正常运行

## Acceptance Criteria

### AC-1: 架构分析完整性
- **Given**: 项目代码已完整
- **When**: 执行架构分析
- **Then**: 报告应涵盖所有核心模块（intelligence、runtime、governance、models、mcp、skills、agent、server、client）
- **Verification**: `human-judgment`

### AC-2: Agent 蜂群结构识别
- **Given**: 项目包含 13 Agent 架构设计
- **When**: 分析 Agent 注册表和 Orchestrator
- **Then**: 报告应详细描述 9 个 Node Agent、3 个 Cross-Source Verifiers 和 1 个 Orchestrator 的职责和接口
- **Verification**: `human-judgment`

### AC-3: 验证门机制评估
- **Given**: 6 道数据真实性验证门已设计
- **When**: 分析验证逻辑和评分算法
- **Then**: 报告应评估验证机制的完整性、合理性和实现状态
- **Verification**: `human-judgment`

### AC-4: Runtime 系统评估
- **Given**: SwarmOrchestrator 和 DAGExecutor 已实现
- **When**: 分析运行时管理和工作流执行
- **Then**: 报告应评估状态管理、审批流程、审计追踪的完整性
- **Verification**: `human-judgment`

### AC-5: 技能系统评估
- **Given**: Skills 层已实现渐进式加载和上下文预算
- **When**: 分析技能注册、扫描和加载机制
- **Then**: 报告应评估技能生态的规模、分类和性能优化
- **Verification**: `human-judgment`

### AC-6: 测试覆盖评估
- **Given**: 项目包含测试套件
- **When**: 运行测试并分析覆盖率
- **Then**: 报告应提供测试通过情况和覆盖率统计
- **Verification**: `programmatic`

### AC-7: 技术债务识别
- **Given**: 项目已存在一定历史
- **When**: 分析代码质量和依赖状态
- **Then**: 报告应识别技术债务，包括过时依赖、代码重复、未完成功能等
- **Verification**: `human-judgment`

### AC-8: 改进建议可行性
- **Given**: 分析已完成
- **When**: 制定改进建议
- **Then**: 建议应包含优先级、工作量估计和预期收益
- **Verification**: `human-judgment`

## Open Questions
- [ ] 当前项目的实际部署状态和运行环境是什么？
- [ ] 是否有生产环境的性能监控数据？
- [ ] 是否有已知的生产问题或故障记录？
- [ ] 项目团队的资源配置和开发周期计划是什么？