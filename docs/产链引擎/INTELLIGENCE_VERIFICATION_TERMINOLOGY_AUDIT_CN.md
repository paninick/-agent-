# Intelligence Verification 中文术语审查报告

> **审查日期**：2026-07-03
> **审查范围**：10 个指定文件 + PowerShell 全局搜索结果
> **审查标准**：6 项重点检查（真相/世界模型/因果推理误用、confidenceScore 命名、healthy source 语义、核心字段区分、degraded 决策限制、AI 味表达）

---

## 一、问题清单

### 1.1 误用"真相""世界模型""因果推理""现实建模"（高风险）

| 文件 | 行号 | 原文 | 问题类型 | 严重度 |
|---|---|---|---|---|
| `01_MASTER_PLAN.md` | 12, 35, 52, 68, 263 | "因果推导系统""因果推导""因果网络" | 把关联分析包装为"推导/推理" | ⚠️ 中 |
| `00_INDEX.md` | 3, 13 | "全产业链因果推导系统""数字验证网络" | 过度包装 | ⚠️ 中 |
| `INDUSTRY_INTELLIGENCE_AGENT_SPEC_CN.md` | 1, 87 | "真实性验证规格""真实性验证" | 把信源可靠性包装为"真实性" | ⚠️ 中 |
| `INTELLIGENCE_VERIFICATION_RUNBOOK_CN.md` | 72, 102 | "真结论""统计真值" | "真值"有歧义，虽有防护声明但术语本身易误解 | ⚠️ 低（已防护） |
| `06_USER_REQUIREMENTS.md` | 55, 99, 234 | "全链路因果推导""数字验证网络""因果推导" | 同 MASTER_PLAN | ⚠️ 中 |
| `05_VERIFICATION_STANDARDS.md` | 369 | "所有 56 源是否都有更新记录" | 源数量暗示质量，与 v3 理念矛盾 | 🔴 高 |
| `20_REAL_DATA_INSIGHTS.md` | 9, 29 | "全景""颠覆性发现" | 过度包装，"颠覆性"属 AI 味营销化 | ⚠️ 中 |

**其他文件（不在指定10个中，但全局搜索暴露）**：
- `ARCHITECTURE_SUMMARY.md:4` — "可执行的因果世界模型" ← 🔴 严重误用
- `MATHEMATICAL_MODEL.md:6,182` — "因果世界模型""革命性升级" ← 🔴 严重
- `DATA_TRUTH_TABLE.md:1` — "数据真相审计" ← 🔴 严重
- `FUSION_DIALECTICAL_ANALYSIS.md:218` — "确实是终极形态" ← 🔴 过度包装

### 1.2 confidenceScore 是否写成旧真值分数字段名

| 检查项 | 状态 | 说明 |
|---|---|---|
| 是否有文件把 confidenceScore 写成旧真值分数字段名 | ✅ 未发现 | 所有文件统一使用 confidenceScore |
| 是否有防护声明 | ✅ 有 | RUNBOOK §3, README, CHANGELOG, SPEC §4.1 均声明"不是 truth score" |
| 是否有裸数字风险 | ⚠️ 存在 | SEMANTIC_REVIEW 指出输出 JSON 中 confidenceScore: 0.575 无解释文本，前端易误解 |

### 1.3 healthy source 是否等同于结论正确

| 文件 | 行号 | 原文 | 状态 |
|---|---|---|---|
| `INTELLIGENCE_VERIFICATION_RUNBOOK_CN.md` | 99 | "healthy 只说明本轮 fetch/schema/mapping/freshness 通过，不保证业务结论一定正确" | ✅ 有防护 |
| `README.md` | 81-87 | "healthySourceCount: adapters whose fetch...pass" + "source count does not prove correctness" | ✅ 有防护 |
| `INDUSTRY_INTELLIGENCE_AGENT_SPEC_CN.md` | 109 | "源数量只能说明覆盖，不代表真实性" | ✅ 有防护 |
| `05_VERIFICATION_STANDARDS.md` | 369 | "所有 56 源是否都有更新记录" | ⚠️ 残留旧理念，暗示源数量=质量 |

### 1.4 核心字段区分是否明确

| 字段 | RUNBOOK | README | CHANGELOG | SPEC | VERIFICATION_STANDARDS |
|---|---|---|---|---|---|
| sourceCount | ✅ 定义明确 | ✅ 定义明确 | ✅ 提及 | ❌ 未提�� | ❌ 未提及 |
| healthySourceCount | ✅ 定义明确 | ✅ 定义明确 | ✅ 提及 | ❌ 未提及 | ❌ 未提及 |
| confidenceScore | ✅ 定义+公式 | ✅ 定义 | ✅ 提及 | ✅ 公式 | ❌ 未提及 |
| visualizationReadiness | ✅ 定义明确 | ✅ 定义明确 | ❌ 未提及 | ❌ 未提及 | ❌ 未提及 |

**缺口**：`05_VERIFICATION_STANDARDS.md` 缺少四个核心字段的定义和语义说明。

### 1.5 degraded output 决策限制是否说明

| 文件 | 行号 | 原文 | 状态 |
|---|---|---|---|
| `INTELLIGENCE_VERIFICATION_RUNBOOK_CN.md` | 105, 191 | "不得用于最终决策，不得写成 verified conclusion" | ✅ 明确禁止 |
| `README.md` | 87 | "must not be treated as a final decision" | ✅ 明确禁止 |
| `INDUSTRY_INTELLIGENCE_AGENT_SPEC_CN.md` | — | 未显式提及 degraded 限制 | ⚠️ 缺失 |
| `05_VERIFICATION_STANDARDS.md` | — | 未提及 visualizationReadiness 或 degraded | ⚠️ 缺失 |

### 1.6 AI 味、营销化、过度包装表达

| 文件 | 行号 | 原文 | 问题类型 |
|---|---|---|---|
| `00_INDEX.md` | 3 | "从第一信息源构建可验证的商业级战略决策引擎" | 营销化包装 |
| `00_INDEX.md` | 81 | "颠覆性发现" | AI 味营销化 |
| `01_MASTER_PLAN.md` | 12 | "全产业链因果推导系统" | 过度包装 |
| `01_MASTER_PLAN.md` | 27 | "跨行业 + 跨企业 + 跨地域的因果推导" | 营销化 |
| `01_MASTER_PLAN.md` | 35 | "因果推导：从原料价格波动推到企业接单决策" | 过度承诺 |
| `20_REAL_DATA_INSIGHTS.md` | 9 | "越南对中国依赖度全景" | 过度包装 |
| `20_REAL_DATA_INSIGHTS.md` | 29 | "颠覆性发现：越南棉花不依赖中国" | AI 味营销化 |
| `MATHEMATICAL_MODEL.md` | 182 | "革命性升级" | 🔴 严重 AI 味 |
| `ARCHITECTURE_SUMMARY.md` | 4 | "可执行的因果世界模型" | 🔴 过度包装 |
| `FUSION_DIALECTICAL_ANALYSIS.md` | 218 | "确实是终极形态" | 🔴 过度包装 |

---

## 二、建议替换词

### 2.1 "真相"类术语替换

| 原词 | 建议替换 | 适用场景 |
|---|---|---|
| 真相 | 事实、实测数据、观测值 | 数据审计、证据描述 |
| 真实性验证 | 信源可靠性验证、数据健康度验证 | 系统规格标题 |
| 真结论 | 可靠结论、可追溯结论 | 结论声明 |
| 统计真值 | 统计基准值、参考值 | 置信度说明 |
| 真值 | ground truth → 实测基准、验证基准 | 技术文档 |

### 2.2 "世界模型/因果推理"类替换

| 原词 | 建议替换 | 适用场景 |
|---|---|---|
| 世界模型 | 产业链关联图谱、传导网络 | 系统定位 |
| 因果推导 | 关联传导分析、传导路径追踪 | 系统描述 |
| 因果推理 | 关联分析、传导链分析 | Agent 角色、能力描述 |
| 因果网络 | 传导网络、关联图谱 | 架构描述 |
| 数字验证网络 | 数据可追溯网络、信源交叉验证网络 | 系统定位 |

### 2.3 AI 味营销化表达替换

| 原词 | 建议替换 | 适用场景 |
|---|---|---|
| 颠覆性发现 | 关键发现、反直觉发现 | 数据洞察标题 |
| 全景 | 全貌、结构概览、依赖度分析 | 章节标题 |
| 革命性升级 | 重要升级、v2.0 升级 | 版本描述 |
| 终极形态 | 目标形态、成熟形态 | 架构愿景 |
| 全产业链因果推导系统 | 产业链信源验证与传导分析系统 | 系统定位 |
| 可验证的商业级战略决策引擎 | 信源可追溯的产业分析工具 | 系统定位 |

---

## 三、修订后的关键术语表

### 3.1 核心输出字段（Stabilization v1）

| 字段 | 中文名 | 定义 | 注意事项 |
|---|---|---|---|
| sourceCount | 注册源数 | registry 中配置的全部源数量 | 不代表可用或可信 |
| healthySourceCount | 健康源数 | AdapterHealth.status = healthy 的源数量 | 仅说明本轮检查通过，���保证结论正确 |
| degradedSourceCount | 降级源数 | 有 partial data 但 schema/mapping/freshness 不完整的源数量 | 可用于监控/探索，不得用于最终决策 |
| failedSourceCount | 失败源数 | fetch 失败/schema 不合法/credential 缺失/无可用数据的源数量 | 包含多种失败模式，需细分 |
| confidenceScore | 规则置信度 | 基于源可靠性、数据完整度、时效性、跨源一致性、冲突惩罚计算的分数 | **不是真相分数**，不是统计真值 |
| visualizationReadiness | 可视化就绪状态 | ready / degraded / blocked 三态 | degraded 仅允许调试面板，不得进入正式可视化 |

### 3.2 验证相关术语

| 术语 | 定义 | 禁止用法 |
|---|---|---|
| 信源可靠性验证 | 检查 API 可用性、schema 合法性、数据完整度、时效性 | ❌ 不得称为"真实性验证" |
| Evidence Graph | 证据节点（SourceNode/DataPointNode/IndicatorNode/EntityNode）+ 边（derived_from/describes/supports/contradicts）构成的图谱 | ❌ 不得称为"因果网络" |
| 传导分析 | 从上游数据变化推算下游可能影响的分析过程 | ❌ 不得称为"因果推导"或"因果推理" |
| 交叉验证 | 多源数据对比，发现异常或确认一致性 | ❌ 不得称为"真相验证" |

### 3.3 状态与阈值术语

| 术语 | 含义 | 使用约束 |
|---|---|---|
| ready | 可视化就绪，满足 confidenceScore ≥ 0.72 + brandChainGate = chain_verified + 反证案例 + 密钥治理 + 可复现 | 可进入正式可视化/安装包阶段 |
| degraded | 部分条件未满足，有 partial evidence | 仅允许调试面板、监控视图，不得作为最终决策依据 |
| blocked | 关键条件缺失，无法进入可视化 | 需补齐缺口后重新评估 |

---

## 四、文档风险提示

### 4.1 高风险文档（需立即修订）

| 文件 | 风险点 | 建议操作 |
|---|---|---|
| `05_VERIFICATION_STANDARDS.md` §九 | "56 源"残留 + 源数量暗示质量 | 将"56 源"改为"23 源"，增加注释"源数量 ≠ 可信度，以 healthySourceCount 和 confidenceScore 为准" |
| `01_MASTER_PLAN.md` | "因果推导系统""因果推导"多次出现 | 全文术语替换：因果推导 → 传导分析，因果网络 → 传导网络 |
| `00_INDEX.md` | "因果推导系统""数字验证网络""颠覆性发现" | 术语替换 + 去营销化 |
| `INDUSTRY_INTELLIGENCE_AGENT_SPEC_CN.md` | 标题"真实性验证规格" | 改为"信源可靠性验证规格" |
| `20_REAL_DATA_INSIGHTS.md` | "全景""颠覆性发现" | 改为"全貌""关键发现" |

### 4.2 中风险文档（建议修订）

| 文件 | 风险点 | 建议操作 |
|---|---|---|
| `INTELLIGENCE_VERIFICATION_RUNBOOK_CN.md` | "真结论""统计真值"术语有歧义 | 改为"可靠结论""统计基准值"（已有防护声明，优先级较低） |
| `06_USER_REQUIREMENTS.md` | "因果推导""数字验证网络" | 术语替换，与 MASTER_PLAN 保持一致 |

### 4.3 低风险文档（已有防护，可保留）

| 文件 | 状态 | 说明 |
|---|---|---|
| `README.md` | ✅ 防护充分 | confidenceScore 定义明确 + "not a truth score" 声明 + degraded 决策限制 |
| `CHANGELOG.md` | ✅ 防护充分 | verifiedSourceCount 废弃说明 + confidenceScore 定义 |
| `00c_RESTART_PLAN_v3.md` | ✅ 无明显问题 | 核心转向描述合理，无过度包装 |
| `10_PROBE_RESULTS.md` | ✅ 无明显问题 | 实测数据记录，术语使用合理 |

### 4.4 需新增内容的位置

| 文件 | 缺失内容 | 建议新增 |
|---|---|---|
| `05_VERIFICATION_STANDARDS.md` | 核心字段定义 | 增加 §十 "Stabilization v1 输出字段语义"，引用 RUNBOOK §3 |
| `INDUSTRY_INTELLIGENCE_AGENT_SPEC_CN.md` | degraded 决策限制 | 在 §12 可视化门槛后增加"degraded output 仅限监控/探索，不得用于最终决策" |
| 输出 artifact JSON | confidenceScore 裸数字风险 | 增加 confidenceScoreExplanation + confidenceBreakdown 字段 |

---

## 五、审查结论

### 5.1 通过项（✅）

| 检��项 | 状态 | 证据 |
|---|---|---|
| confidenceScore 未写成旧真值分数字段名 | ✅ 通过 | 全部文件统一使用 confidenceScore |
| healthy source ≠ 结论正确 | ✅ 通过（核心文档） | RUNBOOK §3, README, SPEC §4.1 均有防护声明 |
| 核心字段定义明确 | ✅ 通过（RUNBOOK/README） | RUNBOOK §3 + README 有完整字段表 |
| degraded 决策限制说明 | ✅ 通过（RUNBOOK/README） | RUNBOOK §3, §9 + README 有明确禁止 |

### 5.2 部分通过项（⚠️）

| 检查项 | 状态 | 缺口 |
|---|---|---|
| 核心字段定义 | ⚠️ 部分通过 | VERIFICATION_STANDARDS 缺失 |
| degraded 决策限制 | ⚠️ 部分通过 | INDUSTRY_INTELLIGENCE_AGENT_SPEC_CN.md 缺失 |
| 旧表述残留 | ⚠️ 部分通过 | 05_VERIFICATION_STANDARDS §九 有"56 源"残留 |

### 5.3 未通过项（❌）

| 检查项 | 状态 | 问题 |
|---|---|---|
| "真相""世界模型""因果推理"误用 | ❌ 未通过 | 多处误用，需系统性术语替换 |
| AI 味营销化表达 | ❌ 未通过 | "颠覆性""革命性""终极形态""全景"等需去营销化 |

### 5.4 优先级建议

**P0（立即修复）**：
1. `05_VERIFICATION_STANDARDS.md` §九 — "56 源" → "23 源" + 注释
2. `01_MASTER_PLAN.md`, `00_INDEX.md` — "因果推导" → "传导分析" 系统性替换

**P1（本周修复）**：
1. `INDUSTRY_INTELLIGENCE_AGENT_SPEC_CN.md` — 标题 + degraded 决策限制
2. `20_REAL_DATA_INSIGHTS.md` — 去营销化
3. 输出 artifact JSON — 增加 confidenceScoreExplanation

**P2（后续迭代）**：
1. 其他文档中的"真相""世界模型"残留（全局搜索已暴露，不在指定10个中）
2. 前端展示文案审查（裸数字风险）

---

## 六、附录：PowerShell 搜索完整结果摘要

### 6.1 "真相/truth/世界模型/因果推理"搜索结果

| 文件 | 匹配数 | 关键问题 |
|---|---|---|
| `01_MASTER_PLAN.md` | 7 | "因果推导系统""因果推导""因果网络" |
| `00_INDEX.md` | 2 | "因果推导系统""数字验证网络" |
| `INDUSTRY_INTELLIGENCE_AGENT_SPEC_CN.md` | 2 | "真实性验证规格""真实性验证" |
| `INTELLIGENCE_VERIFICATION_RUNBOOK_CN.md` | 2 | "真结论""统计真值"（已有防护） |
| `ARCHITECTURE_SUMMARY.md` | 3 | "因果世界模型"（不在指定10个中） |
| `MATHEMATICAL_MODEL.md` | 5 | "因果世界模型""革命性升级"（不在指定10个中） |

### 6.2 核心字段搜索结果

| 字段 | 文件数 | 主要分布 |
|---|---|---|
| sourceCount | 5 | RUNBOOK, README, CHANGELOG, SEMANTIC_REVIEW, V3-README |
| healthySourceCount | 6 | RUNBOOK, README, CHANGELOG, SEMANTIC_REVIEW, V3-README |
| confidenceScore | 10 | RUNBOOK, README, CHANGELOG, SPEC, SEMANTIC_REVIEW, V3-README, MATHEMATICAL_MODEL |
| visualizationReadiness | 7 | RUNBOOK, README, V3-README, 04b_M0_DESIGN, MATHEMATICAL_MODEL, SEMANTIC_REVIEW |
| verifiedSourceCount | 5 | RUNBOOK, CHANGELOG, README, V3-README, SEMANTIC_REVIEW（均为废弃声明） |

### 6.3 "56源/颠覆/革命性"搜索结果

| 文件 | 匹配 | 问题 |
|---|---|---|
| `05_VERIFICATION_STANDARDS.md` | "56 源" | 🔴 残留旧表述 |
| `00_INDEX.md` | "颠覆性发现" | ⚠️ AI 味 |
| `20_REAL_DATA_INSIGHTS.md` | "颠覆性发现" | ⚠️ AI 味 |
| `MATHEMATICAL_MODEL.md` | "革命性升级" | 🔴 严重 AI 味（不在指定10个中） |

---

**报告结束**
