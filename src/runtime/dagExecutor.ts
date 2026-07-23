import type { ToolExecutionAdapter } from "../integration/toolExecutionAdapter";
import type { ExecutionResult, ResumePoint, Run, RunStore, WorkflowNode } from "./types";

export interface DAGExecutorOptions {
  runStore: RunStore;
  toolAdapter?: ToolExecutionAdapter;
}

export class DAGExecutor {
  constructor(private readonly options: DAGExecutorOptions) {}

  async execute(runId: string): Promise<ExecutionResult> {
    const run = this.options.runStore.getRun(runId);
    if (!run) return { runId, status: "failed" };
    return this.executeFrom(run, run.resumePoint);
  }

  async resume(runId: string): Promise<ExecutionResult> {
    const run = this.options.runStore.getRun(runId);
    if (!run) return { runId, status: "failed" };
    if (run.status === "rejected" || run.status === "completed") {
      return { runId, status: run.status };
    }
    this.options.runStore.appendAuditEvent(runId, {
      type: "resumed",
      message: "Run resumed from checkpoint.",
      nodeId: run.resumePoint?.nodeId
    });
    return this.executeFrom(run, run.resumePoint);
  }

  private async executeFrom(run: Run, resumePoint?: ResumePoint): Promise<ExecutionResult> {
    let context = { ...run.contextSnapshot, ...(resumePoint?.contextSnapshot ?? {}) };
    let cost = { ...run.costSnapshot };
    const completedNodeIds = new Set(run.completedNodeIds);
    const failedNodeIds = new Set(run.failedNodeIds);
    const approvedNodeIds = approvalSet(context);
    const orderedNodes = sortWorkflowNodes(run.workflow.nodes);

    this.options.runStore.updateRun(run.runId, { status: "running" });

    for (const node of orderedNodes) {
      if (completedNodeIds.has(node.nodeId)) continue;
      if (isApprovalNode(node) && approvedNodeIds.has(node.nodeId)) {
        completedNodeIds.add(node.nodeId);
        context = { ...context, [`approval.${node.nodeId}`]: "approved" };
        this.options.runStore.updateRun(run.runId, {
          currentNodeId: node.nodeId,
          completedNodeIds: Array.from(completedNodeIds),
          contextSnapshot: context
        });
        continue;
      }
      if (!dependenciesMet(node, completedNodeIds)) continue;

      this.options.runStore.updateRun(run.runId, { currentNodeId: node.nodeId, contextSnapshot: context });
      this.options.runStore.appendAuditEvent(run.runId, {
        type: "node_started",
        message: `Node ${node.nodeId} started.`,
        nodeId: node.nodeId
      });

      if (isApprovalNode(node)) {
        const resume = resumePointFor(run.runId, node.nodeId, context);
        this.options.runStore.persistCheckpoint(run.runId, resume);
        this.options.runStore.updateRun(run.runId, {
          status: "waiting_approval",
          waitingApprovalNodeId: node.nodeId,
          resumePoint: resume,
          contextSnapshot: context
        });
        this.options.runStore.appendAuditEvent(run.runId, {
          type: "waiting_approval",
          message: `Node ${node.nodeId} is waiting for approval.`,
          nodeId: node.nodeId
        });
        return {
          runId: run.runId,
          status: "waiting_approval",
          approvalRequired: true,
          waitingApprovalNodeId: node.nodeId
        };
      }

      try {
        if (isToolCallNode(node)) {
          context = await this.executeToolCallNode(context, node, run.runId);
        } else {
          context = executeTaskNode(context, node);
        }
        cost = { ...cost, actualTotal: roundCost(cost.actualTotal + (node.cost ?? 0)) };
        completedNodeIds.add(node.nodeId);
        this.options.runStore.updateRun(run.runId, {
          currentNodeId: node.nodeId,
          completedNodeIds: Array.from(completedNodeIds),
          contextSnapshot: context,
          costSnapshot: cost
        });
        this.options.runStore.appendAuditEvent(run.runId, {
          type: "node_completed",
          message: `Node ${node.nodeId} completed.`,
          nodeId: node.nodeId
        });
      } catch (error) {
        failedNodeIds.add(node.nodeId);
        this.options.runStore.updateRun(run.runId, {
          status: "failed",
          currentNodeId: node.nodeId,
          failedNodeIds: Array.from(failedNodeIds),
          contextSnapshot: context
        });
        this.options.runStore.appendAuditEvent(run.runId, {
          type: "run_failed",
          message: error instanceof Error ? error.message : String(error),
          nodeId: node.nodeId
        });
        return { runId: run.runId, status: "failed" };
      }
    }

    this.options.runStore.updateRun(run.runId, {
      status: "completed",
      waitingApprovalNodeId: undefined,
      resumePoint: undefined,
      completedNodeIds: Array.from(completedNodeIds),
      failedNodeIds: Array.from(failedNodeIds),
      contextSnapshot: context,
      costSnapshot: cost
    });
    this.options.runStore.appendAuditEvent(run.runId, {
      type: "run_completed",
      message: "Run completed."
    });
    return { runId: run.runId, status: "completed" };
  }

  private async executeToolCallNode(
    context: Record<string, unknown>,
    node: WorkflowNode,
    runId: string
  ): Promise<Record<string, unknown>> {
    const toolAdapter = this.options.toolAdapter;
    if (!toolAdapter) {
      throw new Error(`Node ${node.nodeId} is type tool_call but no toolAdapter was configured.`);
    }
    if (!node.toolCall) {
      throw new Error(`Node ${node.nodeId} is type tool_call but has no toolCall config.`);
    }
    const { serverId, descriptor, arguments: args } = node.toolCall;
    const result = await toolAdapter.execute(runId, node.nodeId, descriptor, serverId, args, this.options.runStore);
    if (!result.ok) {
      throw new Error(result.message);
    }
    const key = node.outputKey ?? `node.${node.nodeId}`;
    const value = result.transportResponse?.ok ? result.transportResponse.result : result;
    return { ...context, [key]: value };
  }
}

function isApprovalNode(node: WorkflowNode) {
  return node.type === "human_approval" || node.type === "waiting_approval";
}

function isToolCallNode(node: WorkflowNode) {
  return node.type === "tool_call";
}

function dependenciesMet(node: WorkflowNode, completedNodeIds: Set<string>) {
  return (node.dependsOn ?? []).every((dependency) => completedNodeIds.has(dependency));
}

function executeTaskNode(context: Record<string, unknown>, node: WorkflowNode): Record<string, unknown> {
  if (node.failMessage) throw new Error(node.failMessage);
  const key = node.outputKey ?? `node.${node.nodeId}`;
  const value = node.outputValue ?? "completed";
  return { ...context, [key]: value };
}

function resumePointFor(runId: string, nodeId: string, contextSnapshot: Record<string, unknown>): ResumePoint {
  return {
    runId,
    nodeId,
    executionCursor: `after:${nodeId}`,
    contextSnapshot: { ...contextSnapshot }
  };
}

function approvalSet(context: Record<string, unknown>) {
  const value = context.approvedNodeIds;
  return new Set(Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);
}

function sortWorkflowNodes(nodes: WorkflowNode[]) {
  return [...nodes].sort((a, b) => a.nodeId.localeCompare(b.nodeId));
}

function roundCost(value: number) {
  return Math.round(value * 1000) / 1000;
}
