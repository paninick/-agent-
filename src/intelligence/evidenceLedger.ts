import type {
  ConclusionGateResult,
  EvidenceEntry,
  EvidenceKind,
  EvidenceScore,
  IntelligenceSource,
  SourceRegistry
} from "./types";

const methodFactors: Record<EvidenceEntry["method"], number> = {
  api: 1,
  filing: 1,
  authorized_platform: 0.95,
  report: 0.78,
  manual: 0.7,
  web: 0.55
};

export function createEvidenceEntry(args: {
  source: IntelligenceSource;
  kind: EvidenceKind;
  subject: string;
  claim: string;
  observedAt?: string;
  period?: string;
  geography?: string;
  unit?: string;
  value?: number | string | boolean;
  method: EvidenceEntry["method"];
  url?: string;
  rawRef?: string;
  conversions?: string[];
  crossChecks?: string[];
  contradictions?: string[];
  notes?: string[];
}): EvidenceEntry {
  const observedAt = args.observedAt ?? new Date().toISOString();
  const id = stableEvidenceId(args.source.id, args.kind, args.subject, args.claim, args.period ?? observedAt);

  return {
    id,
    sourceId: args.source.id,
    sourceTier: args.source.tier,
    sourceWeight: args.source.sourceWeight,
    kind: args.kind,
    subject: args.subject,
    claim: args.claim,
    observedAt,
    period: args.period,
    geography: args.geography,
    unit: args.unit,
    value: args.value,
    method: args.method,
    url: args.url,
    rawRef: args.rawRef,
    conversions: args.conversions ?? [],
    crossChecks: args.crossChecks ?? [],
    contradictions: args.contradictions ?? [],
    notes: args.notes ?? []
  };
}

export function scoreEvidence(
  evidence: EvidenceEntry,
  now = new Date(),
  options: { chainAlignment?: number } = {}
): EvidenceScore {
  const recencyFactor = computeRecencyFactor(evidence.observedAt, now);
  const methodFactor = methodFactors[evidence.method];
  const chainAlignment = clamp(options.chainAlignment ?? inferChainAlignment(evidence), 0.2, 1.15);
  const contradictionPenalty = Math.min(0.6, evidence.contradictions.length * 0.18);
  const confidence = clamp(
    evidence.sourceWeight * recencyFactor * methodFactor * chainAlignment - contradictionPenalty,
    0,
    1
  );

  return {
    evidenceId: evidence.id,
    confidence: round(confidence),
    components: {
      sourceWeight: evidence.sourceWeight,
      recencyFactor: round(recencyFactor),
      methodFactor,
      chainAlignment: round(chainAlignment),
      contradictionPenalty: round(contradictionPenalty)
    },
    classification: classifyConfidence(confidence, evidence)
  };
}

export function evaluateConclusionGate(
  registry: SourceRegistry,
  evidenceEntries: EvidenceEntry[],
  scores: EvidenceScore[]
): ConclusionGateResult {
  const scoreById = new Map(scores.map((score) => [score.evidenceId, score]));
  const strongEntries = evidenceEntries.filter((entry) => (scoreById.get(entry.id)?.confidence ?? 0) >= 0.65);
  const hasPrimary = strongEntries.some((entry) => entry.sourceTier === "S" || entry.sourceTier === "A+");
  const hasIndependentCrossCheck = strongEntries.some((entry) =>
    entry.crossChecks.some((sourceId) => sourceId !== entry.sourceId)
  );
  const hasConversions = strongEntries.some((entry) => entry.conversions.length > 0);
  const hasCounterEvidenceScan = evidenceEntries.some(
    (entry) => entry.notes.some((note) => /反证|counter|contradiction/i.test(note)) || entry.contradictions.length > 0
  );
  const onlyWeakSources = evidenceEntries.every((entry) => entry.sourceTier === "B" || entry.sourceTier === "C");

  const missing: string[] = [];
  if (!hasPrimary) missing.push("one_S_or_A_plus_primary_source");
  if (!hasIndependentCrossCheck) missing.push("one_independent_cross_check");
  if (!hasConversions) missing.push("documented_unit_or_currency_conversion");
  if (!hasCounterEvidenceScan) missing.push("explicit_counterevidence_scan");

  if (onlyWeakSources) {
    return {
      status: "hypothesis_only",
      reasons: ["All available evidence is B/C tier, so the registry gate forbids a hard conclusion."],
      missing
    };
  }

  if (missing.length === 0) {
    return {
      status: "hard_conclusion",
      reasons: registry.minimumConclusionGate.hardConclusion.requiresAtLeast,
      missing: []
    };
  }

  return {
    status: "insufficient",
    reasons: ["Evidence exists, but the hard-conclusion gate is not fully satisfied."],
    missing
  };
}

function computeRecencyFactor(observedAt: string, now: Date) {
  const observed = new Date(observedAt);
  if (Number.isNaN(observed.getTime())) return 0.65;
  const ageDays = Math.max(0, (now.getTime() - observed.getTime()) / 86_400_000);
  if (ageDays <= 30) return 1;
  if (ageDays <= 180) return 0.92;
  if (ageDays <= 365) return 0.82;
  if (ageDays <= 730) return 0.68;
  return 0.5;
}

function inferChainAlignment(evidence: EvidenceEntry) {
  if (evidence.contradictions.length > 0) return 0.72;
  if (evidence.crossChecks.length >= 2) return 1.08;
  if (evidence.crossChecks.length === 1) return 1;
  return 0.86;
}

function classifyConfidence(confidence: number, evidence: EvidenceEntry): EvidenceScore["classification"] {
  if (confidence >= 0.82 && (evidence.sourceTier === "S" || evidence.sourceTier === "A+")) return "conclusion_ready";
  if (confidence >= 0.65) return "strong_support";
  if (confidence >= 0.35) return "lead_only";
  return "weak_or_conflicted";
}

function stableEvidenceId(...parts: string[]) {
  const normalized = parts.join("|").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return normalized.slice(0, 120);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}
