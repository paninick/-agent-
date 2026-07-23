# Intelligence Verification Stabilization v1 — 风险提示

版本：v1.0
更新日期：2026-07-03

---

## RISK-001：confidenceScore 被误读为结论正确性

**风险等级**：高

**描述**：`confidenceScore` 反映的是证据集合的内部一致性和管线健康度，不是结论正确性的度量。但用户或下游系统可能将其误解为"准确性"或"正确性"评分，从而基于不完整的证据做出错误决策。

**触发条件**：
- 用户未阅读运行手册，直接查看 `confidenceScore` 数值。
- 下游系统未解析 `confidenceBreakdown`，仅使用 `confidenceScore` 作为决策门槛。
- 报告模板未显式标注 "confidenceScore 不是 truth score"。

**影响**：
- 基于不完整或冲突证据的错误决策。
- 对系统能力的过度信任，导致忽略必要的人工复核。

**缓解措施**：
- 在所有输出界面显式标注 "confidenceScore 不是 truth score"。
- 在 `verification-latest.json` 中强制包含 `confidenceBreakdown` 和 `conflictList`。
- 下游系统必须解析 `confidenceBreakdown`，不能仅依赖 `confidenceScore` 单一数值。
- 定期对用户进行培训，强调 `confidenceScore` 的准确含义。

---

## RISK-002：degraded output 被用于最终决策

**风险等级**：高

**描述**：当 `visualizationReadiness = degraded` 时，输出包含 partial data 和已知缺失项，不满足决策要求。但若内部流程不严格，此类输出可能被误用于最终决策。

**触发条件**：
- 内部报告未标注 `visualizationReadiness` 状态。
- 决策者未检查 `confidenceBreakdown` 和 `missingFields`。
- 为赶进度而忽略 degraded 状态的限制。

**影响**：
- 基于不完整证据的系统性偏差决策。
- 品牌供应链验证被错误判定为通过。
- 审计不可追溯，合规风险。

**缓解措施**：
- 严格执行 SOP-007，明确 degraded output 的使用边界。
- 在报告模板中强制显示 `visualizationReadiness` 状态，且 degraded 状态使用醒目的视觉标识。
- 建立审批流程：degraded output 必须经技术负责人签字确认仅用于内部监控。
- 定期审计输出物，检查是否有 degraded output 被用于决策。

---

## RISK-003：missingCredentials 导致覆盖盲区

**风险等级**：中

**描述**：当关键 source 因 `missingCredentials` 不可用时，若该 source 是唯一覆盖某维度的源，则该维度 coverage 降为 `gap`，形成监控盲区。

**触发条件**：
- 新接入的 source 未及时配置凭据。
- 已有凭据过期或失效。
- 密钥轮换期间出现空窗期。

**影响**：
- 某维度的数据完全缺失，无法发现该维度的异常。
- `confidenceScore` 被人为拉低，但问题根源是凭据而非数据质量。

**缓解措施**：
- 建立凭据监控机制，提前预警即将过期的凭据。
- 在 `verification-latest.json` 中显式标注因凭据缺失导致的 coverage gap。
- 为关键维度配置多个冗余 source，避免单点依赖。
- 密钥轮换期间保持新旧凭据并行运行，确认新凭据生效后再停用旧凭据。

---

## RISK-004：外部 source failed 被误判为数据质量问题

**风险等级**：中

**描述**：外部 source 的临时故障（如 API 超时、503 错误）可能被误判为数据质量问题，导致不必要的 adapter 修改或数据源替换。

**触发条件**：
- 未区分临时故障和永久性变更。
- 故障日志未记录 HTTP status code 和响应时间。
- 缺乏对外部 source 可用性的历史监控。

**影响**：
- 对健康的 adapter 进行不必要的修改，引入新的 bug。
- 替换稳定的数据源，增加系统不稳定性。
- 浪费开发和调试时间。

**缓解措施**：
- 严格执行 SOP-004，区分临时故障和永久性变更。
- 记录每次故障的 HTTP status code、响应时间、重试次数。
- 建立外部 source 可用性监控仪表板，观察历史趋势。
- 对临时故障设置自动重试机制（如指数退避），避免单次失败即标记为 failed。

---

## RISK-005：程序 failed 导致验证流程中断

**风险等级**：中

**描述**：代码异常、依赖缺失或配置错误可能导致整个 `verify:intelligence` 流程中断，无法获取任何验证结果。

**触发条件**：
- 代码变更未经过充分测试即部署。
- 依赖版本升级引入 breaking change。
- 配置文件格式错误（如 JSON 语法错误、环境变量缺失）。

**影响**：
- 验证流程完全不可用，无法获取任何 evidence snapshot。
- 生产环境监控中断，无法及时发现数据问题。
- 影响下游依赖验证结果的业务流程。

**缓解措施**：
- 严格执行 SOP-005，建立代码变更的 review 和测试流程。
- 在 CI/CD 中集成 `verify:intelligence` 的自动化测试。
- 配置文件使用 JSON schema 校验，提前发现格式错误。
- 关键依赖锁定版本，避免自动升级引入 breaking change。
- 建立验证流程的健康监控，失败时及时告警。

---

## RISK-006：counter-evidence penalty 机制失效

**风险等级**：中

**描述**：若 counter-evidence penalty 机制失效，系统可能忽略明显的矛盾数据，输出过高的 `confidenceScore`。

**触发条件**：
- contradiction detection 逻辑存在 bug。
- penalty 权重设置过低，无法有效降低 confidenceScore。
- 反证数据未被正确识别为 contradiction。

**影响**：
- 冲突数据被忽略，输出虚假的"高置信度"。
- 基于错误证据的决策风险。

**缓解措施**：
- 定期运行 counter-evidence audit case（如 BOM/纱线数量超差样例），验证 penalty 机制是否正常工作。
- 在 `confidenceBreakdown` 中显式显示 penalty 项的得分。
- 对 contradiction detection 逻辑进行单元测试覆盖。
- 建立人工复核机制，对高 confidenceScore 但存在已知冲突的场景进行抽查。

---

## RISK-007：密钥明文存放导致安全风险

**风险等级**：高

**描述**：API key、密码等敏感凭据若以明文形式存放在代码库或配置文件中，存在泄露风险。

**触发条件**：
- 开发人员将 `.env.local` 提交到版本控制。
- 密钥通过不安全的渠道（如即时通讯、邮件）传输。
- 生产环境的密钥未使用专用密钥管理系统。

**影响**：
- 敏感凭据泄露，被恶意利用。
- 数据源被滥用，导致 API 配额耗尽或账号被封禁。
- 违反数据安全和合规要求。

**缓解措施**：
- 严格执行 SOP-003，禁止将明文密钥提交到版本控制。
- 使用 `.gitignore` 排除 `.env.local` 和 `.env` 文件。
- 生产环境使用专用密钥管理系统（如 AWS Secrets Manager、Azure Key Vault）。
- 定期轮换密钥，限制密钥有效期。
- 对密钥使用进行审计，发现异常访问及时告警。

---

## RISK-008：visualizationReadiness 状态被篡改或绕过

**风险等级**：高

**描述**：若 `visualizationReadiness` 状态被手动篡改或绕过检查，不满足门槛的数据可能进入正式可视化/安装包。

**触发条件**：
- 开发人员手动修改 `verification-latest.json` 中的状态。
- 部署脚本未检查 `visualizationReadiness` 即生成安装包。
- CI/CD 流程中存在漏洞，允许跳过验证步骤。

**影响**：
- 不满足门槛的数据被包装成正式产品发布。
- 用户基于不可靠数据做出错误决策。
- 品牌声誉受损。

**缓解措施**：
- `visualizationReadiness` 必须由 `confidence-engine` 自动计算，禁止手动修改。
- 部署脚本强制检查 `visualizationReadiness = ready`，否则终止部署。
- CI/CD 流程中设置验证步骤为强制环节，不可跳过。
- 对 `verification-latest.json` 进行签名，防止篡改。
- 定期审计部署日志，检查是否有绕过验证的部署记录。

---

## RISK-009：证据链不可复现

**风险等级**：中

**描述**：若同一输入、同一时间窗口无法复现同一证据链，则验证结果不可审计、不可追溯。

**触发条件**：
- 外部 source 的数据随时间变化（如实时汇率、最新财报）。
- 验证流程依赖随机数或未初始化的变量。
- 缓存机制导致不同时间获取的数据不一致。

**影响**：
- 无法验证历史结论的正确性。
- 审计时无法复现当时的证据链。
- 不同时间运行的验证结果不可比较。

**缓解措施**：
- 对每次验证的证据 snapshot 进行版本化存储，保留完整的 `evidenceGraphSnapshot`。
- 记录每次验证的输入参数、时间戳、数据源版本。
- 对时间敏感的数据，明确标注数据的时间窗口和有效期。
- 避免在验证流程中使用随机数或未初始化的变量。
- 定期执行复现测试，验证同一输入是否能复现同一证据链。

---

## RISK-010：过度依赖自动化验证，忽视人工复核

**风险等级**：中

**描述**：系统提供了自动化的验证流程，但自动化不能替代人工对业务逻辑的理解和判断。

**触发条件**：
- 用户完全信任 `confidenceScore`，不进行任何人工复核。
- 复杂的业务矛盾被简化为数值指标，导致重要信号被忽略。
- 缺乏领域专家参与验证结果的分析。

**影响**：
- 自动化无法识别的业务风险被忽略。
- 数值指标无法反映的定性问题被遗漏。
- 系统能力被过度夸大，导致决策失误。

**缓解措施**：
- 明确自动化验证的定位：辅助工具，而非决策替代。
- 对高风险的验证结果（如 `brandChainGate` 判定），强制要求领域专家人工复核。
- 在 `confidenceBreakdown` 中保留定性描述，不仅仅是数值。
- 定期组织领域专家对验证结果进行评审，发现自动化流程的盲点和不足。
