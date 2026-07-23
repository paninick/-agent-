import {
  getGlobalTraceProvider,
  isOpenAIResponsesRawModelStreamEvent,
  run,
  withTrace
} from "@openai/agents";
import { createLaunchDeskAgent, DEFAULT_MODEL, type LaunchDeskAgentOptions } from "./launchAgent";
import { ModelGatewayModel } from "./modelGatewayAdapter";
import { launchDeskSelectionRequest, selectModelForLaunchDesk } from "./modelRouterIntegration";
import { loadSkillsForAgent } from "./skillInjector";
import { createModelGateway, type ModelGateway } from "../integration";
import { StaticModelRouter } from "../models";
import {
  createSkillRegistry,
  defaultConfigForTier,
  estimateTokensFromSize,
  scanSkillsSync,
} from "../skills";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { sep } from "node:path";
import { LaunchInputSchema, type LaunchInput } from "./types";

export type RiskLevel = "low" | "medium" | "high";

export type ApprovalRequiredEvent = {
  type: "approval_required";
  runId: string;
  approvalId: string;
  title: string;
  reason: string;
  riskLevel: RiskLevel;
  toolName?: string;
  requestedAction?: string;
  payloadPreview?: Record<string, unknown>;
  timestamp: string;
};

export type ApprovalResolvedEvent = {
  type: "approval_resolved";
  runId: string;
  approvalId: string;
  decision: "approved" | "rejected";
  timestamp: string;
};

export type LaunchStreamEvent =
  | { type: "run_started"; traceLabel: string; model: string; runId?: string }
  | { type: "tool_progress"; name: string; status: "called" | "completed"; itemType?: string }
  | { type: "text_delta"; delta: string }
  | ApprovalRequiredEvent
  | ApprovalResolvedEvent
  | { type: "run_completed" }
  | { type: "error"; message: string };

// Module-level gateway singleton (lazy init on first use).
let _gateway: ReturnType<typeof createModelGateway> | null = null;
function getGateway() {
  if (!_gateway) {
    _gateway = createModelGateway();
  }
  return _gateway;
}

/** Model override: if null, use DEFAULT_MODEL string (SDK default provider). If set, use ModelGateway. */
let _useModelGateway = true;
export function setUseModelGateway(enabled: boolean) {
  _useModelGateway = enabled;
}

// Test injection: override the module-level gateway singleton.
// Accepts the ModelGateway interface so tests can inject fakes without
// constructing a real ModelGatewayImpl with provider config.
export function setGateway(gw: ModelGateway) {
  _gateway = gw as ReturnType<typeof createModelGateway>;
}

// Test injection: override the module-level skill registry singleton.
export function setSkillRegistry(reg: ReturnType<typeof createSkillRegistry>) {
  _skillRegistry = reg;
}

// Test injection: reset all singletons to default (null) for clean test isolation.
export function resetInjection() {
  _gateway = null;
  _router = null;
  _skillRegistry = null;
  _useModelGateway = true;
}

// Module-level router singleton (lazy init).
let _router: StaticModelRouter | null = null;
function getRouter() {
  if (!_router) {
    _router = new StaticModelRouter();
  }
  return _router;
}

// Module-level skill registry singleton (lazy init — scans once on first request).
let _skillRegistry: ReturnType<typeof createSkillRegistry> | null = null;
const SKILLS_ROOT = process.env.SKILLS_ROOT || "skills/ECC/skills";

function getSkillRegistry() {
  if (!_skillRegistry) {
    _skillRegistry = createSkillRegistry();
    // Scan synchronously on first use — best-effort, does not block on errors.
    try {
      const descriptors = scanSkillsSync({
        rootDir: SKILLS_ROOT,
        readFile: (filePath: string) => readFileSync(filePath, "utf8"),
        listDir: (dirPath: string) => readdirSync(dirPath),
        isFile: (filePath: string) => {
          try {
            return statSync(filePath).isFile();
          } catch {
            return false;
          }
        },
        separator: sep,
      });
      for (const desc of descriptors) {
        _skillRegistry.register(desc, estimateTokensFromSize(desc.charCount, desc.lineCount));
      }
    } catch {
      // Skills root not found or not accessible — agent runs without injected skills.
    }
  }
  return _skillRegistry;
}

function buildPrompt(input: LaunchInput) {
  return `
Product brief:
${input.productBrief}

Audience:
${input.audience || "Unknown"}

Launch date:
${input.launchDate || "Unknown"}

Constraints:
${input.constraints || "None provided"}

Available assets:
${input.assets || "None provided"}
`.trim();
}

function extractToolName(item: unknown): string {
  if (!item || typeof item !== "object") return "tool";
  const record = item as Record<string, unknown>;
  return String(record.name ?? record.toolName ?? record.rawItemName ?? record.type ?? "tool");
}

function extractTextDelta(event: unknown): string {
  if (!event || typeof event !== "object") return "";
  const record = event as Record<string, unknown>;
  const data = record.data as Record<string, unknown> | undefined;
  const nested = data?.event as Record<string, unknown> | undefined;
  const candidate = nested ?? data;
  if (!candidate) return "";

  const type = String(candidate.type ?? "");
  if (type === "output_text_delta" || type === "response.output_text.delta") {
    return String(candidate.delta ?? "");
  }

  return "";
}

export async function* streamLaunchPlan(input: unknown): AsyncGenerator<LaunchStreamEvent> {
  const parsed = LaunchInputSchema.parse(input);

  // Build agent with ModelGateway-backed model adapter (if enabled).
  const agentOptions: LaunchDeskAgentOptions = {};
  let modelLabel = DEFAULT_MODEL;

  const skillInjection = await loadSkillsForAgent({
    registry: getSkillRegistry(),
    config: defaultConfigForTier("medium"),
    readFile: (filePath: string) => readFileSync(filePath, "utf8"),
    hints: {
      alwaysNeededSkillIds: ["planning-with-files", "agent-os-implementation-validation"],
      rarelyNeededKeywords: ["deprecated", "legacy", "experimental", "automation", "mcp", "credential"],
    },
  }).catch(() => ({ skillContent: "" }));

  if (skillInjection.skillContent) {
    agentOptions.skillContent = skillInjection.skillContent;
  }

  if (_useModelGateway) {
    const gateway = getGateway();
    const available = gateway.getAvailableModels();
    if (available.length > 0) {
      const selection = selectModelForLaunchDesk(
        getRouter(),
        gateway,
        launchDeskSelectionRequest(),
        DEFAULT_MODEL,
      );
      agentOptions.model = new ModelGatewayModel(gateway, selection.modelId, selection.fallbackModelIds);
      modelLabel = selection.modelId;
    }
    // If no provider keys configured, fall through to DEFAULT_MODEL string (SDK default provider).
  }

  const agent = createLaunchDeskAgent(agentOptions);
  const traceLabel = `launch-desk-${Date.now()}`;

  yield { type: "run_started", traceLabel, model: modelLabel };

  try {
    const stream = await withTrace("Launch Desk release plan", async () =>
      run(agent, buildPrompt(parsed), {
        stream: true,
        maxTurns: 8
      })
    );

    for await (const event of stream) {
      if (event.type === "run_item_stream_event") {
        if (event.name === "tool_called") {
          yield {
            type: "tool_progress",
            name: extractToolName(event.item),
            status: "called",
            itemType: event.name
          };
        }

        if (event.name === "tool_output") {
          yield {
            type: "tool_progress",
            name: extractToolName(event.item),
            status: "completed",
            itemType: event.name
          };
        }
      }

      if (event.type === "raw_model_stream_event") {
        const delta = isOpenAIResponsesRawModelStreamEvent(event)
          ? extractTextDelta(event)
          : extractTextDelta(event);

        if (delta) {
          yield { type: "text_delta", delta };
        }
      }
    }

    await stream.completed;
    await getGlobalTraceProvider().forceFlush();
    yield { type: "run_completed" };
  } catch (error) {
    yield {
      type: "error",
      message: error instanceof Error ? error.message : String(error)
    };
  }
}
