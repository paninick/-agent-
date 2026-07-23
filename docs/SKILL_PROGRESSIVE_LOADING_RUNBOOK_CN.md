# Skill Progressive Loading + Context Budget 运行手册

更新日期：2026-07-05

## 1. P5 是什么

P5（Skill Progressive Loading + Context Budget）是 Agent OS v2 的静态技能预算层。它在技能内容被注入 prompt **之前**，估算每个技能的 token 开销、按优先级分类、计算上下文预算利用率，并在加载阶段执行预算拦截。

与其他模块的关系：
- `src/skills/` 是**纯静态库**——只做 token 估算、分类、预算计算，不做 IO、不调 API、不接触运行时。
- `src/integration/` 是唯一可以把 skills 接入执行链路的层（类比 P4.2 的 ToolExecutionAdapter）。
- 所有已密封层（P0-P4.2、Model Gateway）保持不变。

## 2. 架构位置

```
SkillDescriptor (filePath, lineCount, charCount)
  ↓ estimateTokensFromSize()  ← 注册阶段：只看大小，不读内容
SkillRegistry
  ↓ classifyAll()             ← 分类阶段：always / sometimes / rarely
ClassifiedSkill[]
  ↓ computeAllocation()        ← 预算阶段：扣保留，算利用率
ContextBudgetAllocation
  ↓ generateReport()           ← 报告阶段：警告 + 优化建议
BudgetReport

SkillDescriptor
  ↓ loadSkill(readFile, remainingBudget?)  ← 加载阶段：读内容 + 估算 + 预算拦截
SkillLoadResult (loaded | not_found | exceeds_budget | parse_error)
```

## 3. Token 估算启发式规则

来自 `skills/ECC/skills/context-budget/SKILL.md`：

| 方法 | 公式 | 触发条件 |
|---|---|---|
| prose | `words × 1.3` | 代码字符占比 < 5% |
| code | `chars / 4` | 代码字符占比 > 15% |
| mixed | `(prose + code) / 2` | 占比在 5%-15% 之间 |

`estimateTokensFromSize`（不读内容，仅靠大小估算）：平均行长 > 60 字符判为 code，否则 prose。

## 4. 上下文预算分层

| Tier | 窗口大小 | 模型保留 | 系统保留 | 可用于技能 |
|---|---|---|---|---|
| `small` | 8,000 | 4,000 | 2,000 | 2,000 |
| `medium` | 32,000 | 4,000 | 2,000 | 26,000 |
| `large` | 200,000 | 4,000 | 2,000 | 194,000 |

## 5. 技能分类规则

| 优先级 | 判定 | 行动 |
|---|---|---|
| `always_needed` | `alwaysNeededSkillIds` 显式标记，或描述含 `core`/`required`/`essential`/`always`/`default`/`primary` | 保留 |
| `sometimes_needed` | 未显式标记且无关键词命中 | 默认；可按需加载 |
| `rarely_needed` | `rarelyNeededSkillIds` 显式标记，或描述含 `optional`/`rare`/`deprecated`/`legacy`/`experimental` | 移除或懒加载 |

可通过 `ClassificationHints` 注入显式 id 列表覆盖关键词判定。

## 6. 报告警告与优化建议

`generateReport` 产生的警告：
- 利用率 > 80% → 建议移除 rarely-needed 技能。
- 估算 token 超过可用预算 → `EXCEEDED by N tokens`。
- 存在 rarely-needed 技能 → 列出可节省的 token。
- sometimes-needed 技能 > 5 → 建议懒加载。
- 单个技能 > 2000 tokens → 建议拆分（最多列前 3 个）。

## 7. 使用示例

### 扫描注册 + 分类 + 报告

```ts
import {
  createSkillRegistry,
  estimateTokensFromSize,
  classifyAll,
  computeAllocation,
  generateReport,
  defaultConfigForTier,
} from "../skills";

const registry = createSkillRegistry();
for (const desc of scannedDescriptors) {
  registry.register(desc, estimateTokensFromSize(desc.charCount, desc.lineCount));
}

const classified = classifyAll(registry.list(), {
  alwaysNeededSkillIds: ["core-tool"],
});
const config = defaultConfigForTier("medium");
const report = generateReport(config, classified);

console.log(report.utilizationPercent, report.warnings, report.topOptimizations);
```

### 按需加载单个技能（带预算拦截）

```ts
import { loadSkill } from "../skills";
import { readFileSync } from "node:fs";

const result = await loadSkill(descriptor, {
  readFile: (p) => readFileSync(p, "utf8"),
  remainingBudget: 2000,
});

if (result.ok) {
  // result.content / result.tokenEstimate 已就绪
} else {
  // result.status ∈ {not_found, exceeds_budget, parse_error}
}
```

## 8. 边界规则

1. `src/skills/` 是纯静态库：不 `fetch`、不读 `process.env`、不写 RunStore、不调 MCP、不触发 governance hook。
2. `src/skills/` 不 import `src/integration`、`src/governance`、`src/runtime`、`src/mcp`、`src/models`、`src/intelligence`——只 import 自身的 `./types` / `./tokenEstimator`。
3. `loadSkill` 的文件读取通过注入的 `readFile` 参数完成，便于测试不接触真实磁盘。
4. `remainingBudget` 为 `undefined` 时不做预算拦截（仅加载并估算）。
5. `SkillLoadResult` 是判别联合 `ok: true | false`，失败必带 `status` + `skillId` + `message`。
6. 分层默认值（`small`/`medium`/`large` 窗口、保留 token）来自 `context-budget` SKILL.md，硬编码在 `contextBudget.ts` 中。
7. 所有已密封层保持不变；P5 不修改任何现有 `src/` 文件。
8. 后续如需把 skills 接入执行链路，应在 `src/integration/` 新建适配器（类比 `ToolExecutionAdapter`），不在 `src/skills/` 内部耦合。
