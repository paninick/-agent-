/**
 * collection/adapters/comtrade.ts - UN Comtrade 采集适配器
 *
 * 调 fetchComtradeFlowSummary 采集日本(392)从中国(156)进口 HS 61（针织服装）的贸易流数据，
 * 转成 RawRecord[] 供 Collector agent 消费。
 *
 * 需要 UN_COMTRADE_API_KEY（从 config 传入，不在此文件读 env）。
 */

import type { RawRecord } from "../../spine/types";
import type { IntelligenceSource } from "../../types";
import { fetchComtradeFlowSummary } from "../../officialApis";
import type { LiveCollectorConfig } from "../live-collector";

export async function collectComtrade(
  source: IntelligenceSource,
  config: LiveCollectorConfig,
): Promise<RawRecord[]> {
  if (!config.comtradeApiKey) return [];

  const fetchImpl = config.fetchImpl;
  const now = (config.now ?? new Date()).toISOString();

  const summary = await fetchComtradeFlowSummary({
    reporterCode: "392", // Japan
    partnerCode: "156",  // China
    commodityCode: "61", // Knitted apparel
    period: "2024",
    apiKey: config.comtradeApiKey,
    fetchImpl,
  });

  return [
    {
      id: `raw-comtrade-${summary.reporterCode}-${summary.partnerCode}-${summary.commodityCode}-${summary.period}-${now}`,
      sourceId: source.id,
      fetchedAt: now,
      contentType: "application/json",
      raw: {
        subject: `comtrade_${summary.reporterCode}_${summary.partnerCode}_${summary.commodityCode}`,
        claim: `UN Comtrade: ${summary.recordCount} records for reporter ${summary.reporterCode}, partner ${summary.partnerCode}, HS ${summary.commodityCode} in ${summary.period}`,
        value: summary.tradeValue ?? summary.recordCount,
        unit: summary.tradeValue === undefined ? "record count" : "primary trade value",
        period: summary.period,
        geography: `Reporter ${summary.reporterCode} - Partner ${summary.partnerCode}`,
      },
    },
  ];
}
