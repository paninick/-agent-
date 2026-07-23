import { describe, expect, it } from "vitest";
import registrySeed from "../../../data/intelligence-source-registry.seed.json";
import { buildEvidenceGraph, createEvidenceEntry, evaluateAdapterHealth, getSource, parseSourceRegistry, scoreEvidence } from "../../intelligence";

describe("Evidence Graph v1", () => {
  it("builds source, data point, entity, and indicator nodes with required edges", () => {
    const registry = parseSourceRegistry(registrySeed);
    const entry = createEvidenceEntry({
      source: getSource(registry, "world-bank"),
      kind: "macro_control",
      subject: "Vietnam GDP",
      claim: "World Bank reports Vietnam GDP",
      observedAt: "2026-07-03T00:00:00.000Z",
      period: "2024",
      geography: "Vietnam",
      value: 476,
      unit: "USD",
      method: "api",
      url: "https://api.worldbank.org/v2/",
      rawRef: "world-bank:gdp:vietnam:2024",
      conversions: ["native"],
      crossChecks: ["fred"]
    });
    const health = evaluateAdapterHealth({
      sourceId: "world-bank",
      latencyMs: 10,
      checkedAt: "2026-07-03T00:00:00.000Z",
      validation: { fetchSuccess: true, schemaValid: true, indicatorMappingSuccess: true, freshnessPassed: true }
    });
    const graph = buildEvidenceGraph({
      registry,
      evidence: [entry],
      scores: [scoreEvidence(entry, new Date("2026-07-03T00:00:00.000Z"))],
      adapterHealth: [health],
      generatedAt: "2026-07-03T00:00:00.000Z"
    });

    expect(graph.summary.sourceNodeCount).toBe(23);
    expect(graph.summary.dataPointNodeCount).toBe(1);
    expect(graph.summary.entityNodeCount).toBe(1);
    expect(graph.summary.indicatorNodeCount).toBe(1);
    expect(graph.nodes.every((node) => node.timestamp && node.provenance.sourceId && typeof node.confidence === "number")).toBe(true);
    expect(graph.nodes.find((node) => node.type === "EntityNode")?.provenance).toMatchObject({
      url: "https://api.worldbank.org/v2/",
      rawRef: "world-bank:gdp:vietnam:2024"
    });
    expect(graph.nodes.find((node) => node.type === "IndicatorNode")?.provenance).toMatchObject({
      url: "https://api.worldbank.org/v2/",
      rawRef: "world-bank:gdp:vietnam:2024"
    });
    expect(graph.edges.map((edge) => edge.type)).toEqual(expect.arrayContaining(["derived_from", "describes", "supports"]));
    expect(graph.edges.every((edge) => typeof edge.weight === "number" && typeof edge.confidence === "number")).toBe(true);
  });
});
