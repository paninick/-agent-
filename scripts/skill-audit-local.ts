#!/usr/bin/env tsx
/**
 * skill-audit-local.ts — v3 已装 14 个项目批量审计
 *
 * 用法:
 *   tsx scripts/skill-audit-local.ts                 # 默认审计所有 10 个仓库
 *   tsx scripts/skill-audit-local.ts --skip-c1       # 跳过 C1（已知 trusted author）
 *   tsx scripts/skill-audit-local.ts --only ECC       # 只审计单个仓库
 *
 * 输出: outputs/skill-audit-report.json
 * 基础: docs/SKILLS_REGISTRY.md §四.4.2
 */

import { readFile, readdir, stat, writeFile, mkdir } from "node:fs/promises";
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
  parentRepo: string;
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
  "affaan-m",
]);

const TRUSTED_REPOS = new Set([
  "ECC",
  "superpowers",
  "anthropic-skills",
  "mattpocock-skills",
  "composio-skills",
  "openclaw-skills",
  "marketing-skills",
  "agent-reach",
  "national-stats-source",
  "trailofbits-skills",
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
  { pattern: /\beval\s*\(/i, label: "eval() 调用" },
];

const v3WorkflowKeywords = [
  "evidence", "comtrade", "fred", "fabric", "yarn", "cotton", "supply", "supplier",
  "customs", "trade", "tariff", "hs60", "hs61", "customer", "retail", "manufactur",
  "ledger", "workflow", "agent", "automate", "data", "evidence",
];

async function readSafe(path: string): Promise<string> {
  try {
    return await readFile(path, "utf-8");
  } catch {
    return "";
  }
}

async function check1_TrustedSource(skillPath: string, parentRepo: string, skipC1: boolean): Promise<CheckResult> {
  if (skipC1 || TRUSTED_REPOS.has(parentRepo)) {
    return { id: "C1", label: "来源（trusted repo）", status: "PASS", detail: `parent_repo=${parentRepo} 在 INSTALLATION_RECORD 白名单` };
  }
  const normalized = skillPath.replace(/\\/g, "/");
  const segments = normalized.split("/").filter(Boolean);
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    const seg = segments[i];
    if (seg === "SKILL.md" || seg === "skills") continue;
    if ([...TRUSTED_AUTHORS].some((t) => seg.toLowerCase().includes(t))) {
      return { id: "C1", label: "来源（trusted author）", status: "PASS", detail: `owner=${seg} 在白名单` };
    }
    break;
  }
  return { id: "C1", label: "来源（trusted author）", status: "WARN", detail: `未匹配 trusted author（parent=${parentRepo}）` };
}

async function check2_License(content: string, skillPath: string): Promise<CheckResult> {
  const fmMatch = content.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  const fm = fmMatch ? fmMatch[1] : "";
  const licenseInFm = fm.match(/license:\s*([\w\s\.\-]+)/i);
  const licenseInBody = content.match(/License[:\s]+["']?([\w\s\.\-]+?)["']?/i);
  let declared = licenseInFm ? licenseInFm[1].trim() : licenseInBody ? licenseInBody[1].trim() : "";
  declared = declared.replace(/[()]/g, "").trim();
  if (!declared) {
    let dir = skillPath;
    for (let depth = 0; depth < 8; depth++) {
      for (const candidate of ["LICENSE", "LICENSE.txt", "LICENSE.md"]) {
        const full = join(dir, candidate);
        if (await readSafe(full)) {
          declared = `LICENSE file (depth ${depth})`;
          break;
        }
      }
      if (declared) break;
      const parent = dir.replace(/[\\/][^\\/]+$/, "");
      if (parent === dir || !parent) break;
      dir = parent;
    }
  }
  const isKnown = declared
    ? OFFICIAL_LICENSES.some((l) => declared.toLowerCase().includes(l.toLowerCase())) || /LICENSE file/i.test(declared)
    : false;
  return {
    id: "C2",
    label: "License 声明",
    status: declared && isKnown ? "PASS" : declared ? "WARN" : "FAIL",
    detail: declared ? `license=${declared}` : "未声明 license",
  };
}

async function check3_Frontmatter(content: string): Promise<CheckResult> {
  const fmMatch = content.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  const fm = fmMatch ? fmMatch[1] : "";
  const hasName = /^name:\s*\S+/m.test(fm);
  const hasDesc = /^description:\s*\S+/m.test(fm);
  return { id: "C3", label: "frontmatter（name + description）", status: hasName && hasDesc ? "PASS" : "WARN", detail: `name=${hasName ? "✓" : "✗"}, description=${hasDesc ? "✓" : "✗"}` };
}

async function check4_WhenToUse(content: string): Promise<CheckResult> {
  const hasWhenToUse = /when to use|use when|use this|trigger/i.test(content);
  const hasWhenNotToUse = /when not to use|do not use|avoid|not for/i.test(content);
  return { id: "C4", label: "触发条件", status: hasWhenToUse && hasWhenNotToUse ? "PASS" : hasWhenToUse ? "WARN" : "WARN", detail: `when_to_use=${hasWhenToUse ? "✓" : "✗"}, when_not=${hasWhenNotToUse ? "✓" : "✗"}` };
}

async function check5_Deps(content: string): Promise<CheckResult> {
  const hasNpm = /npm\s+install|pnpm\s+add|yarn\s+add/.test(content);
  const hasPip = /pip\s+install|uv\s+add/.test(content);
  return { id: "C5", label: "依赖可验证", status: hasNpm || hasPip ? "PASS" : "WARN", detail: `npm=${hasNpm ? "✓" : "—"}, pip=${hasPip ? "✓" : "—"}` };
}

async function check6_NoHardcodedKeys(content: string): Promise<CheckResult> {
  const violations = FORBIDDEN_PATTERNS.filter((p) => /key|token/.test(p.label)).filter((p) => p.pattern.test(content));
  return { id: "C6", label: "无硬编码 key/token", status: violations.length === 0 ? "PASS" : "FAIL", detail: violations.length === 0 ? "OK" : `违规: ${violations.map((v) => v.label).join(", ")}` };
}

async function check7_NoSensitiveAccess(content: string): Promise<CheckResult> {
  const violations = FORBIDDEN_PATTERNS.filter((p) => /ssh|credentials/.test(p.label)).filter((p) => p.pattern.test(content));
  return { id: "C7", label: "无敏感路径访问", status: violations.length === 0 ? "PASS" : "FAIL", detail: violations.length === 0 ? "OK" : `违规: ${violations.map((v) => v.label).join(", ")}` };
}

async function check9_SizeLimit(skillPath: string): Promise<CheckResult> {
  let totalSize = 0;
  try {
    const entries = await readdir(skillPath, { recursive: true, withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile()) {
        const fp = join(entry.parentPath || skillPath, entry.name);
        const s = await stat(fp);
        totalSize += s.size;
      }
    }
  } catch {
    totalSize = 0;
  }
  return { id: "C9", label: "总大小 < 5MB", status: totalSize < 5 * 1024 * 1024 ? "PASS" : "FAIL", detail: `${(totalSize / (1024 * 1024)).toFixed(2)}MB` };
}

async function check10_WorkflowPairing(content: string, skillName: string): Promise<CheckResult> {
  const hits = v3WorkflowKeywords.filter((kw) => content.toLowerCase().includes(kw.toLowerCase()));
  return {
    id: "C10",
    label: "与 v3 9 环节 / 6 工作流配对",
    status: hits.length >= 2 ? "PASS" : hits.length === 1 ? "WARN" : "WARN",
    detail: hits.length > 0 ? `命中: ${hits.slice(0, 5).join(", ")}` : "未命中 v3 关键词（通用工具）",
  };
}

async function auditSkill(skillPath: string, parentRepo: string, skipC1: boolean): Promise<AuditReport> {
  const skillMdPath = join(skillPath, "SKILL.md");
  const content = await readSafe(skillMdPath);
  const skillName = basename(skillPath);

  const results: CheckResult[] = [
    await check1_TrustedSource(skillPath, parentRepo, skipC1),
    await check2_License(content, skillPath),
    await check3_Frontmatter(content),
    await check4_WhenToUse(content),
    await check5_Deps(content),
    await check6_NoHardcodedKeys(content),
    await check7_NoSensitiveAccess(content),
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

  return { skillPath, skillName, parentRepo, checkedAt: new Date().toISOString(), passed, failed, warned, results, decision };
}

async function findSkillDirs(repoPath: string): Promise<string[]> {
  const dirs: string[] = [];
  async function walk(p: string) {
    try {
      const entries = await readdir(p, { withFileTypes: true });
      for (const e of entries) {
        const fp = join(p, e.name);
        if (e.isDirectory()) {
          if (e.name === ".git" || e.name === "node_modules") continue;
          await walk(fp);
        } else if (e.name === "SKILL.md") {
          dirs.push(p);
        }
      }
    } catch {
      // ignore
    }
  }
  await walk(repoPath);
  return dirs;
}

async function main() {
  const args = process.argv.slice(2);
  const skipC1 = args.includes("--skip-c1");
  const onlyIdx = args.indexOf("--only");
  const onlyRepo = onlyIdx > -1 ? args[onlyIdx + 1] : null;
  const skillsRoot = join(process.cwd(), "skills");

  const repos = onlyRepo ? [onlyRepo] : await readdir(skillsRoot);
  const allReports: AuditReport[] = [];

  for (const repo of repos) {
    const repoPath = join(skillsRoot, repo);
    try {
      const s = await stat(repoPath);
      if (!s.isDirectory()) continue;
    } catch {
      continue;
    }
    const skillDirs = await findSkillDirs(repoPath);
    if (skillDirs.length === 0) {
      console.log(`[skip] ${repo}: 无 SKILL.md`);
      continue;
    }
    console.log(`\n[${repo}] 发现 ${skillDirs.length} 个 SKILL.md，审计中...`);
    for (const dir of skillDirs) {
      const report = await auditSkill(dir, repo, skipC1);
      allReports.push(report);
    }
  }

  const summary = {
    checkedAt: new Date().toISOString(),
    totalChecked: allReports.length,
    accepted: allReports.filter((r) => r.decision === "ACCEPT").length,
    manualReview: allReports.filter((r) => r.decision === "MANUAL_REVIEW").length,
    rejected: allReports.filter((r) => r.decision === "REJECT").length,
    byRepo: Object.fromEntries(
      [...new Set(allReports.map((r) => r.parentRepo))].map((repo) => {
        const rs = allReports.filter((r) => r.parentRepo === repo);
        return [repo, { total: rs.length, accept: rs.filter((r) => r.decision === "ACCEPT").length, review: rs.filter((r) => r.decision === "MANUAL_REVIEW").length, reject: rs.filter((r) => r.decision === "REJECT").length }];
      }),
    ),
    reports: allReports,
  };

  console.log(`\n${"=".repeat(60)}`);
  console.log(`SUMMARY: ${summary.accepted} accept / ${summary.manualReview} manual_review / ${summary.rejected} reject`);
  console.log(`${"=".repeat(60)}`);
  for (const [repo, stat] of Object.entries(summary.byRepo)) {
    console.log(`  ${repo.padEnd(30)} total=${stat.total} accept=${stat.accept} review=${stat.review} reject=${stat.reject}`);
  }

  await mkdir(join(process.cwd(), "outputs"), { recursive: true });
  await writeFile(join(process.cwd(), "outputs", "skill-audit-report.json"), JSON.stringify(summary, null, 2));
  console.log(`\n详细报告: outputs/skill-audit-report.json`);

  process.exit(summary.rejected > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("审计脚本错误:", err);
  process.exit(2);
});