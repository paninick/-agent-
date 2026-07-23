import type { ProviderConfig } from "./types";

/**
 * Default provider configurations for 4 suppliers.
 * All use OpenAI-compatible chat completions API format.
 *
 * API keys are read from environment variables — never hardcoded.
 * The `modelMapping` maps internal modelIds to provider-specific model identifiers.
 */
export const defaultProviderConfigs: ProviderConfig[] = [
  {
    providerId: "deepseek",
    baseUrl: "https://api.deepseek.com/v1/chat/completions",
    apiKeyEnv: "DEEPSEEK_API_KEY",
    modelMapping: {
      "deepseek-v4-flash": "deepseek-chat",
      "deepseek-v4-pro": "deepseek-reasoner"
    }
  },
  {
    providerId: "volcengine",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3/chat/completions",
    apiKeyEnv: "ARK_API_KEY",
    modelMapping: {
      "doubao-seed-2.0-pro": "doubao-seed-2-0-pro-241215",
      "ark-code-latest": "ark-code-20250423"
    },
    extraHeaders: {
      "X-Source": "openai-agents"
    }
  },
  {
    providerId: "openrouter",
    baseUrl: "https://openrouter.ai/api/v1/chat/completions",
    apiKeyEnv: "OPENROUTER_API_KEY",
    modelMapping: {
      "claude-sonnet-4.6": "anthropic/claude-sonnet-4.6",
      "gpt-5.4": "openai/gpt-5.4",
      "gemini-3.1-flash-lite": "google/gemini-3.1-flash-lite"
    }
  },
  {
    providerId: "longcat",
    baseUrl: "https://api.longcat.chat/v1/chat/completions",
    apiKeyEnv: "LONGCAT_API_KEY",
    modelMapping: {
      "longcat-v1": "longcat-v1",
      "longcat-flash": "longcat-flash"
    }
  }
];

/**
 * Resolve the provider config for a given internal modelId.
 * Searches through all provider configs for a matching modelMapping entry.
 */
export function resolveProvider(
  modelId: string,
  configs: ProviderConfig[] = defaultProviderConfigs
): ProviderConfig | undefined {
  return configs.find((config) => modelId in config.modelMapping);
}

/**
 * Read the API key for a provider from the environment.
 * Returns undefined if the environment variable is not set or is empty.
 *
 * This is the ONLY function in the integration layer that reads process.env.
 */
export function resolveApiKey(config: ProviderConfig): string | undefined {
  const key = process.env[config.apiKeyEnv];
  if (!key || key.trim().length === 0) return undefined;
  return key.trim();
}

/**
 * Resolve the provider-specific model identifier for an internal modelId.
 * Returns the internal modelId itself if no mapping is found.
 */
export function resolveProviderModelId(
  modelId: string,
  config: ProviderConfig
): string {
  return config.modelMapping[modelId] ?? modelId;
}

/**
 * List all modelIds known across all provider configs.
 */
export function listKnownModelIds(
  configs: ProviderConfig[] = defaultProviderConfigs
): string[] {
  const ids = new Set<string>();
  for (const config of configs) {
    for (const modelId of Object.keys(config.modelMapping)) {
      ids.add(modelId);
    }
  }
  return [...ids];
}
