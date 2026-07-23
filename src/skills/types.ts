// ===== Skill descriptor =====

export interface SkillDescriptor {
  skillId: string;
  name: string;
  description: string;
  origin?: string;
  filePath: string;
  lineCount: number;
  charCount: number;
}

// ===== Token estimation =====

export type TokenEstimateMethod = "prose" | "code" | "mixed";

export interface TokenEstimate {
  tokens: number;
  method: TokenEstimateMethod;
}

// ===== Context budget =====

export type ContextWindowTier = "small" | "medium" | "large";

export interface ContextBudgetConfig {
  tier: ContextWindowTier;
  windowSize: number;
  reservedForModel: number;
  reservedForSystem: number;
}

export interface ContextBudgetAllocation {
  totalWindow: number;
  reserved: number;
  availableForSkills: number;
  estimatedSkillTokens: number;
  remainingBudget: number;
  utilizationPercent: number;
}

// ===== Skill classification =====

export type SkillPriority = "always_needed" | "sometimes_needed" | "rarely_needed";

export interface ClassifiedSkill {
  descriptor: SkillDescriptor;
  tokenEstimate: TokenEstimate;
  priority: SkillPriority;
  reason: string;
}

// ===== Skill load result (discriminated union) =====

export type SkillLoadStatus = "loaded" | "not_found" | "exceeds_budget" | "parse_error";

export interface SkillLoadSuccess {
  ok: true;
  descriptor: SkillDescriptor;
  content: string;
  tokenEstimate: TokenEstimate;
}

export interface SkillLoadFailure {
  ok: false;
  status: SkillLoadStatus;
  skillId: string;
  message: string;
}

export type SkillLoadResult = SkillLoadSuccess | SkillLoadFailure;

// ===== Skill registry =====

export interface SkillRegistryEntry {
  descriptor: SkillDescriptor;
  tokenEstimate: TokenEstimate;
}

// ===== Budget report =====

export interface BudgetReportItem {
  skillId: string;
  tokens: number;
  priority: SkillPriority;
  reason: string;
}

export interface BudgetReport {
  totalEstimatedTokens: number;
  availableBudget: number;
  utilizationPercent: number;
  items: BudgetReportItem[];
  warnings: string[];
  topOptimizations: string[];
}
