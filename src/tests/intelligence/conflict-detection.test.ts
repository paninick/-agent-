import { describe, expect, it } from "vitest";
import registrySeed from "../../../data/intelligence-source-registry.seed.json";
import {
  buildEvidenceGraph,
  createEvidenceEntry,
  detectConflicts,
  evaluateAdapterHealth,
  getSource,
  parseSourceRegistry,
  scoreEvidence
} from "../../intelligence";

describe("Conflict Detection v1", () => {
  it("detects value, unit, and time-window mismatches", () => {
    const registry = parseSourceRegistry(registrySeed);
    const wb = getSource(registry, "world-bank");
    const bls = getSource(registry, "bls-public-api");
    const entries = [
      createEvidenceEntry({
        source: wb,
        kind: "macro_control",
        subject: "Vietnam apparel cost index",
        claim: "World Bank proxy value",
        observedAt: "2026-07-03T00:00:00.000Z",
        period: "2024",
        geography: "Vietnam",
        value: 100,
        unit: "index",
        method: "api",
        conversions: ["native"],
        crossChecks: ["bls-public-api"]
      }),
      createEvidenceEntry({
        source: bls,
        kind: "macro_control",
        subject: "Vietnam apparel cost index",
        claim: "BLS proxy value",
        observedAt: "2026-07-03T00:00:00.000Z",
        period: "2024",
        geography: "Vietnam",
        value: 160,
        unit: "index",
        method: "api",
        conversions: ["native"],
        crossChecks: ["world-bank"]
      }),
      createEvidenceEntry({
        source: wb,
        kind: "macro_control",
        subject: "Vietnam apparel cost index",
        claim: "World Bank unit mismatch value",
        observedAt: "2026-07-03T00:00:00.000Z",
        period: "2024",
        geography: "Vietnam",
        value: 101,
        unit: "USD",
        method: "api",
        conversions: ["native"],
        crossChecks: ["bls-public-api"]
      }),
      createEvidenceEntry({
        source: bls,
        kind: "macro_control",
        subject: "Vietnam apparel cost index",
        claim: "BLS later time window",
        observedAt: "2026-07-03T00:00:00.000Z",
        period: "2025",
        geography: "Vietnam",
        value: 102,
        unit: "index",
        method: "api",
        conversions: ["native"],
        crossChecks: ["world-bank"]
      })
    ];
    const health = [wb, bls].map((source) =>
      evaluateAdapterHealth({
        sourceId: source.id,
        latencyMs: 10,
        checkedAt: "2026-07-03T00:00:00.000Z",
        validation: { fetchSuccess: true, schemaValid: true, indicatorMappingSuccess: true, freshnessPassed: true }
      })
    );
    const graph = buildEvidenceGraph({
      registry,
      evidence: entries,
      scores: entries.map((entry) => scoreEvidence(entry, new Date("2026-07-03T00:00:00.000Z"))),
      adapterHealth: health,
      generatedAt: "2026-07-03T00:00:00.000Z"
    });

    const conflicts = detectConflicts(graph, { valueMismatchThresholdPct: 0.2 });

    expect(conflicts.map((conflict) => conflict.type)).toEqual(
      expect.arrayContaining(["value_mismatch", "unit_mismatch", "time_window_mismatch"])
    );
    expect(conflicts.every((conflict) => ["low", "medium", "high"].includes(conflict.severity))).toBe(true);
    expect(
      conflicts.every((conflict) =>
        ["weighted_average", "prefer_latest", "manual_review", "flag_unresolved"].includes(conflict.suggestedResolution)
      )
    ).toBe(true);
  });
});
