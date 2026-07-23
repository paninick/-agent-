/**
 * server/logger.ts — #8 结构化日志 (pino)
 *
 * 务实方案：
 *   - 导出 logger 实例（pino），统一 JSON 格式输出
 *   - 导出 httpLogger 中间件（pino-http），自动记录每个请求
 *   - LOG_LEVEL 环境变量控制日志级别（默认 info）
 *   - /api/health 路径自动过滤（避免日志噪音）
 *
 * 使用方式：
 *   import { logger } from "./logger";
 *   logger.info({ event: "server_started", port }, "Server started");
 *
 *   import { httpLogger } from "./logger";
 *   app.use(httpLogger);
 */

import pino from "pino";
import pinoHttp from "pino-http";

/** 从环境变量读取日志级别 */
function getLogLevel(): string {
  return process.env.LOG_LEVEL ?? "info";
}

/** 主 logger 实例 — 全局共享 */
export const logger = pino({
  level: getLogLevel(),
});

/** HTTP 请求日志中间件 — 自动记录每个请求的方法/URL/状态码/耗时 */
export const httpLogger = pinoHttp({
  logger,
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },
  autoLogging: {
    ignore: (req) => req.url === "/api/health",
  },
});
