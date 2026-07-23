# Intelligence Verification Stabilization v1 — FAQ

版本：v1.0
更新日期：2026-07-03

---

## Q1：sourceCount 和 healthySourceCount 有什么区别？

**A**：`sourceCount` 是注册表中配置的全部 source 数量，仅反映配置规模。`healthySourceCount` 是本轮验证中实际通过健康检查的 source 数量。两者的差距反映了管线中不可用或部分可用的 source 比例。

---

## Q2：confidenceScore 高是否意味着结论一定正确？

**A**：否。`confidenceScore` 反映的是当前 evidence snapshot 的内部一致性和管线健康度，不是结论正确性的度量。高 confidenceScore 只说明数据源之间没有明显冲突、数据完整度较高、时效性较好，但不代表结论与外部客观事实一致。

---

## Q3：为什么系统不提供 truth score？

**A**：因为多数业务场景缺乏可验证的 ground truth。不同数据源对同一事实的表述存在固有差异，不能简单视为"错误"。系统的设计目标是发现管线问题（缺失、冲突、时效），而非证明结论正确。

---

## Q4：visualizationReadiness = degraded 时，我能做什么？

**A**：可以进行内部监控、探索性分析和调试。但不得用于最终决策、不得写入正式报告、不得对外发布、不得作为供应链验证通过的凭证。

---

## Q5：missingCredentials 会如何影响结果？

**A**：`missingCredentials` 会直接降低 `healthySourceCount`，进而拉低 `confidenceScore`。如果该 source 是唯一覆盖某维度的源，则该维度 coverage 会降为 `gap`。系统会走 `fallback()` 路径，不会生成合成数据填补缺口。

---

## Q6：verify:intelligence passed 是否意味着供应链已验证？

**A**：否。`verify:intelligence passed` 仅表示管线级验证通过（registry 可解析、adapter 可运行、evidence graph 可构建），不表示任何品牌供应链已验证或任何业务结论已确认正确。

---

## Q7：外部 source failed 和程序 failed 有什么区别？

**A**：外部 source failed 是预期内情况（如 API 返回 404、timeout），仅影响该 source 的数据点，不会导致整体流程中断。程序 failed 是预期外情况（如代码异常、依赖缺失），可能导致整个验证流程中断，必须修复后重试。

---

## Q8：degraded output 为什么不能进入最终决策层？

**A**：因为 degraded output 包含 partial data 和已知缺失项，基于不完整证据的决策存在系统性偏差风险。同时，degraded 状态的 `confidenceScore` 低于 `ready` 阈值，内部一致性不足，且可能包含未解决的冲突，不满足审计要求。

---

## Q9：如何区分 "verified" 和 "healthy"？

**A**：`verified` 是 source 级别的状态，表示该 source 在本轮验证中成功返回了数据并通过了 schema 检查。`healthy` 是 adapter 级别的状态，表示该 source 的 fetch、schema、mapping、freshness 四项检查全部通过。一个 source 可以是 `verified` 但不是 `healthy`（如数据返回了但 freshness 检查未通过）。

---

## Q10：confidenceScore 的计算公式是什么？

**A**：具体公式由 `confidence-engine` 实现，但核心逻辑包括：

1. `healthySourceCount / sourceCount` 的基础权重
2. 数据完整度（字段缺失率的负向惩罚）
3. 时效性（数据新鲜度的正向加权）
4. 跨源一致性（同源多指标偏差的负向惩罚）
5. 冲突惩罚（`conflictList` 中每条 contradiction 的负向加权）

最终得分是一个 0-1 之间的浮点数，由以上因素加权计算得出。

---

## Q11：counter-evidence penalty 是什么？

**A**：当系统发现与当前证据矛盾的反证数据时，会自动降低 `confidenceScore`。这是为了防止系统忽略矛盾信号而盲目输出高置信度。当前使用 BOM/纱线数量超差样例验证该机制。

---

## Q12：brandChainGate 和 gate 有什么区别？

**A**：`gate` 是管线级验证门槛，证明证据账本和通用结论门槛是否工作。`brandChainGate` 是业务级验证门槛，证明具体品牌的供应链闭环是否成立。前者通过不等于后者通过。

---

## Q13：为什么 "2/6 ledgers passed" 不能输出 "GAP 供应链已验证"？

**A**：因为 `brandChainGate` 要求六个账本全部通过才能判定 `chain_verified`。当前仅财务和宏观扰动两个账本通过，贸易/海关、供应商、平台、物料四个账本未通过，供应链链路未闭合。输出"已验证"会误导决策。

---

## Q14：visualizationReadiness 的阈值是多少？

**A**：当前硬门槛包括：
- `confidenceScore >= 0.72`
- 至少 1 个品牌完成五账本验证
- 至少 1 个反证案例成功降低置信度
- 所有密钥不再明文存放
- 同一输入、同一时间窗口可以复现同一证据链

只有全部满足，状态才会变为 `ready`。

---

## Q15：fallback() 路径会生成合成数据吗？

**A**：不会。`fallback()` 路径仅输出该 source 不可用的原因（如 `skipped_auth_required`、`source_failed`），不会生成任何合成数据或估算值来填补数据缺口。
