import type { ReleasePhaseRecord } from "./types";

const SEALED_AT = "2026-07-05";
const P7_COMMIT = "7bee5250";
const P7_TAG = "agent-os-v2-p7-sealed";

export function getSealedPhaseRegistry(): ReleasePhaseRecord[] {
  return [
    phase("P0", "Intelligence Verification / Source Classification"),
    phase("P1", "RunStore + Approval Resume"),
    phase("P2", "Model Selection / Model Router"),
    phase("P3", "Tool Permission Governance"),
    phase("P4.0", "MCP Gateway Static Registry + Tool Descriptor"),
    phase("P4.1", "MCP Transport Interface + Fake Transport Harness"),
    phase("P4.2", "Tool Execution Adapter + Audit Bridge"),
    phase("P5", "Skill Progressive Loading + Context Budget"),
    phase("P6", "ModelGateway streaming + Skill Injection"),
    phase("P7", "ModelRouter + Skill Scanner Integration", {
      commit: P7_COMMIT,
      tag: P7_TAG,
      notes: ["Release sealed by docs/AGENT_OS_V2_P7_RELEASE_SEAL_CN.md."],
    }),
    phase("P8", "Release Governance Console", {
      tag: "agent-os-v2-p8-sealed",
      notes: ["Release governance console sealed by docs/AGENT_OS_V2_P8_RELEASE_SEAL_CN.md."],
    }),
    phase("GOV", "Governance documentation and vendor boundary rules"),
  ];
}

function phase(
  phaseId: string,
  title: string,
  overrides: Partial<ReleasePhaseRecord> = {},
): ReleasePhaseRecord {
  return {
    phaseId,
    title,
    status: "sealed",
    sealedAt: SEALED_AT,
    notes: [],
    ...overrides,
  };
}

export function sealedPhaseIds(phases: ReleasePhaseRecord[]): string[] {
  return phases.filter((phaseRecord) => phaseRecord.status === "sealed").map((phaseRecord) => phaseRecord.phaseId);
}
