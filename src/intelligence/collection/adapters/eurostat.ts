/**
 * collection/adapters/eurostat.ts - Eurostat 采集适配器
 *
 * 调 fetchEurostatDataPoint 采集成衣价格指数数据点，
 * 转成 RawRecord[] 供 Collector agent 消费。
 */

import type { RawRecord } from "../../spine/types";
import type { IntelligenceSource } from "../../types";
import { fetchEurostatDataPoint } from "../../officialApis";
import type { LiveCollectorConfig } from "../live-collector";

export async function collectEurostat(
  source: IntelligenceSource,
  config: LiveCollectorConfig,
): Promise<RawRecord[]> {
  const fetchImpl = config.fetchImpl;
  const now = (config.now ?? new Date()).toISOString();

  const point = await fetchEurostatDataPoint({
    dataset: "demo_pjan",
    filters: { geo: "DE", sex: "T", age: "TOTAL", time: "2024" },
    fetchImpl,
  });

  return [
    {
      id: `raw-eurostat-${point.dataset}-${point.geography}-${now}`,
      sourceId: source.id,
      fetchedAt: now,
      contentType: "application/json",
      raw: {
        subject: `eurostat_${point.dataset}`,
        claim: `Eurostat ${point.label} for ${point.geography} in ${point.time}`,
        value: point.value,
        unit: "Eurostat dataset native unit",
        period: point.time,
        geography: point.geography,
      },
    },
  ];
}
