/**
 * swarm/plan-validate-execute.ts - 计划-验证-执行模式
 *
 * 吸收 superpowers writing-plans + executing-plans 的模式：
 *   1. Plan: 制定详细计划（无占位符、无 TBD）
 *   2. Validate: 验证计划可行性
 *   3. Execute: 按计划执行
 *   4. Verify: 执行后验证
 *
 * "Write comprehensive plans assuming the engineer has zero codebase context.
 *  Document everything: which files to touch, code, testing, how to test."
 */

import type { TransactionDocument } from "../reconciliation/types";
import type { ReconciliationStatus } from "../reconciliation/types";

// === 计划阶段类型 ===

export type PlanPhase = "analyze" | "plan" | "validate_plan" | "execute" | "verify";

// === 对账计划 ===

/** 对账计划 - 描述一次对账的预期 */
export interface ReconciliationPlan {
  /** 对账字段列表 */
  fields: string[];
  /** 字段阈值 - 超过此差异率视为 warning/mismatch */
  thresholds: Record<string, number>;
  /** 预期状态 */
  expectedStatus: ReconciliationStatus;
  /** 关联的交易文档 ID */
  transactionRefs?: string[];
}

/** 计划验证结果 */
export interface PlanValidationResult {
  /** 计划是否有效 */
  valid: boolean;
  /** 验证错误列表 */
  errors: string[];
  /** 验证警告列表 */
  warnings: string[];
}

/** 执行结果 */
export interface ExecutionResult<T = unknown> {
  /** 执行产出 */
  result: T;
  /** 是否通过验证 */
  verified: boolean;
  /** 验证详情 */
  verificationDetails: string;
}

// === 计划验证 ===

/**
 * 验证对账计划的可行性。
 *
 * 吸收 superpowers writing-plans 的 No Placeholders 规则：
 *   "Never write TBD/TODO/implement later"
 *   "Never write 'Add appropriate error handling' without actual code"
 *
 * @param plan             - 对账计划
 * @param transactionDocs  - 关联的交易文档（供验证参考）
 * @returns 验证结果
 */
export function validateReconciliationPlan(
  plan: ReconciliationPlan,
  transactionDocs: TransactionDocument[]
): PlanValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 检查 1：字段列表非空
  if (!plan.fields || plan.fields.length === 0) {
    errors.push("Plan has no fields to reconcile");
  }

  // 检查 2：每个字段都有阈值
  for (const field of plan.fields) {
    if (plan.thresholds[field] === undefined) {
      warnings.push(`Field "${field}" has no threshold defined - will use default`);
    }
  }

  // 检查 3：阈值范围合理（0-1）
  for (const [field, threshold] of Object.entries(plan.thresholds)) {
    if (threshold < 0 || threshold > 1) {
      errors.push(`Threshold for "${field}" is ${threshold} - must be between 0 and 1`);
    }
  }

  // 检查 4：预期状态有效
  if (!["matched", "warning", "mismatch"].includes(plan.expectedStatus)) {
    errors.push(`Invalid expectedStatus: ${plan.expectedStatus}`);
  }

  // 检查 5：有关联文档时，字段在文档中存在
  if (transactionDocs.length > 0) {
    const docFields = new Set<string>();
    for (const doc of transactionDocs) {
      for (const key of Object.keys(doc)) {
        docFields.add(key);
      }
    }
    for (const field of plan.fields) {
      if (!docFields.has(field)) {
        warnings.push(`Field "${field}" not found in any transaction document`);
      }
    }
  }

  // 检查 6：无占位符（吸收 superpowers No Placeholders 规则）
  const planJson = JSON.stringify(plan);
  if (/TBD|TODO|implement later|placeholder/i.test(planJson)) {
    errors.push("Plan contains placeholders (TBD/TODO) - plans must be complete with actual values");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// === 执行与验证 ===

/**
 * 带验证的执行 - 先验证计划，再执行，最后验证结果。
 *
 * 吸收 superpowers executing-plans 的模式：
 *   1. Load and Review Plan - 验证计划可行性
 *   2. Execute Tasks - 按计划执行
 *   3. Verify - 执行后验证
 *
 * "Stop-and-ask: hit a blocker, plan has critical gaps, verification fails"
 *
 * @param plan      - 计划
 * @param validator - 计划验证函数
 * @param executor  - 执行函数
 * @returns 执行结果
 */
export function executeWithValidation<T>(
  plan: T,
  validator: (plan: T) => boolean,
  executor: (plan: T) => unknown
): ExecutionResult {
  // 阶段 1：验证计划
  const planValid = validator(plan);
  if (!planValid) {
    return {
      result: undefined,
      verified: false,
      verificationDetails: "Plan validation failed - execution skipped",
    };
  }

  // 阶段 2：执行
  let execResult: unknown;
  try {
    execResult = executor(plan);
  } catch (err) {
    return {
      result: undefined,
      verified: false,
      verificationDetails: `Execution failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // 阶段 3：验证结果
  const verified = execResult !== undefined && execResult !== null;

  return {
    result: execResult as T,
    verified,
    verificationDetails: verified
      ? "Execution completed and result verified (non-null)"
      : "Execution completed but result is null/undefined",
  };
}

// === 计划文档结构验证 ===

/**
 * 检查计划文档是否有占位符。
 *
 * 吸收 superpowers writing-plans 的 No Placeholders 规则：
 *   禁止：TBD/TODO/implement later
 *   禁止：Add appropriate error handling（无实际代码）
 *   禁止：Write tests for the above（无测试代码）
 *   禁止：Similar to Task N（重复代码，任务可能乱序读取）
 */
export function checkForPlaceholders(planText: string): string[] {
  const issues: string[] = [];
  const patterns: Array<{ regex: RegExp; message: string }> = [
    { regex: /\bTBD\b/i, message: "Contains 'TBD' - plans must have actual values" },
    { regex: /\bTODO\b/i, message: "Contains 'TODO' - plans must be complete" },
    { regex: /implement later/i, message: "Contains 'implement later' - all implementation must be in the plan" },
    { regex: /add appropriate error handling/i, message: "Contains vague 'add error handling' - must specify actual code" },
    { regex: /handle edge cases/i, message: "Contains vague 'handle edge cases' - must specify actual cases and code" },
    { regex: /write tests for the above/i, message: "Contains vague 'write tests' - must include actual test code" },
    { regex: /similar to task/i, message: "Contains 'similar to Task N' - repeat the code, tasks may be read out of order" },
  ];

  for (const { regex, message } of patterns) {
    if (regex.test(planText)) {
      issues.push(message);
    }
  }

  return issues;
}
