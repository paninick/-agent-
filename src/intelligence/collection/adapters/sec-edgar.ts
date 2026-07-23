/**
 * collection/adapters/sec-edgar.ts - SEC EDGAR 采集适配器
 *
 * 调 fetchSecCompanyMetricSet 采集 GAP Inc. (CIK 39911) 的 XBRL 财务指标，
 * 转成 RawRecord[] 供 Collector agent 消费。
 */

import type { RawRecord } from "../../spine/types";
import type { IntelligenceSource } from "../../types";
import { fetchSecCompanyMetricSet } from "../../officialApis";
import type { LiveCollectorConfig } from "../live-collector";

export async function collectSecEdgar(
  source: IntelligenceSource,
  config: LiveCollectorConfig,
): Promise<RawRecord[]> {
  const fetchImpl = config.fetchImpl;
  const now = (config.now ?? new Date()).toISOString();

  const metricSet = await fetchSecCompanyMetricSet({ cik: "39911", fetchImpl });

  const metricSummary = metricSet.metrics
    .map((m) => `${m.canonicalName}:${m.value}${m.unit ? ` ${m.unit}` : ""}`)
    .join("; ");

  const derivedSummary = [
    metricSet.derived.grossMargin === undefined ? undefined : `grossMargin=${metricSet.derived.grossMargin}`,
    metricSet.derived.inventoryToRevenue === undefined ? undefined : `inventoryToRevenue=${metricSet.derived.inventoryToRevenue}`,
  ]
    .filter(Boolean)
    .join("; ");

  return [
    {
      id: `raw-sec-gap-${now}`,
      sourceId: source.id,
      fetchedAt: now,
      contentType: "application/json",
      raw: {
        subject: "gap_financials",
        claim: `${metricSet.entityName} SEC XBRL metrics: ${metricSummary}`,
        value: derivedSummary ? `${metricSummary}; ${derivedSummary}` : metricSummary,
        unit: "SEC XBRL native units",
        period: metricSet.metrics.find((m) => m.fy)?.fy?.toString() ?? undefined,
        geography: "United States",
      },
    },
  ];
}
