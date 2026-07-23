/**
 * scripts/simulate-superpowers-patterns.ts - Superpowers 15 模式仿真验证
 *
 * 10 个场景逐一验证每个架构模式的核心行为：
 *   1. 四态协议 - completed/done_with_concerns/needs_context/blocked
 *   2. 升级阶梯 - 4 步升级（provide_context -> escalate_model -> split_task -> escalate_human）
 *   3. 验证门 - 5 步 IDENTIFY->RUN->READ->VERIFY->CLAIM
 *   4. 契约校验 - pre/post 越界检测
 *   5. 红旗检测 - 空 candidate / 缺 sourceId / 跳门
 *   6. 三级严重度 - mismatch=critical / warning=important / matched=minor
 *   7. 指令优先级 - USER_CONFIG > INDUSTRY_PACK > DEFAULT
 *   8. 自由度分级 - 19 条规则 low/medium/high
 *   9. 渐进式披露 - 三层 metadata/schema/reference
 *   10. 两阶段审查 - spec compliance THEN code quality
 *   11. CSO 描述验证 - "Use when..." 前缀 + 无工作流步骤
 *   12. 系统化调试 - 四阶段 + 3 次失败质疑架构
 *   13. 并行派发 - 决策树 + 聚焦 prompt
 *   14. 计划-验证-执行 - 无占位符 + 验证后执行
 *   15. 模型选择 - 6 角色 modelTier 分配
 *
 * 运行方式：node --import tsx scripts/simulate-superpowers-patterns.ts
 */

import {
  // 四态 + 升级
  handleAgentStatus,
  escalateBlocker,
  // 契约 + 验证门 + 红旗
  validateContract,
  verifyCompletion,
  checkRedFlags,
  createVerificationEvidence,
  // 5步验证门
  verifyBeforeCompletion,
  detectRedFlagWords,
  scoutVerificationClaims,
  verifierVerificationClaims,
  // 严重度
  buildSeverityReport,
  hasBlockingIssues,
  // 指令优先级
  resolveInstructionConflict,
  InstructionPriority,
  // 自由度
  getRuleFreedom,
  groupRulesByFreedom,
  FREEDOM_DECLARATIONS,
  // 渐进式披露
  ProgressiveDisclosureRegistry,
  registerIndustryPack,
  // CSO
  validateCSODescription,
  buildCSOMetadata,
  AGENT_CSO_METADATA,
  // 两阶段审查
  twoStageReview,
  // 系统化调试
  startDebuggingSession,
  advancePhase,
  recordFixAttempt,
  // 并行派发
  assessDispatch,
  createParallelDispatchPlan,
  createFocusedAgentPrompt,
  // 计划-验证-执行
  validateReconciliationPlan,
  executeWithValidation,
  checkForPlaceholders,
  // profiles
  getRoleProfile,
  AGENT_ROLE_PROFILES,
  DEFAULT_SWARM_WORKFLOW,
} from "../src/intelligence";
import type { AgentRunResult, SwarmTask } from "../src/intelligence";
import { apparelPack } from "../src/intelligence";
import { reconcileQuantity } from "../src/intelligence";

// ============================================================
// 辅助
// ============================================================

let scenarioCount = 0;
let passCount = 0;
let failCount = 0;

function scenario(name: string, fn: () => void): void {
  scenarioCount += 1;
  console.log(`\n${"=".repeat(60)}`);
  console.log(`场景 ${scenarioCount}: ${name}`);
  console.log("=".repeat(60));
  try {
    fn();
    passCount += 1;
    console.log(`  ✅ PASS`);
  } catch (err) {
    failCount += 1;
    console.log(`  ❌ FAIL: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function makeTask(role: SwarmTask["role"], id: string): SwarmTask {
  return {
    id,
    triggerId: "trig-sim",
    role,
    objective: `simulate ${role}`,
    inputs: {},
    status: "pending",
    createdAt: "2026-07-09T00:00:00Z",
  };
}

function makeResult(role: AgentRunResult["role"], status: AgentRunResult["status"], extra?: Partial<AgentRunResult>): AgentRunResult {
  return { taskId: `task-${role}`, role, status, ...extra };
}

// ============================================================
// 场景 1：四态协议
// ============================================================

scenario("四态协议 - 5 种状态各自返回正确动作", () => {
  const completed = makeResult("scout", "completed", { candidateSourceIds: ["src-1"] });
  const concerns = makeResult("analyst", "done_with_concerns", { concerns: ["low confidence"] });
  const needsCtx = makeResult("collector", "needs_context", { missingContext: ["registry"] });
  const blocked = makeResult("verifier", "blocked", { blockerReason: "gate crash" });
  const failed = makeResult("memory", "failed", { error: "write error" });

  assert(handleAgentStatus(completed, DEFAULT_SWARM_WORKFLOW, 0).action === "proceed", "completed -> proceed");
  assert(handleAgentStatus(concerns, DEFAULT_SWARM_WORKFLOW, 0).action === "record_concerns_and_proceed", "concerns -> record");
  assert(handleAgentStatus(needsCtx, DEFAULT_SWARM_WORKFLOW, 0).action === "retry_with_context", "needs_context -> retry");
  assert(handleAgentStatus(blocked, DEFAULT_SWARM_WORKFLOW, 0).action === "escalate", "blocked -> escalate");
  assert(handleAgentStatus(failed, DEFAULT_SWARM_WORKFLOW, 0).action === "abort", "failed -> abort");
});

// ============================================================
// 场景 2：升级阶梯
// ============================================================

scenario("升级阶梯 - 4 步升级序列", () => {
  const result = makeResult("scout", "blocked", { blockerReason: "cannot find sources" });

  // 阶梯 1：补充上下文
  const step1 = escalateBlocker(result, 0, 3);
  assert(step1.type === "provide_context", `step 1 should be provide_context, got ${step1.type}`);

  // 阶梯 2：升级模型
  const step2 = escalateBlocker(result, 1, 3);
  assert(step2.type === "escalate_model", `step 2 should be escalate_model, got ${step2.type}`);

  // 阶梯 3：拆分任务
  const step3 = escalateBlocker(result, 2, 3);
  assert(step3.type === "split_task", `step 3 should be split_task, got ${step3.type}`);

  // 阶梯 4：上报人类
  const step4 = escalateBlocker(result, 3, 3);
  assert(step4.type === "escalate_human", `step 4 should be escalate_human, got ${step4.type}`);
});

// ============================================================
// 场景 3：验证门（5 步）
// ============================================================

scenario("验证门 - 5 步 IDENTIFY->RUN->READ->VERIFY->CLAIM", () => {
  // scout 验证：候选列表非空
  const goodClaims = scoutVerificationClaims(["world-bank", "fred", "ecb"]);
  const goodResult = verifyBeforeCompletion(goodClaims);
  assert(goodResult.allPassed, "non-empty candidate list should pass verification");
  assert(goodResult.passedCount === 1, "should have 1 passed claim");
  assert(goodResult.report.includes("PASSED"), "report should say PASSED");

  // 空列表 -> 验证失败
  const badClaims = scoutVerificationClaims([]);
  const badResult = verifyBeforeCompletion(badClaims);
  assert(!badResult.allPassed, "empty candidate list should fail verification");
  assert(badResult.failedCount === 1, "should have 1 failed claim");

  // 红旗措辞检测
  const flags = detectRedFlagWords("this should probably be fine, I think");
  assert(flags.length >= 3, `should detect should/probably/I think, got ${flags.join(", ")}`);

  // 验证证据生成
  const evidence = createVerificationEvidence("scout", makeResult("scout", "completed", { candidateSourceIds: ["s1"] }), new Date());
  assert(evidence !== null && evidence.passed, "should produce passing verification evidence");
});

// ============================================================
// 场景 4：契约校验
// ============================================================

scenario("契约校验 - verifier 完成但缺 authenticity 触发 critical violation", () => {
  const profile = getRoleProfile("verifier");
  const result = makeResult("verifier", "completed"); // authenticity missing

  const violations = validateContract(profile, result, "post");
  const critical = violations.filter(v => v.severity === "critical");
  assert(critical.length > 0, "should detect critical violation: verifier completed without authenticity");
  console.log(`  检测到 ${violations.length} 个违反，其中 ${critical.length} 个 critical`);
  critical.forEach(v => console.log(`    🔴 [${v.dimension}] ${v.description}`));
});

// ============================================================
// 场景 5：红旗检测
// ============================================================

scenario("红旗检测 - scout 空列表 / collector 缺 sourceId / verifier 跳门", () => {
  // Scout：空 candidate list
  const scoutFlags = checkRedFlags(
    getRoleProfile("scout"),
    makeResult("scout", "completed", { candidateSourceIds: [] }),
  );
  assert(scoutFlags.length > 0, "scout empty list should trigger red flag");

  // Collector：evidence 缺 sourceId
  const collectorFlags = checkRedFlags(
    getRoleProfile("collector"),
    makeResult("collector", "completed", {
      evidenceList: [{ sourceId: undefined as never } as never],
    }),
  );
  assert(collectorFlags.length > 0, "collector missing sourceId should trigger red flag");

  // Verifier：completed 但无 authenticity
  const verifierFlags = checkRedFlags(
    getRoleProfile("verifier"),
    makeResult("verifier", "completed"),
  );
  assert(verifierFlags.length > 0, "verifier missing authenticity should trigger red flag");

  console.log(`  scout: ${scoutFlags.length} flag(s), collector: ${collectorFlags.length} flag(s), verifier: ${verifierFlags.length} flag(s)`);
});

// ============================================================
// 场景 6：三级严重度
// ============================================================

scenario("三级严重度 - mismatch=critical / warning=important / matched=minor", () => {
  const recs = [
    reconcileQuantity({ poId: "po-s1", poQuantity: 100, soQuantity: 100, shippedQuantity: 70, receivedQuantity: 70 }),  // mismatch (30%)
    reconcileQuantity({ poId: "po-s2", poQuantity: 10000, soQuantity: 10000, shippedQuantity: 9850, receivedQuantity: 9850 }),  // warning (1.5%)
    reconcileQuantity({ poId: "po-s3", poQuantity: 100, soQuantity: 100, shippedQuantity: 100, receivedQuantity: 100 }), // matched (0%)
  ] as never[];

  const report = buildSeverityReport(recs);
  console.log(`  总计 ${report.total} 项:`);
  console.log(`    🔴 Critical: ${report.critical.length}`);
  console.log(`    🟡 Important: ${report.important.length}`);
  console.log(`    🟢 Minor: ${report.minor.length}`);

  assert(report.critical.length > 0, "should have critical items (mismatch)");
  assert(report.important.length > 0, "should have important items (warning)");
  assert(report.minor.length > 0, "should have minor items (matched)");
  assert(hasBlockingIssues(report), "should have blocking issues");
});

// ============================================================
// 场景 7：指令优先级
// ============================================================

scenario("指令优先级 - USER_CONFIG > INDUSTRY_PACK > DEFAULT", () => {
  // 用户覆盖行业包
  const r1 = resolveInstructionConflict("user-says-no-tdd", "pack-says-tdd", "default-tdd");
  assert(r1.value === "user-says-no-tdd", "user config should win");
  assert(r1.source === InstructionPriority.USER_CONFIG, "source should be USER_CONFIG");
  assert(r1.hasConflict, "should detect conflict");
  console.log(`  用户覆盖行业包: value="${r1.value}", source=${r1.sourceName}, conflict=${r1.hasConflict}`);

  // 行业包覆盖默认（用户未指定）
  const r2 = resolveInstructionConflict(undefined, "pack-value", "default-value");
  assert(r2.value === "pack-value", "pack should win over default");
  assert(r2.hasConflict, "pack and default having different values = conflict");
  console.log(`  行业包覆盖默认: value="${r2.value}", source=${r2.sourceName}, conflict=${r2.hasConflict}`);

  // 仅默认
  const r3 = resolveInstructionConflict(undefined, undefined, "fallback");
  assert(r3.value === "fallback", "default should be used");
  assert(r3.source === InstructionPriority.DEFAULT, "source should be DEFAULT");
});

// ============================================================
// 场景 8：自由度分级
// ============================================================

scenario("自由度分级 - 19 条规则分为 low/medium/high", () => {
  const groups = groupRulesByFreedom();
  console.log(`  Low (公式类):    ${groups.low.length} 条 - ${groups.low.join(", ")}`);
  console.log(`  Medium (归因类): ${groups.medium.length} 条 - ${groups.medium.join(", ")}`);
  console.log(`  High (分析类):   ${groups.high.length} 条 - ${groups.high.join(", ")}`);

  assert(groups.low.length + groups.medium.length + groups.high.length === 19, "total should be 19");
  assert(groups.low.includes("rule-1"), "rule-1 should be low");
  assert(groups.high.includes("rule-19"), "rule-19 should be high");

  // 验证 rigid vs flexible
  assert(getRuleFreedom("rule-1") === "low", "rule-1 = low (rigid)");
  assert(getRuleFreedom("rule-14") === "high", "rule-14 = high (flexible)");
});

// ============================================================
// 场景 9：渐进式披露
// ============================================================

scenario("渐进式披露 - 三层 metadata/schema/reference", () => {
  // 用 apparelPack 注册
  const registry = registerIndustryPack(apparelPack);
  console.log(`  注册 ${registry.size} 个条目`);

  // Tier 1: metadata - 始终可见
  const metadataOnly = registry.load("metadata");
  console.log(`  load("metadata"): ${metadataOnly.length} 条目`);
  assert(metadataOnly.every(e => e.metadata.tier === "metadata"), "metadata tier should only return metadata entries");

  // Tier 2: schema - metadata + schema
  const schemaTier = registry.load("schema");
  console.log(`  load("schema"): ${schemaTier.length} 条目`);
  assert(schemaTier.length > metadataOnly.length, "schema tier should include more than metadata");

  // Tier 3: reference - 全部
  const referenceTier = registry.load("reference");
  console.log(`  load("reference"): ${referenceTier.length} 条目`);
  assert(referenceTier.length === registry.size, "reference tier should include all entries");

  // 自定义注册
  const custom = new ProgressiveDisclosureRegistry();
  custom.register({ name: "custom-meta", triggerConditions: "always", tier: "metadata", summary: "test" });
  custom.register({ name: "custom-schema", triggerConditions: "on demand", tier: "schema", summary: "test" }, { x: 1 });
  assert(custom.load("metadata").length === 1, "custom metadata should have 1 entry");
  assert(custom.load("schema").length === 2, "custom schema should have 2 entries");
});

// ============================================================
// 场景 10：两阶段审查
// ============================================================

scenario("两阶段审查 - spec compliance THEN code quality", () => {
  // 场景 A：规格通过 + 质量好
  const goodReview = twoStageReview(
    { expectedOutputs: ["candidateSourceIds"] },
    { actualOutputs: ["candidateSourceIds"], verificationPassed: true },
  );
  assert(goodReview.specReview.passed, "spec should pass");
  assert(goodReview.qualityReview !== undefined, "quality review should run");
  assert(goodReview.qualityReview!.readyToMerge, "should be ready to merge");

  // 场景 B：规格未通过 -> 质量审查不执行
  const badReview = twoStageReview(
    { expectedOutputs: ["candidateSourceIds", "evidence"] },
    { actualOutputs: ["candidateSourceIds"], verificationPassed: true },
  );
  assert(!badReview.specReview.passed, "spec should fail (missing evidence)");
  assert(badReview.qualityReview === undefined, "quality review should be skipped");
  assert(badReview.specReview.missingRequirements.length > 0, "should have missing requirements");

  console.log(`  场景 A: spec=${goodReview.specReview.passed}, quality=${goodReview.qualityReview?.readyToMerge}`);
  console.log(`  场景 B: spec=${badReview.specReview.passed}, quality=SKIPPED (spec failed)`);
});

// ============================================================
// 场景 11：CSO 描述验证
// ============================================================

scenario("CSO 描述验证 - 6 角色元数据全部合规", () => {
  const roles = ["scout", "collector", "verifier", "analyst", "synthesizer", "memory"] as const;
  for (const role of roles) {
    const meta = AGENT_CSO_METADATA[role];
    const result = validateCSODescription(meta);
    console.log(`  ${role}: valid=${result.valid}, desc="${meta.description.substring(0, 60)}..."`);
    assert(result.valid, `${role} CSO should be valid: ${result.issues.join("; ")}`);
  }

  // 反例：描述包含工作流步骤
  const badMeta = buildCSOMetadata("bad", "first do X, then do Y", ["k"]);
  const badResult = validateCSODescription(badMeta);
  assert(!badResult.valid, "workflow description should be invalid");
  console.log(`  反例（工作流描述）: valid=${badResult.valid}, issues=${badResult.issues.length}`);
});

// ============================================================
// 场景 12：系统化调试
// ============================================================

scenario("系统化调试 - 四阶段 + 3 次失败质疑架构", () => {
  const anomaly = {
    id: "anom-sim", type: "quantity_mismatch" as never, orderId: "po-dbg",
    description: "PO quantity 10000 but received 7000", status: "open" as never,
    evidenceIds: [], detectedAt: "2026-07-09T00:00:00Z",
  };

  let session = startDebuggingSession(anomaly);
  console.log(`  初始阶段: ${session.phase}`);

  // Phase 1 -> 2
  session = advancePhase(session, "root cause: supplier short-shipped 30%");
  console.log(`  阶段 1->2: ${session.phase}, rootCause="${session.rootCause?.substring(0, 40)}"`);

  // Phase 2 -> 3
  session = advancePhase(session, "working example: po-123 had correct quantity");
  console.log(`  阶段 2->3: ${session.phase}`);

  // Phase 3 -> 4
  session = advancePhase(session, "hypothesis: supplier capacity constraint");
  console.log(`  阶段 3->4: ${session.phase}`);

  // 3 次失败修复
  session = recordFixAttempt(session, "fix 1: request reshipment", false);
  session = recordFixAttempt(session, "fix 2: switch supplier", false);
  assert(!session.shouldQuestionArchitecture, "2 failures should not trigger architecture question");
  session = recordFixAttempt(session, "fix 3: adjust PO terms", false);
  assert(session.shouldQuestionArchitecture, "3 failures should trigger architecture question");
  console.log(`  3 次失败后: shouldQuestionArchitecture=${session.shouldQuestionArchitecture}`);
});

// ============================================================
// 场景 13：并行派发
// ============================================================

scenario("并行派发 - 决策树 + 聚焦 prompt", () => {
  // 单任务 -> single_agent
  const single = assessDispatch([makeTask("scout", "t1")]);
  assert(single.decision === "single_agent", "1 task -> single_agent");

  // 不同角色不同 trigger -> parallel
  const independent: SwarmTask[] = [
    makeTask("scout", "t1"),
    makeTask("collector", "t2"),
  ];
  independent[1].triggerId = "trig-2"; // different trigger
  const parallel = assessDispatch(independent);
  assert(parallel.decision === "parallel", "independent tasks -> parallel");

  // 相同角色 -> sequential
  const sameRole: SwarmTask[] = [
    makeTask("scout", "t3"),
    makeTask("scout", "t4"),
  ];
  sameRole[1].triggerId = "trig-3";
  const sequential = assessDispatch(sameRole);
  assert(sequential.decision === "sequential", "same role -> sequential");

  // 聚焦 prompt
  const prompt = createFocusedAgentPrompt(makeTask("analyst", "t5"), "evidence context");
  assert(prompt.includes("ANALYST"), "prompt should include role");
  assert(prompt.includes("Scope"), "prompt should include scope section");

  console.log(`  single_agent: ${single.decision}`);
  console.log(`  parallel: ${parallel.decision} (${parallel.taskCount} tasks)`);
  console.log(`  sequential: ${sequential.decision}`);
  console.log(`  prompt length: ${prompt.length} chars`);
});

// ============================================================
// 场景 14：计划-验证-执行
// ============================================================

scenario("计划-验证-执行 - 无占位符 + 验证后执行", () => {
  // 有效计划
  const validPlan = {
    fields: ["quantity", "price"],
    thresholds: { quantity: 0.1, price: 0.05 },
    expectedStatus: "warning" as const,
  };
  const validation = validateReconciliationPlan(validPlan, []);
  assert(validation.valid, "valid plan should pass validation");

  // 带占位符的计划
  const placeholderPlan = {
    fields: ["quantity"],
    thresholds: { quantity: 0.1 },
    expectedStatus: "matched" as const,
    transactionRefs: ["TBD"],
  };
  const placeholderValidation = validateReconciliationPlan(placeholderPlan, []);
  assert(!placeholderValidation.valid, "plan with TBD should fail");

  // checkForPlaceholders
  const placeholders = checkForPlaceholders("This is TBD, implement later, add appropriate error handling");
  assert(placeholders.length >= 3, `should detect 3+ placeholder patterns, got ${placeholders.length}`);

  // executeWithValidation
  const execResult = executeWithValidation(
    "plan-data",
    (p) => typeof p === "string",
    (p) => `executed-${p}`,
  );
  assert(execResult.verified, "execution should be verified");
  assert(execResult.result === "executed-plan-data", "result should match");

  // 无效计划 -> 跳过执行
  const skipped = executeWithValidation("bad", () => false, () => "never");
  assert(!skipped.verified, "invalid plan should skip execution");

  console.log(`  有效计划: valid=${validation.valid}`);
  console.log(`  占位符计划: valid=${placeholderValidation.valid}, errors=${placeholderValidation.errors.length}`);
  console.log(`  执行结果: verified=${execResult.verified}, result="${execResult.result}"`);
});

// ============================================================
// 场景 15：模型选择
// ============================================================

scenario("模型选择 - 6 角色 modelTier 分配", () => {
  const roleTiers = {
    scout: "fast",
    collector: "fast",
    verifier: "standard",
    analyst: "capable",
    synthesizer: "standard",
    memory: "fast",
  };

  for (const [role, expectedTier] of Object.entries(roleTiers)) {
    const profile = getRoleProfile(role as never);
    assert(profile.modelTier === expectedTier, `${role} should be ${expectedTier}, got ${profile.modelTier}`);
    console.log(`  ${role}: modelTier=${profile.modelTier}, skillType=${profile.skillType}`);
  }

  // 验证 antiRationalizations 都有填充
  for (const role of Object.keys(roleTiers)) {
    const profile = getRoleProfile(role as never);
    assert(
      (profile.antiRationalizations?.length ?? 0) > 0,
      `${role} should have antiRationalizations`,
    );
    console.log(`    ${role} anti-rationalizations: ${profile.antiRationalizations!.length} entries`);
  }

  // 验证 verificationChecklist 都有填充
  for (const role of Object.keys(roleTiers)) {
    const profile = getRoleProfile(role as never);
    assert(
      (profile.verificationChecklist?.length ?? 0) > 0,
      `${role} should have verificationChecklist`,
    );
  }
});

// ============================================================
// 总结
// ============================================================

console.log("\n" + "=".repeat(60));
console.log(`仿真总结: ${scenarioCount} 场景, ${passCount} 通过, ${failCount} 失败`);
console.log("=".repeat(60));

if (failCount > 0) {
  process.exit(1);
}
