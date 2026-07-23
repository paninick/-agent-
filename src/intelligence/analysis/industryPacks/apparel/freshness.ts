/**
 * analysis/industryPacks/apparel/freshness.ts — 服装行业指标时效规则
 *
 * 这些 maxLag 原来硬编码在 agents/validators.ts 的 FRESHNESS_MAX_AGE_DAYS 中。
 * 现在提取到 apparel pack。
 */

export const apparelFreshnessMaxAgeDays: Record<string, number> = {
  raw_material: 35,       // 棉花 — USDA WASDE 月度
  cotton: 35,             // 兼容旧 nodeId
  pta: 1,                 // PTA — 隆众日报
  keqiao: 1,              // 柯桥指数 — 中纤网日报
  yarn: 1,                // 纱线价格日报
  fabric: 1,              // 面料价格日报
  design: 90,             // 设计趋势 — WGSN 季度
  manufacturing: 365,     // 生产年报
  brand: 95,              // 品牌财报（季度+年报窗口）
  channel: 7,             // 渠道数据（周更）
  consumer: 70,           // 消费者指数（月+季）
  recycling: 365,         // 回收年报
};

export const apparelDefaultFreshnessMaxAgeDays = 30;
