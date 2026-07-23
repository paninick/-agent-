/**
 * dag-tool-integration.test.ts — P0-3 集成测试
 *
 * 验证 DAGExecutor 集成 ToolExecutionAdapter 后的端到端行为：
 *   1. tool_call 节点成功执行，结果存入 contextSnapshot
 *   2. tool_call 节点 + task 节点混合工作流
 *   3. governance 拒绝时 run 标记为 failed
 *   4. transport 失败时 run 标记为 failed
 *   5. 无 toolAdapter 时遇到 tool_call 节点降级为 failed
 *   6. SwarmOrchestrator 通过 toolAdapter 选项集成
 */

import { describe, expect, it, vi } from "vitest";
import { FakeMcpTransport, type FakeTransportConfig, createSeedMcpGatewayRegistry } from "../mcp";
import type { McpServerProfile, McpToolDescriptor } from "../mcp";
import { DAGExecutor, MemoryRunStore, type Workflow, type WorkflowNode } from "../runtime";
import { ToolExecutionAdapter } from "../integration/toolExecutionAdapter";
import { SwarmOrchestrator } from "../runtime/swarmOrchestrator";

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

function makeRegistry() {
  return createSeedMcpGatewayRegistry([serverProfile("alpha")]);
}

function makeTransport(overrides: FakeTransportConfig["errorOverrides"] = []): FakeMcpTransport {
  return new FakeMcpTransport(makeRegistry(), { errorOverrides: overrides });
}

function makeAdapter(transport?: FakeMcpTransport): { adapter: ToolExecutionAdapter; runStore: MemoryRunStore } {
  const runStore = new MemoryRunStore();
  const t = transport ?? makeTransport();
  const adapter = new ToolExecutionAdapter({ runStore, transport: t, agentId: "test-agent" });
  return { adapter, runStore };
}

function toolCallNode(
  nodeId: string,
  descriptor: McpToolDescriptor,
  serverId: string,
  args: Record<string, unknown> = {},
  extra?: Partial<WorkflowNode>
): WorkflowNode {
  return {
    nodeId,
    type: "tool_call",
    label: `Tool call ${nodeId}`,
    toolCall: {
      serverId,
      toolId: descriptor.toolId,
      arguments: args,
      descriptor
    },
    ...extra
  };
}

function simpleWorkflow(): Workflow {
  return {
    workflowId: "wf-1",
    nodes: [{ nodeId: "001_task", type: "task", label: "Task" }]
  };
}

// ===== Tests =====

describe("P0-3 DAG + ToolExecutionAdapter Integration", () => {
  // ===== Happy path =====

  it("executes tool_call node end-to-end and stores result in contextSnapshot", async () => {
    const { adapter, runStore } = makeAdapter();
    const descriptor = makeRegistry().listTools("alpha")[0];
    const workflow: Workflow = {
      workflowId: "wf-tool-1",
      nodes: [
        toolCallNode("001_tool", descriptor, "alpha", { input: "hello" }, { outputKey: "toolResult" })
      ]
    };
    const run = runStore.createRun({
      intent: "test tool call",
      taskPlan: { planId: "p1", intent: "test", tasks: [{ taskId: "t1", title: "T1" }] },
      workflow
    });

    const executor = new DAGExecutor({ runStore, toolAdapter: adapter });
    const result = await executor.execute(run.runId);

    expect(result.status).toBe("completed");
    const updated = runStore.getRun(run.runId);
    expect(updated?.completedNodeIds).toContain("001_tool");
    expect(updated?.contextSnapshot.toolResult).toBeDefined();
    // FakeMcpTransport returns a synthetic result object
    const toolResult = updated?.contextSnapshot.toolResult as Record<string, unknown>;
    expect(toolResult.serverId).toBe("alpha");
    expect(toolResult.toolId).toBe("alpha.echo");
  });

  it("executes mixed workflow: task → tool_call → task", async () => {
    const { adapter, runStore } = makeAdapter();
    const descriptor = makeRegistry().listTools("alpha")[0];
    const workflow: Workflow = {
      workflowId: "wf-mixed",
      nodes: [
        {
          nodeId: "001_prepare",
          type: "task",
          label: "Prepare",
          outputKey: "prepared",
          outputValue: true
        },
        toolCallNode("002_tool", descriptor, "alpha", { input: "data" }, {
          dependsOn: ["001_prepare"],
          outputKey: "toolResult"
        }),
        {
          nodeId: "003_finalize",
          type: "task",
          label: "Finalize",
          dependsOn: ["002_tool"],
          outputKey: "finalized",
          outputValue: true
        }
      ]
    };
    const run = runStore.createRun({
      intent: "mixed workflow",
      taskPlan: { planId: "p1", intent: "test", tasks: [{ taskId: "t1", title: "T1" }] },
      workflow
    });

    const executor = new DAGExecutor({ runStore, toolAdapter: adapter });
    const result = await executor.execute(run.runId);

    expect(result.status).toBe("completed");
    const updated = runStore.getRun(run.runId);
    expect(updated?.completedNodeIds).toEqual(["001_prepare", "002_tool", "003_finalize"]);
    expect(updated?.contextSnapshot.prepared).toBe(true);
    expect(updated?.contextSnapshot.toolResult).toBeDefined();
    expect(updated?.contextSnapshot.finalized).toBe(true);
  });

  it("persists audit events for tool_call node execution", async () => {
    const { adapter, runStore } = makeAdapter();
    const descriptor = makeRegistry().listTools("alpha")[0];
    const workflow: Workflow = {
      workflowId: "wf-audit",
      nodes: [toolCallNode("001_tool", descriptor, "alpha", {}, { outputKey: "result" })]
    };
    const run = runStore.createRun({
      intent: "audit test",
      taskPlan: { planId: "p1", intent: "test", tasks: [{ taskId: "t1", title: "T1" }] },
      workflow
    });

    const executor = new DAGExecutor({ runStore, toolAdapter: adapter });
    await executor.execute(run.runId);

    const events = runStore.getAuditEvents(run.runId);
    // Should have: run_created, node_started, node_completed (at minimum)
    const types = events.map((e) => e.type);
    expect(types).toContain("run_created");
    expect(types).toContain("node_started");
    expect(types).toContain("node_completed");
    expect(types).toContain("run_completed");
  });

  // ===== Governance denial =====

  it("marks run as failed when governance denies the tool call", async () => {
    const { adapter, runStore } = makeAdapter();
    // Disabled descriptor → preToolUseHook returns deny
    const disabledDescriptor: McpToolDescriptor = {
      ...makeRegistry().listTools("alpha")[0],
      enabled: false
    };
    const workflow: Workflow = {
      workflowId: "wf-denied",
      nodes: [toolCallNode("001_tool", disabledDescriptor, "alpha", {}, { outputKey: "result" })]
    };
    const run = runStore.createRun({
      intent: "denied test",
      taskPlan: { planId: "p1", intent: "test", tasks: [{ taskId: "t1", title: "T1" }] },
      workflow
    });

    const executor = new DAGExecutor({ runStore, toolAdapter: adapter });
    const result = await executor.execute(run.runId);

    expect(result.status).toBe("failed");
    const updated = runStore.getRun(run.runId);
    expect(updated?.failedNodeIds).toContain("001_tool");
    expect(updated?.contextSnapshot.result).toBeUndefined();
  });

  // ===== Transport failure =====

  it("marks run as failed when transport returns an error", async () => {
    const transport = makeTransport([{ errorKind: "server_error" }]);
    const { adapter, runStore } = makeAdapter(transport);
    const descriptor = makeRegistry().listTools("alpha")[0];
    const workflow: Workflow = {
      workflowId: "wf-transport-fail",
      nodes: [toolCallNode("001_tool", descriptor, "alpha", {}, { outputKey: "result" })]
    };
    const run = runStore.createRun({
      intent: "transport failure test",
      taskPlan: { planId: "p1", intent: "test", tasks: [{ taskId: "t1", title: "T1" }] },
      workflow
    });

    const executor = new DAGExecutor({ runStore, toolAdapter: adapter });
    const result = await executor.execute(run.runId);

    expect(result.status).toBe("failed");
    const updated = runStore.getRun(run.runId);
    expect(updated?.failedNodeIds).toContain("001_tool");
  });

  // ===== No toolAdapter degradation =====

  it("marks run as failed when tool_call node encountered without toolAdapter", async () => {
    const runStore = new MemoryRunStore();
    const descriptor = makeRegistry().listTools("alpha")[0];
    const workflow: Workflow = {
      workflowId: "wf-no-adapter",
      nodes: [toolCallNode("001_tool", descriptor, "alpha", {}, { outputKey: "result" })]
    };
    const run = runStore.createRun({
      intent: "no adapter test",
      taskPlan: { planId: "p1", intent: "test", tasks: [{ taskId: "t1", title: "T1" }] },
      workflow
    });

    // No toolAdapter provided
    const executor = new DAGExecutor({ runStore });
    const result = await executor.execute(run.runId);

    expect(result.status).toBe("failed");
    const updated = runStore.getRun(run.runId);
    expect(updated?.failedNodeIds).toContain("001_tool");
    const events = runStore.getAuditEvents(run.runId);
    const failEvent = events.find((e) => e.type === "run_failed");
    expect(failEvent?.message).toContain("toolAdapter");
  });

  // ===== Backward compatibility =====

  it("executes task-only workflow without toolAdapter (backward compat)", async () => {
    const runStore = new MemoryRunStore();
    const run = runStore.createRun({
      intent: "backward compat",
      taskPlan: { planId: "p1", intent: "test", tasks: [{ taskId: "t1", title: "T1" }] },
      workflow: simpleWorkflow()
    });

    const executor = new DAGExecutor({ runStore });
    const result = await executor.execute(run.runId);

    expect(result.status).toBe("completed");
  });

  it("DAGExecutor constructor accepts { runStore } only (backward compat)", () => {
    const executor = new DAGExecutor({ runStore: new MemoryRunStore() });
    expect(executor).toBeDefined();
    expect("executeNodeStrategy" in executor).toBe(false);
  });

  // ===== SwarmOrchestrator integration =====

  it("SwarmOrchestrator accepts toolAdapter option and executes tool_call nodes", async () => {
    const runStore = new MemoryRunStore();
    const transport = makeTransport();
    const adapter = new ToolExecutionAdapter({ runStore, transport, agentId: "test-agent" });
    const descriptor = makeRegistry().listTools("alpha")[0];

    const workflow: Workflow = {
      workflowId: "wf-orch-tool",
      nodes: [
        toolCallNode("001_tool", descriptor, "alpha", { input: "hello" }, { outputKey: "toolResult" })
      ]
    };

    const orchestrator = new SwarmOrchestrator({ runStore, toolAdapter: adapter });
    const result = await orchestrator.runIntent("orchestrator tool test", workflow);

    expect(result.status).toBe("completed");
    const state = orchestrator.getRunState(result.runId);
    if (state.ok) {
      expect(state.value.completedNodeIds).toContain("001_tool");
      expect(state.value.contextSnapshot.toolResult).toBeDefined();
    }
  });

  it("SwarmOrchestrator without toolAdapter still works for task-only workflows", async () => {
    const orchestrator = new SwarmOrchestrator();
    const result = await orchestrator.runIntent("simple task");

    // Default workflow has approval node → should stop at waiting_approval
    expect(result.status).toBe("waiting_approval");
    expect(result.approvalRequired).toBe(true);
  });

  // ===== Does not call fetch directly =====

  it("DAGExecutor + toolAdapter does not call fetch directly", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { adapter, runStore } = makeAdapter();
    const descriptor = makeRegistry().listTools("alpha")[0];
    const workflow: Workflow = {
      workflowId: "wf-no-fetch",
      nodes: [toolCallNode("001_tool", descriptor, "alpha", {}, { outputKey: "result" })]
    };
    const run = runStore.createRun({
      intent: "no fetch test",
      taskPlan: { planId: "p1", intent: "test", tasks: [{ taskId: "t1", title: "T1" }] },
      workflow
    });

    const executor = new DAGExecutor({ runStore, toolAdapter: adapter });
    await executor.execute(run.runId);

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
