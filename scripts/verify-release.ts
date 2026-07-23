import childProcess from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createReleaseGovernanceSnapshot, formatReleaseHandoffPacket } from "../src/release";
import { scanSkillsSync } from "../src/skills";

const __filename = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(__filename), "..");

function execGit(args: string[], cwd: string = root): string[] {
  try {
    return childProcess
      .execFileSync("git", args, { cwd, encoding: "utf8" })
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function readJson(filePath: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
  } catch {
    return {};
  }
}

function scanSkillDescriptors(skillRoot: string) {
  if (!fs.existsSync(skillRoot)) return [];
  return scanSkillsSync({
    rootDir: skillRoot,
    readFile: (filePath) => fs.readFileSync(filePath, "utf8"),
    listDir: (dirPath) => fs.readdirSync(dirPath).sort(),
    isFile: (entryPath) => fs.statSync(entryPath).isFile(),
    separator: path.sep,
  });
}

const skillRoot = path.resolve(root, process.env.SKILLS_ROOT ?? "skills/ECC/skills");
const intelligenceArtifact = readJson(path.join(root, "outputs", "intelligence", "verification-latest.json"));
const parentGitStatusLines = execGit(["status", "--porcelain=v1", "--untracked-files=all"]);
const nestedVendorStatusLines = fs.existsSync(path.join(root, "skills", "ECC", ".git"))
  ? execGit(["status", "--short"], path.join(root, "skills", "ECC"))
  : [];
const skillDescriptors = scanSkillDescriptors(skillRoot);

const snapshot = createReleaseGovernanceSnapshot({
  intelligenceArtifact,
  parentGitStatusLines,
  nestedVendorStatusLines,
  skillRoot,
  skillRootExists: fs.existsSync(skillRoot),
  skillDescriptors,
});

console.log(JSON.stringify(snapshot, null, 2));
console.log("");
console.log(formatReleaseHandoffPacket(snapshot));

if (!snapshot.ok) {
  process.exitCode = 1;
}
