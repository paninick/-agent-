import type { CredentialDecision, ToolInvocationRequest } from "./types";

export function evaluateCredentialPolicy(request: ToolInvocationRequest): CredentialDecision {
  const requestedScopes = request.requestedScopes ?? [];
  const grantedScopes = request.grantedScopes ?? [];

  if (request.credentialStatus === "not_required") {
    return { ok: true, status: "not_required", reason: "Tool does not require credentials.", missingScopes: [] };
  }

  if (request.credentialStatus !== "available") {
    return {
      ok: false,
      status: request.credentialStatus,
      reason: credentialFailureReason(request.credentialStatus),
      missingScopes: []
    };
  }

  const missingScopes = requestedScopes.filter((scope) => !grantedScopes.includes(scope));
  if (missingScopes.length > 0) {
    return {
      ok: false,
      status: "permission_denied",
      reason: `Credential is available but missing required scopes: ${missingScopes.join(", ")}.`,
      missingScopes
    };
  }

  return { ok: true, status: "available", reason: "Credential is available and scopes are sufficient.", missingScopes: [] };
}

function credentialFailureReason(status: ToolInvocationRequest["credentialStatus"]) {
  const reasons: Record<ToolInvocationRequest["credentialStatus"], string> = {
    not_required: "Tool does not require credentials.",
    missing_credentials: "Required credential is missing.",
    invalid_credentials: "Credential is present but invalid.",
    permission_denied: "Credential does not have permission for this action.",
    rate_limited: "Credential or provider is currently rate limited.",
    available: "Credential is available."
  };
  return reasons[status];
}
