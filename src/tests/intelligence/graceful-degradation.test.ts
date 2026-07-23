import { describe, expect, it } from "vitest";
import registrySeed from "../../../data/intelligence-source-registry.seed.json";
import {
  buildEvidenceGraph,
  createEvidenceEntry,
  evaluateAdapterHealth,
  evaluateVisualizationReadiness,
  getSource,
  parseSourceRegistry,
  scoreEvidence
} from "../../intelligence";

function graphWithHealth(status: "healthy" | "degraded" | "failed", confidenceScore: number) {
  const registry = parseSourceRegistry(registrySeed);
  const source = getSource(registry, "world-bank");
  const evidence = status === "failed"
    ? []
    : [
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
  const health = [
    evaluateAdapterHealth({
      sourceId: "world-bank",
      latencyMs: 10,
      checkedAt: "2026-07-03T00:00:00.000Z",
      validation:
        status === "healthy"
          ? { fetchSuccess: true, schemaValid: true, indicatorMappingSuccess: true, freshnessPassed: true }
          : status === "degraded"
            ? { fetchSuccess: true, schemaValid: true, indicatorMappingSuccess: true, freshnessPassed: false }
            : { fetchSuccess: false, schemaValid: false, indicatorMappingSuccess: false, freshnessPassed: false }
    })
  ];
  const graph = buildEvidenceGraph({
    registry,
    evidence,
    scores: evidence.map((entry) => scoreEvidence(entry, new Date("2026-07-03T00:00:00.000Z"))),
    adapterHealth: health,
    generatedAt: "2026-07-03T00:00:00.000Z"
  });
  return evaluateVisualizationReadiness({
    evidenceGraph: graph,
    adapterHealth: health,
    confidenceScore,
    options: { minimumHealthySources: 1, readyThreshold: 0.72 }
  });
}

describe("Graceful Degradation", () => {
  it("returns ready, degraded, and blocked according to usable evidence and confidence", () => {
    expect(graphWithHealth("healthy", 0.8).status).toBe("ready");

    const degraded = graphWithHealth("healthy", 0.4);
    expect(degraded.status).toBe("degraded");
    expect(degraded.missingFields).toContain("readyThreshold");
    expect(degraded.warnings).toContain("Visualization is allowed only in degraded mode.");

    expect(graphWithHealth("failed", 0).status).toBe("blocked");
    expect(graphWithHealth("healthy", 0).status).toBe("blocked");
    expect(graphWithHealth("failed", 0.3).status).toBe("blocked");
  });
});
