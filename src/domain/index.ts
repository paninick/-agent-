/**
 * domain/index.ts - 桥接类型层 barrel export
 *
 * 从 NP3 提炼、与 NP2 现有类型对齐的通用类型。
 * 不替换现有类型（runtime/types.ts, integration/types.ts），独立共存。
 */
export * from "./common";
export * from "./cost";
export * from "./agentHabitat";
