import { afterEach, describe, expect, it } from "vitest";
import registrySeed from "../../../data/intelligence-source-registry.seed.json";
import { completeAdapterHealthSnapshot, recordCredentialMissing } from "../../../scripts/verify-intelligence-sources";
import { evaluateAdapterHealth, parseSourceRegistry, summarizeAdapterHealth } from "../../intelligence";
import type { AdapterHealth, SourceResultStatus, SourceVerificationResult } from "../../intelligence";

const checkedAt = "2026-07-03T00:00:00.000Z";
const originalFredKey = process.env.FRED_API_KEY;

afterEach(() => {
  if (originalFredKey === undefined) {
    delete process.env.FRED_API_KEY;
  } else {
    process.env.FRED_API_KEY = originalFredKey;
  }
});

describe("Adapter Result Classification v1", () => {
  it("records missing credentials as degraded missing_credentials, not ordinary failed", () => {
    const registry = parseSourceRegistry(registrySeed);
    const verifications: SourceVerificationResult[] = [];
    const healthBySourceId = new Map<string, AdapterHealth>();

    recordCredentialMissing(registry, verifications, healthBySourceId, "fred", "FRED_API_KEY is not set.");
    const health = healthBySourceId.get("fred");

    expect(health?.status).toBe("degraded");
    expect(health?.resultStatus).toBe("missing_credentials");
    expect(health?.credentialRequired).toBe(true);
    expect(health?.credentialPresent).toBe(false);
    expect(verifications[0]?.status).toBe("skipped_auth_required");
  });

  it("classifies unprobed sources by missing credential, missing adapter, or adapter exists but not executed", () => {
    delete process.env.FRED_API_KEY;
    const registry = parseSourceRegistry(registrySeed);
    const existingHealth = evaluateAdapterHealth({
      sourceId: "sec-edgar",
      latencyMs: 12,
      checkedAt,
      validation: { fetchSuccess: true, schemaValid: true, indicatorMappingSuccess: true, freshnessPassed: true }
    });
    const snapshot = completeAdapterHealthSnapshot(registry.sources, new Map([["sec-edgar", existingHealth]]), checkedAt);
    const bySource = new Map(snapshot.map((health) => [health.sourceId, health]));

    expect(bySource.get("sec-edgar")?.resultStatus).toBe("healthy");
    expect(bySource.get("fred")).toMatchObject({
      sourceId: "fred",
      resultStatus: "missing_credentials",
      failureReason: "FRED_API_KEY is not set.",
      credentialRequired: true,
      credentialPresent: false
    });
    expect(bySource.get("world-bank")?.resultStatus).toBe("not_probed");
    expect(bySource.get("mckinsey-bof-state-of-fashion")).toMatchObject({
      sourceId: "mckinsey-bof-state-of-fashion",
      resultStatus: "adapter_not_implemented",
      failureReason: "adapter not implemented for this verification profile",
      credentialRequired: true,
      credentialPresent: false
    });
  });

  it("builds mutually exclusive source, failed, and unavailable breakdowns", () => {
    const resultStatuses: SourceResultStatus[] = [
      "healthy",
      "degraded",
      "missing_credentials",
      "invalid_credentials",
      "permission_denied",
      "rate_limited",
      "not_found",
      "adapter_not_implemented",
      "not_probed",
      "adapter_error",
      "fetch_timeout",
      "schema_invalid",
      "no_data"
    ];
    const health = resultStatuses.map((resultStatus) =>
      evaluateAdapterHealth({
        sourceId: resultStatus,
        latencyMs: 0,
        checkedAt,
        resultStatus,
        validation:
          resultStatus === "healthy"
            ? { fetchSuccess: true, schemaValid: true, indicatorMappingSuccess: true, freshnessPassed: true }
            : resultStatus === "degraded"
              ? { fetchSuccess: true, schemaValid: true, indicatorMappingSuccess: false, freshnessPassed: false }
              : { fetchSuccess: false, schemaValid: false, indicatorMappingSuccess: false, freshnessPassed: false }
      })
    );
    const summary = summarizeAdapterHealth(health);
    const sourceResultTotal = Object.values(summary.sourceResultBreakdown).reduce((total, value) => total + value, 0);
    const failedTotal = Object.values(summary.failedSourceBreakdown).reduce((total, value) => total + value, 0);
    const unavailableTotal = Object.values(summary.unavailableSourceBreakdown).reduce((total, value) => total + value, 0);

    expect(sourceResultTotal).toBe(summary.sourceCount);
    expect(failedTotal).toBe(summary.failedSourceCount);
    expect(unavailableTotal).toBe(summary.unavailableSourceCount);
    expect(summary.failedSourceBreakdown).toEqual({
      invalidCredentials: 1,
      permissionDenied: 1,
      adapterError: 1,
      fetchTimeout: 1,
      schemaInvalid: 1
    });
    expect(summary.unavailableSourceBreakdown).toEqual({
      missingCredentials: 1,
      rateLimited: 1,
      notFound: 1,
      adapterNotImplemented: 1,
      notProbed: 1,
      noData: 1
    });
    expect(summary.failedSourceBreakdown).not.toHaveProperty("missingCredentials");
    expect(summary.failedSourceBreakdown).not.toHaveProperty("notProbed");
    expect(summary.failedSourceBreakdown).not.toHaveProperty("adapterNotImplemented");
    expect(summary.failedSourceBreakdown).not.toHaveProperty("rateLimited");
    expect(summary.failedSourceBreakdown).not.toHaveProperty("notFound");
    expect(summary.failedSourceBreakdown).not.toHaveProperty("noData");
    expect(summary.unavailableSourceBreakdown).not.toHaveProperty("adapterError");
    expect(summary.unavailableSourceBreakdown).not.toHaveProperty("fetchTimeout");
    expect(summary.unavailableSourceBreakdown).not.toHaveProperty("schemaInvalid");
    expect(summary.unavailableSourceBreakdown).not.toHaveProperty("invalidCredentials");
    expect(summary.unavailableSourceBreakdown).not.toHaveProperty("permissionDenied");
  });
});
