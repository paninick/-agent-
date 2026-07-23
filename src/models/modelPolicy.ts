import type { ModelProfile, ModelSelectionRequest } from "./types";

export interface ModelPolicyScore {
  score: number;
  reasons: string[];
}

/**
 * NP3-inspired multi-factor scoring weights.
 * When a model profile has numeric score fields (qualityScore, reliabilityScore, etc.),
 * these weights are applied as an additive bonus on top of the qualitative base score.
 * If the numeric fields are absent, the bonus is 0 and behavior is unchanged.
 */
const NP3_WEIGHTS = {
  quality: 0.3,
  taskFit: 0.2,
  reliability: 0.15,
  costEfficiency: 0.15,
  latency: 0.1,
  contextFit: 0.1,
} as const;

/** Max bonus from the NP3 multi-factor layer (sum of all weights). */
const NP3_MAX_BONUS = 1.0;

/** Preferred-model boost when profile.defaultFor includes the request taskType. */
const NP3_PREFERRED_BOOST = 0.15;

export function scoreModel(profile: ModelProfile, request: ModelSelectionRequest): ModelPolicyScore {
  const reasons: string[] = [];
  let score = 0;

  if (!profile.enabled) {
    return { score: Number.NEGATIVE_INFINITY, reasons: ["model is disabled"] };
  }

  const missingCapabilities = request.requiredCapabilities.filter((capability) => !profile.capabilities.includes(capability));
  if (missingCapabilities.length > 0) {
    return {
      score: Number.NEGATIVE_INFINITY,
      reasons: [`missing required capabilities: ${missingCapabilities.join(", ")}`]
    };
  }

  // --- Qualitative base score (backward-compatible) ---

  if (request.requiredCapabilities.length > 0) {
    score += 100;
    reasons.push(`matches required capabilities: ${request.requiredCapabilities.join(", ")}`);
  }

  if (profile.defaultFor?.includes(request.taskType)) {
    score += 20;
    reasons.push(`default for ${request.taskType}`);
  }

  if (request.costPreference === "minimize") {
    const costScore = profile.costTier === "low" ? 35 : profile.costTier === "medium" ? 15 : 0;
    score += costScore;
    if (costScore > 0) reasons.push(`cost preference favors ${profile.costTier} cost`);
  }

  if (request.latencyPreference === "fast") {
    const latencyScore = profile.latencyTier === "fast" ? 35 : profile.latencyTier === "normal" ? 15 : 0;
    score += latencyScore;
    if (latencyScore > 0) reasons.push(`latency preference favors ${profile.latencyTier} latency`);
  }

  if ((request.complexity === "complex" || request.complexity === "critical") && profile.capabilities.includes("reasoning")) {
    score += request.complexity === "critical" ? 45 : 35;
    reasons.push(`${request.complexity} complexity favors reasoning capability`);
  }

  if (request.taskType === "code_task" && profile.capabilities.includes("coding")) {
    score += 45;
    reasons.push("code_task favors coding capability");
  }

  if (request.taskType === "document_analysis" && profile.capabilities.includes("long_context")) {
    score += 45;
    reasons.push("document_analysis favors long_context capability");
  }

  if (
    (request.taskType === "simple_classification" || request.taskType === "classification") &&
    profile.capabilities.includes("fast_classification") &&
    profile.costTier === "low" &&
    profile.latencyTier === "fast"
  ) {
    score += 25;
    reasons.push("simple classification favors low cost and fast latency");
  }

  // --- NP3 multi-factor numeric bonus (only when score fields present) ---

  const np3Bonus = computeNp3Bonus(profile, request);
  if (np3Bonus.bonus > 0) {
    score += Math.round(np3Bonus.bonus * 100);
    reasons.push(np3Bonus.reason);
  }

  return { score, reasons };
}

/**
 * Compute the NP3 multi-factor bonus using numeric score fields.
 * Returns 0 bonus if the profile lacks numeric scores (backward compatible).
 *
 * Formula (weights sum to 1.0, result is 0..1 scaled):
 *   0.30 * quality + 0.20 * taskFit + 0.15 * reliability
 *   + 0.15 * costEfficiency + 0.10 * latency + 0.10 * contextFit
 *   + preferredBoost
 */
function computeNp3Bonus(
  profile: ModelProfile,
  request: ModelSelectionRequest,
): { bonus: number; reason: string } {
  const hasNumericScores =
    profile.qualityScore !== undefined ||
    profile.reliabilityScore !== undefined ||
    profile.latencyScore !== undefined;

  if (!hasNumericScores) {
    return { bonus: 0, reason: "" };
  }

  const quality = clamp01(profile.qualityScore ?? 0.5);
  const reliability = clamp01(profile.reliabilityScore ?? 0.5);
  const latency = clamp01(profile.latencyScore ?? 0.5);

  // taskFit: how well the profile's capabilities match the request's task type.
  const taskFit = computeTaskFit(profile, request);

  // costEfficiency: lower cost per token -> higher score.
  const costEfficiency = computeCostEfficiency(profile);

  // contextFit: does the context window comfortably fit the task complexity?
  const contextFit = computeContextFit(profile, request);

  let bonus =
    NP3_WEIGHTS.quality * quality +
    NP3_WEIGHTS.taskFit * taskFit +
    NP3_WEIGHTS.reliability * reliability +
    NP3_WEIGHTS.costEfficiency * costEfficiency +
    NP3_WEIGHTS.latency * latency +
    NP3_WEIGHTS.contextFit * contextFit;

  const reasons: string[] = [];

  // preferredBoost: extra weight when the profile is a designated default for this task.
  if (profile.defaultFor?.includes(request.taskType)) {
    bonus += NP3_PREFERRED_BOOST;
    reasons.push("preferred");
  }

  // Cap to the theoretical max (weights sum + preferred boost).
  bonus = Math.min(bonus, NP3_MAX_BONUS + NP3_PREFERRED_BOOST);

  const detail = [
    `q=${quality.toFixed(2)}`,
    `fit=${taskFit.toFixed(2)}`,
    `rel=${reliability.toFixed(2)}`,
    `cost=${costEfficiency.toFixed(2)}`,
    `lat=${latency.toFixed(2)}`,
    `ctx=${contextFit.toFixed(2)}`,
  ];
  if (reasons.length > 0) detail.push(reasons.join("+"));

  return {
    bonus,
    reason: `NP3 multi-factor (${detail.join(", ")})`,
  };
}

/** Task fit: 1.0 if profile is defaultFor this task, 0.8 if capabilities match, 0.5 baseline. */
function computeTaskFit(profile: ModelProfile, request: ModelSelectionRequest): number {
  if (profile.defaultFor?.includes(request.taskType)) return 1.0;

  // Capability-based fit: does the profile have capabilities relevant to the task?
  const taskCapabilityMap: Record<string, string[]> = {
    code_task: ["coding"],
    complex_reasoning: ["reasoning"],
    document_analysis: ["long_context"],
    simple_classification: ["fast_classification"],
    classification: ["fast_classification", "structured_output"],
    research: ["web_research"],
    business_analysis: ["reasoning", "structured_output"],
    vision_review: ["vision"],
  };
  const relevantCaps = taskCapabilityMap[request.taskType] ?? [];
  if (relevantCaps.length === 0) return 0.5;

  const matchCount = relevantCaps.filter((cap) => profile.capabilities.includes(cap as ModelProfile["capabilities"][number])).length;
  return matchCount === relevantCaps.length ? 0.8 : 0.5 + 0.3 * (matchCount / relevantCaps.length);
}

/**
 * Cost efficiency: normalize per-token cost to a 0..1 score.
 * Uses input+output cost per 1k tokens. Cheapest known model -> ~1.0, most expensive -> ~0.2.
 * Falls back to qualitative costTier mapping when pricing data is absent.
 */
function computeCostEfficiency(profile: ModelProfile): number {
  if (profile.inputCostPer1k !== undefined && profile.outputCostPer1k !== undefined) {
    // Estimate blended cost per 1k tokens (assume 2:1 input:output ratio).
    const blended = (profile.inputCostPer1k * 2 + profile.outputCostPer1k) / 3;
    // Known range: cheapest ~0.0005, most expensive ~0.01.
    // Use inverse log-scale: score = 1 - log10(blended / minCost) / log10(maxCost / minCost)
    const minCost = 0.0005;
    const maxCost = 0.02;
    if (blended <= minCost) return 1.0;
    if (blended >= maxCost) return 0.1;
    const normalized = 1 - Math.log10(blended / minCost) / Math.log10(maxCost / minCost);
    return clamp01(normalized);
  }

  // Fallback: qualitative tier mapping.
  return profile.costTier === "low" ? 0.9 : profile.costTier === "medium" ? 0.5 : 0.2;
}

/**
 * Context fit: does the model's context window handle the task complexity?
 * simple: any context is fine. critical: needs large context.
 */
function computeContextFit(profile: ModelProfile, request: ModelSelectionRequest): number {
  if (profile.contextWindow !== undefined) {
    const minRequired: Record<typeof request.complexity, number> = {
      simple: 8000,
      standard: 32000,
      complex: 64000,
      critical: 128000,
    };
    const required = minRequired[request.complexity];
    if (profile.contextWindow >= required * 2) return 1.0;
    if (profile.contextWindow >= required) return 0.8;
    if (profile.contextWindow >= required * 0.5) return 0.4;
    return 0.1;
  }

  // Fallback: qualitative tier mapping.
  const tierFit: Record<typeof request.complexity, Record<ModelProfile["contextWindowTier"], number>> = {
    simple: { small: 0.8, medium: 0.9, large: 1.0 },
    standard: { small: 0.3, medium: 0.8, large: 1.0 },
    complex: { small: 0.1, medium: 0.5, large: 0.9 },
    critical: { small: 0.1, medium: 0.3, large: 0.8 },
  };
  return tierFit[request.complexity][profile.contextWindowTier];
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
