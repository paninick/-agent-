/**
 * probes/registry.ts - 探针注册表
 *
 * 继承 InMemoryRegistry<T> 泛型基类（NP3 合并），获得统一的
 * register/get/require/list/enabled 接口 + delete/clear。
 *
 * 额外保留 enable/disable/remove 操作方法（基类不提供 enable/disable）。
 * 不接数据库（遵守约束）。
 */

import { InMemoryRegistry } from "../../services/registry";
import type { Probe } from "../spine/types";

export class ProbeRegistry extends InMemoryRegistry<Probe> {
  constructor() {
    super("ProbeRegistry");
  }

  /**
   * 重写 register：基类拒绝重复 ID，但原 ProbeRegistry 允许覆盖。
   * 保持向后兼容：重复 ID 时先删除再注册（覆盖语义）。
   */
  override register(probe: Probe): ReturnType<InMemoryRegistry<Probe>["register"]> {
    if (this.get(probe.id)) {
      this.delete(probe.id);
    }
    return super.register(probe);
  }

  /** 列出所有已启用的探针（基类 enabled() 的别名，保持 API 兼容） */
  listEnabled(): Probe[] {
    return this.enabled();
  }

  /** 启用探针 */
  enable(id: string): boolean {
    const probe = this.get(id);
    if (!probe) return false;
    probe.enabled = true;
    return true;
  }

  /** 禁用探针 */
  disable(id: string): boolean {
    const probe = this.get(id);
    if (!probe) return false;
    probe.enabled = false;
    return true;
  }

  /** 移除探针（基类 delete 的别名，保持 API 兼容） */
  remove(id: string): boolean {
    return this.delete(id);
  }
}
