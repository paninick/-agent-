import type { RunStore } from "../runtime/types";
import type { ToolAuditEvent, ToolInvocationRequest, ToolPermissionDecision } from "../governance/types";
import type { McpTransportResponse, McpTransportSuccess, McpTransportFailure } from "../mcp/transport";
import type { AuditEventPayload } from "../mcp/types";

/**
 * Maps governance ToolAuditEvent to runtime AuditEvent input (Omit<eventId, runId, createdAt>).
 * P4.2 is the first phase that bridges P3 payload-only events into P1 RunStore persistence.
 */
export function mapToolAuditToRunEvent(
  auditEvent: ToolAuditEvent
): {
  type: "node_completed" | "node_started" | "run_failed";
  message: string;
  nodeId?: string;
  metadata?: Record<string, unknown>;
} {
  const base = {
    message: auditEvent.message,
    metadata: {
      ...auditEvent.metadata,
      toolId: auditEvent.toolId,
      agentId: auditEvent.agentId,
      action: auditEvent.action,
      decisionStatus: auditEvent.decisionStatus,
      riskLevel: auditEvent.riskLevel,
      credentialStatus: auditEvent.credentialStatus,
      p4IntegrationLayer: true
    }
  };

  if (auditEvent.decisionStatus === "deny") {
    return { type: "run_failed", ...base };
  }
  if (auditEvent.eventType === "tool_execution_observed") {
    return { type: "node_completed", ...base };
  }
  return { type: "node_started", ...base };
}

/**
 * Maps MCP transport AuditEventPayload to runtime AuditEvent input.
 */
export function mapMcpPayloadToRunEvent(
  payload: AuditEventPayload,
  nodeId?: string
): {
  type: "node_completed" | "node_started" | "run_failed";
  message: string;
  nodeId?: string;
  metadata?: Record<string, unknown>;
} {
  const isFailure = payload.eventType.includes("failed");
  return {
    type: isFailure ? "run_failed" : "node_completed",
    message: `MCP transport event: ${payload.eventType}`,
    nodeId,
    metadata: {
      ...payload.metadata,
      mcpTimestamp: payload.timestamp,
      p4IntegrationLayer: true
    }
  };
}

/**
 * Persists a governance ToolAuditEvent into RunStore.
 */
export function persistToolAudit(
  runStore: RunStore,
  runId: string,
  auditEvent: ToolAuditEvent,
  nodeId?: string
): void {
  const mapped = mapToolAuditToRunEvent(auditEvent);
  runStore.appendAuditEvent(runId, { ...mapped, nodeId });
}

/**
 * Persists an MCP AuditEventPayload into RunStore.
 */
export function persistMcpPayload(
  runStore: RunStore,
  runId: string,
  payload: AuditEventPayload,
  nodeId?: string
): void {
  const mapped = mapMcpPayloadToRunEvent(payload, nodeId);
  runStore.appendAuditEvent(runId, { ...mapped, nodeId });
}

/**
 * Extracts a human-readable summary from a McpTransportResponse.
 */
export function summarizeTransportResponse(response: McpTransportResponse): {
  succeeded: boolean;
  message: string;
} {
  if (response.ok) {
    return { succeeded: true, message: "Tool call succeeded." };
  }
  return {
    succeeded: false,
    message: response.error.message
  };
}
