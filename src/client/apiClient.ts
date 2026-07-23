/**
 * client/apiClient.ts — 决策中心 API 客户端
 *
 * 封装 /api/decision/* 端点的 fetch 调用。
 * 策略：
 *   - 生产环境：调用真实 API，失败时抛错
 *   - 开发环境（import.meta.env.DEV）：API 失败时 fallback 到 createMock*，保证 UI 可用
 *
 * 数据形状与 decisionTypes.ts / analysisTypes.ts 保持一致。
 */

import { useEffect, useState } from "react";
import {
  createMockReadiness,
  createMockDecisions,
  createMockMetrics,
  createMockAdvices,
  createMockRawData,
  type DecisionReadiness,
  type DecisionItem,
  type DecisionStatus,
  type ProfessionalMetric,
  type ActionAdvice,
  type AdviceStatus,
  type RawDataEntry,
} from "./decisionTypes";
import {
  createMockCollectionHealth,
  createMockDimensionCoverage,
  createMockPipelineStages,
  createMockProvenanceTrace,
  type SourceHealthEntry,
  type DimensionCoverageEntry,
  type PipelineStage,
  type PipelineStageId,
  type ProvenanceTrace,
} from "./analysisTypes";

const API_BASE = "/api/decision";
const USE_MOCK_FALLBACK = import.meta.env.DEV;

/** 通用 fetch 包装：失败时按环境决定 fallback 或抛错 */
async function fetchJson<T>(path: string, mockFactory?: () => T, init?: RequestInit): Promise<T> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    return (await res.json()) as T;
  } catch (err) {
    if (USE_MOCK_FALLBACK && mockFactory) {
      // 开发模式：API 不可用时降级到 mock 数据，保证 UI 可用
      return mockFactory();
    }
    throw err;
  }
}

// ============================================================
// 类型：异步状态
// ============================================================

export type AsyncState<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
};

export function initialAsyncState<T>(): AsyncState<T> {
  return { data: null, loading: true, error: null };
}

export function asyncLoading<T>(): AsyncState<T> {
  return { data: null, loading: true, error: null };
}

export function asyncSuccess<T>(data: T): AsyncState<T> {
  return { data, loading: false, error: null };
}

export function asyncError<T>(error: string): AsyncState<T> {
  return { data: null, loading: false, error };
}

// ============================================================
// React Hook: useAsync — 封装异步数据加载
// ============================================================

/**
 * 封装异步数据加载的 React hook。
 * 用法：const { data, loading, error } = useAsync(() => apiClient.getDecisions(), []);
 * 在 deps 变化时重新加载。
 */
export function useAsync<T>(
  factory: () => Promise<T>,
  deps: unknown[],
): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    setState({ data: null, loading: true, error: null });
    factory()
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({
            data: null,
            loading: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}

// ============================================================
// API 客户端
// ============================================================

export const apiClient = {
  /** 决策就绪度 */
  getReadiness: (): Promise<DecisionReadiness> =>
    fetchJson("/readiness", createMockReadiness),

  /** 决策列表 */
  getDecisions: (): Promise<DecisionItem[]> =>
    fetchJson("/decisions", createMockDecisions),

  /** 更新决策状态 */
  updateDecisionStatus: (id: string, status: DecisionStatus): Promise<DecisionItem> =>
    fetchJson(`/decisions/${id}/status`, undefined, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),

  /** 专业指标 */
  getMetrics: (): Promise<ProfessionalMetric[]> =>
    fetchJson("/metrics", createMockMetrics),

  /** 行动建议 */
  getAdvices: (): Promise<ActionAdvice[]> =>
    fetchJson("/advices", createMockAdvices),

  /** 更新建议状态 */
  updateAdviceStatus: (id: string, status: AdviceStatus): Promise<ActionAdvice> =>
    fetchJson(`/advices/${id}/status`, undefined, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),

  /** 原始数据（证据链下钻用） */
  getRawData: (): Promise<RawDataEntry[]> =>
    fetchJson("/raw-data", createMockRawData),

  /** 采集健康（9 数据源） */
  getCollectionHealth: (): Promise<SourceHealthEntry[]> =>
    fetchJson("/collection-health", createMockCollectionHealth),

  /** 7 维度覆盖 */
  getDimensionCoverage: (): Promise<DimensionCoverageEntry[]> =>
    fetchJson("/dimension-coverage", () =>
      createMockDimensionCoverage(createMockCollectionHealth())
    ),

  /** 7 阶段管道 */
  getPipelineStages: (): Promise<PipelineStage[]> =>
    fetchJson("/pipeline-stages", createMockPipelineStages),

  /** 清洗穿透（可选 stageId 过滤） */
  getProvenance: (stageId?: PipelineStageId): Promise<ProvenanceTrace> =>
    fetchJson(
      stageId ? `/provenance?stageId=${stageId}` : "/provenance",
      () => createMockProvenanceTrace(stageId)
    ),
};
