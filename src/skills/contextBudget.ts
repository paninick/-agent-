import type {
  BudgetReport,
  BudgetReportItem,
  ClassifiedSkill,
  ContextBudgetAllocation,
  ContextBudgetConfig,
  ContextWindowTier,
  SkillPriority,
  SkillRegistryEntry,
} from "./types";

// Default window sizes per tier (in tokens)
const TIER_DEFAULTS: Record<ContextWindowTier, number> = {
  small: 8_000,
  medium: 32_000,
  large: 200_000,
};

const DEFAULT_RESERVED_MODEL = 4_000;
const DEFAULT_RESERVED_SYSTEM = 2_000;

const DEFAULT_ALWAYS_KEYWORDS = ["core", "required", "essential", "always", "default", "primary"];
const DEFAULT_RARELY_KEYWORDS = ["optional", "rare", "deprecated", "legacy", "experimental"];

export interface ClassificationHints {
  alwaysNeededSkillIds?: string[];
  rarelyNeededSkillIds?: string[];
  alwaysNeededKeywords?: string[];
  rarelyNeededKeywords?: string[];
}

export function defaultConfigForTier(tier: ContextWindowTier): ContextBudgetConfig {
  return {
    tier,
    windowSize: TIER_DEFAULTS[tier],
    reservedForModel: DEFAULT_RESERVED_MODEL,
    reservedForSystem: DEFAULT_RESERVED_SYSTEM,
  };
}

export function classifySkill(
  entry: SkillRegistryEntry,
  hints: ClassificationHints = {},
): ClassifiedSkill {
  const { descriptor, tokenEstimate } = entry;
  const desc = descriptor.description.toLowerCase();
  const alwaysKeywords = hints.alwaysNeededKeywords ?? DEFAULT_ALWAYS_KEYWORDS;
  const rarelyKeywords = hints.rarelyNeededKeywords ?? DEFAULT_RARELY_KEYWORDS;

  if (hints.alwaysNeededSkillIds?.includes(descriptor.skillId)) {
    return { descriptor, tokenEstimate, priority: "always_needed", reason: "Explicitly marked as always needed." };
  }
  if (hints.rarelyNeededSkillIds?.includes(descriptor.skillId)) {
    return { descriptor, tokenEstimate, priority: "rarely_needed", reason: "Explicitly marked as rarely needed." };
  }
  if (alwaysKeywords.some((kw) => desc.includes(kw))) {
    return { descriptor, tokenEstimate, priority: "always_needed", reason: "Description contains always-needed keyword." };
  }
  if (rarelyKeywords.some((kw) => desc.includes(kw))) {
    return { descriptor, tokenEstimate, priority: "rarely_needed", reason: "Description contains rarely-needed keyword." };
  }
  return { descriptor, tokenEstimate, priority: "sometimes_needed", reason: "No explicit classification — default to sometimes needed." };
}

export function classifyAll(
  entries: SkillRegistryEntry[],
  hints: ClassificationHints = {},
): ClassifiedSkill[] {
  return entries.map((entry) => classifySkill(entry, hints));
}

export function computeAllocation(
  config: ContextBudgetConfig,
  skills: ClassifiedSkill[],
): ContextBudgetAllocation {
  const reserved = config.reservedForModel + config.reservedForSystem;
  const availableForSkills = Math.max(0, config.windowSize - reserved);
  const estimatedSkillTokens = skills.reduce((sum, s) => sum + s.tokenEstimate.tokens, 0);
  const remainingBudget = Math.max(0, availableForSkills - estimatedSkillTokens);
  const utilizationPercent = availableForSkills > 0
    ? Math.round((estimatedSkillTokens / availableForSkills) * 100)
    : 0;
  return {
    totalWindow: config.windowSize,
    reserved,
    availableForSkills,
    estimatedSkillTokens,
    remainingBudget,
    utilizationPercent,
  };
}

const PRIORITY_ORDER: Record<SkillPriority, number> = {
  always_needed: 0,
  sometimes_needed: 1,
  rarely_needed: 2,
};

export function generateReport(
  config: ContextBudgetConfig,
  classified: ClassifiedSkill[],
): BudgetReport {
  const allocation = computeAllocation(config, classified);
  const warnings: string[] = [];
  const topOptimizations: string[] = [];

  if (allocation.utilizationPercent > 80) {
    warnings.push(`Context budget utilization at ${allocation.utilizationPercent}% — consider removing rarely-needed skills.`);
  }
  if (allocation.estimatedSkillTokens > allocation.availableForSkills) {
    warnings.push(`Context budget EXCEEDED by ${allocation.estimatedSkillTokens - allocation.availableForSkills} tokens.`);
  }

  const rarelyNeeded = classified.filter((s) => s.priority === "rarely_needed");
  const sometimesNeeded = classified.filter((s) => s.priority === "sometimes_needed");

  if (rarelyNeeded.length > 0) {
    const saved = rarelyNeeded.reduce((sum, s) => sum + s.tokenEstimate.tokens, 0);
    topOptimizations.push(`Remove ${rarelyNeeded.length} rarely-needed skill(s) → save ~${saved} tokens.`);
  }
  if (sometimesNeeded.length > 5) {
    topOptimizations.push(`Consider lazy-loading ${sometimesNeeded.length} sometimes-needed skill(s) — load only on demand.`);
  }

  const heavySkills = classified.filter((s) => s.tokenEstimate.tokens > 2000);
  for (const skill of heavySkills.slice(0, 3)) {
    topOptimizations.push(`Skill "${skill.descriptor.skillId}" is ${skill.tokenEstimate.tokens} tokens — consider splitting or trimming.`);
  }

  const items: BudgetReportItem[] = [...classified]
    .sort((a, b) =>
      PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
      || b.tokenEstimate.tokens - a.tokenEstimate.tokens,
    )
    .map((s) => ({
      skillId: s.descriptor.skillId,
      tokens: s.tokenEstimate.tokens,
      priority: s.priority,
      reason: s.reason,
    }));

  return {
    totalEstimatedTokens: allocation.estimatedSkillTokens,
    availableBudget: allocation.availableForSkills,
    utilizationPercent: allocation.utilizationPercent,
    items,
    warnings,
    topOptimizations,
  };
}
