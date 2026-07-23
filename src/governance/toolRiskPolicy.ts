import { buildAgentRiskVector } from "./agentRiskVector";
import type { AgentRiskScore, ToolInvocationRequest } from "./types";

export function evaluateToolRiskPolicy(request: ToolInvocationRequest): AgentRiskScore {
  return buildAgentRiskVector(request);
}

export function requiresHumanApproval(request: ToolInvocationRequest, risk: AgentRiskScore) {
  return Boolean(request.requiresApproval || risk.level === "high" || risk.level === "critical");
}
