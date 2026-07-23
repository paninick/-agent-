/**
 * analysis/industryPacks/apparel/trusted-sources.ts — 服装行业额外受信来源
 *
 * S/A+ tier 来源永远受信（由 core provenance gate 保证）。
 * 这里只列出 apparel 专属但不在 S/A+ tier 的受信来源。
 */

export const apparelTrustedSourceIds = new Set<string>([
  "internal-bom-system",   // 内部 BOM 系统（apparel 专属）
]);
