/**
 * collection/adapters/open-supply-hub.ts - Open Supply Hub 采集适配器
 *
 * 调 fetchOpenSupplyHubSearch 采集供应商设施匹配结果，
 * 转成 RawRecord[] 供 Collector agent 消费。
 *
 * 需要 OPEN_SUPPLY_HUB_API_KEY（从 config 传入，不在此文件读 env）。
 */

import type { RawRecord } from "../../spine/types";
import type { IntelligenceSource } from "../../types";
import { fetchOpenSupplyHubSearch } from "../../officialApis";
import type { LiveCollectorConfig } from "../live-collector";

export async function collectOpenSupplyHub(
  source: IntelligenceSource,
  config: LiveCollectorConfig,
): Promise<RawRecord[]> {
  if (!config.openSupplyHubApiKey) return [];

  const fetchImpl = config.fetchImpl;
  const now = (config.now ?? new Date()).toISOString();

  const summary = await fetchOpenSupplyHubSearch({
    query: "Shenzhou",
    apiKey: config.openSupplyHubApiKey,
    fetchImpl,
  });

  return [
    {
      id: `raw-oshub-${summary.query}-${now}`,
      sourceId: source.id,
      fetchedAt: now,
      contentType: "application/json",
      raw: {
        subject: "supplier_search",
        claim: `Open Supply Hub: ${summary.count} facilities matched "${summary.query}"${summary.firstFacilityName ? `, first: ${summary.firstFacilityName}` : ""}`,
        value: summary.count,
        unit: "facility match count",
        period: now.slice(0, 10),
        geography: "Global",
      },
    },
  ];
}
