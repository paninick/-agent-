import type { SkillDescriptor, SkillRegistryEntry, TokenEstimate } from "./types";

/**
 * In-memory registry of known skill descriptors and their pre-computed token estimates.
 * The registry is a lookup table — it does not load file content.
 */
export class SkillRegistry {
  private readonly entries = new Map<string, SkillRegistryEntry>();

  register(descriptor: SkillDescriptor, tokenEstimate: TokenEstimate): SkillRegistryEntry {
    const entry: SkillRegistryEntry = { descriptor, tokenEstimate };
    this.entries.set(descriptor.skillId, entry);
    return entry;
  }

  lookup(skillId: string): SkillRegistryEntry | undefined {
    return this.entries.get(skillId);
  }

  list(): SkillRegistryEntry[] {
    return Array.from(this.entries.values());
  }

  remove(skillId: string): boolean {
    return this.entries.delete(skillId);
  }

  has(skillId: string): boolean {
    return this.entries.has(skillId);
  }

  size(): number {
    return this.entries.size;
  }
}

export function createSkillRegistry(): SkillRegistry {
  return new SkillRegistry();
}
