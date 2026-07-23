import { describe, expect, it } from "vitest";
import { evaluateAdapterHealth, summarizeAdapterHealth } from "../../intelligence";

describe("Adapter Health Model", () => {
  it("classifies healthy, degraded, and failed adapters", () => {
    const healthy = evaluateAdapterHealth({
      sourceId: "world-bank",
      latencyMs: 100,
      checkedAt: "2026-07-03T00:00:00.000Z",
      validation: { fetchSuccess: true, schemaValid: true, indicatorMappingSuccess: true, freshnessPassed: true }
    });
    const degraded = evaluateAdapterHealth({
      sourceId: "stale-source",
      latencyMs: 120,
      checkedAt: "2026-07-03T00:00:00.000Z",
      validation: { fetchSuccess: true, schemaValid: true, indicatorMappingSuccess: true, freshnessPassed: false }
    });
    const failed = evaluateAdapterHealth({
      sourceId: "failed-source",
      latencyMs: 1,
      checkedAt: "2026-07-03T00:00:00.000Z",
      failureReason: "timeout",
      resultStatus: "fetch_timeout",
      validation: { fetchSuccess: false, schemaValid: false, indicatorMappingSuccess: false, freshnessPassed: false }
    });

    expect(healthy.status).toBe("healthy");
    expect(healthy.resultStatus).toBe("healthy");
    expect(degraded.status).toBe("degraded");
    expect(degraded.resultStatus).toBe("degraded");
    expect(failed.status).toBe("failed");
    expect(failed.resultStatus).toBe("fetch_timeout");
    expect(summarizeAdapterHealth([healthy, degraded, failed])).toEqual({
      sourceCount: 3,
      healthySourceCount: 1,
      degradedSourceCount: 1,
      failedSourceCount: 1,
      unavailableSourceCount: 0,
      sourceResultBreakdown: {
        healthy: 1,
        degraded: 1,
        missingCredentials: 0,
        invalidCredentials: 0,
        permissionDenied: 0,
        rateLimited: 0,
        notFound: 0,
        adapterNotImplemented: 0,
        notProbed: 0,
        adapterError: 0,
        fetchTimeout: 1,
        schemaInvalid: 0,
        noData: 0
      },
      failedSourceBreakdown: {
        invalidCredentials: 0,
        permissionDenied: 0,
        adapterError: 0,
        fetchTimeout: 1,
        schemaInvalid: 0
      },
      unavailableSourceBreakdown: {
        missingCredentials: 0,
        rateLimited: 0,
        notFound: 0,
        adapterNotImplemented: 0,
        notProbed: 0,
        noData: 0
      }
    });
  });

  it("keeps unavailable classifications out of failedSourceBreakdown", () => {
    const checkedAt = "2026-07-03T00:00:00.000Z";
    const statuses = [
      "missing_credentials",
      "rate_limited",
      "not_found",
      "adapter_not_implemented",
      "not_probed",
      "no_data"
    ] as const;
    const health = statuses.map((resultStatus) =>
      evaluateAdapterHealth({
        sourceId: resultStatus,
        latencyMs: 0,
        checkedAt,
        resultStatus,
        validation: { fetchSuccess: false, schemaValid: false, indicatorMappingSuccess: false, freshnessPassed: false }
      })
    );
    const summary = summarizeAdapterHealth(health);

    expect(summary.degradedSourceCount).toBe(6);
    expect(summary.failedSourceCount).toBe(0);
    expect(summary.unavailableSourceCount).toBe(6);
    expect(summary.unavailableSourceBreakdown).toEqual({
      missingCredentials: 1,
      rateLimited: 1,
      notFound: 1,
      adapterNotImplemented: 1,
      notProbed: 1,
      noData: 1
    });
    expect(Object.values(summary.failedSourceBreakdown).reduce((total, value) => total + value, 0)).toBe(0);
  });
});
