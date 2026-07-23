/**
 * swarm/severity.ts - 三级严重度分类
 *
 * 吸收 superpowers code-reviewer.md 的严重度分级模式：
 *   Critical Must-Fix / Important Should-Fix / Minor Nice-to-Have
 *
 * "Categorize by actual severity, not everything is Critical."
 */

import type { ReconciliationResult, ReconciliationStatus } from "../reconciliation/types";

// === 严重度类型 ===

export type SeverityLevel = "critical" | "important" | "minor";

/** 严重度报告 - 按级别分组 */
export interface SeverityReport {
  /** Critical Must-Fix - 阻塞完成 */
  critical: string[];
  /** Important Should-Fix - 不阻塞但应修复 */
  important: string[];
  /** Minor Nice-to-Have - 可选改进 */
  minor: string[];
  /** 总项目数 */
  total: number;
}

// === 严重度映射 ===

/**
 * 将 ReconciliationStatus 映射到 SeverityLevel。
 *
 * mismatch -> critical（数据不一致，阻塞结算）
 * warning  -> important（有差异但不阻塞）
 * matched  -> minor（无差异，无需操作）
 */
export function statusToSeverity(status: ReconciliationStatus): SeverityLevel {
  switch (status) {
    case "mismatch":
      return "critical";
    case "warning":
      return "important";
    case "matched":
      return "minor";
    default:
      return "minor";
  }
}

/**
 * 分类单个对账结果的严重度。
 *
 * @param result - 对账结果
 * @returns 严重度级别
 */
export function classifyReconciliationSeverity(
  result: ReconciliationResult
): SeverityLevel {
  return statusToSeverity(result.status);
}

/**
 * 构建严重度报告 - 将多个对账结果按级别分组。
 *
 * @param results - 对账结果列表
 * @returns 按严重度分组的报告
 */
export function buildSeverityReport(
  results: ReconciliationResult[]
): SeverityReport {
  const report: SeverityReport = {
    critical: [],
    important: [],
    minor: [],
    total: results.length,
  };

  for (const result of results) {
    const severity = classifyReconciliationSeverity(result);
    const description = `[${result.dimension}] ${result.id}: status=${result.status}`;

    switch (severity) {
      case "critical":
        report.critical.push(description);
        break;
      case "important":
        report.important.push(description);
        break;
      case "minor":
        report.minor.push(description);
        break;
    }
  }

  return report;
}

/**
 * 格式化严重度报告为人类可读字符串。
 */
export function formatSeverityReport(report: SeverityReport): string {
  const lines: string[] = [];
  lines.push(`Severity Report (${report.total} items):`);

  if (report.critical.length > 0) {
    lines.push(`  🔴 Critical Must-Fix (${report.critical.length}):`);
    report.critical.forEach((c) => lines.push(`    - ${c}`));
  }

  if (report.important.length > 0) {
    lines.push(`  🟡 Important Should-Fix (${report.important.length}):`);
    report.important.forEach((i) => lines.push(`    - ${i}`));
  }

  if (report.minor.length > 0) {
    lines.push(`  🟢 Minor Nice-to-Have (${report.minor.length}):`);
    report.minor.forEach((m) => lines.push(`    - ${m}`));
  }

  if (report.critical.length === 0 && report.important.length === 0) {
    lines.push("  ✅ No critical or important issues.");
  }

  return lines.join("\n");
}

/**
 * 判断是否有阻塞性问题。
 *
 * @param report - 严重度报告
 * @returns true 表示有 critical 级别问题
 */
export function hasBlockingIssues(report: SeverityReport): boolean {
  return report.critical.length > 0;
}
