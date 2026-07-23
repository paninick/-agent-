/**
 * client/habitat/habitatApi.ts — Habitat API 客户端
 *
 * 封装 /api/habitat/* 端点。设计与 apiClient.ts 保持一致：
 *   - 生产环境：调用真实 API，失败时抛错
 *   - 开发环境（import.meta.env.DEV）：API 失败时 fallback 到 mock，保证 UI 可用
 *
 * 端点契约：
 *   GET    /api/habitat/snapshot
 *        → HabitatSnapshot
 *   POST   /api/habitat/requests/:id/approve
 *        → { ok: true, requestId }
 *   POST   /api/habitat/requests/:id/reject
 *        → { ok: true, requestId }
 *   POST   /api/habitat/requests/:id/auto-authorize
 *        → { ok: true, requestId, autonomyLevel }
 *   PATCH  /api/habitat/goals/:id/autonomy        body: { autonomy }
 *        → { ok: true, goalId, autonomy }
 *   POST   /api/habitat/memories/:id/confirm
 *        → { ok: true, memoryId }
 *
 * 错误模型：
 *   - 网络错误或非 2xx → throw Error(`HTTP ${status} ${statusText}`)
 *   - 开发模式 fallback 仅在 fetch 失败时触发，业务错误仍抛出
 */

import { useEffect, useState } from "react";
import type {
  HabitatSnapshot,
  AutonomyLevel,
  UserBoundaryRequest,
} from "../../domain/agentHabitat";
import { createMockHabitatSnapshot } from "./habitatMock";

// ============================================================
// 常量与配置
// ============================================================

const API_BASE = "/api/habitat";
const USE_MOCK_FALLBACK = import.meta.env.DEV;

/** 请求超时（ms） */
const REQUEST_TIMEOUT_MS = 8000;

// ============================================================
// 类型：API 响应
// ============================================================

export interface ApiResult {
  ok: boolean;
}

export interface RequestActionResult extends ApiResult {
  requestId: string;
  /** 处理后的请求状态（用于本地状态更新） */
  status: "approved" | "rejected" | "auto_authorized";
  /** auto-authorize 时返回的自治等级 */
  autonomyLevel?: AutonomyLevel;
}

export interface GoalAutonomyResult extends ApiResult {
  goalId: string;
  autonomy: AutonomyLevel;
}

export interface MemoryConfirmResult extends ApiResult {
  memoryId: string;
  confirmed: boolean;
}

// ============================================================
// 类型：异步状态（与 apiClient.ts 对齐）
// ============================================================

export type AsyncState<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
};

// ============================================================
// 通用 fetch 包装
// ============================================================

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * fetch 包装：超时 + JSON 解析 + 错误归类。
 * 失败时按环境决定 fallback 或抛错。
 */
async function fetchJson<T>(
  path: string,
  mockFactory: () => T,
  init?: RequestInit,
): Promise<T> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new ApiError(res.status, `HTTP ${res.status} ${res.statusText}`);
    }
    return (await res.json()) as T;
  } catch (err) {
    if (USE_MOCK_FALLBACK) {
      // 开发模式：API 不可用时降级到 mock，保证 UI 可用
      return mockFactory();
    }
    if (err instanceof ApiError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`请求超时（${REQUEST_TIMEOUT_MS}ms）：${path}`);
    }
    throw err;
  }
}

// ============================================================
// Habitat API 客户端
// ============================================================

export const habitatApi = {
  /** 获取当前活动空间快照 */
  getSnapshot: (): Promise<HabitatSnapshot> =>
    fetchJson<HabitatSnapshot>("/snapshot", () => createMockHabitatSnapshot()),

  /** 批准用户请求 */
  approveRequest: (requestId: string): Promise<RequestActionResult> =>
    fetchJson<RequestActionResult>(
      `/requests/${encodeURIComponent(requestId)}/approve`,
      () => ({
        ok: true,
        requestId,
        status: "approved" as const,
      }),
      { method: "POST" },
    ),

  /** 拒绝用户请求 */
  rejectRequest: (requestId: string): Promise<RequestActionResult> =>
    fetchJson<RequestActionResult>(
      `/requests/${encodeURIComponent(requestId)}/reject`,
      () => ({
        ok: true,
        requestId,
        status: "rejected" as const,
      }),
      { method: "POST" },
    ),

  /** 自动授权（提升自治等级） */
  autoAuthorize: (
    requestId: string,
    autonomyLevel: AutonomyLevel = "auto_within_limits",
  ): Promise<RequestActionResult> =>
    fetchJson<RequestActionResult>(
      `/requests/${encodeURIComponent(requestId)}/auto-authorize`,
      () => ({
        ok: true,
        requestId,
        status: "auto_authorized" as const,
        autonomyLevel,
      }),
      {
        method: "POST",
        body: JSON.stringify({ autonomyLevel }),
      },
    ),

  /** 更新目标自治等级 */
  updateGoalAutonomy: (
    goalId: string,
    autonomy: AutonomyLevel,
  ): Promise<GoalAutonomyResult> =>
    fetchJson<GoalAutonomyResult>(
      `/goals/${encodeURIComponent(goalId)}/autonomy`,
      () => ({ ok: true, goalId, autonomy }),
      {
        method: "PATCH",
        body: JSON.stringify({ autonomy }),
      },
    ),

  /** 确认记忆 */
  confirmMemory: (memoryId: string): Promise<MemoryConfirmResult> =>
    fetchJson<MemoryConfirmResult>(
      `/memories/${encodeURIComponent(memoryId)}/confirm`,
      () => ({ ok: true, memoryId, confirmed: true }),
      { method: "POST" },
    ),
};

// ============================================================
// React Hook: useHabitatSnapshot — 加载快照
// ============================================================

/**
 * 加载 Habitat 快照的 hook。
 * deps 变化时重新加载。
 */
export function useHabitatSnapshot(deps: unknown[] = []): AsyncState<HabitatSnapshot> {
  const [state, setState] = useState<AsyncState<HabitatSnapshot>>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    setState({ data: null, loading: true, error: null });
    habitatApi
      .getSnapshot()
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
// 辅助：从 UserBoundaryRequest 推断自治等级（用于 auto-authorize 回填）
// ============================================================

export function extractAutonomyFromRequest(
  req: UserBoundaryRequest,
): AutonomyLevel {
  return req.autonomyOffer?.proposedLevel ?? "auto_within_limits";
}
