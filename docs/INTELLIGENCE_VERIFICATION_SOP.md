# Intelligence Verification Stabilization v1 — SOP 清单

版本：v1.1
更新日期：2026-07-04

---

## SOP-001：运行 verify:intelligence

**目的**：执行完整的情报验证流程，获取当前 evidence snapshot 和管线健康状态。

**步骤**：

1. 确认 `.env.local` 和 `.env` 中已配置所有需要的 API key。
2. 在项目根目录执行：
   ```bash
   npm run verify:intelligence
   ```
3. 检查控制台输出中的 `credentialStatus`，确认所有预期 source 的凭据状态。
4. 检查 `outputs/intelligence/verification-latest.json` 是否生成。
5. 读取 `sourceResultBreakdown`，确认各项合计等于 `sourceCount`。
6. 读取 `failedSourceBreakdown`、`unavailableSourceBreakdown` 与 `unavailableSourceCount`，不要只用 `failedSourceCount` 或 `degradedSourceCount` 判断根因。
7. 读取 `visualizationReadiness` 状态，确认当前处于 `ready`/`degraded`/`blocked` 中的哪一种。
8. 若状态为 `degraded` 或 `blocked`，按 SOP-002 执行诊断。

**输出物**：
- `outputs/intelligence/verification-latest.json`
- 控制台输出的 `confidenceScore`、`confidenceBreakdown`、`conflictList`、`sourceResultBreakdown`

---

## SOP-002：诊断 degraded / blocked 状态

**目的**：当 `visualizationReadiness` 不是 `ready` 时，定位根因并制定修复计划。

**步骤**：

1. 打开 `verification-latest.json`，定位 `sourceResultBreakdown` 字段。
2. 确认 `sourceResultBreakdown` 各项合计等于 `sourceCount`。
3. 检查 `failedSourceBreakdown`，只把 `invalidCredentials`、`permissionDenied`、`adapterError`、`fetchTimeout`、`schemaInvalid` 当作真正失败类。
4. 检查 `unavailableSourceBreakdown`，把 `missingCredentials`、`rateLimited`、`notFound`、`adapterNotImplemented`、`notProbed`、`noData` 当作不可用类；其合计必须等于 `unavailableSourceCount`。
5. 打开 `confidenceBreakdown`，确认 `sourceReliability`、`dataCompleteness`、`crossSourceAgreement` 是否被缺口拉低。
6. 检查 `conflictList` 是否有未解决的 contradiction。
7. 检查 `missingFields` 是否有关键维度缺失。
8. 检查 `credentialStatus` 是否有 `missing` 的凭据。
9. 根据根因分类处理：
   - **凭据缺失**：按 SOP-003 处理。
   - **外部 source failed**：按 SOP-004 处理。
   - **程序 failed**：按 SOP-005 处理。
   - **数据冲突**：按 SOP-006 处理。

**输出物**：
- 诊断报告（含根因分类和修复优先级）

**当前样例**：

```json
{
  "sourceCount": 23,
  "healthySourceCount": 5,
  "degradedSourceCount": 18,
  "failedSourceCount": 0,
  "unavailableSourceCount": 18,
  "sourceResultBreakdown": {
    "healthy": 5,
    "missingCredentials": 4,
    "adapterNotImplemented": 14
  },
  "failedSourceBreakdown": {
    "invalidCredentials": 0,
    "permissionDenied": 0,
    "adapterError": 0,
    "fetchTimeout": 0,
    "schemaInvalid": 0
  },
  "unavailableSourceBreakdown": {
    "missingCredentials": 4,
    "adapterNotImplemented": 14
  }
}
```

---

## SOP-003：处理 missingCredentials

**目的**：修复因 API key 或授权缺失导致的 source 不可用问题。

**步骤**：

1. 打开 `verification-latest.json`，定位 `credentialStatus` 中标记为 `missing` 的项。
2. 确认该 source 的授权方式（API key、OAuth、账号密码等）。
3. 获取合法凭据：
   - 内部密钥：联系密钥管理员申请。
   - 外部 API：按官方流程注册并获取 key。
4. 将凭据写入 `.env.local`（开发环境）或密钥管理系统（生产环境）。
5. **禁止**将明文密钥提交到版本控制。
6. 重新运行 `verify:intelligence`，确认 `credentialStatus` 变为 `present`。
7. 检查该 source 是否从 `resultStatus = missing_credentials` 变为 `healthy` 或明确的失败类。

**分类边界**：
- `missing_credentials`：没有配置凭据，不进入 `failedSourceBreakdown`。
- `invalid_credentials`：凭据存在但无效，进入 `failedSourceBreakdown`。
- `permission_denied`：凭据有效但权限不足，进入 `failedSourceBreakdown`。

**输出物**：
- 更新后的凭据状态
- 重新运行的验证结果

---

## SOP-004：处理外部 source failed

**目的**：处理因外部 API 故障、网络问题或数据格式变更导致的 source 不可用。

**步骤**：

1. 打开 `verification-latest.json`，定位 `conflictList` 中标记为 `source_failed` 的项。
2. 手动访问该 source 的 API endpoint，确认是临时故障还是永久性变更。
3. 若是临时故障（如 503、timeout）：
   - 记录故障时间和预期恢复时间。
   - 等待恢复后重新运行验证。
4. 若是永久性变更（如 API 版本升级、字段废弃）：
   - 更新对应 adapter 的 `fetch()` 和 `normalize()` 逻辑。
   - 更新 `data/intelligence-source-registry.seed.json` 中的 schema 定义。
   - 重新运行验证。
5. 在修复期间，该 source 走 `fallback()` 路径，不得伪装成 verified。

**输出物**：
- 故障原因记录
- 修复后的 adapter 代码
- 重新运行的验证结果

---

## SOP-005：处理程序 failed

**目的**：处理因代码异常、依赖缺失或配置错误导致的验证流程中断。

**步骤**：

1. 检查控制台错误堆栈，定位异常发生点。
2. 确认所有依赖已正确安装：
   ```bash
   npm install
   ```
3. 确认 `data/intelligence-source-registry.seed.json` 格式正确，无 JSON 语法错误。
4. 确认 `.env.local` 和 `.env` 中无格式错误（如多余的空格、引号不匹配）。
5. 修复代码异常后，重新运行 `verify:intelligence`。
6. 若异常无法定位，启用调试模式：
   ```bash
   DEBUG=verify:* npm run verify:intelligence
   ```

**输出物**：
- 修复后的代码
- 重新运行的验证结果

---

## SOP-006：处理数据冲突

**目的**：处理 `conflictList` 中记录的跨源不一致或内部矛盾。

**步骤**：

1. 打开 `verification-latest.json`，定位 `conflictList`。
2. 对每个 conflict 条目，确认冲突类型：
   - `cross_source_disagreement`：同源多指标偏差超过阈值。
   - `temporal_inconsistency`：时间序列数据出现逻辑矛盾。
   - `counter_evidence`：存在明确的反证数据。
3. 对每条 conflict：
   - 记录涉及的 source、指标、时间窗口。
   - 人工复核原始数据，确认是数据质量问题还是真实业务矛盾。
   - 若是数据质量问题，联系数据源方或更新 adapter。
   - 若是真实业务矛盾，保留 conflict 记录，并在 `confidenceBreakdown` 中标注。
4. 重新运行验证，确认 `confidenceScore` 已正确反映冲突惩罚。

**输出物**：
- 冲突分析报告
- 修复后的数据或 adapter
- 重新运行的验证结果

---

## SOP-007：判定 degraded output 的使用边界

**目的**：明确 degraded output 的允许使用范围和禁止事项。

**允许**：
- 内部监控视图和仪表板。
- 探索性数据分析和趋势观察。
- 作为下一步接入和修复的参考输入。
- 在 `confidenceBreakdown` 中标注每项证据的健康度和缺失项。

**禁止**：
- 用于最终决策。
- 写入正式报告或对外发布。
- 作为供应链验证通过的凭证。
- 跳过 `brandChainGate` 直接判定品牌链路闭合。

**检查清单**：
- [ ] 输出中包含 `confidenceBreakdown` 和 `missingFields`。
- [ ] 输出中明确标注 `visualizationReadiness = degraded`。
- [ ] 输出中不包含 `verified conclusion` 或 `chain_verified` 字样。
- [ ] 输出仅分发给内部技术团队，不对外发布。

---

## SOP-008：进入可视化前的检查清单

**目的**：确保只有满足所有硬门槛的数据才能进入正式可视化/安装包。

**检查项**：

- [ ] `confidenceScore >= 0.72`
- [ ] `evidenceGraphSnapshot`、`confidenceBreakdown`、`conflictList` 已输出
- [ ] 至少 1 个品牌完成财报、海关、供应商、平台价格、物料反推五账本验证
- [ ] 至少 1 个反证案例被系统成功发现并降低置信度
- [ ] 所有密钥不再明文存放
- [ ] 同一输入、同一时间窗口可以复现同一证据链
- [ ] `visualizationReadiness.status = ready`

**步骤**：

1. 运行 `verify:intelligence`。
2. 检查 `verification-latest.json` 是否满足以上所有检查项。
3. 若有任何一项未通过，停止进入可视化，按对应 SOP 修复。
4. 若全部通过，在版本控制中标记 `visualization-ready` tag，并生成安装包。

**输出物**：
- 检查清单签字记录
- 正式安装包

---

## Roadmap TODO

- P2 Tool Permission Hooks 阶段再引入 `AgentRiskVector` / `AgentRiskScore`。
- 可借鉴 vector string 与 0..10 分制的思想，用于表达工具权限风险、外部写入风险和数据泄露风险。
- 本轮不得实现 `AgentRiskVector`，也不得影响 Adapter Result Classification v1 的输出结构。
