import type { AdapterHealth, EvidenceGraph, VisualizationReadiness } from "./evidence-types";

export interface CredentialStatus {
  sourceId: string;
  envVar: string;
  status: "present" | "missing";
  purpose: string;
}

export interface VisualizationReadinessOptions {
  minimumHealthySources?: number;
  readyThreshold?: number;
}

export function evaluateVisualizationReadiness(args: {
  evidenceGraph: EvidenceGraph;
  adapterHealth: AdapterHealth[];
  confidenceScore: number;
  missingFields?: string[];
  warnings?: string[];
  options?: VisualizationReadinessOptions;
}): VisualizationReadiness {
  const minimumHealthySources = args.options?.minimumHealthySources ?? 5;
  const readyThreshold = args.options?.readyThreshold ?? 0.72;
  const healthySourceCount = args.adapterHealth.filter((health) => health.status === "healthy").length;
  const degradedSourceCount = args.adapterHealth.filter((health) => health.status === "degraded").length;
  const usableEvidence =
    args.evidenceGraph.summary.dataPointNodeCount > 0 && args.adapterHealth.some((health) => health.status === "healthy" || health.status === "degraded");

  const missingFields = [...(args.missingFields ?? [])];
  const warnings = [...(args.warnings ?? [])];

  if (!usableEvidence) missingFields.push("usableEvidence");
  if (healthySourceCount < minimumHealthySources) missingFields.push("minimumHealthySources");
  if (args.confidenceScore < readyThreshold) missingFields.push("readyThreshold");

  if (usableEvidence && healthySourceCount >= minimumHealthySources && args.confidenceScore >= readyThreshold) {
    return {
      status: "ready",
      missingFields: unique(missingFields.filter((field) => field !== "minimumHealthySources" && field !== "readyThreshold")),
      warnings,
      usableEvidence
    };
  }

  if (usableEvidence && args.confidenceScore > 0 && (healthySourceCount > 0 || degradedSourceCount > 0)) {
    return {
      status: "degraded",
      missingFields: unique(missingFields),
      warnings: unique([...warnings, "Visualization is allowed only in degraded mode."]),
      usableEvidence
    };
  }

  return {
    status: "blocked",
    missingFields: unique(missingFields),
    warnings: unique([...warnings, "No usable evidence is available for visualization."]),
    usableEvidence
  };
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}
