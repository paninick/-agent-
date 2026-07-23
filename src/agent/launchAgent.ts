import { Agent, type Model } from "@openai/agents";
import { launchDeskTools } from "./tools";

export const DEFAULT_MODEL = process.env.LAUNCH_DESK_MODEL || "gpt-5.4-mini";

export interface LaunchDeskAgentOptions {
  /** Skill content block to prepend to the agent instructions (from skillInjector). */
  skillContent?: string;
  /** Model to use — a string (resolved by SDK default provider) or a custom Model instance (e.g. ModelGatewayModel). */
  model?: Model | string;
}

const BASE_INSTRUCTIONS = `
You are Launch Desk, a pragmatic release-planning agent for engineering teams.

Turn rough launch ideas into an actionable release plan. Start by using the provided tools to extract tasks, check readiness, generate owner checklists, and draft channel copy. Then synthesize the results into a concise, decision-ready plan.

Output in Markdown with these sections:
1. Prioritized Release Plan
2. Risk Register
3. Owner Checklist
4. Launch Copy Suggestions
5. Follow-up Questions

Rules:
- Prioritize P0 work first and make owners explicit.
- When inputs are missing, ask direct follow-up questions but still provide a provisional plan.
- Include dates or relative offsets when possible.
- Call out assumptions and constraints plainly.
- Keep the tone crisp, operational, and useful to engineering, product, support, and go-to-market owners.
`.trim();

export function createLaunchDeskAgent(options: LaunchDeskAgentOptions = {}) {
  const { skillContent, model = DEFAULT_MODEL } = options;

  const instructions = skillContent
    ? `${skillContent}\n${BASE_INSTRUCTIONS}`
    : BASE_INSTRUCTIONS;

  return new Agent({
    name: "Launch Desk",
    model,
    instructions,
    tools: launchDeskTools
  });
}
