import {
  classifyAll,
  computeAllocation,
  generateReport,
  loadSkill,
  type BudgetReport,
  type ClassificationHints,
  type ContextBudgetConfig,
  type SkillRegistry,
} from "../skills";

// ===== Skill injection result =====

export interface SkillInjectionResult {
  skillContent: string;
  report: BudgetReport;
}

/**
 * Load skill content for the agent prompt, respecting the context budget.
 *
 * Strategy:
 * 1. Classify all registered skills (always / sometimes / rarely needed).
 * 2. Always load `always_needed` skills (mandatory, regardless of budget).
 * 3. Load `sometimes_needed` skills while budget remains.
 * 4. Skip `rarely_needed` skills entirely.
 * 5. Each skill's content is read via the injected `readFile`.
 * 6. If a skill fails to load (not_found / parse_error), it is skipped —
 *    it does NOT block the other skills.
 *
 * Returns the assembled skill content block (to prepend to instructions)
 * and the full budget report for observability.
 */
export async function loadSkillsForAgent(opts: {
  registry: SkillRegistry;
  config: ContextBudgetConfig;
  readFile: (filePath: string) => string | Promise<string>;
  hints?: ClassificationHints;
}): Promise<SkillInjectionResult> {
  const { registry, config, readFile, hints } = opts;

  const entries = registry.list();
  const classified = classifyAll(entries, hints);
  const allocation = computeAllocation(config, classified);
  const report = generateReport(config, classified);

  // Sort by priority: always first, then sometimes, then rarely.
  const priorityOrder = { always_needed: 0, sometimes_needed: 1, rarely_needed: 2 } as const;
  const sorted = [...classified].sort(
    (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority],
  );

  const loadedContents: string[] = [];
  let remainingBudget = allocation.availableForSkills;

  for (const skill of sorted) {
    // Never load rarely-needed skills.
    if (skill.priority === "rarely_needed") continue;

    // Always-needed skills are loaded even if they exceed budget.
    // Sometimes-needed skills are only loaded if budget remains.
    if (skill.priority === "sometimes_needed" && remainingBudget <= 0) continue;

    const result = await loadSkill(skill.descriptor, { readFile });
    if (!result.ok) {
      // Skip on failure — do not block other skills.
      continue;
    }

    loadedContents.push(formatSkillBlock(skill.descriptor.name, skill.descriptor.skillId, result.content));
    remainingBudget -= result.tokenEstimate.tokens;
  }

  const skillContent = loadedContents.length > 0
    ? `## Loaded Skills\n\n${loadedContents.join("\n---\n\n")}\n`
    : "";

  return { skillContent, report };
}

function formatSkillBlock(name: string, skillId: string, content: string): string {
  return `### Skill: ${name} (${skillId})\n\n${content}`;
}
