#!/usr/bin/env node

import fs from "fs";
import path from "path";
import childProcess from "child_process";
import process from "process";

const root = process.cwd();
const configPath = path.join(root, ".agent-os", "node-runner.config.json");
const runsRoot = path.join(root, ".agent-os", "runs");
const allowedStatuses = new Set(["PASS", "REVISE", "BLOCK", "DONE", "SEALED", "NOT_SEALED", "ENV_BLOCK"]);

function fail(message, code = 1) {
  console.error(message);
  process.exitCode = code;
}

function toPosix(filePath) {
  return filePath.replace(/\\/g, "/").replace(/^\.\//, "");
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function loadConfig() {
  if (!fs.existsSync(configPath)) {
    throw new Error(`Missing config: ${configPath}`);
  }
  return readJson(configPath);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const args = { command };
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token.startsWith("--")) {
      args[token.slice(2)] = rest[index + 1];
      index += 1;
    }
  }
  return args;
}

function getNode(config, nodeId) {
  const node = config.nodes[nodeId];
  if (!node) {
    throw new Error(`Unknown node: ${nodeId}`);
  }
  return node;
}

function resolveRunDir(runId) {
  const exact = path.join(runsRoot, runId);
  if (fs.existsSync(exact)) {
    return exact;
  }

  if (fs.existsSync(runsRoot)) {
    const match = fs
      .readdirSync(runsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .find((name) => name === runId || name.endsWith(`-${runId}`));
    if (match) {
      return path.join(runsRoot, match);
    }
  }

  return exact;
}

function readHandoffOrCreatePlaceholder(runDir) {
  const handoffPath = path.join(runDir, "handoff.md");
  const legacyHandoffPath = path.join(runDir, "00-input-handoff.md");

  if (fs.existsSync(handoffPath)) {
    return { handoffPath, handoff: fs.readFileSync(handoffPath, "utf8") };
  }

  if (fs.existsSync(legacyHandoffPath)) {
    return { handoffPath: legacyHandoffPath, handoff: fs.readFileSync(legacyHandoffPath, "utf8") };
  }

  ensureDir(runDir);
  const placeholder = [
    "# Handoff Placeholder",
    "",
    "Fill this file before running make-prompt again.",
    "",
    "CURRENT_PHASE:",
    "SEALED_PHASES:",
    "CURRENT_NODE:",
    "NEXT_NODE:",
    "NEXT_MODEL:",
    "FILES_ALLOWED:",
    "FILES_FORBIDDEN:",
    "HANDOFF_PACKET:"
  ].join("\n");
  fs.writeFileSync(handoffPath, placeholder, "utf8");
  throw new Error(`Missing handoff. Created placeholder: ${handoffPath}`);
}

function makePrompt(config, runId, nodeId) {
  const node = getNode(config, nodeId);
  const runDir = resolveRunDir(runId);
  const templatePath = path.join(root, node.promptTemplate);
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Missing prompt template: ${templatePath}`);
  }

  const template = fs.readFileSync(templatePath, "utf8");
  const { handoffPath, handoff } = readHandoffOrCreatePlaceholder(runDir);
  const generated = [
    "# Agent OS Node Prompt",
    "",
    `NODE: ${nodeId}`,
    `MODEL: ${node.model}`,
    `CURRENT_PHASE: ${config.currentPhase}`,
    `SEALED_PHASES: ${config.sealedPhases.join(" | ")}`,
    `WRITE_ALLOWED: ${String(node.writeAllowed)}`,
    "",
    "## FILES_ALLOWED",
    ...(node.allowedFiles.length > 0 ? node.allowedFiles.map((file) => `- ${file}`) : ["- NONE"]),
    "",
    "## FILES_FORBIDDEN",
    ...(node.forbiddenFiles.length > 0 ? node.forbiddenFiles.map((file) => `- ${file}`) : ["- NONE"]),
    "",
    "## REQUIRED_OUTPUT_FIELDS",
    ...node.requiredOutputFields.map((field) => `- ${field}`),
    "",
    "## PROMPT_TEMPLATE",
    template,
    "",
    "## INPUT_HANDOFF",
    `SOURCE: ${toPosix(path.relative(root, handoffPath))}`,
    "",
    handoff
  ].join("\n");

  ensureDir(runDir);
  const outputPath = path.join(runDir, `${nodeId}.prompt.md`);
  fs.writeFileSync(outputPath, generated, "utf8");
  console.log(outputPath);
}

function extractField(content, field) {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = content.match(new RegExp(`^${escaped}\\s*(.*)$`, "m"));
  return match ? match[1].trim() : "";
}

function checkOutput(config, runId, nodeId) {
  getNode(config, nodeId);
  const runDir = resolveRunDir(runId);
  const outputPath = path.join(runDir, `${nodeId}.output.md`);
  if (!fs.existsSync(outputPath)) {
    throw new Error(`Missing node output: ${outputPath}`);
  }

  const content = fs.readFileSync(outputPath, "utf8");
  const required = ["STATUS:", "NEXT_NODE:", "NEXT_MODEL:", "HANDOFF_PACKET:"];
  const missing = required.filter((field) => !content.includes(field));
  if (missing.length > 0) {
    throw new Error(`Missing required fields: ${missing.join(", ")}`);
  }

  const status = extractField(content, "STATUS:");
  if (!allowedStatuses.has(status)) {
    throw new Error(`Invalid STATUS: ${status}`);
  }

  if (["BLOCK", "REVISE", "ENV_BLOCK"].includes(status)) {
    console.error(`Stop: ${nodeId} returned ${status}. Resolve REQUIRED_ACTION before continuing.`);
    process.exitCode = 2;
    return;
  }

  const statusPath = path.join(runDir, "status.json");
  const statusJson = {
    currentNode: nodeId,
    status,
    nextNode: extractField(content, "NEXT_NODE:"),
    nextModel: extractField(content, "NEXT_MODEL:"),
    checkedAt: new Date().toISOString()
  };
  fs.writeFileSync(statusPath, `${JSON.stringify(statusJson, null, 2)}\n`, "utf8");
  console.log(statusPath);
}

function matchesPattern(file, pattern) {
  const normalizedFile = toPosix(file);
  const normalizedPattern = toPosix(pattern);
  if (normalizedPattern.endsWith("/**")) {
    const prefix = normalizedPattern.slice(0, -3);
    return normalizedFile === prefix || normalizedFile.startsWith(`${prefix}/`);
  }
  return normalizedFile === normalizedPattern;
}

function getDocumentedDirtyFiles(config) {
  const configured = Array.isArray(config.documentedDirtyFiles) ? config.documentedDirtyFiles : [];
  return configured.map((file) => toPosix(String(file)));
}

function gitDiffNames(args) {
  const output = childProcess.execFileSync("git", args, { cwd: root, encoding: "utf8" });
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(toPosix);
}

function checkDiff(config, nodeId) {
  const node = getNode(config, nodeId);
  const documentedDirtyFiles = getDocumentedDirtyFiles(config);
  const changedAll = [...new Set([...gitDiffNames(["diff", "--name-only"]), ...gitDiffNames(["diff", "--cached", "--name-only"])])].sort();
  const documentedDirtyChanged = changedAll.filter((file) =>
    documentedDirtyFiles.some((pattern) => matchesPattern(file, pattern))
  );
  const changed = changedAll.filter((file) => !documentedDirtyChanged.includes(file));
  const violations = [];

  if (!node.writeAllowed && changed.length > 0) {
    violations.push(`${nodeId} is writeAllowed=false but has changed files.`);
  }

  for (const file of changed) {
    const forbidden = node.forbiddenFiles.some((pattern) => matchesPattern(file, pattern));
    if (forbidden) {
      violations.push(`Forbidden file changed: ${file}`);
    }

    if (nodeId === "N3_IMPLEMENTATION") {
      const allowed = node.allowedFiles.some((pattern) => matchesPattern(file, pattern));
      if (!allowed) {
        violations.push(`N3 changed file outside allowedFiles: ${file}`);
      }
    }
  }

  const report = [
    `NODE: ${nodeId}`,
    `CHECKED_AT: ${new Date().toISOString()}`,
    "",
    "CHANGED_FILES:",
    ...(changed.length > 0 ? changed.map((file) => `- ${file}`) : ["- NONE"]),
    "",
    "DOCUMENTED_DIRTY_FILES_IGNORED:",
    ...(documentedDirtyChanged.length > 0 ? documentedDirtyChanged.map((file) => `- ${file}`) : ["- NONE"]),
    "",
    "BOUNDARY_VIOLATIONS:",
    ...(violations.length > 0 ? violations.map((item) => `- ${item}`) : ["- NONE"])
  ].join("\n");

  ensureDir(runsRoot);
  const reportPath = path.join(runsRoot, "latest-diff-check.txt");
  fs.writeFileSync(reportPath, `${report}\n`, "utf8");
  console.log(reportPath);

  if (violations.length > 0) {
    process.exitCode = 2;
  }
}

function runValidation(config, runId) {
  const node = getNode(config, "N5_VALIDATION");
  const commands = node.validationCommands || [];
  const runDir = resolveRunDir(runId);
  ensureDir(runDir);
  const sections = [];
  let failed = false;

  for (const command of commands) {
    const startedAt = new Date().toISOString();
    try {
      const stdout = childProcess.execSync(command, {
        cwd: root,
        encoding: "utf8",
        stdio: "pipe",
        shell: true
      });
      sections.push([
        `COMMAND: ${command}`,
        `STARTED_AT: ${startedAt}`,
        "EXIT_CODE: 0",
        "STDOUT:",
        stdout.trim() || "(empty)",
        "STDERR:",
        "(empty)"
      ].join("\n"));
    } catch (error) {
      failed = true;
      sections.push([
        `COMMAND: ${command}`,
        `STARTED_AT: ${startedAt}`,
        `EXIT_CODE: ${typeof error.status === "number" ? error.status : 1}`,
        "STDOUT:",
        error.stdout ? String(error.stdout).trim() : "(empty)",
        "STDERR:",
        error.stderr ? String(error.stderr).trim() : String(error.message)
      ].join("\n"));
    }
  }

  const reportPath = path.join(runDir, "validation.txt");
  fs.writeFileSync(reportPath, `${sections.join("\n\n---\n\n")}\n`, "utf8");
  console.log(reportPath);
  if (failed) {
    process.exitCode = 2;
  }
}

function selfTest(config) {
  const runId = "self-test";
  const runDir = resolveRunDir(runId);
  ensureDir(runDir);
  fs.writeFileSync(path.join(runDir, "handoff.md"), "CURRENT_PHASE: self-test\nHANDOFF_PACKET: self-test\n", "utf8");
  makePrompt(config, runId, "N1_LONG_CONTEXT_ARCH_REVIEW");
  fs.writeFileSync(
    path.join(runDir, "N1_LONG_CONTEXT_ARCH_REVIEW.output.md"),
    [
      "STATUS: PASS",
      "NEXT_NODE: N2_TECH_REVIEW",
      "NEXT_MODEL: deepseek-v4-pro",
      "BLOCKING_ISSUES: NONE",
      "NON_BLOCKING_ISSUES: NONE",
      "REQUIRED_ACTION: NONE",
      "HANDOFF_PACKET: self-test"
    ].join("\n"),
    "utf8"
  );
  checkOutput(config, runId, "N1_LONG_CONTEXT_ARCH_REVIEW");
  console.log("SELF_TEST_PASS");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.command) {
    throw new Error("Missing command.");
  }

  const config = loadConfig();
  if (args.command === "make-prompt") {
    if (!args.run || !args.node) throw new Error("Usage: make-prompt --run <run> --node <node>");
    makePrompt(config, args.run, args.node);
    return;
  }
  if (args.command === "check-output") {
    if (!args.run || !args.node) throw new Error("Usage: check-output --run <run> --node <node>");
    checkOutput(config, args.run, args.node);
    return;
  }
  if (args.command === "check-diff") {
    if (!args.node) throw new Error("Usage: check-diff --node <node>");
    checkDiff(config, args.node);
    return;
  }
  if (args.command === "run-validation") {
    if (!args.run) throw new Error("Usage: run-validation --run <run>");
    runValidation(config, args.run);
    return;
  }
  if (args.command === "self-test") {
    selfTest(config);
    return;
  }

  throw new Error(`Unknown command: ${args.command}`);
}

try {
  main();
} catch (error) {
  fail(error instanceof Error ? error.message : String(error), process.exitCode || 1);
}
