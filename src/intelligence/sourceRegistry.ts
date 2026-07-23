import { z } from "zod";
import type { IntelligenceSource, SourceRegistry, SourceTier } from "./types";

const sourceTierSchema = z.enum(["S", "A+", "A", "B", "C"]);

const sourceSchema = z.object({
  id: z.string().min(2),
  name: z.string().min(2),
  tier: sourceTierSchema,
  sourceWeight: z.number().min(0).max(1),
  trust_weight: z.number().min(0).max(1).optional(),
  latency_score: z.number().min(0).max(1).optional(),
  reliability_score: z.number().min(0).max(1).optional(),
  coverage_domain: z.string().min(1).optional(),
  type: z.enum([
    "official_api",
    "authorized_platform_api",
    "internal_operational_system",
    "open_supply_chain_database",
    "compliance_research_database",
    "official_research_and_statistics",
    "official_trade_research",
    "consulting_report"
  ]),
  coverage: z.array(z.string().min(1)).min(1),
  officialUrl: z.string().url(),
  requiresAuth: z.union([z.boolean(), z.string()]),
  refreshCadence: z.string().min(1),
  evidenceUse: z.array(z.string().min(1)).min(1),
  crossChecks: z.array(z.string().min(1)),
  knownFailureModes: z.array(z.string().min(1))
}).transform((source) => ({
  ...source,
  trust_weight: source.trust_weight ?? source.sourceWeight,
  latency_score: source.latency_score ?? 0.8,
  reliability_score: source.reliability_score ?? source.sourceWeight,
  coverage_domain: source.coverage_domain ?? source.coverage[0] ?? "general"
}));

const tierDefinitionSchema = z.object({
  defaultWeight: z.number().min(0).max(1),
  meaning: z.string().min(1)
});

export const sourceRegistrySchema = z.object({
  version: z.string().min(1),
  purpose: z.string().min(1),
  tiers: z.object({
    S: tierDefinitionSchema,
    "A+": tierDefinitionSchema,
    A: tierDefinitionSchema,
    B: tierDefinitionSchema,
    C: tierDefinitionSchema
  }),
  sources: z.array(sourceSchema).min(1),
  minimumConclusionGate: z.object({
    hardConclusion: z.object({ requiresAtLeast: z.array(z.string()) }),
    hypothesisOnly: z.object({ when: z.array(z.string()) })
  })
});

export function parseSourceRegistry(raw: unknown): SourceRegistry {
  const registry = sourceRegistrySchema.parse(raw);
  assertUniqueSourceIds(registry.sources);
  assertTierWeights(registry);
  return registry;
}

export function getSource(registry: SourceRegistry, sourceId: string): IntelligenceSource {
  const source = registry.sources.find((item) => item.id === sourceId);
  if (!source) {
    throw new Error(`Unknown intelligence source: ${sourceId}`);
  }
  return source;
}

export function groupSourcesByTier(registry: SourceRegistry): Record<SourceTier, IntelligenceSource[]> {
  return registry.sources.reduce<Record<SourceTier, IntelligenceSource[]>>(
    (groups, source) => {
      groups[source.tier].push(source);
      return groups;
    },
    { S: [], "A+": [], A: [], B: [], C: [] }
  );
}

export function findSourcesByCoverage(registry: SourceRegistry, coverageNeedle: string): IntelligenceSource[] {
  const needle = coverageNeedle.toLowerCase();
  return registry.sources.filter((source) =>
    source.coverage.some((coverage) => coverage.toLowerCase().includes(needle))
  );
}

function assertUniqueSourceIds(sources: IntelligenceSource[]) {
  const seen = new Set<string>();
  for (const source of sources) {
    if (seen.has(source.id)) {
      throw new Error(`Duplicate intelligence source id: ${source.id}`);
    }
    seen.add(source.id);
  }
}

function assertTierWeights(registry: SourceRegistry) {
  for (const source of registry.sources) {
    const tierWeight = registry.tiers[source.tier].defaultWeight;
    if (source.sourceWeight > tierWeight + 0.15) {
      throw new Error(`Source ${source.id} weight is too high for tier ${source.tier}`);
    }
  }
}
