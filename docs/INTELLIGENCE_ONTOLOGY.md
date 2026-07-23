# Intelligence System Domain Ontology

> **Scope**: `src/intelligence/` — the multi-agent supply-chain intelligence engine.
> **Last updated**: 2026-07-09 (post-superpowers v5.1.0 fusion)

---

## 0. Reading Guide

This document is the canonical type/domain reference for the intelligence module.
It is organised by subsystem, from the most foundational types outward.

- **§1 Core Primitives** — sources, evidence, scoring
- **§2 Industry Pack** — industry-agnostic extensibility ontology
- **§3 Pipeline Spine** — 9-stage pipeline types (probe → trigger → swarm → … → feedback)
- **§4 Validation** — 6 authenticity gates
- **§5 Reconciliation** — buyer-seller transaction matching (10 dimensions)
- **§6 Neural Memory** — 4-layer memory architecture
- **§7 Analysis Engines** — estimation, propagation, resonance, attribution
- **§8 Synthesis** — brief aggregation
- **§9 Superpowers Patterns** — 15 architectural pattern modules
- **§10 Cross-Cutting Conventions** — naming, extension, import patterns

A **dependency diagram** and a **type index** appear at the end.

---

## 1. Core Primitives (`types.ts`)

The root-level types that everything else builds upon.

### 1.1 Source Ontology

```
SourceTier  = "S" | "A+" | "A" | "B" | "C"
SourceType  = official_api | authorized_platform_api | internal_operational_system |
              open_supply_chain_database | compliance_research_database |
              official_research_and_statistics | official_trade_research |
              consulting_report                              (8 variants)
```

| Interface | Key Fields | Purpose |
|-----------|------------|---------|
| `IntelligenceSource` | id, name, tier, sourceWeight, trust_weight, latency_score, reliability_score, coverage_domain, type, coverage[], officialUrl, requiresAuth, refreshCadence, evidenceUse[], crossChecks[], knownFailureModes? | A registered data source in the registry |
| `SourceRegistry` | version, purpose, tiers: Record<SourceTier, SourceTierDefinition>, sources[], minimumConclusionGate | The full source catalogue |
| `SourceTierDefinition` | weight, trustWeight, description | Tier metadata |

### 1.2 Evidence Ontology

```
EvidenceKind = financial_primary | trade_flow_primary | macro_control |
               platform_sales_primary | supplier_identity | compliance_risk |
               material_quantity | market_signal | research_context |
               pipeline_health                                    (10 variants)
```

| Interface | Key Fields | Purpose |
|-----------|------------|---------|
| **`EvidenceEntry`** | id, sourceId, sourceTier, sourceWeight, kind, subject, claim, observedAt, period, geography, unit, value, method, url, rawRef, conversions[], crossChecks[], contradictions[], notes? | The central evidence record — every data point flows through this |
| `EvidenceScore` | confidence, components{sourceWeight, recencyFactor, methodFactor, chainAlignment, contradictionPenalty}, classification | Computed trustworthiness of an evidence entry |
| `ConclusionGateResult` | — | Gate result for drawing conclusions |

### 1.3 Evidence Graph (`evidence-types.ts`)

```
EvidenceNodeType = "SourceNode" | "DataPointNode" | "EntityNode" | "IndicatorNode"
EvidenceEdgeType = "derived_from" | "describes" | "supports" | "contradicts"
AdapterHealthStatus, SourceResultStatus (12 variants)
ConflictType, ConflictSeverity, ConflictResolution
VisualizationReadinessStatus
```

| Interface | Key Fields |
|-----------|------------|
| `EvidenceGraph` | nodes: EvidenceNode[], edges: EvidenceEdge[], summary: EvidenceSummary |
| `EvidenceNode` | type, label, properties, authenticity?: AuthenticityResult |
| `EvidenceEdge` | type, source, target, weight |
| `AdapterHealth` | status, validation: AdapterHealthValidation |
| `ConflictReport` | type, severity, resolution, entries[] |
| `ConfidenceResult` | score, breakdown: ConfidenceBreakdown |

---

## 2. Industry Pack (`core/industry-pack.ts`)

The **industry-agnostic extensibility core**. Each industry (apparel, electronics, etc.)
fills in a supply-chain ontology. The `apparelPack` instance lives in
`analysis/industryPacks/apparel/`.

### 2.1 Master Interface

```
IndustryPack
├── industryId: string
├── displayName: string
│
├── knownRanges: Record<string, Range>            ← subject → {min, max, unit}
├── freshnessMaxAgeDays: Record<string, number>   ← per-node freshness budget
├── defaultFreshnessMaxAgeDays: number
├── trustedSourceIds?: Set<string>
├── evidenceSchema?: ZodTypeAny                   ← optional runtime validation
│
├── nodes: SupplyChainNode[]                      ← supply chain topology
│   └── SupplyChainNode extends IndustryNode
│       ├── nodeId, label, position (upstream/midstream/downstream/retail)
│       ├── metrics: Record<string, string>
│       ├── geography?: GeographySpec            (producerCountries, consumerCountries)
│       ├── capacity?: CapacitySpec              (utilizationMetric, bottleneckThreshold)
│       ├── costFactors?: CostFactorSpec         (labor, energy, logistics)
│       ├── inventory?: InventorySpec            (inventoryMetric, safetyStockThreshold)
│       ├── demand?: DemandSpec                  (demandMetric, elasticity)
│       ├── risk?: RiskSpec                      (riskType, riskMetric, riskThreshold, impactCoefficient)
│       └── substitution?: SubstitutionSpec     (substituteMetric, crossElasticity)
│
├── transmissionPaths?: TransmissionPath[]         ← causal transmission edges
│   └── { from, to, coefficient, description, lagDays }
│
├── supplyLanes?: SupplyLane[]                    ← cross-country supply relations
│   └── { from: SupplyLaneEndpoint, to: SupplyLaneEndpoint, freightCost, tariffRate, leadTimeDays, volume }
│
├── crossDimensionRules?: CrossDimensionRule[]    ← cross-dimension causal mapping
│   └── { causePattern: RegExp, effectPattern, causeKeyPrefix, effectKeyPrefix,
│          causeDirection, effectDirection, weight }
│
├── capitalFlows?: CapitalFlow[]                  ← financial flows between nodes
│   └── { from, to, flowType: "loan"|"tax_refund"|"tax_payment"|"payment"|"investment", metric, coefficient }
│
├── workforceFlows?: WorkforceFlow[]              ← labour flows
│   └── { nodeId, role, headcountMetric, wageMetric, productivityMetric }
│
├── businessDimensions?: BusinessDimension[]      ← per-node business metrics
│   └── { nodeId, taxMetric, complianceMetric, managementMetric, customerCompositionMetric, supplierDependencyMetric }
│
└── informationFlows?: InformationFlow[]           ← trend propagation
    └── { sourceType, buzzMetric, validationMetric, supplyResponseMetric,
          lifecycleStageMetric, velocityMetric, saturationMetric }
```

### 2.2 Supporting Types

| Type | Fields |
|------|--------|
| `Range` | min, max, unit |
| `IndustryNode` | nodeId, label, position, metrics |
| `TransmissionPath` | from, to, coefficient, description, lagDays |
| `SupplyLaneEndpoint` | country, node |
| `CrossDimensionRule` | causePattern: RegExp, effectPattern, causeKeyPrefix, effectKeyPrefix, causeDirection, effectDirection, weight |
| `FreshnessConfig` | maxAgeDays, defaultMaxAgeDays |

### 2.3 Constants

| Constant | Value |
|----------|-------|
| `DEFAULT_FRESHNESS_MAX_AGE_DAYS` | 30 |
| `GENERIC_FRESHNESS_CONFIG` | { maxAgeDays: 30, defaultMaxAgeDays: 30 } |

---

## 3. Pipeline Spine (`spine/types.ts`)

The backbone: 9 pipeline stages from probe to feedback.

```
Probe → Trigger → Swarm(6 agents) → Information → Verification
    → Analysis → Synthesis → Memory → Feedback
```

### 3.1 Probe Stage

| Type | Key Fields |
|------|------------|
| `ProbeKind` | `"schedule" \| "event" \| "threshold"` |
| `Probe` | id, name, kind, sourceId, scheduleCron?, params, enabled |
| `ProbeRun` | probeId, executedAt, signals: ProbeSignal[] |
| `ProbeSignal` | signalId, subject, value, unit, observedAt, geography? |

### 3.2 Trigger Stage

| Type | Key Fields |
|------|------------|
| `TriggerContext` | ledger: EvidenceEntry[], now: Date |
| `TriggerRule` | evaluate(ctx) → { shouldFire: boolean, reason: string } |
| `SwarmTrigger` | id, ruleId, signalId, firedAt, objective: string, pack?: IndustryPack |

### 3.3 Swarm Stage — Agents

#### AgentRole (6 roles)

```
AgentRole = "scout" | "collector" | "verifier" | "analyst" | "synthesizer" | "memory"
```

Pipeline order: `scout → collector → verifier → analyst → synthesizer → memory`

#### AgentStatus (four-state protocol, pattern 6)

```
AgentStatus = "completed" | "failed" | "done_with_concerns" | "needs_context" | "blocked"
```

| Status | Meaning | Orchestrator action |
|--------|---------|---------------------|
| `completed` | Execution succeeded, enter review | proceed |
| `failed` | Unrecoverable failure | abort (unless memory) |
| `done_with_concerns` | Completed with observations | record concerns, proceed |
| `needs_context` | Missing context, retryable | retry_with_context (≤ maxRetries) |
| `blocked` | Cannot complete | escalation ladder |

#### AgentRoleProfile — the convergence point of ~13 patterns

```typescript
interface AgentRoleProfile {
  // === Identity ===
  role: AgentRole
  identity: string                    // one-line description
  boundaries: string[]                // what this role must NOT do

  // === Contract (patterns 1/2) ===
  permittedInputs: string[]
  permittedOutputs: string[]
  memoryAccess?: MemoryAccessDeclaration
  knowledgeBase?: string[]
  outputSchema?: ZodTypeAny           // runtime validation
  reasoningEffort?: "high" | "max"
  toolset?: AgentToolDeclaration[]

  // === Superpowers fusion fields ===
  modelTier?: "fast" | "standard" | "capable"     // pattern 5: model selection
  skillType?: "rigid" | "flexible"                // pattern 1: freedom classification
  antiRationalizations?: AntiRationalizationEntry[] // pattern 8: excuse → rebuttal
  redFlags?: string[]                             // pattern 8: stop signals
  verificationChecklist?: string[]                // pattern 13: pre-completion checks
}
```

#### Model tier assignment

| Role | modelTier | skillType | Rationale |
|------|-----------|-----------|-----------|
| scout | fast | flexible | Source matching is mechanical but may adapt |
| collector | fast | rigid | Strict evidence extraction, no deviation |
| verifier | standard | rigid | 6 gates must never be skipped |
| analyst | capable | flexible | Causal reasoning requires highest capability |
| synthesizer | standard | flexible | Aggregation with judgment |
| memory | fast | rigid | Mechanical persistence, strict protocol |

#### SwarmWorkflow

```typescript
interface SwarmWorkflow {
  id: string
  name: string
  steps: AgentRole[]                 // execution order
  enableReview?: boolean             // pattern 4: two-phase review (default true)
  enableVerificationGate?: boolean   // pattern 13: verification gate (default true)
  maxRetries?: number                // pattern 6: retry budget (default 2)
}
```

#### AgentRunResult — unified return type

```typescript
interface AgentRunResult {
  taskId: string
  role: AgentRole
  status: AgentStatus

  // --- Role-specific outputs ---
  candidateSourceIds?: string[]      // scout
  evidence?: EvidenceEntry           // collector (first, backward-compat)
  evidenceList?: EvidenceEntry[]     // collector (all)
  authenticity?: AuthenticityResult  // verifier
  finding?: AnalysisFinding          // analyst
  synthesis?: SynthesisOutput        // synthesizer
  memoryEntry?: MemoryEntry          // memory
  followUp?: FollowUpTask[]          // memory / feedback

  error?: string

  // --- Superpowers fusion fields (pattern 4/6/13) ---
  selfReview?: AgentSelfReview       // four-dimension self-check
  reviewResult?: ReviewResult        // two-phase review output
  verificationEvidence?: VerificationEvidence  // fresh verification evidence
  concerns?: string[]                // done_with_concerns
  missingContext?: string[]          // needs_context
  blockerReason?: string             // blocked
}
```

#### EscalationAction (discriminated union, pattern 6)

```
{ type: "provide_context", context: Record<string, unknown> }
{ type: "escalate_model", fromTier: string, toTier: string }
{ type: "split_task", subObjectives: string[] }
{ type: "escalate_human", reason: string }
```

Escalation ladder order: `provide_context → escalate_model → split_task → escalate_human`

#### Superpowers review types

| Type | Fields |
|------|--------|
| `AgentSelfReview` | completeness, quality, discipline, verifiability (each `"pass" \| "fail"`), issues? |
| `ReviewResult` | specCompliance: ReviewPhase, quality?: ReviewPhase |
| `ReviewPhase` | status: `"approved" \| "issues_found"`, issues?: ReviewIssue[], summary |
| `ReviewIssue` | severity: `"critical" \| "important" \| "minor"`, location, description, why, suggestion |
| `VerificationEvidence` | method, checkId, output, passed, verifiedAt |
| `AntiRationalizationEntry` | excuse, rebuttal |

### 3.4 Information Stage

| Type | Key Fields |
|------|------------|
| `RawRecord` | id, sourceId, fetchedAt, raw, contentType? |
| `ExtractedFact` | id, rawRecordId, subject, claim, value?, unit?, period?, geography? |

### 3.5 Analysis Stage

| Type | Key Fields |
|------|------------|
| `AnalysisFinding` | id, taskId, evidenceIds[], summary, confidence: number, signals: string[] |

### 3.6 Synthesis Stage

| Type | Key Fields |
|------|------------|
| `SynthesisOutput` | id, triggerId, title, brief, findings: AnalysisFinding[], evidenceIds[], confidence, generatedAt, chainEstimate?: ChainHealth |

### 3.7 Memory Stage

| Type | Key Fields |
|------|------------|
| `MemoryEntry` | id, key, kind: `"finding" \| "synthesis" \| "signal" \| "fact"`, value, sourceTaskId?, createdAt, tags? |
| `FollowUpTask` | id, originTaskId, kind: `"probe" \| "task"`, objective, rationale |

---

## 4. Validation (`validation/types.ts`)

### 4.1 Six Authenticity Gates

```
ValidationGateName = "provenance" | "schema_match" | "range_plausibility" |
                     "freshness" | "cross_source" | "historical"
```

| Gate | Checks | Industry-agnostic? |
|------|--------|--------------------|
| provenance | Source tier, trust weight, method | Yes |
| schema_match | Required fields present, types correct | Yes |
| range_plausibility | Value within knownRanges | No — reads from IndustryPack |
| freshness | observedAt within freshnessMaxAgeDays | No — reads from IndustryPack |
| cross_source | Agreement with other sources | Yes |
| historical | Consistency with past observations | Yes |

### 4.2 Result Types

```
AuthenticityFlag = "verified" | "degraded" | "rejected"
```

| Type | Key Fields |
|------|------------|
| `ValidationGateResult` | gate, pass, score, blocking, reasons[], affectedDataPointIds[] |
| `AuthenticityResult` | authenticityScore, flag, gateResults: ValidationGateResult[6], blockingReasons[], checkedAt |
| `AnnotatedEvidence` | `EvidenceEntry & { authenticity: AuthenticityResult }` ← non-destructive extension |

---

## 5. Reconciliation (`reconciliation/types.ts`)

Buyer-seller transaction matching across 10 dimensions.

### 5.1 Core Enums

```
ReconciliationStatus   = "matched" | "warning" | "mismatch"
ReconciliationDimension = product | quantity | price | delivery | quality |
                          inventory | financial | tax | demand | capacity  (10)
DataTrustLayer          = "factual" | "commitment" | "external" | "subjective"  (4)
CredibilityGrade        = "high" | "acceptable" | "cautious" | "high_risk"
```

### 5.2 Transaction Document Chain

```
TransactionDocType = inquiry | quote | po | so | work_order | batch |
                     shipment | receipt | invoice | payment           (10)

TransactionDocument
├── docId, docType, party: TransactionParty, timestamp
├── inquiryId → quoteId → poId → soId → workOrderId → batchId
│   → shipmentId → receiptId → invoiceId → paymentId    (full ID chain)
├── buyerId, sellerId, productId, styleId?, sku?
├── quantity?, unit?
├── prices: { quote?, po?, contract?, invoice?, payment? }
├── delivery: { promisedDate?, actualDate?, shippedDate? }
└── [key: string]: unknown    ← index signature for extension
```

### 5.3 Generic Reconciliation Container

```typescript
interface ReconciliationResult<T = Record<string, unknown>> {
  id: string
  dimension: ReconciliationDimension
  transactionRef: Partial<Pick<TransactionDocument, "poId" | "soId" | "quoteId" | "invoiceId" | "shipmentId">>
  status: ReconciliationStatus       // worst of all field variances
  variances: VarianceDetail[]
  data: T                             // dimension-specific
  reconciledAt: string
  trustLayer?: DataTrustLayer
  confidence?: number                 // adjusted by data-trust weighting
}
```

10 dimension data types plug into `T`:

| Dimension | Data Interface | Key Fields |
|-----------|---------------|------------|
| product | `ProductReconciliationData` | styleIdMatch, skuMatch |
| quantity | `QuantityReconciliationData` | poQuantity, soQuantity, productionQuantity, shippedQuantity, receivedQuantity, varianceRate |
| price | `PriceReconciliationData` | costBreakdown?: PriceCostBreakdown |
| delivery | `DeliveryReconciliationData` | promisedDate, actualDate, delayDays |
| quality | `QualityReconciliationData` | factoryPassRate, defectRate |
| inventory | `InventoryReconciliationData` | buyerInventory, sellerInventory |
| financial | `FinancialReconciliationData` | invoiceAmount, paidAmount |
| tax | `TaxReconciliationData` | declaredAmount, actualAmount |
| demand | `DemandReconciliationData` | forecastQuantity, actualQuantity |
| capacity | `CapacityReconciliationData` | utilizedCapacity, totalCapacity, utilizationRate |

### 5.4 Price Cost Breakdown

```
PriceCostBreakdown
├── fabric, accessories, wasteAllowance
├── labor, manufacturingOverhead
├── packaging, logistics, tax
├── profit, totalEstimated
├── varianceRate
└── warnings: string[]
```

### 5.5 Anomaly Tracking

```
AnomalyType   = quantity | price | delivery | quality | inventory |
                payment | tax | logistics | compliance           (9)
AnomalyStatus = detected | evidence_collected | attributed | resolved | closed  (5)
ResponsibleParty = buyer | seller | shared | designer | third_party | unattributed
```

| Type | Key Fields |
|------|------------|
| `Anomaly` | id, type, orderId, description, status, responsibleParty?, evidenceIds[], financialImpact?, detectedAt, resolvedAt?, resolution?, scoreImpact? |

### 5.6 Aggregates

| Type | Key Fields |
|------|------------|
| `ReconciliationSummary` | totalItems, matchedCount, warningCount, mismatchCount, mismatchRate, dimensions, activeAnomalies, healthScore |
| `BuyerSellerDashboard` | buyerView, sellerView, sharedView, reconciliationHealthScore, generatedAt |

---

## 6. Neural Memory (`memory/types.ts`)

### 6.1 Four-Layer Architecture

```
Layer 0: EvidenceLedger    EvidenceEntry[]           — raw evidence store
Layer 1: MemoryStore       MemoryEntry[]             — facts, findings, signals
Layer 2: MemoryAssociation  graph (causal/temporal)  — associative links
Layer 3: ReflexPathway      trigger→action cache     — muscle memory
```

### 6.2 Types

```
AssociationRelation = "supports" | "contradicts" | "causes" | "temporal" | "semantic"
MemoryAccessMode    = "preload" | "query" | "commit"
```

| Type | Key Fields |
|------|------------|
| `MemoryAssociation` | id, fromKey, toKey, relation, weight, createdAt, lastReinforcedAt, coOccurrenceCount, metadata? |
| `ReflexPathway` | id, trigger, action, confidence, hitCount, createdAt, lastTriggeredAt?, tags[], industry? |
| `MemoryAccessDeclaration` | modes: MemoryAccessMode[], writableKinds: MemoryEntry["kind"][], readableLayers: (0\|1\|2\|3)[] |
| `MemoryQueryResult` | layer: 0\|1\|2\|3, key, text, score, matchedOn: ("text"\|"tag"\|"association"\|"reflex")[], raw |
| `CommitResult` | persisted, layersWritten: (0\|1\|2\|3)[], entry?, newAssociations?, newReflex?, reason? |

### 6.3 Broker Types (`memory/broker.ts`)

| Type | Key Fields |
|------|------------|
| `CommitIntent` | kind, key, value, confidence, tags?, relatedKeys?, industry?, reflexTrigger?, reflexAction? |
| `BrokerQuery` | text?, tags?, layers?, limit? |

### 6.4 Constants

| Constant | Value | Purpose |
|----------|-------|---------|
| `COMMIT_CONFIDENCE_THRESHOLD` | 0.6 | Minimum confidence to persist |
| `ASSOCIATION_REINFORCE_STEP` | 0.1 | Weight increment per co-occurrence |
| `REFLEX_EXTRACTION_THRESHOLD` | 3 | Hit count to extract a reflex |

---

## 7. Analysis Engines (`analysis/`)

### 7.1 Chain Estimator (`chain-estimator.ts`)

| Type | Key Fields |
|------|------------|
| `SubjectEstimate` | subject, consensusValue, observedValues[], disagreement, confidence, sourceCount |
| `NodeEstimate` | nodeId, position, subjects: SubjectEstimate[], confidence |

### 7.2 Chain Propagator (`chain-propagator.ts`)

| Type | Key Fields |
|------|------------|
| `NodePropagation` | nodeId, position, observed, expected, deviation, deviationRate, severity, primarySubject, fromPath? |
| `PropagationResult` | nodeResults[], chainDeviation, bottleneckNodeId, coverage, reversePropagation? |
| `ReverseNodePropagation` | nodeId, observed, impliedValue, impliedDeltaPct, deviation, deviationRate |
| `ReversePropagationResult` | anchorNodeId, anchorSubject, anchorValue, nodeResults[], coverage, consistency |

```
Severity = "none" | "low" | "moderate" | "high"
```

### 7.3 Chain Health (`chain-health.ts`)

```
PressureLevel = "normal" | "elevated" | "critical"
```

| Type | Key Fields |
|------|------------|
| `NodePressure` | nodeId, observed, expected, deviation, deviationRate, severity, sourceDisagreement, confidence |
| **`ChainHealth`** | healthScore, pressureLevel, nodePressure[], bottleneckNode, chainDeviation, coverage, riskSignals[], trueValueSummary, reversePropagation?, resonance?, reconciliation? |

`ChainHealth` is the central aggregate written to `SynthesisOutput.chainEstimate`.

### 7.4 Resonance Detector (`resonance-detector.ts`)

```
ResonanceLevel = "none" | "weak" | "moderate" | "strong" | "critical"
```

| Type | Key Fields |
|------|------------|
| `ResonancePattern` | id, level, resonatingNodes[], resonatingSignals[], nodeCount, patternType, recommendedAction, confidence |
| `ResonanceResult` | patterns[], maxLevel, totalResonatingNodes, overallConfidence, hasAlert |

### 7.5 Attribution (`attribution.ts`)

| Type | Key Fields |
|------|------------|
| `AttributionChain` | rootCause, path: string[], symptom, cumulativeWeight, hops, highConfidence, hopWeights? |

| Constant | Value |
|----------|-------|
| `ATTRIBUTION_CONFIDENCE_THRESHOLD` | 0.15 |
| `MAX_ATTRIBUTION_DEPTH` | 10 |

---

## 8. Synthesis (`synthesis/brief.ts`)

| Type | Key Fields |
|------|------------|
| `SynthesisInput` | trigger, findings, evidenceIds, now?, evidence?, pack?, reconciliations?, anomalies? |

The `synthesizeBrief()` function consumes findings + evidence + pack + reconciliations + anomalies
and produces a `SynthesisOutput` with `chainEstimate?: ChainHealth`.

---

## 9. Superpowers Pattern Modules (`swarm/superpowers/`)

12 modules implementing 15 architectural patterns from superpowers v5.1.0.

### 9.1 Pattern → Module Map

| # | Pattern | Module | Key Types |
|---|---------|--------|-----------|
| 1 | Skill auto-invocation + priority type | `contract.ts`, `degrees-of-freedom.ts` | `ContractViolation`, `FreedomLevel` |
| 2 | Instruction priority hierarchy | `priority.ts`, `contract.ts` | `InstructionPriority` (enum), `PriorityResolution` |
| 3 | Controller-subagent isolation | `parallel-dispatch.ts` | `DispatchDecision`, `ParallelDispatchPlan` |
| 4 | Two-stage review | `two-stage-review.ts`, `escalation.ts` | `SpecComplianceReview`, `CodeQualityReview` |
| 5 | Model selection strategy | `profiles.ts` (modelTier) | — |
| 6 | Four-state state machine | `escalation.ts` | `StatusAction`, `EscalationAction` |
| 7 | TDD red-green-refactor | `contract.ts` (verifyCompletion as gate) | — |
| 8 | Anti-rationalization + severity | `contract.ts`, `severity.ts`, `profiles.ts` | `AntiRationalizationEntry`, `SeverityLevel` |
| 9 | Brainstorm hard gate | `cso.ts` | `CSOMetadata` |
| 10 | Plan document structure | `progressive-disclosure.ts` | `DisclosureTier` |
| 11 | Execution gate + stop-ask | `escalation.ts`, `plan-validate-execute.ts` | `PlanValidationResult` |
| 12 | Four-phase systematic debugging | `systematic-debugging.ts` | `DebugPhase`, `DebuggingSession` |
| 13 | Verification gate function | `verification-gate.ts`, `contract.ts` | `VerificationClaim`, `VerificationResult` |
| 14 | Git worktree isolation | (spirit mapping: OrchestratorContext isolation) | — |
| 15 | Branch completion menu | (spirit mapping: SwarmRunResult full report) | — |

### 9.2 Module Details

#### `contract.ts` — Contract Validation (patterns 1/2/8/13)

```typescript
interface ContractViolation {
  dimension: "input" | "output" | "boundary" | "memory"
  severity: "critical" | "warning"
  description: string
  profileField: string
}

// Exports: validateContract, verifyCompletion, checkRedFlags, createVerificationEvidence
```

#### `escalation.ts` — Four-State + Escalation (patterns 4/6/11/12)

```typescript
type StatusAction =
  | { action: "proceed" }
  | { action: "retry_with_context"; context: Record<string, unknown> }
  | { action: "escalate"; escalation: EscalationAction }
  | { action: "record_concerns_and_proceed"; concerns: string[] }
  | { action: "abort"; reason: string }

// Exports: handleAgentStatus, escalateBlocker, runTwoPhaseReview
```

#### `verification-gate.ts` — 5-Step Gate (pattern 13)

```typescript
interface VerificationClaim {
  claim: string
  evidenceCommand?: string
  evidenceOutput?: string
  verified: boolean
}

interface VerificationResult {
  allPassed: boolean
  passedCount: number
  failedCount: number
  failures: VerificationClaim[]
  redFlagWords: string[]
  report: string
}

// 5 steps: IDENTIFY → RUN → READ → VERIFY → CLAIM
// Exports: verifyBeforeCompletion, detectRedFlagWords,
//          scoutVerificationClaims, collectorVerificationClaims,
//          verifierVerificationClaims, analystVerificationClaims
```

#### `severity.ts` — Three-Level Severity (pattern 8)

```typescript
type SeverityLevel = "critical" | "important" | "minor"

interface SeverityReport {
  critical: string[]   // Must-Fix — blocks completion
  important: string[]  // Should-Fix — non-blocking
  minor: string[]      // Nice-to-Have — optional
  total: number
}

// Mapping: mismatch → critical, warning → important, matched → minor
// Exports: statusToSeverity, classifyReconciliationSeverity,
//          buildSeverityReport, hasBlockingIssues
```

#### `priority.ts` — Instruction Priority (pattern 2)

```typescript
enum InstructionPriority {
  DEFAULT = 1,        // system fallback
  INDUSTRY_PACK = 2,  // IndustryPack rules
  USER_CONFIG = 3,    // user explicit instructions (highest)
}

interface PriorityResolution {
  value: unknown
  source: InstructionPriority
  sourceName: string
  hasConflict: boolean
  overriddenSources: Array<{ priority: InstructionPriority; value: unknown }>
}

// Resolution: USER_CONFIG > INDUSTRY_PACK > DEFAULT
```

#### `degrees-of-freedom.ts` — Freedom Levels (pattern 1)

```typescript
type FreedomLevel = "high" | "medium" | "low"

interface RuleFreedomDeclaration {
  ruleId: string       // "rule-1" through "rule-19"
  freedom: FreedomLevel
  rationale: string
}

// 19 feedback rules classified:
//   low    (5 rules): rule-1,2,3,8,9    — formula-driven, no judgment
//   medium (8 rules): rule-4,5,6,7,10-13 — attribution, contextual judgment
//   high   (6 rules): rule-14-19         — analysis, business judgment

// Exports: getRuleFreedom, isFlexible, groupRulesByFreedom, FREEDOM_DECLARATIONS
```

#### `progressive-disclosure.ts` — Three-Tier Disclosure (pattern 10)

```typescript
type DisclosureTier = "metadata" | "schema" | "reference"

interface DisclosureMetadata {
  name: string
  triggerConditions: string
  tier: DisclosureTier
  summary: string  // <50 words
}

class ProgressiveDisclosureRegistry {
  register(metadata, content?): void
  load(tier): Array<{ metadata, content? }>  // loads tier + shallower tiers
  getMetadata(): DisclosureMetadata[]
  get(name): { metadata, content? } | undefined
  get size(): number
}

// Tier model:
//   metadata  — always visible, lightweight (<150 words)
//   schema    — loaded on demand (field definitions, types)
//   reference — deep query only (full docs, examples, edge cases)
```

#### `cso.ts` — CSO Description Validation (pattern 9)

```typescript
interface CSOMetadata {
  name: string
  description: string  // MUST start with "Use when..."
  keywords: string[]
}

interface CSOValidationResult {
  valid: boolean
  issues: string[]
}

// Rules:
//   1. Description must start with "Use when..." (trigger conditions, not workflow)
//   2. No workflow steps ("first do X, then do Y")
//   3. Third person (no I/you/we)
//   4. Keywords required
//   5. Length ≤ 1024 characters

// AGENT_CSO_METADATA: Record<AgentRole, CSOMetadata> — all 6 roles pre-defined
```

#### `two-stage-review.ts` — Two-Stage Review (pattern 4)

```typescript
type ReviewStage = "spec_compliance" | "code_quality"

interface SpecComplianceReview {
  passed: boolean
  missingRequirements: string[]
  extraWork: string[]
  misunderstandings: string[]
  summary: string
}

interface CodeQualityReview {
  strengths: string[]
  criticalIssues: string[]
  importantIssues: string[]
  minorIssues: string[]
  readyToMerge: boolean
  summary: string
}

interface TwoStageReviewResult {
  specReview: SpecComplianceReview
  qualityReview?: CodeQualityReview  // undefined if spec fails
}

// Rule: "Starting code quality review before spec compliance passes is a red flag."
```

#### `systematic-debugging.ts` — Four-Phase Debugging (pattern 12)

```typescript
type DebugPhase = "root_cause" | "pattern_analysis" | "hypothesis_test" | "implementation"

interface DebuggingSession {
  id: string
  phase: DebugPhase
  anomalyId: string
  anomalyDescription: string
  hypothesis?: string
  attempts: number
  rootCause?: string
  fixVerified: boolean
  evidence: Record<DebugPhase, string[]>
  shouldQuestionArchitecture: boolean  // true after 3 failed attempts
  startedAt: string
}

// Iron Law: "NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST"
// Rule: "3+ fixes failed = architectural problem, not a failed hypothesis"
```

#### `parallel-dispatch.ts` — Parallel Dispatch (pattern 3)

```typescript
type DispatchDecision = "parallel" | "sequential" | "single_agent"

interface DispatchAssessment {
  decision: DispatchDecision
  rationale: string
  taskCount: number
  hasSharedState: boolean
  isIndependent: boolean
}

interface ParallelDispatchPlan {
  groups: SwarmTask[][]
  rationale: string
  constraints: string[]
}

// Decision tree:
//   1 task           → single_agent
//   multiple + same role → sequential
//   multiple + shared state → sequential
//   multiple + independent + no shared state → parallel

// Rule: "Never dispatch multiple implementation subagents in parallel (conflicts)."
```

#### `plan-validate-execute.ts` — Plan-Validate-Execute (pattern 11)

```typescript
type PlanPhase = "analyze" | "plan" | "validate_plan" | "execute" | "verify"

interface ReconciliationPlan {
  fields: string[]
  thresholds: Record<string, number>
  expectedStatus: ReconciliationStatus
  transactionRefs?: string[]
}

interface PlanValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

interface ExecutionResult<T = unknown> {
  result: T
  verified: boolean
  verificationDetails: string
}

// No Placeholders rule:
//   Forbidden: TBD, TODO, "implement later", "add appropriate error handling",
//   "handle edge cases", "write tests for the above", "similar to Task N"
```

---

## 10. Cross-Cutting Conventions

### 10.1 Naming

- **String-literal unions** over enums everywhere, except `InstructionPriority` (the sole enum).
- Bilingual domain: comments and some field descriptions mix Chinese and English.
- `*Spec` suffix for optional configuration blocks (e.g., `CapacitySpec`, `RiskSpec`).
- `*ReconciliationData` suffix for dimension-specific data interfaces.
- `*ReconInput` suffix for reconciliation input interfaces.

### 10.2 Non-Destructive Extension

Types extend without modifying their parents:

```typescript
AnnotatedEvidence = EvidenceEntry & { authenticity: AuthenticityResult }
SupplyChainNode extends IndustryNode { /* +geography, capacity, risk, ... */ }
```

### 10.3 Generic Container Pattern

```typescript
ReconciliationResult<T>     // T = dimension-specific data
ExecutionResult<T>          // T = executor return type
```

### 10.4 Inline Type Imports (circular dependency avoidance)

```typescript
// In spine/types.ts:
SynthesisOutput.chainEstimate?: import("../analysis/chain-health").ChainHealth

// In evidence-types.ts:
EvidenceNode.authenticity?: import("./validation/types").AuthenticityResult

// In orchestrator.ts:
OrchestratorContext.reconciliations?: import("../reconciliation/types").ReconciliationResult[]
```

### 10.5 Backward Compatibility

All superpowers fusion fields on `AgentRunResult`, `AgentRoleProfile`, and `SwarmWorkflow`
are **optional**. The `AgentStatus` extension adds 3 new states without breaking
existing `"completed" | "failed"` values. Existing agents return `status: "completed"`
which remains valid.

---

## Dependency Diagram

```
                    core/industry-pack.ts
                           ▲
                           │
              ┌────────────┼────────────┐
              │            │            │
         spine/types.ts    │    validation/types.ts
              ▲            │            ▲
              │            │            │
    ┌─────────┼──────┐     │    ┌───────┴───────┐
    │         │      │     │    │               │
 memory/    types.ts  reconciliation/    analysis/
 types.ts             types.ts           *.ts
    ▲                    ▲                  ▲
    │                    │                  │
    └────────┬───────────┴──────────────────┘
             │
        swarm/*
    ┌────────┼────────────────────┐
    │        │                    │
 profiles  orchestrator     superpowers/
    │        │             ┌──────┼──────────────┐
    │        │             │      │              │
    │     agents/     contract  escalation   verification-gate
    │     (6 roles)       │      │              │
    │                      │      │              │
    └──────────────────────┘      │              │
             │                     │              │
        severity  priority  degrees-of-freedom  cso
             │      │              │              │
        two-stage  systematic   progressive    plan-validate
         -review   -debugging   -disclosure     -execute
                                        │
                                   parallel-dispatch
```

## Type Index (by file)

| File | Exported Types |
|------|---------------|
| `types.ts` | SourceTier, SourceType, EvidenceKind, IntelligenceSource, SourceRegistry, SourceTierDefinition, EvidenceEntry, EvidenceScore, ConclusionGateResult, SourceVerificationResult |
| `evidence-types.ts` | AdapterHealthStatus, SourceResultStatus, EvidenceNodeType, EvidenceEdgeType, ConflictType, ConflictSeverity, ConflictResolution, VisualizationReadinessStatus, EvidenceGraph, EvidenceNode, EvidenceEdge, EvidenceSummary, AdapterHealth, ConflictReport, ConfidenceResult, ConfidenceBreakdown |
| `core/industry-pack.ts` | Range, IndustryNode, SupplyChainNode, GeographySpec, CapacitySpec, CostFactorSpec, InventorySpec, DemandSpec, RiskSpec, SubstitutionSpec, TransmissionPath, SupplyLaneEndpoint, SupplyLane, CrossDimensionRule, CapitalFlow, WorkforceFlow, BusinessDimension, InformationFlow, FreshnessConfig, IndustryPack |
| `spine/types.ts` | ProbeKind, Probe, ProbeRun, ProbeSignal, TriggerContext, TriggerRule, SwarmTrigger, AgentRole, AgentStatus, AgentRoleProfile, AntiRationalizationEntry, AgentToolDeclaration, SwarmWorkflow, SwarmTask, AgentRunResult, AgentSelfReview, ReviewResult, ReviewPhase, ReviewIssue, VerificationEvidence, EscalationAction, RawRecord, ExtractedFact, AnalysisFinding, SynthesisOutput, MemoryEntry, FollowUpTask |
| `memory/types.ts` | AssociationRelation, MemoryAccessMode, MemoryAssociation, ReflexPathway, MemoryAccessDeclaration, MemoryQueryResult, CommitResult |
| `memory/broker.ts` | CommitIntent, BrokerQuery, MemoryBroker (class) |
| `memory/store.ts` | MemoryStore (class) |
| `memory/persistence/config.ts` | PersistenceConfig |
| `memory/persistence/adapter.ts` | PersistedState, PersistenceAdapter (class) |
| `validation/types.ts` | ValidationGateName, AuthenticityFlag, ValidationGateResult, AuthenticityResult, AnnotatedEvidence |
| `reconciliation/types.ts` | TransactionDocType, TransactionParty, ReconciliationStatus, ReconciliationDimension, DataTrustLayer, CredibilityGrade, AnomalyType, AnomalyStatus, ResponsibleParty, InventoryResponsibility, TransactionDocument, VarianceDetail, ReconciliationResult, + 10 *ReconciliationData, PriceCostBreakdown, PriceAnalysis, CredibilityScore, Anomaly, ReconciliationSummary, BuyerSellerDashboard, + 3 dashboard views |
| `analysis/chain-estimator.ts` | SubjectEstimate, NodeEstimate |
| `analysis/chain-propagator.ts` | NodePropagation, PropagationResult, ReverseNodePropagation, ReversePropagationResult |
| `analysis/chain-health.ts` | PressureLevel, NodePressure, ChainHealth |
| `analysis/resonance-detector.ts` | ResonanceLevel, ResonancePattern, ResonanceResult |
| `analysis/attribution.ts` | AttributionChain |
| `synthesis/brief.ts` | SynthesisInput |
| `swarm/contract.ts` | ContractViolation |
| `swarm/escalation.ts` | StatusAction |
| `swarm/verification-gate.ts` | VerificationClaim, VerificationResult |
| `swarm/severity.ts` | SeverityLevel, SeverityReport |
| `swarm/priority.ts` | InstructionPriority (enum), PriorityResolution |
| `swarm/degrees-of-freedom.ts` | FreedomLevel, RuleFreedomDeclaration |
| `swarm/progressive-disclosure.ts` | DisclosureTier, DisclosureMetadata, ProgressiveDisclosureRegistry (class) |
| `swarm/cso.ts` | CSOMetadata, CSOValidationResult |
| `swarm/two-stage-review.ts` | ReviewStage, SpecComplianceReview, CodeQualityReview, TwoStageReviewResult, SpecDefinition, ImplementationResult |
| `swarm/systematic-debugging.ts` | DebugPhase, DebuggingSession |
| `swarm/parallel-dispatch.ts` | DispatchDecision, DispatchAssessment, ParallelDispatchPlan |
| `swarm/plan-validate-execute.ts` | PlanPhase, ReconciliationPlan, PlanValidationResult, ExecutionResult |
| `swarm/orchestrator.ts` | OrchestratorContext, SwarmRunResult |
| `swarm/scout-matcher.ts` | ScoutMatchTier, ScoutMatchResult |
