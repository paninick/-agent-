/**
 * collection/adapters/ecb-fx.ts - ECB 汇率采集适配器
 *
 * 调 fetchEcbEuroReferenceRates 采集 ECB 欧元参考汇率（含 USD / JPY），
 * 转成 RawRecord[] 供 Collector agent 消费。
 */

import type { RawRecord } from "../../spine/types";
import type { IntelligenceSource } from "../../types";
import { fetchEcbEuroReferenceRates } from "../../officialApis";
import type { LiveCollectorConfig } from "../live-collector";

export async function collectEcbFx(
  source: IntelligenceSource,
  config: LiveCollectorConfig,
): Promise<RawRecord[]> {
  const fetchImpl = config.fetchImpl;
  const now = (config.now ?? new Date()).toISOString();

  const rates = await fetchEcbEuroReferenceRates({ fetchImpl });

  const usdJpyCross = rates.rates.USD ? rates.rates.JPY / rates.rates.USD : undefined;

  return [
    {
      id: `raw-ecb-fx-${rates.date}-${now}`,
      sourceId: source.id,
      fetchedAt: now,
      contentType: "application/xml",
      raw: {
        subject: "eur_fx_rates",
        claim: `ECB EUR reference rates for ${Object.keys(rates.rates).length} currencies on ${rates.date}`,
        value: `USD=${rates.rates.USD};JPY=${rates.rates.JPY};USDJPY_cross=${usdJpyCross ?? "N/A"}`,
        unit: "EUR base reference rates",
        period: rates.date,
        geography: "Eurozone",
      },
    },
  ];
}
