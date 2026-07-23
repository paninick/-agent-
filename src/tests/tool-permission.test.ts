import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  buildAgentRiskVector,
  evaluateCredentialPolicy,
  postToolUseHook,
  preToolUseHook,
  type ToolInvocationRequest
} from "../governance";

const baseRequest: ToolInvocationRequest = {
  agentId: "agent_research",
  toolId: "local_reader",
  action: "read_context",
  effect: "read",
  credentialStatus: "not_required",
  dataSensitivity: "internal",
  networkAccess: false,
  externalWrite: false,
  destructive: false,
  estimatedCostTier: "low",
  toolEnabled: true
};

describe("Tool Permission Hooks + Credential Gating v1", () => {
  it("allows a low-risk read-only tool without credentials", () => {
    const decision = preToolUseHook(baseRequest);

    expect(decision.status).toBe("allow");
    expect(decision.allowed).toBe(true);
    expect(decision.credentialStatus).toBe("not_required");
    expect(decision.auditEventRequired).toBe(true);
  });

  it("denies missing credentials without executing the tool", () => {
    const decision = preToolUseHook({
      ...baseRequest,
      toolId: "private_api",
      credentialStatus: "missing_credentials"
    });

    expect(decision.status).toBe("deny");
    expect(decision.allowed).toBe(false);
    expect(decision.credentialStatus).toBe("missing_credentials");
    expect(decision.warnings.join(" ")).toContain("Credential gate denied");
    expect(decision.auditEvent.metadata.executedByHook).toBe(false);
  });

  it("denies invalid credentials, permission denial, and rate limits", () => {
    for (const credentialStatus of ["invalid_credentials", "permission_denied", "rate_limited"] as const) {
      const decision = preToolUseHook({ ...baseRequest, credentialStatus });
      expect(decision.status).toBe("deny");
      expect(decision.credentialStatus).toBe(credentialStatus);
    }
  });

  it("denies available credentials when required scopes are missing", () => {
    const decision = preToolUseHook({
      ...baseRequest,
      credentialStatus: "available",
      requestedScopes: ["orders:read", "orders:write"],
      grantedScopes: ["orders:read"]
    });

    expect(decision.status).toBe("deny");
    expect(decision.credentialStatus).toBe("permission_denied");
    expect(decision.reasons[0]).toContain("missing required scopes");
  });

  it("allows available credentials with sufficient scopes", () => {
    const credential = evaluateCredentialPolicy({
      ...baseRequest,
      credentialStatus: "available",
      requestedScopes: ["orders:read"],
      grantedScopes: ["orders:read", "orders:write"]
    });

    expect(credential.ok).toBe(true);
    expect(credential.status).toBe("available");
  });

  it("requires approval for sensitive external writes", () => {
    const decision = preToolUseHook({
      ...baseRequest,
      toolId: "crm_sender",
      action: "send_customer_message",
      effect: "external_send",
      credentialStatus: "available",
      requestedScopes: ["crm:send"],
      grantedScopes: ["crm:send"],
      dataSensitivity: "sensitive",
      networkAccess: true,
      externalWrite: true
    });

    expect(decision.status).toBe("requires_approval");
    expect(decision.allowed).toBe(false);
    expect(decision.auditEventRequired).toBe(true);
    expect(["high", "critical"]).toContain(decision.riskLevel);
  });

  it("requires approval for critical restricted execution", () => {
    const decision = preToolUseHook({
      ...baseRequest,
      toolId: "restricted_executor",
      action: "execute_restricted_operation",
      effect: "execute",
      credentialStatus: "available",
      dataSensitivity: "restricted",
      networkAccess: true,
      externalWrite: true,
      destructive: true,
      estimatedCostTier: "high"
    });

    expect(decision.status).toBe("requires_approval");
    expect(decision.allowed).toBe(false);
    expect(decision.auditEventRequired).toBe(true);
  });

  it("marks destructive restricted operations as critical risk", () => {
    const risk = buildAgentRiskVector({
      ...baseRequest,
      effect: "delete",
      credentialStatus: "available",
      dataSensitivity: "restricted",
      networkAccess: true,
      externalWrite: true,
      destructive: true,
      estimatedCostTier: "high"
    });

    expect(risk.level).toBe("critical");
    expect(risk.score).toBeGreaterThanOrEqual(0.75);
  });

  it("denies disabled tools before approval logic", () => {
    const decision = preToolUseHook({
      ...baseRequest,
      toolEnabled: false,
      effect: "delete",
      credentialStatus: "available",
      dataSensitivity: "restricted",
      networkAccess: true,
      externalWrite: true,
      destructive: true
    });

    expect(decision.status).toBe("deny");
    expect(decision.reasons[0]).toBe("Tool is disabled.");
  });

  it("emits a permission audit event for every decision", () => {
    const decision = preToolUseHook(baseRequest);

    expect(decision.auditEvent.eventType).toBe("tool_permission_decision");
    expect(decision.auditEvent.agentId).toBe(baseRequest.agentId);
    expect(decision.auditEvent.toolId).toBe(baseRequest.toolId);
    expect(decision.auditEvent.decisionStatus).toBe("allow");
  });

  it("post hook records observation but does not execute tools", () => {
    const decision = preToolUseHook(baseRequest);
    const event = postToolUseHook({
      request: baseRequest,
      decision,
      observedStatus: "not_executed"
    });

    expect(event.eventType).toBe("tool_execution_observed");
    expect(event.metadata.executedByHook).toBe(false);
    expect(event.metadata.p3StaticOnly).toBe(true);
    expect(event).not.toHaveProperty("runId");
  });

  it("keeps governance static and free of real API call hooks", () => {
    expect("executeTool" in preToolUseHook).toBe(false);
    expect("fetch" in preToolUseHook).toBe(false);
  });

  it("keeps ToolPermissionStatus at allow, deny, and requires_approval without log_only", () => {
    const statuses = [
      preToolUseHook(baseRequest).status,
      preToolUseHook({ ...baseRequest, credentialStatus: "missing_credentials" }).status,
      preToolUseHook({
        ...baseRequest,
        effect: "execute",
        credentialStatus: "available",
        dataSensitivity: "restricted",
        networkAccess: true,
        destructive: true
      }).status
    ];

    expect(new Set(statuses)).toEqual(new Set(["allow", "deny", "requires_approval"]));
    expect(statuses).not.toContain("log_only");
  });

  it("does not import runtime dependencies in P3 tests", () => {
    const testSource = readFileSync(fileURLToPath(import.meta.url), "utf8");
    const forbiddenRuntimePath = "../" + "runtime";
    const forbiddenRuntimeNames = ["Run" + "Store", "DAG" + "Executor", "Swarm" + "Orchestrator"];

    expect(testSource).not.toContain(forbiddenRuntimePath);
    for (const forbiddenName of forbiddenRuntimeNames) {
      expect(testSource).not.toContain(forbiddenName);
    }
  });

  it("keeps P3 requires_approval decisions away from the P1 runtime state machine", () => {
    const decision = preToolUseHook({
      ...baseRequest,
      toolId: "restricted_executor",
      action: "execute_restricted_operation",
      effect: "execute",
      credentialStatus: "available",
      dataSensitivity: "restricted",
      networkAccess: true,
      externalWrite: true,
      destructive: true,
      estimatedCostTier: "high"
    });
    const hookSource = readFileSync(fileURLToPath(new URL("../governance/toolPermissionHook.ts", import.meta.url)), "utf8");
    const forbiddenRuntimeTerms = [
      "run" + "Store",
      "update" + "Run",
      "append" + "Audit" + "Event",
      "Resume" + "Point",
      "Run" + "Status",
      "waiting" + "_" + "approval"
    ];

    expect(decision.status).toBe("requires_approval");
    expect(hookSource).not.toContain("../" + "runtime");
    expect(hookSource).not.toContain("src/" + "runtime");
    for (const forbiddenRuntimeTerm of forbiddenRuntimeTerms) {
      expect(hookSource).not.toContain(forbiddenRuntimeTerm);
    }
  });
});
