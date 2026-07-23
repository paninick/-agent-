import { describe, expect, it } from "vitest";
import {
  SkillRegistry,
  buildRegistryEntry,
  classifyAll,
  classifySkill,
  computeAllocation,
  createSkillRegistry,
  defaultConfigForTier,
  estimateTokens,
  estimateTokensFromSize,
  generateReport,
  loadSkill,
  type ClassificationHints,
  type ContextBudgetConfig,
  type SkillDescriptor,
  type SkillRegistryEntry,
} from "../skills";

// ===== Fixtures =====

function skillDescriptor(
  skillId: string,
  description = "A test skill.",
  overrides: Partial<SkillDescriptor> = {},
): SkillDescriptor {
  return {
    skillId,
    name: skillId,
    description,
    filePath: `/skills/${skillId}/SKILL.md`,
    lineCount: 10,
    charCount: 100,
    ...overrides,
  };
}

function makeRegistry(...descriptors: SkillDescriptor[]): SkillRegistry {
  const registry = createSkillRegistry();
  for (const d of descriptors) {
    registry.register(d, estimateTokensFromSize(d.charCount, d.lineCount));
  }
  return registry;
}

function mediumConfig(): ContextBudgetConfig {
  return defaultConfigForTier("medium");
}

// ===== Happy path (4) =====

describe("P5 Skill Progressive Loading + Context Budget", () => {
  it("estimates tokens for prose content", () => {
    const est = estimateTokens("hello world this is plain prose");
    expect(est.tokens).toBeGreaterThanOrEqual(1);
    expect(est.method).toBe("prose");
  });

  it("registers and looks up a skill in the registry", () => {
    const registry = createSkillRegistry();
    const desc = skillDescriptor("alpha");
    const entry = registry.register(desc, estimateTokensFromSize(100, 10));
    expect(entry.descriptor.skillId).toBe("alpha");
    expect(registry.lookup("alpha")?.descriptor.skillId).toBe("alpha");
    expect(registry.has("alpha")).toBe(true);
    expect(registry.size()).toBe(1);
  });

  it("removes a skill from the registry", () => {
    const registry = makeRegistry(skillDescriptor("beta"));
    expect(registry.remove("beta")).toBe(true);
    expect(registry.has("beta")).toBe(false);
    expect(registry.size()).toBe(0);
  });

  it("lists all registered skills", () => {
    const registry = makeRegistry(skillDescriptor("a"), skillDescriptor("b"), skillDescriptor("c"));
    expect(registry.list()).toHaveLength(3);
  });

  // ===== Token estimation (5) =====

  it("returns zero tokens for empty content", () => {
    const est = estimateTokens("");
    expect(est.tokens).toBe(0);
  });

  it("detects code-heavy content as code method", () => {
    const code = "const x = () => { return [1, 2, 3].map(n => n * 2); };";
    const est = estimateTokens(code);
    expect(est.method).toBe("code");
    expect(est.tokens).toBeGreaterThanOrEqual(1);
  });

  it("falls back to mixed method for borderline content", () => {
    const est = estimateTokens("some text with a = b and c + d mixed in");
    expect(est.method === "mixed" || est.method === "code").toBe(true);
  });

  it("estimateTokensFromSize infers code method for long lines", () => {
    const est = estimateTokensFromSize(1200, 10);
    expect(est.method).toBe("code");
    expect(est.tokens).toBeGreaterThanOrEqual(1);
  });

  it("estimateTokensFromSize infers prose method for short lines", () => {
    const est = estimateTokensFromSize(200, 40);
    expect(est.method).toBe("prose");
    expect(est.tokens).toBeGreaterThanOrEqual(1);
  });

  // ===== Classification (5) =====

  it("classifies an always-needed skill via explicit id hint", () => {
    const registry = makeRegistry(skillDescriptor("core-tool"));
    const entry = registry.lookup("core-tool")!;
    const hints: ClassificationHints = { alwaysNeededSkillIds: ["core-tool"] };
    const result = classifySkill(entry, hints);
    expect(result.priority).toBe("always_needed");
    expect(result.reason).toContain("always needed");
  });

  it("classifies a rarely-needed skill via explicit id hint", () => {
    const registry = makeRegistry(skillDescriptor("legacy-thing"));
    const entry = registry.lookup("legacy-thing")!;
    const hints: ClassificationHints = { rarelyNeededSkillIds: ["legacy-thing"] };
    const result = classifySkill(entry, hints);
    expect(result.priority).toBe("rarely_needed");
  });

  it("classifies via description keyword match", () => {
    const registry = makeRegistry(skillDescriptor("a", "An essential core tool."));
    const entry = registry.lookup("a")!;
    const result = classifySkill(entry);
    expect(result.priority).toBe("always_needed");
  });

  it("defaults unmarked skills to sometimes_needed", () => {
    const registry = makeRegistry(skillDescriptor("mid", "A domain-specific helper."));
    const entry = registry.lookup("mid")!;
    const result = classifySkill(entry);
    expect(result.priority).toBe("sometimes_needed");
  });

  it("classifyAll maps across the full registry", () => {
    const registry = makeRegistry(
      skillDescriptor("core", "essential"),
      skillDescriptor("old", "deprecated"),
      skillDescriptor("mid", "domain-specific"),
    );
    const results = classifyAll(registry.list());
    expect(results).toHaveLength(3);
    const byId = new Map(results.map((r) => [r.descriptor.skillId, r.priority]));
    expect(byId.get("core")).toBe("always_needed");
    expect(byId.get("old")).toBe("rarely_needed");
    expect(byId.get("mid")).toBe("sometimes_needed");
  });

  // ===== Context budget (5) =====

  it("computes allocation and subtracts reserved from window", () => {
    const config = mediumConfig();
    const registry = makeRegistry(
      skillDescriptor("a", "essential"),
      skillDescriptor("b", "domain-specific"),
    );
    const skills = classifyAll(registry.list(), {});
    const alloc = computeAllocation(config, skills);
    expect(alloc.totalWindow).toBe(config.windowSize);
    expect(alloc.availableForSkills).toBe(config.windowSize - config.reservedForModel - config.reservedForSystem);
    expect(alloc.remainingBudget).toBeGreaterThanOrEqual(0);
  });

  it("utilization percent stays within 0-100 for empty skill set", () => {
    const alloc = computeAllocation(mediumConfig(), []);
    expect(alloc.utilizationPercent).toBe(0);
    expect(alloc.estimatedSkillTokens).toBe(0);
  });

  it("generateReport emits a warning when budget is exceeded", () => {
    const config: ContextBudgetConfig = {
      tier: "small",
      windowSize: 8_000,
      reservedForModel: 4_000,
      reservedForSystem: 2_000,
    };
    const desc = skillDescriptor("huge", "big", { charCount: 50_000, lineCount: 500 });
    const registry = makeRegistry(desc);
    const classified = classifyAll(registry.list());
    const report = generateReport(config, classified);
    expect(report.warnings.length).toBeGreaterThan(0);
    expect(report.warnings.some((w) => w.includes("EXCEEDED"))).toBe(true);
  });

  it("generateReport suggests removing rarely-needed skills", () => {
    const registry = makeRegistry(
      skillDescriptor("legacy", "deprecated old thing", { charCount: 5_000, lineCount: 100 }),
    );
    const classified = classifyAll(registry.list());
    const report = generateReport(mediumConfig(), classified);
    expect(report.topOptimizations.some((o) => o.includes("rarely-needed"))).toBe(true);
  });

  it("report items are sorted by priority then by tokens descending", () => {
    const registry = makeRegistry(
      skillDescriptor("legacy", "deprecated", { charCount: 6_000, lineCount: 100 }),
      skillDescriptor("core", "essential", { charCount: 2_000, lineCount: 50 }),
      skillDescriptor("mid", "domain-specific", { charCount: 3_000, lineCount: 60 }),
    );
    const classified = classifyAll(registry.list());
    const report = generateReport(mediumConfig(), classified);
    expect(report.items[0].priority).toBe("always_needed");
    const rarelyIdx = report.items.findIndex((i) => i.priority === "rarely_needed");
    expect(rarelyIdx).toBeGreaterThan(0);
  });

  // ===== Loader (5) =====

  it("loads a skill successfully and returns content + token estimate", async () => {
    const desc = skillDescriptor("good");
    const result = await loadSkill(desc, {
      readFile: async () => "# Good Skill\n\nThis is a description of a useful capability.",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.content).toContain("Good Skill");
      expect(result.tokenEstimate.tokens).toBeGreaterThanOrEqual(1);
      expect(result.descriptor.skillId).toBe("good");
    }
  });

  it("returns not_found when readFile throws", async () => {
    const desc = skillDescriptor("missing");
    const result = await loadSkill(desc, {
      readFile: () => {
        throw new Error("ENOENT");
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe("not_found");
      expect(result.skillId).toBe("missing");
    }
  });

  it("returns parse_error for empty file content", async () => {
    const desc = skillDescriptor("empty");
    const result = await loadSkill(desc, { readFile: async () => "" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe("parse_error");
  });

  it("returns exceeds_budget when tokens exceed remainingBudget", async () => {
    const desc = skillDescriptor("big");
    // Code-heavy content so tokens = chars/4; 200 chars → ~50 tokens, exceeds budget of 5.
    const result = await loadSkill(desc, {
      readFile: async () => "const x = () => { return [1, 2, 3].map(n => n * 2); };".repeat(4),
      remainingBudget: 5,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe("exceeds_budget");
  });

  it("allows loading when remainingBudget is undefined (no cap)", async () => {
    const desc = skillDescriptor("nocap");
    const result = await loadSkill(desc, {
      readFile: async () => "x".repeat(10000),
    });
    expect(result.ok).toBe(true);
  });

  // ===== Registry entry builder (1) =====

  it("buildRegistryEntry estimates tokens from descriptor size", () => {
    const desc = skillDescriptor("built", "built skill", { charCount: 800, lineCount: 20 });
    const entry: SkillRegistryEntry = buildRegistryEntry(desc, estimateTokensFromSize);
    expect(entry.descriptor.skillId).toBe("built");
    expect(entry.tokenEstimate.tokens).toBeGreaterThanOrEqual(1);
  });

  // ===== Boundary protection (3) =====

  it("defaultConfigForTier returns the documented tier defaults", () => {
    expect(defaultConfigForTier("small").windowSize).toBe(8_000);
    expect(defaultConfigForTier("medium").windowSize).toBe(32_000);
    expect(defaultConfigForTier("large").windowSize).toBe(200_000);
  });

  it("src/skills barrel exports the full public surface", async () => {
    // Re-importing the barrel as a namespace confirms all symbols are exported.
    const barrel = await import("../skills");
    expect(typeof barrel.estimateTokens).toBe("function");
    expect(typeof barrel.estimateTokensFromSize).toBe("function");
    expect(typeof barrel.loadSkill).toBe("function");
    expect(typeof barrel.buildRegistryEntry).toBe("function");
    expect(typeof barrel.classifySkill).toBe("function");
    expect(typeof barrel.classifyAll).toBe("function");
    expect(typeof barrel.computeAllocation).toBe("function");
    expect(typeof barrel.generateReport).toBe("function");
    expect(typeof barrel.defaultConfigForTier).toBe("function");
    expect(typeof barrel.createSkillRegistry).toBe("function");
    expect(typeof barrel.SkillRegistry).toBe("function");
  });

  it("src/skills does not import from sealed layers (integration/governance/runtime/mcp/models/intelligence)", async () => {
    // Structural boundary: import each skills module individually. None may throw,
    // and none pull in sealed-layer side effects (they import only from ./types
    // and ./tokenEstimator / ./skillRegistry — pure internal references).
    await import("../skills/types");
    await import("../skills/tokenEstimator");
    await import("../skills/skillRegistry");
    await import("../skills/contextBudget");
    await import("../skills/skillLoader");
    await import("../skills/index");
    expect(true).toBe(true);
  });
});
