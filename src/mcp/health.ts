import type { McpHealthStatus, McpServerProfile } from "./types";

export function getDeclaredHealthStatus(profile: McpServerProfile): McpHealthStatus {
  return profile.healthStatus;
}
