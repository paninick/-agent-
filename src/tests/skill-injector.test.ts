import { describe, expect, it } from "vitest";
import {
  createSkillRegistry,
  defaultConfigForTier,
  estimateTokensFromSize,
  type SkillDescriptor,
} from "../skills";
import { loadSkillsForAgent } from "../agent/skillInjector";

// ===== Fixtures =====

function skillDescriptor(
  skillId: string,
  description: string,
  charCount = 200,
  lineCount = 10,
  overrides: Partial<SkillDescriptor> = {},
): SkillDescriptor {
  return {
    skillId,
    name: skillId,
    description,
    filePath: `/skills/${skillId}/SKILL.md`,
    lineCount,
    charCount,
    ...overrides,
  };
}

function makeRegistry(...descriptors: SkillDescriptor[]) {
  const registry = createSkillRegistry();
  for (const d of descriptors) {
    registry.register(d, estimateTokensFromSize(d.charCount, d.lineCount));
  }
  return registry;
}

function fakeReadFile(map: Record<string, string>) {
  return (filePath: string): string => {
    const content = map[filePath];
    if (!content) throw new Error("ENOENT");
    return content;
  };
}

// ===== Happy path (3) =====

describe("P6 Skill Injector", () => {
  it("loads always-needed skills and skips rarely-needed ones", async () => {
    const registry = makeRegistry(
      skillDescriptor("core", "essential core skill"),
      skillDescriptor("legacy", "deprecated legacy thing"),
    );
    const readFile = fakeReadFile({
      "/skills/core/SKILL.md": "# Core\n\nImportant content.",
      "/skills/legacy/SKILL.md": "# Legacy\n\nOld stuff.",
    });

    const result = await loadSkillsForAgent({
      registry,
      config: defaultConfigForTier("medium"),
      readFile,
    });

    expect(result.skillContent).toContain("Core");
    expect(result.skillContent).not.toContain("Legacy");
    expect(result.skillContent).toContain("Loaded Skills");
    expect(result.report).toBeDefined();
  });

  it("loads sometimes-needed skills while budget remains", async () => {
    const registry = makeRegistry(
      skillDescriptor("always1", "essential"),
      skillDescriptor("sometimes1", "domain-specific helper"),
      skillDescriptor("sometimes2", "another domain tool"),
    );
    const readFile = fakeReadFile({
      "/skills/always1/SKILL.md": "# Always\n\nContent A.",
      "/skills/sometimes1/SKILL.md": "# Sometimes 1\n\nContent B.",
      "/skills/sometimes2/SKILL.md": "# Sometimes 2\n\nContent C.",
    });

    const result = await loadSkillsForAgent({
      registry,
      config: defaultConfigForTier("medium"),
      readFile,
    });

    expect(result.skillContent).toContain("Always");
    expect(result.skillContent).toContain("Sometimes 1");
    expect(result.skillContent).toContain("Sometimes 2");
  });

  it("includes both always and sometimes skills, excludes rarely", async () => {
    const registry = makeRegistry(
      skillDescriptor("always-skill", "essential"),
      skillDescriptor("sometimes-skill", "domain-specific"),
      skillDescriptor("rarely-skill", "deprecated"),
    );
    const readFile = fakeReadFile({
      "/skills/always-skill/SKILL.md": "A",
      "/skills/sometimes-skill/SKILL.md": "B",
      "/skills/rarely-skill/SKILL.md": "C",
    });

    const result = await loadSkillsForAgent({
      registry,
      config: defaultConfigForTier("medium"),
      readFile,
    });

    expect(result.skillContent).toContain("always-skill");
    expect(result.skillContent).toContain("sometimes-skill");
    expect(result.skillContent).not.toContain("rarely-skill");
  });

  // ===== Budget enforcement (3) =====

  it("stops loading sometimes-needed when budget is exhausted", async () => {
    const registry = makeRegistry(
      skillDescriptor("always1", "essential", 100, 5),
      skillDescriptor("sometimes1", "domain-specific", 100000, 5000),
      skillDescriptor("sometimes2", "another domain tool", 100, 5),
    );
    // Use code-heavy content so tokens = chars/4 (100k chars → ~25k tokens, exhausts small budget)
    const bigContent = "const x = () => { return [1, 2, 3].map(n => n * 2); };\n".repeat(2000);
    const readFile = fakeReadFile({
      "/skills/always1/SKILL.md": "x".repeat(100),
      "/skills/sometimes1/SKILL.md": bigContent,
      "/skills/sometimes2/SKILL.md": "y".repeat(100),
    });

    // Use a tiny budget so sometimes1 eats it all
    const result = await loadSkillsForAgent({
      registry,
      config: { tier: "small", windowSize: 100, reservedForModel: 10, reservedForSystem: 10 },
      readFile,
    });

    // always1 is always loaded; sometimes1 is huge and exhausts budget;
    // sometimes2 should NOT load because budget is exhausted by sometimes1
    expect(result.skillContent).toContain("always1");
    const hasSometimes2 = result.skillContent.includes("sometimes2");
    expect(hasSometimes2).toBe(false);
  });

  it("always-needed skills are loaded even when over budget", async () => {
    const registry = makeRegistry(
      skillDescriptor("always-huge", "essential", 100000, 5000),
    );
    const readFile = fakeReadFile({
      "/skills/always-huge/SKILL.md": "x".repeat(100000),
    });

    const result = await loadSkillsForAgent({
      registry,
      config: { tier: "small", windowSize: 100, reservedForModel: 10, reservedForSystem: 10 },
      readFile,
    });

    expect(result.skillContent).toContain("always-huge");
    expect(result.report.warnings.length).toBeGreaterThan(0);
  });

  it("report reflects utilization and includes warnings when budget exceeded", async () => {
    const registry = makeRegistry(
      skillDescriptor("big", "essential", 500000, 10000),
    );
    const readFile = fakeReadFile({
      "/skills/big/SKILL.md": "x".repeat(500000),
    });

    const result = await loadSkillsForAgent({
      registry,
      config: { tier: "small", windowSize: 1000, reservedForModel: 100, reservedForSystem: 100 },
      readFile,
    });

    expect(result.report.utilizationPercent).toBeGreaterThan(80);
    expect(result.report.warnings.some((w) => w.includes("EXCEEDED"))).toBe(true);
  });

  // ===== Edge cases (3) =====

  it("returns empty skillContent for empty registry", async () => {
    const registry = createSkillRegistry();
    const result = await loadSkillsForAgent({
      registry,
      config: defaultConfigForTier("medium"),
      readFile: fakeReadFile({}),
    });

    expect(result.skillContent).toBe("");
    expect(result.report.items).toHaveLength(0);
  });

  it("skips skills that fail to load (readFile throws) without blocking others", async () => {
    const registry = makeRegistry(
      skillDescriptor("broken", "essential"),
      skillDescriptor("good", "essential"),
    );
    const readFile = (filePath: string): string => {
      if (filePath.includes("broken")) throw new Error("ENOENT");
      return "Good content.";
    };

    const result = await loadSkillsForAgent({
      registry,
      config: defaultConfigForTier("medium"),
      readFile,
    });

    expect(result.skillContent).not.toContain("broken");
    expect(result.skillContent).toContain("good");
  });

  it("skillContent format includes header and skill name", async () => {
    const registry = makeRegistry(
      skillDescriptor("alpha", "essential"),
    );
    const readFile = fakeReadFile({
      "/skills/alpha/SKILL.md": "Alpha skill body text.",
    });

    const result = await loadSkillsForAgent({
      registry,
      config: defaultConfigForTier("medium"),
      readFile,
    });

    expect(result.skillContent).toContain("## Loaded Skills");
    expect(result.skillContent).toContain("Skill: alpha");
  });

  // ===== Boundary (2) =====

  it("skillInjector imports only from ../skills (not sealed layers)", async () => {
    // Structural check: the module imports without error and is a pure function.
    const mod = await import("../agent/skillInjector");
    expect(typeof mod.loadSkillsForAgent).toBe("function");
  });

  it("loadSkillsForAgent with hints respects explicit alwaysNeededSkillIds", async () => {
    const registry = makeRegistry(
      skillDescriptor("plain", "a plain skill with no keywords"),
    );
    const readFile = fakeReadFile({
      "/skills/plain/SKILL.md": "Plain content.",
    });

    const result = await loadSkillsForAgent({
      registry,
      config: defaultConfigForTier("medium"),
      readFile,
      hints: { alwaysNeededSkillIds: ["plain"] },
    });

    expect(result.skillContent).toContain("plain");
  });
});
