import type { EvidenceEntry, EvidenceKind, EvidenceScore, SourceVerificationResult } from "./types";

export type BrandChainLedgerId =
  | "financials"
  | "trade"
  | "supplier"
  | "platform"
  | "materials"
  | "macro_disruption";

export interface BrandChainLedgerRequirement {
  id: BrandChainLedgerId;
  label: string;
  requiredKinds: EvidenceKind[];
  primarySourceTiers: Array<"S" | "A+">;
  helpfulSourceIds: string[];
  minimumStrongEvidence: number;
}

export interface BrandChainLedgerStatus {
  id: BrandChainLedgerId;
  label: string;
  status: "passed" | "partial" | "missing";
  evidenceIds: string[];
  missing: string[];
  nextActions: string[];
}

export interface BrandChainGateResult {
  brand: string;
  status: "chain_verified" | "partial_chain" | "not_verified";
  ledgers: BrandChainLedgerStatus[];
  passedCount: number;
  totalCount: number;
  summary: string;
}

export const defaultBrandChainRequirements: BrandChainLedgerRequirement[] = [
  {
    id: "financials",
    label: "Financials and operating disclosures",
    requiredKinds: ["financial_primary"],
    primarySourceTiers: ["S", "A+"],
    helpfulSourceIds: ["sec-edgar", "edinet-japan", "company_ir"],
    minimumStrongEvidence: 1
  },
  {
    id: "trade",
    label: "Customs and trade-flow ledger",
    requiredKinds: ["trade_flow_primary"],
    primarySourceTiers: ["S", "A+"],
    helpfulSourceIds: ["us-census-trade", "un-comtrade", "usitc-dataweb", "eurostat"],
    minimumStrongEvidence: 1
  },
  {
    id: "supplier",
    label: "Supplier and facility ledger",
    requiredKinds: ["supplier_identity", "compliance_risk"],
    primarySourceTiers: ["S", "A+"],
    helpfulSourceIds: ["open-supply-hub", "company_registry", "brand_supplier_list"],
    minimumStrongEvidence: 1
  },
  {
    id: "platform",
    label: "Platform orders, price, inventory, and user feedback",
    requiredKinds: ["platform_sales_primary", "market_signal"],
    primarySourceTiers: ["A+"],
    helpfulSourceIds: ["shopee-open-platform", "temu-partner-api", "alibaba-open-platform"],
    minimumStrongEvidence: 1
  },
  {
    id: "materials",
    label: "Material, yarn, fabric, and BOM quantity ledger",
    requiredKinds: ["material_quantity"],
    primarySourceTiers: ["S", "A+"],
    helpfulSourceIds: ["internal-bom-system", "ice", "supplier_quote", "customs_records"],
    minimumStrongEvidence: 1
  },
  {
    id: "macro_disruption",
    label: "FX, rates, labor, energy, tariff, and shipping disruption",
    requiredKinds: ["macro_control"],
    primarySourceTiers: ["S", "A+"],
    helpfulSourceIds: ["ecb-eurofxref", "fred", "world-bank", "eurostat", "ilo"],
    minimumStrongEvidence: 1
  }
];

export function evaluateBrandChainGate(args: {
  brand: string;
  evidence: EvidenceEntry[];
  scores: EvidenceScore[];
  verifications: SourceVerificationResult[];
  requirements?: BrandChainLedgerRequirement[];
}): BrandChainGateResult {
  const requirements = args.requirements ?? defaultBrandChainRequirements;
  const scoreById = new Map(args.scores.map((score) => [score.evidenceId, score]));
  const ledgerStatuses = requirements.map((requirement) =>
    evaluateLedger(requirement, args.evidence, scoreById, args.verifications)
  );
  const passedCount = ledgerStatuses.filter((ledger) => ledger.status === "passed").length;
  const partialCount = ledgerStatuses.filter((ledger) => ledger.status === "partial").length;
  const status =
    passedCount === ledgerStatuses.length
      ? "chain_verified"
      : passedCount >= 2 || (passedCount >= 1 && partialCount >= 2)
        ? "partial_chain"
        : "not_verified";

  return {
    brand: args.brand,
    status,
    ledgers: ledgerStatuses,
    passedCount,
    totalCount: ledgerStatuses.length,
    summary: summarizeGate(status, passedCount, ledgerStatuses.length)
  };
}

function evaluateLedger(
  requirement: BrandChainLedgerRequirement,
  evidence: EvidenceEntry[],
  scoreById: Map<string, EvidenceScore>,
  verifications: SourceVerificationResult[]
): BrandChainLedgerStatus {
  const matchingEntries = evidence.filter((entry) => requirement.requiredKinds.includes(entry.kind));
  const relevantMatchingEntries = matchingEntries.filter((entry) => requirement.helpfulSourceIds.includes(entry.sourceId));
  const strongEntries = matchingEntries.filter((entry) => {
    const score = scoreById.get(entry.id);
    return (
      (score?.confidence ?? 0) >= 0.65 &&
      requirement.primarySourceTiers.includes(entry.sourceTier as "S" | "A+")
    );
  });

  const missing: string[] = [];
  if (strongEntries.length < requirement.minimumStrongEvidence) {
    missing.push(`Need ${requirement.minimumStrongEvidence} strong ${requirement.requiredKinds.join("/")} evidence item.`);
  }

  const hasRelevantVerifiedOrSkipped = verifications.some((verification) =>
    requirement.helpfulSourceIds.includes(verification.sourceId)
  );
  if (!hasRelevantVerifiedOrSkipped && strongEntries.length === 0) {
    missing.push(`No relevant source probe for ${requirement.helpfulSourceIds.join(", ")}.`);
  }

  const nextActions = buildNextActions(requirement, verifications, strongEntries.length);
  const status =
    missing.length === 0
      ? "passed"
      : relevantMatchingEntries.length > 0 || nextActions.some((action) => action.includes("Set "))
        ? "partial"
        : "missing";

  return {
    id: requirement.id,
    label: requirement.label,
    status,
    evidenceIds: strongEntries.map((entry) => entry.id),
    missing,
    nextActions
  };
}

function buildNextActions(
  requirement: BrandChainLedgerRequirement,
  verifications: SourceVerificationResult[],
  strongEvidenceCount: number
) {
  const actions: string[] = [];
  const relevant = verifications.filter((verification) => requirement.helpfulSourceIds.includes(verification.sourceId));
  const skipped = relevant.filter((verification) => verification.status === "skipped_auth_required");
  const failed = relevant.filter((verification) => verification.status === "failed");

  for (const verification of skipped) {
    actions.push(`Set credentials or authorization for ${verification.sourceId}: ${verification.message}`);
  }
  for (const verification of failed) {
    actions.push(`Fix failed probe for ${verification.sourceId}: ${verification.message}`);
  }
  if (strongEvidenceCount === 0 && actions.length === 0) {
    actions.push(`Add evidence from one of: ${requirement.helpfulSourceIds.join(", ")}.`);
  }
  if (requirement.id === "materials") {
    actions.push("Add BOM, fabric/yarn consumption, unit conversion, and wastage assumptions before claiming physical volume.");
  }
  if (requirement.id === "platform") {
    actions.push("Use authorized platform APIs or first-party shop data for orders, price, inventory, and return signals.");
  }

  return dedupe(actions);
}

function summarizeGate(status: BrandChainGateResult["status"], passedCount: number, totalCount: number) {
  if (status === "chain_verified") {
    return `All ${totalCount} ledgers passed; brand supply-chain conclusion can be considered verified for the scoped data.`;
  }
  if (status === "partial_chain") {
    return `${passedCount}/${totalCount} ledgers passed; this is a partial chain, not a full supply-chain verification.`;
  }
  return `${passedCount}/${totalCount} ledgers passed; current evidence is insufficient for a brand supply-chain conclusion.`;
}

function dedupe(values: string[]) {
  return Array.from(new Set(values));
}
