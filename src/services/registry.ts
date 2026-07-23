/**
 * services/registry.ts - 泛型内存注册表基类
 *
 * 从 NP3 (agent-os-2) 提炼的 InMemoryRegistry<T> 模式。
 * 提供统一的 register/get/require/list/enabled 接口。
 *
 * NP2 现有 5 个 ad-hoc 注册表（probes, sourceRegistry, mcp, skills, release phases）
 * 暂不迁移--此基类供新服务使用，现有注册表后续逐步迁移以降低风险。
 */

import { createAppError, type ExecutionResult, type RegistryItem } from "../domain/common";

export interface Registry<T extends RegistryItem> {
  register(item: T): ExecutionResult<T>;
  get(id: string): T | undefined;
  require(id: string): ExecutionResult<T>;
  list(): T[];
  enabled(): T[];
  delete(id: string): boolean;
  clear(): void;
}

export class InMemoryRegistry<T extends RegistryItem> implements Registry<T> {
  private readonly items = new Map<string, T>();

  constructor(private readonly registryName: string) {}

  register(item: T): ExecutionResult<T> {
    if (this.items.has(item.id)) {
      return {
        ok: false,
        error: createAppError(
          "REGISTRY_DUPLICATE_ID",
          `${this.registryName} already contains ${item.id}`,
          this.registryName,
          false,
        ),
      };
    }
    this.items.set(item.id, item);
    return { ok: true, data: item };
  }

  get(id: string): T | undefined {
    return this.items.get(id);
  }

  require(id: string): ExecutionResult<T> {
    const item = this.items.get(id);
    if (!item) {
      return {
        ok: false,
        error: createAppError(
          "REGISTRY_ITEM_NOT_FOUND",
          `${this.registryName} item ${id} was not registered`,
          this.registryName,
          true,
          "Register and validate the item before execution.",
        ),
      };
    }
    return { ok: true, data: item };
  }

  list(): T[] {
    return [...this.items.values()];
  }

  enabled(): T[] {
    return this.list().filter((item) => item.enabled);
  }

  /** 移除一个已注册项。返回是否实际移除了（不存在则 false）。 */
  delete(id: string): boolean {
    return this.items.delete(id);
  }

  /** 清空所有已注册项。 */
  clear(): void {
    this.items.clear();
  }
}
