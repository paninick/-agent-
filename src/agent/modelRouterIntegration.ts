import { StaticModelRouter } from "../models";
import type { ModelSelectionRequest } from "../models";
import type { ModelGateway } from "../integration";

// ===== Router integration result =====

export interface RouterSelectionResult {
  ok: boolean;
  modelId: string;
  fallbackModelIds: string[];
  reason: string;
  availableModelIds: string[];
}

/**
 * Use the StaticModelRouter to select a model for the Launch Desk task,
 * then verify the selected model is available through the ModelGateway.
 *
 * If the router's selection is available in the gateway, use it.
 * If not, fall back to the first available gateway model (or defaultModelId).
 */
export function selectModelForLaunchDesk(
  router: StaticModelRouter,
  gateway: ModelGateway,
  request: ModelSelectionRequest,
  defaultModelId: string,
): RouterSelectionResult {
  const availableModelIds = gateway.getAvailableModels();

  // If no models are available, return early with the default (SDK path).
  if (availableModelIds.length === 0) {
    return {
      ok: false,
      modelId: defaultModelId,
      fallbackModelIds: [],
      reason: "No provider keys configured — falling back to SDK default provider.",
      availableModelIds,
    };
  }

  const selection = router.selectModel(request);

  if (selection.ok && availableModelIds.includes(selection.selectedModelId)) {
    // Router selection is available — filter fallbacks to only those available in gateway.
    const availableFallbacks = selection.fallbackModelIds.filter((id) => availableModelIds.includes(id));
    return {
      ok: true,
      modelId: selection.selectedModelId,
      fallbackModelIds: availableFallbacks,
      reason: selection.reason,
      availableModelIds,
    };
  }

  // Router selection not available — use first available gateway model.
  const fallback = availableModelIds[0];
  const remaining = availableModelIds.filter((id) => id !== fallback);
  return {
    ok: false,
    modelId: fallback,
    fallbackModelIds: remaining.slice(0, 3), // cap fallback chain at 3
    reason: selection.ok
      ? `Router selected "${selection.selectedModelId}" but it's not available in gateway. Using "${fallback}" instead.`
      : `Router returned no model. Using first available gateway model "${fallback}".`,
    availableModelIds,
  };
}

/**
 * Build a default ModelSelectionRequest for the Launch Desk release-planning task.
 */
export function launchDeskSelectionRequest(): ModelSelectionRequest {
  return {
    taskType: "release_planning",
    requiredCapabilities: ["structured_output", "reasoning"],
    complexity: "standard",
    costPreference: "balanced",
    latencyPreference: "balanced",
    privacyLevel: "internal",
  };
}
