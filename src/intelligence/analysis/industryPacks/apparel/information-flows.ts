/**
 * analysis/industryPacks/apparel/information-flows.ts - 信息流（趋势传播链路）
 *
 * 趋势传播五阶段：
 *   1. 社媒信号 (social_media) - TikTok/Instagram/小红书 mentions
 *   2. 审美验证 (validation) - Pinterest saves / 搜索指数
 *   3. 供应链响应 (supplier) - 供应商询盘 / 打样请求
 *   4. 平台放量 (ecommerce) - 电商上新 / 直播带货
 *   5. 大众饱和 (saturation) - 趋势饱和度 / 生命周期衰退
 *
 * Analyst 检测到信息流指标信号后，通过 buildInformationFlowEdges 建因果边。
 */

import type { InformationFlow } from "../../../core/industry-pack";

export const apparelInformationFlows: InformationFlow[] = [
  {
    id: "flow-social-media-buzz",
    sourceType: "social_media",
    buzzMetric: "social_media_mentions",
    validationMetric: "tiktok_views",
    supplyResponseMetric: "supplier_inquiries",
    description: "社媒热度趋势：TikTok/Instagram/小红书 mentions -> TikTok播放量验证 -> 供应商询盘响应",
  },
  {
    id: "flow-search-trend",
    sourceType: "search",
    buzzMetric: "search_index",
    validationMetric: "pinterest_saves",
    supplyResponseMetric: "sample_requests",
    description: "搜索趋势：搜索指数飙升 -> Pinterest收藏验证审美 -> 打样请求增加",
  },
  {
    id: "flow-ecommerce-listings",
    sourceType: "ecommerce",
    buzzMetric: "ecommerce_new_listings",
    description: "电商上新趋势：平台新上架商品数量反映趋势的市场响应速度",
  },
  {
    id: "flow-trend-lifecycle",
    sourceType: "lifecycle",
    buzzMetric: "social_media_mentions",
    lifecycleStageMetric: "trend_lifecycle_stage",
    velocityMetric: "trend_velocity",
    saturationMetric: "trend_saturation",
    description: "趋势生命周期监控：从萌芽到消亡的全周期追踪，饱和度>80%时触发衰退预警",
  },
];
