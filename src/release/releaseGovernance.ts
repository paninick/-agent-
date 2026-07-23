import type { SkillDescriptor } from "../skills";
import { createReleaseHandoffPacket } from "./handoffPacket";
import { getSealedPhaseRegistry, sealedPhaseIds } from "./phaseRegistry";
import { createSkillsHealthReport } from "./skillsHealth";
import { createValidationBaseline } from "./validationBaseline";
import { createVendorDirtyReport } from "./vendorStatus";
import type { ReleaseGovernanceSnapshot } from "./types";

export interface ReleaseGovernanceInput {
  generatedAt?: string;
  intelligenceArtifact: unknown;
  parentGitStatusLines: string[];
  nestedVendorStatusLines?: string[];
  skillRoot: string;
  skillRootExists: boolean;
  skillDescriptors: SkillDescriptor[];
}

export function createReleaseGovernanceSnapshot(input: ReleaseGovernanceInput): ReleaseGovernanceSnapshot {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const phases = getSealedPhaseRegistry();
  const validationBaseline = createValidationBaseline(input.intelligenceArtifact, generatedAt);
  const vendorDirtyReport = createVendorDirtyReport(input.parentGitStatusLines, input.nestedVendorStatusLines ?? []);
  const skillsHealthReport = createSkillsHealthReport({
    rootDir: input.skillRoot,
    descriptors: input.skillDescriptors,
    rootExists: input.skillRootExists,
  });

  const warnings = [
    ...vendorDirtyReport.warnings,
    ...skillsHealthReport.warnings,
    "node-runner config drift should be reviewed before using generated prompts as P8 truth.",
  ];
  const blockingReasons = [
    ...vendorDirtyReport.blockingReasons,
    ...validationBaseline.checks
      .filter((check) => check.status === "fail")
      .map((check) => `${check.name}: ${check.summary}`),
  ];

  const handoffPacket = createReleaseHandoffPacket(sealedPhaseIds(phases), warnings);

  return {
    ok: blockingReasons.length === 0,
    generatedAt,
    releaseStatus: blockingReasons.length === 0 ? "ready" : "blocked",
    phases,
    validationBaseline,
    vendorDirtyReport,
    skillsHealthReport,
    handoffPacket,
    warnings,
    blockingReasons,
  };
}
