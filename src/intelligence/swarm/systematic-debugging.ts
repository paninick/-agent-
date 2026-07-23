/**
 * swarm/systematic-debugging.ts - 系统化调试四阶段
 *
 * 吸收 superpowers systematic-debugging 的 Iron Law：
 *   "NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST"
 *   "Violating the letter of this process is violating the spirit of debugging."
 *
 * 四阶段：
 *   1. Root Cause Investigation - 读取错误、复现、检查变更、追踪数据流
 *   2. Pattern Analysis - 找到正常案例、对比、识别差异
 *   3. Hypothesis and Testing - 形成假设、最小测试、验证
 *   4. Implementation - 创建失败测试、实施修复、验证
 *
 * "3+ fixes failed = architectural problem, not a failed hypothesis."
 */

import type { Anomaly } from "../reconciliation/types";

// === 调试阶段类型 ===

export type DebugPhase = "root_cause" | "pattern_analysis" | "hypothesis_test" | "implementation";

// === 调试会话 ===

/** 系统化调试会话 - 跟踪四阶段进展 */
export interface DebuggingSession {
  /** 会话 ID */
  id: string;
  /** 当前阶段 */
  phase: DebugPhase;
  /** 关联的异常 */
  anomalyId: string;
  /** 异常描述 */
  anomalyDescription: string;
  /** 当前假设（阶段 3） */
  hypothesis?: string;
  /** 修复尝试次数 */
  attempts: number;
  /** 找到的根因（阶段 1 结束时填写） */
  rootCause?: string;
  /** 修复是否已验证（阶段 4 结束时填写） */
  fixVerified: boolean;
  /** 各阶段的证据记录 */
  evidence: Record<DebugPhase, string[]>;
  /** 是否需要质疑架构（3 次失败后） */
  shouldQuestionArchitecture: boolean;
  /** 会话开始时间 */
  startedAt: string;
}

// === 会话管理 ===

let debugSessionCounter = 0;

/**
 * 启动调试会话 - 从一个异常开始。
 *
 * "Phase 1 must complete before any fixes are proposed."
 *
 * @param anomaly - 触发调试的异常
 * @returns 新的调试会话（初始阶段为 root_cause）
 */
export function startDebuggingSession(anomaly: Anomaly): DebuggingSession {
  debugSessionCounter += 1;
  const now = new Date().toISOString();

  return {
    id: `debug-${debugSessionCounter}`,
    phase: "root_cause",
    anomalyId: anomaly.id,
    anomalyDescription: anomaly.description,
    attempts: 0,
    fixVerified: false,
    evidence: {
      root_cause: [],
      pattern_analysis: [],
      hypothesis_test: [],
      implementation: [],
    },
    shouldQuestionArchitecture: false,
    startedAt: now,
  };
}

/**
 * 推进调试阶段 - 根据证据推进到下一阶段。
 *
 * 阶段顺序：root_cause -> pattern_analysis -> hypothesis_test -> implementation
 *
 * @param session  - 当前调试会话
 * @param evidence - 本阶段收集的证据
 * @returns 更新后的调试会话
 */
export function advancePhase(
  session: DebuggingSession,
  evidence: string
): DebuggingSession {
  const phaseOrder: DebugPhase[] = ["root_cause", "pattern_analysis", "hypothesis_test", "implementation"];
  const currentIdx = phaseOrder.indexOf(session.phase);

  // 记录证据到当前阶段
  session.evidence[session.phase].push(evidence);

  // 如果在 root_cause 阶段且证据中包含根因描述，记录之
  if (session.phase === "root_cause" && !session.rootCause) {
    session.rootCause = evidence;
  }

  // 如果在 implementation 阶段且证据表明修复验证通过
  if (session.phase === "implementation" && /verified|passed|resolved/i.test(evidence)) {
    session.fixVerified = true;
  }

  // 推进到下一阶段
  if (currentIdx < phaseOrder.length - 1) {
    session.phase = phaseOrder[currentIdx + 1];
  }

  // 检查是否需要质疑架构
  session.shouldQuestionArchitecture = shouldQuestionArchitecture(session);

  return { ...session };
}

/**
 * 记录修复尝试 - 在 hypothesis_test 或 implementation 阶段。
 *
 * "If 3+ fixes failed: Question Architecture."
 *
 * @param session - 当前调试会话
 * @param attemptDescription - 修复尝试描述
 * @param succeeded - 是否成功
 * @returns 更新后的调试会话
 */
export function recordFixAttempt(
  session: DebuggingSession,
  attemptDescription: string,
  succeeded: boolean
): DebuggingSession {
  session.attempts += 1;
  session.evidence.implementation.push(`Attempt ${session.attempts}: ${attemptDescription} -> ${succeeded ? "success" : "failed"}`);

  if (succeeded) {
    session.fixVerified = true;
  } else {
    // 失败后回退到 hypothesis_test 阶段，形成新假设
    session.phase = "hypothesis_test";
    session.hypothesis = undefined;
  }

  session.shouldQuestionArchitecture = shouldQuestionArchitecture(session);

  return { ...session };
}

/**
 * 判断是否需要质疑架构。
 *
 * "3+ fixes failed = architectural problem.
 *  This is NOT a failed hypothesis - this is a wrong architecture."
 *
 * @param session - 当前调试会话
 * @returns true 表示已达到 3 次失败阈值
 */
export function shouldQuestionArchitecture(session: DebuggingSession): boolean {
  return session.attempts >= 3 && !session.fixVerified;
}

// === 四阶段检查清单 ===

/**
 * 阶段 1 检查清单 - Root Cause Investigation。
 *
 * 吸收 superpowers 的 5 步根因调查：
 *   1. Read error messages carefully
 *   2. Reproduce consistently
 *   3. Check recent changes
 *   4. Gather evidence at component boundaries
 *   5. Trace data flow
 */
export function rootCauseChecklist(): string[] {
  return [
    "Read error messages carefully (stack traces, line numbers, codes)",
    "Reproduce consistently (reliable trigger? every time?)",
    "Check recent changes (git diff, commits, dependencies, config, environment)",
    "Gather evidence at each component boundary (log what enters/exits)",
    "Trace data flow backwards to find the original trigger",
  ];
}

/**
 * 阶段 2 检查清单 - Pattern Analysis。
 */
export function patternAnalysisChecklist(): string[] {
  return [
    "Find working examples in the same codebase",
    "Compare against references (read reference implementation COMPLETELY)",
    "Identify differences (list every difference, however small)",
    "Understand dependencies (components, settings, config, environment, assumptions)",
  ];
}

/**
 * 阶段 3 检查清单 - Hypothesis and Testing。
 */
export function hypothesisTestChecklist(): string[] {
  return [
    "Form single hypothesis (state clearly: 'I think X is the root cause because Y')",
    "Test minimally (smallest possible change, one variable at a time)",
    "Verify before continuing (worked? -> Phase 4; didn't? -> form NEW hypothesis)",
    "When you don't know - say so, don't pretend, ask for help",
  ];
}

/**
 * 阶段 4 检查清单 - Implementation。
 */
export function implementationChecklist(): string[] {
  return [
    "Create failing test case (simplest reproduction, MUST have before fixing)",
    "Implement single fix (address root cause, ONE change at a time)",
    "Verify fix (test passes, no other tests broken, issue resolved)",
    "If fix doesn't work: STOP, count attempts, if <3 return to Phase 1",
    "If 3+ fixes failed: Question Architecture (discuss with human partner)",
  ];
}

/**
 * 获取当前阶段的检查清单。
 */
export function getPhaseChecklist(phase: DebugPhase): string[] {
  switch (phase) {
    case "root_cause":
      return rootCauseChecklist();
    case "pattern_analysis":
      return patternAnalysisChecklist();
    case "hypothesis_test":
      return hypothesisTestChecklist();
    case "implementation":
      return implementationChecklist();
    default:
      return [];
  }
}

// === 格式化报告 ===

/**
 * 格式化调试报告为人类可读字符串。
 */
export function formatDebugReport(session: DebuggingSession): string {
  const lines: string[] = [];
  const phaseNames: Record<DebugPhase, string> = {
    root_cause: "Root Cause Investigation",
    pattern_analysis: "Pattern Analysis",
    hypothesis_test: "Hypothesis and Testing",
    implementation: "Implementation",
  };

  lines.push(`=== Debugging Session ${session.id} ===`);
  lines.push(`Anomaly: ${session.anomalyDescription}`);
  lines.push(`Phase: ${phaseNames[session.phase]}`);
  lines.push(`Attempts: ${session.attempts}`);

  if (session.rootCause) {
    lines.push(`Root Cause: ${session.rootCause}`);
  }

  if (session.hypothesis) {
    lines.push(`Hypothesis: ${session.hypothesis}`);
  }

  if (session.fixVerified) {
    lines.push("✅ Fix verified");
  } else {
    lines.push("❌ Fix not yet verified");
  }

  if (session.shouldQuestionArchitecture) {
    lines.push("⚠️ ARCHITECTURAL PROBLEM DETECTED - 3+ fix attempts failed");
    lines.push("  This is NOT a failed hypothesis - this is a wrong architecture.");
    lines.push("  STOP and question fundamentals. Discuss with human partner.");
  }

  // 各阶段证据
  for (const phase of ["root_cause", "pattern_analysis", "hypothesis_test", "implementation"] as DebugPhase[]) {
    const evidence = session.evidence[phase];
    if (evidence.length > 0) {
      lines.push("");
      lines.push(`Evidence [${phaseNames[phase]}]:`);
      evidence.forEach((e) => lines.push(`  - ${e}`));
    }
  }

  return lines.join("\n");
}

// === 红旗检测 ===

/**
 * 调试红旗 - 出现这些信号时应停止当前方法。
 *
 * 吸收 superpowers systematic-debugging 的 Red Flags 列表。
 */
export function getDebuggingRedFlags(): string[] {
  return [
    "Quick fix for now, investigate later",
    "Just try changing X and see",
    "Add multiple changes, run tests",
    "Proposing solutions before tracing data flow",
    "One more fix attempt (when already tried 2+)",
    "Each fix reveals new problem in different place",
  ];
}

// === 6 步调试循环（融入 TRAE-debugger 技能） ===
//
// TRAE-debugger 技能的科学调试流程：
//   假设 (Hypothesis) → 插桩 (Instrument) → 复现 (Reproduce)
//   → 分析 (Analyze) → 修复 (Fix) → 验证 (Verify)
//
// 6 步构成一个循环：验证失败时回到假设步骤，形成新假设。
// 与现有 4 阶段模型的关系：
//   6-step 是更细粒度的操作层，4-phase 是高层阶段进展。
//   hypothesis + instrument + reproduce ⊂ root_cause / hypothesis_test
//   analyze ⊂ pattern_analysis / hypothesis_test
//   fix + verify ⊂ implementation

export type DebugStep =
  | "hypothesis"
  | "instrument"
  | "reproduce"
  | "analyze"
  | "fix"
  | "verify";

/** 单步执行记录 */
export interface DebugStepRecord {
  /** 步骤 */
  step: DebugStep;
  /** 该步骤的假设/动作描述 */
  action: string;
  /** 收集到的证据 */
  evidence: string;
  /** 该步骤结果 */
  result: "pass" | "fail" | "inconclusive";
  /** 时间戳 */
  timestamp: string;
  /** 循环轮次（第几次进入此步骤） */
  loopIteration: number;
}

/** 6 步调试循环状态 */
export interface DebugLoopState {
  /** 当前步骤 */
  currentStep: DebugStep;
  /** 已完成的步骤记录 */
  steps: DebugStepRecord[];
  /** 循环轮次（完整走完 6 步为 1 轮） */
  loopCount: number;
  /** 是否已验证通过 */
  verified: boolean;
}

/** 6 步顺序 */
const STEP_ORDER: DebugStep[] = [
  "hypothesis",
  "instrument",
  "reproduce",
  "analyze",
  "fix",
  "verify",
];

/** 6 步显示名 */
const STEP_NAMES: Record<DebugStep, string> = {
  hypothesis: "Hypothesis (形成假设)",
  instrument: "Instrument (插桩收集)",
  reproduce: "Reproduce (复现问题)",
  analyze: "Analyze (分析数据)",
  fix: "Fix (实施修复)",
  verify: "Verify (验证修复)",
};

/**
 * 初始化 6 步调试循环。
 *
 * 起始步骤为 hypothesis - 必须先形成假设，再插桩。
 * "NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST"
 */
export function startDebugLoop(): DebugLoopState {
  return {
    currentStep: "hypothesis",
    steps: [],
    loopCount: 1,
    verified: false,
  };
}

/**
 * 记录一个调试步骤的执行结果，并推进到下一步。
 *
 * 循环逻辑：
 *   - verify 步骤 result=pass → verified=true，循环结束
 *   - verify 步骤 result=fail → 回到 hypothesis，loopCount+1
 *   - 其他步骤 result=fail → 回到 hypothesis（重新假设）
 *   - result=inconclusive → 仍推进到下一步（保留判断）
 *
 * @param state    - 当前循环状态
 * @param action   - 本步骤执行的动作描述
 * @param evidence - 收集到的证据
 * @param result   - 本步骤结果
 * @returns 更新后的循环状态
 */
export function runDebugStep(
  state: DebugLoopState,
  action: string,
  evidence: string,
  result: "pass" | "fail" | "inconclusive"
): DebugLoopState {
  const record: DebugStepRecord = {
    step: state.currentStep,
    action,
    evidence,
    result,
    timestamp: new Date().toISOString(),
    loopIteration: state.loopCount,
  };

  const steps = [...state.steps, record];
  let currentStep = state.currentStep;
  let loopCount = state.loopCount;
  let verified = state.verified;

  if (state.currentStep === "verify" && result === "pass") {
    // 验证通过 → 循环结束
    verified = true;
  } else if (result === "fail") {
    // 任何步骤失败 → 回到假设步骤
    if (state.currentStep === "verify") {
      loopCount += 1;
    }
    currentStep = "hypothesis";
  } else {
    // pass 或 inconclusive → 推进到下一步
    const idx = STEP_ORDER.indexOf(state.currentStep);
    if (idx < STEP_ORDER.length - 1) {
      currentStep = STEP_ORDER[idx + 1];
    }
  }

  return { currentStep, steps, loopCount, verified };
}

/**
 * 6 步调试循环 - 各步骤的检查清单。
 *
 * 吸收 TRAE-debugger 技能的科学调试流程指引。
 */
export function debugStepChecklist(step: DebugStep): string[] {
  switch (step) {
    case "hypothesis":
      return [
        "State hypothesis clearly: 'I think X is the root cause because Y'",
        "Hypothesis must be falsifiable - define what evidence would disprove it",
        "One hypothesis at a time - do not bundle multiple causes",
        "Base hypothesis on existing evidence, not guesses",
      ];
    case "instrument":
      return [
        "Add minimal logging/probes at component boundaries",
        "Log what enters and exits each boundary (inputs + outputs)",
        "Do NOT modify logic during instrumentation - only observe",
        "Ensure instrumentation is removable (mark with TODO-DEBUG)",
      ];
    case "reproduce":
      return [
        "Reproduce consistently - reliable trigger, not intermittent",
        "Record exact reproduction steps",
        "Test in isolation - minimize variables",
        "If cannot reproduce: document environment differences",
      ];
    case "analyze":
      return [
        "Compare actual vs expected behavior at each boundary",
        "Trace data flow backwards from symptom to origin",
        "Identify the exact divergence point",
        "List every difference from working examples, however small",
      ];
    case "fix":
      return [
        "Create failing test case FIRST (simplest reproduction)",
        "Implement single fix - ONE change at a time",
        "Address root cause, not symptom",
        "Do not add error handling to mask the bug",
      ];
    case "verify":
      return [
        "Failing test now passes",
        "No existing tests broken (run full suite)",
        "Remove instrumentation code",
        "Verify in production-like environment if possible",
        "If verification fails: do NOT patch - return to hypothesis",
      ];
    default:
      return [];
  }
}

/**
 * 格式化 6 步调试循环报告。
 */
export function formatDebugStepsReport(state: DebugLoopState): string {
  const lines: string[] = [];

  lines.push("=== 6-Step Debug Loop ===");
  lines.push(`Current step: ${STEP_NAMES[state.currentStep]}`);
  lines.push(`Loop iteration: ${state.loopCount}`);
  lines.push(`Verified: ${state.verified ? "✅ YES" : "❌ NO"}`);
  lines.push(`Total steps recorded: ${state.steps.length}`);

  if (state.steps.length > 0) {
    lines.push("");
    lines.push("Step history:");
    for (const rec of state.steps) {
      const icon = rec.result === "pass" ? "✓" : rec.result === "fail" ? "🔴" : "?";
      lines.push(`  ${icon} [Loop ${rec.loopIteration}] ${STEP_NAMES[rec.step]}`);
      lines.push(`    Action: ${rec.action}`);
      lines.push(`    Evidence: ${rec.evidence}`);
      lines.push(`    Result: ${rec.result} @ ${rec.timestamp}`);
    }
  }

  // 当前步骤的检查清单
  lines.push("");
  lines.push(`Current step checklist (${STEP_NAMES[state.currentStep]}):`);
  for (const item of debugStepChecklist(state.currentStep)) {
    lines.push(`  - ${item}`);
  }

  return lines.join("\n");
}
