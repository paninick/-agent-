import type { IntelligenceSource, SourceRegistry } from "./types";

export interface MonitoringDimension {
  id: string;
  label: string;
  requiredCoverage: string[];
  mustHavePrimary: boolean;
}

export interface MonitoringCoverageResult {
  dimensionId: string;
  label: string;
  status: "covered" | "covered_but_auth_needed" | "partial" | "gap";
  matchedSources: Array<{
    id: string;
    name: string;
    tier: string;
    requiresAuth: boolean | string;
  }>;
  missingCoverage: string[];
}

export const globalMonitoringDimensions: MonitoringDimension[] = [
  {
    id: "financials_and_disclosures",
    label: "Company financials and disclosures",
    requiredCoverage: ["filings", "xbrl", "risk_disclosure"],
    mustHavePrimary: true
  },
  {
    id: "customs_and_trade",
    label: "Customs, tariffs, and trade flows",
    requiredCoverage: ["global_trade", "us_trade", "tariff"],
    mustHavePrimary: true
  },
  {
    id: "supplier_facilities",
    label: "Supplier identity and factory facilities",
    requiredCoverage: ["facility_identity", "factory_location"],
    mustHavePrimary: false
  },
  {
    id: "macro_cost_drivers",
    label: "FX, labor, energy, rates, and macro cost drivers",
    requiredCoverage: ["macro", "rates", "labor", "energy"],
    mustHavePrimary: true
  },
  {
    id: "platform_orders_and_prices",
    label: "Temu, Shopee, Alibaba/1688 platform orders and prices",
    requiredCoverage: ["orders", "products", "inventory", "pricing"],
    mustHavePrimary: true
  },
  {
    id: "compliance_and_labor",
    label: "Labor, compliance, and factory risk",
    requiredCoverage: ["factory_compliance", "labor_conditions", "wages"],
    mustHavePrimary: false
  },
  {
    id: "market_and_strategy_context",
    label: "Brand strategy, consumer, and market context",
    requiredCoverage: ["fashion_strategy", "consumer", "supply_chain_pressure"],
    mustHavePrimary: false
  }
];

export function assessMonitoringCoverage(
  registry: SourceRegistry,
  dimensions = globalMonitoringDimensions
): MonitoringCoverageResult[] {
  return dimensions.map((dimension) => {
    const matches = registry.sources.filter((source) => sourceMatchesAnyCoverage(source, dimension.requiredCoverage));
    const coveredTerms = new Set(
      matches.flatMap((source) =>
        source.coverage.filter((coverage) =>
          dimension.requiredCoverage.some((required) => coverage.toLowerCase().includes(required.toLowerCase()))
        )
      )
    );
    const missingCoverage = dimension.requiredCoverage.filter(
      (required) => !Array.from(coveredTerms).some((coverage) => coverage.toLowerCase().includes(required.toLowerCase()))
    );
    const hasPrimary = matches.some((source) => source.tier === "S" || source.tier === "A+");
    const hasAuthRequirement = matches.some((source) => source.requiresAuth !== false);

    return {
      dimensionId: dimension.id,
      label: dimension.label,
      status: classifyCoverage({
        matchCount: matches.length,
        missingCoverage,
        hasPrimary,
        hasAuthRequirement,
        mustHavePrimary: dimension.mustHavePrimary
      }),
      matchedSources: matches.map((source) => ({
        id: source.id,
        name: source.name,
        tier: source.tier,
        requiresAuth: source.requiresAuth
      })),
      missingCoverage
    };
  });
}

function sourceMatchesAnyCoverage(source: IntelligenceSource, requiredCoverage: string[]) {
  return requiredCoverage.some((required) =>
    source.coverage.some((coverage) => coverage.toLowerCase().includes(required.toLowerCase()))
  );
}

function classifyCoverage(args: {
  matchCount: number;
  missingCoverage: string[];
  hasPrimary: boolean;
  hasAuthRequirement: boolean;
  mustHavePrimary: boolean;
}): MonitoringCoverageResult["status"] {
  if (args.matchCount === 0) return "gap";
  if (args.missingCoverage.length > 0 || (args.mustHavePrimary && !args.hasPrimary)) return "partial";
  if (args.hasAuthRequirement) return "covered_but_auth_needed";
  return "covered";
}
