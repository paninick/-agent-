/**
 * mcp/registry.ts - MCP Gateway 静态注册表
 *
 * 迁移至 InMemoryRegistry 组合模式（NP2 v3）：
 *   - 内部使用 InMemoryRegistry<McpServerEntry> 管理存储，消除 ad-hoc Map 代码
 *   - 保留原有 RegistryResult 返回类型（向后兼容现有调用方和测试）
 *   - 保留深度校验 + 深拷贝逻辑
 *   - 新增 delete() / clear() 方法（继承自基类能力）
 *
 * McpServerProfile 使用 serverId 而非 id，无法直接满足 RegistryItem 约束，
 * 因此用组合而非继承：添加 id = serverId 作为适配字段。
 */

import type { McpServerProfile, McpToolDescriptor, RegistryResult, ValidationResult } from "./types";
import { InMemoryRegistry } from "../services/registry";
import type { RegistryItem } from "../domain/common";

/** McpServerProfile + id 适配，使 InMemoryRegistry 可管理。 */
type McpServerEntry = McpServerProfile & RegistryItem;

const forbiddenFields = ["credentialStatus", "riskLevel", "requiresApproval", "apiKey", "token", "secret"] as const;

export class McpGatewayRegistry {
  private readonly store = new InMemoryRegistry<McpServerEntry>("McpGatewayRegistry");

  register(profile: McpServerProfile): RegistryResult {
    const validation = this.validateServerProfile(profile);
    if (!validation.valid) {
      return { ok: false, errors: validation.errors, warnings: validation.warnings };
    }
    const cloned = cloneServerProfile(profile) as McpServerEntry;
    cloned.id = profile.serverId;
    const result = this.store.register(cloned);
    if (!result.ok) {
      return { ok: false, errors: [result.error!.message], warnings: validation.warnings };
    }
    return { ok: true, profile: cloneServerProfile(cloned), warnings: validation.warnings };
  }

  /** 删除已注册的服务端配置。返回是否实际删除。 */
  delete(serverId: string): boolean {
    return this.store.delete(serverId);
  }

  /** 清空所有已注册的服务端配置。 */
  clear(): void {
    this.store.clear();
  }

  getServer(serverId: string): McpServerProfile | undefined {
    const entry = this.store.get(serverId);
    return entry ? cloneServerProfile(entry) : undefined;
  }

  listServers(): McpServerProfile[] {
    return this.store.enabled().map(cloneServerProfile);
  }

  listTools(serverId: string): McpToolDescriptor[] {
    const entry = this.store.get(serverId);
    if (!entry?.enabled) return [];
    return entry.toolDescriptors.filter((descriptor) => descriptor.enabled).map(cloneToolDescriptor);
  }

  validateServerProfile(profile: McpServerProfile): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    if (!profile.serverId) errors.push("serverId is required.");
    if (this.store.get(profile.serverId)) errors.push(`Duplicate serverId: ${profile.serverId}.`);
    errors.push(...forbiddenFieldErrors(profile, "server profile"));
    for (const descriptor of profile.toolDescriptors ?? []) {
      if (descriptor.serverId !== profile.serverId) {
        errors.push(`Tool ${descriptor.toolId} serverId must match profile serverId ${profile.serverId}.`);
      }
      const descriptorValidation = this.validateToolDescriptor(descriptor, profile.serverId);
      errors.push(...descriptorValidation.errors);
      warnings.push(...descriptorValidation.warnings);
    }
    return { valid: errors.length === 0, errors, warnings };
  }

  validateToolDescriptor(descriptor: McpToolDescriptor, serverId: string): ValidationResult {
    const errors: string[] = [];
    if (!descriptor.toolId) errors.push("toolId is required.");
    if (descriptor.serverId !== serverId) errors.push(`Tool ${descriptor.toolId || "unknown"} must declare serverId ${serverId}.`);
    errors.push(...forbiddenFieldErrors(descriptor, "tool descriptor"));
    return { valid: errors.length === 0, errors, warnings: [] };
  }
}

export function createSeedMcpGatewayRegistry(profiles: McpServerProfile[]): McpGatewayRegistry {
  const registry = new McpGatewayRegistry();
  for (const profile of profiles) registry.register(profile);
  return registry;
}

function forbiddenFieldErrors(value: object, label: string) {
  return forbiddenFields.filter((field) => field in value).map((field) => `${label} contains forbidden field: ${field}.`);
}

function cloneServerProfile(profile: McpServerProfile): McpServerProfile {
  return {
    ...profile,
    toolDescriptors: profile.toolDescriptors.map(cloneToolDescriptor)
  };
}

function cloneToolDescriptor(descriptor: McpToolDescriptor): McpToolDescriptor {
  return {
    ...descriptor,
    inputSchema: { ...descriptor.inputSchema }
  };
}