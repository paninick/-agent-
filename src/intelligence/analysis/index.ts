/**
 * analysis/index.ts — 分析层 barrel export
 *
 * Industry Pack 位于 analysis 层：行业包是分析镜头，不是核心边界。
 * Core engine (spine / validation / triggers / swarm) 行业无关。
 */

export * from "./industryPacks/apparel";
export * from "./attribution";
export * from "./chain-health";
export * from "./resonance-detector";
