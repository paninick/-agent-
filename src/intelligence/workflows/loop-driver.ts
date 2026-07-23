/**
 * workflows/loop-driver.ts — 闭环驱动器
 *
 * 消费 Feedback 产出的 FollowUpTask，驱动下一轮 Swarm 执行。
 * 这是自动化运作的"最后一公里"：Feedback → LoopDriver → 下一轮 Probe/Trigger → Swarm → ...
 *
 * 关键设计：
 *   - MemoryBroker 跨轮存活 — 记忆在轮次间累积
 *   - kind="probe" 的 FollowUp → 注册为新 Probe（下一轮由 Probe 触发）
 *   - kind="task" 的 FollowUp → 转化为新 objective，直接构造 SwarmTrigger 启动 Swarm
 *   - 归因检查 — 每轮结束后对症状做 AttributionEngine 归因
 *   - 终止条件：达到最大轮数 / 无 FollowUp / 归因置信度足够高
 *
 * 优先级：事件驱动 > FollowUp 驱动 > 定时兜底（本文件实现 FollowUp 驱动）
 */

import type {
  FollowUpTask,
  SwarmTrigger,
  RawRecord,
} from "../spine/types";
import type { ReflexPathway } from "../memory/types";
import type { EvidenceEntry, IntelligenceSource } from "../types";
import type { IndustryPack } from "../core/industry-pack";
import type { MemoryStore } from "../memory/store";
import type { MemoryBroker } from "../memory/broker";
import { orchestrateSwarm, type SwarmRunResult } from "../swarm/orchestrator";
import { traceAttribution, type AttributionChain, needsMoreEvidence } from "../analysis/attribution";

/** LoopDriver 配置 */
export interface LoopDriverConfig {
  /** 最大轮数 — 防止无限循环 */
  maxRounds: number;
  /** 归因置信度阈值 — 达到则停止深挖 */
  attributionConfidenceThreshold: number;
}

export const DEFAULT_LOOP_CONFIG: LoopDriverConfig = {
  maxRounds: 5,
  attributionConfidenceThreshold: 0.15,
};

/** 单轮执行结果 */
export interface LoopRoundResult {
  /** 轮次序号（从 1 开始） */
  round: number;
  /** 本轮的 FollowUpTask（驱动下一轮） */
  followUps: FollowUpTask[];
  /** 本轮 Swarm 运行结果 */
  swarmRun: SwarmRunResult;
  /** 本轮归因链（若触发） */
  attribution?: AttributionChain;
  /** 本轮是否提取了新反射 */
  newReflexes?: ReflexPathway[];
}

/** 完整循环结果 */
export interface LoopResult {
  rounds: LoopRoundResult[];
  /** 最终归因链 */
  finalAttribution?: AttributionChain;
  /** 终止原因 */
  stopReason: "max_rounds" | "no_followups" | "attribution_confident" | "no_symptom";
  /** 总轮数 */
  totalRounds: number;
}

/**
 * 闭环驱动器 — 消费 FollowUpTask 驱动下一轮。
 *
 * 使用方式：
 *   const driver = new LoopDriver(config);
 *   const result = await driver.run({
 *     initialTrigger, initialRawRecords, registrySources, memoryStore, broker, pack
 *   });
 *
 * broker 跨轮存活 — 第 N 轮的记忆在第 N+1 轮可见。
 */
export class LoopDriver {
  constructor(private readonly config: LoopDriverConfig = DEFAULT_LOOP_CONFIG) {}

  /**
   * 运行完整循环。
   * 第 1 轮用 initialTrigger + initialRawRecords。
   * 后续轮次由 FollowUpTask 驱动。
   */
  async run(params: {
    initialTrigger: SwarmTrigger;
    initialRawRecords: RawRecord[];
    registrySources: IntelligenceSource[];
    memoryStore: MemoryStore;
    broker: MemoryBroker;
    pack?: IndustryPack;
    /** 注入 now 以保证测试可复现 */
    now?: Date;
    /** 初始症状（用于归因检查）。若不提供，从第一轮 findings 信号推断。 */
    initialSymptom?: string;
  }): Promise<LoopResult> {
    const {
      initialTrigger,
      initialRawRecords,
      registrySources,
      memoryStore,
      broker,
      pack,
      now = new Date(),
      initialSymptom,
    } = params;

    const rounds: LoopRoundResult[] = [];
    let currentTrigger = initialTrigger;
    let currentRawRecords = initialRawRecords;
    let currentSymptom = initialSymptom;
    let stopReason: LoopResult["stopReason"] = "max_rounds";

    for (let round = 1; round <= this.config.maxRounds; round++) {
      // 运行本轮 Swarm
      const swarmRun = await orchestrateSwarm(currentTrigger, {
        registrySources,
        rawRecords: currentRawRecords,
        ledger: [],
        memoryStore,
        broker,
        now,
      });

      // 收集本轮 FollowUp
      const followUps = swarmRun.followUps ?? [];

      // 归因检查 — 若有症状，做归因分析
      let attribution: AttributionChain | undefined;
      if (!currentSymptom && swarmRun.synthesis) {
        // 从 synthesis 标题推断症状
        currentSymptom = swarmRun.synthesis.title;
      }
      if (currentSymptom) {
        const associations = broker.listAssociations();
        attribution = traceAttribution(currentSymptom, associations) ?? undefined;
      }

      // 收集新反射
      const newReflexes = swarmRun.reflexes;

      rounds.push({
        round,
        followUps,
        swarmRun,
        attribution,
        newReflexes: newReflexes?.length ? newReflexes : undefined,
      });

      // 终止条件 1：归因置信度足够高
      if (attribution && !needsMoreEvidence(attribution)) {
        stopReason = "attribution_confident";
        break;
      }

      // 终止条件 2：无 FollowUp
      if (followUps.length === 0) {
        stopReason = "no_followups";
        break;
      }

      // 终止条件 3：达到最大轮数
      if (round >= this.config.maxRounds) {
        stopReason = "max_rounds";
        break;
      }

      // 准备下一轮 — 从 FollowUp 中选一个 task 类型作为下一轮的 trigger
      const nextFollowUp = followUps.find((fu) => fu.kind === "task") ?? followUps[0];
      if (nextFollowUp) {
        currentTrigger = {
          id: `trig-loop-${round + 1}`,
          ruleId: `loop-driver`,
          signalId: `sig-loop-${round + 1}`,
          firedAt: now.toISOString(),
          objective: nextFollowUp.objective,
          pack,
        };
        // 下一轮的 rawRecords — 在生产环境中由 adapter 采集
        // 这里沿用上一轮的（demo/测试场景）
        currentRawRecords = initialRawRecords;
      }

      // 更新症状为下一轮的 objective（追踪因果链）
      if (nextFollowUp) {
        currentSymptom = nextFollowUp.objective;
      }
    }

    // 取最后一轮的归因作为最终归因
    const finalAttribution = rounds[rounds.length - 1]?.attribution;

    return {
      rounds,
      finalAttribution,
      stopReason,
      totalRounds: rounds.length,
    };
  }
}
