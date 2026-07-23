/**
 * sentry.test.ts — #7 APM (Sentry) 集成测试
 *
 * 验证：
 *   1. SENTRY_DSN 未设置时 initSentry 返回 false
 *   2. SENTRY_DSN 设置时 initSentry 返回 true
 *   3. 未启用时 attachSentryRequestHandler / attachSentryErrorHandler 为 no-op
 *   4. captureException 不抛异常
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import {
  attachSentryErrorHandler,
  attachSentryRequestHandler,
  captureException,
  initSentry,
  readSentryConfig,
} from "../server/sentry";

describe("#7 Sentry APM — readSentryConfig", () => {
  let originalDsn: string | undefined;
  let originalEnv: string | undefined;
  let originalRate: string | undefined;

  beforeEach(() => {
    originalDsn = process.env.SENTRY_DSN;
    originalEnv = process.env.SENTRY_ENVIRONMENT;
    originalRate = process.env.SENTRY_TRACES_SAMPLE_RATE;
  });

  afterEach(() => {
    if (originalDsn === undefined) delete process.env.SENTRY_DSN;
    else process.env.SENTRY_DSN = originalDsn;
    if (originalEnv === undefined) delete process.env.SENTRY_ENVIRONMENT;
    else process.env.SENTRY_ENVIRONMENT = originalEnv;
    if (originalRate === undefined) delete process.env.SENTRY_TRACES_SAMPLE_RATE;
    else process.env.SENTRY_TRACES_SAMPLE_RATE = originalRate;
  });

  it("SENTRY_DSN 未设置时 enabled=false", () => {
    delete process.env.SENTRY_DSN;
    const config = readSentryConfig();
    expect(config.enabled).toBe(false);
    expect(config.dsn).toBe("");
  });

  it("SENTRY_DSN 设置时 enabled=true", () => {
    process.env.SENTRY_DSN = "https://example@sentry.io/123";
    const config = readSentryConfig();
    expect(config.enabled).toBe(true);
    expect(config.dsn).toBe("https://example@sentry.io/123");
  });

  it("使用默认环境名和采样率", () => {
    delete process.env.SENTRY_DSN;
    delete process.env.SENTRY_ENVIRONMENT;
    delete process.env.SENTRY_TRACES_SAMPLE_RATE;
    const config = readSentryConfig();
    expect(config.environment).toBe("production");
    expect(config.tracesSampleRate).toBe(0.1);
  });

  it("从环境变量读取自定义配置", () => {
    process.env.SENTRY_DSN = "https://example@sentry.io/123";
    process.env.SENTRY_ENVIRONMENT = "staging";
    process.env.SENTRY_TRACES_SAMPLE_RATE = "0.5";
    const config = readSentryConfig();
    expect(config.environment).toBe("staging");
    expect(config.tracesSampleRate).toBe(0.5);
  });
});

describe("#7 Sentry APM — initSentry", () => {
  let originalDsn: string | undefined;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    originalDsn = process.env.SENTRY_DSN;
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    if (originalDsn === undefined) delete process.env.SENTRY_DSN;
    else process.env.SENTRY_DSN = originalDsn;
    logSpy.mockRestore();
  });

  it("SENTRY_DSN 未设置时返回 false 并记录日志", () => {
    delete process.env.SENTRY_DSN;
    const result = initSentry();
    expect(result).toBe(false);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("[sentry]"));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("未启用"));
  });

  it("SENTRY_DSN 设置时返回 true 并记录日志", () => {
    process.env.SENTRY_DSN = "https://example@sentry.io/123";
    const result = initSentry();
    expect(result).toBe(true);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("已启用"));
  });
});

describe("#7 Sentry APM — attachSentryHandlers（未启用时 no-op）", () => {
  it("未启用时不抛异常", () => {
    const app = express();
    expect(() => {
      attachSentryRequestHandler(app, { enabled: false, dsn: "", environment: "test", tracesSampleRate: 0 });
      attachSentryErrorHandler(app, { enabled: false, dsn: "", environment: "test", tracesSampleRate: 0 });
    }).not.toThrow();
  });
});

describe("#7 Sentry APM — captureException", () => {
  it("不抛异常（未启用时为 no-op）", () => {
    expect(() => captureException(new Error("test error"))).not.toThrow();
  });
});
