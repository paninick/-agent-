import type { RiskLevel } from "./streamLaunchPlan";

/**
 * Approval policy — controls when the SSE approval gate fires.
 *
 * Production default: driven by env `APPROVAL_ENABLED`.
 * Set `APPROVAL_ENABLED=true` in .env.local to activate the gate.
 * The server (createApp) reads the env after dotenv loads and sets this flag.
 *
 * When `enabled = true`, the gate fires only for customer-facing /
 * external launch copy generation (controlled by `requireApprovalForExternalCopy`).
 * We do NOT gate every tool call — only external copy generation.
 *
 * `requireApprovalForExternalCopy = true` is the safe default: when the approval
 * gate is enabled, external copy generation must be approved before release.
 */
export type ApprovalPolicy = {
  enabled: boolean;
  requireApprovalForExternalCopy: boolean;
};

export const approvalPolicy: ApprovalPolicy = {
  enabled: false,
  requireApprovalForExternalCopy: true,
};

/** Test helper — reset to production defaults. */
export function resetApprovalPolicy(): void {
  approvalPolicy.enabled = false;
  approvalPolicy.requireApprovalForExternalCopy = true;
}

/**
 * Default approval metadata used when building an approval_required event.
 * Centralised so the server and tests share the same field values.
 */
export const DEFAULT_APPROVAL_META = {
  title: "Approval required",
  reason:
    "The agent is about to generate customer-facing launch copy using unreleased product information.",
  riskLevel: "medium" as RiskLevel,
  toolName: "generate_channel_copy",
  requestedAction: "Continue with customer-facing release messaging.",
  payloadPreview: {
    channels: ["changelog", "email", "support"],
    audience: "enterprise customers",
  },
} as const;
