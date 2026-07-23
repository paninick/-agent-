import type { McpError, McpErrorKind } from "./types";

export const RETRYABLE_MAP: Record<McpErrorKind, boolean> = {
  transport_unavailable: true,
  auth_required: false,
  tool_not_found: false,
  timeout: true,
  server_error: true,
  schema_invalid: false,
  rate_limited: true,
  unknown: false
};

export function isRetryable(kind: McpErrorKind): boolean {
  return RETRYABLE_MAP[kind];
}

export function createMcpError(kind: McpErrorKind, message: string): McpError {
  return {
    kind,
    message,
    retryable: isRetryable(kind)
  };
}
