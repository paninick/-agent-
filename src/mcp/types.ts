export type McpTransportType = "stdio" | "sse" | "streamable_http";
export type McpAuthRequirement = "none" | "api_key" | "bearer_token" | "oauth";
export type McpDeclaredEffect = "read" | "write" | "destructive" | "network" | "compute";
export type McpHealthStatus = "registered" | "healthy" | "degraded" | "unreachable" | "not_implemented";

export type McpErrorKind =
  | "transport_unavailable"
  | "auth_required"
  | "tool_not_found"
  | "timeout"
  | "server_error"
  | "schema_invalid"
  | "rate_limited"
  | "unknown";

export interface McpError {
  kind: McpErrorKind;
  message: string;
  retryable: boolean;
}

export interface AuditEventPayload {
  eventType: string;
  timestamp: string;
  metadata: Record<string, unknown>;
}

export interface McpToolDescriptor {
  toolId: string;
  serverId: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  declaredEffect: McpDeclaredEffect;
  enabled: boolean;
}

export interface McpServerProfile {
  serverId: string;
  name: string;
  transport: McpTransportType;
  authRequirement: McpAuthRequirement;
  toolDescriptors: McpToolDescriptor[];
  enabled: boolean;
  healthStatus: McpHealthStatus;
  description?: string;
}

export interface ToolCallRequest {
  toolId: string;
  serverId: string;
  arguments: Record<string, unknown>;
}

export interface ToolCallSuccess {
  ok: true;
  result: unknown;
  auditPayload?: AuditEventPayload;
}

export interface ToolCallFailure {
  ok: false;
  error: McpError;
  auditPayload?: AuditEventPayload;
}

export type ToolCallResult = ToolCallSuccess | ToolCallFailure;

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export type RegistryResult =
  | { ok: true; profile: McpServerProfile; warnings: string[] }
  | { ok: false; errors: string[]; warnings: string[] };
