/**
 * collection/adapters/bls.ts - BLS 采集适配器
 *
 * 调 fetchBlsLatestSeriesPoint 采集 CPI 服装系列（CUSR0000SAA）最新观测值，
 * 转成 RawRecord[] 供 Collector agent 消费。
 */

import type { RawRecord } from "../../spine/types";
import type { IntelligenceSource } from "../../types";
import { fetchBlsLatestSeriesPoint } from "../../officialApis";
import type { LiveCollectorConfig } from "../live-collector";

export async function collectBls(
  source: IntelligenceSource,
  config: LiveCollectorConfig,
): Promise<RawRecord[]> {
  const fetchImpl = config.fetchImpl;
  const now = (config.now ?? new Date()).toISOString();

  const currentYear = (config.now ?? new Date()).getUTCFullYear();
  const point = await fetchBlsLatestSeriesPoint({
    seriesId: "CUSR0000SAA",
    startYear: currentYear - 1,
    endYear: currentYear,
    fetchImpl,
  });

  return [
    {
      id: `raw-bls-${point.seriesId}-${point.year}-${point.period}-${now}`,
      sourceId: source.id,
      fetchedAt: now,
      contentType: "application/json",
      raw: {
        subject: point.seriesId,
        claim: `BLS ${point.seriesId} = ${point.value} in ${point.year} ${point.periodName}`,
        value: point.value,
        unit: "BLS series native index/value",
        period: `${point.year}-${point.period}`,
        geography: "United States",
      },
    },
  ];
}
