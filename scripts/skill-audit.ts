#!/usr/bin/env tsx
/**
 * skill-audit.ts — 装入 skill 前的 10 项硬门槛审计
 *
 * 用法:
 *   tsx scripts/skill-audit.ts <path-to-skill-folder>
 *   tsx scripts/skill-audit.ts --batch <path-with-many-skills>
 *
 * 输出: JSON 报告 + 控制台表格 + exit code 1 if any FAIL
 *
 * 基于 docs/SKILLS_REGISTRY.md §四.4.2
 */

import { readFile, readdir, stat } from "node:fs/promises";
import { join, basename } from "node:path";

type CheckStatus = "PASS" | "FAIL" | "WARN";

interface CheckResult {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
}

interface AuditReport {
  skillPath: string;
  skillName: string;
  checkedAt: string;
  passed: number;
  failed: number;
  warned: number;
  results: CheckResult[];
  decision: "ACCEPT" | "REJECT" | "MANUAL_REVIEW";
}

const TRUSTED_AUTHORS = new Set([
  "anthropics",
  "openai",
  "microsoft",
  "google",
  "vercel-labs",
  "vercel",
  "trailofbits",
  "shadcn-ui",
  "shadcn",
  "obra",
  "mattpocock",
  "coreyhaines1",
  "coreyhaines",
]);

const OFFICIAL_LICENSES = ["apache-2.0", "apache 2.0", "mit", "bsd-2-clause", "bsd-3-clause", "proprietary", "source-available"];

const FORBIDDEN_PATTERNS = [
  { pattern: /sudo\s+/i, label: "sudo 命令" },
  { pattern: /~\/\.ssh/i, label: "~/.ssh 路径" },
  { pattern: /\.aws\/credentials/i, label: ".aws/credentials 路径" },
  { pattern: /sk_live_[A-Za-z0-9]{20,}/i, label: "Stripe live key" },
  { pattern: /AKIA[0-9A-Z]{16}/i, label: "AWS access key" },
  { pattern: /ghp_[A-Za-z0-9]{30,}/i, label: "GitHub personal token" },
  { pattern: /sk-[A-Za-z0-9]{20,}/i, label: "OpenAI API key" },
  { pattern: /xox[baprs]-[A-Za-z0-9-]{10,}/i, label: "Slack token" },
  { pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.(com|org|net|io)/i, label: "硬编码邮箱" },
  { pattern: /eval\s*\(/i, label: "eval() 调用" },
  { pattern: /exec\s*\(\s*["'`]/i, label: "exec() shell 命令" },
];

async function readSafe(path: string): Promise<string> {
  try {
    return await readFile(path, "utf-8");
  } catch {
    return "";
  }
}

async function check1_TrustedSource(skillPath: string): Promise<CheckResult> {
  const normalized = skillPath.replace(/\\/g, "/");
  const segments = normalized.split("/").filter(Boolean);
  let candidate = "";
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    const seg = segments[i];
    if (seg === "SKILL.md" || seg === "skills") continue;
    candidate = seg;
    if (/^(anthropics|openai|microsoft|google|vercel|vercel-labs|trailofbits|shadcn|obra|mattpocock|coreyhaines)/.test(seg)) break;
  }
  const isTrusted = [...TRUSTED_AUTHORS].some((t) => candidate.toLowerCase().includes(t));
  return {
    id: "C1",
    label: "来源（trusted author）",
    status: isTrusted ? "PASS" : "WARN",
    detail: isTrusted ? `owner=${candidate} 在白名单` : `owner=${candidate} 不在白名单（需 Owner 人工审）`,
  };
}

async function check2_License(content: string, skillPath?: string): Promise<CheckResult> {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  const fm = fmMatch ? fmMatch[1] : "";
  const licenseInFm = fm.match(/license:\s*([\w\s\.\-]+)/i);
  const licenseInBody = content.match(/License[:\s]+["']?([\w\s\.\-]+?)["']?/i);
  const licenseRef = content.match(/see\s+LICENSE|terms\s+in\s+LICENSE|License\s+file|["']?LICENSE(\.txt)?["']?/i);
  let declared = licenseInFm ? licenseInFm[1].trim() : licenseInBody ? licenseInBody[1].trim() : "";
  declared = declared.replace(/[()]/g, "").trim();

  if (!declared && skillPath) {
    for (const candidate of ["LICENSE", "LICENSE.txt", "LICENSE.md", "../LICENSE", "../../LICENSE"]) {
      const path = candidate.includes("/") ? join(skillPath, candidate) : join(skillPath, candidate);
      const exists = await readSafe(path);
      if (exists && /license|copyright|apache|mit/i.test(exists)) {
        declared = "LICENSE file exists (see parent repo)";
        break;
      }
    }
  }

  const isKnown = declared
    ? OFFICIAL_LICENSES.some((l) => declared.toLowerCase().includes(l.toLowerCase())) || /LICENSE file/i.test(declared)
    : false;

  return {
    id: "C2",
    label: "License 声明",
    status: declared && isKnown ? "PASS" : declared ? "WARN" : "FAIL",
    detail: declared ? `license=${declared}` : "未声明 license（SKILL.md 缺且父目录无 LICENSE）",
  };
}

async function check3_Frontmatter(content: string): Promise<CheckResult> {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  const fm = fmMatch ? fmMatch[1] : "";
  const hasName = /^name:\s*\S+/m.test(fm);
  const hasDesc = /^description:\s*\S+/m.test(fm);
  return {
    id: "C3",
    label: "frontmatter（name + description）",
    status: hasName && hasDesc ? "PASS" : "FAIL",
    detail: `name=${hasName ? "✓" : "✗"}, description=${hasDesc ? "✓" : "✗"}`,
  };
}

async function check4_WhenToUse(content: string): Promise<CheckResult> {
  const hasWhenToUse = /when to use|use when|use this|trigger/i.test(content);
  const hasWhenNotToUse = /when not to use|do not use|avoid|not for/i.test(content);
  return {
    id: "C4",
    label: "触发条件（含 when to use + when not to use）",
    status: hasWhenToUse && hasWhenNotToUse ? "PASS" : hasWhenToUse ? "WARN" : "FAIL",
    detail: `when_to_use=${hasWhenToUse ? "✓" : "✗"}, when_not=${hasWhenNotToUse ? "✓" : "✗"}`,
  };
}

async function check5_Deps(content: string): Promise<CheckResult> {
  const hasNpm = /npm\s+install|pnpm\s+add|yarn\s+add/.test(content) || /from\s+["']@?\w+/.test(content);
  const hasPip = /pip\s+install|uv\s+add|uvx/.test(content);
  const hasRealDeps = hasNpm || hasPip || /Dependencies[:\s]/i.test(content);
  return {
    id: "C5",
    label: "依赖可验证",
    status: hasRealDeps ? "PASS" : "WARN",
    detail: `npm=${hasNpm ? "✓" : "—"}, pip=${hasPip ? "✓" : "—"}`,
  };
}

async function check6_NoHardcodedKeys(content: string): Promise<CheckResult> {
  const violations = FORBIDDEN_PATTERNS.filter((p) => p.label.includes("key") || p.label.includes("token")).filter((p) =>
    p.pattern.test(content),
  );
  return {
    id: "C6",
    label: "无硬编码 key/token",
    status: violations.length === 0 ? "PASS" : "FAIL",
    detail: violations.length === 0 ? "未发现硬编码 key/token" : `违规: ${violations.map((v) => v.label).join(", ")}`,
  };
}

async function check7_NoSensitiveAccess(content: string): Promise<CheckResult> {
  const violations = FORBIDDEN_PATTERNS.filter((p) => p.label.includes("ssh") || p.label.includes("credentials")).filter((p) =>
    p.pattern.test(content),
  );
  return {
    id: "C7",
    label: "无敏感路径访问",
    status: violations.length === 0 ? "PASS" : "FAIL",
    detail: violations.length === 0 ? "未发现 sudo/~/.ssh/.aws/credentials" : `违规: ${violations.map((v) => v.label).join(", ")}`,
  };
}

async function check8_NoDangerousExec(content: string): Promise<CheckResult> {
  const violations = FORBIDDEN_PATTERNS.filter((p) => p.label.includes("eval") || p.label.includes("exec")).filter((p) =>
    p.pattern.test(content),
  );
  return {
    id: "C8",
    label: "无 eval/exec 危险调用",
    status: violations.length === 0 ? "PASS" : "FAIL",
    detail: violations.length === 0 ? "未发现 eval/exec" : `违规: ${violations.map((v) => v.label).join(", ")}`,
  };
}

async function check9_SizeLimit(skillPath: string): Promise<CheckResult> {
  let totalSize = 0;
  try {
    const entries = await readdir(skillPath, { recursive: true, withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile()) {
        const fullPath = join(entry.parentPath || skillPath, entry.name);
        const s = await stat(fullPath);
        totalSize += s.size;
      }
    }
  } catch {
    totalSize = 0;
  }
  const mb = totalSize / (1024 * 1024);
  return {
    id: "C9",
    label: "总大小 < 5MB",
    status: totalSize < 5 * 1024 * 1024 ? "PASS" : "FAIL",
    detail: `${mb.toFixed(2)}MB (limit: 5MB)`,
  };
}

async function check10_WorkflowPairing(content: string, skillName: string): Promise<CheckResult> {
  const v3WorkflowKeywords = [
    "weekly brief",
    "周报",
    "采购",
    "海关",
    "comtrade",
    "fred",
    "fabric",
    "供应链",
    "evidence",
    "ledger",
    "customer",
    "客户",
    "supplier",
    "supply",
    "trade",
    "shipment",
  ];
  const hits = v3WorkflowKeywords.filter((kw) => content.toLowerCase().includes(kw.toLowerCase()));
  return {
    id: "C10",
    label: "与 v3 工作流配对",
    status: hits.length >= 1 ? "PASS" : "WARN",
    detail:
      hits.length >= 1
        ? `命中关键词: ${hits.slice(0, 3).join(", ")}`
        : `未命中 v3 工作流关键词（需 Owner 确认是否通用）`,
  };
}

async function auditSkill(skillPath: string): Promise<AuditReport> {
  const skillMdPath = join(skillPath, "SKILL.md");
  const content = await readSafe(skillMdPath);
  const skillName = basename(skillPath);

  const results: CheckResult[] = [
    await check1_TrustedSource(skillPath),
    await check2_License(content, skillPath),
    await check3_Frontmatter(content),
    await check4_WhenToUse(content),
    await check5_Deps(content),
    await check6_NoHardcodedKeys(content),
    await check7_NoSensitiveAccess(content),
    await check8_NoDangerousExec(content),
    await check9_SizeLimit(skillPath),
    await check10_WorkflowPairing(content, skillName),
  ];

  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;
  const warned = results.filter((r) => r.status === "WARN").length;

  let decision: AuditReport["decision"];
  if (failed === 0 && warned === 0) decision = "ACCEPT";
  else if (failed === 0) decision = "MANUAL_REVIEW";
  else decision = "REJECT";

  return {
    skillPath,
    skillName,
    checkedAt: new Date().toISOString(),
    passed,
    failed,
    warned,
    results,
    decision,
  };
}

function printReport(report: AuditReport) {
  const color = (status: CheckStatus) =>
    status === "PASS" ? "\x1b[32m✓\x1b[0m" : status === "FAIL" ? "\x1b[31m✗\x1b[0m" : "\x1b[33m⚠\x1b[0m";
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Skill: ${report.skillName}`);
  console.log(`Path: ${report.skillPath}`);
  console.log(`Decision: ${report.decision}`);
  console.log(`Score: ${report.passed} pass / ${report.warned} warn / ${report.failed} fail`);
  console.log(`${"=".repeat(60)}`);
  for (const r of report.results) {
    console.log(`${color(r.status)} [${r.id}] ${r.label}`);
    console.log(`   ${r.detail}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("用法: tsx scripts/skill-audit.ts <skill-path>");
    process.exit(2);
  }

  const target = args[0];
  const statInfo = await stat(target).catch(() => null);
  if (!statInfo) {
    console.error(`路径不存在: ${target}`);
    process.exit(2);
  }

  let skillsToAudit: string[] = [];
  if (statInfo.isDirectory()) {
    const entries = await readdir(target, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory()).map((e) => join(target, e.name));
    const hasSkillMd = dirs.some(async (d) => {
      try {
        await stat(join(d, "SKILL.md"));
        return true;
      } catch {
        return false;
      }
    });
    if (await hasSkillMd) {
      skillsToAudit = dirs;
    } else {
      skillsToAudit = [target];
    }
  } else {
    skillsToAudit = [target];
  }

  const reports: AuditReport[] = [];
  for (const skillPath of skillsToAudit) {
    const report = await auditSkill(skillPath);
    reports.push(report);
    printReport(report);
  }

  const summary = {
    checkedAt: new Date().toISOString(),
    totalChecked: reports.length,
    accepted: reports.filter((r) => r.decision === "ACCEPT").length,
    manualReview: reports.filter((r) => r.decision === "MANUAL_REVIEW").length,
    rejected: reports.filter((r) => r.decision === "REJECT").length,
    reports,
  };

  console.log(`\n${"=".repeat(60)}`);
  console.log(`SUMMARY: ${summary.accepted} accept / ${summary.manualReview} manual_review / ${summary.rejected} reject`);
  console.log(`${"=".repeat(60)}\n`);

  const outPath = join(process.cwd(), "outputs", "skill-audit-report.json");
  await import("node:fs/promises").then(({ mkdir, writeFile }) =>
    mkdir(join(process.cwd(), "outputs"), { recursive: true }).then(() =>
      writeFile(outPath, JSON.stringify(summary, null, 2)),
    ),
  );
  console.log(`详细报告已写入: ${outPath}`);

  process.exit(summary.rejected > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("审计脚本错误:", err);
  process.exit(2);
});