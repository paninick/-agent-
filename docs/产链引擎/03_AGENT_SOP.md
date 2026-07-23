# Agent SOP (角色操作手册)

> **更新日期**：2026-07-01
> **适用范围**：产链引擎全 7 个角色
>
> **重要校正（2026-07-01）**：§三 Weigher 的基础权重表与代码真值（`data/intelligence-source-registry.seed.json` + `src/intelligence/evidenceLedger.ts scoreEvidence`）不一致。原文档写 6 档 S/A+/A/B+/B/C 含 B+，代码实际是 5 档 S/A+/A/B/C（无 B+），且数值有 0.05 差异。本节 §三的权重表已按代码真值修正，请同步查阅 `02_DATA_SOURCE_REGISTRY.md §顶部代码真源识别`。

---

## 七角色概览

```
数据流向：
信号 → [Collector] → 原始数据
       ↓
       [Cleaner] → 标准化证据
       ↓
       [Weigher] → 加权证据 + 置信度
       ↓
       [Reasoner] → 因果网络 + 结论
       ↓
       [Devil's Advocate] → 验证报告
       ↓
       [Predictor] → 场景矩阵
       ↓
       [Writer] → 多层记忆库
```

---

## 角色 1: Collector (采集员)

### 职责
从指定 API/搜索/平台拉取原始数据。

### 输入
```
trigger:
  type: signal | cron | manual | user_query
  payload:
    source_id: 数据源标识
    query: API 调用参数
    time_range: 时间窗口
    entity_id: 目标实体
    ttl_seconds: 缓存有效期
```

### SOP
1. 查本地记忆库 (Ark Memory + Obsidian)
   - 是否已有该数据且未过期
   - 如有 → 直接返回，标记 source = cache
2. 调用对应 API adapter
3. 结构化抽取关键字段
4. 输出数据包（原始响应 hash + 抽取字段 + 完整性评分）

### 自检
- HTTP 非 200 → 标记 failed
- 返回空或格式异常 → 标记 anomaly
- 与上次对比差异 > 50% → 标记 drift_alert
- API 用量超预算 → 标记 budget_alert

### 推荐模型
首选规则引擎（无需 LLM），兜底用快速模型（DeepSeek Flash / MiMo V2.5）。

---

## 角色 2: Cleaner (清洗员)

### 职责
单位标准化、口径对齐、异常检测、实体消歧。

### SOP
1. 单位标准化
   - 金额 → USD（ECB 当日汇率）
   - 重量 → kg
   - 时间 → ISO 8601 UTC
2. 口径对齐
   - FOB vs CIF 标记
   - HS4 vs HS6 映射
   - 季度/月度统一
3. 异常检测
   - Z-score > 3 → outlier
   - 环比 > 3σ → spike
   - 缺失率 > 20% → low_quality
4. 实体消歧
   - 公司名 → OS Hub ID
   - 国家名 → ISO 代码

### 推荐模型
首选规则引擎（数字计算应该用代码，不要用 LLM）。

---

## 角色 3: Weigher (赋权员)

### 职责
给每条证据赋综合权重，标记可交叉性。

### SOP
1. 基础权重（**代码真值，5 档制，无 B+**）：
   - S = 1.0     政府/交易所原始数据
   - A+ = 0.9    授权平台 / 上市公司审计披露 / 直接供应商披露
   - A = 0.75    政府统计 / 行业协会 / 合规数据库 / 官方研究
   - B = 0.5     咨询报告 / 专业媒体 / 招聘 / 网页 / 市场信号
   - C = 0.25    未授权抓取 / 社媒传言 / 二手转述（只作线索）
2. 时效性衰减：7天内=1.0, 30天内=0.92, 180天内=0.82, 365天内=0.68, 730天内=0.5, 超过=0.5
3. 完整性折扣：缺失<5%=1.0, <10%=0.8, <20%=0.5, ≥20%=0.1
4. 交叉验证：同方向≥2个=1.0, 1个=0.7, 反向=0.5
5. 反证惩罚：1个反证=-0.05, 2个=-0.10, 3+=-0.15（自动降级）
6. 最终权重 = base × recency × completeness × corroboration - penalty
7. 阈值：> 0.6 才能作为主证据

> **代码实现位置**：`src/intelligence/evidenceLedger.ts scoreEvidence()` + `data/intelligence-source-registry.seed.json tiers.*.defaultWeight`。
> **与早期文档差异**：
> - 原文档写 A=0.8、B+=0.6、B=0.4、C=0.2 — 代码实为 A=0.75、B=0.5、C=0.25，**无 B+ 等级**
> - 0.05 差异会影响 sourceWeight 字段，直接影响 chainAlignment 计算
> - recency 衰减桶从 5 档变 6 档（30/180/365/730/>730）

---

## 角色 4: Reasoner (推理员) ★ 最关键

### 职责
构建因果网络，做因果推导。

### SOP
1. 明确分析范围（时间窗口、涉及实体、关心指标）
2. 按因果 DAG 排列证据（时序对齐：棉花涨 → 3-6 周后面料涨 → 8-12 周后成衣涨）
3. 前向推导（A → B → C），每步标注逻辑依据、证据支持、不确定度
4. 多路径验证（同一结论是否能从 3 条独立路径到达）
5. 反证搜索（专门找推翻结论的证据）
6. 反馈环识别（强/中/弱/破）
7. 输出结论 + 置信度 + 反证 + 数据缺口

### 输出规则
- 置信度 < 0.5 → 不称"结论"，称"假设"
- 置信度 > 0.7 + 无反证 → 可信结论
- 每个结论必须标注"边界条件"和"失效条件"

### 推荐模型
首选 Claude Opus 4.7/4.8（因果推导能力最强，置信度校准准）。

---

## 角色 5: Devil's Advocate (对抗验证员)

### 职责
专门试图推翻 Reasoner 的结论。

### SOP（黑盒验证，看不到中间推理）
1. 逻辑一致性检验
2. 证据引用验证（声称的 evidence_ids 是否真的支持结论）
3. 反证盲区检查
4. 数值校验（推导链数学计算是否正确）
5. 时效性检验
6. 边界条件声明

### 输出规则
verdict: PASS / WARN / FAIL / ESCALATE
FAIL → Reasoner 必须重做
连续 3 次 FAIL → 升级人工

### 推荐模型
**关键：必须用与 Reasoner 不同的模型**
- Reasoner 用 Claude → Verifier 用 DeepSeek Pro
- 同源模型无法真正对抗

---

## 角色 6: Predictor (预测员)

### 职责
基于已验证结论做未来场景模拟和时间线推演。

### SOP
1. 基线预测（按历史趋势外推）
2. 扰动叠加（关税、汇率、季节性、竞品）
3. 场景模拟（乐观/中性/悲观 + 概率）
4. 每个预测必须标注：前提条件、失效条件、历史类比

### 推荐模型
首选 Claude Sonnet 4.6 / Opus（场景模拟需要强推理，不确定性表达准确）。

---

## 角色 7: Writer (记录员)

### 职责
把验证通过的结果写入多层记忆库。

### 数据等级规则
- L0 公开：全位置可写
- L1 内部分析：Obsidian + Ark + 向量（脱敏后）
- L2 商业敏感：仅 Obsidian 本地
- L3 核心机密：仅 Obsidian 加密卷，绝不同步

### Obsidian 写入规范
- 路径：知识库/主动情报/_证据/{entity}/{date}_{topic}.md
- frontmatter：evidence_ids, confidence, verification_status, source_grade, fetched_at
- 正文：结论 + 因果链 + 反证 + 数据缺口
- 双链：[[entity]] [[source]] [[brand]]

### 推荐模型
首选规则引擎（确定性操作，用 LLM 反而引入不确定性）。

---

## 角色协作原则

### 串行 vs 并行

并行：
- Collector 多源拉取
- Weigher 多证据加权

串行：
- Cleaner → Weigher
- Weigher → Reasoner
- Reasoner → Devil's Advocate
- Devil's Advocate → Predictor
- Predictor → Writer

### 失败处理
- Collector 失败 → 重试 → 备用源 → 跳过
- Cleaner 异常率 > 30% → 上报 Supervisor
- Reasoner 置信度 < 0.5 → 标记假设，待补充
- Devil's Advocate FAIL → Reasoner 重做，连续 3 次升级人工
- Predictor 边界条件触发 → 重新评估

### 角色间数据契约

Collector → Cleaner：
必须包含 evidence_id, raw_hash, extracted_fields, source_grade

Cleaner → Weigher：
必须包含 cleaned_fields, unit_conversions, quality_score, canonical_entity

Weigher → Reasoner：
必须包含 final_weight, weight_breakdown, cross_references, conflicts_with

Reasoner → Devil's Advocate：
必须包含 statement, confidence, causal_paths, counter_evidence, data_gaps

Devil's Advocate → Predictor：
必须包含 verdict, issues, adjusted_confidence, invalidation_conditions

Predictor → Writer：
必须包含 scenarios, probabilities, assumptions, invalidation_triggers

Writer → 记忆库：
必须包含所有上游产出 + 写入位置 + audit_trail
