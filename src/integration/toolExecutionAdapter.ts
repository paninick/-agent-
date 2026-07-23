import { preToolUseHook, postToolUseHook } from "../governance/toolPermissionHook";
import type { PostToolUseInput, ToolInvocationRequest, ToolPermissionDecision } from "../governance/types";
import type { McpTransport } from "../mcp/transport";
import type { McpTransportRequest, McpTransportResponse } from "../mcp/transport";
import type { McpToolDescriptor } from "../mcp/types";
import type { RunStore } from "../runtime/types";
import { persistToolAudit, persistMcpPayload, summarizeTransportResponse } from "./auditBridge";

// ===== Execution result =====

export interface ToolExecutionResult {
  ok: boolean;
  status: "allowed" | "denied" | "requires_approval" | "executed" | "failed";
  decision?: ToolPermissionDecision;
  transportResponse?: McpTransportResponse;
  message: string;
}

// ===== Adapter config =====

export interface ToolExecutionAdapterConfig {
  runStore: RunStore;
  transport: McpTransport;
  agentId: string;
}

// ===== Effect mapping =====

import type { ToolEffect } from "../governance/types";
import type { McpDeclaredEffect } from "../mcp/types";

const EFFECT_MAP: Record<McpDeclaredEffect, ToolEffect> = {
  read: "read",
  write: "write",
  destructive: "delete",
  network: "external_send",
  compute: "execute"
};

// ===== Adapter =====

export class ToolExecutionAdapter {
  private readonly config: ToolExecutionAdapterConfig;

  constructor(config: ToolExecutionAdapterConfig) {
    this.config = config;
  }

  /**
   * Full execution chain:
   * 1. Build ToolInvocationRequest from descriptor
   * 2. preToolUseHook → governance decision
   * 3. If allow → McpTransport.callTool
   * 4. postToolUseHook → observation audit
   * 5. Persist all audits to RunStore
   */
  async execute(
    runId: string,
    nodeId: string,
    descriptor: McpToolDescriptor,
    serverId: string,
    arguments_: Record<string, unknown>,
    runStore: RunStore
  ): Promise<ToolExecutionResult> {
    const request = this.buildInvocationRequest(descriptor, serverId);
    const decision = preToolUseHook(request);

    persistToolAudit(runStore, runId, decision.auditEvent, nodeId);

    if (decision.status === "deny") {
      return {
        ok: false,
        status: "denied",
        decision,
        message: `Tool denied: ${decision.reasons.join("; ")}`
      };
    }

    if (decision.status === "requires_approval") {
      return {
        ok: false,
        status: "requires_approval",
        decision,
        message: `Tool requires approval: ${decision.reasons.join("; ")}`
      };
    }

    const transportRequest: McpTransportRequest = {
      serverId,
      toolId: descriptor.toolId,
      arguments: arguments_
    };

    const transportResponse = await this.config.transport.callTool(transportRequest);
    const summary = summarizeTransportResponse(transportResponse);

    if (transportResponse.auditPayload) {
      persistMcpPayload(runStore, runId, transportResponse.auditPayload, nodeId);
    }

    const postInput: PostToolUseInput = {
      request,
      decision,
      observedStatus: transportResponse.ok ? "succeeded" : "failed",
      message: summary.message
    };
    const postAudit = postToolUseHook(postInput);
    persistToolAudit(runStore, runId, postAudit, nodeId);

    return {
      ok: transportResponse.ok,
      status: transportResponse.ok ? "executed" : "failed",
      decision,
      transportResponse,
      message: summary.message
    };
  }

  /**
   * Builds a ToolInvocationRequest from an MCP tool descriptor.
   * Maps declaredEffect → ToolEffect, assumes credential not_required for P4.2 v1.
   */
  private buildInvocationRequest(
    descriptor: McpToolDescriptor,
    serverId: string
  ): ToolInvocationRequest {
    const effect = EFFECT_MAP[descriptor.declaredEffect] ?? "read";
    return {
      agentId: this.config.agentId,
      toolId: descriptor.toolId,
      action: `mcp:${serverId}:${descriptor.toolId}`,
      effect,
      credentialStatus: "not_required",
      dataSensitivity: "internal",
      networkAccess: effect === "external_send",
      externalWrite: effect === "external_send" || effect === "write",
      destructive: effect === "delete",
      estimatedCostTier: "low",
      toolEnabled: descriptor.enabled
    };
  }
}
