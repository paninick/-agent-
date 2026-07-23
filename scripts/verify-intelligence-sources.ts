import { config as loadEnv } from "dotenv";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import registrySeed from "../data/intelligence-source-registry.seed.json" with { type: "json" };
import {
  assessMonitoringCoverage,
  blsPointToEvidence,
  buildEvidenceGraph,
  calculateConfidenceScore,
  calculateMaterialRequirements,
  comtradeFlowToEvidence,
  createEvidenceAdapter,
  detectConflicts,
  ecbFxRatesToEvidence,
  eurostatPointToEvidence,
  evaluateAdapterHealth,
  evaluateBrandChainGate,
  evaluateConclusionGate,
  evaluateVisualizationReadiness,
  executeAdapter,
  failedValidation,
  fetchBlsLatestSeriesPoint,
  fetchComtradeFlowSummary,
  fetchEcbEuroReferenceRates,
  fetchEurostatDataPoint,
  fetchFredLatestObservation,
  fetchOpenSupplyHubSearch,
  fetchSecCompanyMetricSet,
  fetchUsCensusImportHs,
  fetchWorldBankIndicator,
  fredPointToEvidence,
  getSource,
  healthyValidation,
  materialRequirementToEvidence,
  openSupplyHubSearchToEvidence,
  parseSourceRegistry,
  reconcileObservedMaterialQuantity,
  scoreEvidence,
  secMetricSetToEvidence,
  summarizeAdapterHealth,
  type AdapterHealth,
  type EvidenceEntry,
  type EvidenceScore,
  type IntelligenceSource,
  type SecCompanyMetricSet,
  type SourceVerificationResult,
  usCensusTradeToEvidence,
  worldBankPointToEvidence
} from "../src/intelligence";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });

const credentialRequirements = [
  { sourceId: "fred", envVar: "FRED_API_KEY", purpose: "FRED FX/rates/macro series probe" },
  { sourceId: "us-census-trade", envVar: "CENSUS_API_KEY", purpose: "U.S. HS-level import trade probe" },
  { sourceId: "open-supply-hub", envVar: "OPEN_SUPPLY_HUB_API_KEY", purpose: "facility identity probe" },
  { sourceId: "un-comtrade", envVar: "UN_COMTRADE_API_KEY", purpose: "global customs mirror probe" }
] as const;

const verificationArtifactPath = "outputs/intelligence/verification-latest.json";
const implementedAdapterSourceIds = new Set([
  "world-bank",
  "sec-edgar",
  "eurostat",
  "ecb-eurofxref",
  "bls-public-api",
  "fred",
  "us-census-trade",
  "open-supply-hub",
  "un-comtrade"
]);

async function main() {
  const registry = parseSourceRegistry(registrySeed);
  const evidence: EvidenceEntry[] = [];
  const scores: EvidenceScore[] = [];
  const verifications: SourceVerificationResult[] = [];
  const healthBySourceId = new Map<string, AdapterHealth>();
  let gapMetricSet: SecCompanyMetricSet | undefined;

  await runAdapterProbe(registry, verifications, evidence, scores, healthBySourceId, "world-bank", async () => {
    const source = getSource(registry, "world-bank");
    const gdpPoint = await fetchWorldBankIndicator({ country: "VNM", indicator: "NY.GDP.MKTP.CD" });
    const tariffPoint = await fetchWorldBankIndicator({ country: "VNM", indicator: "TM.TAX.MRCH.WM.AR.ZS" });
    const laborPoint = await fetchWorldBankIndicator({ country: "BGD", indicator: "SL.TLF.CACT.FE.ZS" });
    return [
      worldBankPointToEvidence(source, gdpPoint),
      worldBankPointToEvidence(source, tariffPoint),
      worldBankPointToEvidence(source, laborPoint)
    ];
  });

  await runAdapterProbe(registry, verifications, evidence, scores, healthBySourceId, "sec-edgar", async () => {
    const metricSet = await fetchSecCompanyMetricSet({ cik: "39911" });
    gapMetricSet = metricSet;
    return secMetricSetToEvidence(getSource(registry, "sec-edgar"), metricSet);
  });

  await runAdapterProbe(registry, verifications, evidence, scores, healthBySourceId, "eurostat", async () => {
    const point = await fetchEurostatDataPoint({
      dataset: "demo_pjan",
      filters: { geo: "DE", sex: "T", age: "TOTAL", time: "2024" }
    });
    return eurostatPointToEvidence(getSource(registry, "eurostat"), point);
  });

  await runAdapterProbe(registry, verifications, evidence, scores, healthBySourceId, "ecb-eurofxref", async () => {
    const rates = await fetchEcbEuroReferenceRates();
    return ecbFxRatesToEvidence(getSource(registry, "ecb-eurofxref"), rates);
  });

  await runAdapterProbe(registry, verifications, evidence, scores, healthBySourceId, "bls-public-api", async () => {
    const currentYear = new Date().getUTCFullYear();
    const point = await fetchBlsLatestSeriesPoint({
      seriesId: "CUSR0000SAA",
      startYear: currentYear - 1,
      endYear: currentYear
    });
    return blsPointToEvidence(getSource(registry, "bls-public-api"), point);
  });

  if (process.env.FRED_API_KEY) {
    await runAdapterProbe(registry, verifications, evidence, scores, healthBySourceId, "fred", async () => {
      const point = await fetchFredLatestObservation({
        seriesId: "DEXJPUS",
        apiKey: process.env.FRED_API_KEY as string
      });
      return fredPointToEvidence(getSource(registry, "fred"), point);
    });
  } else {
    recordCredentialMissing(registry, verifications, healthBySourceId, "fred", "FRED_API_KEY is not set.");
  }

  if (process.env.CENSUS_API_KEY) {
    await runAdapterProbe(registry, verifications, evidence, scores, healthBySourceId, "us-census-trade", async () => {
      const record = await fetchUsCensusImportHs({
        time: "2024-12",
        commodityCode: "611020",
        countryCode: "5700",
        apiKey: process.env.CENSUS_API_KEY as string
      });
      return usCensusTradeToEvidence(getSource(registry, "us-census-trade"), record);
    });
  } else {
    recordCredentialMissing(
      registry,
      verifications,
      healthBySourceId,
      "us-census-trade",
      "CENSUS_API_KEY is not set; local unauthenticated probe returned the official Missing Key page."
    );
  }

  if (process.env.OPEN_SUPPLY_HUB_API_KEY) {
    await runAdapterProbe(registry, verifications, evidence, scores, healthBySourceId, "open-supply-hub", async () => {
      const summary = await fetchOpenSupplyHubSearch({
        query: "Shenzhou",
        apiKey: process.env.OPEN_SUPPLY_HUB_API_KEY as string
      });
      return openSupplyHubSearchToEvidence(getSource(registry, "open-supply-hub"), summary);
    });
  } else {
    recordCredentialMissing(
      registry,
      verifications,
      healthBySourceId,
      "open-supply-hub",
      "OPEN_SUPPLY_HUB_API_KEY is not set; unauthenticated probe returned 401 in local testing."
    );
  }

  if (process.env.UN_COMTRADE_API_KEY) {
    await runAdapterProbe(registry, verifications, evidence, scores, healthBySourceId, "un-comtrade", async () => {
      const summary = await fetchComtradeFlowSummary({
        reporterCode: "392",
        partnerCode: "156",
        commodityCode: "61",
        period: "2024",
        apiKey: process.env.UN_COMTRADE_API_KEY as string
      });
      return comtradeFlowToEvidence(getSource(registry, "un-comtrade"), summary);
    });
  } else {
    recordCredentialMissing(
      registry,
      verifications,
      healthBySourceId,
      "un-comtrade",
      "UN_COMTRADE_API_KEY is not set; use the official API subscription key header for physical verification."
    );
  }

  const counterEvidence = createCounterEvidenceAuditCase(registry);
  evidence.push(counterEvidence);
  scores.push(scoreEvidence(counterEvidence));

  const adapterHealthSnapshot = completeAdapterHealthSnapshot(registry.sources, healthBySourceId);
  const healthSummary = summarizeAdapterHealth(adapterHealthSnapshot);
  const evidenceGraphSnapshot = buildEvidenceGraph({
    registry,
    evidence,
    scores,
    adapterHealth: adapterHealthSnapshot
  });
  const conflictList = detectConflicts(evidenceGraphSnapshot);
  const confidence = calculateConfidenceScore({
    graph: evidenceGraphSnapshot,
    adapterHealth: adapterHealthSnapshot,
    conflicts: conflictList
  });
  const credentialStatus = credentialRequirements.map((requirement) => ({
    sourceId: requirement.sourceId,
    envVar: requirement.envVar,
    status: process.env[requirement.envVar] ? "present" as const : "missing" as const,
    purpose: requirement.purpose
  }));
  const missingCredentials = credentialStatus
    .filter((credential) => credential.status === "missing")
    .map((credential) => credential.sourceId);
  const visualizationReadiness = evaluateVisualizationReadiness({
    evidenceGraph: evidenceGraphSnapshot,
    adapterHealth: adapterHealthSnapshot,
    confidenceScore: confidence.value,
    missingFields: missingCredentials.length > 0 ? ["missingCredentials"] : [],
    warnings: confidence.warnings
  });
  const gate = evaluateConclusionGate(registry, evidence, scores);
  const brandChainGate = evaluateBrandChainGate({
    brand: gapMetricSet?.entityName ?? "GAP, INC",
    evidence,
    scores,
    verifications
  });
  const coverage = assessMonitoringCoverage(registry);
  const warnings = unique([
    ...confidence.warnings,
    ...visualizationReadiness.warnings,
    ...(missingCredentials.length > 0 ? ["Missing credentials reduce coverage and confidence."] : [])
  ]);

  const output = {
    checkedAt: new Date().toISOString(),
    registryVersion: registry.version,
    artifact: {
      path: verificationArtifactPath,
      bounded: true,
      containsSecrets: false,
      note: "This artifact stores normalized verification output only; API keys are reported as present/missing and never serialized."
    },
    sourceCount: healthSummary.sourceCount,
    healthySourceCount: healthSummary.healthySourceCount,
    degradedSourceCount: healthSummary.degradedSourceCount,
    failedSourceCount: healthSummary.failedSourceCount,
    unavailableSourceCount: healthSummary.unavailableSourceCount,
    sourceResultBreakdown: healthSummary.sourceResultBreakdown,
    failedSourceBreakdown: healthSummary.failedSourceBreakdown,
    unavailableSourceBreakdown: healthSummary.unavailableSourceBreakdown,
    adapterHealthSnapshot,
    evidenceGraphSnapshot,
    confidenceScore: confidence.value,
    confidenceBreakdown: confidence.breakdown,
    perSourceConfidence: confidence.perSourceConfidence,
    conflictList,
    visualizationReadiness,
    missingCredentials,
    warnings,
    compatibility: {
      deprecatedVerifiedSourceCount: healthSummary.healthySourceCount
    },
    credentialStatus,
    verifications,
    brandPilot: gapMetricSet
      ? {
          company: gapMetricSet.entityName,
          cik: gapMetricSet.cik,
          metrics: gapMetricSet.metrics.map((metric) => ({
            canonicalName: metric.canonicalName,
            tag: metric.tag,
            value: metric.value,
            unit: metric.unit,
            fy: metric.fy,
            fp: metric.fp,
            form: metric.form,
            filed: metric.filed,
            end: metric.end
          })),
          derived: gapMetricSet.derived,
          interpretation:
            "This pilot proves SEC financial metrics can be extracted for brand-level cost, margin, and inventory analysis. It does not prove supplier shipments."
        }
      : undefined,
    evidence: evidence.map((entry, index) => ({
      id: entry.id,
      sourceId: entry.sourceId,
      tier: entry.sourceTier,
      kind: entry.kind,
      subject: entry.subject,
      claim: entry.claim,
      value: entry.value,
      period: entry.period,
      contradictions: entry.contradictions,
      confidence: scores[index].confidence,
      classification: scores[index].classification
    })),
    gate,
    brandChainGate,
    coverage: coverage.map((item) => ({
      dimensionId: item.dimensionId,
      status: item.status,
      matchedSourceIds: item.matchedSources.map((source) => source.id),
      missingCoverage: item.missingCoverage
    })),
    interpretation:
      visualizationReadiness.status === "ready"
        ? "Verification layer is ready for visualization under the current evidence snapshot."
        : `Verification layer is ${visualizationReadiness.status}; degraded outputs are for monitoring and exploration, not final decisions.`
  };

  await persistVerificationArtifact(output);
  console.log(JSON.stringify(output, null, 2));
}

async function runAdapterProbe(
  registry: ReturnType<typeof parseSourceRegistry>,
  verifications: SourceVerificationResult[],
  evidence: EvidenceEntry[],
  scores: EvidenceScore[],
  healthBySourceId: Map<string, AdapterHealth>,
  sourceId: string,
  probe: () => Promise<EvidenceEntry | EvidenceEntry[]>
) {
  const source = getSource(registry, sourceId);
  const checkedAt = new Date().toISOString();
  const result = await executeAdapter(
    createEvidenceAdapter({
      source,
      fetch: probe
    }),
    { checkedAt }
  );
  evidence.push(...result.evidence);
  scores.push(...result.scores);
  verifications.push(result.verification);
  healthBySourceId.set(sourceId, result.health);
}

export function recordCredentialMissing(
  registry: ReturnType<typeof parseSourceRegistry>,
  verifications: SourceVerificationResult[],
  healthBySourceId: Map<string, AdapterHealth>,
  sourceId: string,
  message: string
) {
  const source = getSource(registry, sourceId);
  const checkedAt = new Date().toISOString();
  const health = evaluateAdapterHealth({
    sourceId,
    latencyMs: 0,
    checkedAt,
    failureReason: message,
    resultStatus: "missing_credentials",
    credentialRequired: true,
    credentialPresent: false,
    validation: failedValidation()
  });
  healthBySourceId.set(sourceId, health);
  verifications.push({
    sourceId: source.id,
    status: "skipped_auth_required",
    message,
    checkedAt
  });
}

export function completeAdapterHealthSnapshot(
  sources: IntelligenceSource[],
  healthBySourceId: Map<string, AdapterHealth>,
  checkedAt = new Date().toISOString()
) {
  return sources.map((source) => {
    const existingHealth = healthBySourceId.get(source.id);
    if (existingHealth) return existingHealth;
    const missingCredential = missingCredentialRequirement(source.id);
    if (missingCredential) {
      return evaluateAdapterHealth({
        sourceId: source.id,
        latencyMs: 0,
        checkedAt,
        failureReason: `${missingCredential.envVar} is not set.`,
        resultStatus: "missing_credentials",
        credentialRequired: true,
        credentialPresent: false,
        validation: failedValidation()
      });
    }
    const adapterImplemented = implementedAdapterSourceIds.has(source.id);
    return evaluateAdapterHealth({
      sourceId: source.id,
      latencyMs: 0,
      checkedAt,
      failureReason: adapterImplemented
        ? "adapter exists but was not executed in this verification run"
        : "adapter not implemented for this verification profile",
      resultStatus: adapterImplemented ? "not_probed" : "adapter_not_implemented",
      credentialRequired: source.requiresAuth !== false,
      credentialPresent: false,
      validation: failedValidation()
    });
  });
}

function createCounterEvidenceAuditCase(registry: ReturnType<typeof parseSourceRegistry>): EvidenceEntry {
  const materialModel = calculateMaterialRequirements({
    styleId: "audit-counterexample-knit-base-tee",
    finishedUnits: 10000,
    fabricKgPerUnit: 0.22,
    cuttingWasteRate: 0.08,
    yarnToFabricYieldRate: 0.94,
    assumptions: [
      "Counter-evidence audit case; not a real GAP style.",
      "Used to prove contradiction penalties are retained in verification output."
    ]
  });
  const reconciliation = reconcileObservedMaterialQuantity(materialModel, {
    label: "synthetic supplier yarn shipment",
    material: "yarn",
    quantityKg: 3100,
    tolerancePct: 0.05
  });

  return materialRequirementToEvidence({
    source: getSource(registry, "internal-bom-system"),
    result: materialModel,
    reconciliations: [reconciliation]
  });
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

async function persistVerificationArtifact(output: unknown) {
  await mkdir(dirname(verificationArtifactPath), { recursive: true });
  await writeFile(verificationArtifactPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
}

function missingCredentialRequirement(sourceId: string) {
  const requirement = credentialRequirements.find((item) => item.sourceId === sourceId);
  if (!requirement) return undefined;
  return process.env[requirement.envVar] ? undefined : requirement;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
