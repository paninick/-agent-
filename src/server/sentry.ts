/**
 * server/sentry.ts — #7 APM (Sentry) 集成
 *
 * 务实方案：
 *   - SENTRY_DSN 未设置时不启用（开发模式友好）
 *   - initSentry() 初始化 SDK
 *   - attachSentryHandlers(app) 挂载请求处理器 + 错误处理器
 *   - 错误处理器必须在所有路由之后挂载
 *
 * 环境变量：
 *   - SENTRY_DSN: Sentry 项目 DSN（启用 APM 的必需项）
 *   - SENTRY_ENVIRONMENT: 环境名（默认 "production"）
 *   - SENTRY_TRACES_SAMPLE_RATE: 性能采样率（默认 0.1）
 */

import type { Express } from "express";
import * as Sentry from "@sentry/node";
import { expressIntegration } from "@sentry/node";

export interface SentryConfig {
  enabled: boolean;
  dsn: string;
  environment: string;
  tracesSampleRate: number;
}

/** 从环境变量读取 Sentry 配置 */
export function readSentryConfig(): SentryConfig {
  const dsn = process.env.SENTRY_DSN ?? "";
  return {
    enabled: Boolean(dsn),
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? "production",
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0.1"),
  };
}

/** 初始化 Sentry SDK — DSN 未设置时跳过 */
export function initSentry(config: SentryConfig = readSentryConfig()): boolean {
  if (!config.enabled) {
    console.log("[sentry] 未启用（SENTRY_DSN 未设置）");
    return false;
  }
  Sentry.init({
    dsn: config.dsn,
    environment: config.environment,
    tracesSampleRate: config.tracesSampleRate,
    integrations: [expressIntegration()],
  });
  console.log(`[sentry] 已启用 APM（环境: ${config.environment}, 采样率: ${config.tracesSampleRate}）`);
  return true;
}

/**
 * 挂载 Sentry 请求处理器 — v10 通过 expressIntegration 自动处理，
 * 此函数保留为 no-op 以兼容调用点。
 */
export function attachSentryRequestHandler(_app: Express, config: SentryConfig = readSentryConfig()): void {
  if (!config.enabled) return;
  // v10: request handler 由 expressIntegration 自动注入，无需手动挂载
}

/**
 * 挂载 Sentry 错误处理器 — 必须在所有路由之后调用。
 * 未启用时为 no-op。
 */
export function attachSentryErrorHandler(app: Express, config: SentryConfig = readSentryConfig()): void {
  if (!config.enabled) return;
  Sentry.setupExpressErrorHandler(app);
}

/** 捕获异常到 Sentry（未启用时为 no-op） */
export function captureException(error: unknown): void {
  Sentry.captureException(error);
}
