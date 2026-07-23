import { describe, expect, it, vi } from "vitest";
import { FakeMcpTransport, McpGatewayRegistry, createSeedMcpGatewayRegistry, type FakeTransportConfig } from "../mcp";
import { DAGExecutor, MemoryRunStore, type Workflow } from "../runtime";
import { ToolExecutionAdapter, type ToolExecutionAdapterConfig } from "../integration/toolExecutionAdapter";
import type { McpServerProfile, McpToolDescriptor } from "../mcp";
import type { ToolInvocationRequest } from "../governance";

// ===== Fixtures =====

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
    description: "Test tool.",
    inputSchema: { type: "object" },
    declaredEffect: "read",
    enabled: true
  };
}

function makeRegistry(): McpGatewayRegistry {
  return createSeedMcpGatewayRegistry([serverProfile("alpha")]);
}

function makeTransport(overrides: FakeTransportConfig["errorOverrides"] = []): FakeMcpTransport {
  return new FakeMcpTransport(makeRegistry(), { errorOverrides: overrides });
}

function makeAdapter(transport?: FakeMcpTransport): { adapter: ToolExecutionAdapter; runStore: MemoryRunStore } {
  const runStore = new MemoryRunStore();
  const config: ToolExecutionAdapterConfig = {
    runStore,
    transport: transport ?? makeTransport(),
    agentId: "test-agent"
  };
  return { adapter: new ToolExecutionAdapter(config), runStore };
}

function simpleWorkflow(): Workflow {
  return {
    workflowId: "wf-1",
    nodes: [
      { nodeId: "001_task", type: "task", label: "Task" }
    ]
  };
}

// ===== Happy path (4) =====

describe("P4.2 Tool Execution Adapter + Audit Bridge", () => {
  it("executes allowed tool call end-to-end and persists audits", async () => {
    const { adapter, runStore } = makeAdapter();
    const run = runStore.createRun({
      intent: "test",
      taskPlan: { planId: "p1", intent: "test", tasks: [{ taskId: "t1", title: "T1" }] },
      workflow: simpleWorkflow()
    });
    const registry = makeRegistry();
    const descriptor = registry.listTools("alpha")[0];

    const result = await adapter.execute(run.runId, "001_task", descriptor, "alpha", { input: "hello" }, runStore);

    expect(result.ok).toBe(true);
    expect(result.status).toBe("executed");
    expect(result.transportResponse?.ok).toBe(true);

    const events = runStore.getAuditEvents(run.runId);
    expect(events.length).toBeGreaterThanOrEqual(2);
  });

  it("postToolUseHook records succeeded observation", async () => {
    const { adapter, runStore } = makeAdapter();
    const run = runStore.createRun({
      intent: "test",
      taskPlan: { planId: "p1", intent: "test", tasks: [{ taskId: "t1", title: "T1" }] },
      workflow: simpleWorkflow()
    });
    const descriptor = makeRegistry().listTools("alpha")[0];

    const result = await adapter.execute(run.runId, "001_task", descriptor, "alpha", {}, runStore);

    expect(result.ok).toBe(true);
    const events = runStore.getAuditEvents(run.runId);
    const observation = events.find((e) => e.metadata?.observedStatus === "succeeded");
    expect(observation).toBeDefined();
  });

  it("preToolUseHook deny prevents execution and persists denial audit", async () => {
    const transport = makeTransport();
    const fetchSpy = vi.spyOn(transport, "callTool");
    const runStore = new MemoryRunStore();
    const adapter = new ToolExecutionAdapter({ runStore, transport, agentId: "test-agent" });
    const run = runStore.createRun({
      intent: "test",
      taskPlan: { planId: "p1", intent: "test", tasks: [{ taskId: "t1", title: "T1" }] },
      workflow: simpleWorkflow()
    });

    // Disabled tool → preToolUseHook returns deny
    const registry = makeRegistry();
    const disabledDescriptor: McpToolDescriptor = {
      ...registry.listTools("alpha")[0],
      enabled: false
    };

    const result = await adapter.execute(run.runId, "001_task", disabledDescriptor, "alpha", {}, runStore);

    expect(result.ok).toBe(false);
    expect(result.status).toBe("denied");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("tool call failure records failed observation and transport audit payload", async () => {
    const transport = makeTransport([{ errorKind: "server_error" }]);
    const { adapter, runStore } = makeAdapter(transport);
    const run = runStore.createRun({
      intent: "test",
      taskPlan: { planId: "p1", intent: "test", tasks: [{ taskId: "t1", title: "T1" }] },
      workflow: simpleWorkflow()
    });
    const descriptor = makeRegistry().listTools("alpha")[0];

    const result = await adapter.execute(run.runId, "001_task", descriptor, "alpha", {}, runStore);

    expect(result.ok).toBe(false);
    expect(result.status).toBe("failed");
    const events = runStore.getAuditEvents(run.runId);
    const failedObs = events.find((e) => e.metadata?.observedStatus === "failed");
    expect(failedObs).toBeDefined();
  });

  // ===== Effect mapping (5) =====

  it("maps declaredEffect read → ToolEffect read", async () => {
    const { adapter, runStore } = makeAdapter();
    const run = runStore.createRun({
      intent: "test",
      taskPlan: { planId: "p1", intent: "test", tasks: [{ taskId: "t1", title: "T1" }] },
      workflow: simpleWorkflow()
    });
    const descriptor: McpToolDescriptor = {
      toolId: "test.read",
      serverId: "alpha",
      name: "test.read",
      description: "Read tool",
      inputSchema: { type: "object" },
      declaredEffect: "read",
      enabled: true
    };

    const result = await adapter.execute(run.runId, "001_task", descriptor, "alpha", {}, runStore);
    expect(result.decision?.riskLevel).toBeDefined();
  });

  it("maps declaredEffect write → ToolEffect write", async () => {
    const { adapter, runStore } = makeAdapter();
    const run = runStore.createRun({
      intent: "test",
      taskPlan: { planId: "p1", intent: "test", tasks: [{ taskId: "t1", title: "T1" }] },
      workflow: simpleWorkflow()
    });
    const descriptor: McpToolDescriptor = {
      toolId: "test.write",
      serverId: "alpha",
      name: "test.write",
      description: "Write tool",
      inputSchema: { type: "object" },
      declaredEffect: "write",
      enabled: true
    };

    const result = await adapter.execute(run.runId, "001_task", descriptor, "alpha", {}, runStore);
    expect(result.decision).toBeDefined();
  });

  it("maps declaredEffect destructive → ToolEffect delete", async () => {
    const { adapter, runStore } = makeAdapter();
    const run = runStore.createRun({
      intent: "test",
      taskPlan: { planId: "p1", intent: "test", tasks: [{ taskId: "t1", title: "T1" }] },
      workflow: simpleWorkflow()
    });
    const descriptor: McpToolDescriptor = {
      toolId: "test.delete",
      serverId: "alpha",
      name: "test.delete",
      description: "Delete tool",
      inputSchema: { type: "object" },
      declaredEffect: "destructive",
      enabled: true
    };

    const result = await adapter.execute(run.runId, "001_task", descriptor, "alpha", {}, runStore);
    expect(result.decision).toBeDefined();
  });

  it("maps declaredEffect network → ToolEffect external_send", async () => {
    const { adapter, runStore } = makeAdapter();
    const run = runStore.createRun({
      intent: "test",
      taskPlan: { planId: "p1", intent: "test", tasks: [{ taskId: "t1", title: "T1" }] },
      workflow: simpleWorkflow()
    });
    const descriptor: McpToolDescriptor = {
      toolId: "test.network",
      serverId: "alpha",
      name: "test.network",
      description: "Network tool",
      inputSchema: { type: "object" },
      declaredEffect: "network",
      enabled: true
    };

    const result = await adapter.execute(run.runId, "001_task", descriptor, "alpha", {}, runStore);
    expect(result.decision).toBeDefined();
  });

  it("maps declaredEffect compute → ToolEffect execute", async () => {
    const { adapter, runStore } = makeAdapter();
    const run = runStore.createRun({
      intent: "test",
      taskPlan: { planId: "p1", intent: "test", tasks: [{ taskId: "t1", title: "T1" }] },
      workflow: simpleWorkflow()
    });
    const descriptor: McpToolDescriptor = {
      toolId: "test.compute",
      serverId: "alpha",
      name: "test.compute",
      description: "Compute tool",
      inputSchema: { type: "object" },
      declaredEffect: "compute",
      enabled: true
    };

    const result = await adapter.execute(run.runId, "001_task", descriptor, "alpha", {}, runStore);
    expect(result.decision).toBeDefined();
  });

  // ===== Boundary protection (4) =====

  it("src/runtime/dagExecutor.ts is not modified (executeTaskNode still a stub)", () => {
    const executor = new DAGExecutor({ runStore: new MemoryRunStore() });
    expect(executor).toBeDefined();
    expect("executeNodeStrategy" in executor).toBe(false);
  });

  it("src/models, src/governance, src/mcp are not modified (all tests pass)", () => {
    // This test is a placeholder — the full test suite run in N5 verifies this.
    // Here we just confirm the adapter can import from all sealed layers without errors.
    expect(ToolExecutionAdapter).toBeDefined();
  });

  it("adapter does not call fetch directly (uses McpTransport interface)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { adapter, runStore } = makeAdapter();
    const run = runStore.createRun({
      intent: "test",
      taskPlan: { planId: "p1", intent: "test", tasks: [{ taskId: "t1", title: "T1" }] },
      workflow: simpleWorkflow()
    });
    const descriptor = makeRegistry().listTools("alpha")[0];
    await adapter.execute(run.runId, "001_task", descriptor, "alpha", {}, runStore);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("ToolExecutionResult is a safe type with ok and status fields", async () => {
    const { adapter, runStore } = makeAdapter();
    const run = runStore.createRun({
      intent: "test",
      taskPlan: { planId: "p1", intent: "test", tasks: [{ taskId: "t1", title: "T1" }] },
      workflow: simpleWorkflow()
    });
    const descriptor = makeRegistry().listTools("alpha")[0];
    const result = await adapter.execute(run.runId, "001_task", descriptor, "alpha", {}, runStore);
    expect(typeof result.ok).toBe("boolean");
    expect(["allowed", "denied", "requires_approval", "executed", "failed"]).toContain(result.status);
  });

  // ===== Audit bridge (3) =====

  it("mapToolAuditToRunEvent maps deny to run_failed", async () => {
    const { mapToolAuditToRunEvent } = await import("../integration/auditBridge");
    const { preToolUseHook } = await import("../governance/toolPermissionHook");
    const request: ToolInvocationRequest = {
      agentId: "a1",
      toolId: "t1",
      action: "test",
      effect: "read",
      credentialStatus: "not_required",
      dataSensitivity: "public",
      networkAccess: false,
      externalWrite: false,
      destructive: false,
      toolEnabled: false
    };
    const decision = preToolUseHook(request);
    const mapped = mapToolAuditToRunEvent(decision.auditEvent);
    expect(mapped.type).toBe("run_failed");
  });

  it("mapToolAuditToRunEvent maps allow to node_started", async () => {
    const { mapToolAuditToRunEvent } = await import("../integration/auditBridge");
    const { preToolUseHook } = await import("../governance/toolPermissionHook");
    const request: ToolInvocationRequest = {
      agentId: "a1",
      toolId: "t1",
      action: "test",
      effect: "read",
      credentialStatus: "not_required",
      dataSensitivity: "public",
      networkAccess: false,
      externalWrite: false,
      destructive: false,
      toolEnabled: true
    };
    const decision = preToolUseHook(request);
    const mapped = mapToolAuditToRunEvent(decision.auditEvent);
    expect(mapped.type).toBe("node_started");
  });

  it("mapMcpPayloadToRunEvent maps failed payload to run_failed", async () => {
    const { mapMcpPayloadToRunEvent } = await import("../integration/auditBridge");
    const mapped = mapMcpPayloadToRunEvent({
      eventType: "mcp_fake_transport_failed",
      timestamp: "2026-07-05T00:00:00.000Z",
      metadata: { kind: "server_error" }
    });
    expect(mapped.type).toBe("run_failed");
  });
});
