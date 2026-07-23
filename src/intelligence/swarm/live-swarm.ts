/**
 * swarm/live-swarm.ts - 实时蜂群运行器
 *
 * 把采集桥（live-collector）和蜂群编排器（orchestrator）串联：
 *   1. executeScout -> 得到 candidateSourceIds（匹配数据源）
 *   2. collectFromSources -> 用真实 fetch 采集 rawRecords
 *   3. orchestrateSwarm -> 用精简 workflow（跳过 scout）跑 5 角色
 *
 * 与直接调 orchestrateSwarm 的区别：
 *   - 直接调：rawRecords 需调用方手工构造（fixture 模式）
 *   - 调本模块：自动从 officialApis 采集真实数据（live 模式）
 *
 * 约束：API key 从 config 传入，不从模块内读 env。缺 key 的源 graceful skip。
 */

import type { SwarmTrigger, SwarmWorkflow } from "../spine/types";
import type { EvidenceEntry, IntelligenceSource } from "../types";
import type { ReconciliationResult, Anomaly } from "../reconciliation/types";
import type { MemoryStore } from "../memory/store";
import type { MemoryBroker } from "../memory/broker";
import type { CostEngine } from "../../services/cost-engine";
import { executeScout } from "./agents/scout";
import { orchestrateSwarm, type SwarmRunResult, type OrchestratorContext } from "./orchestrator";
import { collectFromSources, type LiveCollectorConfig, type LiveCollectResult } from "../collection/live-collector";

/** 跳过 scout 的精简 workflow（采集已在 live 阶段完成），10→9 角色 */
const LIVE_WORKFLOW: SwarmWorkflow = {
  id: "live-collected-pipeline",
  name: "Live Collected Pipeline (9 agents)",
  steps: [
    "collector", "data_janitor",
    "verifier", "analyst", "devils_advocate",
    "adjudicator", "reconciliation_scorer", "synthesizer", "memory",
  ],
  description:
    "Skip scout (already done in live-collector). 3-phase pipeline: " +
    "Phase 1: Collector → Data Janitor. " +
    "Phase 2: Verifier → Analyst → Devil's Advocate. " +
    "Phase 3: Adjudicator → Reconciliation Scorer → Synthesizer → Memory.",
};

/** live-swarm 运行配置 */
export interface LiveSwarmConfig {
  /** 来源注册表 */
  registrySources: IntelligenceSource[];
  /** 触发器（含 objective + 可选 pack） */
  trigger: SwarmTrigger;
  /** 记忆存储（Memory agent 写入） */
  memoryStore: MemoryStore;
  /** 可选 MemoryBroker */
  broker?: MemoryBroker;
  /** API keys（从 process.env 传入，不在此模块读 env） */
  apiKeys?: {
    fredApiKey?: string;
    censusApiKey?: string;
    openSupplyHubApiKey?: string;
    comtradeApiKey?: string;
  };
  /** fetch 实现（测试用 mock） */
  fetchImpl?: typeof fetch;
  /** 注入 now 以保证测试可复现 */
  now?: Date;
  /** 证据账本（供 cross-source / historical 门参考） */
  ledger?: EvidenceEntry[];
  /** 对账结果（传递给 analyst） */
  reconciliations?: ReconciliationResult[];
  /** 异常列表（传递给 analyst） */
  anomalies?: Anomaly[];
  /** 自定义 workflow（不传则用 LIVE_WORKFLOW 跳过 scout） */
  workflow?: SwarmWorkflow;
  /** 可选成本引擎 - 注入后传递给 orchestrator 记录每步成本 */
  costEngine?: CostEngine;
  /**
   * 可选步骤完成回调（流式模式）- 传递给 orchestrator，
   * 每步完成后回调，SSE 端点用此逐步推送进度。
   */
  onStepComplete?: OrchestratorContext["onStepComplete"];
}

/** live-swarm 运行结果 */
export interface LiveSwarmResult {
  /** Scout 匹配结果 */
  candidateSourceIds: string[];
  /** 采集日志 */
  collectionLog: LiveCollectResult["collectionLog"];
  /** 采集到的 RawRecord 数 */
  rawRecordCount: number;
  /** 蜂群运行结果 */
  swarmRun: SwarmRunResult;
}

/**
 * 运行实时蜂群：
 *   1. Scout 匹配数据源
 *   2. 从匹配到的源采集真实数据
 *   3. 用精简 workflow 跑蜂群管道
 *
 * 如果采集到 0 条 rawRecords，蜂群会正常跑但 collector 会 failed（no evidence）。
 * 调用方应检查 collectionLog 判断采集状态。
 */
export async function runLiveSwarm(config: LiveSwarmConfig): Promise<LiveSwarmResult> {
  const { registrySources, trigger, memoryStore, broker, now } = config;

  // === 1. Scout: 匹配数据源 ===
  // 构造一个临时 task 给 executeScout
  const scoutTask = {
    id: `task-scout-live-${Date.now()}`,
    triggerId: trigger.id,
    role: "scout" as const,
    objective: trigger.objective,
    status: "running" as const,
    inputs: {} as Record<string, unknown>,
    createdAt: (now ?? new Date()).toISOString(),
  };
  const scoutResult = executeScout({ task: scoutTask, registrySources, broker });
  const candidateSourceIds = scoutResult.candidateSourceIds ?? [];

  // === 2. 采集: 从匹配到的源获取真实数据 ===
  const collectorConfig: LiveCollectorConfig = {
    ...config.apiKeys,
    fetchImpl: config.fetchImpl,
    now,
  };
  const collectResult = await collectFromSources(candidateSourceIds, registrySources, collectorConfig);

  // === 3. 蜂群: 用精简 workflow 跑管道（跳过 scout） ===
  const workflow = config.workflow ?? LIVE_WORKFLOW;
  const orchestratorContext: OrchestratorContext = {
    registrySources,
    rawRecords: collectResult.rawRecords,
    ledger: config.ledger ?? [],
    memoryStore,
    broker,
    now,
    workflow,
    reconciliations: config.reconciliations,
    anomalies: config.anomalies,
    costEngine: config.costEngine,
    onStepComplete: config.onStepComplete,
  };

  const swarmRun = await orchestrateSwarm(trigger, orchestratorContext);

  return {
    candidateSourceIds,
    collectionLog: collectResult.collectionLog,
    rawRecordCount: collectResult.rawRecords.length,
    swarmRun,
  };
}

/** 精简 workflow 导出，供调用方自定义时参考 */
export { LIVE_WORKFLOW };
