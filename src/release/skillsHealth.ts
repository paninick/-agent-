import type { SkillDescriptor } from "../skills";
import type { SkillsHealthReport } from "./types";

export interface SkillsHealthOptions {
  rootDir: string;
  descriptors: SkillDescriptor[];
  rootExists: boolean;
}

const LOW_AVAILABILITY_HINTS = [
  "api key",
  "credential",
  "oauth",
  "external service",
  "real api",
  "mcp server",
  "browser",
  "deploy",
];

export function createSkillsHealthReport(options: SkillsHealthOptions): SkillsHealthReport {
  if (!options.rootExists) {
    return {
      status: "missing",
      rootDir: options.rootDir,
      skillCount: 0,
      lowAvailabilitySkillIds: [],
      warnings: [`Skill root does not exist: ${options.rootDir}`],
    };
  }

  const lowAvailabilitySkillIds = options.descriptors
    .filter((descriptor) => isLowAvailability(descriptor))
    .map((descriptor) => descriptor.skillId)
    .sort();

  const warnings = lowAvailabilitySkillIds.length > 0
    ? [`${lowAvailabilitySkillIds.length} skills appear to require external tools, credentials, deployment, or browser access.`]
    : [];

  return {
    status: lowAvailabilitySkillIds.length > 0 ? "degraded" : "healthy",
    rootDir: options.rootDir,
    skillCount: options.descriptors.length,
    lowAvailabilitySkillIds,
    warnings,
  };
}

function isLowAvailability(descriptor: SkillDescriptor): boolean {
  const haystack = `${descriptor.name} ${descriptor.description}`.toLowerCase();
  return LOW_AVAILABILITY_HINTS.some((hint) => haystack.includes(hint));
}
