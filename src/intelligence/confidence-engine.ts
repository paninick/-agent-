import type { AdapterHealth, ConfidenceBreakdown, ConfidenceResult, ConflictReport, EvidenceGraph, EvidenceNode } from "./evidence-types";

export interface ConfidenceWeights {
  sourceReliability: number;
  dataCompleteness: number;
  freshnessScore: number;
  crossSourceAgreement: number;
  conflictPenalty: number;
}

export interface ConfidenceOptions {
  weights?: Partial<ConfidenceWeights>;
  expectedDataPointCount?: number;
  now?: Date;
}

const defaultWeights: ConfidenceWeights = {
  sourceReliability: 0.3,
  dataCompleteness: 0.25,
  freshnessScore: 0.2,
  crossSourceAgreement: 0.15,
  conflictPenalty: 0.1
};

export function calculateConfidenceScore(args: {
  graph: EvidenceGraph;
  adapterHealth: AdapterHealth[];
  conflicts: ConflictReport[];
  options?: ConfidenceOptions;
}): ConfidenceResult {
  const weights = { ...defaultWeights, ...(args.options?.weights ?? {}) };
  const breakdown = calculateBreakdown(args.graph, args.adapterHealth, args.conflicts, args.options);
  const value = clamp(
    weights.sourceReliability * breakdown.sourceReliability +
      weights.dataCompleteness * breakdown.dataCompleteness +
      weights.freshnessScore * breakdown.freshnessScore +
      weights.crossSourceAgreement * breakdown.crossSourceAgreement -
      weights.conflictPenalty * breakdown.conflictPenalty,
    0,
    1
  );

  return {
    value: round(value),
    breakdown: roundBreakdown(breakdown),
    warnings: confidenceWarnings(args.graph, args.adapterHealth, args.conflicts, breakdown),
    perSourceConfidence: calculatePerSourceConfidence(args.graph, args.adapterHealth)
  };
}

function calculateBreakdown(
  graph: EvidenceGraph,
  adapterHealth: AdapterHealth[],
  conflicts: ConflictReport[],
  options?: ConfidenceOptions
): ConfidenceBreakdown {
  return {
    sourceReliability: sourceReliability(adapterHealth),
    dataCompleteness: dataCompleteness(graph, options?.expectedDataPointCount),
    freshnessScore: freshnessScore(graph, options?.now ?? new Date()),
    crossSourceAgreement: crossSourceAgreement(graph),
    conflictPenalty: conflictPenalty(conflicts)
  };
}

function sourceReliability(adapterHealth: AdapterHealth[]) {
  if (adapterHealth.length === 0) return 0;
  return average(
    adapterHealth.map((health) => {
      if (health.status === "healthy") return 1 - health.errorRate;
      if (health.resultStatus === "degraded") return 0.55 * (1 - health.errorRate);
      return 0;
    })
  );
}

function dataCompleteness(graph: EvidenceGraph, expectedDataPointCount?: number) {
  const expected = Math.max(1, expectedDataPointCount ?? 6);
  return clamp(graph.summary.dataPointNodeCount / expected, 0, 1);
}

function freshnessScore(graph: EvidenceGraph, now: Date) {
  const dataPoints = graph.nodes.filter((node) => node.type === "DataPointNode");
  if (dataPoints.length === 0) return 0;
  return average(dataPoints.map((node) => freshnessForNode(node, now)));
}

function freshnessForNode(node: EvidenceNode, now: Date) {
  const timestamp = Date.parse(node.timestamp);
  if (!Number.isFinite(timestamp)) return 0.35;
  const ageDays = Math.max(0, (now.getTime() - timestamp) / 86_400_000);
  if (ageDays <= 30) return 1;
  if (ageDays <= 180) return 0.85;
  if (ageDays <= 365) return 0.7;
  if (ageDays <= 730) return 0.5;
  return 0.3;
}

function crossSourceAgreement(graph: EvidenceGraph) {
  const dataPoints = graph.nodes.filter((node) => node.type === "DataPointNode");
  if (dataPoints.length === 0) return 0;

  const sourceSetsByIndicator = new Map<string, Set<string>>();
  for (const edge of graph.edges.filter((item) => item.type === "supports")) {
    const dataPoint = dataPoints.find((node) => node.id === edge.from);
    if (!dataPoint?.sourceId) continue;
    const sources = sourceSetsByIndicator.get(edge.to) ?? new Set<string>();
    sources.add(dataPoint.sourceId);
    sourceSetsByIndicator.set(edge.to, sources);
  }

  const groups = Array.from(sourceSetsByIndicator.values());
  if (groups.length === 0) return 0;
  return average(groups.map((sources) => (sources.size >= 3 ? 1 : sources.size === 2 ? 0.75 : 0.2)));
}

function conflictPenalty(conflicts: ConflictReport[]) {
  if (conflicts.length === 0) return 0;
  const severityAverage = average(conflicts.map((conflict) => severityValue(conflict.severity)));
  const volumePenalty = 1 - Math.exp(-conflicts.length / 5);
  return clamp(severityAverage * 0.75 + volumePenalty * 0.25, 0, 1);
}

function calculatePerSourceConfidence(graph: EvidenceGraph, adapterHealth: AdapterHealth[]) {
  const healthBySourceId = new Map(adapterHealth.map((health) => [health.sourceId, health]));
  const result: Record<string, number> = {};
  const sourceIds = new Set(graph.nodes.map((node) => node.sourceId).filter((value): value is string => Boolean(value)));
  for (const sourceId of sourceIds) {
    const health = healthBySourceId.get(sourceId);
    const dataPoints = graph.nodes.filter((node) => node.type === "DataPointNode" && node.sourceId === sourceId);
    const evidenceConfidence = dataPoints.length > 0 ? average(dataPoints.map((node) => node.confidence)) : 0;
    const healthConfidence = health?.status === "healthy" ? 1 : health?.resultStatus === "degraded" ? 0.55 : 0;
    result[sourceId] = round((evidenceConfidence + healthConfidence) / 2);
  }
  return result;
}

function confidenceWarnings(
  graph: EvidenceGraph,
  adapterHealth: AdapterHealth[],
  conflicts: ConflictReport[],
  breakdown: ConfidenceBreakdown
) {
  const warnings: string[] = [];
  if (graph.summary.dataPointNodeCount === 0) warnings.push("No usable data point nodes are present.");
  if (breakdown.dataCompleteness < 0.6) warnings.push("Data completeness is low.");
  if (breakdown.crossSourceAgreement < 0.6) warnings.push("Cross-source agreement is weak.");
  if (breakdown.freshnessScore < 0.6) warnings.push("Freshness score is weak.");
  if (conflicts.length > 0) warnings.push(`${conflicts.length} conflict(s) detected.`);
  if (adapterHealth.some((health) => health.status !== "healthy")) warnings.push("Some sources are degraded or unavailable.");
  return warnings;
}

function severityValue(severity: ConflictReport["severity"]) {
  if (severity === "high") return 1;
  if (severity === "medium") return 0.65;
  return 0.35;
}

function roundBreakdown(breakdown: ConfidenceBreakdown): ConfidenceBreakdown {
  return {
    sourceReliability: round(breakdown.sourceReliability),
    dataCompleteness: round(breakdown.dataCompleteness),
    freshnessScore: round(breakdown.freshnessScore),
    crossSourceAgreement: round(breakdown.crossSourceAgreement),
    conflictPenalty: round(breakdown.conflictPenalty)
  };
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}
