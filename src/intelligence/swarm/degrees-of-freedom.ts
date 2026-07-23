/**
 * swarm/degrees-of-freedom.ts - 自由度分级
 *
 * 吸收 superpowers using-superpowers 的技能类型分类：
 *   Rigid skills (TDD, debugging) - follow exactly, do not adapt away discipline
 *   Flexible skills (patterns) - adapt principles to context
 *
 * 将此思想映射到蜂群的 19 条 Feedback 规则：
 *   公式类规则 (1-3, 8-9)    = low freedom（严格按公式执行）
 *   归因类规则 (4-7, 10-13)  = medium freedom（可根据上下文调整）
 *   分析类规则 (14-19)       = high freedom（需要判断和适配）
 */

// === 自由度类型 ===

export type FreedomLevel = "high" | "medium" | "low";

/** 规则自由度声明 */
export interface RuleFreedomDeclaration {
  /** 规则 ID（对应 feedback.ts 中的规则编号） */
  ruleId: string;
  /** 自由度级别 */
  freedom: FreedomLevel;
  /** 分级理由 */
  rationale: string;
}

// === 19 条规则的自由度声明 ===

/**
 * 为现有 19 条 Feedback 规则声明自由度。
 *
 * 分级原则：
 *   low    = 公式驱动、条件明确、无需判断（confidence < 0.5 -> retry）
 *   medium = 归因驱动、有条件但需上下文判断（chainEstimate bottleneck -> probe）
 *   high   = 分析驱动、需要人为判断和适配（reconciliation mismatch -> freeze settlement）
 */
export const FREEDOM_DECLARATIONS: RuleFreedomDeclaration[] = [
  // === 公式类（low freedom）===
  { ruleId: "rule-1", freedom: "low", rationale: "Blind retry: confidence < 0.5 -> collect evidence. Pure threshold, no judgment needed." },
  { ruleId: "rule-2", freedom: "low", rationale: "Signal match: above_range/cost_rising -> probe cotton/yarn. Direct signal-to-action mapping." },
  { ruleId: "rule-3", freedom: "low", rationale: "Signal match: demand_up -> verify capacity. Direct signal-to-action mapping." },
  { ruleId: "rule-8", freedom: "low", rationale: "Reflex match: broker reflex trigger -> emit action. Mechanical pattern matching." },
  { ruleId: "rule-9", freedom: "low", rationale: "Default fallback: no follow-ups -> periodic re-probe. Always-applicable default." },

  // === 归因类（medium freedom）===
  { ruleId: "rule-4", freedom: "medium", rationale: "Chain pressure critical -> urgent investigation. Requires reading chainEstimate context." },
  { ruleId: "rule-5", freedom: "medium", rationale: "Bottleneck node high severity -> probe. Requires identifying which node and why." },
  { ruleId: "rule-6", freedom: "medium", rationale: "Chain deviation > 15% -> confirm transmission. Requires understanding causal chain." },
  { ruleId: "rule-7", freedom: "medium", rationale: "Source disagreement > 30% -> cross-verify. Requires per-node analysis." },
  { ruleId: "rule-10", freedom: "medium", rationale: "Reverse consistency signals -> verify feedback reliability. Requires interpreting risk signals." },
  { ruleId: "rule-11", freedom: "medium", rationale: "Resonance alert -> recommended action. Requires pattern type assessment." },
  { ruleId: "rule-12", freedom: "medium", rationale: "Low propagation coverage -> collect missing data. Requires identifying which nodes are missing." },
  { ruleId: "rule-13", freedom: "medium", rationale: "Chain-wide deviation -> investigate macro factors. Requires broad context analysis." },

  // === 分析类（high freedom）===
  { ruleId: "rule-14", freedom: "high", rationale: "Reconciliation mismatch -> freeze settlement. Requires business judgment on severity and impact." },
  { ruleId: "rule-15", freedom: "high", rationale: "Price mismatch -> cost breakdown verification. Requires understanding cost decomposition." },
  { ruleId: "rule-16", freedom: "high", rationale: "Delivery mismatch -> root cause investigation. Requires multi-factor analysis (material/production/QC/logistics/customs/payment)." },
  { ruleId: "rule-17", freedom: "high", rationale: "Demand credibility low -> require deposit. Requires business risk assessment." },
  { ruleId: "rule-18", freedom: "high", rationale: "Supply credibility low -> small batch testing. Requires supplier risk judgment." },
  { ruleId: "rule-19", freedom: "high", rationale: "Unclosed anomalies -> escalate. Requires reviewing each anomaly's resolution status." },
];

// === 查询函数 ===

/** 规则 ID -> 自由度的快速查找表 */
const FREEDOM_MAP = new Map<string, FreedomLevel>(
  FREEDOM_DECLARATIONS.map((d) => [d.ruleId, d.freedom])
);

/**
 * 获取指定规则的自由度级别。
 *
 * @param ruleId - 规则 ID（如 "rule-1"）
 * @returns 自由度级别（未知规则返回 "medium" 作为安全默认）
 */
export function getRuleFreedom(ruleId: string): FreedomLevel {
  return FREEDOM_MAP.get(ruleId) ?? "medium";
}

/**
 * 获取指定规则的完整自由度声明。
 *
 * @param ruleId - 规则 ID
 * @returns 自由度声明（未知规则返回 undefined）
 */
export function getRuleDeclaration(ruleId: string): RuleFreedomDeclaration | undefined {
  return FREEDOM_DECLARATIONS.find((d) => d.ruleId === ruleId);
}

/**
 * 按自由度级别分组统计规则。
 */
export function groupRulesByFreedom(): Record<FreedomLevel, string[]> {
  const groups: Record<FreedomLevel, string[]> = {
    high: [],
    medium: [],
    low: [],
  };

  for (const decl of FREEDOM_DECLARATIONS) {
    groups[decl.freedom].push(decl.ruleId);
  }

  return groups;
}

/**
 * 判断规则是否可以适配（flexible）。
 *
 * high/medium = 可适配；low = 严格遵循。
 */
export function isFlexible(ruleId: string): boolean {
  const freedom = getRuleFreedom(ruleId);
  return freedom === "high" || freedom === "medium";
}
