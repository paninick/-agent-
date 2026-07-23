/**
 * swarm/progressive-disclosure.ts - 渐进式披露三层模型
 *
 * 吸收 superpowers writing-skills 的渐进披露原则：
 *   "Progressive disclosure - the SKILL.md is the entry point;
 *    supporting references load only when needed."
 *
 * 三层模型：
 *   metadata  - 轻量元数据（名称、触发条件），始终可见
 *   schema    - 结构定义（字段、类型），按需加载
 *   reference - 完整参考文档（示例、边界情况），深度查询时加载
 *
 * "Token efficiency: getting-started <150 words; frequently-loaded <200 words;
 *  move heavy reference (100+ lines) to separate files."
 */

import type { IndustryPack } from "../core/industry-pack";

// === 披露层级 ===

export type DisclosureTier = "metadata" | "schema" | "reference";

// === 披露元数据 ===

/** 单个披露条目的元数据 - 始终可见的轻量信息 */
export interface DisclosureMetadata {
  /** 条目名称 */
  name: string;
  /** 触发条件 - 何时需要加载更深层级 */
  triggerConditions: string;
  /** 所在层级 */
  tier: DisclosureTier;
  /** 简短描述（<50 words） */
  summary: string;
}

// === 披露注册表 ===

/**
 * 渐进式披露注册表 - 管理三层元数据的注册和加载。
 *
 * 设计原则：
 *   - register() 注册条目到特定层级
 *   - load(tier) 加载指定层级及更浅层级的所有条目
 *   - getMetadata() 返回所有条目的元数据（不含完整内容）
 */
export class ProgressiveDisclosureRegistry {
  private entries = new Map<string, { metadata: DisclosureMetadata; content?: unknown }>();

  /**
   * 注册一个披露条目。
   *
   * @param metadata - 条目元数据
   * @param content  - 完整内容（仅 schema/reference 层级需要）
   */
  register(metadata: DisclosureMetadata, content?: unknown): void {
    this.entries.set(metadata.name, { metadata, content });
  }

  /**
   * 加载指定层级及更浅层级的所有条目。
   *
   * 加载顺序：metadata -> schema -> reference
   * load("schema") 返回 metadata + schema 层级的条目。
   *
   * @param tier - 目标层级
   * @returns 该层级及更浅层级的条目列表
   */
  load(tier: DisclosureTier): Array<{ metadata: DisclosureMetadata; content?: unknown }> {
    const tierOrder: DisclosureTier[] = ["metadata", "schema", "reference"];
    const maxIdx = tierOrder.indexOf(tier);
    const allowedTiers = tierOrder.slice(0, maxIdx + 1);

    return Array.from(this.entries.values()).filter((entry) =>
      allowedTiers.includes(entry.metadata.tier)
    );
  }

  /**
   * 获取所有条目的元数据（不含完整内容）。
   */
  getMetadata(): DisclosureMetadata[] {
    return Array.from(this.entries.values()).map((e) => e.metadata);
  }

  /**
   * 按名称获取单个条目。
   */
  get(name: string): { metadata: DisclosureMetadata; content?: unknown } | undefined {
    return this.entries.get(name);
  }

  /** 已注册条目数 */
  get size(): number {
    return this.entries.size;
  }
}

// === IndustryPack 披露注册 ===

/**
 * 为 IndustryPack 注册三层元数据。
 *
 * @param pack - 行业包
 * @returns 已注册的披露注册表
 */
export function registerIndustryPack(pack: IndustryPack): ProgressiveDisclosureRegistry {
  const registry = new ProgressiveDisclosureRegistry();

  // Tier 1: metadata - 始终可见
  registry.register({
    name: `${pack.industryId}-overview`,
    triggerConditions: "Always loaded - provides industry identification and basic config",
    tier: "metadata",
    summary: `${pack.displayName}: ${pack.nodes.length} nodes, ${Object.keys(pack.knownRanges).length} known ranges`,
  });

  // Tier 2: schema - 按需加载
  registry.register({
    name: `${pack.industryId}-ranges`,
    triggerConditions: "Loaded when Verifier or Analyst needs range checking",
    tier: "schema",
    summary: `Known ranges for ${Object.keys(pack.knownRanges).length} subjects`,
  }, pack.knownRanges);

  registry.register({
    name: `${pack.industryId}-freshness`,
    triggerConditions: "Loaded when Verifier checks data freshness",
    tier: "schema",
    summary: `Freshness config: ${Object.keys(pack.freshnessMaxAgeDays).length} nodes, default ${pack.defaultFreshnessMaxAgeDays} days`,
  }, { freshnessMaxAgeDays: pack.freshnessMaxAgeDays, defaultFreshnessMaxAgeDays: pack.defaultFreshnessMaxAgeDays });

  // Tier 3: reference - 深度查询时加载
  if (pack.transmissionPaths) {
    registry.register({
      name: `${pack.industryId}-transmission-paths`,
      triggerConditions: "Loaded when Analyst builds causal edges from transmission paths",
      tier: "reference",
      summary: `${pack.transmissionPaths.length} transmission paths for causal analysis`,
    }, pack.transmissionPaths);
  }

  if (pack.supplyLanes) {
    registry.register({
      name: `${pack.industryId}-supply-lanes`,
      triggerConditions: "Loaded when Analyst builds cross-country supply lane edges",
      tier: "reference",
      summary: `${pack.supplyLanes.length} supply lanes`,
    }, pack.supplyLanes);
  }

  if (pack.crossDimensionRules) {
    registry.register({
      name: `${pack.industryId}-cross-dimension-rules`,
      triggerConditions: "Loaded when Analyst builds cross-dimension causal edges",
      tier: "reference",
      summary: `${pack.crossDimensionRules.length} cross-dimension rules`,
    }, pack.crossDimensionRules);
  }

  if (pack.nodes) {
    registry.register({
      name: `${pack.industryId}-nodes`,
      triggerConditions: "Loaded when Analyst needs full node definitions (substitution, risk, etc.)",
      tier: "reference",
      summary: `${pack.nodes.length} supply chain nodes with full definitions`,
    }, pack.nodes);
  }

  return registry;
}
