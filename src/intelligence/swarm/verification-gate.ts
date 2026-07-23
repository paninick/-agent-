/**
 * swarm/verification-gate.ts - 验证门：5 步门函数
 *
 * 吸收 superpowers verification-before-completion 的 Iron Law：
 *   "NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE"
 *   "Skip any step = lying, not verifying."
 *
 * 5 步协议：IDENTIFY -> RUN -> READ -> VERIFY -> CLAIM
 * 红旗检测：扫描 "应该"/"大概"/"似乎" 等模糊措辞。
 */

// === 验证门类型 ===

/** 单个验证声明 - 描述一个需要验证的完成断言 */
export interface VerificationClaim {
  /** 断言内容，如 "tests pass" / "authenticity computed" */
  claim: string;
  /** 验证命令/操作（如 "ran 6 authenticity gates" / "matched 3 sources"） */
  evidenceCommand?: string;
  /** 实际输出摘要 */
  evidenceOutput?: string;
  /** 是否通过验证 */
  verified: boolean;
}

/** 验证结果 */
export interface VerificationResult {
  /** 所有声明是否全部通过 */
  allPassed: boolean;
  /** 通过的声明数 */
  passedCount: number;
  /** 未通过的声明数 */
  failedCount: number;
  /** 未通过的声明列表 */
  failures: VerificationClaim[];
  /** 检测到的红旗措辞 */
  redFlagWords: string[];
  /** 人类可读报告 */
  report: string;
}

// === 红旗措辞检测 ===

/** 模糊措辞列表 - 出现这些词意味着声明未经验证 */
const RED_FLAG_WORDS = [
  "应该", "大概", "似乎", "可能", "应该可以通过", "应该没问题",
  "should", "probably", "seems", "might", "likely", "assumed",
  "appears to", "I think", "I believe", "presumably",
];

/**
 * 扫描文本中的红旗措辞。
 *
 * "using 'should'/'probably'/'seems' = STOP and run verification"
 */
export function detectRedFlagWords(text: string): string[] {
  const lower = text.toLowerCase();
  return RED_FLAG_WORDS.filter((word) => lower.includes(word.toLowerCase()));
}

// === 5 步门函数 ===

/**
 * 验证门 - 在声明任何完成状态前运行。
 *
 * 5 步协议（模式 13）：
 *   1. IDENTIFY: 确定证明此声明需要什么命令
 *   2. RUN: 执行完整命令（新鲜的、完整的）
 *   3. READ: 完整输出，检查退出码，统计失败数
 *   4. VERIFY: 输出是否确认声明？NO -> 陈述实际状态；YES -> 附带证据陈述声明
 *   5. CLAIM: 只有此时才能做出声明
 *
 * @param claims - 需要验证的完成声明列表
 * @returns 验证结果（含报告）
 */
export function verifyBeforeCompletion(claims: VerificationClaim[]): VerificationResult {
  // Step 4: VERIFY - 检查每个声明
  const failures = claims.filter((c) => !c.verified);
  const passed = claims.filter((c) => c.verified);

  // 红旗检测 - 扫描所有声明的措辞
  const allText = claims.map((c) => `${c.claim} ${c.evidenceOutput ?? ""}`).join(" ");
  const redFlagWords = detectRedFlagWords(allText);

  const allPassed = failures.length === 0 && redFlagWords.length === 0;

  // Step 5: CLAIM - 生成报告
  const report = formatVerificationReport({
    allPassed,
    passedCount: passed.length,
    failedCount: failures.length,
    failures,
    redFlagWords,
    report: "", // will be filled by formatVerificationReport
  });

  return {
    allPassed,
    passedCount: passed.length,
    failedCount: failures.length,
    failures,
    redFlagWords,
    report,
  };
}

/**
 * 格式化验证报告 - 人类可读。
 */
export function formatVerificationReport(result: VerificationResult): string {
  const lines: string[] = [];

  if (result.allPassed) {
    lines.push("✅ VERIFICATION PASSED");
    lines.push(`  ${result.passedCount} claim(s) verified with fresh evidence.`);
  } else {
    lines.push("❌ VERIFICATION FAILED");
    if (result.failedCount > 0) {
      lines.push(`  ${result.failedCount} unverified claim(s):`);
      for (const f of result.failures) {
        lines.push(`    - "${f.claim}"`);
        if (f.evidenceCommand) {
          lines.push(`      command: ${f.evidenceCommand}`);
        }
        if (f.evidenceOutput) {
          lines.push(`      output: ${f.evidenceOutput}`);
        }
      }
    }
    if (result.redFlagWords.length > 0) {
      lines.push(`  Red flag words detected: ${result.redFlagWords.join(", ")}`);
      lines.push(`  "using 'should'/'probably'/'seems' = run the verification"`);
    }
  }

  return lines.join("\n");
}

// === 常见验证声明构建器 ===

/** 为 scout 结果创建验证声明 */
export function scoutVerificationClaims(
  candidateSourceIds: string[]
): VerificationClaim[] {
  return [
    {
      claim: "candidate source list is non-empty",
      evidenceCommand: "checked candidateSourceIds.length",
      evidenceOutput: `${candidateSourceIds.length} candidate sources selected`,
      verified: candidateSourceIds.length > 0,
    },
  ];
}

/** 为 collector 结果创建验证声明 */
export function collectorVerificationClaims(
  evidenceList: Array<{ sourceId?: string }>
): VerificationClaim[] {
  const allHaveSourceId = evidenceList.every((e) => e.sourceId);
  return [
    {
      claim: "all evidence entries have sourceId",
      evidenceCommand: "checked every evidence.sourceId",
      evidenceOutput: `${evidenceList.length} entries, allHaveSourceId=${allHaveSourceId}`,
      verified: evidenceList.length > 0 && allHaveSourceId,
    },
  ];
}

/** 为 verifier 结果创建验证声明 */
export function verifierVerificationClaims(
  authenticity: { authenticityScore?: number } | undefined
): VerificationClaim[] {
  return [
    {
      claim: "6 authenticity gates executed (authenticity result present)",
      evidenceCommand: "checked authenticity !== undefined",
      evidenceOutput: `authenticityScore=${authenticity?.authenticityScore ?? "missing"}`,
      verified: authenticity !== undefined && authenticity.authenticityScore !== undefined,
    },
  ];
}

/** 为 analyst 结果创建验证声明 */
export function analystVerificationClaims(
  finding: { signals?: string[]; evidenceIds?: string[]; confidence?: number } | undefined
): VerificationClaim[] {
  return [
    {
      claim: "finding has signals and evidence IDs",
      evidenceCommand: "checked finding.signals and finding.evidenceIds",
      evidenceOutput: `signals=${finding?.signals?.length ?? 0}, evidenceIds=${finding?.evidenceIds?.length ?? 0}`,
      verified: (finding?.signals?.length ?? 0) > 0 && (finding?.evidenceIds?.length ?? 0) > 0,
    },
  ];
}
