import type {
  AdapterHealth,
  AdapterHealthStatus,
  AdapterHealthValidation,
  FailedSourceBreakdown,
  SourceResultBreakdown,
  SourceResultStatus,
  UnavailableSourceBreakdown
} from "./evidence-types";

export interface AdapterHealthInput {
  sourceId: string;
  latencyMs: number;
  errorRate?: number;
  checkedAt: string;
  failureReason?: string;
  resultStatus?: SourceResultStatus;
  credentialRequired?: boolean;
  credentialPresent?: boolean;
  validation: AdapterHealthValidation;
}

export interface AdapterHealthSummary {
  sourceCount: number;
  healthySourceCount: number;
  degradedSourceCount: number;
  failedSourceCount: number;
  unavailableSourceCount: number;
  sourceResultBreakdown: SourceResultBreakdown;
  failedSourceBreakdown: FailedSourceBreakdown;
  unavailableSourceBreakdown: UnavailableSourceBreakdown;
}

export function evaluateAdapterHealth(input: AdapterHealthInput): AdapterHealth {
  const resultStatus = input.resultStatus ?? resultStatusFromValidation(input.validation);
  const status = adapterHealthStatusForResult(resultStatus, input.validation);
  return {
    sourceId: input.sourceId,
    status,
    resultStatus,
    latencyMs: Math.max(0, Math.round(input.latencyMs)),
    errorRate: clamp(input.errorRate ?? (status === "failed" ? 1 : 0), 0, 1),
    lastSuccessAt: status === "healthy" || resultStatus === "degraded" ? input.checkedAt : undefined,
    lastFailureAt: status === "failed" ? input.checkedAt : undefined,
    failureReason: input.failureReason,
    credentialRequired: input.credentialRequired,
    credentialPresent: input.credentialPresent,
    validation: input.validation
  };
}

export function summarizeAdapterHealth(health: AdapterHealth[]): AdapterHealthSummary {
  const sourceResultBreakdown = summarizeSourceResultBreakdown(health);
  const failedSourceBreakdown = summarizeFailedSourceBreakdown(health);
  const unavailableSourceBreakdown = summarizeUnavailableSourceBreakdown(health);
  return {
    sourceCount: health.length,
    healthySourceCount: health.filter((item) => item.status === "healthy").length,
    degradedSourceCount: health.filter((item) => item.status === "degraded").length,
    failedSourceCount: health.filter((item) => item.status === "failed").length,
    unavailableSourceCount: sumBreakdown(unavailableSourceBreakdown),
    sourceResultBreakdown,
    failedSourceBreakdown,
    unavailableSourceBreakdown
  };
}

export function classifyAdapterHealth(validation: AdapterHealthValidation): AdapterHealthStatus {
  if (!validation.fetchSuccess || !validation.schemaValid) return "failed";
  if (validation.fetchSuccess && validation.schemaValid && validation.indicatorMappingSuccess && validation.freshnessPassed) {
    return "healthy";
  }
  return "degraded";
}

export function resultStatusFromValidation(validation: AdapterHealthValidation): SourceResultStatus {
  const coarseStatus = classifyAdapterHealth(validation);
  if (coarseStatus === "failed") {
    if (!validation.schemaValid) return "schema_invalid";
    return "adapter_error";
  }
  return coarseStatus;
}

export function adapterHealthStatusForResult(
  resultStatus: SourceResultStatus,
  validation: AdapterHealthValidation
): AdapterHealthStatus {
  if (resultStatus === "healthy") return "healthy";
  if (resultStatus === "degraded") return "degraded";
  if (isFailedSourceResultStatus(resultStatus)) return "failed";
  if (isUnavailableSourceResultStatus(resultStatus)) return "degraded";
  return classifyAdapterHealth(validation);
}

export function isFailedSourceResultStatus(status: SourceResultStatus) {
  return ["invalid_credentials", "permission_denied", "adapter_error", "fetch_timeout", "schema_invalid"].includes(status);
}

export function isUnavailableSourceResultStatus(status: SourceResultStatus) {
  return ["missing_credentials", "rate_limited", "not_found", "adapter_not_implemented", "not_probed", "no_data"].includes(status);
}

export function summarizeSourceResultBreakdown(health: AdapterHealth[]): SourceResultBreakdown {
  const breakdown = emptySourceResultBreakdown();
  for (const item of health) {
    const key = sourceResultStatusKey(item.resultStatus);
    breakdown[key] += 1;
  }
  return breakdown;
}

export function summarizeFailedSourceBreakdown(health: AdapterHealth[]): FailedSourceBreakdown {
  const breakdown: FailedSourceBreakdown = {
    invalidCredentials: 0,
    permissionDenied: 0,
    adapterError: 0,
    fetchTimeout: 0,
    schemaInvalid: 0
  };
  for (const item of health) {
    if (item.resultStatus === "invalid_credentials") breakdown.invalidCredentials += 1;
    if (item.resultStatus === "permission_denied") breakdown.permissionDenied += 1;
    if (item.resultStatus === "adapter_error") breakdown.adapterError += 1;
    if (item.resultStatus === "fetch_timeout") breakdown.fetchTimeout += 1;
    if (item.resultStatus === "schema_invalid") breakdown.schemaInvalid += 1;
  }
  return breakdown;
}

export function summarizeUnavailableSourceBreakdown(health: AdapterHealth[]): UnavailableSourceBreakdown {
  const breakdown: UnavailableSourceBreakdown = {
    missingCredentials: 0,
    rateLimited: 0,
    notFound: 0,
    adapterNotImplemented: 0,
    notProbed: 0,
    noData: 0
  };
  for (const item of health) {
    if (item.resultStatus === "missing_credentials") breakdown.missingCredentials += 1;
    if (item.resultStatus === "rate_limited") breakdown.rateLimited += 1;
    if (item.resultStatus === "not_found") breakdown.notFound += 1;
    if (item.resultStatus === "adapter_not_implemented") breakdown.adapterNotImplemented += 1;
    if (item.resultStatus === "not_probed") breakdown.notProbed += 1;
    if (item.resultStatus === "no_data") breakdown.noData += 1;
  }
  return breakdown;
}

export function failedValidation(): AdapterHealthValidation {
  return {
    fetchSuccess: false,
    schemaValid: false,
    indicatorMappingSuccess: false,
    freshnessPassed: false
  };
}

export function healthyValidation(): AdapterHealthValidation {
  return {
    fetchSuccess: true,
    schemaValid: true,
    indicatorMappingSuccess: true,
    freshnessPassed: true
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function sumBreakdown<T extends object>(values: T) {
  return Object.values(values).reduce((total, value) => total + value, 0);
}

function emptySourceResultBreakdown(): SourceResultBreakdown {
  return {
    healthy: 0,
    degraded: 0,
    missingCredentials: 0,
    invalidCredentials: 0,
    permissionDenied: 0,
    rateLimited: 0,
    notFound: 0,
    adapterNotImplemented: 0,
    notProbed: 0,
    adapterError: 0,
    fetchTimeout: 0,
    schemaInvalid: 0,
    noData: 0
  };
}

function sourceResultStatusKey(status: SourceResultStatus): keyof SourceResultBreakdown {
  const keyByStatus: Record<SourceResultStatus, keyof SourceResultBreakdown> = {
    healthy: "healthy",
    degraded: "degraded",
    missing_credentials: "missingCredentials",
    invalid_credentials: "invalidCredentials",
    permission_denied: "permissionDenied",
    rate_limited: "rateLimited",
    not_found: "notFound",
    adapter_not_implemented: "adapterNotImplemented",
    not_probed: "notProbed",
    adapter_error: "adapterError",
    fetch_timeout: "fetchTimeout",
    schema_invalid: "schemaInvalid",
    no_data: "noData"
  };
  return keyByStatus[status];
}
