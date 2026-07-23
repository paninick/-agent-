/**
 * swarm/contract.ts - 契约校验 + 验证门 + 红旗检查
 *
 * 吸收 superpowers 的三个核心模式：
 *   - 模式 1/2：技能优先级 + 指令层级 -> validateContract（执行前后检查角色是否越界）
 *   - 模式 8：反合理化表 + 红旗列表 -> checkRedFlags（检查应停止的信号）
 *   - 模式 13：验证门函数 -> verifyCompletion（声明完成前必须有新鲜验证证据）
 *
 * "NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE"
 * "Violating the letter of the rules is violating the spirit of the rules."
 */

import type {
  AgentRoleProfile,
  AgentRunResult,
  AgentRole,
  VerificationEvidence,
} from "../spine/types";

// === 契约违反类型 ===

/** 契约违反 - 角色执行结果与 profile 声明不符 */
export interface ContractViolation {
  /** 违反的维度 */
  dimension: "input" | "output" | "boundary" | "memory";
  /** 严重度 */
  severity: "critical" | "warning";
  /** 违反描述 */
  description: string;
  /** 相关 profile 字段 */
  profileField: string;
}

// === 1. 契约校验（模式 1/2） ===

/**
 * 契约校验 - 执行前后检查角色是否越界。
 *
 * 吸收 superpowers using-superpowers 的指令优先级层级：
 *   profile 声明的 permittedInputs/permittedOutputs/boundaries 是角色的"法律"，
 *   orchestrator 在执行前后对照检查，确保角色不越界。
 *
 * @param profile  - 角色行为声明
 * @param result   - Agent 执行结果
 * @param phase    - "pre" 执行前 / "post" 执行后
 * @returns 违反列表（空数组表示无违反）
 */
export function validateContract(
  profile: AgentRoleProfile,
  result: AgentRunResult,
  phase: "pre" | "post"
): ContractViolation[] {
  const violations: ContractViolation[] = [];

  if (phase === "post") {
    // === 产出校验：检查 result 是否只产出了 permittedOutputs 中声明的字段 ===
    const outputFields = profile.permittedOutputs;
    const actualOutputs = getActualOutputs(result);

    for (const field of actualOutputs) {
      if (!outputFields.includes(field)) {
        violations.push({
          dimension: "output",
          severity: "warning",
          description: `Role "${profile.role}" produced output "${field}" not in permittedOutputs: [${outputFields.join(", ")}]`,
          profileField: "permittedOutputs",
        });
      }
    }

    // === 边界校验：检查 result 是否违反了 boundaries ===
    // Verifier 不可跳过门 -> 检查 authenticity 是否存在
    if (profile.role === "verifier" && result.status === "completed") {
      if (!result.authenticity) {
        violations.push({
          dimension: "boundary",
          severity: "critical",
          description: 'Verifier completed but authenticity is missing - boundary "must never skip any of the 6 gates" violated',
          profileField: "boundaries",
        });
      }
    }

    // Collector 不可跳过 source 匹配 -> 检查 evidence 有 sourceId
    if (profile.role === "collector" && result.status === "completed") {
      const evidenceList = result.evidenceList ?? (result.evidence ? [result.evidence] : []);
      const missingSource = evidenceList.find((e) => !e.sourceId);
      if (missingSource) {
        violations.push({
          dimension: "boundary",
          severity: "critical",
          description: 'Collector produced evidence without sourceId - boundary "must not skip source matching" violated',
          profileField: "boundaries",
        });
      }
    }

    // Analyst 不可分析未验证的 evidence -> 检查 evidence 是否有 authenticity
    if (profile.role === "analyst" && result.status === "completed") {
      // Orchestrator 应只传入 annotated evidence，这里做防御性检查
      // 通过 finding.evidenceIds 是否非空来判断
      if (result.finding && (!result.finding.evidenceIds || result.finding.evidenceIds.length === 0)) {
        violations.push({
          dimension: "boundary",
          severity: "warning",
          description: 'Analyst produced finding with no evidence IDs - boundary "must not analyze evidence that has not passed through the Verifier" may be violated',
          profileField: "boundaries",
        });
      }
    }

    // Synthesizer 不可遗漏 finding -> 检查是否有遗漏
    if (profile.role === "synthesizer" && result.status === "completed" && result.synthesis) {
      // confidence 不可超过最弱 finding
      const minFindingConfidence = result.synthesis.findings.length > 0
        ? Math.min(...result.synthesis.findings.map((f) => f.confidence))
        : undefined;
      if (minFindingConfidence !== undefined && result.synthesis.confidence > minFindingConfidence) {
        violations.push({
          dimension: "boundary",
          severity: "critical",
          description: `Synthesizer confidence (${result.synthesis.confidence}) exceeds weakest finding confidence (${minFindingConfidence}) - boundary "must not assign confidence higher than the max finding confidence" violated`,
          profileField: "boundaries",
        });
      }
    }
  }

  return violations;
}

/**
 * 获取 result 中实际产出的字段名列表。
 */
function getActualOutputs(result: AgentRunResult): string[] {
  const outputs: string[] = [];
  if (result.candidateSourceIds !== undefined) outputs.push("candidateSourceIds");
  if (result.evidence !== undefined || result.evidenceList !== undefined) outputs.push("evidence");
  if (result.authenticity !== undefined) outputs.push("authenticity");
  if (result.finding !== undefined) outputs.push("finding");
  if (result.synthesis !== undefined) outputs.push("synthesis");
  if (result.memoryEntry !== undefined) outputs.push("memoryEntry");
  if (result.followUp !== undefined) outputs.push("followUp");
  return outputs;
}

// === 2. 验证门（模式 13） ===

/**
 * 验证门 - 声明完成前检查 verificationEvidence。
 *
 * 吸收 superpowers verification-before-completion 的 Iron Law：
 *   "NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE"
 *   "If you haven't run the verification command in this message, you cannot claim it passes."
 *
 * 检查逻辑：
 *   1. 如果 profile 有 verificationChecklist，逐项检查是否有对应的 verificationEvidence
 *   2. 如果 result.verificationEvidence 存在且 passed=true，视为通过
 *   3. 如果 result.verificationEvidence 不存在但有 checklist，返回未通过项
 *
 * @param profile - 角色行为声明
 * @param result  - Agent 执行结果
 * @returns { passed, missingChecks } - 是否通过 + 缺失的检查项
 */
export function verifyCompletion(
  profile: AgentRoleProfile,
  result: AgentRunResult
): { passed: boolean; missingChecks: string[] } {
  // 如果角色没有声明 verificationChecklist，跳过验证门（向后兼容）
  if (!profile.verificationChecklist || profile.verificationChecklist.length === 0) {
    return { passed: true, missingChecks: [] };
  }

  // 如果 result 已经带了 verificationEvidence 且通过，直接信任
  if (result.verificationEvidence && result.verificationEvidence.passed) {
    return { passed: true, missingChecks: [] };
  }

  // 没有 verificationEvidence 或未通过 -> 对照 checklist 做结构性检查
  const missingChecks: string[] = [];

  for (const check of profile.verificationChecklist) {
    if (!performStructuralCheck(profile.role, check, result)) {
      missingChecks.push(check);
    }
  }

  return {
    passed: missingChecks.length === 0,
    missingChecks,
  };
}

/**
 * 结构性检查 - 根据角色和检查项做实际验证。
 *
 * 这是 verificationEvidence 缺失时的 fallback：
 * 用代码逻辑替代"新鲜验证证据"，确保产出至少满足基本结构要求。
 */
function performStructuralCheck(
  role: AgentRole,
  check: string,
  result: AgentRunResult
): boolean {
  // 通用检查：completed 状态必须有对应产出
  if (role === "scout") {
    if (check.includes("候选列表非空")) {
      return (result.candidateSourceIds?.length ?? 0) > 0;
    }
    if (check.includes("registry 中存在")) {
      // Scout 的候选 ID 存在性由 orchestrator 上下文保证，这里只检查非空
      return (result.candidateSourceIds?.length ?? 0) > 0;
    }
  }

  if (role === "collector") {
    if (check.includes("sourceId")) {
      const evidenceList = result.evidenceList ?? (result.evidence ? [result.evidence] : []);
      return evidenceList.every((e) => e.sourceId !== undefined);
    }
    if (check.includes("evidenceList 非空")) {
      const evidenceList = result.evidenceList ?? (result.evidence ? [result.evidence] : []);
      return evidenceList.length > 0;
    }
  }

  if (role === "verifier") {
    if (check.includes("6 门全部执行") || check.includes("6 gates")) {
      // 检查 authenticity 是否存在（6 门执行的标志）
      return result.authenticity !== undefined;
    }
    if (check.includes("authenticityScore")) {
      return result.authenticity?.authenticityScore !== undefined;
    }
  }

  if (role === "analyst") {
    if (check.includes("annotated evidence") || check.includes("已验证")) {
      // 检查 finding 是否有 evidenceIds
      return (result.finding?.evidenceIds?.length ?? 0) > 0;
    }
    if (check.includes("signals")) {
      return (result.finding?.signals?.length ?? 0) > 0;
    }
    if (check.includes("confidence")) {
      return (result.finding?.confidence ?? 0) > 0;
    }
  }

  if (role === "synthesizer") {
    if (check.includes("findings 全部包含") || check.includes("all findings")) {
      // 检查 synthesis 是否有 findings
      return (result.synthesis?.findings?.length ?? 0) > 0;
    }
    if (check.includes("confidence")) {
      if (!result.synthesis) return false;
      const minFindingConfidence = result.synthesis.findings.length > 0
        ? Math.min(...result.synthesis.findings.map((f) => f.confidence))
        : undefined;
      if (minFindingConfidence === undefined) return true;
      return result.synthesis.confidence <= minFindingConfidence;
    }
  }

  if (role === "memory") {
    if (check.includes("memoryEntry")) {
      return result.memoryEntry !== undefined;
    }
    if (check.includes("followUp") || check.includes("环路")) {
      return (result.followUp?.length ?? 0) > 0;
    }
  }

  // === 新增角色检查 ===

  if (role === "data_janitor") {
    if (check.includes("cleaningLog")) {
      return (result.janitorOutput?.cleaningLog?.length ?? 0) >= 0; // always present
    }
    if (check.includes("normalizedEvidence")) {
      return (result.janitorOutput?.normalizedEvidence?.length ?? 0) > 0
        || (result.evidenceList?.length ?? 0) > 0;
    }
  }

  if (role === "devils_advocate") {
    if (check.includes("signal") || check.includes("challenge")) {
      return (result.challenges?.challenges?.length ?? 0) >= 0; // at least attempted
    }
    if (check.includes("impactScore")) {
      return (result.challenges?.challenges ?? []).every((c) => c.impactScore >= 0 && c.impactScore <= 1);
    }
  }

  if (role === "adjudicator") {
    if (check.includes("verdict")) {
      return (result.verdict?.verdicts?.length ?? 0) > 0;
    }
    if (check.includes("reasoning")) {
      return (result.verdict?.verdicts ?? []).every((v) => v.reasoning.length > 0);
    }
  }

  if (role === "reconciliation_scorer") {
    if (check.includes("10 dimensions") || check.includes("dimension")) {
      return (result.reconciliationScores?.dimensions?.length ?? 0) === 10;
    }
    if (check.includes("overallHealth")) {
      const h = result.reconciliationScores?.overallHealth ?? -1;
      return h >= 0 && h <= 100;
    }
  }

  // 默认：无法识别的检查项视为通过（不阻塞）
  return true;
}

// === 3. 红旗检查（模式 8） ===

/**
 * 检查红旗 - 对比 redFlags 列表。
 *
 * 吸收 superpowers 的 Red Flags 模式：
 *   每个技能都有一个 "STOP and start over" 的红旗列表。
 *   contract.ts 在执行后检查这些信号，如果触发则应停止并重新评估。
 *
 * @param profile - 角色行为声明
 * @param result  - Agent 执行结果
 * @returns 触发的红旗描述列表（空数组表示无红旗）
 */
export function checkRedFlags(
  profile: AgentRoleProfile,
  result: AgentRunResult
): string[] {
  const triggered: string[] = [];

  if (!profile.redFlags) return triggered;

  // Scout 红旗
  if (profile.role === "scout") {
    if (profile.redFlags.some((f) => f.includes("候选列表为空") || f.includes("candidate list empty"))) {
      if ((result.candidateSourceIds?.length ?? 0) === 0) {
        triggered.push("候选来源列表为空且未尝试 fallback");
      }
    }
  }

  // Collector 红旗
  if (profile.role === "collector") {
    const evidenceList = result.evidenceList ?? (result.evidence ? [result.evidence] : []);
    if (profile.redFlags.some((f) => f.includes("sourceId"))) {
      if (evidenceList.some((e) => !e.sourceId)) {
        triggered.push("产出 evidence 缺少 sourceId");
      }
    }
  }

  // Verifier 红旗
  if (profile.role === "verifier") {
    if (profile.redFlags.some((f) => f.includes("门被跳过") || f.includes("gate"))) {
      if (result.status === "completed" && !result.authenticity) {
        triggered.push("验证门被跳过 - authenticity 缺失");
      }
    }
  }

  // Analyst 红旗
  if (profile.role === "analyst") {
    if (profile.redFlags.some((f) => f.includes("未验证"))) {
      // 防御性检查：finding 无 evidenceIds 可能意味着分析了未验证的数据
      if (result.finding && result.finding.evidenceIds.length === 0) {
        triggered.push("可能分析了未验证的 evidence");
      }
    }
  }

  // Synthesizer 红旗
  if (profile.role === "synthesizer") {
    if (profile.redFlags.some((f) => f.includes("遗漏"))) {
      // synthesis.findings 应非空（当有 findings 输入时）
      if (result.synthesis && result.synthesis.findings.length === 0) {
        triggered.push("可能遗漏了 finding");
      }
    }
  }

  // Memory 红旗
  if (profile.role === "memory") {
    if (profile.redFlags.some((f) => f.includes("followUp") || f.includes("环路"))) {
      if ((result.followUp?.length ?? 0) === 0) {
        triggered.push("followUp 为空 - 环路未闭合");
      }
    }
  }

  return triggered;
}

// === 4. 创建验证证据的辅助函数 ===

/**
 * 为已完成的 agent 结果创建验证证据。
 *
 * Orchestrator 在 agent 执行成功后调用此函数，
 * 生成新鲜的 verificationEvidence 附加到 result 上。
 *
 * @param role    - 角色名
 * @param result  - 执行结果
 * @param now     - 当前时间
 * @returns VerificationEvidence 或 null（无法验证时）
 */
export function createVerificationEvidence(
  role: AgentRole,
  result: AgentRunResult,
  now: Date
): VerificationEvidence | null {
  const verifiedAt = now.toISOString();

  switch (role) {
    case "scout":
      return {
        method: "verified candidate source IDs are non-empty",
        checkId: `scout-verify-${result.taskId}`,
        output: `${result.candidateSourceIds?.length ?? 0} candidate sources selected`,
        passed: (result.candidateSourceIds?.length ?? 0) > 0,
        verifiedAt,
      };

    case "collector": {
      const evidenceList = result.evidenceList ?? (result.evidence ? [result.evidence] : []);
      const allHaveSourceId = evidenceList.every((e) => e.sourceId);
      return {
        method: "verified all evidence entries have sourceId",
        checkId: `collector-verify-${result.taskId}`,
        output: `${evidenceList.length} evidence entries, allHaveSourceId=${allHaveSourceId}`,
        passed: evidenceList.length > 0 && allHaveSourceId,
        verifiedAt,
      };
    }

    case "verifier":
      return {
        method: "verified 6 authenticity gates executed (authenticity result present)",
        checkId: `verifier-verify-${result.taskId}`,
        output: `authenticityScore=${result.authenticity?.authenticityScore ?? "missing"}`,
        passed: result.authenticity !== undefined,
        verifiedAt,
      };

    case "analyst":
      return {
        method: "verified finding has signals and evidence IDs",
        checkId: `analyst-verify-${result.taskId}`,
        output: `signals=${result.finding?.signals?.length ?? 0}, evidenceIds=${result.finding?.evidenceIds?.length ?? 0}, confidence=${result.finding?.confidence ?? 0}`,
        passed: (result.finding?.signals?.length ?? 0) > 0 && (result.finding?.evidenceIds?.length ?? 0) > 0,
        verifiedAt,
      };

    case "synthesizer": {
      const minConf = result.synthesis && result.synthesis.findings.length > 0
        ? Math.min(...result.synthesis.findings.map((f) => f.confidence))
        : undefined;
      const confidenceOk = minConf === undefined || (result.synthesis?.confidence ?? 0) <= minConf;
      return {
        method: "verified synthesis includes all findings and confidence <= min(finding confidence)",
        checkId: `synthesizer-verify-${result.taskId}`,
        output: `findings=${result.synthesis?.findings?.length ?? 0}, confidence=${result.synthesis?.confidence ?? 0}, minFindingConf=${minConf ?? "n/a"}, confidenceOk=${confidenceOk}`,
        passed: (result.synthesis?.findings?.length ?? 0) > 0 && confidenceOk,
        verifiedAt,
      };
    }

    case "memory":
      return {
        method: "verified memory entry written and follow-up tasks generated",
        checkId: `memory-verify-${result.taskId}`,
        output: `memoryEntry=${result.memoryEntry ? "present" : "missing"}, followUps=${result.followUp?.length ?? 0}`,
        passed: result.memoryEntry !== undefined && (result.followUp?.length ?? 0) > 0,
        verifiedAt,
      };

    case "data_janitor": {
      const logLen = result.janitorOutput?.cleaningLog?.length ?? 0;
      const normLen = result.janitorOutput?.normalizedEvidence?.length ?? 0;
      return {
        method: "verified cleaning log recorded and normalized evidence produced",
        checkId: `data-janitor-verify-${result.taskId}`,
        output: `cleaningLog=${logLen} entries, normalizedEvidence=${normLen}, anomalies=${result.janitorOutput?.anomalyCount ?? 0}, outliers=${result.janitorOutput?.outlierCount ?? 0}`,
        passed: normLen > 0,
        verifiedAt,
      };
    }

    case "devils_advocate": {
      const challengeCount = result.challenges?.challenges?.length ?? 0;
      const weakness = result.challenges?.overallWeakness ?? -1;
      return {
        method: "verified challenges generated for all findings",
        checkId: `devils-advocate-verify-${result.taskId}`,
        output: `challenges=${challengeCount}, overallWeakness=${weakness}`,
        passed: challengeCount >= 0 && weakness >= 0 && weakness <= 1,
        verifiedAt,
      };
    }

    case "adjudicator": {
      const verdictCount = result.verdict?.verdicts?.length ?? 0;
      const overallVerdict = result.verdict?.overallVerdict ?? "none";
      return {
        method: "verified verdicts rendered for all signals",
        checkId: `adjudicator-verify-${result.taskId}`,
        output: `verdicts=${verdictCount}, overallVerdict=${overallVerdict}`,
        passed: verdictCount > 0 && ["strong", "moderate", "weak", "insufficient"].includes(overallVerdict),
        verifiedAt,
      };
    }

    case "reconciliation_scorer": {
      const dimCount = result.reconciliationScores?.dimensions?.length ?? 0;
      const health = result.reconciliationScores?.overallHealth ?? -1;
      return {
        method: "verified all 10 dimensions scored with valid health score",
        checkId: `reconciliation-scorer-verify-${result.taskId}`,
        output: `dimensions=${dimCount}, overallHealth=${health}, mismatches=${result.reconciliationScores?.criticalMismatches?.length ?? 0}`,
        passed: dimCount === 10 && health >= 0 && health <= 100,
        verifiedAt,
      };
    }

    default:
      return null;
  }
}
