export type SourceTier = "S" | "A+" | "A" | "B" | "C";

export type SourceType =
  | "official_api"
  | "authorized_platform_api"
  | "internal_operational_system"
  | "open_supply_chain_database"
  | "compliance_research_database"
  | "official_research_and_statistics"
  | "official_trade_research"
  | "consulting_report";

export interface SourceTierDefinition {
  defaultWeight: number;
  meaning: string;
}

export interface IntelligenceSource {
  id: string;
  name: string;
  tier: SourceTier;
  sourceWeight: number;
  trust_weight: number;
  latency_score: number;
  reliability_score: number;
  coverage_domain: string;
  type: SourceType;
  coverage: string[];
  officialUrl: string;
  requiresAuth: boolean | string;
  refreshCadence: string;
  evidenceUse: string[];
  crossChecks: string[];
  knownFailureModes: string[];
}

export interface SourceRegistry {
  version: string;
  purpose: string;
  tiers: Record<SourceTier, SourceTierDefinition>;
  sources: IntelligenceSource[];
  minimumConclusionGate: {
    hardConclusion: { requiresAtLeast: string[] };
    hypothesisOnly: { when: string[] };
  };
}

export type EvidenceKind =
  | "financial_primary"
  | "trade_flow_primary"
  | "macro_control"
  | "platform_sales_primary"
  | "supplier_identity"
  | "compliance_risk"
  | "material_quantity"
  | "market_signal"
  | "research_context"
  | "pipeline_health";

export interface EvidenceEntry {
  id: string;
  sourceId: string;
  sourceTier: SourceTier;
  sourceWeight: number;
  kind: EvidenceKind;
  subject: string;
  claim: string;
  observedAt: string;
  period?: string;
  geography?: string;
  unit?: string;
  value?: number | string | boolean;
  method: "api" | "filing" | "authorized_platform" | "manual" | "web" | "report";
  url?: string;
  rawRef?: string;
  conversions: string[];
  crossChecks: string[];
  contradictions: string[];
  notes: string[];
}

export interface SourceVerificationResult {
  sourceId: string;
  status: "verified" | "skipped_auth_required" | "unavailable" | "failed";
  evidenceId?: string;
  message: string;
  checkedAt: string;
}

export interface EvidenceScore {
  evidenceId: string;
  confidence: number;
  components: {
    sourceWeight: number;
    recencyFactor: number;
    methodFactor: number;
    chainAlignment: number;
    contradictionPenalty: number;
  };
  classification: "conclusion_ready" | "strong_support" | "lead_only" | "weak_or_conflicted";
}

export interface ConclusionGateResult {
  status: "hard_conclusion" | "hypothesis_only" | "insufficient";
  reasons: string[];
  missing: string[];
}
