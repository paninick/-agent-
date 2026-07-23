import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createMcpError,
  createSeedMcpGatewayRegistry,
  FakeMcpTransport,
  isRetryable,
  McpGatewayRegistry,
  seedMcpServerProfiles,
  type McpDeclaredEffect,
  type McpErrorKind,
  type McpServerProfile,
  type McpToolDescriptor,
  type ToolCallRequest
} from "../mcp";

const retryableCases: Record<McpErrorKind, boolean> = {
  transport_unavailable: true,
  auth_required: false,
  tool_not_found: false,
  timeout: true,
  server_error: true,
  schema_invalid: false,
  rate_limited: true,
  unknown: false
};

describe("MCP Gateway Static Registry v1", () => {
  it("registers and queries enabled servers", () => {
    const registry = new McpGatewayRegistry();
    const registered = registry.register(serverProfile("alpha"));

    expect(registered.ok).toBe(true);
    expect(registry.getServer("alpha")?.serverId).toBe("alpha");
    expect(registry.listServers().map((server) => server.serverId)).toEqual(["alpha"]);
  });

  it("fails duplicate serverId safely", () => {
    const registry = new McpGatewayRegistry();
    registry.register(serverProfile("alpha"));
    const duplicate = registry.register(serverProfile("alpha"));

    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) expect(duplicate.errors.join(" ")).toContain("Duplicate serverId");
  });

  it("returns undefined for unknown server id", () => {
    expect(new McpGatewayRegistry().getServer("missing")).toBeUndefined();
  });

  it("listServers only returns enabled servers", () => {
    const registry = new McpGatewayRegistry();
    registry.register(serverProfile("enabled", true));
    registry.register(serverProfile("disabled", false));

    expect(registry.listServers().map((server) => server.serverId)).toEqual(["enabled"]);
  });

  it("returns no tools for disabled or unknown servers", () => {
    const registry = new McpGatewayRegistry();
    registry.register(serverProfile("disabled", false));

    expect(registry.listTools("disabled")).toEqual([]);
    expect(registry.listTools("unknown")).toEqual([]);
  });

  it("rejects forbidden fields on server profiles", () => {
    for (const field of ["credentialStatus", "riskLevel", "requiresApproval", "apiKey", "token", "secret"]) {
      const profile = { ...serverProfile(`server-${field}`), [field]: "forbidden" } as McpServerProfile;
      const validation = new McpGatewayRegistry().validateServerProfile(profile);
      expect(validation.valid).toBe(false);
      expect(validation.errors.join(" ")).toContain(field);
    }
  });

  it("rejects forbidden fields on tool descriptors", () => {
    for (const field of ["credentialStatus", "riskLevel", "requiresApproval", "apiKey", "token", "secret"]) {
      const descriptor = { ...toolDescriptor("alpha", `tool-${field}`), [field]: "forbidden" } as McpToolDescriptor;
      const validation = new McpGatewayRegistry().validateToolDescriptor(descriptor, "alpha");
      expect(validation.valid).toBe(false);
      expect(validation.errors.join(" ")).toContain(field);
    }
  });

  it("register fails safely when validation rejects forbidden fields", () => {
    const result = new McpGatewayRegistry().register({ ...serverProfile("bad"), token: "forbidden" } as McpServerProfile);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(" ")).toContain("token");
  });

  it("rejects descriptors whose serverId does not match the profile", () => {
    const profile = { ...serverProfile("alpha"), toolDescriptors: [toolDescriptor("other", "bad")] };
    const validation = new McpGatewayRegistry().validateServerProfile(profile);

    expect(validation.valid).toBe(false);
    expect(validation.errors.join(" ")).toContain("serverId must match");
  });

  it("ToolCallRequest does not carry governance fields", () => {
    const request: ToolCallRequest = { serverId: "alpha", toolId: "alpha.echo", arguments: {} };

    expect(Object.hasOwn(request, "credentialStatus")).toBe(false);
    expect(Object.hasOwn(request, "riskLevel")).toBe(false);
    expect(Object.hasOwn(request, "requiresApproval")).toBe(false);
  });

  it("McpTransportResponse success and failure branches are safe unions", async () => {
    const registry = createSeedMcpGatewayRegistry(seedMcpServerProfiles);
    const transport = new FakeMcpTransport(registry, { errorOverrides: [] });
    const success = await transport.callTool({ serverId: "table-analysis-mcp", toolId: "table.profile", arguments: {} });
    const failure = await transport.callTool({ serverId: "table-analysis-mcp", toolId: "missing", arguments: {} });

    expect(success.ok).toBe(true);
    expect(Object.hasOwn(success, "error")).toBe(false);
    expect(failure.ok).toBe(false);
    expect(Object.hasOwn(failure, "result")).toBe(false);
  });

  it("maps retryable status from the single error classification source", () => {
    for (const [kind, retryable] of Object.entries(retryableCases) as Array<[McpErrorKind, boolean]>) {
      expect(isRetryable(kind)).toBe(retryable);
      expect(createMcpError(kind, kind).retryable).toBe(retryable);
    }
  });

  it("FakeMcpTransport returns deterministic synthetic success", async () => {
    const registry = createSeedMcpGatewayRegistry(seedMcpServerProfiles);
    const transport = new FakeMcpTransport(registry, { errorOverrides: [] });
    const request = { serverId: "table-analysis-mcp", toolId: "table.profile", arguments: { b: 2, a: 1 } };

    expect(await transport.callTool(request)).toEqual(await transport.callTool(request));
  });

  it("FakeMcpTransport returns tool_not_found for unknown tools", async () => {
    const transport = new FakeMcpTransport(createSeedMcpGatewayRegistry(seedMcpServerProfiles), { errorOverrides: [] });
    const result = await transport.callTool({
      serverId: "table-analysis-mcp",
      toolId: "missing",
      arguments: {}
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("tool_not_found");
  });

  it("FakeMcpTransport can return requested synthetic error kinds via errorOverrides", async () => {
    const registry = createSeedMcpGatewayRegistry(seedMcpServerProfiles);
    for (const kind of ["auth_required", "timeout", "server_error"] as const) {
      const transport = new FakeMcpTransport(registry, {
        errorOverrides: [{ serverId: "table-analysis-mcp", toolId: "table.profile", errorKind: kind }]
      });
      const result = await transport.callTool({
        serverId: "table-analysis-mcp",
        toolId: "table.profile",
        arguments: {}
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe(kind);
    }
  });

  it("disabled server returns stable transport_unavailable", async () => {
    const transport = new FakeMcpTransport(createSeedMcpGatewayRegistry(seedMcpServerProfiles), { errorOverrides: [] });
    const result = await transport.callTool({
      serverId: "finance-data-mcp",
      toolId: "finance.quote_snapshot",
      arguments: {}
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("transport_unavailable");
  });

  it("all declared effect values can be registered", () => {
    const effects: McpDeclaredEffect[] = ["read", "write", "destructive", "network", "compute"];
    const registry = new McpGatewayRegistry();
    const profile = {
      ...serverProfile("effects"),
      toolDescriptors: effects.map((effect) => ({ ...toolDescriptor("effects", `tool-${effect}`), declaredEffect: effect }))
    };

    expect(registry.register(profile).ok).toBe(true);
    expect(registry.listTools("effects").map((tool) => tool.declaredEffect)).toEqual(effects);
  });

  it("audit payload is returned but not persisted", async () => {
    const transport = new FakeMcpTransport(createSeedMcpGatewayRegistry(seedMcpServerProfiles), { errorOverrides: [] });
    const result = await transport.callTool({
      serverId: "table-analysis-mcp",
      toolId: "table.profile",
      arguments: {}
    });

    expect(result.auditPayload?.metadata.p4StaticOnly).toBe(true);
    expect(result.auditPayload?.metadata.executedByMock).toBe(false);
    expect(result.auditPayload).not.toHaveProperty("runId");
  });

  it("delete removes a registered server and returns true", () => {
    const registry = new McpGatewayRegistry();
    registry.register(serverProfile("alpha"));
    registry.register(serverProfile("beta"));

    expect(registry.delete("alpha")).toBe(true);
    expect(registry.getServer("alpha")).toBeUndefined();
    expect(registry.listServers().map((s) => s.serverId)).toEqual(["beta"]);
  });

  it("delete returns false for unknown serverId", () => {
    const registry = new McpGatewayRegistry();
    expect(registry.delete("missing")).toBe(false);
  });

  it("clear removes all servers", () => {
    const registry = new McpGatewayRegistry();
    registry.register(serverProfile("alpha"));
    registry.register(serverProfile("beta"));
    registry.register(serverProfile("gamma"));

    registry.clear();
    expect(registry.listServers().length).toBe(0);
    expect(registry.getServer("alpha")).toBeUndefined();
    expect(registry.getServer("beta")).toBeUndefined();
  });

  it("delete allows re-registration with same serverId", () => {
    const registry = new McpGatewayRegistry();
    registry.register(serverProfile("alpha", true));
    registry.delete("alpha");

    const result = registry.register(serverProfile("alpha", false));
    expect(result.ok).toBe(true);
    expect(registry.getServer("alpha")?.enabled).toBe(false);
  });

  it("src/mcp does not import governance, runtime, or intelligence", () => {
    const source = readMcpSource();
    for (const forbidden of ["../governance", "../runtime", "../intelligence", "src/governance", "src/runtime", "src/intelligence"]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("McpHealthStatus is independent from P0 SourceResultStatus", () => {
    const source = readMcpSource();
    expect(source).not.toContain("SourceResultStatus");
    expect(seedMcpServerProfiles.map((profile) => profile.healthStatus)).toContain("not_implemented");
  });

  it("src/mcp does not call P3 hooks or RunStore", () => {
    const source = readMcpSource();
    for (const forbidden of ["preToolUseHook", "postToolUseHook", "RunStore", "appendAuditEvent"]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("seed registry includes Hyperbrowser MCP server with 3 tools", () => {
    const hyperbrowser = seedMcpServerProfiles.find((profile) => profile.serverId === "hyperbrowser-mcp");
    expect(hyperbrowser).toBeDefined();
    expect(hyperbrowser?.enabled).toBe(true);
    expect(hyperbrowser?.authRequirement).toBe("api_key");
    expect(hyperbrowser?.transport).toBe("stdio");
    const toolIds = hyperbrowser?.toolDescriptors.map((tool) => tool.toolId);
    expect(toolIds).toEqual(["scrape_webpage", "extract_structured_data", "crawl_webpages"]);
  });

  it("Hyperbrowser descriptors declare network effect and carry no credentials", () => {
    const registry = createSeedMcpGatewayRegistry(seedMcpServerProfiles);
    const tools = registry.listTools("hyperbrowser-mcp");
    expect(tools.length).toBe(3);
    for (const tool of tools) {
      expect(tool.declaredEffect).toBe("network");
      expect(Object.hasOwn(tool, "apiKey")).toBe(false);
      expect(Object.hasOwn(tool, "token")).toBe(false);
      expect(Object.hasOwn(tool, "secret")).toBe(false);
    }
  });

  it("Hyperbrowser scrape_webpage requires url and accepts outputFormat", () => {
    const registry = createSeedMcpGatewayRegistry(seedMcpServerProfiles);
    const tool = registry.listTools("hyperbrowser-mcp").find((descriptor) => descriptor.toolId === "scrape_webpage");
    expect(tool).toBeDefined();
    expect(tool?.inputSchema.required).toEqual(["url"]);
    expect((tool?.inputSchema.properties as Record<string, unknown>).url).toBeDefined();
    expect((tool?.inputSchema.properties as Record<string, unknown>).outputFormat).toBeDefined();
    expect((tool?.inputSchema.properties as Record<string, unknown>).sessionOptions).toBeDefined();
  });

  it("Hyperbrowser extract_structured_data requires urls and prompt", () => {
    const registry = createSeedMcpGatewayRegistry(seedMcpServerProfiles);
    const tool = registry.listTools("hyperbrowser-mcp").find((descriptor) => descriptor.toolId === "extract_structured_data");
    expect(tool).toBeDefined();
    expect(tool?.inputSchema.required).toEqual(["urls", "prompt"]);
  });

  it("Hyperbrowser crawl_webpages requires url and supports maxPages", () => {
    const registry = createSeedMcpGatewayRegistry(seedMcpServerProfiles);
    const tool = registry.listTools("hyperbrowser-mcp").find((descriptor) => descriptor.toolId === "crawl_webpages");
    expect(tool).toBeDefined();
    expect(tool?.inputSchema.required).toEqual(["url"]);
    expect((tool?.inputSchema.properties as Record<string, unknown>).maxPages).toBeDefined();
    expect((tool?.inputSchema.properties as Record<string, unknown>).followLinks).toBeDefined();
  });

  it("FakeMcpTransport returns synthetic success for Hyperbrowser scrape_webpage", async () => {
    const registry = createSeedMcpGatewayRegistry(seedMcpServerProfiles);
    const transport = new FakeMcpTransport(registry, { errorOverrides: [] });
    const result = await transport.callTool({
      serverId: "hyperbrowser-mcp",
      toolId: "scrape_webpage",
      arguments: { url: "https://example.com", outputFormat: ["markdown"] }
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result).toBeDefined();
      expect(result.auditPayload?.metadata.serverId).toBe("hyperbrowser-mcp");
      expect(result.auditPayload?.metadata.toolId).toBe("scrape_webpage");
    }
  });

  it("FakeMcpTransport returns tool_not_found for unknown Hyperbrowser tool", async () => {
    const registry = createSeedMcpGatewayRegistry(seedMcpServerProfiles);
    const transport = new FakeMcpTransport(registry, { errorOverrides: [] });
    const result = await transport.callTool({
      serverId: "hyperbrowser-mcp",
      toolId: "hyperbrowser.unknown",
      arguments: {}
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("tool_not_found");
  });

  it("Hyperbrowser server profile carries no forbidden credential fields", () => {
    const hyperbrowser = seedMcpServerProfiles.find((profile) => profile.serverId === "hyperbrowser-mcp");
    expect(hyperbrowser).toBeDefined();
    for (const field of ["credentialStatus", "riskLevel", "requiresApproval", "apiKey", "token", "secret"]) {
      expect(Object.hasOwn(hyperbrowser!, field)).toBe(false);
    }
  });

  // === Neon MCP server descriptor tests ===

  it("seed registry includes Neon MCP server with 8 tools", () => {
    const neon = seedMcpServerProfiles.find((profile) => profile.serverId === "neon-mcp");
    expect(neon).toBeDefined();
    expect(neon?.enabled).toBe(true);
    expect(neon?.authRequirement).toBe("api_key");
    expect(neon?.transport).toBe("stdio");
    const toolIds = neon?.toolDescriptors.map((tool) => tool.toolId);
    expect(toolIds).toEqual([
      "neon.list_projects",
      "neon.create_project",
      "neon.list_branches",
      "neon.create_branch",
      "neon.describe_tables",
      "neon.run_sql",
      "neon.run_sql_transaction",
      "neon.get_database_tables",
    ]);
  });

  it("Neon descriptors carry no credentials", () => {
    const registry = createSeedMcpGatewayRegistry(seedMcpServerProfiles);
    const tools = registry.listTools("neon-mcp");
    expect(tools.length).toBe(8);
    for (const tool of tools) {
      expect(Object.hasOwn(tool, "apiKey")).toBe(false);
      expect(Object.hasOwn(tool, "token")).toBe(false);
      expect(Object.hasOwn(tool, "secret")).toBe(false);
    }
  });

  it("Neon server profile carries no forbidden credential fields", () => {
    const neon = seedMcpServerProfiles.find((profile) => profile.serverId === "neon-mcp");
    expect(neon).toBeDefined();
    for (const field of ["credentialStatus", "riskLevel", "requiresApproval", "apiKey", "token", "secret"]) {
      expect(Object.hasOwn(neon!, field)).toBe(false);
    }
  });

  it("Neon run_sql requires projectId, branchId, and sql", () => {
    const registry = createSeedMcpGatewayRegistry(seedMcpServerProfiles);
    const tool = registry.listTools("neon-mcp").find((descriptor) => descriptor.toolId === "neon.run_sql");
    expect(tool).toBeDefined();
    expect(tool?.inputSchema.required).toEqual(["projectId", "branchId", "sql"]);
    expect(tool?.declaredEffect).toBe("write");
  });

  it("Neon run_sql_transaction requires projectId, branchId, and sqlStatements", () => {
    const registry = createSeedMcpGatewayRegistry(seedMcpServerProfiles);
    const tool = registry.listTools("neon-mcp").find((descriptor) => descriptor.toolId === "neon.run_sql_transaction");
    expect(tool).toBeDefined();
    expect(tool?.inputSchema.required).toEqual(["projectId", "branchId", "sqlStatements"]);
    expect(tool?.declaredEffect).toBe("write");
  });

  it("Neon create_project requires name", () => {
    const registry = createSeedMcpGatewayRegistry(seedMcpServerProfiles);
    const tool = registry.listTools("neon-mcp").find((descriptor) => descriptor.toolId === "neon.create_project");
    expect(tool).toBeDefined();
    expect(tool?.inputSchema.required).toEqual(["name"]);
    expect(tool?.declaredEffect).toBe("write");
  });

  it("Neon read tools declare read effect", () => {
    const registry = createSeedMcpGatewayRegistry(seedMcpServerProfiles);
    const readToolIds = ["neon.list_projects", "neon.list_branches", "neon.describe_tables", "neon.get_database_tables"];
    for (const toolId of readToolIds) {
      const tool = registry.listTools("neon-mcp").find((descriptor) => descriptor.toolId === toolId);
      expect(tool).toBeDefined();
      expect(tool?.declaredEffect).toBe("read");
    }
  });

  it("FakeMcpTransport returns synthetic success for Neon run_sql", async () => {
    const registry = createSeedMcpGatewayRegistry(seedMcpServerProfiles);
    const transport = new FakeMcpTransport(registry, { errorOverrides: [] });
    const result = await transport.callTool({
      serverId: "neon-mcp",
      toolId: "neon.run_sql",
      arguments: { projectId: "test", branchId: "br-test", sql: "SELECT 1" }
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result).toBeDefined();
      expect(result.auditPayload?.metadata.serverId).toBe("neon-mcp");
      expect(result.auditPayload?.metadata.toolId).toBe("neon.run_sql");
    }
  });

  it("FakeMcpTransport returns tool_not_found for unknown Neon tool", async () => {
    const registry = createSeedMcpGatewayRegistry(seedMcpServerProfiles);
    const transport = new FakeMcpTransport(registry, { errorOverrides: [] });
    const result = await transport.callTool({
      serverId: "neon-mcp",
      toolId: "neon.unknown",
      arguments: {}
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("tool_not_found");
  });

  // === szfiu 股市 MCP 服务器描述符测试 ===

  it("seed registry includes 7 szfiu stock market servers", () => {
    const szfiuServers = seedMcpServerProfiles.filter((profile) => profile.serverId.startsWith("szfiu-"));
    expect(szfiuServers.length).toBe(7);
    const serverIds = szfiuServers.map((s) => s.serverId);
    expect(serverIds).toEqual([
      "szfiu-cn-f10",
      "szfiu-hk-f10",
      "szfiu-us-f10",
      "szfiu-cn-sdk",
      "szfiu-hk-sdk",
      "szfiu-us-sdk",
      "szfiu-toolkit",
    ]);
  });

  it("szfiu servers use streamable_http transport", () => {
    const szfiuServers = seedMcpServerProfiles.filter((profile) => profile.serverId.startsWith("szfiu-"));
    for (const server of szfiuServers) {
      expect(server.transport).toBe("streamable_http");
    }
  });

  it("szfiu F10 and SDK servers require bearer_token auth", () => {
    const authServers = ["szfiu-cn-f10", "szfiu-hk-f10", "szfiu-us-f10", "szfiu-cn-sdk", "szfiu-hk-sdk", "szfiu-us-sdk"];
    for (const serverId of authServers) {
      const server = seedMcpServerProfiles.find((p) => p.serverId === serverId);
      expect(server?.authRequirement).toBe("bearer_token");
    }
  });

  it("szfiu toolkit requires no auth", () => {
    const toolkit = seedMcpServerProfiles.find((p) => p.serverId === "szfiu-toolkit");
    expect(toolkit?.authRequirement).toBe("none");
  });

  it("szfiu descriptors carry no credentials", () => {
    const registry = createSeedMcpGatewayRegistry(seedMcpServerProfiles);
    const szfiuServers = seedMcpServerProfiles.filter((p) => p.serverId.startsWith("szfiu-"));
    for (const server of szfiuServers) {
      for (const field of ["credentialStatus", "riskLevel", "requiresApproval", "apiKey", "token", "secret"]) {
        expect(Object.hasOwn(server, field)).toBe(false);
      }
      const tools = registry.listTools(server.serverId);
      for (const tool of tools) {
        expect(Object.hasOwn(tool, "apiKey")).toBe(false);
        expect(Object.hasOwn(tool, "token")).toBe(false);
        expect(Object.hasOwn(tool, "secret")).toBe(false);
      }
    }
  });

  it("szfiu-cn-f10 has 3 tools with read effect", () => {
    const registry = createSeedMcpGatewayRegistry(seedMcpServerProfiles);
    const tools = registry.listTools("szfiu-cn-f10");
    expect(tools.length).toBe(3);
    for (const tool of tools) {
      expect(tool.declaredEffect).toBe("read");
    }
  });

  it("szfiu.cn_f10.financial_statements requires stockCode and reportType", () => {
    const registry = createSeedMcpGatewayRegistry(seedMcpServerProfiles);
    const tool = registry.listTools("szfiu-cn-f10").find((d) => d.toolId === "szfiu.cn_f10.financial_statements");
    expect(tool).toBeDefined();
    expect(tool?.inputSchema.required).toEqual(["stockCode", "reportType"]);
  });

  it("FakeMcpTransport returns synthetic success for szfiu search_stock", async () => {
    const registry = createSeedMcpGatewayRegistry(seedMcpServerProfiles);
    const transport = new FakeMcpTransport(registry, { errorOverrides: [] });
    const result = await transport.callTool({
      serverId: "szfiu-toolkit",
      toolId: "szfiu.toolkit.search_stock",
      arguments: { keyword: "茅台" }
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.auditPayload?.metadata.serverId).toBe("szfiu-toolkit");
      expect(result.auditPayload?.metadata.toolId).toBe("szfiu.toolkit.search_stock");
    }
  });

  it("FakeMcpTransport returns tool_not_found for unknown szfiu tool", async () => {
    const registry = createSeedMcpGatewayRegistry(seedMcpServerProfiles);
    const transport = new FakeMcpTransport(registry, { errorOverrides: [] });
    const result = await transport.callTool({
      serverId: "szfiu-cn-f10",
      toolId: "szfiu.unknown",
      arguments: {}
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("tool_not_found");
  });

  // === 瑞幸咖啡 MCP 服务器描述符测试 ===

  it("seed registry includes my-coffee server with 6 tools (disabled, pending token)", () => {
    const coffee = seedMcpServerProfiles.find((profile) => profile.serverId === "my-coffee");
    expect(coffee).toBeDefined();
    expect(coffee?.enabled).toBe(false); // 待 Token 激活
    expect(coffee?.transport).toBe("streamable_http");
    expect(coffee?.authRequirement).toBe("bearer_token");
    expect(coffee?.toolDescriptors.length).toBe(6);
    const toolIds = coffee?.toolDescriptors.map((t) => t.toolId);
    expect(toolIds).toEqual([
      "coffee.list_nearby_stores",
      "coffee.get_menu",
      "coffee.create_order",
      "coffee.get_order_status",
      "coffee.list_order_history",
      "coffee.cancel_order",
    ]);
  });

  it("my-coffee descriptors carry no credentials", () => {
    const coffee = seedMcpServerProfiles.find((profile) => profile.serverId === "my-coffee");
    expect(coffee).toBeDefined();
    for (const field of ["credentialStatus", "riskLevel", "requiresApproval", "apiKey", "token", "secret"]) {
      expect(Object.hasOwn(coffee!, field)).toBe(false);
    }
    for (const tool of coffee!.toolDescriptors) {
      expect(Object.hasOwn(tool, "apiKey")).toBe(false);
      expect(Object.hasOwn(tool, "token")).toBe(false);
      expect(Object.hasOwn(tool, "secret")).toBe(false);
    }
  });

  it("my-coffee create_order requires storeId, items, and pickupType", () => {
    const coffee = seedMcpServerProfiles.find((p) => p.serverId === "my-coffee");
    const tool = coffee?.toolDescriptors.find((d) => d.toolId === "coffee.create_order");
    expect(tool).toBeDefined();
    expect(tool?.inputSchema.required).toEqual(["storeId", "items", "pickupType"]);
    expect(tool?.declaredEffect).toBe("write");
  });

  it("my-coffee read tools declare read effect", () => {
    const coffee = seedMcpServerProfiles.find((p) => p.serverId === "my-coffee");
    const readToolIds = ["coffee.list_nearby_stores", "coffee.get_menu", "coffee.get_order_status", "coffee.list_order_history"];
    for (const toolId of readToolIds) {
      const tool = coffee?.toolDescriptors.find((d) => d.toolId === toolId);
      expect(tool).toBeDefined();
      expect(tool?.declaredEffect).toBe("read");
    }
  });

  it("my-coffee cancel_order declares write effect", () => {
    const coffee = seedMcpServerProfiles.find((p) => p.serverId === "my-coffee");
    const tool = coffee?.toolDescriptors.find((d) => d.toolId === "coffee.cancel_order");
    expect(tool).toBeDefined();
    expect(tool?.declaredEffect).toBe("write");
  });

  it("my-coffee list_nearby_stores requires latitude and longitude", () => {
    const coffee = seedMcpServerProfiles.find((p) => p.serverId === "my-coffee");
    const tool = coffee?.toolDescriptors.find((d) => d.toolId === "coffee.list_nearby_stores");
    expect(tool).toBeDefined();
    expect(tool?.inputSchema.required).toEqual(["latitude", "longitude"]);
  });
});

function serverProfile(serverId: string, enabled = true): McpServerProfile {
  return {
    serverId,
    name: serverId,
    transport: "stdio",
    authRequirement: "none",
    toolDescriptors: [toolDescriptor(serverId, `${serverId}.echo`)],
    enabled,
    healthStatus: "registered"
  };
}

function toolDescriptor(serverId: string, toolId: string): McpToolDescriptor {
  return {
    toolId,
    serverId,
    name: toolId,
    description: "Static test tool.",
    inputSchema: { type: "object" },
    declaredEffect: "read",
    enabled: true
  };
}

function readMcpSource() {
  const root = join(process.cwd(), "src", "mcp");
  return readdirSync(root)
    .filter((file) => file.endsWith(".ts"))
    .map((file) => readFileSync(join(root, file), "utf8"))
    .join("\n");
}
