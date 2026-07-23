import type { SkillDescriptor } from "./types";

// ===== Scanner config =====

export interface SkillScannerConfig {
  /** Root directory to scan for SKILL.md files (recursive). */
  rootDir: string;
  /** Reads file content as UTF-8 string. Injected for testability (use node:fs in production). */
  readFile: (filePath: string) => string | Promise<string>;
  /** Lists directories under a path. Injected for testability (use node:fs in production). */
  listDir: (dirPath: string) => string[] | Promise<string[]>;
  /** Checks if a path is a file. Injected for testability. */
  isFile: (path: string) => boolean | Promise<boolean>;
  /** Path separator (default: "/"). */
  separator?: string;
}

// ===== Scanner =====

const SKILL_FILE_NAME = "SKILL.md";

/**
 * Recursively scan a directory for SKILL.md files, parse their YAML frontmatter,
 * and return SkillDescriptor[] with pre-computed file size metadata.
 *
 * The scanner is pure with respect to the filesystem — all IO flows through the
 * injected readFile/listDir/isFile functions, so it stays testable without temp files.
 *
 * Frontmatter format (YAML):
 *   ---
 *   name: skill-id
 *   description: A short description.
 *   metadata:
 *     origin: ECC
 *   ---
 */
export async function scanSkills(config: SkillScannerConfig): Promise<SkillDescriptor[]> {
  const sep = config.separator ?? "/";
  const descriptors: SkillDescriptor[] = [];
  await scanDir(config.rootDir, sep, config, descriptors);
  return descriptors;
}

/**
 * Synchronous variant of scanSkills — uses sync IO callbacks.
 * Identical logic but returns SkillDescriptor[] directly (no Promise).
 */
export function scanSkillsSync(config: SkillScannerConfig): SkillDescriptor[] {
  const sep = config.separator ?? "/";
  const descriptors: SkillDescriptor[] = [];
  scanDirSync(config.rootDir, sep, config, descriptors);
  return descriptors;
}

async function scanDir(
  dir: string,
  sep: string,
  config: SkillScannerConfig,
  out: SkillDescriptor[],
): Promise<void> {
  let entries: string[];
  try {
    entries = await config.listDir(dir);
  } catch {
    return; // Directory not accessible — skip.
  }

  for (const entry of entries) {
    const fullPath = dir.endsWith(sep) ? `${dir}${entry}` : `${dir}${sep}${entry}`;

    const isFile = await config.isFile(fullPath);
    if (isFile) {
      if (entry === SKILL_FILE_NAME) {
        const descriptor = await scanSkillFile(fullPath, config);
        if (descriptor) out.push(descriptor);
      }
      continue;
    }

    // Recurse into subdirectories
    await scanDir(fullPath, sep, config, out);
  }
}

function scanDirSync(
  dir: string,
  sep: string,
  config: SkillScannerConfig,
  out: SkillDescriptor[],
): void {
  let entries: string[];
  try {
    entries = config.listDir(dir) as string[];
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = dir.endsWith(sep) ? `${dir}${entry}` : `${dir}${sep}${entry}`;

    const isFile = config.isFile(fullPath) as boolean;
    if (isFile) {
      if (entry === SKILL_FILE_NAME) {
        const descriptor = scanSkillFileSync(fullPath, config);
        if (descriptor) out.push(descriptor);
      }
      continue;
    }

    scanDirSync(fullPath, sep, config, out);
  }
}

async function scanSkillFile(
  filePath: string,
  config: SkillScannerConfig,
): Promise<SkillDescriptor | null> {
  let content: string;
  try {
    content = await config.readFile(filePath);
  } catch {
    return null;
  }

  return parseSkillContent(filePath, content);
}

function scanSkillFileSync(
  filePath: string,
  config: SkillScannerConfig,
): SkillDescriptor | null {
  let content: string;
  try {
    content = config.readFile(filePath) as string;
  } catch {
    return null;
  }

  return parseSkillContent(filePath, content);
}

function parseSkillContent(filePath: string, content: string): SkillDescriptor | null {
  if (!content || content.length === 0) return null;

  const frontmatter = parseFrontmatter(content);
  if (!frontmatter.name) return null;

  const lines = content.split("\n");
  const skillId = frontmatter.name;
  const name = frontmatter.name;
  const description = frontmatter.description ?? "";
  const origin = frontmatter.metadata?.origin;

  return {
    skillId,
    name,
    description,
    origin,
    filePath,
    lineCount: lines.length,
    charCount: content.length,
  };
}

// ===== Minimal YAML frontmatter parser =====

interface ParsedFrontmatter {
  name?: string;
  description?: string;
  metadata?: {
    origin?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * Parse a YAML frontmatter block (delimited by ---\n).
 * This is a minimal parser that handles the subset of YAML used by SKILL.md files:
 * scalar key-value pairs and a nested `metadata` object.
 */
export function parseFrontmatter(content: string): ParsedFrontmatter {
  const result: ParsedFrontmatter = {};

  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!match) return result;

  const block = match[1];
  const lines = block.split("\n");
  let currentSection: string | null = null;

  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith("#")) continue;

    // Check for nested section (e.g. "metadata:")
    const sectionMatch = line.match(/^(\w+):\s*$/);
    if (sectionMatch && !line.startsWith(" ")) {
      currentSection = sectionMatch[1];
      if (currentSection === "metadata" && !result.metadata) {
        result.metadata = {};
      }
      continue;
    }

    // Key-value pair
    const kvMatch = line.match(/^\s*(\w+):\s*(.*)$/);
    if (kvMatch) {
      const [, key, rawValue] = kvMatch;
      const value = cleanValue(rawValue);

      if (currentSection === "metadata" && result.metadata) {
        (result.metadata as Record<string, unknown>)[key] = value;
      } else if (!currentSection) {
        (result as Record<string, unknown>)[key] = value;
      }
    }
  }

  return result;
}

function cleanValue(raw: string): string {
  // Remove surrounding quotes
  let value = raw.trim();
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  return value;
}
