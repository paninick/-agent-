/**
 * probes/runner.ts — 探针执行器
 *
 * runProbe(probe, context) 执行探针并产生 ProbeSignal。
 *
 * 三种 ProbeKind 的最小实现：
 *   - schedule: 总是产生信号（payload 含 probe.params）
 *   - event:    当 context.event 存在时产生信号
 *   - threshold: 当 payload 中的 metric 值超过阈值时产生信号
 *
 * v1 不实际调用外部 API（遵守"不付费/无额度则提醒"约束）。
 * payload 由调用方通过 context 注入（demo 用 fixture）。
 */

import type { Probe, ProbeRun, ProbeSignal } from "../spine/types";

export interface ProbeRunContext {
  /** 注入的 payload 数据（模拟外部数据源返回） */
  payload?: Record<string, unknown>;
  /** 注入 now 以保证测试可复现 */
  now?: Date;
}

/** 生成稳定 ID（基于 probeId + timestamp） */
function makeId(prefix: string, probeId: string, now: Date): string {
  const ts = now.getTime().toString(36);
  return `${prefix}-${probeId}-${ts}`;
}

/**
 * 执行探针，返回 ProbeRun（含 signalId）。
 * 若探针未启用，返回 status="skipped"。
 * 若 threshold/event 条件不满足，返回 status="completed" 但无 signalId。
 */
export async function runProbe(
  probe: Probe,
  context: ProbeRunContext = {}
): Promise<ProbeRun> {
  const now = context.now ?? new Date();
  const startedAt = now.toISOString();

  if (!probe.enabled) {
    return {
      id: makeId("run", probe.id, now),
      probeId: probe.id,
      startedAt,
      endedAt: startedAt,
      status: "skipped",
    };
  }

  const payload = context.payload ?? {};
  let shouldEmit = false;
  let signalPayload: Record<string, unknown> = {};

  switch (probe.kind) {
    case "schedule":
      // schedule 探针总是产生信号
      shouldEmit = true;
      signalPayload = { ...probe.params, ...payload };
      break;

    case "event":
      // event 探针：payload 中有 event 字段才触发
      shouldEmit = payload.event !== undefined;
      signalPayload = payload;
      break;

    case "threshold": {
      // threshold 探针：payload 中 metric 值超过阈值才触发
      const metric = (probe.params.metric as string) ?? "value";
      const threshold = (probe.params.threshold as number) ?? 0;
      const operator = (probe.params.operator as string) ?? "gt";
      const value = Number(payload[metric]);
      if (!isNaN(value)) {
        shouldEmit =
          operator === "gte" ? value >= threshold :
          operator === "lte" ? value <= threshold :
          operator === "lt" ? value < threshold :
          value > threshold; // default: gt
        signalPayload = { metric, value, threshold, operator, ...payload };
      }
      break;
    }
  }

  if (!shouldEmit) {
    return {
      id: makeId("run", probe.id, now),
      probeId: probe.id,
      startedAt,
      endedAt: now.toISOString(),
      status: "completed",
    };
  }

  // 产生信号
  const signal: ProbeSignal = {
    id: makeId("sig", probe.id, now),
    probeId: probe.id,
    runId: makeId("run", probe.id, now),
    emittedAt: now.toISOString(),
    payload: signalPayload,
  };

  return {
    id: signal.runId,
    probeId: probe.id,
    startedAt,
    endedAt: now.toISOString(),
    status: "completed",
    signalId: signal.id,
  };
}

/**
 * 从 ProbeRun 的 signalId 构造完整的 ProbeSignal 对象。
 * runProbe 返回的 run 只含 signalId；此 helper 补全信号载荷。
 */
export function buildSignal(
  probe: Probe,
  run: ProbeRun,
  payload: Record<string, unknown>,
  now: Date = new Date()
): ProbeSignal {
  return {
    id: run.signalId ?? makeId("sig", probe.id, now),
    probeId: probe.id,
    runId: run.id,
    emittedAt: run.endedAt ?? run.startedAt,
    payload,
  };
}
