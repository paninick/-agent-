import type { ReleaseGovernanceSnapshot, ReleaseHandoffPacket } from "./types";

export function createReleaseHandoffPacket(
  sealedPhases: string[],
  boundaryWarnings: string[],
): ReleaseHandoffPacket {
  return {
    currentPhase: "P8_RELEASE_GOVERNANCE_CONSOLE",
    sealedPhases,
    currentNode: "N3_IMPLEMENTATION",
    status: "DONE",
    nextNode: "N4_FILE_STRUCTURE_REVIEW",
    nextModel: "doubao-seed-2.0-code / Codex",
    boundaryWarnings,
  };
}

export function formatReleaseHandoffPacket(snapshot: ReleaseGovernanceSnapshot): string {
  return [
    "HANDOFF_PACKET:",
    `CURRENT_PHASE: ${snapshot.handoffPacket.currentPhase}`,
    `SEALED_PHASES: ${snapshot.handoffPacket.sealedPhases.join(",")}`,
    `CURRENT_NODE: ${snapshot.handoffPacket.currentNode}`,
    `STATUS: ${snapshot.handoffPacket.status}`,
    `RELEASE_STATUS: ${snapshot.releaseStatus}`,
    `NEXT_NODE: ${snapshot.handoffPacket.nextNode}`,
    `NEXT_MODEL: ${snapshot.handoffPacket.nextModel}`,
    `BOUNDARY_WARNINGS: ${snapshot.handoffPacket.boundaryWarnings.join(" | ") || "None"}`,
  ].join("\n");
}
