/**
 * runtime/swarmOrchestrator.ts - Launch Desk DAG 编排器
 *
 * ⚠️ 命名歧义说明：
 *   本文件导出 `SwarmOrchestrator` 类，用于 Launch Desk 的 DAG 审批工作流。
 *   另有 `intelligence/swarm/orchestrator.ts` 导出 `orchestrateSwarm` 函数，
 *   用于 Intelligence Swarm 的 6 角色管道。两者共享零类型，完全独立。
 *   保留类名以兼容 server/index.ts（不可修改约束）。
 */

import type { ToolExecutionAdapter } from "../integration/toolExecutionAdapter";
import type { PersistenceBackend } from "../intelligence/memory/persistence/adapter";
import { DAGExecutor } from "./dagExecutor";
import { MemoryRunStore } from "./runStore";
import type {
  CostSnapshot,
  CreateRunInput,
  OrchestrateSwarmFn,
  Run,
  RunIntentResult,
  RunStore,
  RunStoreResult,
  TaskPlan,
  Workflow,
  WorkflowNode
} from "./types";

/**
 * Swarm 触发配置 — 控制何时调用 orchestrateSwarmFn。
 */
export interface SwarmTriggerConfig {
  /** 审批通过后触发蜂群执行（默认 true）。设为 false 可禁用自动触发。 */
  onApprovalApproved?: boolean;
}

export interface SwarmOrchestratorOptions {
  runStore?: RunStore;
  /** 可选：蜂群执行函数。注入后审批通过后会调用，将结果回流到 contextSnapshot。 */
  orchestrateSwarmFn?: OrchestrateSwarmFn;
  /** 可选：蜂群触发配置。 */
  swarmTrigger?: SwarmTriggerConfig;
  /** 可选：ToolExecutionAdapter，启用后 DAG 可执行 tool_call 类型节点。 */
  toolAdapter?: ToolExecutionAdapter;
  /**
   * 可选：持久化后端（#6 Neon 集成）。
   *
   * 当传入时，orchestrator 暴露 getPersistence() 供下游（如 MemoryBroker
   * 工厂、启动日志、健康检查）使用。当前不在 DAGExecutor/loop-driver 内
   * 自动注入 — 完整 swarm 链路集成留待后续迭代。
   */
  persistence?: PersistenceBackend;
}

export class SwarmOrchestrator {
  private readonly runStore: RunStore;
  private readonly executor: DAGExecutor;
  private readonly orchestrateSwarmFn?: OrchestrateSwarmFn;
  private readonly swarmTrigger?: SwarmTriggerConfig;
  private readonly persistence?: PersistenceBackend;

  constructor(options: SwarmOrchestratorOptions = {}) {
    this.runStore = options.runStore ?? new MemoryRunStore();
    this.executor = new DAGExecutor({ runStore: this.runStore, toolAdapter: options.toolAdapter });
    this.orchestrateSwarmFn = options.orchestrateSwarmFn;
    this.swarmTrigger = options.swarmTrigger;
    this.persistence = options.persistence;
  }

  async runIntent(intent: string, workflow?: Workflow, taskPlan?: TaskPlan): Promise<RunIntentResult> {
    const compiledTaskPlan = taskPlan ?? compileTaskPlan(intent);
    const enableSwarm = this.orchestrateSwarmFn !== undefined;
    const compiledWorkflow = workflow ?? compileWorkflow(compiledTaskPlan, { enableSwarm });
    validateWorkflow(compiledWorkflow);
    const run = this.runStore.createRun({
      intent,
      taskPlan: compiledTaskPlan,
      workflow: compiledWorkflow,
      costSnapshot: estimateCost(compiledWorkflow)
    });
    const execution = await this.executor.execute(run.runId);
    const latest = this.runStore.getRun(run.runId) ?? run;
    return toRunIntentResult(latest, execution.approvalRequired);
  }

  getRunState(runId: string): RunStoreResult<Run> {
    const run = this.runStore.getRun(runId);
    if (!run) {
      return {
        ok: false,
        error: "run_not_found",
        message: `Run ${runId} was not found.`
      };
    }
    return { ok: true, value: run };
  }

  approveRun(runId: string): RunStoreResult<Run> {
    const run = this.runStore.getRun(runId);
    if (!run) return runNotFound(runId);
    if (run.status !== "waiting_approval" || !run.waitingApprovalNodeId) {
      return invalidState(runId, "Only waiting_approval runs can be approved.");
    }
    const approvedNodeIds = new Set(readStringArray(run.contextSnapshot.approvedNodeIds));
    approvedNodeIds.add(run.waitingApprovalNodeId);
    const contextSnapshot = {
      ...run.contextSnapshot,
      approvedNodeIds: Array.from(approvedNodeIds),
      [`approval.${run.waitingApprovalNodeId}`]: "approved"
    };
    this.runStore.appendAuditEvent(runId, {
      type: "approved",
      message: `Node ${run.waitingApprovalNodeId} approved.`,
      nodeId: run.waitingApprovalNodeId
    });
    return this.runStore.updateRun(runId, {
      status: "paused",
      contextSnapshot,
      resumePoint: run.resumePoint ? { ...run.resumePoint, contextSnapshot } : undefined
    });
  }

  rejectRun(runId: string): RunStoreResult<Run> {
    const run = this.runStore.getRun(runId);
    if (!run) return runNotFound(runId);
    if (run.status !== "waiting_approval") {
      return invalidState(runId, "Only waiting_approval runs can be rejected.");
    }
    this.runStore.appendAuditEvent(runId, {
      type: "rejected",
      message: `Run ${runId} rejected.`,
      nodeId: run.waitingApprovalNodeId
    });
    return this.runStore.updateRun(runId, {
      status: "rejected"
    });
  }

  async resumeRun(runId: string): Promise<RunStoreResult<Run>> {
    const run = this.runStore.getRun(runId);
    if (!run) return runNotFound(runId);
    if (run.status !== "paused") {
      return invalidState(runId, "Only paused runs can be resumed.");
    }
    if (!run.resumePoint) {
      return invalidState(runId, "Run does not have a resume point.");
    }
    // 蜂群集成：审批通过后（run 处于 paused 状态），如果配置了 orchestrateSwarmFn，
    // 在 DAG 继续执行前调用蜂群执行，将结果存入 contextSnapshot。
    // DAG 中的 002b_swarm 节点作为占位标记，由 DAGExecutor 当作普通 task 执行。
    if (this.orchestrateSwarmFn && this.shouldTriggerSwarm(run)) {
      const swarmResult = this.orchestrateSwarmFn({
        runId: run.runId,
        intent: run.intent,
        contextSnapshot: run.contextSnapshot
      });
      this.runStore.updateRun(runId, {
        contextSnapshot: { ...run.contextSnapshot, swarmResult }
      });
      this.runStore.appendAuditEvent(runId, {
        type: "node_completed",
        message: `Swarm execution completed: ${swarmResult.taskCount} tasks, ${swarmResult.resultCount} results.`,
        nodeId: SWARM_NODE_ID
      });
    }
    await this.executor.resume(runId);
    const latest = this.runStore.getRun(runId);
    return latest ? { ok: true, value: latest } : runNotFound(runId);
  }

  /**
   * 判断是否应在当前状态下触发蜂群执行。
   * 默认在审批通过后（paused 状态）触发；可通过 swarmTrigger.onApprovalApproved=false 禁用。
   */
  private shouldTriggerSwarm(run: Run): boolean {
    const trigger = this.swarmTrigger ?? {};
    if (trigger.onApprovalApproved === false) return false;
    return run.status === "paused";
  }

  getRunStore() {
    return this.runStore;
  }

  /**
   * 返回注入的持久化后端（#6 Neon 集成）。
   * 未注入时返回 undefined。供启动日志、健康检查、MemoryBroker 工厂使用。
   */
  getPersistence(): PersistenceBackend | undefined {
    return this.persistence;
  }
}

/**
 * Swarm 节点 ID。使用 "002b_swarm" 确保在 localeCompare 排序中
 * 位于 "002_approval" 之后、"003_finalize" 之前：
 *   "002_approval" < "002b_swarm"（"_" 0x5F < "b" 0x62）
 *   "002b_swarm" < "003_finalize"（"002" < "003"）
 * DAGExecutor 按 nodeId 排序后单次遍历，依赖顺序必须与排序一致。
 */
export const SWARM_NODE_ID = "002b_swarm";

export function compileTaskPlan(intent: string): TaskPlan {
  return {
    planId: stableId("plan", intent),
    intent,
    tasks: [
      { taskId: "task_prepare", title: "Prepare execution context", nodeId: "001_prepare" },
      { taskId: "task_approval", title: "Request human approval", nodeId: "002_approval" },
      { taskId: "task_finalize", title: "Finalize execution", nodeId: "003_finalize" }
    ]
  };
}

export function compileWorkflow(taskPlan: TaskPlan, options?: { enableSwarm?: boolean }): Workflow {
  const enableSwarm = options?.enableSwarm ?? false;
  const nodes: WorkflowNode[] = [
    {
      nodeId: "001_prepare",
      type: "task",
      label: "Prepare execution context",
      cost: 0.1,
      outputKey: "prepared",
      outputValue: true
    },
    {
      nodeId: "002_approval",
      type: "human_approval",
      label: "Human approval",
      dependsOn: ["001_prepare"]
    }
  ];
  if (enableSwarm) {
    nodes.push({
      nodeId: SWARM_NODE_ID,
      type: "swarm_execution",
      label: "Swarm execution",
      dependsOn: ["002_approval"],
      cost: 0.0,
      outputKey: "swarm.completed",
      outputValue: true
    });
  }
  nodes.push({
    nodeId: "003_finalize",
    type: "task",
    label: "Finalize execution",
    dependsOn: enableSwarm ? [SWARM_NODE_ID] : ["002_approval"],
    cost: 0.2,
    outputKey: "finalized",
    outputValue: true
  });
  return {
    workflowId: stableId("workflow", taskPlan.intent),
    nodes
  };
}

export function validateWorkflow(workflow: Workflow) {
  const ids = new Set<string>();
  for (const node of workflow.nodes) {
    if (ids.has(node.nodeId)) throw new Error(`Duplicate workflow node ${node.nodeId}.`);
    ids.add(node.nodeId);
  }
  for (const node of workflow.nodes) {
    for (const dependency of node.dependsOn ?? []) {
      if (!ids.has(dependency)) throw new Error(`Unknown dependency ${dependency} for ${node.nodeId}.`);
    }
  }
}

function estimateCost(workflow: Workflow): CostSnapshot {
  return {
    estimatedTotal: workflow.nodes.reduce((total, node) => total + (node.cost ?? 0), 0),
    actualTotal: 0,
    currency: "USD"
  };
}

function toRunIntentResult(run: Run, approvalRequired?: boolean): RunIntentResult {
  const auditEventIds = run.auditEventIds ?? [];
  return {
    runId: run.runId,
    status: run.status,
    workflow: run.workflow,
    costSummary: run.costSnapshot,
    auditSummary: {
      eventCount: auditEventIds.length,
      eventIds: auditEventIds
    },
    approvalRequired,
    waitingApprovalNodeId: run.waitingApprovalNodeId
  };
}

function runNotFound(runId: string): RunStoreResult<Run> {
  return {
    ok: false,
    error: "run_not_found",
    message: `Run ${runId} was not found.`
  };
}

function invalidState(runId: string, message: string): RunStoreResult<Run> {
  return {
    ok: false,
    error: "invalid_state",
    message: `${runId}: ${message}`
  };
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function stableId(prefix: string, value: string) {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "run";
  return `${prefix}_${slug}`;
}

export function createRunInput(intent: string, workflow?: Workflow, taskPlan?: TaskPlan): CreateRunInput {
  const compiledTaskPlan = taskPlan ?? compileTaskPlan(intent);
  const compiledWorkflow = workflow ?? compileWorkflow(compiledTaskPlan);
  return {
    intent,
    taskPlan: compiledTaskPlan,
    workflow: compiledWorkflow,
    costSnapshot: estimateCost(compiledWorkflow)
  };
}
