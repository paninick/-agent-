import { describe, expect, it } from "vitest";
import registrySeed from "../../../data/intelligence-source-registry.seed.json";
import {
  buildEvidenceGraph,
  calculateConfidenceScore,
  createEvidenceEntry,
  detectConflicts,
  evaluateAdapterHealth,
  evaluateVisualizationReadiness,
  getSource,
  parseSourceRegistry,
  scoreEvidence,
  summarizeAdapterHealth
} from "../../intelligence";

describe("verify-intelligence-sources output contract", () => {
  it("contains stabilization v1 output fields without top-level verifiedSourceCount", () => {
    const registry = parseSourceRegistry(registrySeed);
    const source = getSource(registry, "world-bank");
    const evidence = [
      createEvidenceEntry({
        source,
        kind: "macro_control",
        subject: "Vietnam GDP",
        claim: "World Bank reports Vietnam GDP",
        observedAt: "2026-07-03T00:00:00.000Z",
        period: "2024",
        geography: "Vietnam",
        value: 100,
        unit: "USD",
        method: "api",
        conversions: ["native"],
        crossChecks: ["fred"]
      })
    ];
    const adapterHealthSnapshot = [
      evaluateAdapterHealth({
        sourceId: "world-bank",
        latencyMs: 10,
        checkedAt: "2026-07-03T00:00:00.000Z",
        validation: { fetchSuccess: true, schemaValid: true, indicatorMappingSuccess: true, freshnessPassed: true }
      })
    ];
    const healthSummary = summarizeAdapterHealth(adapterHealthSnapshot);
    const evidenceGraphSnapshot = buildEvidenceGraph({
      registry,
      evidence,
      scores: evidence.map((entry) => scoreEvidence(entry, new Date("2026-07-03T00:00:00.000Z"))),
      adapterHealth: adapterHealthSnapshot,
      generatedAt: "2026-07-03T00:00:00.000Z"
    });
    const conflictList = detectConflicts(evidenceGraphSnapshot);
    const confidence = calculateConfidenceScore({ graph: evidenceGraphSnapshot, adapterHealth: adapterHealthSnapshot, conflicts: conflictList });
    const output = {
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
      conflictList,
      visualizationReadiness: evaluateVisualizationReadiness({
        evidenceGraph: evidenceGraphSnapshot,
        adapterHealth: adapterHealthSnapshot,
        confidenceScore: confidence.value
      }),
      missingCredentials: ["fred"],
      warnings: confidence.warnings,
      compatibility: { deprecatedVerifiedSourceCount: healthSummary.healthySourceCount }
    };

    expect(output).toHaveProperty("sourceCount");
    expect(output).toHaveProperty("healthySourceCount");
    expect(output).toHaveProperty("degradedSourceCount");
    expect(output).toHaveProperty("failedSourceCount");
    expect(output).toHaveProperty("unavailableSourceCount");
    expect(output).toHaveProperty("sourceResultBreakdown");
    expect(output).toHaveProperty("failedSourceBreakdown");
    expect(output).toHaveProperty("unavailableSourceBreakdown");
    expect(output).toHaveProperty("adapterHealthSnapshot");
    expect(output).toHaveProperty("evidenceGraphSnapshot");
    expect(output).toHaveProperty("confidenceScore");
    expect(output).toHaveProperty("confidenceBreakdown");
    expect(output).toHaveProperty("conflictList");
    expect(output).toHaveProperty("visualizationReadiness");
    expect(output).toHaveProperty("missingCredentials");
    expect(output).toHaveProperty("warnings");
    expect(Object.prototype.hasOwnProperty.call(output, "verifiedSourceCount")).toBe(false);
    expect(output.compatibility.deprecatedVerifiedSourceCount).toBe(output.healthySourceCount);
    expect(Object.values(output.sourceResultBreakdown).reduce((total, value) => total + value, 0)).toBe(output.sourceCount);
    expect(Object.values(output.failedSourceBreakdown).reduce((total, value) => total + value, 0)).toBe(output.failedSourceCount);
    expect(Object.values(output.unavailableSourceBreakdown).reduce((total, value) => total + value, 0)).toBe(output.unavailableSourceCount);
  });
});
