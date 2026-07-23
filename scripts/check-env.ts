#!/usr/bin/env tsx
/**
 * check-env.ts — v3 启动前 ENV 变量检查
 *
 * 用法: tsx scripts/check-env.ts
 *
 * 验证:
 *   - 必需 L1 key 存在且格式正确
 *   - 禁止 .env.local 不入 git
 *   - 禁止 .env.example 写真实 key
 *
 * 不写真实 key 到 stdout，只写明/缺
 */

import { readFile, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

export interface EnvCheck {
  name: string;
  required: boolean;
  pattern: RegExp;
  source: "L0" | "L1" | "L2" | "MONITORING";
  purpose: string;
}

export const CHECKS: EnvCheck[] = [
  { name: "UN_COMTRADE_API_KEY", required: true, pattern: /^[a-f0-9]{32}$/, source: "L1", purpose: "UN Comtrade 公共 API" },
  { name: "FRED_API_KEY", required: true, pattern: /^[a-f0-9]{32}$/, source: "L1", purpose: "FRED 经济数据" },
  { name: "CENSUS_API_KEY", required: true, pattern: /^[a-f0-9]{40}$/, source: "L1", purpose: "U.S. Census 进口数据" },
  { name: "OPEN_SUPPLY_HUB_API_KEY", required: false, pattern: /^[A-Za-z0-9_-]{20,}$/, source: "L1", purpose: "工厂身份" },
  { name: "FEISHU_WEBHOOK_URL", required: false, pattern: /^https:\/\/open\.feishu\.cn\/.*$/, source: "MONITORING", purpose: "告警通知" },
  { name: "LOG_LEVEL", required: false, pattern: /^(debug|info|warn|error)$/, source: "MONITORING", purpose: "pino 日志等级" },
  // #6 — Neon 持久化校验
  { name: "NEON_PERSISTENCE", required: false, pattern: /^(0|1)$/, source: "L2", purpose: "Neon 持久化开关（0=内存，1=Neon）" },
  { name: "DATABASE_URL", required: false, pattern: /^postgresql:\/\/.+/, source: "L2", purpose: "Neon PostgreSQL 连接字符串" },
  // #3 — JWT 认证校验
  { name: "AUTH_ENABLED", required: false, pattern: /^(true|false)$/, source: "L2", purpose: "JWT 认证开关" },
  { name: "JWT_SECRET", required: false, pattern: /^.{16,}$/, source: "L2", purpose: "JWT 签名密钥（>=16 字符，建议 >=32）" },
  { name: "ADMIN_USERNAME", required: false, pattern: /^[A-Za-z0-9_-]{3,}$/, source: "L2", purpose: "管理员用户名（>=3 字符）" },
  { name: "ADMIN_PASSWORD", required: false, pattern: /^.{8,}$/, source: "L2", purpose: "管理员密码（>=8 字符）" },
  { name: "JWT_EXPIRES_IN", required: false, pattern: /^\d+[smhd](\s*\d+[smhd])*$/, source: "L2", purpose: "JWT 过期时间（如 24h, 7d, 1h 30m）" },
  // #7 — Sentry APM 校验
  { name: "SENTRY_DSN", required: false, pattern: /^https?:\/\/.+/, source: "MONITORING", purpose: "Sentry APM DSN" },
  { name: "SENTRY_ENVIRONMENT", required: false, pattern: /^[a-z0-9_-]+$/, source: "MONITORING", purpose: "Sentry 环境名" },
  { name: "SENTRY_TRACES_SAMPLE_RATE", required: false, pattern: /^(0(\.\d+)?|1(\.0+)?)$/, source: "MONITORING", purpose: "Sentry 追踪采样率（0-1 浮点数）" },
  // #10 — 通用运行时配置校验
  { name: "NODE_ENV", required: false, pattern: /^(development|production|test)$/, source: "L0", purpose: "Node 运行环境" },
  { name: "PORT", required: false, pattern: /^\d{2,5}$/, source: "L0", purpose: "HTTP 端口（1024-65535）" },
  { name: "LAUNCH_DESK_MODEL", required: false, pattern: /^.+$/, source: "L0", purpose: "Launch Desk 默认模型 ID" },
  { name: "APPROVAL_ENABLED", required: false, pattern: /^(true|false)$/, source: "L2", purpose: "审批门开关" },
  // LLM provider API keys — 至少一个应该配置（交叉校验）
  { name: "DEEPSEEK_API_KEY", required: false, pattern: /^[A-Za-z0-9_-]{16,}$/, source: "L1", purpose: "DeepSeek API key" },
  { name: "ARK_API_KEY", required: false, pattern: /^[A-Za-z0-9_-]{16,}$/, source: "L1", purpose: "火山方舟 API key" },
  { name: "OPENROUTER_API_KEY", required: false, pattern: /^[A-Za-z0-9_-]{16,}$/, source: "L1", purpose: "OpenRouter API key" },
  { name: "LONGCAT_API_KEY", required: false, pattern: /^[A-Za-z0-9_-]{16,}$/, source: "L1", purpose: "LongCat API key" },
  { name: "OPENAI_API_KEY", required: false, pattern: /^sk-[A-Za-z0-9_-]{16,}$/, source: "L1", purpose: "OpenAI API key" },
];

export const FORBIDDEN_KEYS = [
  "sk_live_", "sk_test_", "pwx_", "AKIA", "ghp_", "sk-ant-",
  "xoxb-", "xoxa-", "xoxp-", "xoxr-", "xoxs-",
];

const FORBIDDEN_KEY_PATTERN = /[a-zA-Z0-9_-]{20,}/g;

/**
 * #10 交叉校验 — 纯函数，返回错误消息列表（空数组表示通过）。
 * 可被测试文件导入，不依赖 process.env / 文件系统。
 *
 * @param env 模拟的 env 变量（key → value | undefined）
 * @returns 错误消息数组（每条对应一个 failed 项）
 */
export function validateCrossChecks(env: Record<string, string | undefined>): string[] {
  const errors: string[] = [];

  // #6 — NEON_PERSISTENCE=1 时 DATABASE_URL 必须存在
  if (env.NEON_PERSISTENCE === "1" && !env.DATABASE_URL) {
    errors.push("NEON_PERSISTENCE=1 但 DATABASE_URL 缺失 — 持久化将回退到纯内存模式");
  }

  // #3 — AUTH_ENABLED=true 时 JWT_SECRET 和 ADMIN_PASSWORD 必须存在
  if (env.AUTH_ENABLED === "true") {
    if (!env.JWT_SECRET) {
      errors.push("AUTH_ENABLED=true 但 JWT_SECRET 缺失 — 认证将回退到放行模式");
    }
    if (!env.ADMIN_PASSWORD) {
      errors.push("AUTH_ENABLED=true 但 ADMIN_PASSWORD 缺失 — 认证将回退到放行模式");
    }
  }

  // #10 — PORT 数值范围校验（pattern 只验证格式，这里验证 1024-65535）
  if (env.PORT) {
    const portNum = Number(env.PORT);
    if (Number.isNaN(portNum) || portNum < 1024 || portNum > 65535) {
      errors.push(`PORT 应在 1024-65535 之间（当前 ${env.PORT}）`);
    }
  }

  // #10 — SENTRY_DSN 设置时 SENTRY_TRACES_SAMPLE_RATE 应该在 0-1 之间
  if (env.SENTRY_DSN) {
    const rateStr = env.SENTRY_TRACES_SAMPLE_RATE ?? "0.1";
    const rateNum = Number(rateStr);
    if (Number.isNaN(rateNum) || rateNum < 0 || rateNum > 1) {
      errors.push(`SENTRY_DSN 已配置但 SENTRY_TRACES_SAMPLE_RATE 不在 [0,1] 范围（当前 ${rateStr}）`);
    }
  }

  return errors;
}

/**
 * #10 安全建议校验 — 返回 warn 级别建议（不 block）。
 * 例如：JWT_SECRET < 32 字符时建议加强。
 */
export function validateSecurityAdvisories(env: Record<string, string | undefined>): string[] {
  const warnings: string[] = [];

  // JWT_SECRET < 32 字符时 warn
  if (env.AUTH_ENABLED === "true" && env.JWT_SECRET && env.JWT_SECRET.length < 32) {
    warnings.push(`AUTH_ENABLED=true 时建议 JWT_SECRET >= 32 字符（当前 ${env.JWT_SECRET.length} 字符）`);
  }

  // LLM provider key 都未配置时 warn
  const llmKeys = [
    "DEEPSEEK_API_KEY",
    "ARK_API_KEY",
    "OPENROUTER_API_KEY",
    "LONGCAT_API_KEY",
    "OPENAI_API_KEY",
  ];
  const configuredCount = llmKeys.filter((k) => env[k]).length;
  if (configuredCount === 0) {
    warnings.push("未配置任何 LLM provider API key — /api/launch-plan 将返回错误");
  }

  return warnings;
}

async function main() {
  const strict = process.argv.includes("--strict");
  let failed = 0;
  const envFile = ".env.local";
  const exampleFile = ".env.example";

  console.log("🔍 check-env: v3 启动前 ENV 变量检查\n");

  // 1. 检查 .env.local 是否存在
  const envExists = existsSync(envFile);
  if (!envExists) {
    const symbol = strict ? "\x1b[31m✗\x1b[0m" : "\x1b[33m⚠\x1b[0m";
    console.log(`${symbol} ${envFile} 不存在`);
    console.log(`  说明: 默认验证允许无凭据运行；真实数据源启动前运行 npm run verify:env -- --strict`);
    if (strict) failed += 1;
  } else {
    console.log(`\x1b[32m✓\x1b[0m ${envFile} 存在`);

    // 2. 加载 .env.local
    const { config } = await import("dotenv");
    config({ path: envFile, quiet: true });

    // 3. 检查每个 ENV
    for (const check of CHECKS) {
      const value = process.env[check.name];
      if (!value) {
        const isBlocking = strict && check.required;
        const symbol = isBlocking ? "\x1b[31m✗\x1b[0m" : "\x1b[33m⚠\x1b[0m";
        console.log(`${symbol} ${check.name} 缺失 (${check.source}) - ${check.purpose}`);
        if (isBlocking) failed += 1;
        continue;
      }
      if (!check.pattern.test(value)) {
        console.log(`\x1b[31m✗\x1b[0m ${check.name} 格式不符 (${check.source})`);
        console.log(`  期望: ${check.pattern}`);
        console.log(`  实际: 长度 ${value.length} (前缀 ${value.substring(0, 4)}...)`);
        failed += 1;
        continue;
      }
      console.log(`\x1b[32m✓\x1b[0m ${check.name} (${check.source})`);
    }

    // 交叉校验 + 安全建议（复用导出的纯函数，避免逻辑重复）
    const envSnapshot: Record<string, string | undefined> = { ...process.env };
    const crossErrors = validateCrossChecks(envSnapshot);
    for (const msg of crossErrors) {
      console.log(`\x1b[31m✗\x1b[0m ${msg}`);
      failed += 1;
    }

    const warnings = validateSecurityAdvisories(envSnapshot);
    for (const msg of warnings) {
      console.log(`\x1b[33m⚠\x1b[0m ${msg}`);
    }

    // LLM provider key 已配置时打印成功信息（与 warnings 互补）
    const llmKeyNames = [
      "DEEPSEEK_API_KEY",
      "ARK_API_KEY",
      "OPENROUTER_API_KEY",
      "LONGCAT_API_KEY",
      "OPENAI_API_KEY",
    ];
    const configuredCount = llmKeyNames.filter((k) => process.env[k]).length;
    if (configuredCount > 0) {
      console.log(`\x1b[32m✓\x1b[0m 至少一个 LLM provider key 已配置 (${configuredCount}/${llmKeyNames.length})`);
    }
  }

  // 4. 检查 .env.example 是否写真实 key
  if (existsSync(exampleFile)) {
    const exampleContent = await readFile(exampleFile, "utf-8");
    let hasLeak = false;
    for (const line of exampleContent.split("\n")) {
      // 跳过空行、注释、= 后跟占位符
      if (!line || line.trim().startsWith("#") || !line.includes("=")) continue;
      const value = line.split("=", 2)[1]?.trim() ?? "";
      if (!value) continue;
      if (FORBIDDEN_KEYS.some((k) => value.startsWith(k))) {
        console.log(`\x1b[31m✗\x1b[0m ${exampleFile} 含真值 key: ${line.substring(0, 50)}...`);
        hasLeak = true;
        failed += 1;
      }
    }
    if (!hasLeak) console.log(`\x1b[32m✓\x1b[0m ${exampleFile} 无真值 key 泄露`);
  }

  // 5. 检查 .gitignore
  const gitignore = existsSync(".gitignore") ? await readFile(".gitignore", "utf-8").catch(() => "") : "";
  const hasEnvIgnore = /\.env(\.local|\.\*\.local)?/.test(gitignore);
  if (!hasEnvIgnore) {
    console.log(`\x1b[33m⚠\x1b[0m .gitignore 缺 .env.local 规则`);
    failed += 1;
  } else {
    console.log(`\x1b[32m✓\x1b[0m .gitignore 忽略 .env.local`);
  }

  console.log("");
  if (failed === 0) {
    console.log(`\x1b[32m✅ check-env: 全部通过\x1b[0m`);
    process.exit(0);
  } else {
    console.log(`\x1b[31m❌ check-env: ${failed} 项失败\x1b[0m`);
    process.exit(1);
  }
}

// 仅在直接运行时执行 main（vitest 导入时不执行）
if (process.env.VITEST !== "true" && process.env.NODE_ENV !== "test") {
  main().catch((err) => {
    console.error("check-env error:", err);
    process.exit(2);
  });
}
