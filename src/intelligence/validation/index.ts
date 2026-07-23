/**
 * validation/index.ts — 真实性验证门 barrel export
 *
 * 导出统一类型 + 编排器 + (从 agents/validators 重导出) 6 门原子函数。
 * 上层只 import { ... } from "../intelligence" 即可拿到全部能力。
 */

export * from "./types";
export * from "./authenticity";

// 从 agents/validators 重导出，让 validation/ 成为唯一的真实性验证入口
export {
  validateProvenance,
  validateScope,
  validateSchemaGate,
  validateRange,
  validateRangeGate,
  validateFreshness,
  validateFreshnessGate,
  validateCrossSource,
  validateCrossSourceGate,
  validateHistorical,
  validateHistoricalGate,
  computeAuthenticity,
  computeAuthenticityResult,
  stampAuthenticity,
  scoreToFlag,
  scoreToAuthenticityFlag,
  aggregateGateScores,
  runProvenanceGate,
  runSchemaGate,
  runRangeGate,
  runFreshnessGate,
  runCrossSourceGate,
  runHistoricalGate,
  type AuthFlag,
  type AuthenticityOptions,
  type ALL_VALIDATORS
} from "../agents/validators";

// Range / FreshnessConfig 已从 core/industry-pack 统一导出（见 intelligence/index.ts line 18）
// 无需在此重复导出
