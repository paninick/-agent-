import { defaultModelProfiles } from "./modelProfiles";
import { scoreModel } from "./modelPolicy";
import type { ModelProfile, ModelRouter, ModelSelectionRequest, ModelSelectionResult } from "./types";

export class StaticModelRouter implements ModelRouter {
  private readonly profiles: ModelProfile[];

  constructor(profiles: ModelProfile[] = defaultModelProfiles) {
    this.profiles = profiles.map((profile) => ({
      ...profile,
      capabilities: [...profile.capabilities],
      defaultFor: [...(profile.defaultFor ?? [])],
      fallbackModelIds: [...profile.fallbackModelIds]
    }));
  }

  selectModel(request: ModelSelectionRequest): ModelSelectionResult {
    const warnings = privacyWarnings(request);
    const scored = this.profiles
      .map((profile, profileIndex) => ({ profile, profileIndex, policy: scoreModel(profile, request) }))
      .filter((entry) => Number.isFinite(entry.policy.score))
      .sort(
        (left, right) =>
          right.policy.score - left.policy.score ||
          costRank(left.profile.costTier) - costRank(right.profile.costTier) ||
          latencyRank(left.profile.latencyTier) - latencyRank(right.profile.latencyTier) ||
          contextRank(right.profile.contextWindowTier) - contextRank(left.profile.contextWindowTier) ||
          left.profileIndex - right.profileIndex
      );

    if (scored.length === 0) {
      return {
        ok: false,
        fallbackModelIds: [],
        reason: `No enabled model satisfies required capabilities: ${request.requiredCapabilities.join(", ") || "none"}.`,
        confidence: 0,
        warnings,
        error: "no_model_available"
      };
    }

    const best = scored[0];
    const fallbackModelIds = this.getFallbackChain(best.profile.modelId);

    return {
      ok: true,
      selectedModelId: best.profile.modelId,
      fallbackModelIds,
      reason: best.policy.reasons.join("; "),
      confidence: confidenceFromScore(best.policy.score),
      estimatedCostTier: best.profile.costTier,
      warnings
    };
  }

  getFallbackChain(modelId: string): string[] {
    const seen = new Set<string>([modelId]);
    const chain: string[] = [];
    const visit = (currentModelId: string) => {
      const profile = this.profiles.find((candidate) => candidate.modelId === currentModelId);
      if (!profile) return;
      for (const fallbackId of profile.fallbackModelIds) {
        if (seen.has(fallbackId)) continue;
        const fallback = this.profiles.find((candidate) => candidate.modelId === fallbackId);
        if (!fallback?.enabled) continue;
        seen.add(fallbackId);
        chain.push(fallbackId);
        visit(fallbackId);
      }
    };
    visit(modelId);
    return chain;
  }

  explainSelection(request: ModelSelectionRequest, result: ModelSelectionResult): string {
    const selected = result.selectedModelId ?? "none";
    const fallback = result.fallbackModelIds.length > 0 ? result.fallbackModelIds.join(" -> ") : "none";
    return [
      `selected=${selected}`,
      `taskType=${request.taskType}`,
      `complexity=${request.complexity}`,
      `requiredCapabilities=${request.requiredCapabilities.join(",") || "none"}`,
      `reason=${result.reason}`,
      `fallback=${fallback}`,
      `confidence=${result.confidence}`
    ].join("; ");
  }
}

/**
 * Convert raw policy score to confidence (0.1..0.99).
 * Denominator accounts for both the qualitative base (max ~220) and the
 * NP3 multi-factor numeric bonus (max ~115, = 1.0 * 100 + 0.15 * 100).
 */
function confidenceFromScore(score: number) {
  return Math.min(0.99, Math.max(0.1, Number((score / 335).toFixed(3))));
}

function costRank(costTier: ModelProfile["costTier"]) {
  return { low: 0, medium: 1, high: 2 }[costTier];
}

function latencyRank(latencyTier: ModelProfile["latencyTier"]) {
  return { fast: 0, normal: 1, slow: 2 }[latencyTier];
}

function contextRank(contextWindowTier: ModelProfile["contextWindowTier"]) {
  return { small: 0, medium: 1, large: 2 }[contextWindowTier];
}

function privacyWarnings(request: ModelSelectionRequest) {
  if (request.privacyLevel !== "sensitive") return [];
  return ["Sensitive privacy level requires policy review before any real model call; router decision only."];
}
