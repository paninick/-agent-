import { createMcpError } from "./errorClassification";
import type { McpGatewayRegistry } from "./registry";
import type {
  McpTransport,
  McpTransportRequest,
  McpTransportResponse
} from "./transport";
import type { AuditEventPayload, McpErrorKind, McpHealthStatus, McpToolDescriptor } from "./types";

export interface FakeErrorOverride {
  serverId?: string;
  toolId?: string;
  callIndex?: number;
  errorKind: McpErrorKind;
  message?: string;
}

export interface FakeTransportConfig {
  errorOverrides: FakeErrorOverride[];
}

const fixedTimestamp = "1970-01-01T00:00:00.000Z";

function specificity(override: FakeErrorOverride): number {
  return (override.serverId !== undefined ? 1 : 0)
    + (override.toolId !== undefined ? 1 : 0)
    + (override.callIndex !== undefined ? 1 : 0);
}

export class FakeMcpTransport implements McpTransport {
  private readonly registry: McpGatewayRegistry;
  private readonly config: FakeTransportConfig;
  private callCounter = 0;

  constructor(registry: McpGatewayRegistry, config: FakeTransportConfig) {
    this.registry = registry;
    this.config = config;
  }

  async healthProbe(serverId: string): Promise<McpHealthStatus> {
    const server = this.registry.getServer(serverId);
    if (!server) return "not_implemented";
    return server.healthStatus;
  }

  async listTools(serverId: string): Promise<McpToolDescriptor[]> {
    return this.registry.listTools(serverId);
  }

  async callTool(request: McpTransportRequest): Promise<McpTransportResponse> {
    const currentIndex = this.callCounter++;
    const server = this.registry.getServer(request.serverId);
    if (!server) return this.failure("tool_not_found", `Server ${request.serverId} was not found.`, request);
    if (!server.enabled) return this.failure("transport_unavailable", `Server ${request.serverId} is disabled.`, request);

    const tool = this.registry.listTools(request.serverId).find((descriptor) => descriptor.toolId === request.toolId);
    if (!tool) return this.failure("tool_not_found", `Tool ${request.toolId} was not found on server ${request.serverId}.`, request);

    const override = this.matchOverride(request, currentIndex);
    if (override) {
      return this.failure(override.errorKind, override.message ?? `Synthetic MCP error: ${override.errorKind}.`, request);
    }

    return {
      ok: true,
      result: {
        serverId: request.serverId,
        toolId: request.toolId,
        name: tool.name,
        arguments: request.arguments,
        synthetic: true
      },
      auditPayload: this.audit("mcp_fake_transport_succeeded", request, { synthetic: true })
    };
  }

  private matchOverride(request: McpTransportRequest, callIndex: number): FakeErrorOverride | undefined {
    return this.config.errorOverrides
      .slice()
      .sort((a, b) => specificity(b) - specificity(a))
      .find((override) => {
        if (override.callIndex !== undefined && override.callIndex !== callIndex) return false;
        if (override.serverId !== undefined && override.serverId !== request.serverId) return false;
        if (override.toolId !== undefined && override.toolId !== request.toolId) return false;
        return true;
      });
  }

  private failure(kind: McpErrorKind, message: string, request: McpTransportRequest): McpTransportResponse {
    const error = createMcpError(kind, message);
    return {
      ok: false,
      error: { kind: error.kind, message: error.message, retryable: error.retryable },
      auditPayload: this.audit("mcp_fake_transport_failed", request, { kind })
    };
  }

  private audit(eventType: string, request: McpTransportRequest, metadata: Record<string, unknown>): AuditEventPayload {
    return {
      eventType,
      timestamp: fixedTimestamp,
      metadata: {
        ...metadata,
        serverId: request.serverId,
        toolId: request.toolId,
        p4StaticOnly: true,
        executedByMock: false
      }
    };
  }
}
