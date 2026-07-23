export type ModelCapability =
  | "reasoning"
  | "coding"
  | "structured_output"
  | "web_research"
  | "long_context"
  | "vision"
  | "fast_classification"
  | "creative_writing"
  | "tool_calling";

export type ModelCostTier = "low" | "medium" | "high";
export type ModelLatencyTier = "fast" | "normal" | "slow";
export type ModelContextWindowTier = "small" | "medium" | "large";
export type ModelComplexity = "simple" | "standard" | "complex" | "critical";
export type ModelCostPreference = "minimize" | "balanced" | "quality_first";
export type ModelLatencyPreference = "fast" | "balanced" | "quality_first";
export type ModelPrivacyLevel = "public" | "internal" | "sensitive";

export interface ModelProfile {
  modelId: string;
  provider: string;
  capabilities: ModelCapability[];
  costTier: ModelCostTier;
  latencyTier: ModelLatencyTier;
  contextWindowTier: ModelContextWindowTier;
  defaultFor?: string[];
  fallbackModelIds: string[];
  enabled: boolean;
  /**
   * 精确定价（美元/1k tokens），用于 CostEngine 估算。
   * 来自各厂商公开定价页，仅用于成本估算，不是 API key。
   * optional - 缺失时 CostEngine 按 0 估算。
   */
  inputCostPer1k?: number;
  outputCostPer1k?: number;
  /** 精确上下文窗口（token 数），替代 contextWindowTier 的定性分级。 */
  contextWindow?: number;
  /** 模型质量评分 (0-1)，用于路由打分。 */
  qualityScore?: number;
  /** 模型可靠性评分 (0-1)。 */
  reliabilityScore?: number;
  /** 模型延迟评分 (0-1)，越高越快。 */
  latencyScore?: number;
}

export interface ModelSelectionRequest {
  taskType: string;
  requiredCapabilities: ModelCapability[];
  complexity: ModelComplexity;
  costPreference: ModelCostPreference;
  latencyPreference: ModelLatencyPreference;
  privacyLevel: ModelPrivacyLevel;
}

export interface ModelSelectionSuccess {
  ok: true;
  selectedModelId: string;
  fallbackModelIds: string[];
  reason: string;
  confidence: number;
  estimatedCostTier: ModelCostTier;
  warnings: string[];
}

export interface ModelSelectionFailure {
  ok: false;
  error: "no_model_available";
  reason: string;
  warnings: string[];
  fallbackModelIds: [];
  confidence: 0;
  selectedModelId?: never;
  estimatedCostTier?: never;
}

export type ModelSelectionResult = ModelSelectionSuccess | ModelSelectionFailure;

export interface ModelRouter {
  selectModel(request: ModelSelectionRequest): ModelSelectionResult;
  getFallbackChain(modelId: string): string[];
  explainSelection(request: ModelSelectionRequest, result: ModelSelectionResult): string;
}
