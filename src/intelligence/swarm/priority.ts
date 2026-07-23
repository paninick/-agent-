/**
 * swarm/priority.ts - 指令优先级体系
 *
 * 吸收 superpowers using-superpowers 的指令优先级层级：
 *   1. User's explicit instructions (CLAUDE.md, direct requests) - highest
 *   2. Superpowers skills / Industry Pack rules - override defaults
 *   3. Default system prompt / fallback behavior - lowest
 *
 * "If CLAUDE.md says 'don't use TDD' and a skill says 'always use TDD',
 *  follow the user. The user is in control."
 */

// === 优先级枚举 ===

/** 指令来源优先级 - 数值越高优先级越高 */
export enum InstructionPriority {
  /** 默认行为 - 系统内置的 fallback 逻辑 */
  DEFAULT = 1,
  /** 行业包规则 - IndustryPack 提供的行业特定配置 */
  INDUSTRY_PACK = 2,
  /** 用户配置 - 用户显式指定的指令（最高优先级） */
  USER_CONFIG = 3,
}

// === 优先级解析 ===

/** 优先级解析结果 */
export interface PriorityResolution {
  /** 最终采用的值 */
  value: unknown;
  /** 值的来源优先级 */
  source: InstructionPriority;
  /** 来源描述 */
  sourceName: string;
  /** 是否存在冲突（多个来源都有值且不同） */
  hasConflict: boolean;
  /** 被覆盖的来源列表（低优先级被高优先级覆盖） */
  overriddenSources: Array<{ priority: InstructionPriority; value: unknown }>;
}

/**
 * 解析指令冲突 - 按优先级选择最终值。
 *
 * 优先级：USER_CONFIG(3) > INDUSTRY_PACK(2) > DEFAULT(1)
 *
 * @param userConfig   - 用户配置值（undefined 表示用户未指定）
 * @param packRule     - 行业包规则值（undefined 表示行业包未指定）
 * @param defaultBehavior - 默认行为值
 * @returns 优先级解析结果
 */
export function resolveInstructionConflict(
  userConfig: unknown,
  packRule: unknown,
  defaultBehavior: unknown
): PriorityResolution {
  const sources: Array<{ priority: InstructionPriority; value: unknown; name: string }> = [
    { priority: InstructionPriority.USER_CONFIG, value: userConfig, name: "user config" },
    { priority: InstructionPriority.INDUSTRY_PACK, value: packRule, name: "industry pack" },
    { priority: InstructionPriority.DEFAULT, value: defaultBehavior, name: "default" },
  ];

  // 找到第一个非 undefined 的来源（按优先级从高到低）
  const resolved = sources.find((s) => s.value !== undefined);

  // 检测冲突：多个来源都有值且不同
  const definedSources = sources.filter((s) => s.value !== undefined);
  const uniqueValues = new Set(definedSources.map((s) => JSON.stringify(s.value)));
  const hasConflict = uniqueValues.size > 1;

  // 被覆盖的来源
  const overriddenSources = definedSources
    .filter((s) => s.priority < (resolved?.priority ?? 0))
    .map((s) => ({ priority: s.priority, value: s.value }));

  return {
    value: resolved?.value ?? defaultBehavior,
    source: resolved?.priority ?? InstructionPriority.DEFAULT,
    sourceName: resolved?.name ?? "default",
    hasConflict,
    overriddenSources,
  };
}

/**
 * 格式化优先级报告为人类可读字符串。
 */
export function formatPriorityReport(resolution: PriorityResolution): string {
  const lines: string[] = [];
  lines.push(`Priority Resolution:`);
  lines.push(`  Resolved value: ${JSON.stringify(resolution.value)}`);
  lines.push(`  Source: ${resolution.sourceName} (priority=${resolution.source})`);

  if (resolution.hasConflict) {
    lines.push(`  ⚠️ Conflict detected - ${resolution.overriddenSources.length} source(s) overridden:`);
    for (const src of resolution.overriddenSources) {
      const name = src.priority === InstructionPriority.INDUSTRY_PACK
        ? "industry pack"
        : "default";
      lines.push(`    - ${name}: ${JSON.stringify(src.value)}`);
    }
  }

  return lines.join("\n");
}

/**
 * 获取优先级名称。
 */
export function getPriorityName(priority: InstructionPriority): string {
  switch (priority) {
    case InstructionPriority.USER_CONFIG:
      return "user config";
    case InstructionPriority.INDUSTRY_PACK:
      return "industry pack";
    case InstructionPriority.DEFAULT:
      return "default";
    default:
      return "unknown";
  }
}
