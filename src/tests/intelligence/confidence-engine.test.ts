import { describe, expect, it } from "vitest";
import registrySeed from "../../../data/intelligence-source-registry.seed.json";
import {
  buildEvidenceGraph,
  calculateConfidenceScore,
  createEvidenceEntry,
  evaluateAdapterHealth,
  getSource,
  parseSourceRegistry,
  scoreEvidence
} from "../../intelligence";
import type { ConflictReport } from "../../intelligence";

function buildGraphWithDataPointCount(count: number) {
  const registry = parseSourceRegistry(registrySeed);
  const source = getSource(registry, "world-bank");
  const evidence = Array.from({ length: count }, (_, index) =>
    createEvidenceEntry({
      source,
      kind: "macro_control",
      subject: `Vietnam indicator ${index}`,
      claim: `World Bank reports indicator ${index}`,
      observedAt: "2026-07-03T00:00:00.000Z",
      period: "2024",
      geography: "Vietnam",
      value: 100 + index,
      unit: "index",
      method: "api",
      conversions: ["native"],
      crossChecks: ["fred"]
    })
  );
  const health = [
    evaluateAdapterHealth({
      sourceId: "world-bank",
      latencyMs: 10,
      checkedAt: "2026-07-03T00:00:00.000Z",
      validation: { fetchSuccess: true, schemaValid: true, indicatorMappingSuccess: true, freshnessPassed: true }
    })
  ];
  return {
    graph: buildEvidenceGraph({
      registry,
      evidence,
      scores: evidence.map((entry) => scoreEvidence(entry, new Date("2026-07-03T00:00:00.000Z"))),
      adapterHealth: health,
      generatedAt: "2026-07-03T00:00:00.000Z"
    }),
    health
  };
}

describe("Confidence Engine v1", () => {
  it("returns bounded confidence with required breakdown and warnings", () => {
    const { graph, health } = buildGraphWithDataPointCount(1);
    const result = calculateConfidenceScore({ graph, adapterHealth: health, conflicts: [] });

    expect(result.value).toBeGreaterThanOrEqual(0);
    expect(result.value).toBeLessThanOrEqual(1);
    expect(result.breakdown).toHaveProperty("sourceReliability");
    expect(result.breakdown).toHaveProperty("dataCompleteness");
    expect(result.breakdown).toHaveProperty("freshnessScore");
    expect(result.breakdown).toHaveProperty("crossSourceAgreement");
    expect(result.breakdown).toHaveProperty("conflictPenalty");
    expect(result.breakdown.crossSourceAgreement).toBeLessThanOrEqual(0.2);
    expect(result.warnings).toContain("Data completeness is low.");
  });

  it("decreases when conflictPenalty rises or dataCompleteness falls and supports configurable weights", () => {
    const high = buildGraphWithDataPointCount(6);
    const low = buildGraphWithDataPointCount(1);
    const conflict: ConflictReport = {
      id: "value_mismatch:a:b",
      type: "value_mismatch",
      severity: "high",
      involvedNodeIds: ["a", "b"],
      suggestedResolution: "weighted_average"
    };

    const highCompleteness = calculateConfidenceScore({ graph: high.graph, adapterHealth: high.health, conflicts: [] });
    const lowCompleteness = calculateConfidenceScore({ graph: low.graph, adapterHealth: low.health, conflicts: [] });
    const withConflict = calculateConfidenceScore({ graph: high.graph, adapterHealth: high.health, conflicts: [conflict] });
    const customWeights = calculateConfidenceScore({
      graph: high.graph,
      adapterHealth: high.health,
      conflicts: [],
      options: { weights: { dataCompleteness: 0.5, sourceReliability: 0.2 } }
    });

    expect(highCompleteness.value).toBeGreaterThan(lowCompleteness.value);
    expect(withConflict.value).toBeLessThan(highCompleteness.value);
    expect(customWeights.value).toBeGreaterThanOrEqual(0);
  });

  it("does not increase confidence when missing credentials are added", () => {
    const { graph, health } = buildGraphWithDataPointCount(6);
    const baseline = calculateConfidenceScore({ graph, adapterHealth: health, conflicts: [] });
    const withMissingCredential = calculateConfidenceScore({
      graph,
      adapterHealth: [
        ...health,
        evaluateAdapterHealth({
          sourceId: "fred",
          latencyMs: 0,
          checkedAt: "2026-07-03T00:00:00.000Z",
          resultStatus: "missing_credentials",
          credentialRequired: true,
          credentialPresent: false,
          validation: { fetchSuccess: false, schemaValid: false, indicatorMappingSuccess: false, freshnessPassed: false }
        })
      ],
      conflicts: []
    });

    expect(withMissingCredential.value).toBeLessThanOrEqual(baseline.value);
    expect(withMissingCredential.perSourceConfidence.fred).toBe(0);
  });

  it("returns zero when all sources are failed and no usable evidence exists", () => {
    const { graph } = buildGraphWithDataPointCount(0);
    const failedHealth = [
      evaluateAdapterHealth({
        sourceId: "failed",
        latencyMs: 1,
        checkedAt: "2026-07-03T00:00:00.000Z",
        resultStatus: "adapter_error",
        validation: { fetchSuccess: false, schemaValid: false, indicatorMappingSuccess: false, freshnessPassed: false }
      })
    ];
    const result = calculateConfidenceScore({ graph, adapterHealth: failedHealth, conflicts: [] });

    expect(result.value).toBe(0);
  });
});
