import { describe, expect, it } from "vitest";
import { parseFrontmatter, scanSkills, scanSkillsSync } from "../skills";

// ===== Fixtures =====

function makeFs(files: Record<string, string>, inaccessibleDirs: string[] = []) {
  const normalizedFiles = new Map(Object.entries(files));
  const inaccessible = new Set(inaccessibleDirs);

  const listDir = (dirPath: string): string[] => {
    if (inaccessible.has(dirPath)) throw new Error("EACCES");
    const prefix = dirPath.endsWith("/") ? dirPath : `${dirPath}/`;
    const entries = new Set<string>();
    for (const filePath of normalizedFiles.keys()) {
      if (!filePath.startsWith(prefix)) continue;
      const rest = filePath.slice(prefix.length);
      const [entry] = rest.split("/");
      if (entry) entries.add(entry);
    }
    return [...entries].sort();
  };

  const isFile = (filePath: string): boolean => normalizedFiles.has(filePath);
  const readFile = (filePath: string): string => {
    const content = normalizedFiles.get(filePath);
    if (content === undefined) throw new Error("ENOENT");
    return content;
  };

  return { listDir, isFile, readFile };
}

// ===== Parser =====

describe("P7 Skill Scanner", () => {
  it("parses scalar frontmatter and metadata origin", () => {
    const parsed = parseFrontmatter([
      "---",
      "name: agent-os-demo",
      "description: Demo skill",
      "metadata:",
      "  origin: ECC",
      "---",
      "# Body",
    ].join("\n"));

    expect(parsed.name).toBe("agent-os-demo");
    expect(parsed.description).toBe("Demo skill");
    expect(parsed.metadata?.origin).toBe("ECC");
  });

  it("returns an empty object when frontmatter is missing", () => {
    expect(parseFrontmatter("# No frontmatter")).toEqual({});
  });

  it("parses CRLF frontmatter used by checked-out Windows skill repositories", () => {
    const parsed = parseFrontmatter(
      "---\r\nname: windows-skill\r\ndescription: CRLF fixture\r\nmetadata:\r\n  origin: ECC\r\n---\r\n# Body\r\n",
    );
    expect(parsed.name).toBe("windows-skill");
    expect(parsed.metadata?.origin).toBe("ECC");
  });

  // ===== Sync scanning =====

  it("recursively scans SKILL.md files into descriptors", () => {
    const fs = makeFs({
      "/skills/a/SKILL.md": "---\nname: alpha\ndescription: Alpha skill\n---\n# Alpha\n",
      "/skills/nested/b/SKILL.md": "---\nname: beta\ndescription: Beta skill\nmetadata:\n  origin: vendor\n---\n# Beta\n",
      "/skills/nested/readme.md": "ignore",
    });

    const descriptors = scanSkillsSync({
      rootDir: "/skills",
      ...fs,
      separator: "/",
    });

    expect(descriptors.map((d) => d.skillId).sort()).toEqual(["alpha", "beta"]);
    expect(descriptors.find((d) => d.skillId === "beta")?.origin).toBe("vendor");
    expect(descriptors.every((d) => d.filePath.endsWith("SKILL.md"))).toBe(true);
  });

  it("skips files without a skill name", () => {
    const fs = makeFs({
      "/skills/bad/SKILL.md": "---\ndescription: Missing name\n---\n# Bad\n",
      "/skills/good/SKILL.md": "---\nname: good\ndescription: Good\n---\n# Good\n",
    });

    const descriptors = scanSkillsSync({ rootDir: "/skills", ...fs, separator: "/" });
    expect(descriptors.map((d) => d.skillId)).toEqual(["good"]);
  });

  it("skips inaccessible directories without throwing", () => {
    const fs = makeFs({
      "/skills/good/SKILL.md": "---\nname: good\ndescription: Good\n---\n# Good\n",
      "/skills/blocked/SKILL.md": "---\nname: blocked\ndescription: Blocked\n---\n# Blocked\n",
    }, ["/skills/blocked"]);

    expect(() => scanSkillsSync({ rootDir: "/skills", ...fs, separator: "/" })).not.toThrow();
    const descriptors = scanSkillsSync({ rootDir: "/skills", ...fs, separator: "/" });
    expect(descriptors.map((d) => d.skillId)).toEqual(["good"]);
  });

  // ===== Async scanning =====

  it("async scanner uses the same descriptor shape", async () => {
    const fs = makeFs({
      "/skills/async/SKILL.md": "---\nname: async-skill\ndescription: Async skill\n---\n# Async\n",
    });

    const descriptors = await scanSkills({ rootDir: "/skills", ...fs, separator: "/" });
    expect(descriptors).toHaveLength(1);
    expect(descriptors[0]).toMatchObject({
      skillId: "async-skill",
      name: "async-skill",
      description: "Async skill",
      filePath: "/skills/async/SKILL.md",
    });
  });
});
