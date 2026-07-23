import type { DirtyFileRecord, VendorDirtyReport } from "./types";

const DOCUMENTED_VENDOR_PATH = "skills/ECC";
const DOCUMENTED_VENDOR_LOCKFILES = new Set([
  "skills/ECC/package-lock.json",
  "skills/ECC/yarn.lock",
]);
const DOCUMENTED_PROJECT_PATHS = new Set([
  "CHANGELOG.md",
  "README.md",
  "package.json",
  "outputs/intelligence/verification-latest.json",
  "scripts/verify-release.ts",
  "src/tests/release-governance.test.ts",
  "docs/RELEASE_GOVERNANCE_CONSOLE_RUNBOOK_CN.md",
  "docs/AGENT_OS_V2_P8_RELEASE_SEAL_CN.md",
]);
const DOCUMENTED_PROJECT_PREFIXES = [
  ".agent-os/runs/2026-07-05-p8-release-governance/",
  "src/release/",
];

export function createVendorDirtyReport(
  parentGitStatusLines: string[],
  nestedVendorStatusLines: string[] = [],
): VendorDirtyReport {
  const dirtyFiles = [
    ...parentGitStatusLines.map(parseParentStatusLine).filter((record): record is DirtyFileRecord => record !== null),
    ...nestedVendorStatusLines.map(parseNestedVendorStatusLine).filter((record): record is DirtyFileRecord => record !== null),
  ];

  if (dirtyFiles.length === 0) {
    return {
      status: "clean",
      dirtyFiles: [],
      warnings: [],
      blockingReasons: [],
    };
  }

  const blockingReasons = dirtyFiles
    .filter((record) => !isDocumentedNonBlockingRecord(record))
    .map((record) => `Unexpected dirty file: ${record.path} (${record.statusCode})`);

  const vendorCount = dirtyFiles.filter(isDocumentedVendorRecord).length;
  const projectCount = dirtyFiles.filter(isDocumentedProjectRecord).length;
  const warnings = [
    ...(projectCount > 0 ? [`${projectCount} documented P8 release-governance worktree paths are dirty.`] : []),
    ...(vendorCount > 0 ? [`${vendorCount} documented skills/ECC vendor nested repo paths are dirty.`] : []),
  ];

  return {
    status: blockingReasons.length > 0 ? "blocking" : "documented_non_blocking",
    dirtyFiles,
    warnings,
    blockingReasons,
  };
}

function parseParentStatusLine(line: string): DirtyFileRecord | null {
  if (!line.trim()) return null;
  const statusCode = line.slice(0, 2);
  const path = normalizePath(line.slice(3).trim());
  if (!path) return null;

  return {
    path,
    statusCode,
    reason: path === DOCUMENTED_VENDOR_PATH
      ? "parent gitlink reports nested vendor repository drift"
      : "parent repository dirty path",
  };
}

function parseNestedVendorStatusLine(line: string): DirtyFileRecord | null {
  if (!line.trim()) return null;
  const statusCode = line.slice(0, 2);
  const nestedPath = normalizePath(line.slice(3).trim());
  if (!nestedPath) return null;

  const path = `${DOCUMENTED_VENDOR_PATH}/${nestedPath}`;
  return {
    path,
    statusCode,
    reason: DOCUMENTED_VENDOR_LOCKFILES.has(path)
      ? "documented nested vendor lockfile drift"
      : "nested vendor dirty path",
  };
}

function isDocumentedVendorRecord(record: DirtyFileRecord): boolean {
  return record.path === DOCUMENTED_VENDOR_PATH || DOCUMENTED_VENDOR_LOCKFILES.has(record.path);
}

function isDocumentedProjectRecord(record: DirtyFileRecord): boolean {
  return DOCUMENTED_PROJECT_PATHS.has(record.path) ||
    DOCUMENTED_PROJECT_PREFIXES.some((prefix) => record.path.startsWith(prefix));
}

function isDocumentedNonBlockingRecord(record: DirtyFileRecord): boolean {
  return isDocumentedVendorRecord(record) || isDocumentedProjectRecord(record);
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^"|"$/g, "");
}
