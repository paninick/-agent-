import type { EvidenceEntry, IntelligenceSource } from "./types";

export type AdapterHealthStatus = "healthy" | "degraded" | "failed";
export type SourceResultStatus =
  | "healthy"
  | "degraded"
  | "missing_credentials"
  | "invalid_credentials"
  | "permission_denied"
  | "rate_limited"
  | "not_found"
  | "adapter_not_implemented"
  | "not_probed"
  | "adapter_error"
  | "fetch_timeout"
  | "schema_invalid"
  | "no_data";

export interface AdapterHealthValidation {
  fetchSuccess: boolean;
  schemaValid: boolean;
  indicatorMappingSuccess: boolean;
  freshnessPassed: boolean;
}

export interface AdapterHealth {
  sourceId: string;
  status: AdapterHealthStatus;
  resultStatus: SourceResultStatus;
  latencyMs: number;
  errorRate: number;
  lastSuccessAt?: string;
  lastFailureAt?: string;
  failureReason?: string;
  credentialRequired?: boolean;
  credentialPresent?: boolean;
  validation: AdapterHealthValidation;
}

export interface SourceResultBreakdown {
  healthy: number;
  degraded: number;
  missingCredentials: number;
  invalidCredentials: number;
  permissionDenied: number;
  rateLimited: number;
  notFound: number;
  adapterNotImplemented: number;
  notProbed: number;
  adapterError: number;
  fetchTimeout: number;
  schemaInvalid: number;
  noData: number;
}

export interface FailedSourceBreakdown {
  invalidCredentials: number;
  permissionDenied: number;
  adapterError: number;
  fetchTimeout: number;
  schemaInvalid: number;
}

export interface UnavailableSourceBreakdown {
  missingCredentials: number;
  rateLimited: number;
  notFound: number;
  adapterNotImplemented: number;
  notProbed: number;
  noData: number;
}

export type EvidenceNodeType = "SourceNode" | "DataPointNode" | "EntityNode" | "IndicatorNode";
export type EvidenceEdgeType = "derived_from" | "describes" | "supports" | "contradicts";

export interface EvidenceProvenance {
  sourceId: string;
  sourceTier?: IntelligenceSource["tier"];
  method?: EvidenceEntry["method"];
  url?: string;
  rawRef?: string;
}

export interface EvidenceNode {
  id: string;
  type: EvidenceNodeType;
  sourceId?: string;
  value: number | string | boolean | null;
  confidence: number;
  timestamp: string;
  provenance: EvidenceProvenance;
  metadata: Record<string, string | number | boolean | null>;
  /**
   * 6 门真实性验证结果（可选）。仅 DataPointNode 会带。
   * 由 buildEvidenceGraph({ authenticityByEvidenceId }) 注入。
   * 未传入时不出现，保证对既有调用方零破坏。
   */
  authenticity?: import("./validation/types").AuthenticityResult;
}

export interface EvidenceEdge {
  id: string;
  from: string;
  to: string;
  type: EvidenceEdgeType;
  weight: number;
  confidence: number;
}

export interface EvidenceSummary {
  sourceNodeCount: number;
  dataPointNodeCount: number;
  entityNodeCount: number;
  indicatorNodeCount: number;
  edgeCount: number;
}

export interface EvidenceGraph {
  nodes: EvidenceNode[];
  edges: EvidenceEdge[];
  summary: EvidenceSummary;
}

export interface ConfidenceBreakdown {
  sourceReliability: number;
  dataCompleteness: number;
  freshnessScore: number;
  crossSourceAgreement: number;
  conflictPenalty: number;
}

export interface ConfidenceResult {
  value: number;
  breakdown: ConfidenceBreakdown;
  warnings: string[];
  perSourceConfidence: Record<string, number>;
}

export type ConflictType = "value_mismatch" | "unit_mismatch" | "time_window_mismatch";
export type ConflictSeverity = "low" | "medium" | "high";
export type ConflictResolution = "weighted_average" | "prefer_latest" | "manual_review" | "flag_unresolved";

export interface ConflictReport {
  id: string;
  type: ConflictType;
  severity: ConflictSeverity;
  involvedNodeIds: string[];
  suggestedResolution: ConflictResolution;
}

export type VisualizationReadinessStatus = "ready" | "degraded" | "blocked";

export interface VisualizationReadiness {
  status: VisualizationReadinessStatus;
  missingFields: string[];
  warnings: string[];
  usableEvidence: boolean;
}
