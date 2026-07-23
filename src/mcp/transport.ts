import type { AuditEventPayload, McpErrorKind, McpHealthStatus, McpToolDescriptor } from "./types";

export interface McpTransport {
  healthProbe(serverId: string): Promise<McpHealthStatus>;
  listTools(serverId: string): Promise<McpToolDescriptor[]>;
  callTool(request: McpTransportRequest): Promise<McpTransportResponse>;
}

export interface McpTransportRequest {
  serverId: string;
  toolId: string;
  arguments: Record<string, unknown>;
}

export interface McpTransportSuccess {
  ok: true;
  result: unknown;
  auditPayload?: AuditEventPayload;
}

export interface McpTransportFailure {
  ok: false;
  error: McpTransportError;
  auditPayload?: AuditEventPayload;
}

export type McpTransportResponse = McpTransportSuccess | McpTransportFailure;

export interface McpTransportError {
  kind: McpErrorKind;
  message: string;
  retryable: boolean;
  cause?: unknown;
}
