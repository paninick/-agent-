import type {
  AuditEvent,
  CreateRunInput,
  CostSnapshot,
  ResumePoint,
  Run,
  RunPatch,
  RunStore,
  RunStoreResult
} from "./types";

const defaultCostSnapshot: CostSnapshot = {
  estimatedTotal: 0,
  actualTotal: 0,
  currency: "USD"
};

export class MemoryRunStore implements RunStore {
  private readonly runs = new Map<string, Run>();
  private readonly auditEvents = new Map<string, AuditEvent[]>();
  private sequence = 0;
  private auditSequence = 0;

  createRun(input: CreateRunInput): Run {
    const now = new Date().toISOString();
    const runId = this.nextRunId();
    const run: Run = {
      runId,
      intent: input.intent,
      taskPlan: input.taskPlan,
      workflow: input.workflow,
      status: "running",
      completedNodeIds: [],
      failedNodeIds: [],
      contextSnapshot: cloneRecord(input.contextSnapshot ?? {}),
      costSnapshot: { ...(input.costSnapshot ?? defaultCostSnapshot) },
      auditEventIds: [],
      createdAt: now,
      updatedAt: now
    };
    this.runs.set(runId, cloneRun(run));
    this.auditEvents.set(runId, []);
    this.appendAuditEvent(runId, { type: "run_created", message: "Run created." });
    return this.getRun(runId) ?? run;
  }

  getRun(runId: string): Run | undefined {
    const run = this.runs.get(runId);
    return run ? cloneRun(run) : undefined;
  }

  updateRun(runId: string, patch: RunPatch): RunStoreResult<Run> {
    const current = this.runs.get(runId);
    if (!current) return runNotFound(runId);
    if (patch.status && !canTransition(current.status, patch.status)) {
      return {
        ok: false,
        error: "invalid_state",
        message: `Run ${runId} cannot transition from ${current.status} to ${patch.status}.`
      };
    }
    const updated: Run = {
      ...current,
      ...definedPatch(clonePatch(patch)),
      updatedAt: new Date().toISOString()
    };
    this.runs.set(runId, cloneRun(updated));
    return { ok: true, value: cloneRun(updated) };
  }

  persistCheckpoint(runId: string, resumePoint: ResumePoint): RunStoreResult<Run> {
    return this.updateRun(runId, {
      resumePoint: cloneResumePoint(resumePoint),
      contextSnapshot: cloneRecord(resumePoint.contextSnapshot),
      currentNodeId: resumePoint.nodeId
    });
  }

  listRuns(): Run[] {
    return Array.from(this.runs.values()).map(cloneRun);
  }

  appendAuditEvent(
    runId: string,
    event: Omit<AuditEvent, "eventId" | "runId" | "createdAt">
  ): RunStoreResult<Run> {
    const run = this.runs.get(runId);
    if (!run) return runNotFound(runId);
    const auditEvent: AuditEvent = {
      ...event,
      eventId: this.nextAuditEventId(),
      runId,
      createdAt: new Date().toISOString()
    };
    const events = this.auditEvents.get(runId) ?? [];
    events.push(auditEvent);
    this.auditEvents.set(runId, events);
    const auditEventIds = [...(run.auditEventIds ?? []), auditEvent.eventId];
    const updated = { ...run, auditEventIds, updatedAt: auditEvent.createdAt };
    this.runs.set(runId, cloneRun(updated));
    return { ok: true, value: cloneRun(updated) };
  }

  getAuditEvents(runId: string): AuditEvent[] {
    return (this.auditEvents.get(runId) ?? []).map((event) => ({ ...event, metadata: cloneRecord(event.metadata ?? {}) }));
  }

  private nextRunId() {
    this.sequence += 1;
    return `run_${String(this.sequence).padStart(6, "0")}`;
  }

  private nextAuditEventId() {
    this.auditSequence += 1;
    return `audit_${String(this.auditSequence).padStart(6, "0")}`;
  }
}

function runNotFound(runId: string): RunStoreResult<Run> {
  return {
    ok: false,
    error: "run_not_found",
    message: `Run ${runId} was not found.`
  };
}

function canTransition(current: Run["status"], next: Run["status"]) {
  if (current === next) return true;
  const allowed: Record<Run["status"], Array<Run["status"]>> = {
    running: ["waiting_approval", "completed", "failed"],
    waiting_approval: ["paused", "rejected"],
    paused: ["running"],
    completed: [],
    failed: [],
    rejected: []
  };
  return allowed[current].includes(next);
}

function cloneRun(run: Run): Run {
  return {
    ...run,
    taskPlan: {
      ...run.taskPlan,
      tasks: run.taskPlan.tasks.map((task) => ({ ...task }))
    },
    workflow: {
      ...run.workflow,
      nodes: run.workflow.nodes.map((node) => ({ ...node, dependsOn: node.dependsOn ? [...node.dependsOn] : undefined }))
    },
    completedNodeIds: [...run.completedNodeIds],
    failedNodeIds: [...run.failedNodeIds],
    contextSnapshot: cloneRecord(run.contextSnapshot),
    costSnapshot: { ...run.costSnapshot },
    auditEventIds: run.auditEventIds ? [...run.auditEventIds] : undefined,
    resumePoint: run.resumePoint ? cloneResumePoint(run.resumePoint) : undefined
  };
}

function clonePatch(patch: RunPatch): RunPatch {
  return {
    ...patch,
    completedNodeIds: patch.completedNodeIds ? [...patch.completedNodeIds] : undefined,
    failedNodeIds: patch.failedNodeIds ? [...patch.failedNodeIds] : undefined,
    contextSnapshot: patch.contextSnapshot ? cloneRecord(patch.contextSnapshot) : undefined,
    costSnapshot: patch.costSnapshot ? { ...patch.costSnapshot } : undefined,
    auditEventIds: patch.auditEventIds ? [...patch.auditEventIds] : undefined,
    resumePoint: patch.resumePoint ? cloneResumePoint(patch.resumePoint) : undefined
  };
}

function definedPatch(patch: RunPatch): RunPatch {
  return Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)) as RunPatch;
}

function cloneResumePoint(resumePoint: ResumePoint): ResumePoint {
  return {
    ...resumePoint,
    contextSnapshot: cloneRecord(resumePoint.contextSnapshot)
  };
}

function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}
