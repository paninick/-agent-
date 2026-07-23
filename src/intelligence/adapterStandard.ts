import { evaluateAdapterHealth, failedValidation, healthyValidation } from "./adapter-health";
import { scoreEvidence } from "./evidenceLedger";
import type { AdapterHealth, AdapterHealthValidation, SourceResultStatus } from "./evidence-types";
import type { EvidenceEntry, EvidenceScore, IntelligenceSource, SourceVerificationResult } from "./types";

export interface AdapterContext {
  checkedAt: string;
}

export interface AdapterFallback {
  sourceId: string;
  status: "degraded" | "failed";
  message: string;
  resultStatus?: SourceResultStatus;
}

export interface StandardAdapter<Raw = unknown, Normalized = EvidenceEntry | EvidenceEntry[]> {
  source: IntelligenceSource;
  fetch(context: AdapterContext): Promise<Raw>;
  normalize(raw: Raw, context: AdapterContext): Promise<Normalized> | Normalized;
  confidence(normalized: Normalized, context: AdapterContext): EvidenceScore[];
  health(context: AdapterContext, normalized?: Normalized): Promise<AdapterHealth> | AdapterHealth;
  fallback(context: AdapterContext, error?: unknown): AdapterFallback;
}

export interface AdapterExecutionResult {
  sourceId: string;
  evidence: EvidenceEntry[];
  scores: EvidenceScore[];
  health: AdapterHealth;
  verification: SourceVerificationResult;
}

export function createEvidenceAdapter(args: {
  source: IntelligenceSource;
  fetch: (context: AdapterContext) => Promise<EvidenceEntry | EvidenceEntry[]>;
  validation?: Partial<AdapterHealthValidation>;
  fallbackMessage?: string;
}): StandardAdapter<EvidenceEntry | EvidenceEntry[], EvidenceEntry | EvidenceEntry[]> {
  return {
    source: args.source,
    fetch: args.fetch,
    normalize: (raw) => raw,
    confidence: (normalized) => toEntries(normalized).map((entry) => scoreEvidence(entry)),
    health: (context, normalized) => {
      const entries = normalized ? toEntries(normalized) : [];
      const validation = {
        ...healthyValidation(),
        schemaValid: entries.length > 0,
        indicatorMappingSuccess: entries.every((entry) => Boolean(entry.kind && entry.subject)),
        ...args.validation
      };
      return evaluateAdapterHealth({
        sourceId: args.source.id,
        latencyMs: 0,
        checkedAt: context.checkedAt,
        validation,
        resultStatus: validation.fetchSuccess && validation.schemaValid ? undefined : "adapter_error",
        failureReason: validation.fetchSuccess ? undefined : "adapter fetch failed"
      });
    },
    fallback: (_context, error) => ({
      sourceId: args.source.id,
      status: args.source.requiresAuth === false ? "failed" : "degraded",
      message: args.fallbackMessage ?? fallbackMessageForSource(args.source, error)
    })
  };
}

export function createUnavailableAdapter(source: IntelligenceSource, message?: string): StandardAdapter<never, EvidenceEntry[]> {
  return {
    source,
    fetch: async () => {
      throw new Error(message ?? `No runnable adapter is configured for ${source.id}.`);
    },
    normalize: () => [],
    confidence: () => [],
    health: (context) =>
      evaluateAdapterHealth({
        sourceId: source.id,
        latencyMs: 0,
        checkedAt: context.checkedAt,
        failureReason: message ?? "adapter not configured",
        resultStatus: "adapter_not_implemented",
        validation: failedValidation()
      }),
    fallback: (_context, error) => ({
      sourceId: source.id,
      status: "degraded",
      resultStatus: "adapter_not_implemented",
      message: message ?? fallbackMessageForSource(source, error)
    })
  };
}

export async function executeAdapter<Raw, Normalized extends EvidenceEntry | EvidenceEntry[]>(
  adapter: StandardAdapter<Raw, Normalized>,
  context: AdapterContext
): Promise<AdapterExecutionResult> {
  const startedAt = Date.now();
  try {
    const raw = await adapter.fetch(context);
    const normalized = await adapter.normalize(raw, context);
    const evidence = toEntries(normalized);
    const scores = adapter.confidence(normalized, context);
    const healthBase = await adapter.health(context, normalized);
    const latencyMs = Date.now() - startedAt;
    const health = { ...healthBase, latencyMs };

    return {
      sourceId: adapter.source.id,
      evidence,
      scores,
      health,
      verification: healthToVerification(health, evidence)
    };
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    const fallback = adapter.fallback(context, error);
    const resultStatus = fallback.resultStatus ?? inferSourceResultStatusFromError(error);
    const validation = fallback.status === "degraded"
      ? { fetchSuccess: true, schemaValid: true, indicatorMappingSuccess: false, freshnessPassed: false }
      : failedValidation();
    const health = evaluateAdapterHealth({
      sourceId: adapter.source.id,
      latencyMs,
      checkedAt: context.checkedAt,
      failureReason: fallback.message,
      resultStatus,
      credentialRequired: adapter.source.requiresAuth !== false,
      validation
    });
    return {
      sourceId: adapter.source.id,
      evidence: [],
      scores: [],
      health,
      verification: healthToVerification(health, [])
    };
  }
}

export function healthToVerification(health: AdapterHealth, evidence: EvidenceEntry[]): SourceVerificationResult {
  const status: SourceVerificationResult["status"] =
    health.status === "healthy"
      ? "verified"
      : health.resultStatus === "missing_credentials" || health.resultStatus === "not_probed" || health.resultStatus === "adapter_not_implemented"
        ? "skipped_auth_required"
        : health.status === "degraded"
          ? "unavailable"
          : "failed";
  return {
    sourceId: health.sourceId,
    status,
    evidenceId: evidence[0]?.id,
    message: health.failureReason ?? `${health.sourceId} adapter health is ${health.status}.`,
    checkedAt: health.lastSuccessAt ?? health.lastFailureAt ?? new Date().toISOString()
  };
}

export function adapterHealthSkeleton(sources: IntelligenceSource[], checkedAt = new Date().toISOString()): AdapterHealth[] {
  return sources.map((source) =>
    evaluateAdapterHealth({
      sourceId: source.id,
      latencyMs: 0,
      checkedAt,
      failureReason: "not probed in this verification run",
      resultStatus: "not_probed",
      credentialRequired: source.requiresAuth !== false,
      credentialPresent: false,
      validation: failedValidation()
    })
  );
}

function toEntries(value: EvidenceEntry | EvidenceEntry[]): EvidenceEntry[] {
  return Array.isArray(value) ? value : [value];
}

function fallbackMessageForSource(source: IntelligenceSource, error?: unknown) {
  if (source.requiresAuth !== false) {
    return `${source.id} requires credentials or authorization before physical verification.`;
  }
  if (error instanceof Error) return error.message;
  return `${source.id} has no usable data in this verification profile.`;
}

function inferSourceResultStatusFromError(error: unknown): SourceResultStatus {
  const message = error instanceof Error ? error.message : String(error);
  if (/\b401\b|unauthori[sz]ed|invalid credential|invalid api key/i.test(message)) return "invalid_credentials";
  if (/\b403\b|permission denied|forbidden/i.test(message)) return "permission_denied";
  if (/\b429\b|rate limit|too many requests/i.test(message)) return "rate_limited";
  if (/\b404\b|not found/i.test(message)) return "not_found";
  if (/timeout|timed out|abort/i.test(message)) return "fetch_timeout";
  if (/schema|shape changed|invalid json/i.test(message)) return "schema_invalid";
  if (/no data|no numeric|no usable|returned no/i.test(message)) return "no_data";
  return "adapter_error";
}
