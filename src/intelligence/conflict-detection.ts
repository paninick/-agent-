import type { ConflictReport, ConflictSeverity, EvidenceGraph, EvidenceNode } from "./evidence-types";

export interface ConflictDetectionOptions {
  valueMismatchThresholdPct?: number;
}

interface DataPointView {
  node: EvidenceNode;
  entityId: string;
  indicatorId: string;
  unit?: string;
  period?: string;
  numericValue?: number;
}

export function detectConflicts(graph: EvidenceGraph, options: ConflictDetectionOptions = {}): ConflictReport[] {
  const threshold = options.valueMismatchThresholdPct ?? 0.2;
  const dataPoints = extractDataPointViews(graph);
  const conflicts: ConflictReport[] = [];

  const byEntityIndicatorPeriod = groupBy(dataPoints, (point) => `${point.entityId}|${point.indicatorId}|${point.period ?? "unknown"}`);
  for (const points of byEntityIndicatorPeriod.values()) {
    conflicts.push(...detectValueMismatch(points, threshold));
    conflicts.push(...detectUnitMismatch(points));
  }

  const byEntityIndicator = groupBy(dataPoints, (point) => `${point.entityId}|${point.indicatorId}`);
  for (const points of byEntityIndicator.values()) {
    const periods = new Set(points.map((point) => point.period).filter(Boolean));
    if (periods.size > 1) {
      conflicts.push({
        id: conflictId("time_window_mismatch", points.map((point) => point.node.id)),
        type: "time_window_mismatch",
        severity: periods.size > 2 ? "medium" : "low",
        involvedNodeIds: points.map((point) => point.node.id),
        suggestedResolution: "prefer_latest"
      });
    }
  }

  return uniqueConflicts(conflicts);
}

function detectValueMismatch(points: DataPointView[], threshold: number): ConflictReport[] {
  const numeric = points.filter((point) => typeof point.numericValue === "number");
  if (numeric.length < 2) return [];

  const values = numeric.map((point) => point.numericValue as number);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const denominator = Math.max(Math.abs(min), 1);
  const deltaPct = Math.abs(max - min) / denominator;
  if (deltaPct <= threshold) return [];

  return [
    {
      id: conflictId("value_mismatch", numeric.map((point) => point.node.id)),
      type: "value_mismatch",
      severity: severityFromDelta(deltaPct),
      involvedNodeIds: numeric.map((point) => point.node.id),
      suggestedResolution: "weighted_average"
    }
  ];
}

function detectUnitMismatch(points: DataPointView[]): ConflictReport[] {
  const units = new Set(points.map((point) => point.unit).filter(Boolean));
  if (units.size <= 1) return [];
  return [
    {
      id: conflictId("unit_mismatch", points.map((point) => point.node.id)),
      type: "unit_mismatch",
      severity: "medium",
      involvedNodeIds: points.map((point) => point.node.id),
      suggestedResolution: "manual_review"
    }
  ];
}

function extractDataPointViews(graph: EvidenceGraph): DataPointView[] {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  return graph.nodes
    .filter((node) => node.type === "DataPointNode")
    .map((node) => {
      const entityEdge = graph.edges.find((edge) => edge.from === node.id && edge.type === "describes");
      const indicatorEdge = graph.edges.find((edge) => edge.from === node.id && edge.type === "supports");
      const unitValue = node.metadata.unit;
      const periodValue = node.metadata.period;
      return {
        node,
        entityId: entityEdge?.to ?? "entity:unknown",
        indicatorId: indicatorEdge?.to ?? "indicator:unknown",
        unit: typeof unitValue === "string" ? unitValue : undefined,
        period: typeof periodValue === "string" ? periodValue : undefined,
        numericValue: typeof node.value === "number" ? node.value : undefined
      };
    })
    .filter((point) => Boolean(nodesById.get(point.node.id)));
}

function severityFromDelta(deltaPct: number): ConflictSeverity {
  if (deltaPct >= 0.75) return "high";
  if (deltaPct >= 0.35) return "medium";
  return "low";
}

function groupBy<T>(values: T[], keyOf: (value: T) => string) {
  const groups = new Map<string, T[]>();
  for (const value of values) {
    const key = keyOf(value);
    groups.set(key, [...(groups.get(key) ?? []), value]);
  }
  return groups;
}

function conflictId(type: string, nodeIds: string[]) {
  return `${type}:${nodeIds.sort().join("|")}`.toLowerCase().replace(/[^a-z0-9|:-]+/g, "-").slice(0, 160);
}

function uniqueConflicts(conflicts: ConflictReport[]) {
  return Array.from(new Map(conflicts.map((conflict) => [conflict.id, conflict])).values());
}
