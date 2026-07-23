import type { McpToolDescriptor } from "../mcp/types";

export type RunStatus = "running" | "waiting_approval" | "paused" | "completed" | "failed" | "rejected";

export interface TaskPlan {
  planId: string;
  intent: string;
  tasks: Array<{
    taskId: string;
    title: string;
    nodeId?: string;
  }>;
}

export type WorkflowNodeType = "task" | "human_approval" | "waiting_approval" | "tool_call" | "swarm_execution";

/**
 * Configuration for a tool_call workflow node.
 * The DAGExecutor delegates execution to ToolExecutionAdapter using these fields.
 */
export interface ToolCallNodeConfig {
  serverId: string;
  toolId: string;
  arguments: Record<string, unknown>;
  descriptor: McpToolDescriptor;
}

export interface WorkflowNode {
  nodeId: string;
  type: WorkflowNodeType;
  label: string;
  dependsOn?: string[];
  cost?: number;
  outputKey?: string;
  outputValue?: unknown;
  failMessage?: string;
  toolCall?: ToolCallNodeConfig;
}

export interface Workflow {
  workflowId: string;
  nodes: WorkflowNode[];
}

export interface CostSnapshot {
  estimatedTotal: number;
  actualTotal: number;
  currency: "USD" | "CNY" | "JPY" | "EUR";
}

export interface AuditEvent {
  eventId: string;
  runId: string;
  type:
    | "run_created"
    | "node_started"
    | "node_completed"
    | "waiting_approval"
    | "approved"
    | "rejected"
    | "resumed"
    | "run_completed"
    | "run_failed";
  message: string;
  nodeId?: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface ResumePoint {
  runId: string;
  nodeId: string;
  batchIndex?: number;
  executionCursor?: string;
  contextSnapshot: Record<string, unknown>;
}

export interface Run {
  runId: string;
  intent: string;
  taskPlan: TaskPlan;
  workflow: Workflow;
  status: RunStatus;
  currentNodeId?: string;
  completedNodeIds: string[];
  failedNodeIds: string[];
  waitingApprovalNodeId?: string;
  contextSnapshot: Record<string, unknown>;
  costSnapshot: CostSnapshot;
  auditEventIds?: string[];
  resumePoint?: ResumePoint;
  createdAt: string;
  updatedAt: string;
}

export interface RunStoreError {
  ok: false;
  error: "run_not_found" | "invalid_state" | "execution_failed";
  message: string;
}

export type RunStoreResult<T> = { ok: true; value: T } | RunStoreError;

export interface CreateRunInput {
  intent: string;
  taskPlan: TaskPlan;
  workflow: Workflow;
  contextSnapshot?: Record<string, unknown>;
  costSnapshot?: CostSnapshot;
}

export type RunPatch = Partial<
  Pick<
    Run,
    | "status"
    | "currentNodeId"
    | "completedNodeIds"
    | "failedNodeIds"
    | "waitingApprovalNodeId"
    | "contextSnapshot"
    | "costSnapshot"
    | "auditEventIds"
    | "resumePoint"
  >
>;

export interface RunStore {
  createRun(input: CreateRunInput): Run;
  getRun(runId: string): Run | undefined;
  updateRun(runId: string, patch: RunPatch): RunStoreResult<Run>;
  persistCheckpoint(runId: string, resumePoint: ResumePoint): RunStoreResult<Run>;
  listRuns(): Run[];
  appendAuditEvent(runId: string, event: Omit<AuditEvent, "eventId" | "runId" | "createdAt">): RunStoreResult<Run>;
  getAuditEvents(runId: string): AuditEvent[];
}

export interface ExecutionResult {
  runId: string;
  status: RunStatus;
  approvalRequired?: boolean;
  waitingApprovalNodeId?: string;
}

export interface RunIntentResult {
  runId: string;
  status: RunStatus;
  workflow: Workflow;
  costSummary: CostSnapshot;
  auditSummary: {
    eventCount: number;
    eventIds: string[];
  };
  approvalRequired?: boolean;
  waitingApprovalNodeId?: string;
}

/**
 * Swarm 执行输入 — 由 SwarmOrchestrator 在审批通过后构造，
 * 传递给 orchestrateSwarmFn 执行蜂群任务。
 * 与 intelligence/swarm/orchestrator.ts 解耦：调用方负责适配。
 */
export interface SwarmExecutionInput {
  runId: string;
  intent: string;
  contextSnapshot: Record<string, unknown>;
}

/**
 * Swarm 执行结果 — 蜂群执行的结构化摘要。
 * 存入 Run.contextSnapshot.swarmResult 供后续节点和调用方读取。
 */
export interface SwarmExecutionResult {
  triggerId: string;
  taskCount: number;
  resultCount: number;
  hasSynthesis: boolean;
  followUpCount: number;
}

/**
 * Swarm 执行函数签名（同步）。
 *
 * 设计说明：SwarmOrchestrator.resumeRun 为 async 方法（DAGExecutor 集成
 * tool_call 异步执行后改为 async），但 orchestrateSwarmFn 本身保持同步。
 * 需要异步 orchestrateSwarm 的调用方应预先执行并将结果通过同步包装器注入。
 */
export type OrchestrateSwarmFn = (input: SwarmExecutionInput) => SwarmExecutionResult;
