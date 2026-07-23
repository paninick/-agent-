/**
 * collection/adapters/census.ts - US Census 贸易采集适配器
 *
 * 调 fetchUsCensusImportHs 采集美国 HS 611020（针织衫）从越南的进口数据，
 * 转成 RawRecord[] 供 Collector agent 消费。
 *
 * 需要 CENSUS_API_KEY（从 config 传入，不在此文件读 env）。
 */

import type { RawRecord } from "../../spine/types";
import type { IntelligenceSource } from "../../types";
import { fetchUsCensusImportHs } from "../../officialApis";
import type { LiveCollectorConfig } from "../live-collector";

export async function collectCensus(
  source: IntelligenceSource,
  config: LiveCollectorConfig,
): Promise<RawRecord[]> {
  if (!config.censusApiKey) return [];

  const fetchImpl = config.fetchImpl;
  const now = (config.now ?? new Date()).toISOString();

  const record = await fetchUsCensusImportHs({
    time: "2024-12",
    commodityCode: "611020",
    countryCode: "5700", // Vietnam
    apiKey: config.censusApiKey,
    fetchImpl,
  });

  return [
    {
      id: `raw-census-${record.commodityCode}-${record.countryCode}-${record.time}-${now}`,
      sourceId: source.id,
      fetchedAt: now,
      contentType: "application/json",
      raw: {
        subject: `us_import_${record.commodityCode}`,
        claim: `US Census: HS ${record.commodityCode} (${record.commodityDescription}) imports from ${record.countryName} in ${record.time}`,
        value: record.monthlyGeneralImportValue,
        unit: "monthly general import value USD",
        period: record.time,
        geography: "United States",
      },
    },
  ];
}
