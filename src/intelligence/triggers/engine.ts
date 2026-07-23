/**
 * triggers/engine.ts — 触发引擎
 *
 * 持有 TriggerRule[]，对每个传入的 ProbeSignal 依次评估规则。
 * 第一个命中的规则产生 SwarmTrigger；无命中返回 null。
 */

import type {
  ProbeSignal,
  TriggerRule,
  SwarmTrigger,
  TriggerContext,
} from "../spine/types";
import type { IndustryPack as Pack } from "../core/industry-pack";

/** 触发引擎配置 */
export interface TriggerEngineOptions {
  /** 触发时携带的行业包（可选） */
  pack?: Pack;
  /** 注入 now 以保证测试可复现 */
  now?: Date;
}

let triggerCounter = 0;

function nextTriggerId(): string {
  triggerCounter += 1;
  return `swarm-trigger-${triggerCounter}`;
}

export class TriggerEngine {
  private readonly rules: TriggerRule[] = [];
  private readonly pack?: Pack;
  private readonly now?: Date;

  constructor(options: TriggerEngineOptions = {}) {
    this.pack = options.pack;
    this.now = options.now;
  }

  /** 注册触发规则 */
  addRule(rule: TriggerRule): void {
    this.rules.push(rule);
  }

  /** 批量注册 */
  addRules(rules: TriggerRule[]): void {
    for (const rule of rules) this.addRule(rule);
  }

  /** 列出所有规则 */
  listRules(): TriggerRule[] {
    return [...this.rules];
  }

  /**
   * 评估信号 — 依次检查规则，第一个命中即产生 SwarmTrigger。
   * @param signal 探针信号
   * @param context 触发上下文（ledger 等）
   * @param objective 蜂群目标描述（默认从信号推断）
   * @returns SwarmTrigger 或 null（无规则命中）
   */
  evaluate(
    signal: ProbeSignal,
    context: TriggerContext = { ledger: [] },
    objective?: string
  ): SwarmTrigger | null {
    for (const rule of this.rules) {
      if (rule.evaluate(signal, context)) {
        const firedAt = (this.now ?? new Date()).toISOString();
        return {
          id: nextTriggerId(),
          ruleId: rule.id,
          signalId: signal.id,
          firedAt,
          objective: objective ?? `Investigate signal from probe ${signal.probeId} (${rule.reason})`,
          pack: this.pack,
        };
      }
    }
    return null;
  }
}
