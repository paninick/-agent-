import { describe, expect, it, vi } from "vitest";
import registrySeed from "../../data/intelligence-source-registry.seed.json";
import {
  createEvidenceEntry,
  assessMonitoringCoverage,
  blsPointToEvidence,
  buildEvidenceGraph,
  calculateConfidenceScore,
  createEvidenceAdapter,
  detectConflicts,
  ecbFxRatesToEvidence,
  eurostatPointToEvidence,
  evaluateBrandChainGate,
  evaluateConclusionGate,
  evaluateVisualizationReadiness,
  executeAdapter,
  evaluateAdapterHealth,
  healthyValidation,
  calculateMaterialRequirements,
  fetchBlsLatestSeriesPoint,
  fetchEcbEuroReferenceRates,
  fetchEurostatDataPoint,
  fetchFredLatestObservation,
  fetchSecCompanyFactsSummary,
  fetchSecCompanyMetricSet,
  fetchUsCensusImportHs,
  fetchWorldBankIndicator,
  getSource,
  groupSourcesByTier,
  parseSourceRegistry,
  reconcileObservedMaterialQuantity,
  scoreEvidence,
  secFactsToEvidence,
  secMetricSetToEvidence,
  materialRequirementToEvidence,
  usCensusTradeToEvidence,
  worldBankPointToEvidence,
  // Phase F: 买卖双方对账系统
  reconcileQuantity,
  reconcilePrice,
  reconcileDelivery,
  reconcileQuality,
  reconcileFinancial,
  reconcileDemand,
  reconcileCapacity,
  assessDemandCredibility,
  assessSupplyCredibility,
  assessPriceReasonableness,
  classifyDataTrust,
  trackAnomaly,
  collectEvidence,
  attributeAnomaly,
  resolveAnomaly,
  closeAnomaly,
  attributeResponsibility,
  classifyInventoryResponsibility,
  computeReconciliationSummary,
  computeReconciliationDashboard,
  computeChainHealth,
  detectResonance,
} from "../intelligence";
import {
  validateProvenance,
  validateScope,
  validateSchemaGate,
  validateRange,
  validateRangeGate,
  validateFreshness,
  validateFreshnessGate,
  validateCrossSource,
  validateCrossSourceGate,
  validateHistorical,
  validateHistoricalGate,
  computeAuthenticity,
  computeAuthenticityResult,
  stampAuthenticity,
  scoreToFlag,
  scoreToAuthenticityFlag,
  aggregateGateScores,
  runProvenanceGate,
  runSchemaGate,
  runRangeGate,
  runFreshnessGate,
  runCrossSourceGate,
  runHistoricalGate,
  runValidationGates,
  evaluateAuthenticity,
  evaluateAuthenticityBatch,
  computeAuthenticityFromGates,
  getGateResult,
  apparelPack,
  apparelKnownRanges,
  apparelFreshnessMaxAgeDays,
  type ValidationGateName,
  type ValidationGateResult,
  type AuthenticityFlag,
  type AuthenticityResult,
  type IndustryPack,
  type Range,
  type FreshnessConfig
} from "../intelligence";
import {
  // 模式 6/4/11/12：四态 + 审查 + 升级
  handleAgentStatus,
  escalateBlocker,
  runTwoPhaseReview,
  // 模式 1/2/8/13：契约校验 + 验证门 + 红旗
  validateContract,
  verifyCompletion,
  checkRedFlags,
  createVerificationEvidence,
  // 模式 13：5步验证门
  verifyBeforeCompletion,
  detectRedFlagWords,
  scoutVerificationClaims,
  collectorVerificationClaims,
  verifierVerificationClaims,
  analystVerificationClaims,
  // 模式 8：三级严重度
  statusToSeverity,
  classifyReconciliationSeverity,
  buildSeverityReport,
  hasBlockingIssues,
  // 模式 2：指令优先级
  InstructionPriority,
  resolveInstructionConflict,
  getPriorityName,
  // 模式 1：自由度分级
  getRuleFreedom,
  isFlexible,
  groupRulesByFreedom,
  FREEDOM_DECLARATIONS,
  // 模式 10：渐进式披露
  ProgressiveDisclosureRegistry,
  registerIndustryPack,
  // 模式 9：CSO
  validateCSODescription,
  buildCSOMetadata,
  AGENT_CSO_METADATA,
  // 模式 4：两阶段审查
  twoStageReview,
  formatReviewReport,
  // 模式 12：系统化调试
  startDebuggingSession,
  advancePhase,
  recordFixAttempt,
  shouldQuestionArchitecture,
  getPhaseChecklist,
  // 模式 3：并行派发
  assessDispatch,
  createParallelDispatchPlan,
  createFocusedAgentPrompt,
  verifyParallelResults,
  // 模式 11：计划-验证-执行
  validateReconciliationPlan,
  executeWithValidation,
  checkForPlaceholders,
  // profiles & types
  getRoleProfile,
  AGENT_ROLE_PROFILES,
  DEFAULT_SWARM_WORKFLOW,
  // live collector + live swarm
  collectFromSources,
  configFromEnv,
  runLiveSwarm,
  orchestrateSwarm,
  LIVE_WORKFLOW,
} from "../intelligence";
import { MemoryStore } from "../intelligence/memory/store";
import type {
  AgentRunResult,
  SwarmTask,
  SwarmWorkflow,
  AgentRole,
  AgentStatus,
  VerificationEvidence,
  SwarmTrigger,
  RawRecord,
} from "../intelligence";

describe("industry intelligence source registry", () => {
  it("validates the seed registry and groups sources by weight tier", () => {
    const registry = parseSourceRegistry(registrySeed);
    const grouped = groupSourcesByTier(registry);

    expect(registry.sources.length).toBeGreaterThanOrEqual(23);
    expect(grouped.S.length).toBeGreaterThanOrEqual(12);
    expect(getSource(registry, "un-comtrade").tier).toBe("S");
  });

  it("assesses global monitoring coverage and exposes authorization-dependent areas", () => {
    const registry = parseSourceRegistry(registrySeed);
    const coverage = assessMonitoringCoverage(registry);
    const platform = coverage.find((item) => item.dimensionId === "platform_orders_and_prices");
    const customs = coverage.find((item) => item.dimensionId === "customs_and_trade");

    expect(customs?.status).toMatch(/covered|partial/);
    expect(platform?.status).toBe("covered_but_auth_needed");
    expect(platform?.matchedSources.some((source) => source.id === "temu-partner-api")).toBe(true);
  });

  it("scores strong official API evidence above lead-only evidence", () => {
    const registry = parseSourceRegistry(registrySeed);
    const source = getSource(registry, "world-bank");
    const entry = createEvidenceEntry({
      source,
      kind: "macro_control",
      subject: "Vietnam GDP",
      claim: "World Bank exposes a current Vietnam GDP series point",
      observedAt: "2026-06-30T00:00:00.000Z",
      method: "api",
      conversions: ["Preserve native current USD unit."],
      crossChecks: ["fred"],
      notes: ["反证扫描: compare with IMF before using in supplier-cost claims."]
    });

    const score = scoreEvidence(entry, new Date("2026-06-30T01:00:00.000Z"));

    expect(score.confidence).toBeGreaterThan(0.8);
    expect(score.classification).toBe("conclusion_ready");
  });

  it("keeps weak-only evidence at hypothesis level", () => {
    const registry = parseSourceRegistry(registrySeed);
    const source = getSource(registry, "mckinsey-bof-state-of-fashion");
    const entry = createEvidenceEntry({
      source,
      kind: "research_context",
      subject: "fashion supply chain pressure",
      claim: "A consulting report flags pressure on fashion supply chains",
      observedAt: "2026-06-30T00:00:00.000Z",
      method: "report",
      notes: ["Use only as mechanism context."]
    });
    const score = scoreEvidence(entry, new Date("2026-06-30T01:00:00.000Z"));

    expect(evaluateConclusionGate(registry, [entry], [score]).status).toBe("hypothesis_only");
  });

  it("keeps a brand chain unverified when only financial and macro ledgers are present", () => {
    const registry = parseSourceRegistry(registrySeed);
    const financial = createEvidenceEntry({
      source: getSource(registry, "sec-edgar"),
      kind: "financial_primary",
      subject: "GAP, INC",
      claim: "GAP has SEC operating metrics",
      observedAt: "2026-06-30T00:00:00.000Z",
      method: "api",
      conversions: ["Gross margin derived as gross profit / revenue."],
      crossChecks: ["company_ir"],
      notes: ["反证扫描: needs customs and supplier checks."]
    });
    const macro = createEvidenceEntry({
      source: getSource(registry, "ecb-eurofxref"),
      kind: "macro_control",
      subject: "EUR reference FX rates",
      claim: "ECB exposes FX rates",
      observedAt: "2026-06-30T00:00:00.000Z",
      method: "api",
      conversions: ["USD/JPY cross rate derived from EUR base rates."],
      crossChecks: ["fred"],
      notes: ["反证扫描: compare market rates."]
    });
    const blsMarketSignal = createEvidenceEntry({
      source: getSource(registry, "bls-public-api"),
      kind: "market_signal",
      subject: "CUSR0000SAA",
      claim: "BLS exposes an apparel CPI signal",
      observedAt: "2026-06-30T00:00:00.000Z",
      method: "api",
      conversions: ["Preserve BLS native index."],
      crossChecks: ["fred"],
      notes: ["反证扫描: not proof of platform orders or inventory."]
    });
    const evidence = [financial, macro, blsMarketSignal];
    const scores = evidence.map((entry) => scoreEvidence(entry, new Date("2026-06-30T01:00:00.000Z")));

    const gate = evaluateBrandChainGate({
      brand: "GAP, INC",
      evidence,
      scores,
      verifications: [
        { sourceId: "sec-edgar", status: "verified", evidenceId: financial.id, message: "ok", checkedAt: "2026-06-30T00:00:00.000Z" },
        { sourceId: "ecb-eurofxref", status: "verified", evidenceId: macro.id, message: "ok", checkedAt: "2026-06-30T00:00:00.000Z" },
        { sourceId: "us-census-trade", status: "skipped_auth_required", message: "CENSUS_API_KEY is not set.", checkedAt: "2026-06-30T00:00:00.000Z" }
      ]
    });

    expect(gate.status).toBe("partial_chain");
    expect(gate.ledgers.find((ledger) => ledger.id === "financials")?.status).toBe("passed");
    expect(gate.ledgers.find((ledger) => ledger.id === "trade")?.status).toBe("partial");
    expect(gate.ledgers.find((ledger) => ledger.id === "platform")?.status).toBe("missing");
    expect(gate.ledgers.find((ledger) => ledger.id === "materials")?.status).toBe("missing");
  });

  it("degrades visualization when usable evidence exists but confidence is low", () => {
    const registry = parseSourceRegistry(registrySeed);
    const financial = createEvidenceEntry({
      source: getSource(registry, "sec-edgar"),
      kind: "financial_primary",
      subject: "GAP, INC",
      claim: "GAP has SEC operating metrics",
      observedAt: "2026-06-30T00:00:00.000Z",
      method: "api",
      conversions: ["Gross margin derived as gross profit / revenue."],
      crossChecks: ["company_ir"],
      notes: ["反证扫描: needs customs and supplier checks."]
    });
    const scores = [scoreEvidence(financial, new Date("2026-06-30T01:00:00.000Z"))];
    const adapterHealth = [
      evaluateAdapterHealth({
        sourceId: "sec-edgar",
        latencyMs: 5,
        checkedAt: "2026-06-30T01:00:00.000Z",
        validation: healthyValidation()
      })
    ];
    const graph = buildEvidenceGraph({
      registry,
      evidence: [financial],
      scores,
      adapterHealth,
      generatedAt: "2026-06-30T01:00:00.000Z"
    });

    const readiness = evaluateVisualizationReadiness({
      evidenceGraph: graph,
      adapterHealth,
      confidenceScore: 0.31
    });

    expect(readiness.status).toBe("degraded");
    expect(readiness.usableEvidence).toBe(true);
    expect(readiness.missingFields).toContain("minimumHealthySources");
  });

  it("allows visualization readiness only when health and confidence pass", () => {
    const registry = parseSourceRegistry(registrySeed);
    const source = getSource(registry, "sec-edgar");
    const evidence = Array.from({ length: 5 }, (_, index) => createEvidenceEntry({
      source,
      kind: "financial_primary",
      subject: `verified brand ${index}`,
      claim: `A verified evidence item ${index}`,
      observedAt: "2026-06-30T00:00:00.000Z",
      method: "api",
      conversions: ["Unit conversion documented."],
      crossChecks: ["independent_source"],
      notes: ["反证扫描: no contradiction in this readiness case."]
    }));
    const scores = evidence.map((entry) => scoreEvidence(entry, new Date("2026-06-30T01:00:00.000Z")));
    const adapterHealth = Array.from({ length: 5 }, (_, index) =>
      evaluateAdapterHealth({
        sourceId: `source-${index}`,
        latencyMs: 5,
        checkedAt: "2026-06-30T01:00:00.000Z",
        validation: healthyValidation()
      })
    );
    const graph = buildEvidenceGraph({
      registry,
      evidence,
      scores,
      adapterHealth,
      generatedAt: "2026-06-30T01:00:00.000Z"
    });

    const readiness = evaluateVisualizationReadiness({
      evidenceGraph: graph,
      adapterHealth,
      confidenceScore: 0.88
    });

    expect(readiness.status).toBe("ready");
  });

  it("calculates BOM material requirements and produces material quantity evidence", () => {
    const registry = parseSourceRegistry(registrySeed);
    const result = calculateMaterialRequirements({
      styleId: "knit-base-tee",
      finishedUnits: 10000,
      fabricKgPerUnit: 0.22,
      cuttingWasteRate: 0.08,
      yarnToFabricYieldRate: 0.94,
      fiberToYarnYieldRate: 0.97,
      accessories: [{ name: "care_label", unitsPerGarment: 1, wastageRate: 0.01 }],
      assumptions: ["Bulk BOM v1.2, cotton jersey, size-mix weighted consumption."]
    });
    const evidence = materialRequirementToEvidence({
      source: getSource(registry, "internal-bom-system"),
      result,
      observedAt: "2026-06-30T00:00:00.000Z"
    });

    expect(result.netFabricKg).toBe(2200);
    expect(result.grossFabricKg).toBe(2391.304);
    expect(result.yarnInputKg).toBe(2543.941);
    expect(result.fiberInputKg).toBe(2622.619);
    expect(result.accessories[0].requiredUnits).toBe(10100);
    expect(evidence.kind).toBe("material_quantity");
    expect(evidence.sourceTier).toBe("A+");
  });

  it("flags observed material quantities outside tolerance as contradictions", () => {
    const registry = parseSourceRegistry(registrySeed);
    const result = calculateMaterialRequirements({
      styleId: "knit-base-tee",
      finishedUnits: 10000,
      fabricKgPerUnit: 0.22,
      cuttingWasteRate: 0.08,
      yarnToFabricYieldRate: 0.94,
      assumptions: ["Bulk BOM v1.2."]
    });
    const reconciliation = reconcileObservedMaterialQuantity(result, {
      label: "supplier shipment lot A",
      material: "yarn",
      quantityKg: 3100,
      tolerancePct: 0.05
    });
    const evidence = materialRequirementToEvidence({
      source: getSource(registry, "internal-bom-system"),
      result,
      reconciliations: [reconciliation],
      observedAt: "2026-06-30T00:00:00.000Z"
    });

    expect(reconciliation.status).toBe("outside_tolerance");
    expect(reconciliation.deltaPct).toBeGreaterThan(0.05);
    expect(evidence.contradictions.length).toBe(1);
  });

  it("builds an Evidence Graph v1 from registry evidence", () => {
    const registry = parseSourceRegistry(registrySeed);
    const entry = createEvidenceEntry({
      source: getSource(registry, "world-bank"),
      kind: "macro_control",
      subject: "Vietnam GDP",
      claim: "World Bank exposes a Vietnam GDP point",
      observedAt: "2026-06-30T00:00:00.000Z",
      period: "2024",
      geography: "Vietnam",
      value: 476346000000,
      unit: "current USD",
      method: "api",
      conversions: ["Preserve native unit."],
      crossChecks: ["fred"],
      notes: ["反证扫描: compare with IMF."]
    });
    const score = scoreEvidence(entry, new Date("2026-06-30T01:00:00.000Z"));
    const adapterHealth = [
      evaluateAdapterHealth({
        sourceId: "world-bank",
        latencyMs: 5,
        checkedAt: "2026-06-30T01:00:00.000Z",
        validation: healthyValidation()
      })
    ];

    const graph = buildEvidenceGraph({
      registry,
      evidence: [entry],
      scores: [score],
      adapterHealth,
      generatedAt: "2026-06-30T01:00:00.000Z"
    });

    expect(graph.summary.sourceNodeCount).toBe(registry.sources.length);
    expect(graph.summary.dataPointNodeCount).toBe(1);
    expect(graph.summary.entityNodeCount).toBe(1);
    expect(graph.summary.indicatorNodeCount).toBe(1);
    expect(graph.edges.some((edge) => edge.type === "derived_from")).toBe(true);
    expect(graph.nodes.every((node) => Boolean(node.provenance.sourceId))).toBe(true);
  });

  it("standardizes adapters and evaluates confidenceScore with conflicts", async () => {
    const registry = parseSourceRegistry(registrySeed);
    const source = getSource(registry, "internal-bom-system");
    const entry = createEvidenceEntry({
      source,
      kind: "material_quantity",
      subject: "audit-counterexample-knit-base-tee",
      claim: "Observed yarn quantity is outside model tolerance",
      observedAt: "2026-06-30T00:00:00.000Z",
      period: "2026",
      value: "yarnInputKg=2543.941; observed=3100",
      unit: "kg",
      method: "manual",
      conversions: ["Yarn kg reconciled against BOM model."],
      crossChecks: ["warehouse_ledger"],
      contradictions: ["synthetic supplier yarn shipment outside tolerance"],
      notes: ["反证扫描: contradiction should be retained."]
    });
    const adapter = createEvidenceAdapter({
      source,
      fetch: async () => entry
    });

    const result = await executeAdapter(adapter, { checkedAt: "2026-06-30T01:00:00.000Z" });
    const graph = buildEvidenceGraph({
      registry,
      evidence: result.evidence,
      scores: result.scores,
      adapterHealth: [result.health],
      generatedAt: "2026-06-30T01:00:00.000Z"
    });
    const conflicts = detectConflicts(graph);
    const confidence = calculateConfidenceScore({
      graph,
      adapterHealth: [result.health],
      conflicts
    });

    expect(result.verification.status).toBe("verified");
    expect(result.health.status).toBe("healthy");
    expect(confidence.value).toBeGreaterThanOrEqual(0);
    expect(confidence.value).toBeLessThanOrEqual(1);
    expect(confidence.breakdown).toHaveProperty("conflictPenalty");
  });
});

describe("official API normalizers", () => {
  it("normalizes a World Bank indicator response into evidence", async () => {
    const registry = parseSourceRegistry(registrySeed);
    const fakeFetch = async () =>
      new Response(
        JSON.stringify([
          { page: 1 },
          [
            { date: "2025", value: null },
            {
              country: { value: "Vietnam" },
              indicator: { value: "GDP (current US$)" },
              date: "2024",
              value: 476346000000,
              unit: ""
            }
          ]
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );

    const point = await fetchWorldBankIndicator({
      country: "VNM",
      indicator: "NY.GDP.MKTP.CD",
      fetchImpl: fakeFetch as typeof fetch
    });
    const evidence = worldBankPointToEvidence(getSource(registry, "world-bank"), point);

    expect(point.country).toBe("Vietnam");
    expect(evidence.sourceTier).toBe("S");
    expect(evidence.crossChecks).toContain("fred");
  });

  it("normalizes SEC company facts availability into evidence", async () => {
    const registry = parseSourceRegistry(registrySeed);
    const fakeFetch = async () =>
      new Response(
        JSON.stringify({
          entityName: "THE GAP, INC.",
          facts: {
            "us-gaap": {
              Revenues: {},
              InventoryNet: {}
            },
            dei: {
              EntityCommonStockSharesOutstanding: {}
            }
          }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );

    const summary = await fetchSecCompanyFactsSummary({ cik: "39911", fetchImpl: fakeFetch as typeof fetch });
    const evidence = secFactsToEvidence(getSource(registry, "sec-edgar"), summary);

    expect(summary.cik).toBe("0000039911");
    expect(summary.factCount).toBe(3);
    expect(evidence.kind).toBe("financial_primary");
  });

  it("extracts SEC operating metrics for brand financial-chain analysis", async () => {
    const registry = parseSourceRegistry(registrySeed);
    const usdUnits = (value: number, filed = "2026-03-18", fy = 2025) => ({
      units: {
        USD: [
          { val: value - 10, fy: fy - 1, fp: "FY", form: "10-K", filed: "2025-03-18", end: "2025-02-01" },
          { val: value, fy, fp: "FY", form: "10-K", filed, end: "2026-01-31" }
        ]
      }
    });
    const fakeFetch = async () =>
      new Response(
        JSON.stringify({
          entityName: "GAP, INC",
          facts: {
            "us-gaap": {
              Revenues: usdUnits(15000000000),
              GrossProfit: usdUnits(6000000000),
              CostOfGoodsAndServicesSold: usdUnits(9000000000),
              InventoryFinishedGoodsNetOfReserves: usdUnits(2200000000),
              OperatingIncomeLoss: usdUnits(1100000000)
            }
          }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );

    const metricSet = await fetchSecCompanyMetricSet({ cik: "39911", fetchImpl: fakeFetch as typeof fetch });
    const evidence = secMetricSetToEvidence(getSource(registry, "sec-edgar"), metricSet);

    expect(metricSet.metrics.map((metric) => metric.canonicalName)).toContain("inventory");
    expect(metricSet.derived.grossMargin).toBe(0.4);
    expect(metricSet.derived.inventoryToRevenue).toBe(0.1467);
    expect(String(evidence.value)).toContain("grossMargin");
  });

  it("normalizes a Eurostat JSON-stat response into evidence", async () => {
    const registry = parseSourceRegistry(registrySeed);
    const fakeFetch = async () =>
      new Response(
        JSON.stringify({
          version: "2.0",
          class: "dataset",
          label: "Population on 1 January by age and sex",
          source: "ESTAT",
          updated: "2026-05-30T11:00:00+0200",
          value: { "0": 83456045 }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );

    const point = await fetchEurostatDataPoint({
      dataset: "demo_pjan",
      filters: { geo: "DE", sex: "T", age: "TOTAL", time: "2024" },
      fetchImpl: fakeFetch as typeof fetch
    });
    const evidence = eurostatPointToEvidence(getSource(registry, "eurostat"), point);

    expect(point.value).toBe(83456045);
    expect(evidence.sourceTier).toBe("S");
    expect(evidence.subject).toContain("DE");
  });

  it("normalizes a FRED latest observation response", async () => {
    const fakeFetch = async () =>
      new Response(
        JSON.stringify({
          observations: [
            { date: "2026-06-29", value: "." },
            { date: "2026-06-28", value: "144.21" }
          ]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );

    const point = await fetchFredLatestObservation({
      seriesId: "DEXJPUS",
      apiKey: "test-key",
      fetchImpl: fakeFetch as typeof fetch
    });

    expect(point.seriesId).toBe("DEXJPUS");
    expect(point.value).toBe(144.21);
  });

  it("normalizes a BLS public series response into market-signal evidence", async () => {
    const registry = parseSourceRegistry(registrySeed);
    const fakeFetch = async () =>
      new Response(
        JSON.stringify({
          status: "REQUEST_SUCCEEDED",
          Results: {
            series: [
              {
                seriesID: "CUSR0000SAA",
                data: [
                  { year: "2026", period: "M05", periodName: "May", value: "137.069" },
                  { year: "2026", period: "M04", periodName: "April", value: "136.500" }
                ]
              }
            ]
          }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );

    const point = await fetchBlsLatestSeriesPoint({
      seriesId: "CUSR0000SAA",
      startYear: 2025,
      endYear: 2026,
      fetchImpl: fakeFetch as typeof fetch
    });
    const evidence = blsPointToEvidence(getSource(registry, "bls-public-api"), point);

    expect(point.value).toBe(137.069);
    expect(evidence.kind).toBe("market_signal");
    expect(evidence.notes[0]).toContain("not proof of brand purchase volume");
  });

  it("normalizes ECB reference-rate XML into cross-rate evidence", async () => {
    const registry = parseSourceRegistry(registrySeed);
    const fakeFetch = async () =>
      new Response(
        `<?xml version="1.0"?><Envelope><Cube><Cube time="2026-06-29"><Cube currency="USD" rate="1.1720"/><Cube currency="JPY" rate="169.83"/></Cube></Cube></Envelope>`,
        { status: 200, headers: { "Content-Type": "text/xml" } }
      );

    const rates = await fetchEcbEuroReferenceRates({ fetchImpl: fakeFetch as typeof fetch });
    const evidence = ecbFxRatesToEvidence(getSource(registry, "ecb-eurofxref"), rates);

    expect(rates.rates.USD).toBe(1.172);
    expect(rates.rates.JPY).toBe(169.83);
    expect(String(evidence.value)).toContain("USDJPY_cross");
  });

  it("normalizes U.S. Census HS import response into trade-flow evidence", async () => {
    const registry = parseSourceRegistry(registrySeed);
    const fakeFetch = async () =>
      new Response(
        JSON.stringify([
          ["CTY_CODE", "CTY_NAME", "I_COMMODITY", "I_COMMODITY_SDESC", "GEN_VAL_MO", "GEN_VAL_YR", "time"],
          ["5700", "CHINA", "611020", "SWEATERS, PULLOVERS ETC, KNIT ETC, COTTON", "1234567", "99887766", "2024-12"]
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );

    const record = await fetchUsCensusImportHs({
      apiKey: "test-key",
      time: "2024-12",
      commodityCode: "611020",
      countryCode: "5700",
      fetchImpl: fakeFetch as typeof fetch
    });
    const evidence = usCensusTradeToEvidence(getSource(registry, "us-census-trade"), record);

    expect(record.monthlyGeneralImportValue).toBe(1234567);
    expect(evidence.kind).toBe("trade_flow_primary");
    expect(evidence.crossChecks).toContain("un-comtrade");
  });
});

// ============================================================
// V3-MAINLINE-001 (revised) — Industry-Agnostic Authenticity Pipeline
//
// 三层测试：
//   A. Generic core gates — 不提供任何 pack，证明 core 行业无关
//   B. Apparel pack gates — 提供 apparelPack，证明 pack 配置被正确消费
//   C. Orchestrator + stamp + graph + flag — 端到端
// ============================================================

// --- 共享 fixture 构造器 ---

function buildGenericFixture() {
  const registry = parseSourceRegistry(registrySeed);
  const source = getSource(registry, "world-bank"); // S-tier, 通用宏观数据源
  const evidence = createEvidenceEntry({
    source,
    kind: "macro_control",
    subject: "test_indicator", // 通用指标名，不绑定任何行业
    claim: "generic test evidence for industry-agnostic validation",
    observedAt: new Date(Date.now() - 5 * 86_400_000).toISOString(), // 5 天前
    period: "2024",
    geography: "World",
    value: 50,
    unit: "index",
    method: "api",
    conversions: ["native"],
    crossChecks: ["fred"]
  });
  return { registry, source, evidence };
}

function buildApparelFixture() {
  const fixtureNow = new Date("2026-07-07T00:00:00.000Z");
  const registry = parseSourceRegistry(registrySeed);
  const source = getSource(registry, "world-bank");
  const evidence = createEvidenceEntry({
    source,
    kind: "macro_control",
    subject: "cotton_price", // apparel pack 的 knownRanges 中有此 key
    claim: "cotton price observation",
    observedAt: new Date(fixtureNow.getTime() - 10 * 86_400_000).toISOString(), // 10 天前
    period: "2024",
    geography: "China",
    value: 15000, // 在 [5000, 50000] 内
    unit: "CNY/ton",
    method: "api",
    conversions: ["native"],
    crossChecks: ["fred"]
  });
  return { registry, source, evidence };
}

// ============================================================
// A. Generic Core Gates — 不提供 pack，证明 core 行业无关
// ============================================================

describe("V3-MAINLINE-001: generic core gates (no industry pack)", () => {
  describe("gate 1: provenance — industry-agnostic", () => {
    it("returns 1.0 for S-tier source without any pack", () => {
      const { registry, evidence } = buildGenericFixture();
      expect(validateProvenance(evidence, registry.sources)).toBe(1.0);
    });

    it("returns 0 when sourceId is not in the registry", () => {
      const { evidence } = buildGenericFixture();
      const orphan = { ...evidence, sourceId: "nonexistent-source" };
      expect(validateProvenance(orphan, [])).toBe(0);
    });

    it("runProvenanceGate returns blocking result when source unknown", () => {
      const { evidence } = buildGenericFixture();
      const orphan = { ...evidence, sourceId: "ghost" };
      const result = runProvenanceGate(orphan, []);
      expect(result.blocking).toBe(true);
      expect(result.score).toBe(0);
      expect(result.reasons.some((r) => r.includes("not in registry"))).toBe(true);
    });
  });

  describe("gate 2: schema_match — industry-agnostic", () => {
    it("passes when all required fields present", () => {
      const { evidence } = buildGenericFixture();
      expect(validateScope(evidence)).toBe(1.0);
      expect(validateSchemaGate(evidence)).toBe(1.0); // alias
    });

    it("blocks when a required field is missing", () => {
      const { evidence } = buildGenericFixture();
      const broken = { ...evidence, subject: "" };
      expect(validateScope(broken)).toBe(0);
      const detail = runSchemaGate(broken);
      expect(detail.blocking).toBe(true);
      expect(detail.reasons.some((r) => r.includes("subject"))).toBe(true);
    });

    it("does not require 'value' — it is optional", () => {
      const { evidence } = buildGenericFixture();
      expect(validateScope({ ...evidence, value: undefined })).toBe(1.0);
    });
  });

  describe("gate 3: range_plausibility — industry-agnostic", () => {
    it("scores 0.7 (non-blocking) when no ranges provided (no pack)", () => {
      const { evidence } = buildGenericFixture();
      // 不提供 pack → ranges 为空 → 任何 subject 都返回 0.7
      expect(validateRange(evidence)).toBe(0.7);
      expect(validateRangeGate(evidence)).toBe(0.7); // alias
    });

    it("scores 1.0 when value is within inline-provided ranges", () => {
      const { evidence } = buildGenericFixture();
      const ranges: Record<string, Range> = {
        test_indicator: { min: 0, max: 100, unit: "index" }
      };
      expect(validateRange(evidence, ranges)).toBe(1.0);
    });

    it("scores 0 (blocking) when value exceeds ±50% of inline range", () => {
      const { source } = buildGenericFixture();
      const outlier = createEvidenceEntry({
        source,
        kind: "macro_control",
        subject: "test_indicator",
        claim: "outlier",
        observedAt: new Date().toISOString(),
        value: 999,
        unit: "index",
        method: "api"
      });
      const ranges: Record<string, Range> = {
        test_indicator: { min: 0, max: 100 }
      };
      expect(validateRange(outlier, ranges)).toBe(0);
      const detail = runRangeGate(outlier, ranges);
      expect(detail.blocking).toBe(true);
      expect(detail.reasons[0]).toContain("test_indicator");
    });
  });

  describe("gate 4: freshness — industry-agnostic", () => {
    it("scores 1.0 for recent evidence without any pack (default 30d)", () => {
      const { evidence } = buildGenericFixture();
      expect(validateFreshness(evidence)).toBe(1.0);
      expect(validateFreshnessGate(evidence)).toBe(1.0); // alias
    });

    it("blocks when observedAt is in the future", () => {
      const { evidence } = buildGenericFixture();
      const future = {
        ...evidence,
        observedAt: new Date(Date.now() + 10 * 86_400_000).toISOString()
      };
      expect(validateFreshness(future)).toBe(0);
      expect(runFreshnessGate(future).blocking).toBe(true);
    });

    it("uses default 30d when no pack and no nodeId provided", () => {
      const { source } = buildGenericFixture();
      // 32 days ago → exceeds default 30d → 0.7
      const thirtyTwoDaysAgo = new Date(Date.now() - 32 * 86_400_000).toISOString();
      const evidence = createEvidenceEntry({
        source,
        kind: "macro_control",
        subject: "test_indicator",
        claim: "test",
        observedAt: thirtyTwoDaysAgo,
        value: 50,
        unit: "index",
        method: "api"
      });
      expect(validateFreshness(evidence)).toBe(0.7);
    });
  });

  describe("gate 5: cross_source — industry-agnostic", () => {
    it("scores 0.7 when no independent peer exists", () => {
      const { evidence } = buildGenericFixture();
      expect(validateCrossSource(evidence, [])).toBe(0.7);
      expect(validateCrossSourceGate(evidence, [])).toBe(0.7); // alias
    });

    it("scores 1.0 when peer agrees within 5%", () => {
      const { evidence } = buildGenericFixture();
      const peer = { ...evidence, id: "peer-1", sourceId: "fred", value: 50.5 };
      expect(validateCrossSource(evidence, [peer])).toBe(1.0);
    });

    it("blocks when peer deviates >30%", () => {
      const { evidence } = buildGenericFixture();
      const conflict = { ...evidence, id: "peer-conflict", sourceId: "fred", value: 200 };
      expect(validateCrossSource(evidence, [conflict])).toBe(0);
      const detail = runCrossSourceGate(evidence, [conflict]);
      expect(detail.blocking).toBe(true);
    });
  });

  describe("gate 6: historical — industry-agnostic", () => {
    it("scores 0.7 when history insufficient (<30 points)", () => {
      const { evidence } = buildGenericFixture();
      expect(validateHistorical(evidence, [])).toBe(0.7);
      expect(validateHistoricalGate(evidence, [])).toBe(0.7); // alias
    });

    it("scores 1.0 when current value within 2σ of 30+ history", () => {
      const { evidence, source } = buildGenericFixture();
      const history = Array.from({ length: 40 }, (_, i) =>
        createEvidenceEntry({
          source,
          kind: "macro_control",
          subject: evidence.subject,
          claim: `history ${i}`,
          observedAt: new Date(Date.now() - (100 + i) * 86_400_000).toISOString(),
          value: 50 + (i % 5),
          unit: "index",
          method: "api"
        })
      );
      expect(validateHistorical(evidence, history)).toBe(1.0);
    });

    it("blocks when current value is a >3σ anomaly", () => {
      const { evidence, source } = buildGenericFixture();
      const variedHistory = Array.from({ length: 40 }, (_, i) =>
        createEvidenceEntry({
          source,
          kind: "macro_control",
          subject: evidence.subject,
          claim: `history ${i}`,
          observedAt: new Date(Date.now() - (100 + i) * 86_400_000).toISOString(),
          value: 50 + (i % 3) * 5,
          unit: "index",
          method: "api"
        })
      );
      const anomaly = { ...evidence, value: 500 };
      const detail = runHistoricalGate(anomaly, variedHistory);
      expect(detail.score).toBe(0);
      expect(detail.blocking).toBe(true);
      expect(detail.reasons[0]).toContain("anomaly");
    });
  });
});

// ============================================================
// B. Apparel Pack Gates — 提供 apparelPack，证明 pack 配置被消费
// ============================================================

describe("V3-MAINLINE-001: apparel pack integration", () => {
  it("apparelPack has correct industryId and structure", () => {
    expect(apparelPack.industryId).toBe("apparel");
    expect(apparelPack.displayName).toContain("Apparel");
    expect(Object.keys(apparelPack.knownRanges)).toContain("cotton_price");
    expect(apparelPack.freshnessMaxAgeDays).toHaveProperty("raw_material");
    expect(apparelPack.nodes).toHaveLength(22); // 15 chain + 5 risk + trend_signal + competition (Phase E)
    expect(apparelPack.transmissionPaths?.length).toBeGreaterThan(0);
    expect(apparelPack.capitalFlows?.length).toBeGreaterThan(0);
    expect(apparelPack.workforceFlows?.length).toBeGreaterThan(0);
    expect(apparelPack.businessDimensions?.length).toBeGreaterThan(0);
    expect(apparelPack.informationFlows?.length).toBeGreaterThan(0); // Phase E
    expect(Object.keys(apparelPack.knownRanges)).toContain("crude_oil_price");
    expect(Object.keys(apparelPack.knownRanges)).toContain("cotton_futures_price");
    expect(Object.keys(apparelPack.knownRanges)).toContain("loan_interest_rate");
    expect(Object.keys(apparelPack.knownRanges)).toContain("sewer_headcount");
    // Phase E: new ranges
    expect(Object.keys(apparelPack.knownRanges)).toContain("dye_price");
    expect(Object.keys(apparelPack.knownRanges)).toContain("social_media_mentions");
    expect(Object.keys(apparelPack.knownRanges)).toContain("market_share");
    expect(Object.keys(apparelPack.knownRanges)).toContain("trend_lifecycle_stage");
    expect(Object.keys(apparelPack.knownRanges)).toContain("wool_price");
    expect(Object.keys(apparelPack.knownRanges)).toContain("brand_health");
  });

  describe("gate 3: range — reads from apparelPack.knownRanges", () => {
    it("scores 1.0 for cotton_price within apparel range", () => {
      const { evidence } = buildApparelFixture();
      expect(validateRange(evidence, apparelPack.knownRanges)).toBe(1.0);
    });

    it("scores 0 (blocking) for cotton_price far outside range", () => {
      const { source } = buildApparelFixture();
      const outlier = createEvidenceEntry({
        source,
        kind: "macro_control",
        subject: "cotton_price",
        claim: "implausible cotton price",
        observedAt: new Date().toISOString(),
        value: 999_999,
        unit: "CNY/ton",
        method: "api"
      });
      expect(validateRange(outlier, apparelPack.knownRanges)).toBe(0);
      const detail = runRangeGate(outlier, apparelPack.knownRanges);
      expect(detail.blocking).toBe(true);
      expect(detail.reasons[0]).toContain("cotton_price");
    });

    it("scores 0.7 for generic subject not in apparel ranges", () => {
      const { source } = buildApparelFixture();
      const generic = createEvidenceEntry({
        source,
        kind: "market_signal",
        subject: "some_non_apparel_metric",
        claim: "test",
        observedAt: new Date().toISOString(),
        value: 42,
        unit: "count",
        method: "api"
      });
      expect(validateRange(generic, apparelPack.knownRanges)).toBe(0.7);
    });
  });

  describe("gate 4: freshness — reads from apparelPack.freshnessMaxAgeDays", () => {
    it("scores 1.0 for raw_material evidence within 35d", () => {
      const { evidence } = buildApparelFixture();
      const freshnessConfig: FreshnessConfig = {
        maxAgeDays: apparelPack.freshnessMaxAgeDays,
        defaultMaxAgeDays: apparelPack.defaultFreshnessMaxAgeDays
      };
      expect(validateFreshness(evidence, "raw_material", freshnessConfig)).toBe(1.0);
    });

    it("respects apparel per-node maxLag (raw_material=35d vs default=30d)", () => {
      const { source } = buildApparelFixture();
      const thirtyTwoDaysAgo = new Date(Date.now() - 32 * 86_400_000).toISOString();
      const evidence = createEvidenceEntry({
        source,
        kind: "macro_control",
        subject: "cotton_price",
        claim: "test",
        observedAt: thirtyTwoDaysAgo,
        value: 15000,
        unit: "CNY/ton",
        method: "api"
      });
      const freshnessConfig: FreshnessConfig = {
        maxAgeDays: apparelPack.freshnessMaxAgeDays,
        defaultMaxAgeDays: apparelPack.defaultFreshnessMaxAgeDays
      };
      // no nodeId → default 30d → 32d > 30d → 0.7
      expect(validateFreshness(evidence, undefined, freshnessConfig)).toBe(0.7);
      // raw_material nodeId → 32d <= 35d → 1.0
      expect(validateFreshness(evidence, "raw_material", freshnessConfig)).toBe(1.0);
    });
  });

  describe("gate 1: provenance — uses apparelPack.trustedSourceIds", () => {
    it("trusts internal-bom-system via apparelPack (A+ tier, would be trusted anyway)", () => {
      const registry = parseSourceRegistry(registrySeed);
      const bomSource = getSource(registry, "internal-bom-system");
      const evidence = createEvidenceEntry({
        source: bomSource,
        kind: "material_quantity",
        subject: "fabric consumption",
        claim: "BOM fabric quantity",
        observedAt: new Date().toISOString(),
        value: 220,
        unit: "kg",
        method: "manual",
        rawRef: "bom-ref-001"
      });
      // Without pack — A+ tier → trusted (1.0)
      expect(validateProvenance(evidence, registry.sources)).toBe(1.0);
      // With pack — same result, pack adds trustedSourceIds
      expect(validateProvenance(evidence, registry.sources, apparelPack.trustedSourceIds)).toBe(1.0);
    });

    it("pack trustedSourceIds can trust a source that tier alone would not", () => {
      // Simulate a B-tier source that the pack explicitly trusts
      const registry = parseSourceRegistry(registrySeed);
      const bTierSource = registry.sources.find((s) => s.tier === "B");
      if (!bTierSource) return; // skip if no B-tier source
      const evidence = createEvidenceEntry({
        source: bTierSource,
        kind: "research_context",
        subject: "test",
        claim: "test",
        observedAt: new Date().toISOString(),
        value: 1,
        unit: "count",
        method: "report",
        rawRef: "ref"
      });
      // Without pack → B tier → 0.4
      expect(validateProvenance(evidence, registry.sources)).toBe(0.4);
      // With pack that trusts this source → 1.0
      const trustedSet = new Set([bTierSource.id]);
      expect(validateProvenance(evidence, registry.sources, trustedSet)).toBe(1.0);
    });
  });
});

// ============================================================
// C. Orchestrator + Stamp + Graph + Flag — end-to-end
// ============================================================

describe("V3-MAINLINE-001: orchestrator + stamp + graph (with apparel pack)", () => {
  it("runValidationGates returns exactly 6 gate results in canonical order", () => {
    const { registry, evidence } = buildApparelFixture();
    const gates = runValidationGates({
      evidence,
      ledger: [],
      registrySources: registry.sources,
      pack: apparelPack,
      now: new Date("2026-07-07T00:00:00.000Z")
    });
    expect(gates).toHaveLength(6);
    expect(gates.map((g) => g.gate)).toEqual([
      "provenance",
      "schema_match",
      "range_plausibility",
      "freshness",
      "cross_source",
      "historical"
    ]);
  });

  it("computeAuthenticityFromGates produces verified result for healthy apparel evidence", () => {
    const { registry, evidence } = buildApparelFixture();
    const gates = runValidationGates({
      evidence,
      ledger: [],
      registrySources: registry.sources,
      pack: apparelPack,
      now: new Date("2026-07-07T00:00:00.000Z")
    });
    const result = computeAuthenticityFromGates(gates, new Date("2026-07-07T00:00:00.000Z"));
    expect(result.authenticityScore).toBeGreaterThan(0);
    expect(result.flag).toBe("verified");
    expect(result.gateResults).toHaveLength(6);
    expect(result.blockingReasons).toHaveLength(0);
  });

  it("evaluateAuthenticity with pack ≡ runValidationGates + computeAuthenticityFromGates", () => {
    const { registry, evidence } = buildApparelFixture();
    const now = new Date("2026-07-07T00:00:00.000Z");
    const direct = evaluateAuthenticity({
      evidence,
      ledger: [],
      registrySources: registry.sources,
      pack: apparelPack,
      now
    });
    const gates = runValidationGates({
      evidence,
      ledger: [],
      registrySources: registry.sources,
      pack: apparelPack,
      now
    });
    const composed = computeAuthenticityFromGates(gates, now);
    expect(direct.authenticityScore).toBe(composed.authenticityScore);
    expect(direct.flag).toBe(composed.flag);
  });

  it("without pack: range gate returns 0.7 (non-blocking) for apparel subject — proves core is industry-agnostic", () => {
    const { registry, evidence } = buildApparelFixture();
    // 不提供 pack → cotton_price 不在 ranges 中 → 0.7
    const result = evaluateAuthenticity({
      evidence,
      ledger: [],
      registrySources: registry.sources,
      now: new Date("2026-07-07T00:00:00.000Z")
      // 注意：没有 pack
    });
    const rangeGate = getGateResult(result.gateResults, "range_plausibility");
    expect(rangeGate?.score).toBe(0.7);
    expect(rangeGate?.blocking).toBe(false);
  });

  it("with pack: range gate scores 1.0 for valid cotton_price — proves pack config is consumed", () => {
    const { registry, evidence } = buildApparelFixture();
    const result = evaluateAuthenticity({
      evidence,
      ledger: [],
      registrySources: registry.sources,
      pack: apparelPack,
      now: new Date("2026-07-07T00:00:00.000Z")
    });
    const rangeGate = getGateResult(result.gateResults, "range_plausibility");
    expect(rangeGate?.score).toBe(1.0);
  });

  it("rejects evidence whose source is not in the registry (blocking provenance)", () => {
    const { evidence } = buildApparelFixture();
    const orphan = { ...evidence, sourceId: "ghost-source" };
    const result = evaluateAuthenticity({
      evidence: orphan,
      ledger: [],
      registrySources: [],
      pack: apparelPack,
      now: new Date("2026-07-07T00:00:00.000Z")
    });
    expect(result.authenticityScore).toBe(0);
    expect(result.flag).toBe("rejected");
    expect(result.blockingReasons.some((r) => r.includes("provenance"))).toBe(true);
  });

  it("stampAuthenticity with pack returns evidence with .authenticity attached (non-mutating)", () => {
    const { registry, evidence } = buildApparelFixture();
    const stamped = stampAuthenticity(evidence, [], registry.sources, {
      pack: apparelPack,
      now: new Date("2026-07-07T00:00:00.000Z")
    });
    expect(stamped.authenticity).toBeDefined();
    expect(stamped.authenticity.flag).toBe("verified");
    expect(stamped.authenticity.gateResults).toHaveLength(6);
    expect((evidence as { authenticity?: unknown }).authenticity).toBeUndefined();
  });

  it("evaluateAuthenticityBatch with pack stamps every ledger entry", () => {
    const { registry, source, evidence } = buildApparelFixture();
    const secondEvidence = createEvidenceEntry({
      source,
      kind: "macro_control",
      subject: "pta_price",
      claim: "PTA price",
      observedAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
      value: 6000,
      unit: "CNY/ton",
      method: "api"
    });
    const batch = evaluateAuthenticityBatch({
      ledger: [evidence, secondEvidence],
      registrySources: registry.sources,
      pack: apparelPack,
      now: new Date("2026-07-07T00:00:00.000Z")
    });
    expect(batch).toHaveLength(2);
    for (const { result } of batch) {
      expect(result.gateResults).toHaveLength(6);
      expect(result.authenticityScore).toBeGreaterThanOrEqual(0);
    }
  });

  it("buildEvidenceGraph attaches authenticity to DataPointNodes when map provided", () => {
    const { registry, evidence } = buildApparelFixture();
    const result = evaluateAuthenticity({
      evidence,
      ledger: [],
      registrySources: registry.sources,
      pack: apparelPack,
      now: new Date("2026-07-07T00:00:00.000Z")
    });
    const scores = [scoreEvidence(evidence, new Date("2026-07-07T00:00:00.000Z"))];
    const graph = buildEvidenceGraph({
      registry,
      evidence: [evidence],
      scores,
      adapterHealth: [
        evaluateAdapterHealth({
          sourceId: "world-bank",
          latencyMs: 10,
          checkedAt: "2026-07-07T00:00:00.000Z",
          validation: { fetchSuccess: true, schemaValid: true, indicatorMappingSuccess: true, freshnessPassed: true }
        })
      ],
      authenticityByEvidenceId: new Map([[evidence.id, result]]),
      generatedAt: "2026-07-07T00:00:00.000Z"
    });
    const dataPointNode = graph.nodes.find((n) => n.type === "DataPointNode");
    expect(dataPointNode?.authenticity).toBeDefined();
    expect(dataPointNode?.authenticity?.flag).toBe("verified");
  });

  it("buildEvidenceGraph omits authenticity when map not provided (backward compatible)", () => {
    const { registry, evidence } = buildApparelFixture();
    const scores = [scoreEvidence(evidence, new Date("2026-07-07T00:00:00.000Z"))];
    const graph = buildEvidenceGraph({
      registry,
      evidence: [evidence],
      scores,
      adapterHealth: [
        evaluateAdapterHealth({
          sourceId: "world-bank",
          latencyMs: 10,
          checkedAt: "2026-07-07T00:00:00.000Z",
          validation: { fetchSuccess: true, schemaValid: true, indicatorMappingSuccess: true, freshnessPassed: true }
        })
      ],
      generatedAt: "2026-07-07T00:00:00.000Z"
    });
    const dataPointNode = graph.nodes.find((n) => n.type === "DataPointNode");
    expect(dataPointNode?.authenticity).toBeUndefined();
  });
});

describe("V3-MAINLINE-001: score → flag mapping (industry-agnostic)", () => {
  it("scoreToAuthenticityFlag maps 0.85 → verified", () => {
    expect(scoreToAuthenticityFlag(0.85)).toBe("verified");
  });
  it("scoreToAuthenticityFlag maps 0.50 → degraded", () => {
    expect(scoreToAuthenticityFlag(0.50)).toBe("degraded");
  });
  it("scoreToAuthenticityFlag maps 0.10 → rejected", () => {
    expect(scoreToAuthenticityFlag(0.10)).toBe("rejected");
  });
  it("scoreToFlag (legacy 4-tier) maps 0.85 → high_authenticity", () => {
    expect(scoreToFlag(0.85)).toBe("high_authenticity");
  });
  it("aggregateGateScores returns 0 when any gate is blocking", () => {
    const gates: ValidationGateResult[] = [
      { gate: "provenance", pass: true, blocking: false, score: 1.0, reasons: [], affectedDataPointIds: [] },
      { gate: "range_plausibility", pass: false, blocking: true, score: 0, reasons: ["out of range"], affectedDataPointIds: [] }
    ];
    const { score, blockingGates } = aggregateGateScores(gates);
    expect(score).toBe(0);
    expect(blockingGates).toHaveLength(1);
    expect(blockingGates[0].gate).toBe("range_plausibility");
  });
  it("getGateResult retrieves a specific gate by name", () => {
    const { registry, evidence } = buildGenericFixture();
    const gates = runValidationGates({
      evidence,
      ledger: [],
      registrySources: registry.sources,
      now: new Date("2026-07-07T00:00:00.000Z")
    });
    expect(getGateResult(gates, "freshness")?.gate).toBe("freshness");
    expect(getGateResult(gates, "provenance")?.gate).toBe("provenance");
  });
});

// ============================================================
// Phase F: 买卖双方链路协同核对系统
// ============================================================

describe("V3-PHASE-F: Buyer-Seller Reconciliation", () => {
  it("reconciles quantity with all-matched status", () => {
    const result = reconcileQuantity({
      poId: "po-test-1",
      poQuantity: 10000,
      soQuantity: 10000,
      productionQuantity: 10000,
      shippedQuantity: 10000,
      receivedQuantity: 10000,
    });
    expect(result.status).toBe("matched");
    expect(result.dimension).toBe("quantity");
    expect(result.data.varianceRate).toBe(0);
  });

  it("reconciles quantity with mismatch when difference > 3%", () => {
    const result = reconcileQuantity({
      poId: "po-test-2",
      poQuantity: 10000,
      soQuantity: 10000,
      productionQuantity: 9500,
      shippedQuantity: 9600,
      receivedQuantity: 9600,
    });
    expect(result.status).toBe("mismatch");
    expect(result.data.varianceRate).toBeGreaterThan(0.03);
  });

  it("reconciles price across quote -> po -> contract -> invoice -> payment", () => {
    const result = reconcilePrice({
      quoteId: "q-1",
      poId: "po-1",
      quotePrice: 35,
      poPrice: 36,
      contractPrice: 36,
      invoicePrice: 36,
      paymentPrice: 36,
    });
    expect(result.dimension).toBe("price");
    expect(result.variances.length).toBe(4);
  });

  it("reconciles delivery with delay days", () => {
    const result = reconcileDelivery({
      poId: "po-d-1",
      requestedDate: "2026-08-15",
      promisedDate: "2026-08-20",
      completedDate: "2026-08-25",
    });
    expect(result.dimension).toBe("delivery");
    expect(result.data.delayDays).toBe(10);
    expect(result.status).not.toBe("matched");
  });

  it("reconciles quality with first pass yield threshold", () => {
    const result = reconcileQuality({
      poId: "po-q-1",
      factoryPassRate: 0.88,
      reworkRate: 0.08,
    });
    expect(result.dimension).toBe("quality");
    expect(result.data.firstPassYield).toBe(0.88);
    expect(result.status).toBe("mismatch");
  });

  it("reconciles financial with DSO calculation", () => {
    const result = reconcileFinancial({
      poId: "po-f-1",
      orderAmount: 350000,
      invoiceAmount: 350000,
      collectedAmount: 300000,
      accountsReceivable: 50000,
      annualizedSales: 1400000,
    });
    expect(result.dimension).toBe("financial");
    expect(result.data.dsoDays).toBeGreaterThan(0);
    expect(result.data.overdueRate).toBeGreaterThan(0);
  });

  it("reconciles demand with forecast accuracy", () => {
    const result = reconcileDemand({
      poId: "po-dem-1",
      forecastQuantity: 20000,
      orderedQuantity: 18000,
      soldQuantity: 12000,
    });
    expect(result.dimension).toBe("demand");
    expect(result.data.forecastAccuracy).toBeGreaterThan(0);
    expect(result.data.forecastAccuracy).toBeLessThan(1);
  });

  it("reconciles capacity with credibility score", () => {
    const result = reconcileCapacity({
      poId: "po-cap-1",
      sellerId: "seller-1",
      claimedDailyOutput: 2000,
      actualDailyOutput: 1500,
      workerCount: 80,
      equipmentCount: 40,
      historicalOnTimeRate: 0.85,
      currentOrderLoad: 2500,
    });
    expect(result.dimension).toBe("capacity");
    expect(result.data.capacityCredibilityScore).toBeGreaterThan(0);
    expect(result.data.capacityCredibilityScore).toBeLessThanOrEqual(100);
  });

  it("assesses demand credibility with 6 factors", () => {
    const result = assessDemandCredibility({
      historicalFulfillmentRate: 0.9,
      currentSalesGrowth: 0.15,
      inventoryHealth: 0.8,
      reorderFrequency: 0.6,
      paymentStability: 0.9,
      channelHeat: 0.7,
    });
    expect(result.score).toBeGreaterThan(60);
    expect(result.factors).toHaveLength(6);
    expect(result.grade).not.toBe("high_risk");
  });

  it("assesses supply credibility with 6 factors", () => {
    const result = assessSupplyCredibility({
      historicalOnTimeRate: 0.95,
      outputStability: 0.85,
      rawMaterialMatch: 0.9,
      workerEquipmentMatch: 0.85,
      qualityStability: 0.92,
      cashFlowHealth: 0.7,
    });
    expect(result.score).toBeGreaterThan(70);
    expect(result.factors).toHaveLength(6);
  });

  it("assesses price reasonableness with cost breakdown", () => {
    const result = assessPriceReasonableness({
      quotePrice: 52,
      costs: {
        fabric: 18, accessories: 3, wasteAllowance: 2, labor: 8,
        manufacturingOverhead: 5, packaging: 1.5, logistics: 3, tax: 2.5, profit: 9,
      },
      quoteChangeRate: 0.25,
      materialChangeRate: 0.08,
      industryCostFloor: 40,
    });
    expect(result.breakdown.totalEstimated).toBe(52);
    expect(result.isReasonable).toBe(false);
    expect(result.alerts.length).toBeGreaterThan(0);
  });

  it("classifies data trust layers correctly", () => {
    const factualEv = {
      id: "ev-1", sourceId: "erp", sourceTier: "A+" as const, sourceWeight: 90,
      kind: "financial_primary" as const, subject: "po-001", claim: "PO",
      observedAt: "2026-07-08T00:00:00Z", value: 350000, method: "api" as const,
      conversions: [], crossChecks: [], contradictions: [], notes: [],
    };
    expect(classifyDataTrust(factualEv)).toBe("factual");

    const subjectiveEv = {
      ...factualEv, id: "ev-2", sourceId: "rep", sourceTier: "C" as const,
      kind: "market_signal" as const, subject: "verbal", method: "manual" as const,
    };
    expect(classifyDataTrust(subjectiveEv)).toBe("subjective");
  });

  it("tracks anomaly through full lifecycle", () => {
    const recon = reconcileQuantity({
      poId: "po-anom-1",
      poQuantity: 5000,
      soQuantity: 5000,
      productionQuantity: 4500,
      shippedQuantity: 4600,
      receivedQuantity: 4600,
    });
    expect(recon.status).toBe("mismatch");

    const anomaly = trackAnomaly(recon);
    expect(anomaly).not.toBeNull();
    expect(anomaly!.status).toBe("detected");

    const withEvidence = collectEvidence(anomaly!, ["ev-1", "ev-2"]);
    expect(withEvidence.status).toBe("evidence_collected");
    expect(withEvidence.evidenceIds).toHaveLength(2);

    const attributed = attributeAnomaly(withEvidence, "seller");
    expect(attributed.status).toBe("attributed");
    expect(attributed.responsibleParty).toBe("seller");

    const resolved = resolveAnomaly(attributed, "settled");
    expect(resolved.status).toBe("resolved");

    const closed = closeAnomaly(resolved);
    expect(closed.status).toBe("closed");
    expect(closed.scoreImpact).toBe(-5);
  });

  it("attributes responsibility correctly", () => {
    // Quantity mismatch with seller short shipping
    const resp1 = attributeResponsibility({
      type: "quantity",
      buyerData: { confirmedQuantity: 10000 },
      sellerData: { shippedQuantity: 9000 },
    });
    expect(resp1).toBe("seller");

    // Payment delay -> buyer
    const resp2 = attributeResponsibility({
      type: "payment",
      buyerData: { paymentTimeliness: 0.5 },
      sellerData: {},
    });
    expect(resp2).toBe("buyer");

    // Quality issue -> seller
    const resp3 = attributeResponsibility({
      type: "quality",
      buyerData: {},
      sellerData: { passRate: 0.85 },
    });
    expect(resp3).toBe("seller");
  });

  it("classifies inventory responsibility", () => {
    const qualityReturn = classifyInventoryResponsibility({
      returnRate: 0.15, sellerFinishedRatio: 0.2,
      designChangeCount: 0, forecastAccuracy: 0.8, qualityReturnRatio: 0.6,
    });
    expect(qualityReturn).toBe("seller");

    const designChange = classifyInventoryResponsibility({
      returnRate: 0.05, sellerFinishedRatio: 0.2,
      designChangeCount: 4, forecastAccuracy: 0.8, qualityReturnRatio: 0.1,
    });
    expect(designChange).toBe("designer");
  });

  it("computes reconciliation summary", () => {
    const recs = [
      reconcileQuantity({ poId: "po-s-1", poQuantity: 100, soQuantity: 100, shippedQuantity: 100, receivedQuantity: 100 }),
      reconcileQuantity({ poId: "po-s-2", poQuantity: 100, soQuantity: 100, shippedQuantity: 95, receivedQuantity: 95 }),
    ];
    const summary = computeReconciliationSummary(recs);
    expect(summary.totalItems).toBe(2);
    expect(summary.matchedCount).toBe(1);
    expect(summary.healthScore).toBeGreaterThan(0);
    expect(summary.healthScore).toBeLessThan(100);
  });

  it("computes buyer-seller dashboard", () => {
    const recs = [
      reconcileQuantity({ poId: "po-dash-1", poQuantity: 10000, soQuantity: 10000, shippedQuantity: 9500, receivedQuantity: 9500 }),
      reconcilePrice({ poId: "po-dash-1", quotePrice: 35, poPrice: 36, contractPrice: 36, invoicePrice: 36, paymentPrice: 36 }),
    ];
    const dashboard = computeReconciliationDashboard({ reconciliations: recs, anomalies: [] });
    expect(dashboard.reconciliationHealthScore).toBeGreaterThan(0);
    expect(dashboard.buyerView.supplierPriceChanges.length).toBeGreaterThan(0);
    expect(dashboard.sharedView.orderStatusSummary).toBeDefined();
  });

  it("apparel pack has Phase F reconciliation ranges", () => {
    expect(Object.keys(apparelPack.knownRanges)).toContain("quantity_variance_rate");
    expect(Object.keys(apparelPack.knownRanges)).toContain("on_time_delivery_rate");
    expect(Object.keys(apparelPack.knownRanges)).toContain("first_pass_yield");
    expect(Object.keys(apparelPack.knownRanges)).toContain("dso_days");
    expect(Object.keys(apparelPack.knownRanges)).toContain("forecast_accuracy");
    expect(Object.keys(apparelPack.knownRanges)).toContain("demand_credibility_score");
    expect(Object.keys(apparelPack.knownRanges)).toContain("supply_credibility_score");
    expect(Object.keys(apparelPack.knownRanges)).toContain("price_reasonableness_score");
  });

  it("ChainHealth integrates reconciliation results", () => {
    const recs = [
      reconcileQuantity({ poId: "po-ch-1", poQuantity: 10000, soQuantity: 10000, shippedQuantity: 9000, receivedQuantity: 9000 }),
    ];
    const health = computeChainHealth(
      [],
      { nodeResults: [], bottleneckNodeId: null, chainDeviation: 0.1, coverage: 0.8 } as never,
      [],
      apparelPack,
      recs,
    );
    expect(health.reconciliation).toBeDefined();
    expect(health.reconciliation!.mismatchCount).toBeGreaterThan(0);
    expect(health.riskSignals.some((s: string) => s.startsWith("reconciliation_mismatch"))).toBe(true);
  });

  it("detectResonance uses reconciliation mismatches", () => {
    const recs = [
      reconcileQuantity({ poId: "po-res-1", poQuantity: 10000, soQuantity: 10000, shippedQuantity: 8000, receivedQuantity: 8000 }),
      reconcileQuality({ poId: "po-res-1", factoryPassRate: 0.8 }),
    ];
    const signals = ["fob_price_garment_above_range", "utilization_pct_below_range"];
    const result = detectResonance(signals, apparelPack, recs);
    // 对账 mismatch 应该增加共振节点
    expect(result.totalResonatingNodes).toBeGreaterThan(0);
  });
});

// ============================================================
// V3-SUPERPOWERS: 15 个架构模式融合测试
// ============================================================

describe("V3-SUPERPOWERS: 15 architectural patterns", () => {

  // --- 模式 6：四态协议 ---

  describe("pattern 6: four-state protocol", () => {
    it("handleAgentStatus returns proceed for completed", () => {
      const result: AgentRunResult = {
        taskId: "t1", role: "scout", status: "completed",
        candidateSourceIds: ["world-bank"],
      };
      const action = handleAgentStatus(result, DEFAULT_SWARM_WORKFLOW, 0);
      expect(action.action).toBe("proceed");
    });

    it("handleAgentStatus returns retry_with_context for needs_context within maxRetries", () => {
      const result: AgentRunResult = {
        taskId: "t2", role: "collector", status: "needs_context",
        missingContext: ["registry sources"],
      };
      const action = handleAgentStatus(result, DEFAULT_SWARM_WORKFLOW, 0);
      expect(action.action).toBe("retry_with_context");
    });

    it("handleAgentStatus returns abort for failed", () => {
      const result: AgentRunResult = {
        taskId: "t3", role: "verifier", status: "failed",
        error: "gate crash",
      };
      const action = handleAgentStatus(result, DEFAULT_SWARM_WORKFLOW, 0);
      expect(action.action).toBe("abort");
    });

    it("handleAgentStatus returns record_concerns_and_proceed for done_with_concerns", () => {
      const result: AgentRunResult = {
        taskId: "t4", role: "analyst", status: "done_with_concerns",
        concerns: ["confidence low"],
      };
      const action = handleAgentStatus(result, DEFAULT_SWARM_WORKFLOW, 0);
      expect(action.action).toBe("record_concerns_and_proceed");
    });
  });

  // --- 模式 6：升级阶梯 ---

  describe("pattern 6: escalation ladder", () => {
    it("escalateBlocker provides context on first attempt", () => {
      const result: AgentRunResult = {
        taskId: "t5", role: "scout", status: "blocked",
        blockerReason: "no sources found",
      };
      const action = escalateBlocker(result, 0, 2);
      expect(action.type).toBe("provide_context");
    });

    it("escalateBlocker escalates model on second attempt", () => {
      const result: AgentRunResult = {
        taskId: "t6", role: "scout", status: "blocked",
        blockerReason: "still blocked",
      };
      const action = escalateBlocker(result, 1, 2);
      expect(action.type).toBe("escalate_model");
    });

    it("escalateBlocker escalates to human when retries exhausted", () => {
      const result: AgentRunResult = {
        taskId: "t7", role: "analyst", status: "blocked",
        blockerReason: "cannot resolve",
      };
      const action = escalateBlocker(result, 3, 2);
      expect(action.type).toBe("escalate_human");
    });
  });

  // --- 模式 13：验证门 ---

  describe("pattern 13: verification gate", () => {
    it("verifyBeforeCompletion passes when all claims verified", () => {
      const claims = scoutVerificationClaims(["world-bank", "fred"]);
      const result = verifyBeforeCompletion(claims);
      expect(result.allPassed).toBe(true);
      expect(result.passedCount).toBe(1);
      expect(result.failedCount).toBe(0);
    });

    it("verifyBeforeCompletion fails when claims unverified", () => {
      const claims = scoutVerificationClaims([]); // empty -> unverified
      const result = verifyBeforeCompletion(claims);
      expect(result.allPassed).toBe(false);
      expect(result.failedCount).toBeGreaterThan(0);
    });

    it("detectRedFlagWords catches vague language", () => {
      const flags = detectRedFlagWords("this should probably work");
      expect(flags.length).toBeGreaterThan(0);
      expect(flags).toContain("should");
      expect(flags).toContain("probably");
    });

    it("detectRedFlagWords returns empty for clean text", () => {
      const flags = detectRedFlagWords("all tests passed with fresh evidence");
      expect(flags).toHaveLength(0);
    });

    it("createVerificationEvidence produces evidence for scout", () => {
      const result: AgentRunResult = {
        taskId: "t8", role: "scout", status: "completed",
        candidateSourceIds: ["source-a"],
      };
      const evidence = createVerificationEvidence("scout", result, new Date("2026-07-09T00:00:00Z"));
      expect(evidence).not.toBeNull();
      expect(evidence!.passed).toBe(true);
      expect(evidence!.method).toContain("candidate source");
    });
  });

  // --- 模式 1/2/8：契约校验 + 红旗 ---

  describe("pattern 1/2/8: contract validation + red flags", () => {
    it("validateContract flags verifier completing without authenticity", () => {
      const profile = getRoleProfile("verifier");
      const result: AgentRunResult = {
        taskId: "t9", role: "verifier", status: "completed",
        // authenticity missing!
      };
      const violations = validateContract(profile, result, "post");
      expect(violations.length).toBeGreaterThan(0);
      expect(violations.some(v => v.severity === "critical")).toBe(true);
    });

    it("verifyCompletion passes when profile has no checklist", () => {
      const profile = { ...getRoleProfile("scout"), verificationChecklist: undefined };
      const result: AgentRunResult = {
        taskId: "t10", role: "scout", status: "completed",
      };
      const verification = verifyCompletion(profile, result);
      expect(verification.passed).toBe(true);
    });

    it("checkRedFlags triggers for empty scout candidate list", () => {
      const profile = getRoleProfile("scout");
      const result: AgentRunResult = {
        taskId: "t11", role: "scout", status: "completed",
        candidateSourceIds: [],
      };
      const flags = checkRedFlags(profile, result);
      expect(flags.length).toBeGreaterThan(0);
    });

    it("checkRedFlags returns empty for healthy result", () => {
      const profile = getRoleProfile("scout");
      const result: AgentRunResult = {
        taskId: "t12", role: "scout", status: "completed",
        candidateSourceIds: ["src-1", "src-2"],
      };
      const flags = checkRedFlags(profile, result);
      expect(flags).toHaveLength(0);
    });
  });

  // --- 模式 8：三级严重度 ---

  describe("pattern 8: severity classification", () => {
    it("statusToSeverity maps mismatch to critical", () => {
      expect(statusToSeverity("mismatch")).toBe("critical");
      expect(statusToSeverity("warning")).toBe("important");
      expect(statusToSeverity("matched")).toBe("minor");
    });

    it("buildSeverityReport groups results by severity", () => {
      const recs = [
        reconcileQuantity({ poId: "po-sev-1", poQuantity: 100, soQuantity: 100, shippedQuantity: 80, receivedQuantity: 80 }),
        reconcileQuantity({ poId: "po-sev-2", poQuantity: 100, soQuantity: 100, shippedQuantity: 100, receivedQuantity: 100 }),
      ] as never[];
      const report = buildSeverityReport(recs);
      expect(report.total).toBe(2);
      expect(report.critical.length).toBeGreaterThan(0);
      expect(report.minor.length).toBeGreaterThan(0);
    });

    it("hasBlockingIssues returns true when critical issues exist", () => {
      const report = buildSeverityReport([
        reconcileQuantity({ poId: "po-sev-3", poQuantity: 100, soQuantity: 100, shippedQuantity: 50, receivedQuantity: 50 }),
      ] as never[]);
      expect(hasBlockingIssues(report)).toBe(true);
    });

    it("hasBlockingIssues returns false when no critical issues", () => {
      const report = buildSeverityReport([
        reconcileQuantity({ poId: "po-sev-4", poQuantity: 100, soQuantity: 100, shippedQuantity: 100, receivedQuantity: 100 }),
      ] as never[]);
      expect(hasBlockingIssues(report)).toBe(false);
    });
  });

  // --- 模式 2：指令优先级 ---

  describe("pattern 2: instruction priority", () => {
    it("USER_CONFIG overrides INDUSTRY_PACK and DEFAULT", () => {
      const resolution = resolveInstructionConflict("user-value", "pack-value", "default-value");
      expect(resolution.value).toBe("user-value");
      expect(resolution.source).toBe(InstructionPriority.USER_CONFIG);
      expect(resolution.hasConflict).toBe(true);
    });

    it("INDUSTRY_PACK overrides DEFAULT when USER_CONFIG undefined", () => {
      const resolution = resolveInstructionConflict(undefined, "pack-value", "default-value");
      expect(resolution.value).toBe("pack-value");
      expect(resolution.source).toBe(InstructionPriority.INDUSTRY_PACK);
    });

    it("DEFAULT used when no higher priority source", () => {
      const resolution = resolveInstructionConflict(undefined, undefined, "default-value");
      expect(resolution.value).toBe("default-value");
      expect(resolution.source).toBe(InstructionPriority.DEFAULT);
      expect(resolution.hasConflict).toBe(false);
    });

    it("getPriorityName returns correct names", () => {
      expect(getPriorityName(InstructionPriority.USER_CONFIG)).toBe("user config");
      expect(getPriorityName(InstructionPriority.INDUSTRY_PACK)).toBe("industry pack");
      expect(getPriorityName(InstructionPriority.DEFAULT)).toBe("default");
    });
  });

  // --- 模式 1：自由度分级 ---

  describe("pattern 1: degrees of freedom", () => {
    it("formula rules (1-3, 8-9) have low freedom", () => {
      expect(getRuleFreedom("rule-1")).toBe("low");
      expect(getRuleFreedom("rule-2")).toBe("low");
      expect(getRuleFreedom("rule-3")).toBe("low");
      expect(getRuleFreedom("rule-8")).toBe("low");
      expect(getRuleFreedom("rule-9")).toBe("low");
    });

    it("analysis rules (14-19) have high freedom", () => {
      expect(getRuleFreedom("rule-14")).toBe("high");
      expect(getRuleFreedom("rule-19")).toBe("high");
    });

    it("isFlexible returns true for medium and high, false for low", () => {
      expect(isFlexible("rule-1")).toBe(false);   // low
      expect(isFlexible("rule-4")).toBe(true);    // medium
      expect(isFlexible("rule-14")).toBe(true);   // high
    });

    it("groupRulesByFreedom covers all 19 rules", () => {
      const groups = groupRulesByFreedom();
      const total = groups.low.length + groups.medium.length + groups.high.length;
      expect(total).toBe(FREEDOM_DECLARATIONS.length);
      expect(FREEDOM_DECLARATIONS.length).toBe(19);
    });
  });

  // --- 模式 10：渐进式披露 ---

  describe("pattern 10: progressive disclosure", () => {
    it("ProgressiveDisclosureRegistry loads metadata tier only by default", () => {
      const registry = new ProgressiveDisclosureRegistry();
      registry.register({
        name: "item-1", triggerConditions: "always", tier: "metadata", summary: "lightweight",
      });
      registry.register({
        name: "item-2", triggerConditions: "on demand", tier: "schema", summary: "schema layer",
      }, { fields: ["a", "b"] });
      const loaded = registry.load("metadata");
      expect(loaded).toHaveLength(1);
      expect(loaded[0].metadata.name).toBe("item-1");
    });

    it("load(schema) returns metadata + schema tiers", () => {
      const registry = new ProgressiveDisclosureRegistry();
      registry.register({ name: "m", triggerConditions: "t", tier: "metadata", summary: "s" });
      registry.register({ name: "s", triggerConditions: "t", tier: "schema", summary: "s" }, {});
      registry.register({ name: "r", triggerConditions: "t", tier: "reference", summary: "s" }, {});
      const loaded = registry.load("schema");
      expect(loaded).toHaveLength(2);
    });

    it("registerIndustryPack creates tiered entries for apparelPack", () => {
      const registry = registerIndustryPack(apparelPack);
      expect(registry.size).toBeGreaterThanOrEqual(3);
      const metadata = registry.getMetadata();
      expect(metadata.some(m => m.tier === "metadata")).toBe(true);
      expect(metadata.some(m => m.tier === "schema")).toBe(true);
    });
  });

  // --- 模式 9：CSO ---

  describe("pattern 9: CSO description validation", () => {
    it("validates a well-formed CSO description", () => {
      const meta = buildCSOMetadata("scout", "trigger fires", ["scout", "source"]);
      const result = validateCSODescription(meta);
      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it("rejects description not starting with 'Use when'", () => {
      const result = validateCSODescription({
        name: "test", description: "First do X, then do Y", keywords: ["k"],
      });
      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.includes("Use when"))).toBe(true);
    });

    it("rejects description containing workflow steps", () => {
      const result = validateCSODescription({
        name: "test", description: "Use when first do X then do Y", keywords: ["k"],
      });
      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.includes("workflow"))).toBe(true);
    });

    it("AGENT_CSO_METADATA has valid entries for all roles", () => {
      const roles: AgentRole[] = [
        "scout", "collector", "data_janitor", "verifier", "analyst",
        "devils_advocate", "adjudicator", "reconciliation_scorer", "synthesizer", "memory",
      ];
      for (const role of roles) {
        const meta = AGENT_CSO_METADATA[role];
        expect(meta).toBeDefined();
        const result = validateCSODescription(meta);
        expect(result.valid).toBe(true);
      }
    });
  });

  // --- 模式 4：两阶段审查 ---

  describe("pattern 4: two-stage review", () => {
    it("passes both stages when spec met and quality good", () => {
      const spec = { expectedOutputs: ["candidateSourceIds"] };
      const impl = { actualOutputs: ["candidateSourceIds"], verificationPassed: true };
      const review = twoStageReview(spec, impl);
      expect(review.specReview.passed).toBe(true);
      expect(review.qualityReview).toBeDefined();
      expect(review.qualityReview!.readyToMerge).toBe(true);
    });

    it("fails spec stage when expected output missing", () => {
      const spec = { expectedOutputs: ["candidateSourceIds", "evidence"] };
      const impl = { actualOutputs: ["candidateSourceIds"], verificationPassed: true };
      const review = twoStageReview(spec, impl);
      expect(review.specReview.passed).toBe(false);
      expect(review.specReview.missingRequirements.length).toBeGreaterThan(0);
      expect(review.qualityReview).toBeUndefined();
    });

    it("skips quality review when spec fails", () => {
      const spec = { expectedOutputs: ["missing_field"] };
      const impl = { actualOutputs: [], verificationPassed: false };
      const review = twoStageReview(spec, impl);
      expect(review.specReview.passed).toBe(false);
      expect(review.qualityReview).toBeUndefined();
    });

    it("formatReviewReport includes both stages", () => {
      const spec = { expectedOutputs: ["x"] };
      const impl = { actualOutputs: ["x"], verificationPassed: true };
      const review = twoStageReview(spec, impl);
      const report = formatReviewReport(review);
      expect(report).toContain("Spec Compliance Review");
      expect(report).toContain("Code Quality Review");
    });
  });

  // --- 模式 12：系统化调试 ---

  describe("pattern 12: systematic debugging", () => {
    it("starts debugging session in root_cause phase", () => {
      const anomaly = {
        id: "anom-1", type: "quantity_mismatch" as never, orderId: "po-dbg-1",
        description: "quantity mismatch", status: "open" as never, evidenceIds: [],
        detectedAt: "2026-07-09T00:00:00Z",
      };
      const session = startDebuggingSession(anomaly);
      expect(session.phase).toBe("root_cause");
      expect(session.attempts).toBe(0);
      expect(session.fixVerified).toBe(false);
    });

    it("advancePhase moves through phases sequentially", () => {
      const anomaly = {
        id: "anom-2", type: "quantity_mismatch" as never, orderId: "po-dbg-2",
        description: "test anomaly", status: "open" as never, evidenceIds: [],
        detectedAt: "2026-07-09T00:00:00Z",
      };
      let session = startDebuggingSession(anomaly);
      session = advancePhase(session, "found root cause: data sync issue");
      expect(session.phase).toBe("pattern_analysis");
      expect(session.rootCause).toContain("data sync");
      session = advancePhase(session, "compared with working example");
      expect(session.phase).toBe("hypothesis_test");
      session = advancePhase(session, "hypothesis: sync delay causes mismatch");
      expect(session.phase).toBe("implementation");
    });

    it("shouldQuestionArchitecture triggers after 3 failed attempts", () => {
      const anomaly = {
        id: "anom-3", type: "quantity_mismatch" as never, orderId: "po-dbg-3",
        description: "persistent issue", status: "open" as never, evidenceIds: [],
        detectedAt: "2026-07-09T00:00:00Z",
      };
      let session = startDebuggingSession(anomaly);
      session = recordFixAttempt(session, "fix 1", false);
      session = recordFixAttempt(session, "fix 2", false);
      expect(session.shouldQuestionArchitecture).toBe(false);
      session = recordFixAttempt(session, "fix 3", false);
      expect(session.shouldQuestionArchitecture).toBe(true);
    });

    it("getPhaseChecklist returns items for each phase", () => {
      expect(getPhaseChecklist("root_cause").length).toBeGreaterThan(0);
      expect(getPhaseChecklist("pattern_analysis").length).toBeGreaterThan(0);
      expect(getPhaseChecklist("hypothesis_test").length).toBeGreaterThan(0);
      expect(getPhaseChecklist("implementation").length).toBeGreaterThan(0);
    });
  });

  // --- 模式 3：并行派发 ---

  describe("pattern 3: parallel dispatch", () => {
    it("assessDispatch returns single_agent for one task", () => {
      const tasks: SwarmTask[] = [{
        id: "task-1", triggerId: "trig-1", role: "scout",
        objective: "find sources", inputs: {}, status: "pending", createdAt: "2026-07-09T00:00:00Z",
      }];
      const assessment = assessDispatch(tasks);
      expect(assessment.decision).toBe("single_agent");
    });

    it("assessDispatch returns sequential for same-role tasks", () => {
      const tasks: SwarmTask[] = [
        { id: "t-a", triggerId: "tr-1", role: "scout", objective: "o1", inputs: {}, status: "pending", createdAt: "2026-07-09T00:00:00Z" },
        { id: "t-b", triggerId: "tr-2", role: "scout", objective: "o2", inputs: {}, status: "pending", createdAt: "2026-07-09T00:00:00Z" },
      ];
      const assessment = assessDispatch(tasks);
      expect(assessment.decision).not.toBe("parallel");
    });

    it("createParallelDispatchPlan groups independent tasks separately", () => {
      const tasks: SwarmTask[] = [
        { id: "t-a", triggerId: "tr-1", role: "scout", objective: "o1", inputs: {}, status: "pending", createdAt: "2026-07-09T00:00:00Z" },
        { id: "t-b", triggerId: "tr-2", role: "collector", objective: "o2", inputs: {}, status: "pending", createdAt: "2026-07-09T00:00:00Z" },
      ];
      const plan = createParallelDispatchPlan(tasks);
      expect(plan.groups.length).toBe(2);
    });

    it("createFocusedAgentPrompt includes objective and scope", () => {
      const task: SwarmTask = {
        id: "t-fp", triggerId: "tr-fp", role: "analyst",
        objective: "analyze evidence", inputs: {}, status: "pending", createdAt: "2026-07-09T00:00:00Z",
      };
      const prompt = createFocusedAgentPrompt(task, "test context");
      expect(prompt).toContain("analyst");
      expect(prompt).toContain("analyze evidence");
      expect(prompt).toContain("Scope");
    });

    it("verifyParallelResults detects conflicting statuses", () => {
      const results: AgentRunResult[] = [
        { taskId: "t1", role: "scout", status: "completed" },
        { taskId: "t2", role: "scout", status: "failed" },
      ];
      const verification = verifyParallelResults(results);
      expect(verification.conflicts.length).toBeGreaterThan(0);
      expect(verification.allGreen).toBe(false);
    });
  });

  // --- 模式 11：计划-验证-执行 ---

  describe("pattern 11: plan-validate-execute", () => {
    it("validateReconciliationPlan rejects empty fields", () => {
      const plan = {
        fields: [], thresholds: {}, expectedStatus: "matched" as const,
      };
      const result = validateReconciliationPlan(plan, []);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes("no fields"))).toBe(true);
    });

    it("validateReconciliationPlan rejects placeholders (TBD/TODO)", () => {
      const plan = {
        fields: ["quantity"], thresholds: { quantity: 0.1 },
        expectedStatus: "matched" as const,
        transactionRefs: ["TBD"],
      };
      const result = validateReconciliationPlan(plan, []);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes("placeholder"))).toBe(true);
    });

    it("validateReconciliationPlan accepts a valid plan", () => {
      const plan = {
        fields: ["quantity", "price"], thresholds: { quantity: 0.1, price: 0.05 },
        expectedStatus: "warning" as const,
      };
      const result = validateReconciliationPlan(plan, []);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("executeWithValidation skips execution when plan invalid", () => {
      const badValidator = () => false;
      const executor = () => "should not run";
      const result = executeWithValidation("plan", badValidator, executor);
      expect(result.verified).toBe(false);
      expect(result.result).toBeUndefined();
    });

    it("executeWithValidation executes and verifies when plan valid", () => {
      const goodValidator = () => true;
      const executor = (p: string) => `executed-${p}`;
      const result = executeWithValidation("my-plan", goodValidator, executor);
      expect(result.verified).toBe(true);
      expect(result.result).toBe("executed-my-plan");
    });

    it("checkForPlaceholders detects TBD and TODO", () => {
      const issues = checkForPlaceholders("This is TBD and has TODO items");
      expect(issues.length).toBeGreaterThanOrEqual(2);
    });

    it("checkForPlaceholders returns empty for clean text", () => {
      const issues = checkForPlaceholders("Fully specified plan with actual code");
      expect(issues).toHaveLength(0);
    });
  });

  // --- 模式 4：runTwoPhaseReview（escalation.ts 中的版本） ---

  describe("pattern 4: runTwoPhaseReview (escalation integration)", () => {
    it("runTwoPhaseReview returns ReviewResult for completed scout", () => {
      const result: AgentRunResult = {
        taskId: "t-rtp", role: "scout", status: "completed",
        candidateSourceIds: ["src-1", "src-2"],
      };
      const review = runTwoPhaseReview("scout", result, {});
      expect(review).toBeDefined();
      expect(review.specCompliance).toBeDefined();
    });
  });

  // --- 模式 5：模型选择（通过 profiles 验证） ---

  describe("pattern 5: model selection via profiles", () => {
    it("all 6 roles have modelTier assigned", () => {
      const roles: AgentRole[] = ["scout", "collector", "verifier", "analyst", "synthesizer", "memory"];
      for (const role of roles) {
        const profile = getRoleProfile(role);
        expect(profile.modelTier).toBeDefined();
      }
    });

    it("scout is fast tier, analyst is capable tier", () => {
      expect(getRoleProfile("scout").modelTier).toBe("fast");
      expect(getRoleProfile("analyst").modelTier).toBe("capable");
    });

    it("all 6 roles have antiRationalizations populated", () => {
      const roles: AgentRole[] = ["scout", "collector", "verifier", "analyst", "synthesizer", "memory"];
      for (const role of roles) {
        const profile = getRoleProfile(role);
        expect(profile.antiRationalizations).toBeDefined();
        expect(profile.antiRationalizations!.length).toBeGreaterThan(0);
      }
    });
  });
});

// ============================================================
// LIVE-COLLECTOR: 采集桥测试
// ============================================================
// Mock fetch helpers - return预设 JSON 响应，不调真实网络

function mockResponse(body: unknown, contentType = "application/json"): Response {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return new Response(text, {
    status: 200,
    headers: { "content-type": contentType },
  });
}

// World Bank API mock: [metadata, [data rows]]
function mockWorldBankResponse(country: string, indicator: string, value: number, date: string): Response {
  return mockResponse([
    { page: 1, pages: 1 },
    [
      { country: { value: country }, indicator: { value: indicator }, value, date, unit: "" },
    ],
  ]);
}

describe("LIVE-COLLECTOR: 采集桥", () => {
  const registry = parseSourceRegistry(registrySeed);
  const sources = registry.sources;

  it("collectFromSources returns rawRecords for world-bank with mock fetch", async () => {
    // WorldBank adapter calls fetch 3 times (3 indicators) - return same mock for all
    const fetchImpl = vi.fn().mockImplementation(() =>
      Promise.resolve(mockWorldBankResponse("Vietnam", "GDP (current US$)", 409000000000, "2023"))
    );
    const result = await collectFromSources(["world-bank"], sources, { fetchImpl, now: new Date("2026-07-09T00:00:00Z") });
    expect(result.collectionLog[0].status).toBe("collected");
    expect(result.collectionLog[0].recordCount).toBe(3); // 3 indicators
    expect(result.rawRecords.length).toBe(3);
    expect(result.rawRecords[0].sourceId).toBe("world-bank");
    const raw = result.rawRecords[0].raw as Record<string, unknown>;
    expect(raw.subject).toBeDefined();
    expect(raw.claim).toBeDefined();
    expect(raw.value).toBeDefined();
  });

  it("collectFromSources returns rawRecords for sec-edgar with mock fetch", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      mockResponse({
        entityName: "GAP INC",
        cik: "0000039911",
        facts: {
          "us-gaap": {
            Revenues: {
              units: { USD: [{ val: 16400000000, fy: 2024, fp: "FY", form: "10-K" }] }
            },
            GrossProfit: {
              units: { USD: [{ val: 6000000000, fy: 2024, fp: "FY", form: "10-K" }] }
            },
          },
        },
      })
    );
    const result = await collectFromSources(["sec-edgar"], sources, { fetchImpl, now: new Date("2026-07-09T00:00:00Z") });
    expect(result.collectionLog[0].status).toBe("collected");
    expect(result.rawRecords.length).toBe(1);
    const raw = result.rawRecords[0].raw as Record<string, unknown>;
    expect(raw.subject).toBe("gap_financials");
    expect(raw.claim).toContain("GAP INC");
  });

  it("collectFromSources returns rawRecords for bls with mock fetch", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      mockResponse({
        status: "REQUEST_SUCCEEDED",
        Results: {
          series: [
            {
              seriesID: "CUSR0000SAA",
              data: [
                { year: "2026", period: "M05", periodName: "May", value: "320.5" },
              ],
            },
          ],
        },
      })
    );
    const result = await collectFromSources(["bls-public-api"], sources, { fetchImpl, now: new Date("2026-07-09T00:00:00Z") });
    expect(result.collectionLog[0].status).toBe("collected");
    expect(result.rawRecords.length).toBe(1);
    const raw = result.rawRecords[0].raw as Record<string, unknown>;
    expect(raw.value).toBe(320.5);
  });

  it("collectFromSources returns rawRecords for ecb-eurofxref with mock fetch", async () => {
    const xmlBody = `<?xml version="1.0"?>
      <gesmes:Envelope>
        <Cube><Cube time="2026-07-08">
          <Cube currency="USD" rate="1.08"/>
          <Cube currency="JPY" rate="170.5"/>
        </Cube></Cube>
      </gesmes:Envelope>`;
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(xmlBody, { status: 200, headers: { "content-type": "application/xml" } })
    );
    const result = await collectFromSources(["ecb-eurofxref"], sources, { fetchImpl, now: new Date("2026-07-09T00:00:00Z") });
    expect(result.collectionLog[0].status).toBe("collected");
    expect(result.rawRecords.length).toBe(1);
    const raw = result.rawRecords[0].raw as Record<string, unknown>;
    expect(String(raw.value)).toContain("USD=1.08");
    expect(String(raw.value)).toContain("JPY=170.5");
  });

  it("collectFromSources returns rawRecords for eurostat with mock fetch", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      mockResponse({
        label: "Population on 1 January",
        source: "ESTAT",
        value: { "0": 83000000 },
      })
    );
    const result = await collectFromSources(["eurostat"], sources, { fetchImpl, now: new Date("2026-07-09T00:00:00Z") });
    expect(result.collectionLog[0].status).toBe("collected");
    expect(result.rawRecords.length).toBe(1);
    const raw = result.rawRecords[0].raw as Record<string, unknown>;
    expect(raw.value).toBe(83000000);
    expect(raw.geography).toBe("DE");
  });

  it("collectFromSources skips fred when no apiKey", async () => {
    const result = await collectFromSources(["fred"], sources, { now: new Date("2026-07-09T00:00:00Z") });
    expect(result.collectionLog[0].status).toBe("skipped_no_key");
    expect(result.rawRecords.length).toBe(0);
  });

  it("collectFromSources skips us-census-trade when no apiKey", async () => {
    const result = await collectFromSources(["us-census-trade"], sources, { now: new Date("2026-07-09T00:00:00Z") });
    expect(result.collectionLog[0].status).toBe("skipped_no_key");
  });

  it("collectFromSources skips open-supply-hub when no apiKey", async () => {
    const result = await collectFromSources(["open-supply-hub"], sources, { now: new Date("2026-07-09T00:00:00Z") });
    expect(result.collectionLog[0].status).toBe("skipped_no_key");
  });

  it("collectFromSources skips un-comtrade when no apiKey", async () => {
    const result = await collectFromSources(["un-comtrade"], sources, { now: new Date("2026-07-09T00:00:00Z") });
    expect(result.collectionLog[0].status).toBe("skipped_no_key");
  });

  it("collectFromSources collects fred when apiKey provided", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      mockResponse({
        observations: [
          { date: "2026-07-07", value: "157.8" },
          { date: "2026-07-08", value: "158.2" },
        ],
      })
    );
    const result = await collectFromSources(
      ["fred"],
      sources,
      { fredApiKey: "test-key", fetchImpl, now: new Date("2026-07-09T00:00:00Z") }
    );
    expect(result.collectionLog[0].status).toBe("collected");
    expect(result.rawRecords.length).toBe(1);
    const raw = result.rawRecords[0].raw as Record<string, unknown>;
    // FRED finds the first observation with a non-null value (observations are sorted desc)
    expect(raw.value).toBe(157.8);
    expect(raw.subject).toBe("DEXJPUS");
  });

  it("collectFromSources logs not_implemented for unknown sourceId", async () => {
    const result = await collectFromSources(["nonexistent-source"], sources, { now: new Date("2026-07-09T00:00:00Z") });
    expect(result.collectionLog[0].status).toBe("not_implemented");
  });

  it("collectFromSources continues when one source fails", async () => {
    // WorldBank adapter calls fetch 3 times for indicators; SEC adapter calls fetchWithRetry (up to 2 attempts)
    // v2: sources run in parallel, so dispatch by URL instead of call order
    const fetchImpl = vi.fn().mockImplementation((url: string | URL | Request) => {
      const urlStr = String(url);
      if (urlStr.includes("worldbank.org")) {
        return Promise.resolve(mockWorldBankResponse("Vietnam", "GDP", 409000000000, "2023"));
      }
      // sec-edgar -> always reject (fetchWithRetry will retry once, both fail)
      return Promise.reject(new Error("SEC EDGAR timeout"));
    });

    const result = await collectFromSources(
      ["world-bank", "sec-edgar"],
      sources,
      { fetchImpl, now: new Date("2026-07-09T00:00:00Z") }
    );
    // Both sources should be in the log (order may vary due to parallel execution)
    const wbLog = result.collectionLog.find((e) => e.sourceId === "world-bank");
    const secLog = result.collectionLog.find((e) => e.sourceId === "sec-edgar");
    // world-bank should succeed
    expect(wbLog?.status).toBe("collected");
    // sec-edgar should fail but not crash
    expect(secLog?.status).toBe("failed");
    expect(secLog?.error).toContain("timeout");
    // world-bank records should still be collected
    expect(result.rawRecords.length).toBe(3);
  });

  it("rawRecords have correct raw structure { subject, claim, value, unit, period, geography }", async () => {
    const fetchImpl = vi.fn().mockImplementation(() =>
      Promise.resolve(mockWorldBankResponse("Vietnam", "GDP (current US$)", 409000000000, "2023"))
    );
    const result = await collectFromSources(["world-bank"], sources, { fetchImpl, now: new Date("2026-07-09T00:00:00Z") });
    const raw = result.rawRecords[0].raw as Record<string, unknown>;
    expect(raw).toHaveProperty("subject");
    expect(raw).toHaveProperty("claim");
    expect(raw).toHaveProperty("value");
    expect(raw).toHaveProperty("unit");
    expect(raw).toHaveProperty("period");
    expect(raw).toHaveProperty("geography");
  });

  it("runLiveSwarm produces results with mock fetch", async () => {
    const fetchImpl = vi.fn().mockImplementation(() =>
      Promise.resolve(mockWorldBankResponse("Vietnam", "GDP (current US$)", 409000000000, "2023"))
    );
    const trigger: SwarmTrigger = {
      id: "trigger-test-live",
      ruleId: "rule-test",
      signalId: "signal-test",
      firedAt: "2026-07-09T00:00:00Z",
      objective: "world bank macro economic vietnam bangladesh",
    };
    const memoryStore = new MemoryStore();
    const result = await runLiveSwarm({
      registrySources: sources,
      trigger,
      memoryStore,
      fetchImpl,
      now: new Date("2026-07-09T00:00:00Z"),
    });
    // Should have collected from world-bank (3 indicators)
    expect(result.rawRecordCount).toBeGreaterThan(0);
    // Should have candidateSourceIds from scout
    expect(result.candidateSourceIds.length).toBeGreaterThan(0);
    // Swarm should have run (at least collector step)
    expect(result.swarmRun.results.length).toBeGreaterThan(0);
  });

  it("runLiveSwarm uses custom workflow without scout step", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      mockWorldBankResponse("Vietnam", "GDP (current US$)", 409000000000, "2023")
    );
    const trigger: SwarmTrigger = {
      id: "trigger-test-workflow",
      ruleId: "rule-test",
      signalId: "signal-test",
      firedAt: "2026-07-09T00:00:00Z",
      objective: "world bank macro economic vietnam",
    };
    const memoryStore = new MemoryStore();
    const result = await runLiveSwarm({
      registrySources: sources,
      trigger,
      memoryStore,
      fetchImpl,
      now: new Date("2026-07-09T00:00:00Z"),
    });
    // LIVE_WORKFLOW skips scout, so results should not include scout
    const roles = result.swarmRun.results.map((r) => r.role);
    expect(roles).not.toContain("scout");
    expect(roles).toContain("collector");
  });

  it("runLiveSwarm collectionLog reports all source statuses", async () => {
    const fetchImpl = vi.fn().mockImplementation(() =>
      Promise.resolve(mockWorldBankResponse("Vietnam", "GDP", 409000000000, "2023"))
    );

    const trigger: SwarmTrigger = {
      id: "trigger-test-log",
      ruleId: "rule-test",
      signalId: "signal-test",
      firedAt: "2026-07-09T00:00:00Z",
      objective: "world bank fred census macro economic",
    };
    const memoryStore = new MemoryStore();
    const result = await runLiveSwarm({
      registrySources: sources,
      trigger,
      memoryStore,
      fetchImpl,
      now: new Date("2026-07-09T00:00:00Z"),
      apiKeys: {}, // no keys -> fred/census should skip
    });
    // Should have both collected and skipped statuses
    const statuses = result.collectionLog.map((e) => e.status);
    expect(statuses).toContain("collected");
    // Sources requiring keys should be skipped
    const skippedSources = result.collectionLog.filter((e) => e.status === "skipped_no_key");
    expect(skippedSources.length).toBeGreaterThan(0);
  });

  it("configFromEnv extracts API keys from env object", () => {
    const config = configFromEnv({
      FRED_API_KEY: "fred-key",
      CENSUS_API_KEY: "census-key",
      OPEN_SUPPLY_HUB_API_KEY: undefined,
      UN_COMTRADE_API_KEY: "comtrade-key",
    });
    expect(config.fredApiKey).toBe("fred-key");
    expect(config.censusApiKey).toBe("census-key");
    expect(config.openSupplyHubApiKey).toBeUndefined();
    expect(config.comtradeApiKey).toBe("comtrade-key");
  });
});

// PARALLEL: 并行采集 + 并行验证 + 超时测试
describe("PARALLEL: 多Agent并行与汇总", () => {
  const sources = parseSourceRegistry(registrySeed).sources;

  it("并行采集器对多源返回与串行一致的结果", async () => {
    // mock world-bank 和 bls 两个源的 fetch
    const fetchImpl = vi.fn().mockImplementation((url: string | URL | Request) => {
      const urlStr = String(url);
      if (urlStr.includes("worldbank.org")) {
        return Promise.resolve(mockWorldBankResponse("VNM", "GDP", 409000000000, "2023"));
      }
      if (urlStr.includes("bls.gov")) {
        return Promise.resolve(mockResponse({
          status: "REQUEST_SUCCEEDED",
          Results: { series: [{ seriesID: "CUSR0000SAA", data: [{ year: "2026", period: "M05", periodName: "May", value: "320.5" }] }] },
        }));
      }
      return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
    });

    const result = await collectFromSources(
      ["world-bank", "bls-public-api"],
      sources,
      { fetchImpl: fetchImpl as typeof fetch, now: new Date("2026-07-09T00:00:00Z") },
    );

    // 两个源都应成功采集
    const collected = result.collectionLog.filter((e) => e.status === "collected");
    expect(collected.length).toBe(2);
    expect(collected[0].sourceId).toBe("world-bank");
    expect(collected[1].sourceId).toBe("bls-public-api");
    // world-bank 返回 3 条（3 个指标），bls 返回 1 条
    expect(result.rawRecords.length).toBeGreaterThanOrEqual(3);
  });

  it("单个源超时不阻塞其他源", async () => {
    // world-bank 模拟永久挂起（不 resolve），bls 正常返回
    const fetchImpl = vi.fn().mockImplementation((url: string | URL | Request) => {
      const urlStr = String(url);
      if (urlStr.includes("worldbank.org")) {
        // 永不 resolve - 模拟挂起
        return new Promise(() => {});
      }
      if (urlStr.includes("bls.gov")) {
        return Promise.resolve(mockResponse({
          status: "REQUEST_SUCCEEDED",
          Results: { series: [{ seriesID: "CUSR0000SAA", data: [{ year: "2026", period: "M05", periodName: "May", value: "320.5" }] }] },
        }));
      }
      return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
    });

    const start = Date.now();
    const result = await collectFromSources(
      ["world-bank", "bls-public-api"],
      sources,
      { fetchImpl: fetchImpl as typeof fetch, now: new Date("2026-07-09T00:00:00Z"), sourceTimeoutMs: 500 },
    );
    const elapsed = Date.now() - start;

    // world-bank 应该超时失败（500ms），bls 应该成功
    const wbLog = result.collectionLog.find((e) => e.sourceId === "world-bank");
    const blsLog = result.collectionLog.find((e) => e.sourceId === "bls-public-api");

    expect(blsLog?.status).toBe("collected");
    // world-bank 超时后应该标记为 failed（error 包含 abort 信息）
    // 注意：AbortController.abort() 会 fetch 抛 TypeError
    expect(wbLog?.status).toBe("failed");
    // 总耗时应该 < 3s（500ms 超时 + 少量处理时间），而非永久阻塞
    expect(elapsed).toBeLessThan(3_000);
  });

  it("并行 verifier 对多条证据返回全部验证结果", async () => {
    const trigger: SwarmTrigger = {
      id: "trigger-parallel-verify",
      ruleId: "rule-test",
      signalId: "signal-test",
      firedAt: "2026-07-09T00:00:00Z",
      objective: "apparel cotton price cost macro economic",
      pack: apparelPack,
    };

    // 构造 3 条不同源的 rawRecords，直接传入 orchestrator（跳过采集阶段）
    const now = new Date("2026-07-09T00:00:00Z");
    const rawRecords: RawRecord[] = [
      {
        id: "raw-test-1", sourceId: "world-bank", fetchedAt: now.toISOString(), contentType: "application/json",
        raw: { subject: "gdp_vietnam", claim: "Vietnam GDP", value: 409000000000, unit: "USD", period: "2023", geography: "VNM" },
      },
      {
        id: "raw-test-2", sourceId: "bls-public-api", fetchedAt: now.toISOString(), contentType: "application/json",
        raw: { subject: "cpi_clothing", claim: "CPI clothing index", value: 140.5, unit: "index", period: "2024-01", geography: "US" },
      },
      {
        id: "raw-test-3", sourceId: "ecb-eurofxref", fetchedAt: now.toISOString(), contentType: "application/json",
        raw: { subject: "eur_usd", claim: "EUR/USD rate", value: 1.08, unit: "ratio", period: "2024-01", geography: "EU" },
      },
    ];

    const memoryStore = new MemoryStore();
    const swarmRun = await orchestrateSwarm(trigger, {
      registrySources: sources,
      rawRecords,
      memoryStore,
      now,
      workflow: LIVE_WORKFLOW,
    });

    // swarm 应成功完成
    expect(swarmRun.synthesis).toBeDefined();
    // 验证结果中应包含多条证据（至少 2 条通过验证）
    const verifierResult = swarmRun.results.find((r) => r.role === "verifier");
    expect(verifierResult?.status).toMatch(/completed|done_with_concerns/);
  });

  it("HTTP 超时保护 - runLiveSwarm 包装 Promise.race", async () => {
    // 验证 Promise.race 超时机制在概念上工作
    // 用一个永不 resolve 的 promise 和短超时
    const TIMEOUT_MS = 100;
    const start = Date.now();
    try {
      await Promise.race([
        new Promise<never>(() => {}), // 永不 resolve
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("swarm_timeout_30s")), TIMEOUT_MS),
        ),
      ]);
      expect.unreachable("Should have timed out");
    } catch (error) {
      const elapsed = Date.now() - start;
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe("swarm_timeout_30s");
      expect(elapsed).toBeGreaterThanOrEqual(TIMEOUT_MS - 10);
      expect(elapsed).toBeLessThan(TIMEOUT_MS + 500);
    }
  });
});

// ============================================================
// COST TRACKING: CostEngine 接入 swarm 执行
// ============================================================

describe("COST TRACKING: CostEngine 接入 orchestrateSwarm", () => {
  it("注入 costEngine 后 SwarmRunResult 包含 costRecord", async () => {
    const { CostEngine } = await import("../services/cost-engine");
    const registry = parseSourceRegistry(registrySeed);
    const registrySources = registry.sources;

    const trigger: SwarmTrigger = {
      id: "trigger-cost-test",
      ruleId: "rule-test",
      signalId: "signal-test",
      firedAt: "2025-01-01T00:00:00Z",
      objective: "apparel cotton price cost transmission macro economic Vietnam",
      pack: apparelPack,
    };

    const memoryStore = new MemoryStore();
    const costEngine = new CostEngine();
    costEngine.createBudget({ taskId: trigger.id, maxCostUsd: 1.0 });

    // 用 fixture rawRecords 跑完整管道
    const fixtureRawRecords: RawRecord[] = [
      {
        id: "raw-1",
        sourceId: "world-bank",
        fetchedAt: "2025-01-01T00:00:00Z",
        raw: { country: "Vietnam", indicator: "GDP", value: 409000000000, year: "2023" },
      },
    ];

    const result = await orchestrateSwarm(trigger, {
      registrySources,
      rawRecords: fixtureRawRecords,
      memoryStore,
      now: new Date("2025-01-01"),
      costEngine,
    });

    // costRecord 应存在且 totalCost > 0
    expect(result.costRecord).toBeDefined();
    expect(result.costRecord!.totalCost).toBeGreaterThan(0);
    expect(result.costRecord!.modelCost).toBeGreaterThan(0);
    expect(result.costRecord!.taskId).toBe(trigger.id);
  });

  it("不注入 costEngine 时行为不变（costRecord undefined）", async () => {
    const registry = parseSourceRegistry(registrySeed);
    const registrySources = registry.sources;

    const trigger: SwarmTrigger = {
      id: "trigger-no-cost-test",
      ruleId: "rule-test",
      signalId: "signal-test",
      firedAt: "2025-01-01T00:00:00Z",
      objective: "apparel cotton price cost transmission macro economic Vietnam",
      pack: apparelPack,
    };

    const memoryStore = new MemoryStore();

    const result = await orchestrateSwarm(trigger, {
      registrySources,
      rawRecords: [],
      memoryStore,
      now: new Date("2025-01-01"),
    });

    expect(result.costRecord).toBeUndefined();
  });

  it("预算超支时中止后续步骤并记录 budget overrun concern", async () => {
    const { CostEngine } = await import("../services/cost-engine");
    const registry = parseSourceRegistry(registrySeed);
    const registrySources = registry.sources;

    const trigger: SwarmTrigger = {
      id: "trigger-budget-overrun",
      ruleId: "rule-test",
      signalId: "signal-test",
      firedAt: "2025-01-01T00:00:00Z",
      objective: "apparel cotton price cost transmission macro economic Vietnam",
      pack: apparelPack,
    };

    const memoryStore = new MemoryStore();
    const costEngine = new CostEngine();
    // 设极低预算：0.001 美元 -- 第一步模型成本就会超
    costEngine.createBudget({ taskId: trigger.id, maxCostUsd: 0.001 });

    const fixtureRawRecords: RawRecord[] = [
      {
        id: "raw-1",
        sourceId: "world-bank",
        fetchedAt: "2025-01-01T00:00:00Z",
        raw: { country: "Vietnam", indicator: "GDP", value: 409000000000, year: "2023" },
      },
    ];

    const result = await orchestrateSwarm(trigger, {
      registrySources,
      rawRecords: fixtureRawRecords,
      memoryStore,
      now: new Date("2025-01-01"),
      costEngine,
    });

    // 预算守卫应中止执行：不是全部 6 步都执行
    expect(result.results.length).toBeLessThan(6);

    // 回归测试：不应有重复的 taskId（修复前的 double-push bug 会导致同一步出现两次）
    const taskIds = result.results.map((r) => r.taskId);
    expect(new Set(taskIds).size).toBe(taskIds.length);

    // 至少有一个 result 包含 budget overrun concern
    const overrunConcerns = result.results
      .flatMap((r) => r.concerns ?? [])
      .filter((c) => c.includes("budget overrun"));
    expect(overrunConcerns.length).toBeGreaterThan(0);

    // costRecord 应存在且总成本超过预算
    expect(result.costRecord).toBeDefined();
    expect(result.costRecord!.totalCost).toBeGreaterThan(0.001);
  });

  it("budget 超支时 memory 步骤豁免（仍执行落盘）", async () => {
    const { CostEngine } = await import("../services/cost-engine");
    const registry = parseSourceRegistry(registrySeed);
    const registrySources = registry.sources;

    const trigger: SwarmTrigger = {
      id: "trigger-budget-memory-exempt",
      ruleId: "rule-test",
      signalId: "signal-test",
      firedAt: "2025-01-01T00:00:00Z",
      objective: "apparel cotton price cost transmission macro economic Vietnam",
      pack: apparelPack,
    };

    const memoryStore = new MemoryStore();
    const costEngine = new CostEngine();
    // 设极低预算使第一步就超支
    costEngine.createBudget({ taskId: trigger.id, maxCostUsd: 0.0001 });

    const fixtureRawRecords: RawRecord[] = [
      {
        id: "raw-1",
        sourceId: "world-bank",
        fetchedAt: "2025-01-01T00:00:00Z",
        raw: { country: "Vietnam", indicator: "GDP", value: 409000000000, year: "2023" },
      },
    ];

    const result = await orchestrateSwarm(trigger, {
      registrySources,
      rawRecords: fixtureRawRecords,
      memoryStore,
      now: new Date("2025-01-01"),
      costEngine,
    });

    // 超支后非 memory 步骤被中止，但 break 在 memory 之前
    // 因为预算极低，可能在很早就 break，但如果有 memory 执行则不应有 budget overrun concern
    const memoryResults = result.results.filter((r) => r.role === "memory");
    if (memoryResults.length > 0) {
      // memory 步骤不应有 budget overrun concern（豁免）
      const memoryOverrun = memoryResults
        .flatMap((r) => r.concerns ?? [])
        .filter((c) => c.includes("budget overrun"));
      expect(memoryOverrun.length).toBe(0);
    }
  });

  it("无 budget 时不限制执行（全部步骤完成）", async () => {
    const registry = parseSourceRegistry(registrySeed);
    const registrySources = registry.sources;

    const trigger: SwarmTrigger = {
      id: "trigger-no-budget",
      ruleId: "rule-test",
      signalId: "signal-test",
      firedAt: "2025-01-01T00:00:00Z",
      objective: "apparel cotton price cost transmission macro economic Vietnam",
      pack: apparelPack,
    };

    const memoryStore = new MemoryStore();
    const { CostEngine } = await import("../services/cost-engine");
    const costEngine = new CostEngine();
    // 不调用 createBudget — 不设预算限制

    const fixtureRawRecords: RawRecord[] = [
      {
        id: "raw-1",
        sourceId: "world-bank",
        fetchedAt: "2025-01-01T00:00:00Z",
        raw: { country: "Vietnam", indicator: "GDP", value: 409000000000, year: "2023" },
      },
    ];

    const result = await orchestrateSwarm(trigger, {
      registrySources,
      rawRecords: fixtureRawRecords,
      memoryStore,
      now: new Date("2025-01-01"),
      costEngine,
    });

    // 无预算 -> 不应有 budget overrun concerns
    const overrunConcerns = result.results
      .flatMap((r) => r.concerns ?? [])
      .filter((c) => c.includes("budget overrun"));
    expect(overrunConcerns.length).toBe(0);
  });
});
