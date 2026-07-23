/**
 * memory/store.ts — 内存记忆存储
 *
 * 进程内 Map（不接数据库，遵守约束）。
 * remember(entry) 写入，recall(key) 读取，list() 列出全部。
 * recallByTag(tag) 按 tag 过滤。
 */

import type { MemoryEntry } from "../spine/types";

export class MemoryStore {
  private readonly store = new Map<string, MemoryEntry>();

  /** 写入记忆条目（key 相同则覆盖） */
  remember(entry: MemoryEntry): MemoryEntry {
    this.store.set(entry.key, entry);
    return entry;
  }

  /** 按 key 读取记忆 */
  recall(key: string): MemoryEntry | undefined {
    return this.store.get(key);
  }

  /** 列出所有记忆 */
  list(): MemoryEntry[] {
    return Array.from(this.store.values());
  }

  /** 按 tag 过滤 */
  recallByTag(tag: string): MemoryEntry[] {
    return this.list().filter((e) => e.tags?.includes(tag));
  }

  /** 按 kind 过滤 */
  listByKind(kind: MemoryEntry["kind"]): MemoryEntry[] {
    return this.list().filter((e) => e.kind === kind);
  }

  /** 移除记忆 */
  forget(key: string): boolean {
    return this.store.delete(key);
  }

  /** 清空所有记忆 */
  clear(): void {
    this.store.clear();
  }

  /** 记忆条目数 */
  get size(): number {
    return this.store.size;
  }
}
