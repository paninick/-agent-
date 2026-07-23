// ===== Release phase registry =====

export type ReleasePhaseStatus = "sealed" | "planned";

export interface ReleasePhaseRecord {
  phaseId: string;
  title: string;
  status: ReleasePhaseStatus;
  sealedAt?: string;
  commit?: string;
  tag?: string;
  notes: string[];
}

// ===== Validation baseline =====

export type ValidationStatus = "pass" | "warn" | "fail" | "not_run";

export interface ValidationCheckResult {
  name: string;
  status: ValidationStatus;
  summary: string;
}

export interface ValidationBaseline {
  checkedAt: string;
  checks: ValidationCheckResult[];
  intelligence?: {
    sourceCount: number;
    healthySourceCount: number;
    degradedSourceCount: number;
    failedSourceCount: number;
    containsSecrets: boolean;
    visualizationReadiness: string;
  };
}

// ===== Vendor dirty report =====

export type VendorDirtyStatus = "clean" | "documented_non_blocking" | "blocking";

export interface DirtyFileRecord {
  path: string;
  statusCode: string;
  reason: string;
}

export interface VendorDirtyReport {
  status: VendorDirtyStatus;
  dirtyFiles: DirtyFileRecord[];
  warnings: string[];
  blockingReasons: string[];
}

// ===== Skills health =====

export type SkillsHealthStatus = "healthy" | "degraded" | "missing";

export interface SkillsHealthReport {
  status: SkillsHealthStatus;
  rootDir: string;
  skillCount: number;
  lowAvailabilitySkillIds: string[];
  warnings: string[];
}

// ===== Handoff =====

export interface ReleaseHandoffPacket {
  currentPhase: string;
  sealedPhases: string[];
  currentNode: string;
  status: string;
  nextNode: string;
  nextModel: string;
  boundaryWarnings: string[];
}

// ===== Snapshot =====

export interface ReleaseGovernanceSnapshot {
  ok: boolean;
  generatedAt: string;
  releaseStatus: "ready" | "blocked";
  phases: ReleasePhaseRecord[];
  validationBaseline: ValidationBaseline;
  vendorDirtyReport: VendorDirtyReport;
  skillsHealthReport: SkillsHealthReport;
  handoffPacket: ReleaseHandoffPacket;
  warnings: string[];
  blockingReasons: string[];
}
