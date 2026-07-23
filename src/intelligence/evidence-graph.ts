import type { AdapterHealth, EvidenceEdge, EvidenceGraph, EvidenceNode, EvidenceSummary } from "./evidence-types";
import type { AuthenticityResult } from "./validation/types";
import type { EvidenceEntry, EvidenceScore, SourceRegistry } from "./types";

export function buildEvidenceGraph(args: {
  registry: SourceRegistry;
  evidence: EvidenceEntry[];
  scores: EvidenceScore[];
  adapterHealth: AdapterHealth[];
  generatedAt?: string;
  /**
   * 可选：evidenceId → AuthenticityResult 映射。
   * 传入后，对应 DataPointNode 会带上 authenticity 字段（6 门验证结果）。
   * 未传入时 DataPointNode 不带 authenticity，保持向后兼容。
   */
  authenticityByEvidenceId?: Map<string, AuthenticityResult>;
}): EvidenceGraph {
  const timestamp = args.generatedAt ?? new Date().toISOString();
  const scoreById = new Map(args.scores.map((score) => [score.evidenceId, score]));
  const healthBySourceId = new Map(args.adapterHealth.map((health) => [health.sourceId, health]));
  const authenticityByEvidenceId = args.authenticityByEvidenceId ?? new Map<string, AuthenticityResult>();

  const sourceNodes = args.registry.sources.map<EvidenceNode>((source) => {
    const health = healthBySourceId.get(source.id);
    return {
      id: sourceNodeId(source.id),
      type: "SourceNode",
      sourceId: source.id,
      value: source.name,
      confidence: source.reliability_score,
      timestamp,
      provenance: {
        sourceId: source.id,
        sourceTier: source.tier,
        url: source.officialUrl
      },
      metadata: {
        tier: source.tier,
        sourceWeight: source.sourceWeight,
        trustWeight: source.trust_weight,
        latencyScore: source.latency_score,
        reliabilityScore: source.reliability_score,
        coverageDomain: source.coverage_domain,
        healthStatus: health?.status ?? "failed"
      }
    };
  });

  const dataPointNodes = args.evidence.map<EvidenceNode>((entry) => {
    const score = scoreById.get(entry.id);
    const authenticity = authenticityByEvidenceId.get(entry.id);
    return {
      id: dataPointNodeId(entry.id),
      type: "DataPointNode",
      sourceId: entry.sourceId,
      value: entry.value ?? entry.claim,
      confidence: score?.confidence ?? 0,
      timestamp: entry.observedAt,
      provenance: {
        sourceId: entry.sourceId,
        sourceTier: entry.sourceTier,
        method: entry.method,
        url: entry.url,
        rawRef: entry.rawRef
      },
      metadata: {
        evidenceId: entry.id,
        evidenceKind: entry.kind,
        subject: entry.subject,
        period: entry.period ?? null,
        unit: entry.unit ?? null
      },
      ...(authenticity ? { authenticity } : {})
    };
  });

  const entityNodes = uniqueById(
    args.evidence.map<EvidenceNode>((entry) => ({
      id: entityNodeId(entry),
      type: "EntityNode",
      sourceId: entry.sourceId,
      value: entry.geography ?? entry.subject,
      confidence: scoreById.get(entry.id)?.confidence ?? 0,
      timestamp: entry.observedAt,
      provenance: {
        sourceId: entry.sourceId,
        sourceTier: entry.sourceTier,
        method: entry.method,
        url: entry.url,
        rawRef: entry.rawRef
      },
      metadata: {
        entityType: inferEntityType(entry),
        subject: entry.subject,
        geography: entry.geography ?? null
      }
    }))
  );

  const indicatorNodes = uniqueById(
    args.evidence.map<EvidenceNode>((entry) => ({
      id: indicatorNodeId(entry),
      type: "IndicatorNode",
      sourceId: entry.sourceId,
      value: entry.kind,
      confidence: scoreById.get(entry.id)?.confidence ?? 0,
      timestamp: entry.observedAt,
      provenance: {
        sourceId: entry.sourceId,
        sourceTier: entry.sourceTier,
        method: entry.method,
        url: entry.url,
        rawRef: entry.rawRef
      },
      metadata: {
        evidenceKind: entry.kind,
        unit: entry.unit ?? null
      }
    }))
  );

  const edges = args.evidence.flatMap<EvidenceEdge>((entry) => {
    const confidence = scoreById.get(entry.id)?.confidence ?? 0;
    const dataPointId = dataPointNodeId(entry.id);
    const baseEdges: EvidenceEdge[] = [
      {
        id: edgeId("derived", entry.id),
        from: dataPointId,
        to: sourceNodeId(entry.sourceId),
        type: "derived_from",
        weight: 1,
        confidence
      },
      {
        id: edgeId("describes", entry.id),
        from: dataPointId,
        to: entityNodeId(entry),
        type: "describes",
        weight: 0.9,
        confidence
      },
      {
        id: edgeId("supports", entry.id),
        from: dataPointId,
        to: indicatorNodeId(entry),
        type: "supports",
        weight: 0.85,
        confidence
      }
    ];
    const contradictionEdges = entry.contradictions.map<EvidenceEdge>((_reason, index) => ({
      id: edgeId("contradicts", entry.id, String(index)),
      from: dataPointId,
      to: indicatorNodeId(entry),
      type: "contradicts",
      weight: 0.75,
      confidence
    }));
    return [...baseEdges, ...contradictionEdges];
  });

  const nodes = [...sourceNodes, ...dataPointNodes, ...entityNodes, ...indicatorNodes];
  return {
    nodes,
    edges,
    summary: summarizeEvidenceGraph(nodes, edges)
  };
}

export function summarizeEvidenceGraph(nodes: EvidenceNode[], edges: EvidenceEdge[]): EvidenceSummary {
  return {
    sourceNodeCount: nodes.filter((node) => node.type === "SourceNode").length,
    dataPointNodeCount: nodes.filter((node) => node.type === "DataPointNode").length,
    entityNodeCount: nodes.filter((node) => node.type === "EntityNode").length,
    indicatorNodeCount: nodes.filter((node) => node.type === "IndicatorNode").length,
    edgeCount: edges.length
  };
}

function sourceNodeId(sourceId: string) {
  return `source:${slug(sourceId)}`;
}

function dataPointNodeId(evidenceId: string) {
  return `data-point:${slug(evidenceId)}`;
}

function entityNodeId(entry: EvidenceEntry) {
  return `entity:${slug(entry.geography ?? entry.subject)}`;
}

function indicatorNodeId(entry: EvidenceEntry) {
  return `indicator:${slug(entry.kind)}:${slug(entry.subject)}`;
}

function edgeId(prefix: string, ...parts: string[]) {
  return `${prefix}:${parts.map(slug).join(":")}`;
}

function inferEntityType(entry: EvidenceEntry) {
  if (/inc|corp|ltd|company|公司/i.test(entry.subject)) return "company";
  if (entry.geography) return "country";
  if (/apparel|garment|fashion|textile|cusr/i.test(entry.subject)) return "industry";
  return "indicator_subject";
}

function uniqueById<T extends { id: string }>(items: T[]) {
  return Array.from(new Map(items.map((item) => [item.id, item])).values());
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 96) || "unknown";
}
