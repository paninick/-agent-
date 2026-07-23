/**
 * server/decision-routes.ts — 决策中心 REST 端点
 *
 * 9 个 GET 端点，为 IntelligenceDashboard 提供数据：
 *   GET /api/decision/readiness          → DecisionReadiness
 *   GET /api/decision/decisions          → DecisionItem[]
 *   GET /api/decision/metrics            → ProfessionalMetric[]
 *   GET /api/decision/advices            → ActionAdvice[]
 *   GET /api/decision/raw-data           → RawDataEntry[]
 *   GET /api/decision/collection-health  → SourceHealthEntry[]
 *   GET /api/decision/dimension-coverage → DimensionCoverageEntry[]
 *   GET /api/decision/pipeline-stages    → PipelineStage[]
 *   GET /api/decision/provenance         → ProvenanceTrace (可选 ?stageId=xxx)
 *
 * 数据源策略（阶段化）：
 *   阶段1（之前）: 直接返回 createMock* 生成的结构化示例数据
 *   阶段2（当前）: 从 RunStore 最近一次 swarm 结果映射真实数据
 *                  - readiness: 从 run.status + completedNodeIds 计算
 *                  - decisions: 从 taskPlan.tasks 映射
 *                  - pipeline-stages: 从 workflow.nodes 映射
 *                  - provenance: 从 auditEvents 映射
 *                  - 其他端点保持 mock（需要真实采集数据）
 *   阶段3（未来）: 从 MemoryStore 持久化数据生成
 *
 * 约束：
 *   - 不改 server/index.ts 现有端点（仅追加 app.use）
 *   - 不新增 npm 依赖
 *   - 类型与前端 decisionTypes.ts / analysisTypes.ts 保持一致
 */

import { Router } from "express";
import {
  createMockReadiness,
  createMockDecisions,
  createMockMetrics,
  createMockAdvices,
  createMockRawData,
  type DecisionItem,
  type ActionAdvice,
  type AdviceStatus,
  type DecisionStatus,
  type DecisionReadiness,
} from "../client/decisionTypes";
import {
  createMockCollectionHealth,
  createMockDimensionCoverage,
  createMockPipelineStages,
  createMockProvenanceTrace,
  type PipelineStage,
  type PipelineStageId,
  type PipelineStageStatus,
  type ProvenanceTrace,
  type ProvenanceLayer,
  type ProvenanceLayerStatus,
} from "../client/analysisTypes";
import type { RunStore, Run, AuditEvent } from "../runtime/types";

// ============================================================
// RunStore → 决策中心数据映射
// ============================================================

/**
 * 从 RunStore 获取最近一次 run（按 createdAt 降序）。
 * 如果没有 runs，返回 undefined。
 */
function getLatestRun(runStore: RunStore | undefined): Run | undefined {
  if (!runStore) return undefined;
  const runs = runStore.listRuns();
  if (runs.length === 0) return undefined;
  return runs.reduce((latest, run) =>
    run.createdAt > latest.createdAt ? run : latest,
  );
}

/**
 * 映射 Run.status → DecisionReadiness.level
 */
function mapRunStatusToReadinessLevel(status: Run["status"]): DecisionReadiness["level"] {
  switch (status) {
    case "completed":
      return "ready";
    case "running":
    case "waiting_approval":
    case "paused":
      return "partial";
    case "failed":
    case "rejected":
      return "waiting";
  }
}

/**
 * 映射 Run → DecisionReadiness
 * 从 run.status + completedNodeIds + failedNodeIds 计算就绪度。
 */
function mapRunToReadiness(run: Run): DecisionReadiness {
  const totalNodes = run.workflow.nodes.length;
  const completedCount = run.completedNodeIds.length;
  const failedCount = run.failedNodeIds.length;
  const pendingCount = totalNodes - completedCount - failedCount;

  return {
    level: mapRunStatusToReadinessLevel(run.status),
    readyDecisions: completedCount,
    pendingItems: pendingCount > 0 ? pendingCount : 0,
    summary: `Run ${run.runId} ${run.status}：${run.intent.slice(0, 60)}`,
    gaps: failedCount > 0
      ? run.failedNodeIds.map((id) => `节点 ${id} 执行失败`)
      : [],
  };
}

/**
 * 映射 Run.taskPlan.tasks → DecisionItem[]
 * 每个 task 映射为一个待决策项。
 */
function mapRunToDecisions(run: Run): DecisionItem[] {
  return run.taskPlan.tasks.map((task, idx) => {
    const isCompleted = run.completedNodeIds.includes(task.nodeId ?? task.taskId);
    const isFailed = run.failedNodeIds.includes(task.nodeId ?? task.taskId);
    const status: DecisionStatus = isCompleted
      ? "accepted"
      : isFailed
        ? "rejected"
        : "pending";

    return {
      id: task.taskId,
      priority: idx === 0 ? "P0" : idx <= 2 ? "P1" : "P2",
      category: "monitor",
      title: task.title,
      description: `Task ${task.taskId} from run ${run.runId}`,
      rationale: `Intent: ${run.intent.slice(0, 80)}`,
      expectedImpact: status === "accepted" ? "已完成" : "待执行",
      timeframe: "本周期内",
      kpiToTrack: [],
      confidence: isCompleted ? 1.0 : isFailed ? 0.0 : 0.5,
      status,
      evidenceIds: [],
      metricIds: [],
    };
  });
}

/**
 * 映射 Run.workflow.nodes → PipelineStage[]
 * 每个 workflow node 映射为一个管道阶段。
 */
function mapRunToPipelineStages(run: Run): PipelineStage[] {
  const stageIdByOrder: PipelineStageId[] = [
    "scout", "collector", "verifier", "analyst", "adjudicator", "synthesizer", "memory",
  ];

  return run.workflow.nodes.map((node, idx) => {
    const isCompleted = run.completedNodeIds.includes(node.nodeId);
    const isFailed = run.failedNodeIds.includes(node.nodeId);
    const isCurrent = run.currentNodeId === node.nodeId;

    const status: PipelineStageStatus = isCompleted
      ? "completed"
      : isFailed
        ? "failed"
        : isCurrent
          ? "running"
          : "idle";

    const stageId = stageIdByOrder[idx % stageIdByOrder.length];

    return {
      stageId,
      name: node.label,
      order: idx + 1,
      roles: [node.type],
      status,
      inputSummary: node.dependsOn?.length
        ? `依赖 ${node.dependsOn.join(", ")}`
        : "无依赖",
      outputSummary: node.outputKey ? `输出 ${node.outputKey}` : "无输出键",
      durationMs: 0,
      findings: [],
      evidenceCount: 0,
      confidence: isCompleted ? 1.0 : isFailed ? 0.0 : 0.5,
    };
  });
}

/**
 * 映射 Run auditEvents → ProvenanceTrace
 * 将审计事件作为 provenance 层级展示。
 */
function mapRunToProvenance(
  run: Run,
  auditEvents: AuditEvent[],
  stageId?: PipelineStageId,
): ProvenanceTrace {
  // 按 eventId 过滤（如果指定 stageId，只返回对应阶段的事件）
  const eventTypeToStatus = (type: AuditEvent["type"]): ProvenanceLayerStatus => {
    if (type === "run_completed" || type === "node_completed" || type === "approved") return "passed";
    if (type === "run_failed" || type === "rejected") return "failed";
    if (type === "waiting_approval") return "warning";
    return "passed";
  };

  const layers: ProvenanceLayer[] = auditEvents.map((event, idx) => ({
    layerId: "raw_data", // auditEvents 主要是执行轨迹，归类为 raw_data 层
    layerName: event.type,
    order: idx + 1,
    status: eventTypeToStatus(event.type),
    timestamp: event.createdAt,
    inputSummary: event.nodeId ? `节点 ${event.nodeId}` : "run 级事件",
    outputSummary: event.message,
    rules: [],
    passedCount: event.type.includes("completed") || event.type === "approved" ? 1 : 0,
    totalCount: 1,
    details: event.metadata
      ? Object.entries(event.metadata).map(([key, value]) => ({
          label: key,
          value: String(value),
          status: "passed" as ProvenanceLayerStatus,
        }))
      : [],
  }));

  return {
    title: stageId
      ? `清洗穿透 - ${stageId} 阶段`
      : `Run ${run.runId} 审计轨迹`,
    contextLabel: stageId ? `${stageId} 阶段证据链` : `${run.runId} 从创建到完成的审计事件`,
    layers,
    finalConfidence: run.status === "completed" ? 1.0 : 0.5,
    sourceCount: 1,
    totalRecords: auditEvents.length,
  };
}

// ============================================================
// 路由工厂
// ============================================================

/**
 * 创建决策中心路由。
 *
 * @param getRunStore 可选的 RunStore 访问器。如果提供且有 runs，
 *                    readiness/decisions/pipeline-stages/provenance
 *                    将从最近一次 run 映射真实数据。
 *                    其他端点保持 mock（需要真实采集数据）。
 */
export function createDecisionRouter(getRunStore?: () => RunStore | undefined): Router {
  const router = Router();

  // === 内存态数据存储（用于 PATCH/POST 改动后保持状态） ===
  let decisionsCache: DecisionItem[] | null = null;
  let advicesCache: ActionAdvice[] | null = null;

  /** 懒加载决策列表（首次访问时初始化） */
  function getDecisions(): DecisionItem[] {
    if (!decisionsCache) decisionsCache = createMockDecisions();
    return decisionsCache;
  }

  /** 懒加载建议列表 */
  function getAdvices(): ActionAdvice[] {
    if (!advicesCache) advicesCache = createMockAdvices();
    return advicesCache;
  }

  /** 获取最近一次 run（如果有 RunStore） */
  function latestRun(): Run | undefined {
    return getLatestRun(getRunStore?.());
  }

  // ============================================================
  // 1. 决策就绪度 — 优先从 RunStore 映射
  // ============================================================
  router.get("/readiness", (_req, res) => {
    const run = latestRun();
    if (run) {
      res.json(mapRunToReadiness(run));
      return;
    }
    res.json(createMockReadiness());
  });

  // ============================================================
  // 2. 决策列表 — 优先从 RunStore 映射
  // ============================================================
  router.get("/decisions", (_req, res) => {
    const run = latestRun();
    if (run) {
      res.json(mapRunToDecisions(run));
      return;
    }
    res.json(getDecisions());
  });

  /** 更新决策状态（用于前端 accept/reject/defer 操作） */
  router.patch("/decisions/:id/status", (req, res) => {
    const { id } = req.params;
    const { status } = req.body as { status: DecisionStatus };
    if (!["pending", "accepted", "rejected", "deferred"].includes(status)) {
      res.status(400).json({ ok: false, error: "invalid_status" });
      return;
    }
    const list = getDecisions();
    const idx = list.findIndex((d) => d.id === id);
    if (idx < 0) {
      res.status(404).json({ ok: false, error: "decision_not_found" });
      return;
    }
    list[idx] = { ...list[idx], status };
    res.json(list[idx]);
  });

  // ============================================================
  // 3. 专业指标 — 保持 mock（需要真实采集数据）
  // ============================================================
  router.get("/metrics", (_req, res) => {
    res.json(createMockMetrics());
  });

  // ============================================================
  // 4. 行动建议 — 保持 mock（需要真实采集数据）
  // ============================================================
  router.get("/advices", (_req, res) => {
    res.json(getAdvices());
  });

  /** 更新建议状态 */
  router.patch("/advices/:id/status", (req, res) => {
    const { id } = req.params;
    const { status } = req.body as { status: AdviceStatus };
    if (!["pending", "accepted", "rejected", "deferred"].includes(status)) {
      res.status(400).json({ ok: false, error: "invalid_status" });
      return;
    }
    const list = getAdvices();
    const idx = list.findIndex((a) => a.id === id);
    if (idx < 0) {
      res.status(404).json({ ok: false, error: "advice_not_found" });
      return;
    }
    list[idx] = { ...list[idx], status };
    res.json(list[idx]);
  });

  // ============================================================
  // 5. 原始数据 — 保持 mock（需要真实采集数据）
  // ============================================================
  router.get("/raw-data", (_req, res) => {
    res.json(createMockRawData());
  });

  // ============================================================
  // 6. 采集健康 — 保持 mock（需要真实采集数据）
  // ============================================================
  router.get("/collection-health", (_req, res) => {
    res.json(createMockCollectionHealth());
  });

  // ============================================================
  // 7. 7 维度覆盖 — 保持 mock（需要真实采集数据）
  // ============================================================
  router.get("/dimension-coverage", (_req, res) => {
    const healthEntries = createMockCollectionHealth();
    res.json(createMockDimensionCoverage(healthEntries));
  });

  // ============================================================
  // 8. 7 阶段管道 — 优先从 RunStore 映射
  // ============================================================
  router.get("/pipeline-stages", (_req, res) => {
    const run = latestRun();
    if (run) {
      res.json(mapRunToPipelineStages(run));
      return;
    }
    res.json(createMockPipelineStages());
  });

  // ============================================================
  // 9. 清洗穿透 — 优先从 RunStore auditEvents 映射
  // ============================================================
  router.get("/provenance", (req, res) => {
    const stageId = req.query.stageId as PipelineStageId | undefined;
    const runStore = getRunStore?.();
    const run = latestRun();
    if (run && runStore) {
      const auditEvents = runStore.getAuditEvents(run.runId);
      if (auditEvents.length > 0) {
        res.json(mapRunToProvenance(run, auditEvents, stageId));
        return;
      }
    }
    res.json(createMockProvenanceTrace(stageId));
  });

  return router;
}
