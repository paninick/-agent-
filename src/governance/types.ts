export type CredentialStatus =
  | "not_required"
  | "missing_credentials"
  | "invalid_credentials"
  | "permission_denied"
  | "rate_limited"
  | "available";

export type ToolPermissionStatus = "allow" | "deny" | "requires_approval";
export type ToolRiskLevel = "low" | "medium" | "high" | "critical";
export type DataSensitivity = "public" | "internal" | "sensitive" | "restricted";
export type ToolEffect = "read" | "write" | "delete" | "external_send" | "execute";
export type CostTier = "low" | "medium" | "high";

export interface ToolInvocationRequest {
  agentId: string;
  toolId: string;
  action: string;
  effect: ToolEffect;
  credentialStatus: CredentialStatus;
  requestedScopes?: string[];
  grantedScopes?: string[];
  dataSensitivity: DataSensitivity;
  networkAccess: boolean;
  externalWrite: boolean;
  destructive: boolean;
  estimatedCostTier?: CostTier;
  toolEnabled?: boolean;
  requiresApproval?: boolean;
}

export interface CredentialDecision {
  ok: boolean;
  status: CredentialStatus;
  reason: string;
  missingScopes: string[];
}

export interface AgentRiskVector {
  dataSensitivity: number;
  toolEffect: number;
  credentialExposure: number;
  networkExposure: number;
  externalWrite: number;
  destructiveAction: number;
  costExposure: number;
}

export interface AgentRiskScore {
  vector: AgentRiskVector;
  score: number;
  level: ToolRiskLevel;
  reasons: string[];
}

export interface ToolAuditEvent {
  eventType: "tool_permission_decision" | "tool_execution_observed";
  agentId: string;
  toolId: string;
  action: string;
  decisionStatus?: ToolPermissionStatus;
  riskLevel?: ToolRiskLevel;
  credentialStatus?: CredentialStatus;
  message: string;
  createdAt: string;
  /**
   * P3 metadata contract:
   * - p3StaticOnly=true means the event was produced by the P3 static governance layer.
   * - executedByHook=false means P3 did not execute a real tool.
   * ToolAuditEvent is a payload only; it is not automatically persisted.
   */
  metadata: Record<string, unknown>;
}

export interface ToolPermissionDecision {
  status: ToolPermissionStatus;
  allowed: boolean;
  credentialStatus: CredentialStatus;
  riskLevel: ToolRiskLevel;
  riskScore: number;
  riskVector: AgentRiskVector;
  reasons: string[];
  warnings: string[];
  auditEventRequired: boolean;
  auditEvent: ToolAuditEvent;
}

export interface PostToolUseInput {
  request: ToolInvocationRequest;
  decision: ToolPermissionDecision;
  observedStatus: "not_executed" | "succeeded" | "failed";
  message?: string;
}
