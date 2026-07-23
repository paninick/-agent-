/**
 * client/skillViewTypes.ts - 技能与工具视图类型 + mock 工厂
 *
 * 数据形状与 skills/types.ts 的 SkillDescriptor + TokenEstimate 对齐，
 * 增加上下文预算汇总供 SkillsView 展示。
 */

export type SkillViewPriority = "always_needed" | "sometimes_needed" | "rarely_needed";

export interface SkillViewEntry {
  skillId: string;
  name: string;
  description: string;
  origin: string;
  filePath: string;
  lineCount: number;
  charCount: number;
  tokens: number;
  tokenMethod: "prose" | "code" | "mixed";
  priority: SkillViewPriority;
}

export type SkillContextTier = "small" | "medium" | "large";

export interface SkillViewSummary {
  totalSkills: number;
  totalEstimatedTokens: number;
  contextWindowTier: SkillContextTier;
  windowSize: number;
  availableBudget: number;
  utilizationPercent: number;
  entries: SkillViewEntry[];
  warnings: string[];
}

// ===== 元数据 =====

export const PRIORITY_META: Record<SkillViewPriority, { label: string; color: string }> = {
  always_needed: { label: "常驻", color: "var(--cyan)" },
  sometimes_needed: { label: "按需", color: "var(--amber)" },
  rarely_needed: { label: "备用", color: "var(--steel)" },
};

export const TIER_META: Record<SkillContextTier, { label: string; windowSize: number; reservedForModel: number; reservedForSystem: number }> = {
  small: { label: "小窗口", windowSize: 32768, reservedForModel: 8192, reservedForSystem: 4096 },
  medium: { label: "中窗口", windowSize: 65536, reservedForModel: 12288, reservedForSystem: 6144 },
  large: { label: "大窗口", windowSize: 131072, reservedForModel: 16384, reservedForSystem: 8192 },
};

// ===== Mock 工厂 =====

export function createMockSkillEntries(): SkillViewEntry[] {
  return [
    {
      skillId: "market-analysis",
      name: "市场分析框架",
      description: "结构化市场情报采集与趋势研判，覆盖价格、政策、供需三个维度。",
      origin: "ECC",
      filePath: "skills/market-analysis/SKILL.md",
      lineCount: 142,
      charCount: 5680,
      tokens: 1840,
      tokenMethod: "prose",
      priority: "always_needed",
    },
    {
      skillId: "price-elasticity",
      name: "价格弹性测算",
      description: "基于历史数据计算需求价格弹性系数，输出定价建议区间。",
      origin: "ECC",
      filePath: "skills/price-elasticity/SKILL.md",
      lineCount: 98,
      charCount: 3920,
      tokens: 1280,
      tokenMethod: "mixed",
      priority: "always_needed",
    },
    {
      skillId: "supply-chain-risk",
      name: "供应链风险评估",
      description: "多维度风险扫描：库存周转、供应商集中度、物流时效、政策合规。",
      origin: "NP3",
      filePath: "skills/supply-chain-risk/SKILL.md",
      lineCount: 210,
      charCount: 8400,
      tokens: 2720,
      tokenMethod: "prose",
      priority: "sometimes_needed",
    },
    {
      skillId: "competitor-monitor",
      name: "竞品监控",
      description: "自动追踪竞品定价变动、促销策略与渠道布局变化。",
      origin: "ECC",
      filePath: "skills/competitor-monitor/SKILL.md",
      lineCount: 76,
      charCount: 3040,
      tokens: 990,
      tokenMethod: "prose",
      priority: "sometimes_needed",
    },
    {
      skillId: "policy-tracker",
      name: "政策面追踪",
      description: "央行货币政策、行业补贴、关税变动等政策信号的采集与影响评估。",
      origin: "ECC",
      filePath: "skills/policy-tracker/SKILL.md",
      lineCount: 120,
      charCount: 4800,
      tokens: 1560,
      tokenMethod: "prose",
      priority: "sometimes_needed",
    },
    {
      skillId: "data-reconciliation",
      name: "数据交叉校验",
      description: "多源数据冲突检测与可信度加权融合，输出一致性评分。",
      origin: "NP3",
      filePath: "skills/data-reconciliation/SKILL.md",
      lineCount: 165,
      charCount: 6600,
      tokens: 2140,
      tokenMethod: "code",
      priority: "rarely_needed",
    },
    {
      skillId: "report-generator",
      name: "报告生成器",
      description: "将分析结果组装为结构化报告：摘要、图表、建议、附录。",
      origin: "ECC",
      filePath: "skills/report-generator/SKILL.md",
      lineCount: 88,
      charCount: 3520,
      tokens: 1150,
      tokenMethod: "mixed",
      priority: "rarely_needed",
    },
    {
      skillId: "anomaly-detector",
      name: "异常检测器",
      description: "基于统计阈值与时序模型的数据异常检测，触发告警与溯源。",
      origin: "NP3",
      filePath: "skills/anomaly-detector/SKILL.md",
      lineCount: 134,
      charCount: 5360,
      tokens: 1740,
      tokenMethod: "code",
      priority: "rarely_needed",
    },
  ];
}

export function createMockSkillViewSummary(tier: SkillContextTier = "medium"): SkillViewSummary {
  const entries = createMockSkillEntries();
  const totalEstimatedTokens = entries.reduce((sum, e) => sum + e.tokens, 0);
  const tierMeta = TIER_META[tier];
  const availableBudget = tierMeta.windowSize - tierMeta.reservedForModel - tierMeta.reservedForSystem;
  const utilizationPercent = Math.round((totalEstimatedTokens / availableBudget) * 100);

  const warnings: string[] = [];
  if (utilizationPercent > 80) {
    warnings.push(`上下文预算利用率 ${utilizationPercent}%，接近上限，建议优先加载常驻技能。`);
  }
  if (utilizationPercent > 95) {
    warnings.push("上下文预算已超限，部分备用技能将无法加载。");
  }

  return {
    totalSkills: entries.length,
    totalEstimatedTokens,
    contextWindowTier: tier,
    windowSize: tierMeta.windowSize,
    availableBudget,
    utilizationPercent,
    entries,
    warnings,
  };
}
