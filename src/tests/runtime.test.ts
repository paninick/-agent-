import { describe, expect, it } from "vitest";
import {
  compileTaskPlan,
  compileWorkflow,
  createRunInput,
  MemoryRunStore,
  SwarmOrchestrator,
  type Workflow
} from "../runtime";

const intent = "Run approval resume smoke test";

function approvalWorkflow(): Workflow {
  return compileWorkflow(compileTaskPlan(intent));
}

function failingWorkflow(): Workflow {
  return {
    workflowId: "workflow_failure",
    nodes: [
      {
        nodeId: "001_prepare",
        type: "task",
        label: "Prepare",
        cost: 0.1,
        outputKey: "prepared",
        outputValue: true
      },
      {
        nodeId: "002_fail",
        type: "task",
        label: "Failing node",
        dependsOn: ["001_prepare"],
        failMessage: "Synthetic node failure"
      },
      {
        nodeId: "003_after",
        type: "task",
        label: "Should not execute",
        dependsOn: ["002_fail"],
        outputKey: "afterFailure",
        outputValue: true
      }
    ]
  };
}

describe("RunStore v1", () => {
  it("creates, reads, updates, checkpoints, lists, and handles invalid runId safely", () => {
    const store = new MemoryRunStore();
    const run = store.createRun(createRunInput(intent, approvalWorkflow()));

    expect(run.runId).toMatch(/^run_/);
    const created = store.getRun(run.runId);
    expect(created?.status).toBe("running");
    expect(created?.completedNodeIds).toEqual([]);
    expect(created?.failedNodeIds).toEqual([]);
    expect(created?.contextSnapshot).toEqual({});
    expect(created?.costSnapshot).toBeDefined();

    const updated = store.updateRun(run.runId, { status: "waiting_approval", contextSnapshot: { phase: "manual-check" } });
    expect(updated.ok && updated.value.status).toBe("waiting_approval");

    const checkpoint = store.persistCheckpoint(run.runId, {
      runId: run.runId,
      nodeId: "002_approval",
      executionCursor: "after:002_approval",
      contextSnapshot: { phase: "manual-check" }
    });
    expect(checkpoint.ok && checkpoint.value.resumePoint?.nodeId).toBe("002_approval");
    expect(checkpoint.ok && checkpoint.value.currentNodeId).toBe("002_approval");
    expect(checkpoint.ok && checkpoint.value.contextSnapshot.phase).toBe("manual-check");
    const audit = store.appendAuditEvent(run.runId, { type: "waiting_approval", message: "Waiting", nodeId: "002_approval" });
    expect(audit.ok).toBe(true);
    expect(store.getAuditEvents(run.runId).some((event) => event.type === "waiting_approval")).toBe(true);
    expect(store.appendAuditEvent("missing", { type: "run_failed", message: "No run" }).ok).toBe(false);
    expect(store.listRuns()).toHaveLength(1);

    const invalidUpdate = store.updateRun("missing", { status: "failed" });
    expect(invalidUpdate.ok).toBe(false);
    if (!invalidUpdate.ok) expect(invalidUpdate.error).toBe("run_not_found");

    const invalidCheckpoint = store.persistCheckpoint("missing", {
      runId: "missing",
      nodeId: "x",
      contextSnapshot: {}
    });
    expect(invalidCheckpoint.ok).toBe(false);
  });

  it("lists runs across runtime statuses and exposes approval queue as waiting_approval runs", () => {
    const store = new MemoryRunStore();
    const running = store.createRun(createRunInput("running", approvalWorkflow()));
    const waiting = store.createRun(createRunInput("waiting", approvalWorkflow()));
    const paused = store.createRun(createRunInput("paused", approvalWorkflow()));
    const completed = store.createRun(createRunInput("completed", approvalWorkflow()));
    const failed = store.createRun(createRunInput("failed", approvalWorkflow()));
    const rejected = store.createRun(createRunInput("rejected", approvalWorkflow()));

    expect(store.updateRun(waiting.runId, { status: "waiting_approval" }).ok).toBe(true);
    expect(store.updateRun(paused.runId, { status: "waiting_approval" }).ok).toBe(true);
    expect(store.updateRun(paused.runId, { status: "paused" }).ok).toBe(true);
    expect(store.updateRun(completed.runId, { status: "completed" }).ok).toBe(true);
    expect(store.updateRun(failed.runId, { status: "failed" }).ok).toBe(true);
    expect(store.updateRun(rejected.runId, { status: "waiting_approval" }).ok).toBe(true);
    expect(store.updateRun(rejected.runId, { status: "rejected" }).ok).toBe(true);

    const statuses = new Set(store.listRuns().map((run) => run.status));
    expect(statuses).toEqual(new Set(["running", "waiting_approval", "paused", "completed", "failed", "rejected"]));
    const approvalQueue = store.listRuns().filter((run) => run.status === "waiting_approval");
    expect(approvalQueue.map((run) => run.runId)).toEqual([waiting.runId]);
    expect(store.updateRun(completed.runId, { status: "running" }).ok).toBe(false);
    expect(store.updateRun(completed.runId, { status: "waiting_approval" }).ok).toBe(false);
    expect(store.updateRun(rejected.runId, { status: "running" }).ok).toBe(false);
    expect(store.updateRun(rejected.runId, { status: "completed" }).ok).toBe(false);
    expect(store.updateRun(failed.runId, { status: "running" }).ok).toBe(false);
    expect(store.updateRun("missing", { status: "running" }).ok).toBe(false);
    expect(running.status).toBe("running");
  });
});

describe("Approval Resume v1", () => {
  it("stops at waiting_approval and persists resume state", async () => {
    const orchestrator = new SwarmOrchestrator();
    const result = await orchestrator.runIntent(intent, approvalWorkflow());
    const state = orchestrator.getRunState(result.runId);

    expect(result.status).toBe("waiting_approval");
    expect(result.approvalRequired).toBe(true);
    expect(result.waitingApprovalNodeId).toBe("002_approval");
    expect(state.ok && state.value.status).toBe("waiting_approval");
    if (state.ok) {
      expect(state.value.resumePoint?.nodeId).toBe("002_approval");
      expect(state.value.completedNodeIds).toEqual(["001_prepare"]);
      expect(state.value.completedNodeIds).not.toContain("003_finalize");
      expect(state.value.contextSnapshot.prepared).toBe(true);
    }
  });

  it("approves, resumes, completes, and does not repeat completed nodes", async () => {
    const orchestrator = new SwarmOrchestrator();
    const result = await orchestrator.runIntent(intent, approvalWorkflow());
    const beforeApprove = orchestrator.getRunState(result.runId);
    const costBefore = beforeApprove.ok ? beforeApprove.value.costSnapshot.actualTotal : 0;
    const auditBefore = beforeApprove.ok ? beforeApprove.value.auditEventIds?.length ?? 0 : 0;

    const approved = orchestrator.approveRun(result.runId);
    expect(approved.ok && approved.value.status).toBe("paused");
    if (approved.ok) {
      expect(approved.value.contextSnapshot["approval.002_approval"]).toBe("approved");
    }

    const resumed = await orchestrator.resumeRun(result.runId);
    expect(resumed.ok && resumed.value.status).toBe("completed");
    if (resumed.ok) {
      expect(resumed.value.completedNodeIds).toEqual(["001_prepare", "002_approval", "003_finalize"]);
      expect(resumed.value.costSnapshot.actualTotal).toBeGreaterThan(costBefore);
      expect(resumed.value.costSnapshot.actualTotal).toBe(0.3);
      expect(resumed.value.auditEventIds?.length ?? 0).toBeGreaterThan(auditBefore);
      expect(resumed.value.contextSnapshot.finalized).toBe(true);
      expect(resumed.value.currentNodeId).toBe("003_finalize");
    }
  });

  it("rejects a waiting approval run and does not execute downstream nodes", async () => {
    const orchestrator = new SwarmOrchestrator();
    const result = await orchestrator.runIntent(intent, approvalWorkflow());
    const rejected = orchestrator.rejectRun(result.runId);
    const resumed = await orchestrator.resumeRun(result.runId);

    expect(rejected.ok && rejected.value.status).toBe("rejected");
    expect(resumed.ok).toBe(false);
    const state = orchestrator.getRunState(result.runId);
    if (state.ok) {
      expect(state.value.completedNodeIds).toEqual(["001_prepare"]);
      expect(state.value.contextSnapshot.finalized).toBeUndefined();
      const events = orchestrator.getRunStore().getAuditEvents(result.runId);
      expect(events.some((event) => event.type === "rejected")).toBe(true);
    }
  });

  it("records failed nodes and stops downstream execution", async () => {
    const orchestrator = new SwarmOrchestrator();
    const result = await orchestrator.runIntent("failure path", failingWorkflow());
    const state = orchestrator.getRunState(result.runId);

    expect(result.status).toBe("failed");
    if (state.ok) {
      expect(state.value.status).toBe("failed");
      expect(state.value.completedNodeIds).toEqual(["001_prepare"]);
      expect(state.value.failedNodeIds).toEqual(["002_fail"]);
      expect(state.value.contextSnapshot.prepared).toBe(true);
      expect(state.value.contextSnapshot.afterFailure).toBeUndefined();
    }
  });

  it("restores context from checkpoint after an interrupted approval pause", async () => {
    const store = new MemoryRunStore();
    const firstOrchestrator = new SwarmOrchestrator({ runStore: store });
    const result = await firstOrchestrator.runIntent(intent, approvalWorkflow());
    const approved = firstOrchestrator.approveRun(result.runId);
    expect(approved.ok).toBe(true);

    const resumedByNewOrchestrator = await new SwarmOrchestrator({ runStore: store }).resumeRun(result.runId);
    expect(resumedByNewOrchestrator.ok && resumedByNewOrchestrator.value.status).toBe("completed");
    if (resumedByNewOrchestrator.ok) {
      expect(resumedByNewOrchestrator.value.contextSnapshot.prepared).toBe(true);
      expect(resumedByNewOrchestrator.value.contextSnapshot.finalized).toBe(true);
      expect(resumedByNewOrchestrator.value.currentNodeId).toBe("003_finalize");
    }
  });

  it("rejects invalid state transitions and unknown runIds safely", async () => {
    const orchestrator = new SwarmOrchestrator();
    const result = await orchestrator.runIntent(intent, approvalWorkflow());
    const resumeWaiting = await orchestrator.resumeRun(result.runId);
    expect(resumeWaiting.ok).toBe(false);
    if (!resumeWaiting.ok) expect(resumeWaiting.error).toBe("invalid_state");

    orchestrator.approveRun(result.runId);
    const rejectPaused = orchestrator.rejectRun(result.runId);
    expect(rejectPaused.ok).toBe(false);
    if (!rejectPaused.ok) expect(rejectPaused.error).toBe("invalid_state");

    const completed = await orchestrator.resumeRun(result.runId);
    expect(completed.ok && completed.value.status).toBe("completed");

    const approveCompleted = orchestrator.approveRun(result.runId);
    expect(approveCompleted.ok).toBe(false);
    if (!approveCompleted.ok) expect(approveCompleted.error).toBe("invalid_state");

    const resumeCompleted = await orchestrator.resumeRun(result.runId);
    expect(resumeCompleted.ok).toBe(false);
    if (!resumeCompleted.ok) expect(resumeCompleted.error).toBe("invalid_state");

    const unknown = orchestrator.getRunState("missing");
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.error).toBe("run_not_found");

    expect(orchestrator.approveRun("missing").ok).toBe(false);
    expect(orchestrator.rejectRun("missing").ok).toBe(false);
    expect((await orchestrator.resumeRun("missing")).ok).toBe(false);
  });

  it("does not resume a paused run without a resume point", async () => {
    const store = new MemoryRunStore();
    const run = store.createRun(createRunInput("paused without checkpoint", approvalWorkflow()));
    expect(store.updateRun(run.runId, { status: "waiting_approval" }).ok).toBe(true);
    expect(store.updateRun(run.runId, { status: "paused" }).ok).toBe(true);

    const resumed = await new SwarmOrchestrator({ runStore: store }).resumeRun(run.runId);
    expect(resumed.ok).toBe(false);
    if (!resumed.ok) {
      expect(resumed.error).toBe("invalid_state");
      expect(resumed.message).toContain("resume point");
    }
  });
});
