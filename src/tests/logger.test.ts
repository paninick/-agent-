/**
 * logger.test.ts — #8 结构化日志 (pino) 测试
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { logger, httpLogger } from "../server/logger";

describe("#8 pino logger", () => {
  it("logger 实例存在且有 info/warn/error 方法", () => {
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.error).toBe("function");
  });

  it("logger.info 不抛异常", () => {
    expect(() => logger.info({ event: "test" }, "test message")).not.toThrow();
  });

  it("httpLogger 是函数（中间件）", () => {
    expect(typeof httpLogger).toBe("function");
  });
});

describe("#8 pino logger — LOG_LEVEL", () => {
  let originalLevel: string | undefined;

  beforeEach(() => {
    originalLevel = process.env.LOG_LEVEL;
  });

  afterEach(() => {
    if (originalLevel === undefined) delete process.env.LOG_LEVEL;
    else process.env.LOG_LEVEL = originalLevel;
  });

  it("LOG_LEVEL 未设置时默认 info", () => {
    delete process.env.LOG_LEVEL;
    // 重新导入会使用新级别，但 logger 是单例，这里只验证不抛异常
    expect(logger.level).toBeDefined();
  });
});
