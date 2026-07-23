import type { AgentRiskScore, AgentRiskVector, DataSensitivity, ToolEffect, ToolInvocationRequest, ToolRiskLevel } from "./types";

export function buildAgentRiskVector(request: ToolInvocationRequest): AgentRiskScore {
  const vector: AgentRiskVector = {
    dataSensitivity: sensitivityScore(request.dataSensitivity),
    toolEffect: effectScore(request.effect),
    credentialExposure: credentialExposureScore(request),
    networkExposure: request.networkAccess ? 0.5 : 0,
    externalWrite: request.externalWrite ? 0.75 : 0,
    destructiveAction: request.destructive ? 1 : 0,
    costExposure: costScore(request.estimatedCostTier ?? "low")
  };
  const score = roundScore(
    vector.dataSensitivity * 0.22 +
      vector.toolEffect * 0.18 +
      vector.credentialExposure * 0.16 +
      vector.networkExposure * 0.12 +
      vector.externalWrite * 0.14 +
      vector.destructiveAction * 0.12 +
      vector.costExposure * 0.06
  );
  return {
    vector,
    score,
    level: riskLevel(score),
    reasons: riskReasons(request, vector)
  };
}

function sensitivityScore(sensitivity: DataSensitivity) {
  return { public: 0, internal: 0.25, sensitive: 0.75, restricted: 1 }[sensitivity];
}

function effectScore(effect: ToolEffect) {
  return { read: 0.1, write: 0.45, external_send: 0.7, execute: 0.85, delete: 1 }[effect];
}

function credentialExposureScore(request: ToolInvocationRequest) {
  if (request.credentialStatus === "not_required") return 0;
  if (request.credentialStatus === "available") return 0.45;
  return 0.65;
}

function costScore(costTier: "low" | "medium" | "high") {
  return { low: 0.1, medium: 0.45, high: 0.8 }[costTier];
}

function riskLevel(score: number): ToolRiskLevel {
  if (score >= 0.75) return "critical";
  if (score >= 0.5) return "high";
  if (score >= 0.25) return "medium";
  return "low";
}

function riskReasons(request: ToolInvocationRequest, vector: AgentRiskVector) {
  const reasons: string[] = [];
  if (vector.dataSensitivity >= 0.75) reasons.push(`Data sensitivity is ${request.dataSensitivity}.`);
  if (request.externalWrite) reasons.push("Tool can write or send data outside the runtime.");
  if (request.destructive) reasons.push("Tool action is destructive.");
  if (request.networkAccess) reasons.push("Tool requires network access.");
  if ((request.estimatedCostTier ?? "low") === "high") reasons.push("Tool has high estimated cost.");
  if (reasons.length === 0) reasons.push("Tool request is low-risk read-only/static activity.");
  return reasons;
}

function roundScore(score: number) {
  return Number(score.toFixed(3));
}
