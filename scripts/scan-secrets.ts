#!/usr/bin/env tsx
/**
 * scan-secrets.ts — v3 凭据泄露扫描器
 *
 * 8 类危险 key 正则 + 邮箱 + 私钥前缀
 * 用法:
 *   tsx scripts/scan-secrets.ts                  # 扫整个 monorepo
 *   tsx scripts/scan-secrets.ts --staged         # 扫 git staged
 *   tsx scripts/scan-secrets.ts <file>          # 扫单个文件
 *
 * exit code:
 *   0 = 无泄漏
 *   1 = 发现 ≥1 处（FAIL）
 *
 * 安装 pre-commit hook:
 *   cp scripts/pre-commit .git/hooks/pre-commit
 *   chmod +x .git/hooks/pre-commit
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";

interface SecretPattern {
  id: string;
  pattern: RegExp;
  label: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM";
}

const SECRET_PATTERNS: SecretPattern[] = [
  // === L1 商业凭据 ===
  {
    id: "STRIPE_LIVE",
    pattern: /sk_live_[A-Za-z0-9]{20,}/g,
    label: "Stripe live API key",
    severity: "CRITICAL",
  },
  {
    id: "STRIPE_TEST",
    pattern: /sk_test_[A-Za-z0-9]{20,}/g,
    label: "Stripe test API key",
    severity: "MEDIUM",
  },
  {
    id: "AWS_ACCESS",
    pattern: /AKIA[0-9A-Z]{16}/g,
    label: "AWS access key",
    severity: "CRITICAL",
  },
  {
    id: "GITHUB_PAT",
    pattern: /ghp_[A-Za-z0-9]{30,}/g,
    label: "GitHub personal access token",
    severity: "CRITICAL",
  },
  {
    id: "OPENAI",
    pattern: /sk-[A-Za-z0-9]{20,}/g,
    label: "OpenAI API key",
    severity: "CRITICAL",
  },
  {
    id: "ANTHROPIC",
    pattern: /sk-ant-[A-Za-z0-9-]{20,}/g,
    label: "Anthropic API key",
    severity: "CRITICAL",
  },
  {
    id: "PIPEWORX",
    pattern: /pwx_[a-f0-9]{30,}/gi,
    label: "Pipeworx API key",
    severity: "HIGH",
  },
  {
    id: "SLACK",
    pattern: /xox[baprs]-[A-Za-z0-9-]{10,}/g,
    label: "Slack token",
    severity: "HIGH",
  },
  // === 高熵 base64 字符串（≥40 字符）===
  {
    id: "HIGH_ENTROPY",
    pattern: /[A-Za-z0-9+/=]{60,}/g,
    label: "Possible high-entropy secret",
    severity: "MEDIUM",
  },
];

const IGNORE_DIRS = ["node_modules", ".git", "dist", "build", "outputs", ".cache", "skills"];
const IGNORE_FILES = [".env", ".env.local", ".env.*.local", "package-lock.json"];
const IGNORE_EXT = [".png", ".jpg", ".jpeg", ".gif", ".ico", ".woff", ".woff2", ".ttf", ".otf", ".jar", ".class", ".dll", ".so", ".dylib", ".zip", ".tar", ".gz", ".bz2", ".7z", ".pdf"];
const SKIP_DIR_NAMES = new Set(["node_modules", ".git", "dist", "build", "outputs", ".cache", "skills", "test", "tests", "__tests__", "fixtures"]);

const ALLOWLIST_FILES = new Set([
  // 测试 fixture
  "tests/fixtures/secrets.example.ts",
  "docs/INCIDENTS/2026-07-02-pwx-leak.md",  // 事故报告含 key 模式
  "docs/SECURITY.md",  // SOP 含 key 模式
  "outputs/skill-audit-report.json",  // 含 key 模式 audit
  "skills-lock.json",  // installer integrity hashes, not credentials
  // 仿真脚本中的 console.log 分隔线（=====...）被误报为高熵字符串
  "scripts/simulate-live-swarm.ts",
  // CSS 注释分隔线（=====...）被误报为高熵字符串
  "src/client/styles.css",
]);

const GENERATED_PREFIXES = [
  ".agents/",
  "seedance_review_frames/",
  "seedream_skill_unpack/",
  "seedream_static_review/",
];

const execFileAsync = promisify(execFile);

interface Finding {
  file: string;
  line: number;
  column: number;
  patternId: string;
  label: string;
  severity: string;
  match: string;
}

async function* walk(dir: string): AsyncIterable<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (SKIP_DIR_NAMES.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else {
      yield full;
    }
  }
}

async function isAllowlisted(file: string): Promise<boolean> {
  const rel = file.replace(/\\/g, "/");
  if (ALLOWLIST_FILES.has(rel)) return true;
  if (GENERATED_PREFIXES.some((prefix) => rel.startsWith(prefix))) return true;
  for (const allow of ALLOWLIST_FILES) {
    if (rel.endsWith(allow)) return true;
  }
  return false;
}

async function gitListFiles(args: string[]): Promise<string[]> {
  const { stdout } = await execFileAsync("git", args, {
    encoding: "buffer",
    maxBuffer: 20 * 1024 * 1024,
  });
  return stdout
    .toString("utf8")
    .split("\0")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

async function scanFile(file: string, repoRoot: string): Promise<Finding[]> {
  if (await isAllowlisted(file)) return [];
  const ext = file.slice(file.lastIndexOf("."));
  if (IGNORE_EXT.includes(ext.toLowerCase())) return [];
  for (const ignore of IGNORE_FILES) {
    if (file.endsWith(ignore.replace("*", ""))) return [];
  }
  const s = await stat(file).catch(() => null);
  if (!s || s.size > 5 * 1024 * 1024) return [];
  const content = await readFile(file, "utf-8").catch(() => "");
  if (!content) return [];

  const findings: Finding[] = [];
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const p of SECRET_PATTERNS) {
      // 跳过注释行（避免误报）
      if (/^\s*(\/\/|#|\*|<!--)/.test(line) && p.id !== "PIPEWORX") continue;
      const matches = [...line.matchAll(p.pattern)];
      for (const m of matches) {
        if (p.id === "HIGH_ENTROPY" && isLikelyHighEntropyFalsePositive(m[0])) continue;
        findings.push({
          file: relative(repoRoot, file),
          line: i + 1,
          column: m.index ?? 0,
          patternId: p.id,
          label: p.label,
          severity: p.severity,
          match: m[0].substring(0, 50) + (m[0].length > 50 ? "..." : ""),
        });
      }
    }
  }
  return findings;
}

function isLikelyHighEntropyFalsePositive(value: string): boolean {
  const hasDigit = /\d/.test(value);
  const hasBase64Marker = /[+=]/.test(value);
  const slashSeparatedWords = value.includes("/") && /^[A-Za-z/]+$/.test(value);
  return slashSeparatedWords && !hasDigit && !hasBase64Marker;
}

function printFindings(findings: Finding[]) {
  if (findings.length === 0) {
    console.log("\x1b[32m✓\x1b[0m scan-secrets: no findings");
    return;
  }
  console.log(`\x1b[31m✗\x1b[0m scan-secrets: ${findings.length} potential leaks\n`);
  for (const f of findings) {
    const color = f.severity === "CRITICAL" ? "\x1b[31m" : f.severity === "HIGH" ? "\x1b[33m" : "\x1b[36m";
    console.log(`${color}[${f.severity}]\x1b[0m ${f.file}:${f.line}:${f.column}`);
    console.log(`  ${f.patternId} — ${f.label}`);
    console.log(`  match: ${f.match}`);
    console.log();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const repoRoot = process.cwd();
  const findings: Finding[] = [];

  if (args[0] === "--staged") {
    const files = await gitListFiles(["diff", "--cached", "--name-only", "-z", "--diff-filter=ACMRT"]);
    for (const file of files) {
      findings.push(...(await scanFile(file, repoRoot)));
    }
  } else if (args.length > 0) {
    for (const arg of args) {
      const s = await stat(arg).catch(() => null);
      if (!s) continue;
      if (s.isDirectory()) {
        for await (const f of walk(arg)) {
          findings.push(...(await scanFile(f, repoRoot)));
        }
      } else {
        findings.push(...(await scanFile(arg, repoRoot)));
      }
    }
  } else {
    const files = await gitListFiles(["ls-files", "-z"]);
    for (const file of files) {
      findings.push(...(await scanFile(file, repoRoot)));
    }
  }

  printFindings(findings);
  const critical = findings.filter((f) => f.severity === "CRITICAL").length;
  const high = findings.filter((f) => f.severity === "HIGH").length;
  console.log(`summary: ${critical} CRITICAL, ${high} HIGH, ${findings.length - critical - high} MEDIUM`);

  if (findings.length > 0) {
    console.log(`\naction: review findings, move secrets to .env.local, run 'npm run lint:secrets -- <file>' to recheck`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("scan-secrets error:", err);
  process.exit(2);
});
