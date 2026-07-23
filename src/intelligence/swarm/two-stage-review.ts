/**
 * swarm/two-stage-review.ts - 两阶段审查顺序
 *
 * 吸收 superpowers subagent-driven-development 的两阶段审查：
 *   阶段 1：Spec Compliance Review - 验证产出是否符合规格
 *   阶段 2：Code Quality Review - 验证产出质量
 *
 * 核心规则："Starting code quality review before spec compliance passes is a red flag."
 * 规格审查未通过时不启动质量审查。
 */

// === 审查阶段类型 ===

export type ReviewStage = "spec_compliance" | "code_quality";

// === 审查轴（融入 code-review 技能的 Standards + Spec 双轴） ===

/**
 * 审查轴类型 - 来自 code-review 技能的双轴审查模型。
 *
 * - Standards: 代码是否遵循仓库的文档化编码标准？
 * - Spec: 代码是否匹配原始 issue/PRD 的要求？
 */
export type ReviewAxis = "standards" | "spec";

// === 编码标准检查项（Standards 轴） ===

/** 单项编码标准检查结果 */
export interface StandardsCheck {
  /** 检查项 ID */
  ruleId: string;
  /** 检查项描述 */
  check: string;
  /** 通过/失败/警告 */
  status: "pass" | "fail" | "warning";
  /** 详细说明 */
  note?: string;
}

/** Standards 轴审查结果 */
export interface StandardsReview {
  /** 所有检查项 */
  checks: StandardsCheck[];
  /** 是否通过 */
  passed: boolean;
  /** 失败项数 */
  failedCount: number;
  /** 警告项数 */
  warningCount: number;
  /** 摘要 */
  summary: string;
}

// === Standards 轴规则定义 ===

/**
 * Standards 轴规则 - 来自 code-review 技能的 Standards 轴。
 *
 * 规则检查代码是否遵循仓库的文档化编码标准。
 * 每条规则接受 ImplementationResult，返回 StandardsCheck。
 */
export interface StandardsRule {
  /** 规则 ID（如 STD-001） */
  ruleId: string;
  /** 规则描述 */
  description: string;
  /** 检查函数 - 返回 pass/fail/warning + 可选说明 */
  check: (impl: ImplementationResult) => Omit<StandardsCheck, "ruleId" | "check">;
}

/**
 * 默认 Standards 规则集 - 跨角色通用的编码标准检查。
 *
 * 覆盖 code-review 技能 Standards 轴的核心关注点：
 *   命名 / 验证证据 / 类型安全 / 错误处理 / 文档 / 无秘密 / 无死代码
 */
export const DEFAULT_STANDARDS_RULES: StandardsRule[] = [
  {
    ruleId: "STD-001",
    description: "Outputs follow kebab-case / camelCase naming convention",
    check: (impl) => {
      const bad = impl.actualOutputs.filter((o) => /\s|[A-Z]{2,}/.test(o) && !/^[A-Z_]+$/.test(o));
      if (bad.length > 0) {
        return { status: "warning", note: `Suspicious naming: ${bad.join(", ")}` };
      }
      return { status: "pass" };
    },
  },
  {
    ruleId: "STD-002",
    description: "Verification passed with fresh evidence (not assumed)",
    check: (impl) =>
      impl.verificationPassed
        ? { status: "pass" }
        : { status: "fail", note: "Verification not passed - no evidence of correctness" },
  },
  {
    ruleId: "STD-003",
    description: "Implementation has at least one output",
    check: (impl) =>
      impl.actualOutputs.length > 0
        ? { status: "pass" }
        : { status: "fail", note: "No outputs produced" },
  },
  {
    ruleId: "STD-004",
    description: "No secrets / credentials leaked in details",
    check: (impl) => {
      const details = impl.details ?? {};
      const serialized = JSON.stringify(details);
      if (/(api[_-]?key|secret|password|token|Bearer\s)/i.test(serialized)) {
        return { status: "fail", note: "Potential secret detected in implementation details" };
      }
      return { status: "pass" };
    },
  },
  {
    ruleId: "STD-005",
    description: "Confidence (if present) is in valid range [0, 1]",
    check: (impl) => {
      const c = impl.details?.confidence;
      if (typeof c !== "number") return { status: "pass", note: "Confidence not provided (optional)" };
      if (c < 0 || c > 1) return { status: "fail", note: `Confidence ${c} out of range [0, 1]` };
      return { status: "pass" };
    },
  },
  {
    ruleId: "STD-006",
    description: "No obvious dead code (empty arrays / empty strings as outputs)",
    check: (impl) => {
      const empty = impl.actualOutputs.filter((o) => typeof o === "string" && o.trim().length === 0);
      if (empty.length > 0) {
        return { status: "warning", note: `${empty.length} empty output(s) detected` };
      }
      return { status: "pass" };
    },
  },
  {
    ruleId: "STD-007",
    description: "Brief / summary (if present) is non-empty",
    check: (impl) => {
      const brief = impl.details?.brief;
      if (typeof brief === "string" && brief.trim().length === 0) {
        return { status: "fail", note: "Brief is empty" };
      }
      return { status: "pass" };
    },
  },
];

/**
 * 运行 Standards 轴审查 - 融入 code-review 技能的双轴模型。
 *
 * @param implementation - 实际产出
 * @param rules          - 可选的自定义规则集（默认使用 DEFAULT_STANDARDS_RULES）
 * @returns Standards 轴审查结果
 */
export function runStandardsReview(
  implementation: ImplementationResult,
  rules: StandardsRule[] = DEFAULT_STANDARDS_RULES
): StandardsReview {
  const checks: StandardsCheck[] = rules.map((rule) => {
    const result = rule.check(implementation);
    return {
      ruleId: rule.ruleId,
      check: rule.description,
      status: result.status,
      note: result.note,
    };
  });

  const failedCount = checks.filter((c) => c.status === "fail").length;
  const warningCount = checks.filter((c) => c.status === "warning").length;
  const passedCount = checks.filter((c) => c.status === "pass").length;
  const passed = failedCount === 0;

  const summary = passed
    ? `Standards review passed: ${passedCount} pass, ${warningCount} warning(s)`
    : `Standards review failed: ${failedCount} fail, ${warningCount} warning(s), ${passedCount} pass`;

  return { checks, passed, failedCount, warningCount, summary };
}

// === 阶段 1：规格符合性审查 ===

/** 规格符合性审查结果 */
export interface SpecComplianceReview {
  /** 是否通过 */
  passed: boolean;
  /** 遗漏的需求 */
  missingRequirements: string[];
  /** 额外的、不需要的工作 */
  extraWork: string[];
  /** 误解 - 做了正确的事但方式错误 */
  misunderstandings: string[];
  /** 审查摘要 */
  summary: string;
}

// === 阶段 2：代码/产出质量审查 ===

/** 质量审查结果 */
export interface CodeQualityReview {
  /** 优点 */
  strengths: string[];
  /** Critical Must-Fix 问题 */
  criticalIssues: string[];
  /** Important Should-Fix 问题 */
  importantIssues: string[];
  /** Minor Nice-to-Have 问题 */
  minorIssues: string[];
  /** Standards 轴检查结果（融入 code-review 技能） */
  standardsChecks?: StandardsReview;
  /** 是否可以合并/通过 */
  readyToMerge: boolean;
  /** 审查摘要 */
  summary: string;
}

// === 两阶段审查结果 ===

/** 两阶段审查完整结果 */
export interface TwoStageReviewResult {
  /** 阶段 1：规格符合性审查 */
  specReview: SpecComplianceReview;
  /** 阶段 2：质量审查（仅阶段 1 通过后执行，否则 undefined） */
  qualityReview?: CodeQualityReview;
}

// === 审查输入 ===

/** 规格定义 - 描述期望的产出 */
export interface SpecDefinition {
  /** 期望的产出字段列表 */
  expectedOutputs: string[];
  /** 验证检查清单 */
  checklist?: string[];
  /** 约束条件 */
  constraints?: string[];
}

/** 实际产出 - 描述实际执行结果 */
export interface ImplementationResult {
  /** 实际产出的字段列表 */
  actualOutputs: string[];
  /** 验证通过的证据 */
  verificationPassed: boolean;
  /** 产出详情（角色特定） */
  details?: Record<string, unknown>;
}

// === 两阶段审查函数 ===

/**
 * 两阶段审查 - 严格按顺序执行。
 *
 * 阶段 1：规格符合性审查
 *   - 检查遗漏的需求（expectedOutputs 中有但 actualOutputs 中没有）
 *   - 检查额外的工作（actualOutputs 中有但 expectedOutputs 中没有）
 *   - 检查验证是否通过
 *
 * 阶段 2：质量审查（仅阶段 1 通过后）
 *   - 检查产出质量
 *   - 按严重度分类问题
 *
 * "Starting code quality review before spec compliance passes is a red flag."
 *
 * @param spec           - 规格定义
 * @param implementation - 实际产出
 * @returns 两阶段审查结果
 */
export function twoStageReview(
  spec: SpecDefinition,
  implementation: ImplementationResult
): TwoStageReviewResult {
  // === 阶段 1：规格符合性审查 ===
  const specReview = runSpecComplianceReview(spec, implementation);

  // 规格审查未通过 -> 不执行质量审查
  if (!specReview.passed) {
    return { specReview };
  }

  // === 阶段 2：质量审查 ===
  const qualityReview = runQualityReview(implementation);

  return { specReview, qualityReview };
}

/**
 * 阶段 1：规格符合性审查。
 *
 * 吸收 superpowers spec-reviewer-prompt.md：
 *   "The implementer finished suspiciously quickly. Verify everything independently."
 *   DO NOT: take their word, trust completeness claims, accept their interpretation
 *   DO: read actual code, compare line-by-line, check for missing pieces, look for unneeded extra features
 */
function runSpecComplianceReview(
  spec: SpecDefinition,
  implementation: ImplementationResult
): SpecComplianceReview {
  const missingRequirements: string[] = [];
  const extraWork: string[] = [];
  const misunderstandings: string[] = [];

  // 检查遗漏的需求
  for (const expected of spec.expectedOutputs) {
    if (!implementation.actualOutputs.includes(expected)) {
      missingRequirements.push(`Expected output "${expected}" is missing`);
    }
  }

  // 检查额外的工作
  for (const actual of implementation.actualOutputs) {
    if (!spec.expectedOutputs.includes(actual)) {
      extraWork.push(`Unexpected output "${actual}" not in spec`);
    }
  }

  // 检查验证是否通过
  if (!implementation.verificationPassed) {
    misunderstandings.push("Verification not passed - implementation may not work correctly");
  }

  // 检查清单
  if (spec.checklist) {
    // Checklist items are validated externally; here we just note they exist
    // The actual validation happens in the verification gate
  }

  // 检查约束
  if (spec.constraints) {
    // Constraints are validated by contract.ts; here we note they exist
  }

  const passed = missingRequirements.length === 0
    && misunderstandings.length === 0;

  const summaryParts: string[] = [];
  if (passed) {
    summaryParts.push("Spec compliance verified");
  } else {
    if (missingRequirements.length > 0) summaryParts.push(`${missingRequirements.length} missing requirement(s)`);
    if (extraWork.length > 0) summaryParts.push(`${extraWork.length} extra work item(s)`);
    if (misunderstandings.length > 0) summaryParts.push(`${misunderstandings.length} misunderstanding(s)`);
  }

  return {
    passed,
    missingRequirements,
    extraWork,
    misunderstandings,
    summary: summaryParts.join(", ") || "All checks passed",
  };
}

/**
 * 阶段 2：质量审查。
 *
 * 吸收 superpowers code-quality-reviewer-prompt.md：
 *   "Categorize by actual severity (not everything is Critical)"
 *   "Acknowledge strengths before issues so implementer trusts feedback"
 */
function runQualityReview(
  implementation: ImplementationResult
): CodeQualityReview {
  const strengths: string[] = [];
  const criticalIssues: string[] = [];
  const importantIssues: string[] = [];
  const minorIssues: string[] = [];

  // === Standards 轴审查（融入 code-review 技能双轴模型） ===
  const standardsChecks = runStandardsReview(implementation);

  // Standards 轴失败项 -> Critical Issues
  for (const check of standardsChecks.checks) {
    if (check.status === "fail") {
      criticalIssues.push(`[${check.ruleId}] ${check.check}${check.note ? `: ${check.note}` : ""}`);
    } else if (check.status === "warning") {
      minorIssues.push(`[${check.ruleId}] ${check.check}${check.note ? `: ${check.note}` : ""}`);
    }
  }

  // 优点
  if (implementation.verificationPassed) {
    strengths.push("Verification passed with fresh evidence");
  }
  if (implementation.actualOutputs.length > 0) {
    strengths.push(`Produced ${implementation.actualOutputs.length} output(s): ${implementation.actualOutputs.join(", ")}`);
  }
  if (standardsChecks.passed && standardsChecks.warningCount === 0) {
    strengths.push(`Standards review clean: ${standardsChecks.checks.length} rule(s) all passed`);
  }

  // 质量检查（基于 details）
  const details = implementation.details ?? {};

  // 检查 confidence 合理性（Standards STD-005 已覆盖范围，此处检查语义）
  if (typeof details.confidence === "number") {
    if (details.confidence === 0 && Array.isArray(details.signals) && details.signals.length > 0) {
      importantIssues.push("Confidence is 0 but signals are present - confidence should be backed by signals");
    }
  }

  const readyToMerge = criticalIssues.length === 0 && standardsChecks.passed;
  const summary = readyToMerge
    ? `Quality review passed: ${strengths.length} strength(s), ${importantIssues.length} important, ${minorIssues.length} minor | Standards: ${standardsChecks.summary}`
    : `Quality review failed: ${criticalIssues.length} critical issue(s) | Standards: ${standardsChecks.summary}`;

  return {
    strengths,
    criticalIssues,
    importantIssues,
    minorIssues,
    standardsChecks,
    readyToMerge,
    summary,
  };
}

/**
 * 格式化两阶段审查报告为人类可读字符串。
 */
export function formatReviewReport(review: TwoStageReviewResult): string {
  const lines: string[] = [];

  // 阶段 1
  lines.push("=== Stage 1: Spec Compliance Review ===");
  if (review.specReview.passed) {
    lines.push("  ✅ PASSED");
  } else {
    lines.push("  ❌ FAILED");
    if (review.specReview.missingRequirements.length > 0) {
      lines.push("  Missing requirements:");
      review.specReview.missingRequirements.forEach((r) => lines.push(`    - ${r}`));
    }
    if (review.specReview.extraWork.length > 0) {
      lines.push("  Extra work:");
      review.specReview.extraWork.forEach((e) => lines.push(`    - ${e}`));
    }
    if (review.specReview.misunderstandings.length > 0) {
      lines.push("  Misunderstandings:");
      review.specReview.misunderstandings.forEach((m) => lines.push(`    - ${m}`));
    }
  }

  // 阶段 2
  if (review.qualityReview) {
    lines.push("");
    lines.push("=== Stage 2: Code Quality Review ===");
    if (review.qualityReview.readyToMerge) {
      lines.push("  ✅ READY TO MERGE");
    } else {
      lines.push("  ❌ NOT READY");
    }

    // === Standards 轴（融入 code-review 技能双轴模型） ===
    if (review.qualityReview.standardsChecks) {
      const sc = review.qualityReview.standardsChecks;
      lines.push("");
      lines.push(`  --- Standards Axis (${sc.checks.length} rules) ---`);
      lines.push(`  ${sc.passed ? "✅ PASSED" : "❌ FAILED"}: ${sc.summary}`);
      for (const check of sc.checks) {
        const icon = check.status === "pass" ? "✓" : check.status === "fail" ? "🔴" : "⚠";
        lines.push(`    ${icon} [${check.ruleId}] ${check.check}${check.note ? ` — ${check.note}` : ""}`);
      }
    }

    if (review.qualityReview.strengths.length > 0) {
      lines.push("  Strengths:");
      review.qualityReview.strengths.forEach((s) => lines.push(`    + ${s}`));
    }
    if (review.qualityReview.criticalIssues.length > 0) {
      lines.push("  Critical Must-Fix:");
      review.qualityReview.criticalIssues.forEach((i) => lines.push(`    🔴 ${i}`));
    }
    if (review.qualityReview.importantIssues.length > 0) {
      lines.push("  Important Should-Fix:");
      review.qualityReview.importantIssues.forEach((i) => lines.push(`    🟡 ${i}`));
    }
    if (review.qualityReview.minorIssues.length > 0) {
      lines.push("  Minor Nice-to-Have:");
      review.qualityReview.minorIssues.forEach((i) => lines.push(`    🟢 ${i}`));
    }
  } else {
    lines.push("");
    lines.push("=== Stage 2: Code Quality Review ===");
    lines.push("  ⏸ SKIPPED (spec compliance not passed)");
  }

  return lines.join("\n");
}
