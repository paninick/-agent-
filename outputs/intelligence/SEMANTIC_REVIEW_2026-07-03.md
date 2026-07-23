# Intelligence Verification Stabilization v1 — 产品语义与工程路线审查

> **审查日期**：2026-07-03
> **审查对象**：Intelligence Verification Stabilization v1 输出语义、文档一致性、工程路线
> **审查依据**：RUNBOOK_CN / AGENT_SPEC_CN / RESTART_PLAN_v3 / README / CHANGELOG / 00_INDEX / 01_MASTER_PLAN / 02_DATA_SOURCE_REGISTRY / 05_VERIFICATION_STANDARDS / 10_PROBE_RESULTS / 20_REAL_DATA_INSIGHTS
> **限制**：不写代码、不扩展世界模型、不提出因果推理、不把 confidenceScore 说成事实真相、只做产品语义和工程路线审查

---

## 当前输出快照（审查基准）

```json
{
  "sourceCount": 23,
  "healthySourceCount": 5,
  "degradedSourceCount": 0,
  "failedSourceCount": 18,
  "confidenceScore": 0.575,
  "visualizationReadiness": "degraded",
  "dataPointNodeCount": 8,
  "edgeCount": 25,
  "missingCredentials": ["fred", "us-census-trade", "open-supply-hub", "un-comtrade"]
}
```

---

## 1. 当前语义是否符合现实工程系统

**结论：符合，但存在旧文档残留不一致。**

核心文档（RUNBOOK §3、README、CHANGELOG）对每个字段的定义清晰且互相一致：

| 字段 | 定义 | 与现实对齐 |
|---|---|---|
| `sourceCount` | registry 中配置的全部 source 数量 | ✅ seed.json 实际 23 个源 |
| `healthySourceCount` | AdapterHealth.status = healthy 的数量 | ✅ 5 个公开 API verified |
| `degradedSourceCount` | partial data 但 schema/mapping/freshness 不完整 | ✅ 当前为 0，合理 |
| `failedSourceCount` | fetch 失败/schema 不合法/credential 缺失/无可用数据 | ⚠️ 包含多种异质状态（见第 6 点） |
| `confidenceScore` | 规则置信度，非 truth score | ✅ 公式明确（SPEC §4.1） |
| `visualizationReadiness` | ready/degraded/blocked 三态 | ✅ 门槛条件已定义 |

**残留不一致**（不阻塞但应修复）：

- `05_VERIFICATION_STANDARDS.md` §九 仍提到"所有 56 源"和旧的 7 档等级体系（A-/B+等），与 v3 真实栈的 23 源 5 档制不一致。该文件已在 `02_DATA_SOURCE_REGISTRY.md` §代码真源识别中标注修复，但尚未实际修改。
- `10_PROBE_RESULTS.md` §六 汇总仍列出 Massive.com 为"已实测可用的 S 级数据源"，虽然 §三 已标注 DEPRECATED，但汇总未同步更新。

---

## 2. 是否仍有"source 数量 = 可信结论"的误导

**结论：核心文档已消除误导，旧文档有残留风险。**

已防护的位置：

- RUNBOOK §3："sourceCount 不代表可用或真实"
- CHANGELOG："verifiedSourceCount is no longer a core metric because source count does not prove correctness"
- README："source count does not prove correctness"
- SPEC §4.1："confidenceScore 替代把 verifiedSourceCount 当作核心判断的做法。源数量只能说明覆盖，不代表真实性"
- RUNBOOK §2："gate.status = hard_conclusion 不等于 brandChainGate.status = chain_verified"

残留风险：

- `05_VERIFICATION_STANDARDS.md` §九 的月度检查清单仍以"所有 56 源是否都有更新记录"作为质量指标，暗示源数量与质量正相关。这与 v3 的"源健康度 > 源数量"理念矛盾。
- `01_MASTER_PLAN.md` §五 KPI 中"数据覆盖度 = 已覆盖维度 / 6"是维度覆盖而非源数量，语义正确，但与 sourceCount 字段的关系未显式说明。

**建议**：在 `05_VERIFICATION_STANDARDS.md` §九 中将"56 源"替换为"23 源"并增加注释"源数量不等于可信度，以 healthySourceCount 和 confidenceScore 为准"。

---

## 3. confidenceScore 是否可能被误解成 truth score

**结论：文档层面防护充分，但展示层需要配合。**

文档防护：

- RUNBOOK §3 表格："当前 evidence snapshot 的规则置信度，不是 truth score，不是统计真值"
- README："rule-based confidence for the current evidence snapshot, not a truth score"
- RUNBOOK §2："系统会明确声明'这是管线健康结论，不是品牌供应链真结论'"
- SPEC §4.1 给出了完整的加权公式：`0.30 * sourceReliability + 0.25 * dataCompleteness + 0.20 * freshnessScore + 0.15 * crossSourceAgreement - 0.10 * conflictPenalty`

潜在风险：

- 当前输出 JSON 中 `confidenceScore: 0.575` 是一个裸数字，没有附带解释文本。如果前端只展示 "置信度: 57.5%" 而不加限定语，用户极易将其理解为"这个结论有 57.5% 的概率是真的"。
- 0.575 的计算过程（各子项得分）未在输出中暴露，外部观察者无法区分"因为数据少所以低"和"因为有冲突所以低"。

**建议**：

1. 在输出 artifact 中增加 `confidenceScoreExplanation` 字段，说明这是规则置信度及其计算组成。
2. 前端展示时必须附带限定语："管线健康置信度（非事实真相概率）"。
3. 考虑在 `confidenceBreakdown` 中暴露各子项得分，使 0.575 可解释。

---

## 4. degraded mode 的边界是否足够清楚

**结论：正向定义清楚，负面清单缺失。**

已有定义：

- RUNBOOK §3："degraded mode 允许输出 partial dataset、missingFields 和 warnings，用于监控或探索；不得用于最终决策，不得写成 verified conclusion"
- README："Degraded output may be used for monitoring and exploration only; it must not be treated as a final decision"
- RUNBOOK §6 可视化门槛表格明确了 degraded 的触发条件

缺失部分：

- 没有一份明确的"degraded 模式下禁止做什么"的负面清单。例如：
  - 能否用 degraded 数据生成品牌推荐？
  - 能否用 degraded 数据做成本估算？
  - 能否把 degraded 数据导出给第三方？
  - 能否在 degraded 模式下运行 Devil's Advocate？
- `blocked` 状态的触发条件和行为定义不够详细。RUNBOOK 只定义了 `ready` 的硬门槛，`blocked` 何时触发、与 `degraded` 的区别是什么，未显式说明。

**建议**：

1. 在 RUNBOOK 中增加 §3.1 "degraded mode 负面清单"，明确列出禁止操作。
2. 显式定义 `blocked` 的触发条件（例如：healthySourceCount = 0，或 confidenceScore < 某个下限，或关键账本全部 missing）。

---

## 5. visualizationReadiness 是否适合后续前端展示

**结论：三态设计适合前端，但需要配套元数据。**

优点：

- `ready / degraded / blocked` 三态简洁，适合 UI 状态指示器（绿/黄/红）。
- 每个状态有明确的触发条件（RUNBOOK §6、§9）。
- 当前实测为 `degraded`，原因可追溯（4 个 missing credentials + confidenceScore < 0.72 + brandChainGate = partial_chain）。

不足：

- 输出 JSON 只有状态字符串，没有 `readinessReasons` 或 `blockingIssues` 数组。前端无法直接展示"为什么是 degraded"。
- 没有 `readinessHistory`（状态变化时间线），无法做趋势展示。
- `degraded` 和 `blocked` 之间没有中间态。如果系统从 degraded 恶化到接近 blocked，前端无法预警。

**建议**：

1. 在输出中增加 `visualizationReadinessDetail` 对象，包含 `reasons: string[]` 和 `unmetConditions: string[]`。
2. 考虑增加 `readinessTrend`（上次 vs 本次），支持前端展示改善/恶化方向。

---

## 6. failedSourceCount 是否应该细分为 missing_credentials / not_configured / failed

**结论：应该细分。当前 18 个 failed 包含异质状态，不利于运维和优先级排序。**

当前问题：

- `failedSourceCount: 18` 包含了至少三种完全不同的失败模式：
  - **missing_credentials**（4 个）：FRED、U.S. Census、Open Supply Hub、UN Comtrade — 需要申请/配置 API key
  - **candidate_adapter_needed**（3 个）：WITS、OECD、ILOSTAT — adapter 未调通，公开 API 可用但参数/超时问题
  - **其他 failed**（11 个）：可能是 seed.json 中注册但完全未实现 adapter 的源，或 fetch 超时/schema 不合法的源
- `missingCredentials` 数组只列出了 4 个，但没有区分"已实现 adapter 但缺 key"和"未实现 adapter"。
- 运维人员看到 18 个 failed 无法判断优先级：是先配 key，还是先修 adapter，还是先补实现？

**建议细分**：

```
failedSourceBreakdown: {
  missingCredentials: 4,      // adapter 已实现，缺 key
  adapterNotImplemented: 11,  // seed 中有注册，但无 fetch 函数
  adapterError: 3,            // adapter 存在但 fetch/schema/mapping 失败
  fetchTimeout: 0             // 网络层失败
}
```

这与 RUNBOOK §5 的源状态表（verified / skipped_auth_required / candidate_adapter_needed）天然对齐。

---

## 7. 当前阶段是否可以进入各下一步

| 下一步 | 是否可以进入 | 理由 |
|---|---|---|
| **Adapter Classification** | ✅ 可以 | Adapter Standardization v1 已在 RUNBOOK §1.5 定义（fetch/normalize/confidence/health/fallback 五接口）。当前 18 个 failed 的分类正是 classification 的工作。 |
| **Credential Gating** | ✅ 可以 | missingCredentials 已明确列出 4 个源。credential gating 的逻辑（有 key → fetch，无 key → fallback + skipped_auth_required）已在 officialApis.ts 中实现骨架。 |
| **Real Adapter Connection** | ⚠️ 有条件可以 | P-Block 1 的 4 个授权源 adapter 函数已实现，缺 key 时走 fallback。真实连接取决于 key 的申请进度。建议先完成 classification 和 gating，再逐个接入真实 API。 |
| **Evidence Visualization** | ❌ 不可以 | visualizationReadiness = degraded，不满足 RUNBOOK §9 硬门槛（confidenceScore >= 0.72 + brandChainGate = chain_verified + 反证案例 + 密钥治理 + 可复现）。当前只可做调试面板，不可做正式可视化。 |

---

## 8. 下一轮 Codex 最应该做什么

**最高优先级：Adapter Result Classification + Failed Source Breakdown**

理由：

1. 当前 18 个 failed 是一个黑箱。不做分类就无法知道哪些是"配 key 就能好"、哪些是"需要修 adapter"、哪些是"需要补实现"。
2. Classification 是 credential gating 和 real adapter connection 的前置条件。不知道失败原因就无法排优先级。
3. 这项工作不涉及真实 API 调用、不涉及 UI、不涉及世界模型扩展，纯粹是对现有输出的结构化细化。
4. 完成后可以直接提升 `failedSourceCount` 的可操作性，并为后续 confidenceScore 提升提供明确路径。

**具体产出**：

1. 在 verification output 中增加 `failedSourceBreakdown` 对象（见第 6 点建议）。
2. 为每个 failed source 标注 `failureReason` 枚举值：`missing_credentials | adapter_not_implemented | adapter_error | fetch_timeout | schema_invalid | no_data`。
3. 更新 RUNBOOK §3 字段表，增加新字段定义。
4. 更新 CHANGELOG。

**次优先级**（classification 完成后）：

1. 补全 `confidenceBreakdown` 各子项得分暴露。
2. 增加 `visualizationReadinessDetail`。
3. 修复旧文档残留不一致（05_VERIFICATION_STANDARDS §九、10_PROBE_RESULTS §六）。

**不应该做的**：

- ❌ 直接做正式可视化 UI（visualizationReadiness = degraded）
- ❌ 直接接入真实 API（应先完成 classification 和 gating）
- ❌ 扩展世界模型或因果推理（不在当前阶段）
- ❌ 把 confidenceScore 改名为 truthScore 或类似表述

---

## 附录：文档一致性检查清单

| 检查项 | 状态 | 位置 |
|---|---|---|
| confidenceScore 未被写成"真相分数" | ✅ 通过 | RUNBOOK §3, README, CHANGELOG, SPEC §4.1 |
| degraded mode 说明只能用于监控/探索 | ✅ 通过 | RUNBOOK §3, README |
| visualizationReadiness 区分 ready/degraded/blocked | ⚠️ 部分通过 | ready 和 degraded 定义清楚，blocked 定义不够详细 |
| sourceCount 未被误解成可信源数量 | ⚠️ 部分通过 | 核心文档已防护，05_VERIFICATION_STANDARDS §九 有残留 |
| verifiedSourceCount 不再作为核心字段 | ✅ 通过 | CHANGELOG, RUNBOOK §2, README |
| 下一步应先做 Adapter Classification | ✅ 确认 | 见第 7、8 点分析 |
| 旧文档 56 源表述已标注修复 | ⚠️ 已标注未执行 | 02_DATA_SOURCE_REGISTRY §代码真源识别 |
| Massive.com DEPRECATED 标注 | ⚠️ 部分通过 | §三 已标注，§六 汇总未同步 |
