/**
 * swarm/scout-matcher.ts — Scout 多级匹配引擎
 *
 * 吸收 MuleRun Data Sources 模式：自动语义匹配 + 多级 fallback。
 * 逐级降级，宁可返回低置信度候选也不返回空列表。
 *
 * 匹配层级 (优先级递减)：
 *   1. exact    — objective 关键词精确匹配 source.name
 *   2. domain   — 匹配 source.coverage_domain
 *   3. coverage — 匹配 source.coverage 数组
 *   4. broker   — 查询 MemoryBroker Layer 1 历史成功源 (若注入)
 *   5. fallback — S/A+ tier 来源 (兜底)
 *
 * 返回带 tier 和 score 的候选列表，供 Scout agent 和调用方决策。
 */

import type { IntelligenceSource } from "../types";
import type { MemoryBroker } from "../memory/broker";

export type ScoutMatchTier = "exact" | "domain" | "coverage" | "broker" | "fallback";

export interface ScoutMatchResult {
  sourceId: string;
  tier: ScoutMatchTier;
  /** 置信度 0-1 (exact=1.0, domain=0.8, coverage=0.6, broker=0.5, fallback=0.3) */
  score: number;
  /** 匹配原因 */
  reason: string;
}

/** 各层级基础分数 */
const TIER_SCORES: Record<ScoutMatchTier, number> = {
  exact: 1.0,
  domain: 0.8,
  coverage: 0.6,
  broker: 0.5,
  fallback: 0.3,
};

/**
 * 多级匹配：从 objective 关键词出发，逐级在 sources 中寻找候选。
 * 高层级匹配的源不再参与低层级（去重）。
 * 若所有层级都无匹配，返回 fallback (S/A+ tier)。
 */
export function matchSources(
  objective: string,
  sources: IntelligenceSource[],
  broker?: MemoryBroker,
): ScoutMatchResult[] {
  const objectiveLower = objective.toLowerCase();
  // 提取关键词（长度 > 2 的词）
  const keywords = objectiveLower
    .split(/[\s,]+/)
    .filter((w) => w.length > 2);

  const results: ScoutMatchResult[] = [];
  const matchedIds = new Set<string>();

  // 1. exact — 匹配 source.name
  for (const source of sources) {
    if (matchedIds.has(source.id)) continue;
    const nameLower = source.name.toLowerCase();
    if (keywords.some((kw) => nameLower.includes(kw))) {
      results.push({
        sourceId: source.id,
        tier: "exact",
        score: TIER_SCORES.exact,
        reason: `objective keyword matched source name "${source.name}"`,
      });
      matchedIds.add(source.id);
    }
  }

  // 2. domain — 匹配 coverage_domain
  for (const source of sources) {
    if (matchedIds.has(source.id)) continue;
    const domainLower = source.coverage_domain.toLowerCase();
    if (keywords.some((kw) => domainLower.includes(kw))) {
      results.push({
        sourceId: source.id,
        tier: "domain",
        score: TIER_SCORES.domain,
        reason: `keyword matched coverage_domain "${source.coverage_domain}"`,
      });
      matchedIds.add(source.id);
    }
  }

  // 3. coverage — 匹配 coverage 数组
  for (const source of sources) {
    if (matchedIds.has(source.id)) continue;
    const coverageHaystack = source.coverage.map((c) => c.toLowerCase()).join(" ");
    if (keywords.some((kw) => coverageHaystack.includes(kw))) {
      results.push({
        sourceId: source.id,
        tier: "coverage",
        score: TIER_SCORES.coverage,
        reason: `keyword matched coverage entry in [${source.coverage.join(", ")}]`,
      });
      matchedIds.add(source.id);
    }
  }

  // 4. broker — 查询历史记忆中的相关源
  if (broker && results.length === 0) {
    const memResults = broker.query({
      text: objectiveLower,
      tags: ["synthesis"],
      layers: [1],
      limit: 5,
    });
    for (const mem of memResults) {
      // 从记忆文本中提取可能的 sourceId（简单启发：文本中出现的 sourceId）
      for (const source of sources) {
        if (matchedIds.has(source.id)) continue;
        if (mem.text.toLowerCase().includes(source.id.toLowerCase())) {
          results.push({
            sourceId: source.id,
            tier: "broker",
            score: TIER_SCORES.broker,
            reason: `source mentioned in historical memory (score=${mem.score.toFixed(2)})`,
          });
          matchedIds.add(source.id);
        }
      }
    }
  }

  // 5. fallback — S/A+ tier 来源
  if (results.length === 0) {
    const fallback = sources
      .filter((s) => s.tier === "S" || s.tier === "A+")
      .slice(0, 3);
    for (const source of fallback) {
      results.push({
        sourceId: source.id,
        tier: "fallback",
        score: TIER_SCORES.fallback,
        reason: `no keyword match; fallback to ${source.tier} tier source`,
      });
      matchedIds.add(source.id);
    }
  }

  // 按 score 降序排序
  return results.sort((a, b) => b.score - a.score);
}
