/**
 * collection/adapters/world-bank.ts - World Bank 采集适配器
 *
 * 调 fetchWorldBankIndicator 采集 3 个服装行业相关指标（GDP / 关税 / 劳动力），
 * 转成 RawRecord[] 供 Collector agent 消费。
 */

import type { RawRecord } from "../../spine/types";
import type { IntelligenceSource } from "../../types";
import { fetchWorldBankIndicator } from "../../officialApis";
import type { LiveCollectorConfig } from "../live-collector";

export async function collectWorldBank(
  source: IntelligenceSource,
  config: LiveCollectorConfig,
): Promise<RawRecord[]> {
  const fetchImpl = config.fetchImpl;
  const now = (config.now ?? new Date()).toISOString();

  const indicators = [
    { country: "VNM", indicator: "NY.GDP.MKTP.CD", subject: "gdp_vietnam", claim: "Vietnam GDP (current USD) from World Bank", unit: "USD" },
    { country: "VNM", indicator: "TM.TAX.MRCH.WM.AR.ZS", subject: "tariff_vietnam", claim: "Vietnam tariff rate (applied weighted mean) from World Bank", unit: "%" },
    { country: "BGD", indicator: "SL.TLF.CACT.FE.ZS", subject: "labor_bangladesh", claim: "Bangladesh female labor force participation rate from World Bank", unit: "%" },
  ];

  const records: RawRecord[] = [];
  for (const spec of indicators) {
    const point = await fetchWorldBankIndicator({ ...spec, fetchImpl });
    records.push({
      id: `raw-wb-${spec.country}-${spec.subject}-${now}`,
      sourceId: source.id,
      fetchedAt: now,
      contentType: "application/json",
      raw: {
        subject: spec.subject,
        claim: spec.claim,
        value: point.value,
        unit: point.unit ?? spec.unit,
        period: point.date,
        geography: point.country,
      },
    });
  }
  return records;
}
