import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// ===== Learning entry types =====

export type LearningType = "learning" | "error" | "feature_request";

export type LearningSeverity = "info" | "warning" | "error" | "critical";

export interface LearningEntry {
  id: string;
  type: LearningType;
  timestamp: string; // ISO 8601
  category: string; // e.g. "api-design", "performance", "security"
  severity?: LearningSeverity;
  title: string;
  description: string;
  context?: string; // situation in which it occurred
  resolution?: string; // how it was resolved
  tags?: string[];
  filePath?: string; // related file path
}

// ===== File mapping =====

const FILE_BY_TYPE: Record<LearningType, string> = {
  learning: "LEARNINGS.md",
  error: "ERRORS.md",
  feature_request: "FEATURE_REQUESTS.md",
};

const TYPE_BY_FILE: Record<string, LearningType> = {
  "LEARNINGS.md": "learning",
  "ERRORS.md": "error",
  "FEATURE_REQUESTS.md": "feature_request",
};

const SEVERITIES: readonly LearningSeverity[] = ["info", "warning", "error", "critical"];

const HEADER_BY_TYPE: Record<LearningType, string> = {
  learning:
    "# Learnings Log\n\nTracks learnings, corrections, and knowledge gaps for continuous improvement.\nEntry format: `[LRN-YYYYMMDD-XXX] category`\n\nCategories: correction | knowledge_gap | best_practice\n\n---\n",
  error:
    "# Errors Log\n\nTracks errors and failures for continuous improvement.\nEntry format: `[ERR-YYYYMMDD-XXX] skill_or_command_name`\n\n---\n",
  feature_request:
    "# Feature Requests Log\n\nTracks feature requests and capability gaps.\nEntry format: `[FEAT-YYYYMMDD-XXX] capability_name`\n\n---\n",
};

// ===== Summary types =====

export interface CategoryCount {
  category: string;
  count: number;
}

export interface LearningsSummary {
  totalLearnings: number;
  totalErrors: number;
  totalFeatureRequests: number;
  topCategories: CategoryCount[];
  recentEntries: LearningEntry[];
}

// ===== Learnings manager =====

/**
 * Manages the `.learnings/` directory's three Markdown logs:
 * LEARNINGS.md, ERRORS.md, and FEATURE_REQUESTS.md. Reads, appends, queries,
 * summarizes, and re-exports entries that follow a `##`-headed, bulleted-field
 * format. Encodes the self-improvement skill's methodology as project source.
 *
 * Filesystem access uses Node's synchronous `fs` API. Read failures degrade
 * gracefully to an empty result set rather than throwing.
 */
export class LearningsManager {
  private readonly learningsDir: string;

  constructor(learningsDir?: string) {
    this.learningsDir = learningsDir ?? join(process.cwd(), ".learnings");
  }

  /** Read all learning entries, optionally filtered by type. */
  readAll(type?: LearningType): LearningEntry[] {
    const types: LearningType[] = type ? [type] : (Object.keys(FILE_BY_TYPE) as LearningType[]);
    const entries: LearningEntry[] = [];
    for (const t of types) {
      entries.push(...this.readFromFile(FILE_BY_TYPE[t]));
    }
    return entries;
  }

  /** Append a new entry to the appropriate log file and return the stored entry. */
  append(entry: Omit<LearningEntry, "id" | "timestamp">): LearningEntry {
    const timestamp = new Date().toISOString();
    const id = `learning-${timestamp.replace(/[-:.]/g, "")}-${randomSuffix()}`;
    const fullEntry: LearningEntry = { ...entry, id, timestamp };

    this.ensureDir();
    const filePath = join(this.learningsDir, FILE_BY_TYPE[fullEntry.type]);
    this.ensureFile(fullEntry.type, filePath);
    appendFileSync(filePath, formatEntryMarkdown(fullEntry), "utf8");
    return fullEntry;
  }

  /** Return all entries whose category matches exactly. */
  getByCategory(category: string): LearningEntry[] {
    return this.readAll().filter((e) => e.category === category);
  }

  /** Return all entries whose severity matches. */
  getBySeverity(severity: LearningSeverity): LearningEntry[] {
    return this.readAll().filter((e) => e.severity === severity);
  }

  /** Search across title, description, context, and tags (case-insensitive). */
  search(query: string): LearningEntry[] {
    const q = query.toLowerCase();
    return this.readAll().filter((e) => {
      const haystack = [e.title, e.description, e.context ?? "", ...(e.tags ?? [])]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }

  /** Generate an aggregate summary across all logs. */
  generateSummary(): LearningsSummary {
    const all = this.readAll();
    const categoryCounts = new Map<string, number>();
    for (const e of all) {
      categoryCounts.set(e.category, (categoryCounts.get(e.category) ?? 0) + 1);
    }
    const topCategories: CategoryCount[] = Array.from(categoryCounts.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);
    const recentEntries = [...all]
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, 10);
    return {
      totalLearnings: all.filter((e) => e.type === "learning").length,
      totalErrors: all.filter((e) => e.type === "error").length,
      totalFeatureRequests: all.filter((e) => e.type === "feature_request").length,
      topCategories,
      recentEntries,
    };
  }

  /** Export all entries of a given type as a complete Markdown document. */
  exportMarkdown(type: LearningType): string {
    const entries = this.readAll(type);
    const body = entries.map(formatEntryMarkdown).join("");
    return `${HEADER_BY_TYPE[type]}\n${body}`.trimEnd() + "\n";
  }

  // ===== Private helpers =====

  private readFromFile(fileName: string): LearningEntry[] {
    const filePath = join(this.learningsDir, fileName);
    let content: string;
    try {
      content = readFileSync(filePath, "utf8");
    } catch {
      return [];
    }
    const type = TYPE_BY_FILE[fileName];
    return parseEntries(content, type);
  }

  private ensureDir(): void {
    try {
      if (!existsSync(this.learningsDir)) {
        mkdirSync(this.learningsDir, { recursive: true });
      }
    } catch {
      // best-effort; downstream file writes will surface failures if any
    }
  }

  private ensureFile(type: LearningType, filePath: string): void {
    try {
      if (!existsSync(filePath)) {
        writeFileSync(filePath, HEADER_BY_TYPE[type], "utf8");
      }
    } catch {
      // best-effort; downstream append will surface failures if any
    }
  }
}

export function createLearningsManager(learningsDir?: string): LearningsManager {
  return new LearningsManager(learningsDir);
}

// ===== Markdown formatting =====

function formatEntryMarkdown(entry: LearningEntry): string {
  const lines: string[] = [];
  lines.push(`## ${entry.id} - ${entry.title}`);
  lines.push("");
  lines.push(`- **Timestamp**: ${entry.timestamp}`);
  lines.push(`- **Category**: ${entry.category}`);
  if (entry.severity) lines.push(`- **Severity**: ${entry.severity}`);
  if (entry.tags && entry.tags.length > 0) lines.push(`- **Tags**: ${entry.tags.join(", ")}`);
  if (entry.filePath) lines.push(`- **File**: ${entry.filePath}`);
  lines.push("");
  lines.push(entry.description);
  if (entry.context) {
    lines.push("");
    lines.push(`**Context**: ${entry.context}`);
  }
  if (entry.resolution) {
    lines.push("");
    lines.push(`**Resolution**: ${entry.resolution}`);
  }
  lines.push("");
  lines.push("");
  return lines.join("\n");
}

// ===== Markdown parsing =====

interface RawEntry {
  id: string;
  title: string;
  fields: Map<string, string>;
  descriptionLines: string[];
  context?: string;
  resolution?: string;
}

function parseEntries(content: string, type: LearningType): LearningEntry[] {
  if (!content) return [];
  const lines = content.split(/\r?\n/);
  const entries: LearningEntry[] = [];
  let current: RawEntry | null = null;

  for (const line of lines) {
    if (line.startsWith("## ")) {
      if (current) entries.push(finalizeEntry(current, type));
      const { id, title } = parseHeading(line.slice(3).trim());
      current = { id, title, fields: new Map(), descriptionLines: [] };
      continue;
    }
    if (!current) continue;

    const bullet = matchBullet(line);
    if (bullet) {
      current.fields.set(bullet.field, bullet.value);
      continue;
    }
    const context = matchLabeled(line, "Context");
    if (context !== undefined) {
      current.context = context;
      continue;
    }
    const resolution = matchLabeled(line, "Resolution");
    if (resolution !== undefined) {
      current.resolution = resolution;
      continue;
    }
    if (line.trim().length > 0) {
      current.descriptionLines.push(line.trim());
    }
  }
  if (current) entries.push(finalizeEntry(current, type));
  return entries;
}

function parseHeading(heading: string): { id: string; title: string } {
  const idx = heading.indexOf(" - ");
  if (idx === -1) return { id: heading, title: "" };
  return { id: heading.slice(0, idx).trim(), title: heading.slice(idx + 3).trim() };
}

function matchBullet(line: string): { field: string; value: string } | null {
  const match = line.match(/^-\s+\*\*([^*]+)\*\*:\s*(.*)$/);
  if (!match) return null;
  return { field: match[1].trim(), value: match[2].trim() };
}

function matchLabeled(line: string, label: string): string | undefined {
  const match = line.match(new RegExp(`^\\*\\*${label}\\*\\*:\\s*(.*)$`));
  if (!match) return undefined;
  return match[1].trim();
}

function finalizeEntry(raw: RawEntry, type: LearningType): LearningEntry {
  const tagsRaw = raw.fields.get("Tags");
  const tags = tagsRaw
    ? tagsRaw
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0)
    : undefined;
  const severityRaw = raw.fields.get("Severity");
  const severity =
    severityRaw && (SEVERITIES as readonly string[]).includes(severityRaw)
      ? (severityRaw as LearningSeverity)
      : undefined;
  const filePath = raw.fields.get("File") || undefined;
  const description = raw.descriptionLines.join("\n").trim();

  const entry: LearningEntry = {
    id: raw.id,
    type,
    timestamp: raw.fields.get("Timestamp") ?? "",
    category: raw.fields.get("Category") ?? "",
    title: raw.title,
    description,
  };
  if (severity) entry.severity = severity;
  if (tags && tags.length > 0) entry.tags = tags;
  if (filePath) entry.filePath = filePath;
  if (raw.context) entry.context = raw.context;
  if (raw.resolution) entry.resolution = raw.resolution;
  return entry;
}

// ===== ID helpers =====

function randomSuffix(): string {
  // 8-char base36 suffix; avoids extra dependencies while keeping collisions negligible
  return Math.random().toString(36).slice(2, 10);
}
