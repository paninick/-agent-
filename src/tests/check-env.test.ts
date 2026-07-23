/**
 * #10 env 验证强化测试
 *
 * 测试 check-env.ts 中导出的：
 *   - CHECKS 数组（pattern 正确性）
 *   - FORBIDDEN_KEYS 列表（敏感 key 前缀）
 *   - validateCrossChecks（交叉校验纯函数）
 *   - validateSecurityAdvisories（安全建议纯函数）
 */

import { describe, expect, it } from "vitest";
import {
  CHECKS,
  FORBIDDEN_KEYS,
  validateCrossChecks,
  validateSecurityAdvisories,
} from "../../scripts/check-env";

// ===== Helpers =====

function findCheck(name: string) {
  return CHECKS.find((c) => c.name === name);
}

// ===== #10 CHECKS array pattern validation =====

describe("#10 check-env: CHECKS pattern validation", () => {
  it("CHECKS array is non-empty and covers expected categories", () => {
    expect(CHECKS.length).toBeGreaterThan(0);
    const sources = new Set(CHECKS.map((c) => c.source));
    expect(sources.has("L0")).toBe(true); // runtime config
    expect(sources.has("L1")).toBe(true); // API keys
    expect(sources.has("L2")).toBe(true); // auth/persistence
    expect(sources.has("MONITORING")).toBe(true); // logging/APM
  });

  it("each check has a non-empty name, purpose, and valid pattern", () => {
    for (const check of CHECKS) {
      expect(check.name.length).toBeGreaterThan(0);
      expect(check.purpose.length).toBeGreaterThan(0);
      expect(check.pattern).toBeInstanceOf(RegExp);
    }
  });

  // ===== #3 JWT auth patterns =====

  it("AUTH_ENABLED pattern matches true/false only", () => {
    const pattern = findCheck("AUTH_ENABLED")!.pattern;
    expect(pattern.test("true")).toBe(true);
    expect(pattern.test("false")).toBe(true);
    expect(pattern.test("yes")).toBe(false);
    expect(pattern.test("1")).toBe(false);
  });

  it("JWT_SECRET pattern requires >= 16 chars", () => {
    const pattern = findCheck("JWT_SECRET")!.pattern;
    expect(pattern.test("shortsecret12345")).toBe(true); // 16 chars
    expect(pattern.test("short")).toBe(false); // 5 chars
    expect(pattern.test("a".repeat(32))).toBe(true);
  });

  it("ADMIN_USERNAME pattern requires >= 3 alphanumeric/underscore/hyphen chars", () => {
    const pattern = findCheck("ADMIN_USERNAME")!.pattern;
    expect(pattern.test("admin")).toBe(true);
    expect(pattern.test("ab")).toBe(false); // too short
    expect(pattern.test("user_1")).toBe(true);
    expect(pattern.test("user-1")).toBe(true);
    expect(pattern.test("user 1")).toBe(false); // space not allowed
  });

  it("ADMIN_PASSWORD pattern requires >= 8 chars", () => {
    const pattern = findCheck("ADMIN_PASSWORD")!.pattern;
    expect(pattern.test("password123")).toBe(true);
    expect(pattern.test("short")).toBe(false);
    expect(pattern.test("a".repeat(8))).toBe(true);
  });

  it("JWT_EXPIRES_IN pattern matches jsonwebtoken time formats", () => {
    const pattern = findCheck("JWT_EXPIRES_IN")!.pattern;
    expect(pattern.test("24h")).toBe(true);
    expect(pattern.test("7d")).toBe(true);
    expect(pattern.test("1h")).toBe(true);
    expect(pattern.test("30m")).toBe(true);
    expect(pattern.test("60s")).toBe(true);
    expect(pattern.test("1h 30m")).toBe(true); // compound format
    expect(pattern.test("24")).toBe(false); // missing unit
    expect(pattern.test("hours")).toBe(false); // not a unit
  });

  // ===== #6 Neon persistence patterns =====

  it("NEON_PERSISTENCE pattern matches 0 or 1 only", () => {
    const pattern = findCheck("NEON_PERSISTENCE")!.pattern;
    expect(pattern.test("0")).toBe(true);
    expect(pattern.test("1")).toBe(true);
    expect(pattern.test("true")).toBe(false);
    expect(pattern.test("2")).toBe(false);
  });

  it("DATABASE_URL pattern requires postgresql:// prefix", () => {
    const pattern = findCheck("DATABASE_URL")!.pattern;
    expect(pattern.test("postgresql://user:pass@host/db")).toBe(true);
    expect(pattern.test("postgres://host/db")).toBe(false);
    expect(pattern.test("mysql://host/db")).toBe(false);
  });

  // ===== #7 Sentry APM patterns =====

  it("SENTRY_DSN pattern requires http(s):// prefix", () => {
    const pattern = findCheck("SENTRY_DSN")!.pattern;
    expect(pattern.test("https://abc@sentry.io/123")).toBe(true);
    expect(pattern.test("http://localhost:9000")).toBe(true);
    expect(pattern.test("abc@sentry.io")).toBe(false);
  });

  it("SENTRY_ENVIRONMENT pattern matches lowercase alphanumeric/hyphen/underscore", () => {
    const pattern = findCheck("SENTRY_ENVIRONMENT")!.pattern;
    expect(pattern.test("production")).toBe(true);
    expect(pattern.test("staging-1")).toBe(true);
    expect(pattern.test("dev_test")).toBe(true);
    expect(pattern.test("Production")).toBe(false); // uppercase not allowed
    expect(pattern.test("staging 1")).toBe(false); // space not allowed
  });

  it("SENTRY_TRACES_SAMPLE_RATE pattern matches 0-1 floats", () => {
    const pattern = findCheck("SENTRY_TRACES_SAMPLE_RATE")!.pattern;
    expect(pattern.test("0")).toBe(true);
    expect(pattern.test("0.1")).toBe(true);
    expect(pattern.test("0.5")).toBe(true);
    expect(pattern.test("1")).toBe(true);
    expect(pattern.test("1.0")).toBe(true);
    expect(pattern.test("1.5")).toBe(false); // > 1
    expect(pattern.test("-0.1")).toBe(false); // < 0
    expect(pattern.test("50%")).toBe(false); // not a number
  });

  // ===== #10 Runtime config patterns =====

  it("NODE_ENV pattern matches development/production/test", () => {
    const pattern = findCheck("NODE_ENV")!.pattern;
    expect(pattern.test("development")).toBe(true);
    expect(pattern.test("production")).toBe(true);
    expect(pattern.test("test")).toBe(true);
    expect(pattern.test("staging")).toBe(false);
  });

  it("PORT pattern matches 2-5 digit numbers", () => {
    const pattern = findCheck("PORT")!.pattern;
    expect(pattern.test("80")).toBe(true);
    expect(pattern.test("3000")).toBe(true);
    expect(pattern.test("65535")).toBe(true);
    expect(pattern.test("abc")).toBe(false);
    expect(pattern.test("999999")).toBe(false); // 6 digits
  });

  it("APPROVAL_ENABLED pattern matches true/false", () => {
    const pattern = findCheck("APPROVAL_ENABLED")!.pattern;
    expect(pattern.test("true")).toBe(true);
    expect(pattern.test("false")).toBe(true);
    expect(pattern.test("1")).toBe(false);
  });

  it("LOG_LEVEL pattern matches debug/info/warn/error", () => {
    const pattern = findCheck("LOG_LEVEL")!.pattern;
    expect(pattern.test("debug")).toBe(true);
    expect(pattern.test("info")).toBe(true);
    expect(pattern.test("warn")).toBe(true);
    expect(pattern.test("error")).toBe(true);
    expect(pattern.test("trace")).toBe(false);
    expect(pattern.test("verbose")).toBe(false);
  });

  // ===== LLM provider key patterns =====

  it("OPENAI_API_KEY pattern requires sk- prefix + >= 16 alphanumeric chars", () => {
    const pattern = findCheck("OPENAI_API_KEY")!.pattern;
    expect(pattern.test("sk-proj-abcdef1234567890")).toBe(true);
    expect(pattern.test("sk-")).toBe(false); // too short after prefix
    expect(pattern.test("proj-abcdef1234567890")).toBe(false); // missing sk- prefix
  });

  it("DEEPSEEK_API_KEY pattern requires >= 16 alphanumeric/underscore/hyphen chars", () => {
    const pattern = findCheck("DEEPSEEK_API_KEY")!.pattern;
    expect(pattern.test("sk-deepseek-1234567890")).toBe(true);
    expect(pattern.test("short")).toBe(false);
  });
});

// ===== #10 FORBIDDEN_KEYS validation =====

describe("#10 check-env: FORBIDDEN_KEYS", () => {
  it("FORBIDDEN_KEYS list covers common secret prefixes", () => {
    expect(FORBIDDEN_KEYS).toContain("sk_live_");
    expect(FORBIDDEN_KEYS).toContain("sk_test_");
    expect(FORBIDDEN_KEYS).toContain("AKIA");
    expect(FORBIDDEN_KEYS).toContain("ghp_");
    expect(FORBIDDEN_KEYS.length).toBeGreaterThanOrEqual(10);
  });
});

// ===== #10 validateCrossChecks (pure function) =====

describe("#10 check-env: validateCrossChecks", () => {
  it("returns no errors for empty env (all optional)", () => {
    const errors = validateCrossChecks({});
    expect(errors).toEqual([]);
  });

  // #6 — Neon
  it("returns error when NEON_PERSISTENCE=1 but DATABASE_URL missing", () => {
    const errors = validateCrossChecks({
      NEON_PERSISTENCE: "1",
      // DATABASE_URL intentionally missing
    });
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain("DATABASE_URL");
  });

  it("returns no error when NEON_PERSISTENCE=1 and DATABASE_URL set", () => {
    const errors = validateCrossChecks({
      NEON_PERSISTENCE: "1",
      DATABASE_URL: "postgresql://user:pass@host/db",
    });
    expect(errors).toEqual([]);
  });

  it("returns no error when NEON_PERSISTENCE=0 (default) without DATABASE_URL", () => {
    const errors = validateCrossChecks({
      NEON_PERSISTENCE: "0",
    });
    expect(errors).toEqual([]);
  });

  // #3 — Auth
  it("returns errors when AUTH_ENABLED=true but JWT_SECRET and ADMIN_PASSWORD missing", () => {
    const errors = validateCrossChecks({
      AUTH_ENABLED: "true",
      // JWT_SECRET and ADMIN_PASSWORD intentionally missing
    });
    expect(errors.length).toBe(2);
    expect(errors.some((e) => e.includes("JWT_SECRET"))).toBe(true);
    expect(errors.some((e) => e.includes("ADMIN_PASSWORD"))).toBe(true);
  });

  it("returns no error when AUTH_ENABLED=true and both JWT_SECRET + ADMIN_PASSWORD set", () => {
    const errors = validateCrossChecks({
      AUTH_ENABLED: "true",
      JWT_SECRET: "a".repeat(32),
      ADMIN_PASSWORD: "securepassword",
    });
    expect(errors).toEqual([]);
  });

  it("returns no error when AUTH_ENABLED=false (default) without JWT config", () => {
    const errors = validateCrossChecks({
      AUTH_ENABLED: "false",
    });
    expect(errors).toEqual([]);
  });

  // #10 — PORT range
  it("returns error when PORT is below 1024", () => {
    const errors = validateCrossChecks({ PORT: "80" });
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain("1024-65535");
  });

  it("returns error when PORT is above 65535", () => {
    const errors = validateCrossChecks({ PORT: "99999" });
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain("1024-65535");
  });

  it("returns no error when PORT is in valid range", () => {
    expect(validateCrossChecks({ PORT: "1024" })).toEqual([]);
    expect(validateCrossChecks({ PORT: "3000" })).toEqual([]);
    expect(validateCrossChecks({ PORT: "8787" })).toEqual([]);
    expect(validateCrossChecks({ PORT: "65535" })).toEqual([]);
  });

  // #10 — Sentry sample rate
  it("returns error when SENTRY_DSN set but SENTRY_TRACES_SAMPLE_RATE > 1", () => {
    const errors = validateCrossChecks({
      SENTRY_DSN: "https://abc@sentry.io/123",
      SENTRY_TRACES_SAMPLE_RATE: "1.5",
    });
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain("[0,1]");
  });

  it("returns no error when SENTRY_DSN set and SENTRY_TRACES_SAMPLE_RATE in range", () => {
    expect(validateCrossChecks({
      SENTRY_DSN: "https://abc@sentry.io/123",
      SENTRY_TRACES_SAMPLE_RATE: "0.1",
    })).toEqual([]);
    expect(validateCrossChecks({
      SENTRY_DSN: "https://abc@sentry.io/123",
      SENTRY_TRACES_SAMPLE_RATE: "1",
    })).toEqual([]);
  });

  it("returns no error when SENTRY_DSN set and SENTRY_TRACES_SAMPLE_RATE missing (default 0.1)", () => {
    const errors = validateCrossChecks({
      SENTRY_DSN: "https://abc@sentry.io/123",
      // SENTRY_TRACES_SAMPLE_RATE intentionally missing — defaults to "0.1"
    });
    expect(errors).toEqual([]);
  });

  // Combined scenarios
  it("returns multiple errors for multiple misconfigurations", () => {
    const errors = validateCrossChecks({
      NEON_PERSISTENCE: "1",
      AUTH_ENABLED: "true",
      PORT: "80",
    });
    // 1 (DATABASE_URL missing) + 2 (JWT_SECRET + ADMIN_PASSWORD missing) + 1 (PORT) = 4
    expect(errors.length).toBe(4);
  });
});

// ===== #10 validateSecurityAdvisories (pure function) =====

describe("#10 check-env: validateSecurityAdvisories", () => {
  it("returns no warnings for empty env", () => {
    const warnings = validateSecurityAdvisories({});
    // LLM provider key warning will fire (no keys configured).
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain("LLM provider");
  });

  it("warns when AUTH_ENABLED=true and JWT_SECRET < 32 chars", () => {
    const warnings = validateSecurityAdvisories({
      AUTH_ENABLED: "true",
      JWT_SECRET: "shortsecret12345", // 16 chars — passes pattern but < 32
      DEEPSEEK_API_KEY: "fake-key-1234567890", // suppress LLM warning
    });
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain(">= 32");
  });

  it("does not warn when AUTH_ENABLED=true and JWT_SECRET >= 32 chars", () => {
    const warnings = validateSecurityAdvisories({
      AUTH_ENABLED: "true",
      JWT_SECRET: "a".repeat(32),
      DEEPSEEK_API_KEY: "fake-key-1234567890",
    });
    expect(warnings).toEqual([]);
  });

  it("warns when no LLM provider keys configured", () => {
    const warnings = validateSecurityAdvisories({
      // No LLM keys
    });
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain("LLM provider");
  });

  it("does not warn when at least one LLM provider key is configured", () => {
    const warnings = validateSecurityAdvisories({
      ARK_API_KEY: "fake-ark-key-1234567890",
    });
    expect(warnings).toEqual([]);
  });

  it("does not warn about JWT_SECRET when AUTH_ENABLED=false", () => {
    const warnings = validateSecurityAdvisories({
      AUTH_ENABLED: "false",
      JWT_SECRET: "short", // short but auth disabled
      DEEPSEEK_API_KEY: "fake-key-1234567890",
    });
    expect(warnings).toEqual([]);
  });
});
