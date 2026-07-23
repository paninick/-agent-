# 情报验证运行手册（Stabilization v1）

更新日期：2026-07-04

---

## 1. 术语定义

### 1.1 sourceCount

注册表（`data/intelligence-source-registry.seed.json`）中配置的全部 source 数量。该数字仅反映配置规模，不代表可用性、健康度或业务结论正确性。

### 1.2 healthySourceCount

本轮验证中 `AdapterHealth.status = healthy` 的 source 数量。`healthy` 仅说明该 source 在本轮 fetch、schema、mapping、freshness 四项检查中通过，不保证其业务结论一定正确。

### 1.3 degradedSourceCount

`AdapterHealth.status = degraded` 的 source 数量。它包含两类情况：

- 有 partial data，但 schema、mapping、freshness 至少一项不完整。
- 当前不可用但不等同于 adapter bug，例如 `missing_credentials`、`rate_limited`、`not_found`、`adapter_not_implemented`、`not_probed`、`no_data`。

因此 `degradedSourceCount` 是粗粒度健康状态，不是业务可用性的最终判断。

当前 23-source 输出中 `degradedSourceCount = 18`，表示 18 个 source 处于非 healthy 且非真正失败的兼容聚合态；它不等于 partial data source 数量。运维判断必须查看 `sourceResultBreakdown` 和 `unavailableSourceBreakdown`。

### 1.4 failedSourceCount

真正失败类 source 的聚合数量。只统计 `invalid_credentials`、`permission_denied`、`adapter_error`、`fetch_timeout`、`schema_invalid`。该字段不能单独用于判断根因，必须结合 `sourceResultBreakdown` 阅读。

### 1.5 SourceResultStatus 与 breakdown

`AdapterHealth.status` 保持三态：`healthy`、`degraded`、`failed`。`resultStatus` 是细粒度运维分类：

| resultStatus | 归类 | 说明 |
|---|---|---|
| `healthy` | 健康 | 本轮 fetch/schema/mapping/freshness 通过。 |
| `degraded` | 部分可用 | 有 partial data，但存在非阻断缺口。 |
| `missing_credentials` | unavailable | 未配置凭据，不等于凭据错误。 |
| `invalid_credentials` | failed | 凭据存在但无效，常见于 401。 |
| `permission_denied` | failed | 有凭据但权限不足，常见于 403。 |
| `rate_limited` | unavailable | 外部限流，默认不当作 adapter bug。 |
| `not_found` | unavailable | endpoint 或资源不存在。 |
| `adapter_not_implemented` | unavailable | registry 有 source，但当前 verification profile 未实现 adapter。 |
| `not_probed` | unavailable | adapter 存在，但本轮未执行。 |
| `adapter_error` | failed | adapter 执行异常。 |
| `fetch_timeout` | failed | 请求超时。 |
| `schema_invalid` | failed | 返回结构不符合 normalize/schema 预期。 |
| `no_data` | unavailable | 请求成功，但当前条件或时间窗口无数据。 |

输出字段：

- `sourceResultBreakdown`：所有 resultStatus 的完整计数，合计必须等于 `sourceCount`。
- `failedSourceBreakdown`：只包含真正失败类。
- `unavailableSourceBreakdown`：包含不可用但不等价于 adapter bug 的类别。
- `unavailableSourceCount`：`unavailableSourceBreakdown` 各项合计。

`missing_credentials` 与 `invalid_credentials` 不同；`permission_denied` 与 `missing_credentials` 不同；`rate_limited` 与 `adapter_error` 不同；`not_found` 与 `no_data` 不同；`not_probed` 与 failed 不同；`adapter_not_implemented` 与 external source failed 不同。

当前本地样例：

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

### 1.6 confidenceScore

当前 evidence snapshot 的规则置信度，由以下因素计算得出：

- healthySourceCount 占比
- 数据完整度（字段缺失率）
- 时效性（数据新鲜度）
- 跨源一致性（同源多指标偏差）
- 冲突惩罚（contradiction penalty）

**confidenceScore 不是 truth score，不是统计真值，不是"准确性"或"正确性"评分。** 它仅反映当前证据集合的内部一致性和管线健康度。

### 1.7 confidenceScore 为什么不是 truth score

| 维度 | confidenceScore | truth score |
|---|---|---|
| 计算对象 | 证据集合的内部一致性 | 与外部客观事实的符合度 |
| 可验证性 | 可通过同一输入复现 | 需要 ground truth 对照 |
| 受数据源影响 | 是，数据源质量直接影响 | 不应受数据源影响 |
| 数值含义 | 管线健康度 | 结论正确度 |

系统不提供 truth score，因为：

1. 多数业务场景缺乏可验证的 ground truth。
2. 不同数据源对同一事实的表述存在固有差异，不能简单视为"错误"。
3. confidenceScore 的设计目标是发现管线问题（缺失、冲突、时效），而非证明结论正确。

### 1.8 visualizationReadiness

判断是否允许进入正式可视化/安装包的三态枚举：

| 状态 | 含义 | 允许操作 |
|---|---|---|
| `ready` | 所有门槛通过，可进入正式可视化。 | 正式报告、安装包、对外发布 |
| `degraded` | 存在 partial evidence 或管线问题，但仍有部分数据可用。 | 监控视图、探索性分析、内部调试 |
| `blocked` | 关键门槛未通过，或存在严重冲突/缺失。 | 仅允许诊断和修复，禁止任何输出 |

---

## 2. 运行命令

```bash
npm test
npm run build
npm run verify:intelligence
```

`verify:intelligence` 会自动读取 `.env.local` 和 `.env`。输出中的 `credentialStatus` 只显示 `present/missing`，不会打印密钥值。

`verify:intelligence` 执行以下步骤：

1. 校验 `data/intelligence-source-registry.seed.json` 的结构、权重和唯一 ID。
2. 实际访问当前可公开访问的官方 API：
   - World Bank Indicators API：读取越南 GDP、越南加权平均关税、孟加拉女性劳动参与率等官方时间序列。
   - SEC EDGAR Company Facts：读取 GAP, INC 结构化公司 facts。
   - Eurostat Statistics API：读取德国 2024 年人口统计 JSON-stat 数据。
   - ECB Euro foreign exchange reference rates：读取 EUR 基准汇率，并计算 USD/JPY 交叉汇率。
   - BLS Public Data API：读取美国服装 CPI 官方时间序列，作为市场价格信号。
3. 对需要授权的源输出结构化缺口：
   - FRED：需要 `FRED_API_KEY`。
   - U.S. Census International Trade API：需要 `CENSUS_API_KEY`；本机未授权探针实测返回官方 Missing Key 页面。
   - Open Supply Hub：需要 `OPEN_SUPPLY_HUB_API_KEY`；本机未授权探针实测返回 401。
   - UN Comtrade：需要 `UN_COMTRADE_API_KEY`，通过官方 subscription key header 验证。
4. 把返回数据转换成证据账本条目，并构建 Evidence Graph v1：
   - `SourceNode`
   - `DataPointNode`
   - `IndicatorNode`
   - `EntityNode`
   - `derived_from/describes/supports/contradicts` edges
5. 运行 Adapter Standardization v1：
   - 每个 adapter 标准化为 `fetch()`、`normalize()`、`confidence()`、`health()`、`fallback()`。
   - 未授权或未配置的源必须走 `fallback()`，不能伪装成 verified。
6. 运行 Verification Engine v1：
   - cross-source agreement scoring
   - temporal consistency check
   - missing data penalty
   - conflict detection
   - 输出 `confidenceScore`、`confidenceBreakdown`、`conflictList`
7. 对 GAP, INC 做一个品牌财务试点：
   - 从 SEC XBRL 中抽取收入、毛利、销售成本、库存、经营利润。
   - 派生毛利率和库存/收入比。
   - 明确这只能证明品牌经营指标可抽取，还不能证明供应商出货。
8. 运行 `brandChainGate`：
   - 把品牌供应链验证拆成财务、贸易、供应商、平台、物料、宏观扰动六个账本。
   - 每个账本都必须有强证据才能通过。
   - 当前 GAP 试点为 `partial_chain`，不是完整供应链验证。
9. 运行 `visualizationReadiness`：
   - 明确当前是否允许进入正式可视化/安装包。
   - 当前状态可为 `ready/degraded/blocked`；当前真实运行是 `degraded`，因为有 partial evidence 但置信度和覆盖仍不足。
10. 持久化 bounded verification artifact：
    - 默认路径：`outputs/intelligence/verification-latest.json`。
    - artifact 不包含密钥，只包含 normalized verification output 和 `present/missing` 凭据状态。
11. 保留一个 counter-evidence audit case：
    - 当前使用 BOM/纱线数量超差样例验证 contradiction penalty。
    - 该样例不是 GAP 真实风格，只用于证明系统能证伪并降低置信度。

---

## 3. 验证边界

通过 `verify:intelligence` 只能证明：

- 官方 API 网络链路可用。
- 源注册表可解析，并能转换成 Evidence Graph v1。
- S 级证据能进入统一账本。
- `verifiedSourceCount` 已被 `healthySourceCount` 替代；兼容字段只允许出现在 `compatibility.deprecatedVerifiedSourceCount`。
- 输出包含 `evidenceGraphSnapshot`、`confidenceScore`、`confidenceBreakdown`、`conflictList`、`sourceResultBreakdown`、`failedSourceBreakdown`、`unavailableSourceBreakdown`。
- 置信度评分和结论门槛能工作。
- 系统会明确声明"这是管线健康结论，不是品牌供应链真结论"。
- 授权缺口会被显式输出为 `skipped_auth_required`，不会被误算成通过。
- `verify:intelligence passed` 只表示管线级验证通过，不表示品牌供应链已经验证。

它不能证明：

- 某个品牌真实发单量。
- 某个供应商真实出货量。
- 面辅料、纱线、成衣、海关之间已经数量闭环。
- Temu、Shopee、1688 的授权订单数据已经接入。
- 东南亚同行、关税、汇率、人工、能源已经按国家和品类全部回填。

因此脚本会同时输出两个 gate：

| 输出 | 含义 |
|---|---|
| `gate` | 证明证据账本和通用结论门槛是否工作。 |
| `brandChainGate` | 证明具体品牌的供应链闭环是否成立。 |
| `confidenceScore` | 用健康状态、数据完整度、时效性、跨源一致性和冲突惩罚计算当前证据快照置信度。 |
| `visualizationReadiness` | 判断是否允许进入正式可视化/安装包。 |

`gate.status = hard_conclusion` 不等于 `brandChainGate.status = chain_verified`。前者只说明管线健康或某条证据成立；后者才说明品牌供应链链路闭合。

---

## 4. degraded mode 行为规范

### 4.1 允许做什么

- 输出 partial dataset、missingFields 和 warnings。
- 用于监控视图、内部调试、探索性分析。
- 在 `confidenceBreakdown` 中显式标注每项证据的健康度和缺失项。
- 作为下一步接入和修复的参考输入。

### 4.2 禁止做什么

- 不得用于最终决策。
- 不得写成 verified conclusion。
- 不得进入正式报告或对外发布。
- 不得作为供应链验证通过的凭证。
- 不得跳过 `brandChainGate` 直接判定品牌链路闭合。

---

## 5. missingCredentials 对 coverage / confidence 的影响

当 `credentialStatus = missing` 时：

1. **Coverage 影响**：该 source 的全部数据点标记为 `skipped_auth_required`，不计入 healthySourceCount，但计入 sourceCount。
2. **Confidence 影响**：
   - 直接降低 healthySourceCount / sourceCount 比值。
   - 若该 source 是唯一覆盖某维度的源，则该维度 coverage 降为 `gap`。
   - 在 `confidenceBreakdown` 中显式列出因 credential 缺失导致的覆盖缺口。
3. **行为约束**：系统必须走 `fallback()` 路径，不能伪装成 verified 或生成合成数据填补缺口。

---

## 6. verify:intelligence passed 的含义

`verify:intelligence` 的 `passed` 仅表示：

- 管线级验证通过（registry 可解析、adapter 可运行、evidence graph 可构建）。
- `confidenceScore` 计算逻辑正确。
- `visualizationReadiness` 状态机可正常输出。
- counter-evidence penalty 机制可正常工作。

**不表示**：

- 任何品牌供应链已验证。
- 任何业务结论已确认正确。
- 数据源内容已全面覆盖。

---

## 7. 外部 source failed 与程序 failed 的区别

| 类型 | 判定条件 | 影响范围 | 处理路径 |
|---|---|---|---|
| 外部 source failed | API 返回非 2xx、超时、数据格式不符、认证失败 | 仅影响该 source 的数据点 | 记录 `conflictList`，走 `fallback()`，继续验证其他 source |
| 程序 failed | 代码异常、未捕获错误、依赖缺失、配置错误 | 可能导致整个验证流程中断 | 终止当前验证，输出 `blocked` 状态，需要修复后重试 |

关键区别：外部 source failed 是预期内情况，不应导致整体流程中断；程序 failed 是预期外情况，必须修复。

---

## 8. degraded output 为什么不能进入最终决策层

1. **证据不完整**：degraded output 包含 partial data 和已知缺失项，基于不完整证据的决策存在系统性偏差风险。
2. **confidenceScore 未达标**：degraded 状态意味着 `confidenceScore` 低于 `ready` 阈值，内部一致性不足。
3. **冲突未解决**：degraded 状态可能包含未解决的 `conflictList` 条目，直接决策会忽略这些矛盾信号。
4. **缺乏品牌链路闭合**：`brandChainGate` 未通过时，无法确认品牌供应链的完整性和一致性。
5. **审计不可追溯**：degraded output 的 `confidenceBreakdown` 和 `missingFields` 表明其不满足审计要求，无法作为合规决策依据。

---

## 9. 覆盖状态解释

`verify:intelligence` 会输出七个全球监控维度：

- `financials_and_disclosures`
- `customs_and_trade`
- `supplier_facilities`
- `macro_cost_drivers`
- `platform_orders_and_prices`
- `compliance_and_labor`
- `market_and_strategy_context`

状态含义：

| 状态 | 含义 |
|---|---|
| `covered` | 注册表已有足够源，且不依赖授权。 |
| `covered_but_auth_needed` | 源地图覆盖，但需要 API key、账号、卖家授权或规模访问许可。 |
| `partial` | 有部分源，但覆盖项不全或缺主证据。 |
| `gap` | 当前注册表没有合适来源。 |

当前七个维度均为 `covered_but_auth_needed`。这说明监控地图已经铺开，但真实全量接入仍取决于授权、密钥和商业数据源。

---

## 10. 当前实测源状态

截至 2026-06-30：

| 源 | 状态 | 说明 |
|---|---|---|
| World Bank | `verified` | 无密钥，已产出 S 级宏观、关税、劳动力证据；同源多指标进入 graph，但不再作为数量门槛。 |
| SEC EDGAR | `verified` | 无密钥，已产出 S 级财报结构化证据。 |
| Eurostat | `verified` | 无密钥，已产出 S 级欧洲统计证据。 |
| ECB Euro foreign exchange reference rates | `verified` | 无密钥，已产出 S 级汇率证据，并计算 USD/JPY 交叉汇率。 |
| BLS Public Data API | `verified` | 无密钥，已产出 S 级美国服装 CPI 市场价格信号；不能替代品牌订单或平台销量。 |
| FRED | `skipped_auth_required` | 需要 `FRED_API_KEY`。 |
| U.S. Census International Trade API | `skipped_auth_required` | 需要 `CENSUS_API_KEY`；可用于美国 HS 级进口贸易验证。 |
| Open Supply Hub | `skipped_auth_required` | 需要 `OPEN_SUPPLY_HUB_API_KEY`，未授权请求返回 401。 |
| UN Comtrade | `skipped_auth_required` | 需要 `UN_COMTRADE_API_KEY`。 |

已纳入注册表、但本轮不计入 verified 的官方候选源：

| 源 | 当前状态 | 说明 |
|---|---|---|
| World Integrated Trade Solution API | `candidate_adapter_needed` | 官方公开 API，适合关税/贸易政策；本机 HS6 样例出现超时或 data not found，需要调参和缓存。 |
| OECD Data Explorer API | `candidate_adapter_needed` | 官方公开数据，适合宏观、价格、劳动、贸易交叉校验；需要 SDMX 维度发现器。 |
| ILOSTAT API | `candidate_adapter_needed` | 官方公开 API，适合工资/就业/工时；当前样例参数需继续校准。 |

---

## 11. 当前品牌财务试点

`verify:intelligence` 当前以 GAP, INC 为 SEC 财务试点。实测可抽取：

| 指标 | SEC XBRL 标签 | 用途 |
|---|---|---|
| 收入 | `Revenues` | 品牌销售规模与海关/平台侧需求对齐。 |
| 毛利 | `GrossProfit` | 价格、成本、折扣、采购压力判断。 |
| 销售成本 | `CostOfGoodsAndServicesSold` | 供应链成本和毛利拆分入口。 |
| 库存 | `InventoryFinishedGoodsNetOfReserves` | 库存压力、补单/砍单、采购节奏判断。 |
| 经营利润 | `OperatingIncomeLoss` | 经营杠杆和策略空间判断。 |

注意：SEC company facts 里同一次 10-K 会包含多个历史对比期。系统选择指标时优先按 `period end` 最新排序，再看 `filed` 日期，避免把最新提交里的历史对比期误认为最新经营期。

当前 GAP 品牌链路 gate：

| 账本 | 当前状态 | 原因 |
|---|---|---|
| 财务 | `passed` | SEC XBRL 经营指标已抽取。 |
| 宏观扰动 | `passed` | World Bank、Eurostat、ECB、BLS 已提供宏观、关税、劳动力、价格、汇率证据。 |
| 贸易/海关 | `partial` | U.S. Census、UN Comtrade 缺 API key。 |
| 供应商 | `partial` | Open Supply Hub 缺 API key；还没有品牌供应商关系证据。 |
| 平台 | `missing` | Shopee、Temu、Alibaba/1688 未授权。 |
| 物料 | `missing` | 物料/BOM 核算模型已具备，但缺真实 BOM、面辅料、纱线、损耗率和海关/供应商数量。 |

当前结论：`2/6 ledgers passed`，属于 `partial_chain`。不得输出"GAP 供应链已验证"。

当前可视化门槛：

| 条件 | 当前状态 |
|---|---|
| `confidenceScore >= 0.72` | 未通过，当前实测低于 ready 阈值。 |
| `brandChainGate.status = chain_verified` | 未通过，当前 `partial_chain`。 |
| 至少一个反证案例成功降低置信度 | 已通过，`counterEvidencePenaltyObserved = true`。 |
| 授权源凭据无缺口 | 未通过，FRED、U.S. Census、Open Supply Hub、UN Comtrade 缺 key。 |
| 可复现证据运行产物已声明 | 已通过，artifact 写入 `outputs/intelligence/verification-latest.json`。 |

因此 `visualizationReadiness.status = degraded`。可以输出 partial dataset 和监控视图，但不得把 degraded 数据当作最终决策或 verified conclusion。

---

## 12. 物料/BOM 核算模型

系统已具备物料数量核算函数，但默认不把模型输出当作真实证据。只有接入真实 BOM、供应商发货、仓库台账或海关数量后，才可写入 `material_quantity` 证据。

当前公式：

```text
netFabricKg = finishedUnits * fabricKgPerUnit
grossFabricKg = netFabricKg / (1 - cuttingWasteRate)
yarnInputKg = grossFabricKg / yarnToFabricYieldRate
fiberInputKg = yarnInputKg / fiberToYarnYieldRate
```

可对比观测数量：

```text
deltaPct = (observedKg - expectedKg) / expectedKg
```

如果 `abs(deltaPct)` 超过容忍阈值，证据会自动生成 contradiction，防止把无法对上的物理量当成结论。

---

## 13. 下一步接入顺序

P0：

1. 完成密钥治理，轮换本机明文密钥。
2. 为 World Bank、SEC、Eurostat、ECB、BLS、Comtrade、FRED、U.S. Census 写稳定 adapter，并统一到 Adapter Standardization v1。
3. 给 FRED、U.S. Census、e-Stat、USITC、EDINET 配置合法 API key。
4. 把 adapter 输出统一写入证据账本。

P1：

1. Shopee、Temu、Alibaba/1688 授权接口。
2. Open Supply Hub 工厂 ID 和公司别名解析。
3. 品牌财报与海关 HS 编码的映射表。

P2：

1. Factiva、Brand24、Particl、Quartr、Daloopa、S&P、Morningstar 等商业源。
2. Vercel Workflow 定时监控与失败重试。
3. 可视化调试面板。

---

## 14. 进入可视化前的硬门槛

不得因为 `verify:intelligence` 通过就开始做正式安装包。正式可视化前必须满足：

- `confidenceScore >= 0.72`，且 `evidenceGraphSnapshot`、`confidenceBreakdown` 与 `conflictList` 已输出。
- 至少 1 个品牌完成财报、海关、供应商、平台价格、物料反推五账本验证。
- 至少 1 个反证案例被系统成功发现并降低置信度。
- 所有密钥不再明文存放。
- 同一输入、同一时间窗口可以复现同一证据链。

这些条件现在由 `confidence-engine` 和 `visualizationReadiness` 机器判断。只有输出 `ready` 才允许进入正式可视化/安装包阶段。
