/**
 * domain/common.ts - 跨模块共用基础类型
 *
 * 从 NP3 (agent-os-2) 提炼的通用结果/错误/注册表基类型。
 * 与 NP2 现有的 runtime/types.ts RunStoreResult<T> 独立共存——
 * 后者用 { value } + 字符串联合 error，此处用 { data } + 结构化 AppError，
 * 适用于需要 recoverable 标记和 fallback 提示的新服务层。
 */

export interface AppError {
  code: string;
  message: string;
  source: string;
  recoverable: boolean;
  fallback?: string;
}

export interface ExecutionResult<T> {
  ok: boolean;
  data?: T;
  error?: AppError;
}

export interface RegistryItem {
  id: string;
  enabled: boolean;
}

export function createAppError(
  code: string,
  message: string,
  source: string,
  recoverable: boolean,
  fallback?: string,
): AppError {
  return { code, message, source, recoverable, fallback };
}
