/**
 * data-janitor.test.ts - Data Janitor Agent 测试
 *
 * 测试数据清洗、规范化、异常检测、范围定位
 */

import { describe, expect, it } from "vitest";
import { executeDataJanitor } from "../intelligence/swarm/agents/data-janitor";
import type { SwarmTask } from "../intelligence/spine/types";
import type { EvidenceEntry } from "../intelligence/types";
import { apparelPack } from "../intelligence/analysis/industryPacks/apparel";

function makeTask(objective = "test objective"): SwarmTask {
  return {
    id: "task-janitor-1",
    triggerId: "trigger-1",
    role: "data_janitor",
    objective,
    status: "running",
    inputs: {},
    createdAt: new Date().toISOString(),
  };
}

function makeEvidence(overrides: Partial<EvidenceEntry> = {}): EvidenceEntry {
  return {
    id: "ev-1",
    sourceId: "source-1",
    sourceTier: "A",
    sourceWeight: 1.0,
    kind: "market_signal",
    subject: "cotton_price",
    claim: "Cotton price at 12000 CNY/ton",
    observedAt: new Date().toISOString(),
    method: "api",
    conversions: [],
    crossChecks: [],
    contradictions: [],
    notes: [],
    value: 12000,
    unit: "CNY/ton",
    ...overrides,
  };
}

describe("Data Janitor Agent", () => {
  it("handles empty evidence list", () => {
    const task = makeTask();
    const result = executeDataJanitor({ task, evidenceList: [] });

    expect(result.status).toBe("failed");
    expect(result.error).toBe("no evidence from collector");
  });

  it("detects duplicates based on subject+period", () => {
    const task = makeTask();
    const ev1 = makeEvidence({ id: "ev-1", subject: "cotton_price", period: "2024-Q1" });
    const ev2 = makeEvidence({ id: "ev-2", subject: "cotton_price", period: "2024-Q1", value: 12500 });

    const result = executeDataJanitor({ task, evidenceList: [ev1, ev2] });

    expect(result.status).toBe("completed");
    expect(result.janitorOutput).toBeDefined();
    expect(result.janitorOutput?.cleaningLog).toBeDefined();
    // Should have at least one cleaning log entry for duplicate detection
    const dedupeEntries = result.janitorOutput?.cleaningLog.filter((e) =>
      e.transform === "duplicate_merged"
    );
    expect(dedupeEntries?.length ?? 0).toBeGreaterThan(0);
    // Should return only one normalized evidence (deduplicated)
    expect(result.evidenceList?.length).toBe(1);
  });

  it("normalizes FRED units", () => {
    const task = makeTask();
    const ev = makeEvidence({
      subject: "USDJPY",
      value: "150.5",
      unit: "FRED series native unit (JPY per USD)",
    });

    const result = executeDataJanitor({ task, evidenceList: [ev] });

    expect(result.status).toBe("completed");
    expect(result.janitorOutput?.cleaningLog).toBeDefined();
    const unitConversionEntries = result.janitorOutput?.cleaningLog.filter((e) =>
      e.transform === "unit_conversion"
    );
    expect(unitConversionEntries?.length ?? 0).toBeGreaterThan(0);
    // Should extract unit from FRED string
    const entry = unitConversionEntries?.[0];
    expect(entry?.normalizedUnit).toBe("JPY per USD");
  });

  it("positions values within known ranges", () => {
    const task = makeTask();
    // cotton_price range in apparel pack: 10000-18000 CNY/ton
    const ev = makeEvidence({ subject: "cotton_price", value: 14000, unit: "CNY/ton" });

    const result = executeDataJanitor({ task, evidenceList: [ev], pack: apparelPack });

    expect(result.status).toBe("completed");
    expect(result.janitorOutput?.cleaningLog).toBeDefined();
    const rangeEntries = result.janitorOutput?.cleaningLog.filter((e) =>
      e.transform === "range_positioned"
    );
    expect(rangeEntries?.length ?? 0).toBeGreaterThan(0);
    // 14000 is at 50% of [10000, 18000] range
    const rangeEntry = rangeEntries?.[0];
    expect(rangeEntry?.note).toContain("50%");
  });

  it("flags anomalies when value exceeds range by >50%", () => {
    const task = makeTask();
    // cotton_price range: 10000-18000, value 30000 is 12000 above max (150% overflow)
    const ev = makeEvidence({ subject: "cotton_price", value: 30000, unit: "CNY/ton" });

    const result = executeDataJanitor({ task, evidenceList: [ev], pack: apparelPack });

    expect(result.status).toBe("completed");
    expect(result.janitorOutput?.anomalyCount).toBeGreaterThan(0);
    const anomalyEntries = result.janitorOutput?.cleaningLog.filter((e) =>
      e.transform === "anomaly_flagged"
    );
    expect(anomalyEntries?.length ?? 0).toBeGreaterThan(0);
  });

  it("flags outliers when value exceeds range by >200%", () => {
    const task = makeTask();
    // cotton_price range: 10000-18000 (span 8000), value 50000 is 32000 above max (400% overflow)
    const ev = makeEvidence({ subject: "cotton_price", value: 50000, unit: "CNY/ton" });

    const result = executeDataJanitor({ task, evidenceList: [ev], pack: apparelPack });

    expect(result.status).toBe("completed");
    expect(result.janitorOutput?.outlierCount).toBeGreaterThan(0);
    const outlierEntries = result.janitorOutput?.cleaningLog.filter((e) =>
      e.transform === "outlier_removed"
    );
    expect(outlierEntries?.length ?? 0).toBeGreaterThan(0);
  });

  it("handles missing pack gracefully", () => {
    const task = makeTask();
    const ev = makeEvidence({ subject: "unknown_metric", value: 999 });

    const result = executeDataJanitor({ task, evidenceList: [ev] });

    expect(result.status).toBe("completed");
    expect(result.janitorOutput?.anomalyCount).toBe(0);
    expect(result.evidenceList?.length).toBe(1);
  });

  it("preserves original evidence structure", () => {
    const task = makeTask();
    const ev = makeEvidence({
      id: "ev-original",
      sourceId: "source-x",
      sourceTier: "B",
      subject: "test_metric",
      claim: "Test claim",
      period: "2024",
      geography: "CN",
    });

    const result = executeDataJanitor({ task, evidenceList: [ev] });

    expect(result.status).toBe("completed");
    expect(result.evidenceList?.[0].id).toBe("ev-original");
    expect(result.evidenceList?.[0].sourceId).toBe("source-x");
    expect(result.evidenceList?.[0].sourceTier).toBe("B");
    expect(result.evidenceList?.[0].subject).toBe("test_metric");
    expect(result.evidenceList?.[0].claim).toBe("Test claim");
    expect(result.evidenceList?.[0].period).toBe("2024");
    expect(result.evidenceList?.[0].geography).toBe("CN");
  });

  it("processes multiple evidence entries independently", () => {
    const task = makeTask();
    const ev1 = makeEvidence({ id: "ev-1", subject: "cotton_price", value: 12000, period: "2024-Q1" });
    const ev2 = makeEvidence({ id: "ev-2", subject: "wage_sewer", value: 500, period: "2024-Q1" });
    const ev3 = makeEvidence({ id: "ev-3", subject: "fx_usd_cny", value: 7.2, period: "2024-Q1" });

    const result = executeDataJanitor({ task, evidenceList: [ev1, ev2, ev3], pack: apparelPack });

    expect(result.status).toBe("completed");
    expect(result.evidenceList?.length).toBe(3);
    expect(result.janitorOutput?.cleaningLog).toBeDefined();
    // Should have cleaning logs for each evidence
    expect(result.janitorOutput?.cleaningLog.length).toBeGreaterThan(0);
  });
});
