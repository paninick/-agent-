/**
 * triggers/rules.ts — 触发规则工厂函数
 *
 * 提供常用规则的构造器，方便注册到 TriggerEngine。
 * 规则签名对齐 TriggerRule.evaluate(signal, context): boolean。
 */

import type { TriggerRule } from "../spine/types";

/**
 * 信号载荷匹配规则 — 当 signal.payload[key] === expected 时触发。
 * 用于 event kind 探针。
 */
export function signalPayloadRule(
  id: string,
  name: string,
  key: string,
  expected: unknown
): TriggerRule {
  return {
    id,
    name,
    reason: `payload.${key} === ${String(expected)}`,
    evaluate: (signal) => {
      return signal.payload[key] === expected;
    },
  };
}

/**
 * 阈值穿越规则 — 当 signal.payload[metric] 超过 threshold 时触发。
 * 用于 threshold kind 探针。
 * operator: "gt" | "gte" | "lt" | "lte"（默认 gt）
 */
export function thresholdRule(
  id: string,
  name: string,
  metric: string,
  threshold: number,
  operator: "gt" | "gte" | "lt" | "lte" = "gt"
): TriggerRule {
  return {
    id,
    name,
    reason: `payload.${metric} ${operator} ${threshold}`,
    evaluate: (signal) => {
      const value = Number(signal.payload[metric]);
      if (isNaN(value)) return false;
      return (
        operator === "gte" ? value >= threshold :
        operator === "lte" ? value <= threshold :
        operator === "lt" ? value < threshold :
        value > threshold
      );
    },
  };
}

/**
 * 总是触发规则 — 任何信号都触发蜂群。
 * 用于 schedule kind 探针或调试。
 */
export function alwaysTriggerRule(id: string, name: string): TriggerRule {
  return {
    id,
    name,
    reason: "always trigger (schedule probe)",
    evaluate: () => true,
  };
}
