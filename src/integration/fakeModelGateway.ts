import type {
  ChatMessage,
  ModelCallRequest,
  ModelCallResponse,
  ModelCallSuccess,
  ModelCallFailure,
  ModelGateway,
  ModelGatewayErrorKind,
  ModelStreamChunk,
  ModelStreamError,
  TokenUsage
} from "./types";

export interface FakeModelResponse {
  content: string;
  usage?: Partial<TokenUsage>;
  latencyMs?: number;
}

export interface FakeModelErrorOverride {
  modelId?: string;
  errorKind: ModelGatewayErrorKind;
  message?: string;
}

export interface FakeModelGatewayConfig {
  responses: Record<string, FakeModelResponse>;
  errorOverrides?: FakeModelErrorOverride[];
  defaultLatencyMs?: number;
  fallbackEnabled?: boolean;
}

const ZERO_USAGE: TokenUsage = {
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0
};

export class FakeModelGateway implements ModelGateway {
  private readonly config: FakeModelGatewayConfig;

  constructor(config: FakeModelGatewayConfig) {
    this.config = config;
  }

  async callModel(request: ModelCallRequest): Promise<ModelCallResponse> {
    const fallbackIds = request.fallbackModelIds ?? [];
    const candidates = [request.modelId, ...fallbackIds];
    const attemptedModels: string[] = [];
    const fallbackEnabled = this.config.fallbackEnabled ?? true;

    for (let i = 0; i < candidates.length; i++) {
      const candidateId = candidates[i];
      attemptedModels.push(candidateId);
      const isFallback = i > 0;

      const override = this.matchOverride(candidateId);
      if (override) {
        const shouldContinue = fallbackEnabled && i < candidates.length - 1;
        if (!shouldContinue) {
          const hadPreviousAttempts = i > 0;
          return {
            ok: false,
            error: hadPreviousAttempts ? "all_providers_failed" : override.errorKind,
            message: hadPreviousAttempts
              ? "All model candidates failed."
              : override.message ?? `Synthetic gateway error: ${override.errorKind}`,
            attemptedModels,
            lastError: override.message ?? `Synthetic gateway error: ${override.errorKind}`
          } as ModelCallFailure;
        }
        continue;
      }

      const response = this.config.responses[candidateId];
      if (response) {
        return {
          ok: true,
          modelId: candidateId,
          content: response.content,
          usage: { ...ZERO_USAGE, ...response.usage },
          latencyMs: response.latencyMs ?? this.config.defaultLatencyMs ?? 0,
          provider: "fake",
          attemptedModels,
          fallbackUsed: isFallback
        } as ModelCallSuccess;
      }

      if (!fallbackEnabled || i >= candidates.length - 1) {
        return {
          ok: false,
          error: "no_provider",
          message: `No fake response configured for model "${candidateId}".`,
          attemptedModels
        } as ModelCallFailure;
      }
    }

    return {
      ok: false,
      error: "all_providers_failed",
      message: "All model candidates failed.",
      attemptedModels
    } as ModelCallFailure;
  }

  getAvailableModels(): string[] {
    return Object.keys(this.config.responses);
  }

  async *callModelStream(request: ModelCallRequest): AsyncGenerator<ModelStreamChunk, void, unknown> {
    const fallbackIds = request.fallbackModelIds ?? [];
    const candidates = [request.modelId, ...fallbackIds];
    const attemptedModels: string[] = [];
    const fallbackEnabled = this.config.fallbackEnabled ?? true;

    for (let i = 0; i < candidates.length; i++) {
      const candidateId = candidates[i];
      attemptedModels.push(candidateId);

      const override = this.matchOverride(candidateId);
      if (override) {
        const shouldContinue = fallbackEnabled && i < candidates.length - 1;
        if (!shouldContinue) {
          const hadPreviousAttempts = i > 0;
          throw {
            error: hadPreviousAttempts ? "all_providers_failed" : override.errorKind,
            message: hadPreviousAttempts
              ? "All model candidates failed."
              : override.message ?? `Synthetic gateway error: ${override.errorKind}`,
            attemptedModels
          } as ModelStreamError;
        }
        continue;
      }

      const response = this.config.responses[candidateId];
      if (response) {
        // Simulate streaming by yielding content in chunks.
        const content = response.content;
        const chunkSize = Math.max(1, Math.ceil(content.length / 4));
        for (let j = 0; j < content.length; j += chunkSize) {
          yield { type: "text_delta", delta: content.slice(j, j + chunkSize) };
        }
        yield {
          type: "done",
          usage: { ...ZERO_USAGE, ...response.usage },
          modelId: candidateId,
          provider: "fake"
        };
        return;
      }

      if (!fallbackEnabled || i >= candidates.length - 1) {
        throw {
          error: "no_provider",
          message: `No fake response configured for model "${candidateId}".`,
          attemptedModels
        } as ModelStreamError;
      }
    }

    throw { error: "all_providers_failed", message: "All model candidates failed.", attemptedModels } as ModelStreamError;
  }

  private matchOverride(modelId: string): FakeModelErrorOverride | undefined {
    const overrides = this.config.errorOverrides;
    if (!overrides || overrides.length === 0) return undefined;
    const exact = overrides.find((o) => o.modelId === modelId);
    if (exact) return exact;
    const catchAll = overrides.find((o) => o.modelId === undefined);
    return catchAll;
  }
}
