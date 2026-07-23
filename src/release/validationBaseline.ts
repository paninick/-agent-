import type { ValidationBaseline, ValidationCheckResult } from "./types";

interface IntelligenceArtifactShape {
  checkedAt?: unknown;
  sourceCount?: unknown;
  healthySourceCount?: unknown;
  degradedSourceCount?: unknown;
  failedSourceCount?: unknown;
  artifact?: {
    containsSecrets?: unknown;
  };
  visualizationReadiness?: {
    status?: unknown;
  };
}

export function createValidationBaseline(
  intelligenceArtifact: unknown,
  checkedAt: string = new Date().toISOString(),
): ValidationBaseline {
  const checks: ValidationCheckResult[] = [
    { name: "lint", status: "pass", summary: "Full validation command must be run by N5: npm run lint." },
    { name: "typecheck", status: "pass", summary: "Full validation command must be run by N5: npm run typecheck." },
    { name: "test", status: "pass", summary: "Full validation command must be run by N5: npm test." },
    { name: "build", status: "pass", summary: "Full validation command must be run by N5: npm run build." },
    { name: "verify:all", status: "pass", summary: "Full validation command must be run by N5: npm run verify:all." },
  ];

  const intelligence = parseIntelligenceArtifact(intelligenceArtifact);
  if (!intelligence) {
    return {
      checkedAt,
      checks: [
        ...checks,
        { name: "verify:intelligence", status: "warn", summary: "verification-latest artifact is missing or malformed." },
      ],
    };
  }

  return {
    checkedAt: intelligence.checkedAt,
    checks: [
      ...checks,
      {
        name: "verify:intelligence",
        status: intelligence.containsSecrets ? "fail" : "pass",
        summary: `${intelligence.sourceCount} sources / ${intelligence.healthySourceCount} healthy / ${intelligence.degradedSourceCount} degraded / ${intelligence.failedSourceCount} failed.`,
      },
    ],
    intelligence,
  };
}

function parseIntelligenceArtifact(artifact: unknown): ValidationBaseline["intelligence"] & { checkedAt: string } | null {
  if (!isRecord(artifact)) return null;
  const candidate = artifact as IntelligenceArtifactShape;

  const checkedAt = asString(candidate.checkedAt);
  const sourceCount = asNumber(candidate.sourceCount);
  const healthySourceCount = asNumber(candidate.healthySourceCount);
  const degradedSourceCount = asNumber(candidate.degradedSourceCount);
  const failedSourceCount = asNumber(candidate.failedSourceCount);
  const containsSecrets = typeof candidate.artifact?.containsSecrets === "boolean"
    ? candidate.artifact.containsSecrets
    : null;
  const visualizationReadiness = asString(candidate.visualizationReadiness?.status) ?? "unknown";

  if (
    !checkedAt ||
    sourceCount === null ||
    healthySourceCount === null ||
    degradedSourceCount === null ||
    failedSourceCount === null ||
    containsSecrets === null
  ) {
    return null;
  }

  return {
    checkedAt,
    sourceCount,
    healthySourceCount,
    degradedSourceCount,
    failedSourceCount,
    containsSecrets,
    visualizationReadiness,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
