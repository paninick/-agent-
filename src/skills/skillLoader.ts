import { estimateTokens } from "./tokenEstimator";
import type { SkillDescriptor, SkillLoadResult, SkillRegistryEntry, TokenEstimate } from "./types";

// ===== Loader config =====

export interface SkillLoaderConfig {
  /** Reads file content from disk. Injected so tests can stub without touching fs. */
  readFile: (filePath: string) => string | Promise<string>;
  /** Optional: refuse to load if the estimated tokens exceed this budget. */
  remainingBudget?: number;
}

// ===== Loader =====

/**
 * Load a skill's full content, estimate its tokens, and enforce the context budget.
 *
 * Returns a discriminated union:
 *  - `ok: true`  → loaded (carries `content`, `tokenEstimate`, `descriptor`)
 *  - `ok: false` → `not_found` / `exceeds_budget` / `parse_error`
 *
 * The loader is pure with respect to disk: all filesystem access flows through
 * the injected `readFile` so it stays testable without temp files.
 */
export async function loadSkill(
  descriptor: SkillDescriptor,
  config: SkillLoaderConfig,
): Promise<SkillLoadResult> {
  let content: string;
  try {
    content = await config.readFile(descriptor.filePath);
  } catch {
    return {
      ok: false,
      status: "not_found",
      skillId: descriptor.skillId,
      message: `Skill file not found at ${descriptor.filePath}.`,
    };
  }

  if (!content || content.length === 0) {
    return {
      ok: false,
      status: "parse_error",
      skillId: descriptor.skillId,
      message: `Skill file ${descriptor.filePath} is empty.`,
    };
  }

  const tokenEstimate = estimateTokens(content);

  if (config.remainingBudget !== undefined && tokenEstimate.tokens > config.remainingBudget) {
    return {
      ok: false,
      status: "exceeds_budget",
      skillId: descriptor.skillId,
      message: `Skill "${descriptor.skillId}" needs ~${tokenEstimate.tokens} tokens but only ${config.remainingBudget} remain.`,
    };
  }

  return {
    ok: true,
    descriptor,
    content,
    tokenEstimate,
  };
}

/**
 * Build a registry entry from a descriptor using size-based token estimation
 * (no file content read). Useful for the registry scan phase.
 */
export function buildRegistryEntry(
  descriptor: SkillDescriptor,
  estimateFromSize: (charCount: number, lineCount: number) => TokenEstimate,
): SkillRegistryEntry {
  return {
    descriptor,
    tokenEstimate: estimateFromSize(descriptor.charCount, descriptor.lineCount),
  };
}
