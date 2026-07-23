import type {
  AgentInputItem,
  AgentOutputItem,
  AssistantMessageItem,
  FunctionCallItem,
  FunctionCallResultItem,
  Model,
  ModelRequest,
  ModelResponse,
  ResponseStreamEvent,
  SystemMessageItem,
  UserMessageItem,
} from "@openai/agents";
import { Usage } from "@openai/agents";
import type {
  ChatMessage,
  ModelCallRequest,
  ModelGateway,
  ModelStreamChunk,
  ModelStreamError,
} from "../integration";

// ===== Adapter =====

/**
 * Wraps a ModelGateway so the OpenAI Agents SDK can call third-party models
 * (DeepSeek, 火山引擎, OpenRouter, longcat) through the gateway — preserving
 * the SDK's tool-call loop, tracing, and streaming.
 *
 * `getResponse` → `gateway.callModel` (one-shot).
 * `getStreamedResponse` → `gateway.callModelStream` (token-by-token).
 */
export class ModelGatewayModel implements Model {
  private readonly gateway: ModelGateway;
  private readonly modelId: string;
  private readonly fallbackModelIds: string[];

  constructor(gateway: ModelGateway, modelId: string, fallbackModelIds: string[] = []) {
    this.gateway = gateway;
    this.modelId = modelId;
    this.fallbackModelIds = fallbackModelIds;
  }

  async getResponse(request: ModelRequest): Promise<ModelResponse> {
    const messages = mapInputToMessages(request);
    const callRequest: ModelCallRequest = {
      modelId: this.modelId,
      fallbackModelIds: this.fallbackModelIds,
      messages,
      maxTokens: request.modelSettings.maxTokens,
      temperature: request.modelSettings.temperature,
    };

    const result = await this.gateway.callModel(callRequest);
    if (!result.ok) {
      throw new Error(`ModelGateway error: ${result.error} — ${result.message}`);
    }

    return {
      usage: new Usage({
        inputTokens: result.usage.promptTokens,
        outputTokens: result.usage.completionTokens,
        totalTokens: result.usage.totalTokens,
      }),
      output: parseContentToOutput(result.content, result.modelId),
      responseId: result.modelId,
    };
  }

  async *getStreamedResponse(request: ModelRequest): AsyncIterable<ResponseStreamEvent> {
    const messages = mapInputToMessages(request);
    const callRequest: ModelCallRequest = {
      modelId: this.modelId,
      fallbackModelIds: this.fallbackModelIds,
      messages,
      maxTokens: request.modelSettings.maxTokens,
      temperature: request.modelSettings.temperature,
    };

    let assembledContent = "";
    let usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    let modelId = this.modelId;

    try {
      for await (const chunk of this.gateway.callModelStream(callRequest)) {
        if (chunk.type === "text_delta") {
          assembledContent += chunk.delta;
          yield { type: "output_text_delta", delta: chunk.delta } as ResponseStreamEvent;
        } else if (chunk.type === "done") {
          usage = {
            inputTokens: chunk.usage.promptTokens,
            outputTokens: chunk.usage.completionTokens,
            totalTokens: chunk.usage.totalTokens,
          };
          modelId = chunk.modelId;
        }
      }
    } catch (error) {
      const streamError = error as ModelStreamError;
      const message = streamError.message ?? "Streaming model call failed.";
      throw new Error(`ModelGateway stream error: ${streamError.error ?? "unknown"} — ${message}`);
    }

    const output: AgentOutputItem[] = parseContentToOutput(assembledContent, modelId);

    yield {
      type: "response_done",
      response: {
        id: modelId,
        usage: new Usage(usage),
        output,
      },
    } as ResponseStreamEvent;
  }
}

// ===== Mapping helpers =====

function mapInputToMessages(request: ModelRequest): ChatMessage[] {
  const messages: ChatMessage[] = [];

  if (request.systemInstructions) {
    messages.push({ role: "system", content: request.systemInstructions });
  }

  if (typeof request.input === "string") {
    messages.push({ role: "user", content: request.input });
    return messages;
  }

  for (const item of request.input as AgentInputItem[]) {
    const message = mapItemToMessage(item);
    if (message) messages.push(message);
  }

  return messages;
}

function mapItemToMessage(item: AgentInputItem): ChatMessage | null {
  const record = item as Record<string, unknown>;

  // User message
  if (record.type === "message" && record.role === "user") {
    return { role: "user", content: extractTextFromContent(record.content) };
  }

  // Assistant message
  if (record.type === "message" && record.role === "assistant") {
    return { role: "assistant", content: extractTextFromContent(record.content) };
  }

  // System message
  if (record.type === "message" && record.role === "system") {
    return { role: "system", content: extractTextFromContent(record.content) };
  }

  // Function call result (tool output) — render as a user message
  // so the provider sees the tool result in context.
  if (record.type === "function_call_result") {
    const callId = typeof record.callId === "string" ? record.callId : "unknown";
    const output = record.output;
    const text = typeof output === "string" ? output : extractTextFromContent(output);
    return { role: "user", content: `[tool_result callId=${callId}]\n${text}` };
  }

  // Function call (assistant requested a tool) — render as assistant content
  // so the provider knows it previously requested a tool call.
  if (record.type === "function_call") {
    const name = typeof record.name === "string" ? record.name : "tool";
    const args = typeof record.arguments === "string" ? record.arguments : "";
    return { role: "assistant", content: `[tool_call name=${name}]\n${args}` };
  }

  return null;
}

function extractTextFromContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const part of content) {
    const r = part as Record<string, unknown>;
    if (typeof r.text === "string") parts.push(r.text);
    else if (typeof r.refusal === "string") parts.push(r.refusal);
  }
  return parts.join("");
}

/**
 * Parse model response content into SDK AgentOutputItem[].
 * Handles plain text (→ assistant message) and JSON tool calls embedded in content.
 */
function parseContentToOutput(content: string, modelId: string): AgentOutputItem[] {
  const output: AgentOutputItem[] = [];

  // Try to extract tool_call JSON from content like {"tool_calls": [...]}
  // Some OpenAI-compatible providers return tool_calls in the content body
  // rather than as a separate field. ModelGateway's callModel returns only
  // the text content, so we parse it here.
  const toolCalls = extractToolCallsFromContent(content);
  if (toolCalls.length > 0) {
    for (const tc of toolCalls) {
      output.push({
        type: "function_call",
        callId: tc.id,
        name: tc.name,
        arguments: tc.arguments,
        status: "completed",
      } as FunctionCallItem);
    }
    // If there's remaining text, also emit it as a message
    const remaining = content.replace(/```json\s*\{[\s\S]*?\}\s*```/g, "").trim();
    if (remaining) {
      output.push(buildAssistantMessage(remaining));
    }
    return output;
  }

  output.push(buildAssistantMessage(content));
  return output;
}

interface ExtractedToolCall {
  id: string;
  name: string;
  arguments: string;
}

function extractToolCallsFromContent(content: string): ExtractedToolCall[] {
  // Look for ```json blocks containing tool_calls
  const jsonBlockRegex = /```json\s*(\{[\s\S]*?\})\s*```/g;
  const calls: ExtractedToolCall[] = [];
  let match: RegExpExecArray | null;

  while ((match = jsonBlockRegex.exec(content)) !== null) {
    try {
      const parsed = JSON.parse(match[1]) as Record<string, unknown>;
      const toolCalls = parsed.tool_calls;
      if (Array.isArray(toolCalls)) {
        for (const tc of toolCalls) {
          const r = tc as Record<string, unknown>;
          const fn = r.function as Record<string, unknown> | undefined;
          if (fn && typeof fn.name === "string") {
            calls.push({
              id: typeof r.id === "string" ? r.id : `call_${calls.length}`,
              name: fn.name,
              arguments: typeof fn.arguments === "string" ? fn.arguments : JSON.stringify(fn.arguments ?? {}),
            });
          }
        }
      }
    } catch {
      // Not valid JSON, skip
    }
  }

  return calls;
}

function buildAssistantMessage(text: string): AssistantMessageItem {
  return {
    type: "message",
    role: "assistant",
    status: "completed",
    content: [{ type: "output_text", text }],
  } as AssistantMessageItem;
}
