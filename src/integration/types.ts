import type { ModelProfile } from "../models/types";

// ===== Chat message types =====

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// ===== Model call request =====

export interface ModelCallRequest {
  modelId: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  taskType?: string;
  fallbackModelIds?: string[];
}

// ===== Model call response (discriminated union) =====

export type ModelGatewayErrorKind =
  | "no_provider"
  | "auth_failed"
  | "rate_limited"
  | "timeout"
  | "server_error"
  | "network_error"
  | "all_providers_failed"
  | "invalid_response";

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ModelCallSuccess {
  ok: true;
  modelId: string;
  content: string;
  usage: TokenUsage;
  latencyMs: number;
  provider: string;
  attemptedModels: string[];
  fallbackUsed: boolean;
}

export interface ModelCallFailure {
  ok: false;
  error: ModelGatewayErrorKind;
  message: string;
  attemptedModels: string[];
  lastError?: string;
}

export type ModelCallResponse = ModelCallSuccess | ModelCallFailure;

// ===== Provider configuration =====

export interface ProviderConfig {
  providerId: string;
  baseUrl: string;
  apiKeyEnv: string;
  modelMapping: Record<string, string>;
  extraHeaders?: Record<string, string>;
}

export interface ModelGatewayConfig {
  providers: ProviderConfig[];
  maxRetries: number;
  timeoutMs: number;
  fallbackEnabled: boolean;
}

// ===== Streaming types =====

export type ModelStreamChunk =
  | { type: "text_delta"; delta: string }
  | { type: "done"; usage: TokenUsage; modelId: string; provider: string }
  | { type: "tool_call"; toolCallId: string; name: string; arguments: string };

export interface ModelStreamError {
  error: ModelGatewayErrorKind;
  message: string;
  attemptedModels: string[];
}

// ===== ModelGateway interface =====

export interface ModelGateway {
  callModel(request: ModelCallRequest): Promise<ModelCallResponse>;
  callModelStream(request: ModelCallRequest): AsyncGenerator<ModelStreamChunk, void, unknown>;
  getAvailableModels(): string[];
}

// ===== Audit helpers =====

export interface ModelCallAuditEntry {
  eventType: "model_call_succeeded" | "model_call_failed";
  timestamp: string;
  metadata: {
    modelId: string;
    provider: string;
    attemptedModels: string[];
    fallbackUsed: boolean;
    latencyMs?: number;
    errorKind?: ModelGatewayErrorKind;
    integrationLayer: true;
  };
}

export function buildModelCallAudit(
  response: ModelCallResponse,
  requestedModelId: string
): ModelCallAuditEntry {
  const base = {
    eventType: response.ok ? "model_call_succeeded" as const : "model_call_failed" as const,
    timestamp: new Date().toISOString(),
    metadata: {
      modelId: response.ok ? response.modelId : requestedModelId,
      provider: response.ok ? response.provider : "unknown",
      attemptedModels: response.attemptedModels,
      fallbackUsed: response.ok ? response.fallbackUsed : false,
      integrationLayer: true as const,
      ...(response.ok
        ? { latencyMs: response.latencyMs }
        : { errorKind: response.error }),
    },
  };
  return base;
}
