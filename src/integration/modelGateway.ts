import { defaultProviderConfigs, resolveApiKey, resolveProvider, resolveProviderModelId } from "./providerConfig";
import type {
  ChatMessage,
  ModelCallRequest,
  ModelCallResponse,
  ModelCallSuccess,
  ModelCallFailure,
  ModelGateway,
  ModelGatewayConfig,
  ModelGatewayErrorKind,
  ModelStreamChunk,
  ModelStreamError,
  ProviderConfig,
  TokenUsage
} from "./types";

const RETRYABLE_ERRORS: ReadonlySet<ModelGatewayErrorKind> = new Set([
  "rate_limited",
  "server_error",
  "network_error",
  "timeout"
]);

export class ModelGatewayImpl implements ModelGateway {
  private readonly config: ModelGatewayConfig;

  constructor(config: ModelGatewayConfig) {
    this.config = config;
  }

  async callModel(request: ModelCallRequest): Promise<ModelCallResponse> {
    const fallbackIds = request.fallbackModelIds ?? [];
    const candidates = [request.modelId, ...fallbackIds];
    const attemptedModels: string[] = [];

    for (let i = 0; i < candidates.length; i++) {
      const candidateId = candidates[i];
      attemptedModels.push(candidateId);
      const isFallback = i > 0;

      const result = await this.tryCallWithRetry(candidateId, request.messages, request.maxTokens, request.temperature);
      if (result.ok) {
        return {
          ...result,
          attemptedModels,
          fallbackUsed: isFallback
        } as ModelCallSuccess;
      }

      const lastError = result;
      const shouldContinueFallback = this.config.fallbackEnabled && i < candidates.length - 1;
      if (!shouldContinueFallback) {
        return {
          ok: false,
          error: lastError.error === "no_provider" && candidates.length === 1
            ? "no_provider"
            : "all_providers_failed",
          message: lastError.message,
          attemptedModels,
          lastError: lastError.message
        } as ModelCallFailure;
      }
    }

    return {
      ok: false,
      error: "all_providers_failed",
      message: "All model candidates failed.",
      attemptedModels
    };
  }

  getAvailableModels(): string[] {
    const available: string[] = [];
    for (const provider of this.config.providers) {
      for (const modelId of Object.keys(provider.modelMapping)) {
        if (resolveApiKey(provider)) {
          available.push(modelId);
        }
      }
    }
    return available;
  }

  async *callModelStream(request: ModelCallRequest): AsyncGenerator<ModelStreamChunk, void, unknown> {
    const fallbackIds = request.fallbackModelIds ?? [];
    const candidates = [request.modelId, ...fallbackIds];
    const attemptedModels: string[] = [];

    for (let i = 0; i < candidates.length; i++) {
      const candidateId = candidates[i];
      attemptedModels.push(candidateId);

      const provider = resolveProvider(candidateId, this.config.providers);
      if (!provider) {
        const shouldContinue = this.config.fallbackEnabled && i < candidates.length - 1;
        if (!shouldContinue) {
          throw { error: "no_provider", message: `No provider configured for model "${candidateId}".`, attemptedModels } as ModelStreamError;
        }
        continue;
      }

      const apiKey = resolveApiKey(provider);
      if (!apiKey) {
        const shouldContinue = this.config.fallbackEnabled && i < candidates.length - 1;
        if (!shouldContinue) {
          throw { error: "auth_failed", message: `API key not found for provider "${provider.providerId}" (env: ${provider.apiKeyEnv}).`, attemptedModels } as ModelStreamError;
        }
        continue;
      }

      try {
        yield* this.callProviderStream(provider, resolveProviderModelId(candidateId, provider), candidateId, request.messages, request.maxTokens, request.temperature);
        return;
      } catch (error) {
        // If the error is a ModelStreamError, it's terminal unless we can fall back.
        const streamError = error as ModelStreamError;
        const errorKind = streamError.error ?? "server_error";
        const shouldContinue = this.config.fallbackEnabled && RETRYABLE_ERRORS.has(errorKind) && i < candidates.length - 1;
        if (!shouldContinue) {
          throw streamError;
        }
        // Otherwise, try the next candidate
      }
    }

    throw { error: "all_providers_failed", message: "All model candidates failed.", attemptedModels } as ModelStreamError;
  }

  private async *callProviderStream(
    provider: ProviderConfig,
    providerModelId: string,
    internalModelId: string,
    messages: ChatMessage[],
    maxTokens?: number,
    temperature?: number
  ): AsyncGenerator<ModelStreamChunk, void, unknown> {
    const apiKey = resolveApiKey(provider)!;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...provider.extraHeaders
    };

    const body = JSON.stringify({
      model: providerModelId,
      messages,
      stream: true,
      ...(maxTokens !== undefined && { max_tokens: maxTokens }),
      ...(temperature !== undefined && { temperature })
    });

    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), this.config.timeoutMs);

    let response: Response;
    try {
      response = await fetch(provider.baseUrl, {
        method: "POST",
        headers,
        body,
        signal: controller.signal
      });
    } catch (error) {
      clearTimeout(timeoutHandle);
      if (error instanceof Error && error.name === "AbortError") {
        throw { error: "timeout", message: `Request to "${provider.providerId}" timed out after ${this.config.timeoutMs}ms.`, attemptedModels: [internalModelId] } as ModelStreamError;
      }
      const message = error instanceof Error ? error.message : String(error);
      throw { error: "network_error", message: `Network error contacting "${provider.providerId}": ${message}`, attemptedModels: [internalModelId] } as ModelStreamError;
    }

    clearTimeout(timeoutHandle);

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      const errorKind = this.mapHttpStatusToErrorKind(response.status);
      throw { error: errorKind, message: `Provider "${provider.providerId}" returned HTTP ${response.status}. ${errorBody}`.trim(), attemptedModels: [internalModelId] } as ModelStreamError;
    }

    if (!response.body) {
      throw { error: "invalid_response", message: `Provider "${provider.providerId}" returned no stream body.`, attemptedModels: [internalModelId] } as ModelStreamError;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let assembledContent = "";
    let finalUsage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data:")) continue;
          const dataStr = trimmed.slice(5).trim();
          if (dataStr === "[DONE]") continue;

          let parsed: Record<string, unknown>;
          try {
            parsed = JSON.parse(dataStr) as Record<string, unknown>;
          } catch {
            continue;
          }

          // Extract delta content
          const choices = parsed.choices;
          if (Array.isArray(choices) && choices.length > 0) {
            const choice = choices[0] as Record<string, unknown>;
            const delta = choice.delta as Record<string, unknown> | undefined;
            const content = delta?.content;
            if (typeof content === "string" && content.length > 0) {
              assembledContent += content;
              yield { type: "text_delta", delta: content };
            }
            // Some providers include tool_calls in the delta
            const toolCalls = delta?.tool_calls as unknown[] | undefined;
            if (Array.isArray(toolCalls)) {
              for (const tc of toolCalls) {
                const tcRecord = tc as Record<string, unknown>;
                const fn = tcRecord.function as Record<string, unknown> | undefined;
                if (fn && typeof tcRecord.id === "string" && typeof fn.name === "string") {
                  yield {
                    type: "tool_call",
                    toolCallId: tcRecord.id,
                    name: fn.name,
                    arguments: typeof fn.arguments === "string" ? fn.arguments : ""
                  };
                }
              }
            }
          }

          // Extract usage (some providers send it in the final chunk)
          const usageRaw = parsed.usage as Record<string, unknown> | undefined;
          if (usageRaw) {
            finalUsage = {
              promptTokens: typeof usageRaw.prompt_tokens === "number" ? usageRaw.prompt_tokens : finalUsage.promptTokens,
              completionTokens: typeof usageRaw.completion_tokens === "number" ? usageRaw.completion_tokens : finalUsage.completionTokens,
              totalTokens: typeof usageRaw.total_tokens === "number" ? usageRaw.total_tokens : finalUsage.totalTokens
            };
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    yield {
      type: "done",
      usage: finalUsage,
      modelId: internalModelId,
      provider: provider.providerId
    };
  }

  private mapHttpStatusToErrorKind(status: number): ModelGatewayErrorKind {
    if (status === 401 || status === 403) return "auth_failed";
    if (status === 429) return "rate_limited";
    if (status >= 500) return "server_error";
    return "server_error";
  }

  private async tryCallWithRetry(
    modelId: string,
    messages: ChatMessage[],
    maxTokens?: number,
    temperature?: number
  ): Promise<ModelCallResponse> {
    const provider = resolveProvider(modelId, this.config.providers);
    if (!provider) {
      return failure("no_provider", `No provider configured for model "${modelId}".`, [modelId]);
    }

    const apiKey = resolveApiKey(provider);
    if (!apiKey) {
      return failure("auth_failed", `API key not found for provider "${provider.providerId}" (env: ${provider.apiKeyEnv}).`, [modelId]);
    }

    const providerModelId = resolveProviderModelId(modelId, provider);
    let lastError: ModelCallFailure | null = null;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      const result = await this.callProvider(provider, providerModelId, modelId, messages, maxTokens, temperature);
      if (result.ok) return result;
      lastError = result as ModelCallFailure;
      if (!RETRYABLE_ERRORS.has(lastError.error)) break;
    }

    return lastError ?? failure("server_error", "Unknown error.", [modelId]);
  }

  private async callProvider(
    provider: ProviderConfig,
    providerModelId: string,
    internalModelId: string,
    messages: ChatMessage[],
    maxTokens?: number,
    temperature?: number
  ): Promise<ModelCallResponse> {
    const apiKey = resolveApiKey(provider)!;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...provider.extraHeaders
    };

    const body = JSON.stringify({
      model: providerModelId,
      messages,
      ...(maxTokens !== undefined && { max_tokens: maxTokens }),
      ...(temperature !== undefined && { temperature })
    });

    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), this.config.timeoutMs);

    const startTime = Date.now();
    try {
      const response = await fetch(provider.baseUrl, {
        method: "POST",
        headers,
        body,
        signal: controller.signal
      });

      clearTimeout(timeoutHandle);
      const latencyMs = Date.now() - startTime;

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        return this.mapHttpError(response.status, errorBody, provider, internalModelId);
      }

      const responseBody = await response.json().catch(() => null);
      const parsed = parseResponseBody(responseBody);
      if (!parsed) {
        return failure("invalid_response", `Provider "${provider.providerId}" returned an unparseable response.`, [internalModelId]);
      }

      return {
        ok: true,
        modelId: internalModelId,
        content: parsed.content,
        usage: parsed.usage,
        latencyMs,
        provider: provider.providerId,
        attemptedModels: [internalModelId],
        fallbackUsed: false
      } as ModelCallSuccess;
    } catch (error) {
      clearTimeout(timeoutHandle);
      if (error instanceof Error && error.name === "AbortError") {
        return failure("timeout", `Request to "${provider.providerId}" timed out after ${this.config.timeoutMs}ms.`, [internalModelId]);
      }
      const message = error instanceof Error ? error.message : String(error);
      return failure("network_error", `Network error contacting "${provider.providerId}": ${message}`, [internalModelId]);
    }
  }

  private mapHttpError(
    status: number,
    _body: string,
    provider: ProviderConfig,
    modelId: string
  ): ModelCallFailure {
    if (status === 401 || status === 403) {
      return failure("auth_failed", `Provider "${provider.providerId}" rejected credentials (HTTP ${status}).`, [modelId]);
    }
    if (status === 429) {
      return failure("rate_limited", `Provider "${provider.providerId}" rate limited the request (HTTP 429).`, [modelId]);
    }
    if (status >= 500) {
      return failure("server_error", `Provider "${provider.providerId}" server error (HTTP ${status}).`, [modelId]);
    }
    return failure("server_error", `Provider "${provider.providerId}" returned HTTP ${status}.`, [modelId]);
  }
}

function failure(
  error: ModelGatewayErrorKind,
  message: string,
  attemptedModels: string[]
): ModelCallFailure {
  return { ok: false, error, message, attemptedModels };
}

interface ParsedResponse {
  content: string;
  usage: TokenUsage;
}

function parseResponseBody(body: unknown): ParsedResponse | null {
  if (!body || typeof body !== "object") return null;
  const obj = body as Record<string, unknown>;
  const choices = obj.choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const firstChoice = choices[0] as Record<string, unknown>;
  const message = firstChoice?.message as Record<string, unknown> | undefined;
  const content = message?.content;
  if (typeof content !== "string") return null;
  const usageRaw = obj.usage as Record<string, unknown> | undefined;
  const usage: TokenUsage = {
    promptTokens: typeof usageRaw?.prompt_tokens === "number" ? usageRaw.prompt_tokens : 0,
    completionTokens: typeof usageRaw?.completion_tokens === "number" ? usageRaw.completion_tokens : 0,
    totalTokens: typeof usageRaw?.total_tokens === "number" ? usageRaw.total_tokens : 0
  };
  return { content, usage };
}

export function createModelGateway(config?: Partial<ModelGatewayConfig>): ModelGatewayImpl {
  return new ModelGatewayImpl({
    providers: config?.providers ?? defaultProviderConfigs,
    maxRetries: config?.maxRetries ?? 1,
    timeoutMs: config?.timeoutMs ?? 30000,
    fallbackEnabled: config?.fallbackEnabled ?? true
  });
}
