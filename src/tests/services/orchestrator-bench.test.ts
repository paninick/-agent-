/**
 * Performance benchmark for orchestrateSwarm
 *
 * Measures wall-clock time for a full swarm run with empty data (no network).
 * This is NOT a hard assertion — it logs timing data and only fails if the
 * run takes > 5s (indicating a performance regression).
 */
import { describe, expect, it } from "vitest";
import registrySeed from "../../../data/intelligence-source-registry.seed.json";
import {
  orchestrateSwarm,
  parseSourceRegistry,
  apparelPack,
  type SwarmTrigger,
} from "../../intelligence";
import { MemoryStore } from "../../intelligence/memory/store";

const SWARM_ROLES = 6;
const SOURCE_COUNT = 24;

describe("Orchestrator performance", () => {
  it("completes a full swarm run within 5s with empty records", async () => {
    const registry = parseSourceRegistry(registrySeed);
    const trigger: SwarmTrigger = {
      id: "bench-empty",
      ruleId: "rule-bench",
      signalId: "signal-bench",
      firedAt: "2025-01-01T00:00:00Z",
      objective: "apparel cotton price cost transmission macro economic Vietnam Bangladesh",
      pack: apparelPack,
    };

    const start = performance.now();
    const result = await orchestrateSwarm(trigger, {
      registrySources: registry.sources,
      rawRecords: [],
      memoryStore: new MemoryStore(),
      now: new Date("2025-01-01"),
    });
    const elapsed = performance.now() - start;

    // Log for visibility (shows in test output)
    // eslint-disable-next-line no-console
    console.log(`  ⏱️  orchestrateSwarm (empty records): ${elapsed.toFixed(0)}ms`);

    // Hard upper bound: 5s. With empty data this should be < 1s.
    // The 5s threshold catches regressions (e.g. accidental blocking I/O).
    expect(elapsed).toBeLessThan(5000);

    // Sanity: should produce results
    expect(result.results.length).toBeGreaterThan(0);
    expect(result.results.length).toBeLessThanOrEqual(SWARM_ROLES);
  });

  it("completes a full swarm run with 50 raw records within 5s", async () => {
    const registry = parseSourceRegistry(registrySeed);
    const trigger: SwarmTrigger = {
      id: "bench-50",
      ruleId: "rule-bench",
      signalId: "signal-bench",
      firedAt: "2025-01-01T00:00:00Z",
      objective: "apparel cotton price cost transmission macro economic Vietnam Bangladesh",
      pack: apparelPack,
    };

    // Generate 50 minimal raw records
    const rawRecords = Array.from({ length: 50 }, (_, i) => ({
      id: `raw-${i}`,
      sourceId: "world-bank",
      fetchedAt: "2025-01-01T00:00:00Z",
      raw: { country: "Vietnam", indicator: "GDP", value: i * 1_000_000, year: "2023" },
    }));

    const start = performance.now();
    const result = await orchestrateSwarm(trigger, {
      registrySources: registry.sources,
      rawRecords,
      memoryStore: new MemoryStore(),
      now: new Date("2025-01-01"),
    });
    const elapsed = performance.now() - start;

    // eslint-disable-next-line no-console
    console.log(`  ⏱️  orchestrateSwarm (50 records): ${elapsed.toFixed(0)}ms`);

    expect(elapsed).toBeLessThan(5000);
    expect(result.results.length).toBeGreaterThan(0);
  });

  it("source registry parsing is fast (< 100ms)", () => {
    const start = performance.now();
    // Parse 10 times to get a stable measurement
    for (let i = 0; i < 10; i++) {
      parseSourceRegistry(registrySeed);
    }
    const elapsed = performance.now() - start;

    const avgPerParse = elapsed / 10;
    // eslint-disable-next-line no-console
    console.log(`  ⏱️  parseSourceRegistry avg: ${avgPerParse.toFixed(2)}ms (${SOURCE_COUNT} sources, 10 iterations)`);

    expect(avgPerParse).toBeLessThan(100);
  });
});