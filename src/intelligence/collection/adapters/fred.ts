/**
 * collection/adapters/fred.ts - FRED 采集适配器
 *
 * 调 fetchFredLatestObservation 采集 USD/JPY 汇率系列（DEXJPUS）最新观测值，
 * 转成 RawRecord[] 供 Collector agent 消费。
 *
 * 需要 FRED_API_KEY（从 config 传入，不在此文件读 env）。
 */

import type { RawRecord } from "../../spine/types";
import type { IntelligenceSource } from "../../types";
import { fetchFredLatestObservation } from "../../officialApis";
import type { LiveCollectorConfig } from "../live-collector";

export async function collectFred(
  source: IntelligenceSource,
  config: LiveCollectorConfig,
): Promise<RawRecord[]> {
  if (!config.fredApiKey) return [];

  const fetchImpl = config.fetchImpl;
  const now = (config.now ?? new Date()).toISOString();

  const point = await fetchFredLatestObservation({
    seriesId: "DEXJPUS",
    apiKey: config.fredApiKey,
    fetchImpl,
  });

  return [
    {
      id: `raw-fred-${point.seriesId}-${point.date}-${now}`,
      sourceId: source.id,
      fetchedAt: now,
      contentType: "application/json",
      raw: {
        subject: point.seriesId,
        claim: `FRED ${point.seriesId} = ${point.value} on ${point.date}`,
        value: point.value,
        unit: "FRED series native unit (JPY per USD)",
        period: point.date,
        geography: "United States",
      },
    },
  ];
}
