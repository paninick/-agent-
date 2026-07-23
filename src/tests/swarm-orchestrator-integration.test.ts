/**
 * swarm-orchestrator-integration.test.ts
 *
 * 验证 P0-2：双编排器集成 — SwarmOrchestrator (DAG 审批) 与
 * orchestrateSwarmFn (蜂群执行) 的端到端流程。
 *
 * 测试场景：
 *   1. 启用 swarm：runIntent → approveRun → resumeRun → 蜂群执行 → 结果回流
 *   2. 工作流结构：4 节点 DAG（prepare → approval → swarm → finalize）
 *   3. 结果回流：contextSnapshot.swarmResult 存在且字段正确
 *   4. 向后兼容：未注入 orchestrateSwarmFn 时退化为 3 节点 DAG
 *   5. 触发控制：swarmTrigger.onApprovalApproved=false 禁用蜂群
 *   6. 拒绝路径：rejectRun 不触发蜂群
 *   7. 审计事件：蜂群执行生成 node_completed 事件
 *   8. 跨实例恢复：共享 runStore 时蜂群函数来自恢复实例的配置
 */
import { describe, expect, it } from "vitest";
import {
  MemoryRunStore,
  SwarmOrchestrator,
  compileTaskPlan,
  compileWorkflow,
  SWARM_NODE_ID,
  type OrchestrateSwarmFn,
  type SwarmExecutionResult,
  type SwarmExecutionInput,
  type SwarmTriggerConfig
} from "../runtime";

/** 创建 mock 蜂群执行函数，记录调用并返回固定结果 */
function makeMockSwarmFn(calls: SwarmExecutionInput[]): OrchestrateSwarmFn {
  return (input: SwarmExecutionInput): SwarmExecutionResult => {
    calls.push(input);
    return {
      triggerId: `trig-${input.runId}`,
      taskCount: 10,
      resultCount: 13,
      hasSynthesis: true,
      followUpCount: 2
    };
  };
}

describe("SwarmOrchestrator + orchestrateSwarmFn 集成", () => {
  const intent = "Analyze apparel supply chain risk in Southeast Asia";

  describe("启用 swarm 集成", () => {
    it("runIntent 生成 4 节点 DAG（prepare → approval → swarm → finalize）", async () => {
      const orchestrator = new SwarmOrchestrator({
        orchestrateSwarmFn: makeMockSwarmFn([])
      });
      const result = await orchestrator.runIntent(intent);
      const nodeIds = result.workflow.nodes.map((n) => n.nodeId);

      expect(nodeIds).toEqual(["001_prepare", "002_approval", SWARM_NODE_ID, "003_finalize"]);
      expect(result.workflow.nodes.find((n) => n.nodeId === SWARM_NODE_ID)?.type).toBe("swarm_execution");
    });

    it("runIntent 在审批节点暂停，蜂群节点未执行", async () => {
      const calls: SwarmExecutionInput[] = [];
      const orchestrator = new SwarmOrchestrator({
        orchestrateSwarmFn: makeMockSwarmFn(calls)
      });
      const result = await orchestrator.runIntent(intent);

      expect(result.status).toBe("waiting_approval");
      expect(result.approvalRequired).toBe(true);
      expect(result.waitingApprovalNodeId).toBe("002_approval");
      expect(calls).toHaveLength(0);

      const state = orchestrator.getRunState(result.runId);
      if (state.ok) {
        expect(state.value.completedNodeIds).toEqual(["001_prepare"]);
        expect(state.value.completedNodeIds).not.toContain(SWARM_NODE_ID);
        expect(state.value.contextSnapshot.swarmResult).toBeUndefined();
      }
    });

    it("approveRun → resumeRun 触发蜂群执行并回流结果到 contextSnapshot", async () => {
      const calls: SwarmExecutionInput[] = [];
      const orchestrator = new SwarmOrchestrator({
        orchestrateSwarmFn: makeMockSwarmFn(calls)
      });
      const result = await orchestrator.runIntent(intent);

      const approved = orchestrator.approveRun(result.runId);
      expect(approved.ok && approved.value.status).toBe("paused");

      const resumed = await orchestrator.resumeRun(result.runId);

      expect(calls).toHaveLength(1);
      expect(calls[0].runId).toBe(result.runId);
      expect(calls[0].intent).toBe(intent);

      expect(resumed.ok && resumed.value.status).toBe("completed");
      if (resumed.ok) {
        expect(resumed.value.completedNodeIds).toContain(SWARM_NODE_ID);
        expect(resumed.value.completedNodeIds).toContain("003_finalize");

        const swarmResult = resumed.value.contextSnapshot.swarmResult as SwarmExecutionResult | undefined;
        expect(swarmResult).toBeDefined();
        expect(swarmResult?.triggerId).toBe(`trig-${result.runId}`);
        expect(swarmResult?.taskCount).toBe(10);
        expect(swarmResult?.resultCount).toBe(13);
        expect(swarmResult?.hasSynthesis).toBe(true);
        expect(swarmResult?.followUpCount).toBe(2);

        expect(resumed.value.contextSnapshot["swarm.completed"]).toBe(true);
        expect(resumed.value.contextSnapshot.finalized).toBe(true);
      }
    });

    it("蜂群节点 cost 为 0，总成本仍为 0.3（0.1 + 0.0 + 0.2）", async () => {
      const orchestrator = new SwarmOrchestrator({
        orchestrateSwarmFn: makeMockSwarmFn([])
      });
      const result = await orchestrator.runIntent(intent);
      orchestrator.approveRun(result.runId);
      const resumed = await orchestrator.resumeRun(result.runId);

      if (resumed.ok) {
        expect(resumed.value.costSnapshot.actualTotal).toBe(0.3);
      }
    });

    it("审计事件记录蜂群执行", async () => {
      const orchestrator = new SwarmOrchestrator({
        orchestrateSwarmFn: makeMockSwarmFn([])
      });
      const result = await orchestrator.runIntent(intent);
      orchestrator.approveRun(result.runId);
      await orchestrator.resumeRun(result.runId);

      const events = orchestrator.getRunStore().getAuditEvents(result.runId);
      const swarmEvent = events.find(
        (e) => e.nodeId === SWARM_NODE_ID && e.type === "node_completed"
      );
      expect(swarmEvent).toBeDefined();
      expect(swarmEvent?.message).toContain("Swarm execution completed");
      expect(swarmEvent?.message).toContain("10 tasks");
    });
  });

  describe("向后兼容（未注入 orchestrateSwarmFn）", () => {
    it("compileWorkflow 默认生成 3 节点 DAG（无 swarm 节点）", () => {
      const workflow = compileWorkflow(compileTaskPlan(intent));
      const nodeIds = workflow.nodes.map((n) => n.nodeId);
      expect(nodeIds).toEqual(["001_prepare", "002_approval", "003_finalize"]);
      expect(workflow.nodes.find((n) => n.nodeId === SWARM_NODE_ID)).toBeUndefined();
    });

    it("compileWorkflow 显式 enableSwarm=false 生成 3 节点 DAG", () => {
      const workflow = compileWorkflow(compileTaskPlan(intent), { enableSwarm: false });
      expect(workflow.nodes).toHaveLength(3);
      expect(workflow.nodes.find((n) => n.nodeId === SWARM_NODE_ID)).toBeUndefined();
    });

    it("SwarmOrchestrator 无选项时行为不变（3 节点 DAG，正常审批流程）", async () => {
      const orchestrator = new SwarmOrchestrator();
      const result = await orchestrator.runIntent(intent);

      expect(result.workflow.nodes).toHaveLength(3);
      expect(result.status).toBe("waiting_approval");

      orchestrator.approveRun(result.runId);
      const resumed = await orchestrator.resumeRun(result.runId);

      expect(resumed.ok && resumed.value.status).toBe("completed");
      if (resumed.ok) {
        expect(resumed.value.completedNodeIds).toEqual([
          "001_prepare",
          "002_approval",
          "003_finalize"
        ]);
        expect(resumed.value.contextSnapshot.swarmResult).toBeUndefined();
        expect(resumed.value.contextSnapshot["swarm.completed"]).toBeUndefined();
      }
    });

    it("new SwarmOrchestrator() 无参数构造正常（server/index.ts 兼容）", async () => {
      const orchestrator = new SwarmOrchestrator();
      const result = await orchestrator.runIntent("smoke test");
      expect(result.status).toBe("waiting_approval");
      expect(result.workflow.nodes).toHaveLength(3);
    });
  });

  describe("触发控制", () => {
    it("swarmTrigger.onApprovalApproved=false 禁用蜂群执行", async () => {
      const calls: SwarmExecutionInput[] = [];
      const trigger: SwarmTriggerConfig = { onApprovalApproved: false };
      const orchestrator = new SwarmOrchestrator({
        orchestrateSwarmFn: makeMockSwarmFn(calls),
        swarmTrigger: trigger
      });

      const result = await orchestrator.runIntent(intent);
      expect(result.workflow.nodes.map((n) => n.nodeId)).toContain(SWARM_NODE_ID);

      orchestrator.approveRun(result.runId);
      const resumed = await orchestrator.resumeRun(result.runId);

      expect(calls).toHaveLength(0);
      expect(resumed.ok && resumed.value.status).toBe("completed");
      if (resumed.ok) {
        expect(resumed.value.completedNodeIds).toContain(SWARM_NODE_ID);
        expect(resumed.value.contextSnapshot.swarmResult).toBeUndefined();
        expect(resumed.value.contextSnapshot["swarm.completed"]).toBe(true);
      }
    });

    it("rejectRun 不触发蜂群执行", async () => {
      const calls: SwarmExecutionInput[] = [];
      const orchestrator = new SwarmOrchestrator({
        orchestrateSwarmFn: makeMockSwarmFn(calls)
      });
      const result = await orchestrator.runIntent(intent);

      const rejected = orchestrator.rejectRun(result.runId);
      expect(rejected.ok && rejected.value.status).toBe("rejected");
      expect(calls).toHaveLength(0);

      const resumed = await orchestrator.resumeRun(result.runId);
      expect(resumed.ok).toBe(false);
      expect(calls).toHaveLength(0);
    });

    it("未审批直接 resumeRun 不触发蜂群（waiting_approval 状态拒绝 resume）", async () => {
      const calls: SwarmExecutionInput[] = [];
      const orchestrator = new SwarmOrchestrator({
        orchestrateSwarmFn: makeMockSwarmFn(calls)
      });
      const result = await orchestrator.runIntent(intent);

      const resumed = await orchestrator.resumeRun(result.runId);
      expect(resumed.ok).toBe(false);
      expect(calls).toHaveLength(0);
    });
  });

  describe("跨实例恢复（共享 runStore）", () => {
    it("实例 A 审批 → 实例 B 恢复时蜂群函数来自实例 B 的配置", async () => {
      const callsA: SwarmExecutionInput[] = [];
      const callsB: SwarmExecutionInput[] = [];
      const sharedStore = new MemoryRunStore();

      const orchestratorA = new SwarmOrchestrator({
        runStore: sharedStore,
        orchestrateSwarmFn: makeMockSwarmFn(callsA)
      });
      const result = await orchestratorA.runIntent(intent);
      orchestratorA.approveRun(result.runId);

      const orchestratorB = new SwarmOrchestrator({
        runStore: sharedStore,
        orchestrateSwarmFn: makeMockSwarmFn(callsB)
      });
      const resumed = await orchestratorB.resumeRun(result.runId);

      expect(callsA).toHaveLength(0);
      expect(callsB).toHaveLength(1);
      expect(resumed.ok && resumed.value.status).toBe("completed");
      if (resumed.ok) {
        expect(resumed.value.contextSnapshot.swarmResult).toBeDefined();
      }
    });
  });
});
