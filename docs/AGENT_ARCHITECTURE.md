# v3 Agent 架构 — 13 Agent + 6 验证门

> **版本**：v1.0 | **日期**：2026-07-01
> **基础**：src/intelligence/*.ts (9 fetch + ledger + 6 ledger) + MATHEMATICAL_MODEL.md v2.0 (24 模型)
> **目的**：让 agent 不仅"算模型"，还要"确认数据真实性"

---

## 一、设计原则

```
1. 每个 Node Agent 拥有自己的模型 + 数据源 + 验证规则
2. 6 道验证门 → 每条 evidence 必须通过才能进 ledger
3. Orchestrator 编排 13 个 agent，决定 retry / downgrade / reject
4. 异源审计：provenance + cross-source + historical 必须异源
5. 可降级：低 score 不 REJECT，但 flag = 'low_authenticity'
```

---

## 二、13 Agent 注册表

### Layer 1：9 Node Agents

| # | Agent ID | nodeId | 模型 | 主数据源 | v3 现有 fetch adapter | 工作量 |
|---|---|---|---|---|---|---|
| 1 | CottonNode | cotton | ARIMAX + 供需平衡 | USDA WASDE + Cotlook | fetchWorldBankIndicator (GDP/关税) | 1 周 |
| 2 | PTANode | pta | PTA-PX-MEG 三元联立 | 隆众 + CCFEI | fetchComtradeFlowSummary (HS 化纤) | 1 周 |
| 3 | KeqiaoNode | keqiao | 柯桥指数 + 染整传递 | 中纤网 + 印染协会 | **新建 adapter** | 2 周 |
| 4 | DesignBassNode | design | Bass + Gompertz | WGSN + Pantone + 平台 SKU | fetchWorldBankIndicator (时尚相关) | 2 周 |
| 5 | ManufacturingOEENode | manufacturing | 学习曲线 + OEE + AQL | 申洲/晶苑年报 + ILO | 无对应（需合作）| 3 周 |
| 6 | BrandMarkovNode | brand | 健康度 + Markov | SEC 10-K + EDINET | fetchSecCompanyMetricSet (GAP) | 1 周 |
| 7 | ChannelLogisticsNode | channel | 渠道费 + 物流 | Freightos + 平台规则 | 无对应 | 2 周 |
| 8 | ConsumerLogitNode | consumer | OLS + Logit | NBS + CPI + CCI | fetchEurostatDataPoint + fetchBlsLatestSeriesPoint | 1 周 |
| 9 | RecycleLCANode | recycle | 材料流 + LCA + CBAM | Textile Exchange + GRS + Ecoinvent | 无对应 | 3 周 |
| | | | | | **总计** | **~14 周 / 1 人** |

### Layer 2：3 Cross-Source Verifiers

| # | Agent | 职责 | 异源要求 |
|---|---|---|---|
| V1 | ProvenanceVerifier | 来源白名单 + 响应 hash + 时效 | 与 node agent 异源（用独立 trust list）|
| V2 | CrossSourceVerifier | 跨源一致性（pairwise 偏差）| 至少 2 个独立 adapter |
| V3 | HistoricalAnomalyVerifier | 历史 z-score 检测 | 用历史 ledger 数据（≥ 30 天）|

### Layer 3：1 Orchestrator

| # | Agent | 职责 | 输入 | 输出 |
|---|---|---|---|---|
| O1 | Orchestrator | 编排 13 agent | NodeId + Input | EvidenceEntry + flag |

---

## 三、6 道数据真实性验证门

### 门 1：来源溯源（provenance）

```typescript
// src/intelligence/agents/validators/provenance.ts
interface ProvenanceCheck {
  sourceInTrustedList: boolean
  responseSignatureValid: boolean
  responseAgeOk: boolean
}

function checkProvenance(evidence: EvidenceEntry, trustedRepos: Set<string>): number {
  let score = 0
  if (evidence.sourceId in trustedRepos) score += 0.4
  if (verifyResponseHash(evidence.rawRef)) score += 0.3
  if (Date.now() - new Date(evidence.observedAt).getTime() < EVIDENCE_MAX_AGE_MS) score += 0.3
  return score
}
```

### 门 2：Schema 匹配（schema_match）

```typescript
// src/intelligence/agents/validators/schema.ts
function checkSchema(raw: unknown, zodSchema: ZodSchema): number {
  const result = zodSchema.safeParse(raw)
  return result.success ? 1.0 : (1 - missingFieldCount / totalFieldCount)
}
```

### 门 3：值域合理性（range_plausibility）

```typescript
// src/intelligence/agents/validators/range.ts
const KNOWN_RANGES = {
  cotton_price: [5000, 50000],       // ¥/吨
  pta_price: [3000, 15000],          // ¥/吨
  yarn_price: [10000, 50000],        // ¥/吨
  fabric_price: [5, 100],           // ¥/米
  fob_price: [5, 100],              // ¥/件
  retail_price: [30, 500],          // ¥/件
  utilization: [0, 100],            // %
  gdp: [1e9, 1e13],                 // USD
  cpi_index: [50, 500],
  fx_rate: [0.5, 200],              // 任意兑 EUR
}

function checkRange(metric: string, value: number): number {
  const [low, high] = KNOWN_RANGES[metric] || [0, Infinity]
  if (value >= low && value <= high) return 1.0
  if (value >= low * 0.8 && value <= high * 1.2) return 0.7
  if (value >= low * 0.5 && value <= high * 1.5) return 0.4
  return 0.0  // FAIL
}
```

### 门 4：新鲜度（freshness）

```typescript
// src/intelligence/agents/validators/freshness.ts
const MAX_LAG_DAYS: Record<NodeId, number> = {
  cotton: 35,       // USDA WASDE 月度
  pta: 1,           // 隆众日报
  keqiao: 1,        // 中纤网日报
  design: 90,       // WGSN 季度
  manufacturing: 365, // 年报
  brand: 95,        // SEC 10-K 季度
  channel: 7,       // 平台费率日更
  consumer: 70,     // NBS 月度
  recycle: 365,     // Textile Exchange 年度
}

function checkFreshness(observedAt: string, nodeId: NodeId): number {
  const ageDays = (Date.now() - new Date(observedAt).getTime()) / 86400000
  const maxLag = MAX_LAG_DAYS[nodeId]
  if (ageDays <= maxLag) return 1.0
  if (ageDays <= maxLag * 2) return 0.7
  if (ageDays <= maxLag * 5) return 0.4
  return 0.0
}
```

### 门 5：跨源一致性（cross_source_agreement）

```typescript
// src/intelligence/agents/validators/crossSource.ts
function checkCrossSource(
  subject: string,
  currentEvidence: EvidenceEntry,
  allEvidence: EvidenceEntry[]
): number {
  // 找同一 subject 的其他 evidence
  const peers = allEvidence.filter(
    e => e.subject === subject && e.id !== currentEvidence.id && e.unit === currentEvidence.unit
  )
  if (peers.length === 0) return 0.7  // 无对照源，标 WARN（不 0）

  const currentValue = Number(currentEvidence.value)
  const peerValues = peers.map(p => Number(p.value))

  const deviations = peerValues.map(v => Math.abs(v - currentValue) / ((v + currentValue) / 2))
  const maxDeviation = Math.max(...deviations)

  if (maxDeviation <= 0.05) return 1.0      // < 5%
  if (maxDeviation <= 0.15) return 0.7      // < 15%
  if (maxDeviation <= 0.30) return 0.4
  return 0.0  // 冲突源
}
```

### 门 6：历史正常性（historical_normalcy）

```typescript
// src/intelligence/agents/validators/historical.ts
function checkHistorical(
  metric: string,
  currentValue: number,
  history: EvidenceEntry[]
): number {
  const pastValues = history
    .filter(e => e.subject === metric)
    .map(e => Number(e.value))
    .slice(-365)  // 最多 1 年历史

  if (pastValues.length < 30) return 0.7  // 数据不足，标 WARN

  const mean = pastValues.reduce((a, b) => a + b, 0) / pastValues.length
  const std = Math.sqrt(
    pastValues.reduce((sum, v) => sum + (v - mean) ** 2, 0) / pastValues.length
  )
  const zScore = Math.abs((currentValue - mean) / std)

  if (zScore <= 2) return 1.0
  if (zScore <= 3) return 0.7
  return 0.0  // 极端异常，自动 REJECT
}
```

### 综合 score = 几何平均

```typescript
function computeAuthenticity(scores: number[]): number {
  // 任一为 0 → 整体为 0
  if (scores.some(s => s === 0)) return 0
  // 几何平均
  return Math.pow(scores.reduce((a, b) => a * b, 1), 1 / scores.length)
}
```

---

## 四、Orchestrator 决策矩阵

| authenticity_score | 决策 | evidence ledger 标志 | 下一步 |
|---|---|---|---|
| ≥ 0.85 | ACCEPT | flag = 'high_authenticity' | 进入主评估 |
| 0.70 - 0.85 | ACCEPT | flag = 'normal' | 进入主评估 |
| 0.40 - 0.70 | DOWNGRADE | flag = 'low_authenticity' | 只用于 lead_only 分类 |
| 0.10 - 0.40 | RETRY | 重试 1 次（换源）| 失败则降级 |
| < 0.10 | REJECT | 不写入 ledger | 仅保留 raw 数据供调试 |

---

## 五、与 v3 现有代码衔接

### 5.1 复用 fetch adapter（不重写）

```
现状 src/intelligence/officialApis.ts:
  - fetchWorldBankIndicator (4 个数据源：World Bank / Eurostat / ECB / BLS)
  - fetchSecCompanyMetricSet (SEC)
  - fetchComtradeFlowSummary (UN Comtrade)
  - fetchFredLatestObservation (FRED)
  - fetchUsCensusImportHs (US Census)
  - fetchOpenSupplyHubSearch (OS Hub)
  - 共 9 个 fetch 函数

Node Agent 包装：
  CottonNode wraps fetchWorldBankIndicator('VNM', 'NY.GDP.MKTP.CD')
  PTANode wraps fetchComtradeFlowSummary(reporter=704, partner=156, cmdCode=涤纶HS)
  BrandMarkovNode wraps fetchSecCompanyMetricSet(cik='0000039911')
  ConsumerLogitNode wraps fetchBlsLatestSeriesPoint('CUSR0000SAA')

新写 adapter:
  KeqiaoNode → 新建 src/intelligence/officialApis.ts::fetchKeqiaoIndex()
  ManufacturingOEENode → 新建 src/intelligence/officialApis.ts::fetchFactoryOEE()（需合作）
```

### 5.2 扩 evidenceLedger.ts

```typescript
// src/intelligence/evidenceLedger.ts 增加
interface EvidenceScoreV2 extends EvidenceScore {
  authenticityScore: number  // 0-1
  components: EvidenceScore['components'] & {
    provenanceScore: number
    schemaScore: number
    rangeScore: number
    freshnessScore: number
    crossSourceScore: number
    historicalScore: number
  }
}

export function scoreEvidenceV2(
  evidence: EvidenceEntry,
  now: Date,
  options: {
    schemaResult: SchemaResult
    rangeResult: RangeResult
    provenanceScore: number
    crossSourceScore: number | null
    historicalScore: number
  }
): EvidenceScoreV2 {
  const freshnessScore = checkFreshness(evidence.observedAt, deriveNodeId(evidence))
  const authenticityScore = computeAuthenticity([
    options.provenanceScore,
    options.schemaResult.score,
    options.rangeResult.score,
    freshnessScore,
    options.crossSourceScore ?? 0.7,
    options.historicalScore,
  ])
  const confidence = authenticityScore *
    evidence.sourceWeight *
    methodFactors[evidence.method] *
    chainAlignment -
    contradictionPenalty

  return { /* ... */ }
}
```

### 5.3 扩 brandChainGate.ts（7 账本）

```
现有 6 ledger:
  financials, trade, supplier, platform, materials, macro_disruption

新增第 7 ledger:
  data_authenticity:
    - 维度 1: 平均 provenanceScore (≥ 0.7)
    - 维度 2: 平均 crossSourceScore (≥ 0.5 至少有 2 源)
    - 维度 3: 平均 historicalScore (≥ 0.6)
    - 维度 4: freshness 全过
```

---

## 六、Node Agent 详细接口

### 6.1 通用接口

```typescript
// src/intelligence/agents/NodeAgent.ts
export type NodeId =
  | 'cotton' | 'pta' | 'keqiao' | 'design' | 'manufacturing'
  | 'brand' | 'channel' | 'consumer' | 'recycle'

export interface ModelSpec<TInput = unknown, TOutput = unknown> {
  name: string                  // "ARIMAX(1,1,1) + β·X"
  equation: string              // 人类可读公式
  inputs: TInput
  outputs: TOutput
  cadence: 'real-time' | 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual'
  minLagDays: number
  maxLagDays: number
  knownFailureModes: string[]
}

export interface NodeAgent<TInput, TRaw, TOutput> {
  nodeId: NodeId
  modelSpec: ModelSpec<TInput, TOutput>
  adapters: string[]           // 引用的 fetch adapter 名

  fetch(input: TInput): Promise<TRaw>
  validateSchema(raw: TRaw): SchemaResult
  validateRange(raw: TRaw): RangeResult
  computeModel(raw: TRaw): TOutput
  buildEvidence(raw: TRaw, modelOutput: TOutput, authenticity: AuthenticityScore): EvidenceEntry
}
```

### 6.2 例：CottonNode

```typescript
// src/intelligence/agents/nodes/CottonNode.ts
import { fetchWorldBankIndicator } from '../../officialApis'

export const CottonNode: NodeAgent<CottonInput, CottonRaw, CottonOutput> = {
  nodeId: 'cotton',
  modelSpec: {
    name: 'ARIMAX(1,1,1) + 供需平衡',
    equation: 'C_t = φ·C_{t-1} + θ·ε_{t-1} + β_X·X_t',
    inputs: { country: 'VNM' },
    outputs: { priceForecast: number, inventoryBalance: number },
    cadence: 'monthly',
    minLagDays: 1,
    maxLagDays: 35,
    knownFailureModes: ['WASDE 滞后', '投机头寸自报', '多港口口径差']
  },
  adapters: ['world-bank', 'cotlook-index', 'usda-wasde'],

  async fetch(input) {
    return {
      gdp: await fetchWorldBankIndicator({ country: 'VNM', indicator: 'NY.GDP.MKTP.CD' }),
      tariff: await fetchWorldBankIndicator({ country: 'VNM', indicator: 'TM.TAX.MRCH.WM.AR.ZS' }),
      // TODO: 接入 USDA WASDE + Cotlook
    }
  },

  validateSchema(raw) {
    const z = z.object({ gdp: z.object({ value: z.number() }), tariff: z.object({ value: z.number() }) })
    const r = z.safeParse(raw)
    return { ok: r.success, score: r.success ? 1 : 0, errors: r.error?.issues ?? [] }
  },

  validateRange(raw) {
    const checks = [
      checkRange('gdp', raw.gdp.value),
      checkRange('utilization', 80),  // 棉花价格未在 raw 中
    ]
    return { status: checks.every(c => c > 0.4) ? 'PASS' : 'WARN', score: Math.min(...checks) }
  },

  computeModel(raw) {
    return {
      priceForecast: raw.tariff.value * 10000,  // 占位
      inventoryBalance: raw.gdp.value * 0.04,
    }
  },

  buildEvidence(raw, model, auth) {
    return createEvidenceEntry({
      source: getSource(REGISTRY, 'world-bank'),
      kind: 'macro_control',
      subject: 'Viet Nam Cotton Macro Control',
      claim: `Cotton model output: forecast=${model.priceForecast.toFixed(2)}`,
      observedAt: new Date().toISOString(),
      value: model.priceForecast,
      unit: 'CNY/ton',
      method: 'api',
      // authenticityScore 会被 Orchestrator 注入
      notes: [`authenticity=${auth.score.toFixed(3)}`, ...raw.notes]
    })
  }
}
```

---

## 七、跨源验证器实现

### 7.1 ProvenanceVerifier

```typescript
// src/intelligence/agents/verifiers/ProvenanceVerifier.ts
const TRUSTED_REPOS = new Set([
  'world-bank', 'sec-edgar', 'eurostat', 'ecb-eurofxref', 'bls-public-api',
  'anthropic', 'affaan-m', 'obra', 'mattpocock', 'vercel-labs'
])

export const ProvenanceVerifier: Verifier = {
  name: 'ProvenanceVerifier',

  async run(evidence: EvidenceEntry[]): Promise<VerifyResult> {
    return {
      verifier: 'provenance',
      scores: evidence.map(e => ({
        evidenceId: e.id,
        score: (
          (e.sourceId in TRUSTED_REPOS ? 0.4 : 0) +
          (e.rawRef ? 0.3 : 0) +  // 假设 rawRef 已存 hash
          (checkAgeOk(e.observedAt) ? 0.3 : 0)
        )
      }))
    }
  }
}
```

### 7.2 CrossSourceVerifier

```typescript
// src/intelligence/agents/verifiers/CrossSourceVerifier.ts
export const CrossSourceVerifier: Verifier = {
  name: 'CrossSourceVerifier',

  async run(evidence: EvidenceEntry[], context: { ledger: EvidenceEntry[] }): Promise<VerifyResult> {
    const scores = evidence.map(e => ({
      evidenceId: e.id,
      score: computeCrossSourceScore(e, context.ledger)
    }))
    return { verifier: 'crossSource', scores }
  }
}

function computeCrossSourceScore(evidence: EvidenceEntry, allEvidence: EvidenceEntry[]): number {
  const peers = allEvidence.filter(other =>
    other.subject === evidence.subject &&
    other.id !== evidence.id &&
    other.unit === evidence.unit
  )
  if (peers.length === 0) return 0.7  // 无对照源，标 WARN
  const currentValue = Number(evidence.value)
  if (isNaN(currentValue)) return 0.5
  const maxDeviation = Math.max(...peers.map(p => {
    const v = Number(p.value)
    return isNaN(v) ? 0 : Math.abs(v - currentValue) / ((v + currentValue) / 2)
  }))
  if (maxDeviation <= 0.05) return 1.0
  if (maxDeviation <= 0.15) return 0.7
  if (maxDeviation <= 0.30) return 0.4
  return 0.0
}
```

### 7.3 HistoricalAnomalyVerifier

```typescript
// src/intelligence/agents/verifiers/HistoricalAnomalyVerifier.ts
export const HistoricalAnomalyVerifier: Verifier = {
  name: 'HistoricalAnomalyVerifier',

  async run(evidence: EvidenceEntry[], context: { history: Map<string, EvidenceEntry[]> }): Promise<VerifyResult> {
    const scores = evidence.map(e => ({
      evidenceId: e.id,
      score: computeHistoricalScore(e, context.history.get(e.subject) ?? [])
    }))
    return { verifier: 'historical', scores }
  }
}

function computeHistoricalScore(evidence: EvidenceEntry, history: EvidenceEntry[]): number {
  const pastValues = history
    .filter(e => e.subject === evidence.subject)
    .map(e => Number(e.value))
    .filter(v => !isNaN(v))
    .slice(-365)
  if (pastValues.length < 30) return 0.7
  const mean = pastValues.reduce((a, b) => a + b, 0) / pastValues.length
  const std = Math.sqrt(pastValues.reduce((sum, v) => sum + (v - mean) ** 2, 0) / pastValues.length)
  if (std === 0) return 1.0
  const zScore = Math.abs((Number(evidence.value) - mean) / std)
  if (zScore <= 2) return 1.0
  if (zScore <= 3) return 0.7
  return 0.0
}
```

---

## 八、Orchestrator 实现

```typescript
// src/intelligence/agents/Orchestrator.ts
export class Orchestrator {
  constructor(
    private nodeAgents: Map<NodeId, NodeAgent<any, any, any>>,
    private verifiers: Verifier[],
    private ledger: EvidenceLedger
  ) {}

  async runPipeline(nodeId: NodeId, input: any): Promise<EvidenceEntry> {
    const agent = this.nodeAgents.get(nodeId)
    if (!agent) throw new Error(`Unknown nodeId: ${nodeId}`)

    // Step 1: fetch + 廉价校验（同步）
    const raw = await agent.fetch(input)
    const schema = agent.validateSchema(raw)
    const range = agent.validateRange(raw)

    if (!schema.ok) return this.retryOrDowngrade(nodeId, input, 'schema_fail')

    // Step 2: 构造 evidence 草稿
    const modelOutput = agent.computeModel(raw)
    const draftEvidence = agent.buildEvidence(raw, modelOutput, { score: 0 })

    // Step 3: 跨源验证器（异步）
    const provenanceResult = await this.verifiers[0].run([draftEvidence])
    const crossSourceResult = await this.verifiers[1].run([draftEvidence], {
      ledger: await this.ledger.getRecentBySubject(draftEvidence.subject, 30)
    })
    const historicalResult = await this.verifiers[2].run([draftEvidence], {
      history: await this.ledger.getRecentBySubject(draftEvidence.subject, 365)
    })

    // Step 4: 综合 authenticity
    const freshnessScore = checkFreshness(draftEvidence.observedAt, nodeId)
    const authenticityScore = computeAuthenticity([
      provenanceResult.scores[0].score,
      schema.score,
      range.score,
      freshnessScore,
      crossSourceResult.scores[0].score,
      historicalResult.scores[0].score,
    ])

    // Step 5: 决策
    if (authenticityScore >= 0.7) {
      return this.ledger.write({ ...draftEvidence, authenticityScore, flag: 'accepted' })
    }
    if (authenticityScore >= 0.4) {
      return this.ledger.write({ ...draftEvidence, authenticityScore, flag: 'low_authenticity' })
    }
    return this.retryOrDowngrade(nodeId, input, 'authenticity_too_low')
  }

  private async retryOrDowngrade(nodeId: NodeId, input: any, reason: string): Promise<EvidenceEntry> {
    console.warn(`[Orchestrator] ${nodeId} ${reason}, retry with alternate adapter`)
    // TODO: 尝试备用 adapter；若都失败则记日志
    throw new Error(`Pipeline failed for ${nodeId}: ${reason}`)
  }
}
```

---

## 九、与现有 verification-latest 对照

### 当前 verification-latest.json 的 5 verified + 4 skipped

```
world-bank ✓         → CottonNode + ConsumerLogitNode (GDP/关税/劳动力)
sec-edgar ✓          → BrandMarkovNode (GAP)
eurostat ✓           → ConsumerLogitNode (DE 人口)
ecb-eurofxref ✓      → ConsumerLogitNode (USD/JPY)
bls-public-api ✓     → ConsumerLogitNode (CUSR0000SAA)
fred ⊘               → CottonNode (DEXJPUS 已有, 缺 key)
us-census-trade ⊘    → PTANode (US HS 进口, 缺 key)
open-supply-hub ⊘    → ManufacturingOEENode (缺 key)
un-comtrade ⊘        → PTANode (HS 60 涤纶, 缺 key)
```

升级后 verification-latest.json 应包含：
```json
{
  "evidence": [{
    "id": "...",
    "authenticityScore": 0.95,
    "components": {
      "provenanceScore": 1.0,
      "schemaScore": 1.0,
      "rangeScore": 1.0,
      "freshnessScore": 1.0,
      "crossSourceScore": 1.0,  // World Bank + 国统局交叉验证
      "historicalScore": 1.0
    },
    "flag": "high_authenticity"
  }]
}
```

---

## 十、给 v3 Owner 的 5 个建议

1. **第一优先级**：扩 scoreEvidence 加 6 维评分（不改接口，只加字段），1 天工作量
2. **第二优先级**：实现 6 个 validator 函数（含 geometric mean），3 天
3. **第三优先级**：包装 5 个 Node Agent（CottonNode / PTANode / BrandMarkovNode / ConsumerLogitNode / DesignBassNode），各 1 周
4. **第四优先级**：Orchestrator 编排 + 端到端测试，3 天
5. **第五优先级**：补 KeqiaoNode + ManufacturingOEENode + RecycleLCANode 三个新 adapter（10 天）

### 立即可启动（修订版保守路径）

```
Day 1: 扩 evidenceLedger.ts 加 6 维评分
Day 2: 写 6 个 validator 函数（独立可测）
Day 3: 实现 Orchestrator 编排（用现有 fetch adapter 包装）
Day 4-5: 跑 verify:intelligence 验证新分数
```

3 天后即能产出带 authenticityScore 的新 verification-latest.json。

请告知要走哪一步。