import { evaluateCredentialPolicy } from "./credentialPolicy";
import { evaluateToolRiskPolicy, requiresHumanApproval } from "./toolRiskPolicy";
import type { PostToolUseInput, ToolAuditEvent, ToolInvocationRequest, ToolPermissionDecision } from "./types";

export function preToolUseHook(request: ToolInvocationRequest): ToolPermissionDecision {
  const credential = evaluateCredentialPolicy(request);
  const risk = evaluateToolRiskPolicy(request);
  const reasons = [...risk.reasons];
  const warnings: string[] = [];

  if (request.toolEnabled === false) {
    reasons.unshift("Tool is disabled.");
    return decision("deny", request, risk, reasons, warnings);
  }

  if (!credential.ok) {
    reasons.unshift(credential.reason);
    warnings.push("Credential gate denied this tool request.");
    return decision("deny", request, risk, reasons, warnings, credential.status);
  }

  if (requiresHumanApproval(request, risk)) {
    reasons.unshift("Tool request requires human approval before execution.");
    warnings.push("P3 v1 only returns an approval decision; it does not execute the tool.");
    return decision("requires_approval", request, risk, reasons, warnings, credential.status);
  }

  reasons.unshift(credential.reason);
  return decision("allow", request, risk, reasons, warnings, credential.status);
}

export function postToolUseHook(input: PostToolUseInput): ToolAuditEvent {
  return {
    eventType: "tool_execution_observed",
    agentId: input.request.agentId,
    toolId: input.request.toolId,
    action: input.request.action,
    decisionStatus: input.decision.status,
    riskLevel: input.decision.riskLevel,
    credentialStatus: input.decision.credentialStatus,
    message: input.message ?? `Tool execution observation recorded as ${input.observedStatus}.`,
    createdAt: new Date().toISOString(),
    metadata: {
      observedStatus: input.observedStatus,
      p3StaticOnly: true,
      executedByHook: false
    }
  };
}

function decision(
  status: ToolPermissionDecision["status"],
  request: ToolInvocationRequest,
  risk: ReturnType<typeof evaluateToolRiskPolicy>,
  reasons: string[],
  warnings: string[],
  credentialStatus = request.credentialStatus
): ToolPermissionDecision {
  const auditEvent = buildAuditEvent(request, status, risk, credentialStatus, reasons);
  return {
    status,
    allowed: status === "allow",
    credentialStatus,
    riskLevel: risk.level,
    riskScore: risk.score,
    riskVector: risk.vector,
    reasons,
    warnings,
    auditEventRequired: true,
    auditEvent
  };
}

function buildAuditEvent(
  request: ToolInvocationRequest,
  status: ToolPermissionDecision["status"],
  risk: ReturnType<typeof evaluateToolRiskPolicy>,
  credentialStatus: ToolPermissionDecision["credentialStatus"],
  reasons: string[]
): ToolAuditEvent {
  return {
    eventType: "tool_permission_decision",
    agentId: request.agentId,
    toolId: request.toolId,
    action: request.action,
    decisionStatus: status,
    riskLevel: risk.level,
    credentialStatus,
    message: reasons[0] ?? `Tool permission decision: ${status}.`,
    createdAt: new Date().toISOString(),
    metadata: {
      riskScore: risk.score,
      p3StaticOnly: true,
      executedByHook: false
    }
  };
}
