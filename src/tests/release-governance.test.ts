import { describe, expect, it } from "vitest";
import {
  createReleaseGovernanceSnapshot,
  createSkillsHealthReport,
  createValidationBaseline,
  createVendorDirtyReport,
  formatReleaseHandoffPacket,
  getSealedPhaseRegistry,
} from "../release";

const intelligenceArtifact = {
  checkedAt: "2026-07-05T11:04:48.820Z",
  sourceCount: 23,
  healthySourceCount: 4,
  degradedSourceCount: 18,
  failedSourceCount: 1,
  artifact: {
    containsSecrets: false,
  },
  visualizationReadiness: {
    status: "degraded",
  },
};

describe("P8 Release Governance", () => {
  it("returns the sealed phase registry for P0-P7 and GOV", () => {
    const phases = getSealedPhaseRegistry();

    expect(phases.map((phase) => phase.phaseId)).toEqual([
      "P0",
      "P1",
      "P2",
      "P3",
      "P4.0",
      "P4.1",
      "P4.2",
      "P5",
      "P6",
      "P7",
      "P8",
      "GOV",
    ]);
    expect(phases.every((phase) => phase.status === "sealed")).toBe(true);
  });

  it("parses the intelligence verification artifact into a validation baseline", () => {
    const baseline = createValidationBaseline(intelligenceArtifact);

    expect(baseline.intelligence).toMatchObject({
      sourceCount: 23,
      healthySourceCount: 4,
      degradedSourceCount: 18,
      failedSourceCount: 1,
      containsSecrets: false,
      visualizationReadiness: "degraded",
    });
    expect(baseline.checks.find((check) => check.name === "verify:intelligence")?.status).toBe("pass");
  });

  it("classifies documented skills/ECC lockfile drift as non-blocking", () => {
    const report = createVendorDirtyReport(
      [" m skills/ECC"],
      [" M package-lock.json", " M yarn.lock"],
    );

    expect(report.status).toBe("documented_non_blocking");
    expect(report.blockingReasons).toEqual([]);
    expect(report.dirtyFiles.map((file) => file.path).sort()).toEqual([
      "skills/ECC",
      "skills/ECC/package-lock.json",
      "skills/ECC/yarn.lock",
    ]);
  });

  it("blocks unexpected dirty files", () => {
    const report = createVendorDirtyReport([" M src/runtime/runStore.ts"]);

    expect(report.status).toBe("blocking");
    expect(report.blockingReasons[0]).toContain("src/runtime/runStore.ts");
  });

  it("allows current P8 release-governance worktree drift during validation", () => {
    const report = createVendorDirtyReport([
      " M README.md",
      "?? src/release/types.ts",
      "?? docs/RELEASE_GOVERNANCE_CONSOLE_RUNBOOK_CN.md",
      "?? docs/AGENT_OS_V2_P8_RELEASE_SEAL_CN.md",
    ]);

    expect(report.status).toBe("documented_non_blocking");
    expect(report.blockingReasons).toEqual([]);
  });

  it("reports missing skill root safely", () => {
    const report = createSkillsHealthReport({
      rootDir: "/missing",
      descriptors: [],
      rootExists: false,
    });

    expect(report.status).toBe("missing");
    expect(report.warnings[0]).toContain("/missing");
  });

  it("marks skills with external dependency hints as degraded", () => {
    const report = createSkillsHealthReport({
      rootDir: "/skills",
      rootExists: true,
      descriptors: [
        {
          skillId: "deploy",
          name: "deploy",
          description: "Deploy with external service credentials",
          filePath: "/skills/deploy/SKILL.md",
          lineCount: 5,
          charCount: 100,
        },
      ],
    });

    expect(report.status).toBe("degraded");
    expect(report.lowAvailabilitySkillIds).toEqual(["deploy"]);
  });

  it("creates a ready snapshot for the documented P8 workspace state", () => {
    const snapshot = createReleaseGovernanceSnapshot({
      generatedAt: "2026-07-05T12:00:00.000Z",
      intelligenceArtifact,
      parentGitStatusLines: [" m skills/ECC"],
      nestedVendorStatusLines: [" M package-lock.json", " M yarn.lock"],
      skillRoot: "/skills",
      skillRootExists: true,
      skillDescriptors: [],
    });

    expect(snapshot.ok).toBe(true);
    expect(snapshot.releaseStatus).toBe("ready");
    expect(snapshot.blockingReasons).toEqual([]);
    expect(snapshot.warnings.some((warning) => warning.includes("skills/ECC"))).toBe(true);
  });

  it("formats a handoff packet with next node information", () => {
    const snapshot = createReleaseGovernanceSnapshot({
      generatedAt: "2026-07-05T12:00:00.000Z",
      intelligenceArtifact,
      parentGitStatusLines: [],
      nestedVendorStatusLines: [],
      skillRoot: "/skills",
      skillRootExists: true,
      skillDescriptors: [],
    });

    const packet = formatReleaseHandoffPacket(snapshot);

    expect(packet).toContain("CURRENT_PHASE: P8_RELEASE_GOVERNANCE_CONSOLE");
    expect(packet).toContain("NEXT_NODE: N4_FILE_STRUCTURE_REVIEW");
  });
});
