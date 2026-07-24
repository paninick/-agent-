import { defineConfig } from "vitest/config";

/**
 * vitest.config.ts - 测试配置
 *
 * Coverage 阈值基于当前项目状态设定（2026-07-13）：
 * - Stmts 87.87% → 阈值 80%
 * - Branch 78.2% → 阈值 70%
 * - Funcs 84.21% → 阈值 75%
 * - Lines 88.18% → 阈值 80%
 *
 * 阈值留有 5-10% 缓冲，允许小幅波动同时防止显著退化。
 */
export default defineConfig({
  test: {
    // HTTP/jsdom suites become timing-dependent under unconstrained parallelism.
    // Two workers keep isolation while avoiding release-runner saturation.
    maxWorkers: 2,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "clover"],
      reportsDirectory: "./coverage",
      thresholds: {
        statements: 80,
        branches: 70,
        functions: 75,
        lines: 80,
      },
      exclude: [
        "node_modules/**",
        "dist/**",
        "coverage/**",
        "src/tests/**",
        "src/client/habitat/**/*.test.*",
        "skills/**",
        "scripts/**",
        "**/*.config.*",
        "**/index.ts",
      ],
    },
  },
});
