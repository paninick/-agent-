import type { EvidenceEntry, IntelligenceSource } from "./types";
import { createEvidenceEntry } from "./evidenceLedger";

type JsonRecord = Record<string, unknown>;
type SecUnitFact = JsonRecord & { val: number };

export interface WorldBankIndicatorPoint {
  country: string;
  indicator: string;
  date: string;
  value: number;
  unit?: string;
}

export interface SecCompanyFactsSummary {
  cik: string;
  entityName: string;
  factCount: number;
  taxonomyCount: number;
}

export interface SecCompanyMetric {
  canonicalName: "revenue" | "grossProfit" | "costOfGoodsSold" | "inventory" | "operatingIncome";
  tag: string;
  label?: string;
  unit: string;
  value: number;
  fy?: number;
  fp?: string;
  form?: string;
  filed?: string;
  end?: string;
}

export interface SecCompanyMetricSet {
  cik: string;
  entityName: string;
  metrics: SecCompanyMetric[];
  derived: {
    grossMargin?: number;
    inventoryToRevenue?: number;
  };
}

export interface EurostatDataPoint {
  dataset: string;
  label: string;
  source: string;
  updated?: string;
  geography: string;
  time: string;
  value: number;
}

export interface FredSeriesPoint {
  seriesId: string;
  date: string;
  value: number;
}

export interface BlsSeriesPoint {
  seriesId: string;
  year: string;
  period: string;
  periodName: string;
  value: number;
}

export interface OpenSupplyHubSearchSummary {
  query: string;
  count: number;
  firstFacilityName?: string;
  firstFacilityId?: string;
}

export interface ComtradeFlowSummary {
  reporterCode: string;
  partnerCode: string;
  commodityCode: string;
  period: string;
  recordCount: number;
  tradeValue?: number;
}

export interface EcbFxRates {
  date: string;
  base: "EUR";
  rates: Record<string, number>;
}

export interface UsCensusTradeRecord {
  time: string;
  countryCode: string;
  countryName: string;
  commodityCode: string;
  commodityDescription: string;
  monthlyGeneralImportValue: number;
  yearToDateGeneralImportValue: number;
}

export async function fetchWorldBankIndicator(args: {
  country: string;
  indicator: string;
  fetchImpl?: typeof fetch;
}): Promise<WorldBankIndicatorPoint> {
  const fetcher = args.fetchImpl ?? fetch;
  const url = `https://api.worldbank.org/v2/country/${encodeURIComponent(args.country)}/indicator/${encodeURIComponent(
    args.indicator
  )}?format=json&per_page=8`;
  const response = await fetchWithRetry(fetcher, url, undefined, "World Bank");
  if (!response.ok) {
    throw new Error(`World Bank request failed: ${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as unknown;
  if (!Array.isArray(payload) || !Array.isArray(payload[1])) {
    throw new Error("World Bank response shape changed");
  }

  const dataRows = payload[1].filter(isRecord);
  const latest = dataRows.find((row) => numberField(row, "value") !== undefined);
  if (!latest) {
    throw new Error(`World Bank returned no numeric values for ${args.country}/${args.indicator}`);
  }
  const country = recordField(latest, "country");
  const indicator = recordField(latest, "indicator");
  const value = numberField(latest, "value");
  if (value === undefined) {
    throw new Error(`World Bank returned no numeric values for ${args.country}/${args.indicator}`);
  }

  return {
    country: stringValueField(country, "value", args.country),
    indicator: stringValueField(indicator, "value", args.indicator),
    date: stringValueField(latest, "date", "unknown"),
    value,
    unit: stringField(latest, "unit")
  };
}

export async function fetchEcbEuroReferenceRates(args: { fetchImpl?: typeof fetch } = {}): Promise<EcbFxRates> {
  const fetcher = args.fetchImpl ?? fetch;
  const response = await fetchWithRetry(
    fetcher,
    "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml",
    undefined,
    "ECB"
  );
  if (!response.ok) {
    throw new Error(`ECB request failed: ${response.status} ${response.statusText}`);
  }

  const xml = await response.text();
  const date = xml.match(/<Cube\s+time=["']([^"']+)["']>/)?.[1];
  if (!date) {
    throw new Error("ECB response did not include a reference-rate date");
  }

  const rates: Record<string, number> = {};
  const ratePattern = /<Cube\s+currency=["']([A-Z]{3})["']\s+rate=["']([0-9.]+)["']\s*\/>/g;
  for (const match of xml.matchAll(ratePattern)) {
    rates[match[1]] = Number(match[2]);
  }
  if (!Number.isFinite(rates.USD) || !Number.isFinite(rates.JPY)) {
    throw new Error("ECB response did not include USD and JPY reference rates");
  }

  return { date, base: "EUR", rates };
}

export async function fetchEurostatDataPoint(args: {
  dataset: string;
  filters: Record<string, string>;
  fetchImpl?: typeof fetch;
}): Promise<EurostatDataPoint> {
  const fetcher = args.fetchImpl ?? fetch;
  const params = new URLSearchParams(args.filters);
  const url = `https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/${encodeURIComponent(
    args.dataset
  )}?${params.toString()}`;
  const response = await fetchWithRetry(fetcher, url, undefined, "Eurostat");
  if (!response.ok) {
    throw new Error(`Eurostat request failed: ${response.status} ${response.statusText}`);
  }

  const payload = requireJsonRecord(await response.json(), "Eurostat");
  const values = Object.values(recordField(payload, "value") ?? {});
  const firstValue = values.find((value) => typeof value === "number");
  if (typeof firstValue !== "number") {
    throw new Error(`Eurostat returned no numeric value for ${args.dataset}`);
  }

  return {
    dataset: args.dataset,
    label: stringValueField(payload, "label", args.dataset),
    source: stringValueField(payload, "source", "ESTAT"),
    updated: stringField(payload, "updated"),
    geography: args.filters.geo ?? "unknown",
    time: args.filters.time ?? "unknown",
    value: firstValue
  };
}

export async function fetchUsCensusImportHs(args: {
  apiKey: string;
  time: string;
  commodityCode: string;
  countryCode: string;
  fetchImpl?: typeof fetch;
}): Promise<UsCensusTradeRecord> {
  const fetcher = args.fetchImpl ?? fetch;
  const params = new URLSearchParams({
    get: "CTY_CODE,CTY_NAME,I_COMMODITY,I_COMMODITY_SDESC,GEN_VAL_MO,GEN_VAL_YR",
    time: args.time,
    I_COMMODITY: args.commodityCode,
    CTY_CODE: args.countryCode,
    key: args.apiKey
  });
  const response = await fetchWithRetry(
    fetcher,
    `https://api.census.gov/data/timeseries/intltrade/imports/hs?${params.toString()}`,
    undefined,
    "U.S. Census International Trade"
  );
  const contentType = response.headers.get("content-type") ?? "";
  if (!response.ok || !contentType.includes("json")) {
    const body = await response.text();
    throw new Error(
      `U.S. Census International Trade request failed or returned non-JSON: ${response.status} ${body.slice(0, 80)}`
    );
  }

  const payload = (await response.json()) as unknown;
  if (!Array.isArray(payload) || payload.length < 2 || !Array.isArray(payload[0]) || !Array.isArray(payload[1])) {
    throw new Error("U.S. Census International Trade response shape changed");
  }

  const headers = payload[0] as string[];
  const row = payload[1] as string[];
  const valueOf = (name: string) => row[headers.indexOf(name)];

  return {
    time: valueOf("time"),
    countryCode: valueOf("CTY_CODE"),
    countryName: valueOf("CTY_NAME"),
    commodityCode: valueOf("I_COMMODITY"),
    commodityDescription: valueOf("I_COMMODITY_SDESC"),
    monthlyGeneralImportValue: Number(valueOf("GEN_VAL_MO")),
    yearToDateGeneralImportValue: Number(valueOf("GEN_VAL_YR"))
  };
}

export async function fetchSecCompanyFactsSummary(args: {
  cik: string;
  fetchImpl?: typeof fetch;
}): Promise<SecCompanyFactsSummary> {
  const cik = args.cik.padStart(10, "0");
  const payload = await fetchSecCompanyFactsPayload({ cik, fetchImpl: args.fetchImpl });
  const facts = recordField(payload, "facts") ?? {};
  const taxonomyKeys = Object.keys(facts);
  const factCount = taxonomyKeys.reduce((total, taxonomy) => total + Object.keys(recordField(facts, taxonomy) ?? {}).length, 0);

  return {
    cik,
    entityName: stringValueField(payload, "entityName", "unknown"),
    factCount,
    taxonomyCount: taxonomyKeys.length
  };
}

export async function fetchSecCompanyMetricSet(args: {
  cik: string;
  fetchImpl?: typeof fetch;
}): Promise<SecCompanyMetricSet> {
  const cik = args.cik.padStart(10, "0");
  const payload = await fetchSecCompanyFactsPayload({ cik, fetchImpl: args.fetchImpl });
  const usGaap = recordField(recordField(payload, "facts"), "us-gaap") ?? {};
  const metrics = [
    selectSecMetric(usGaap, "revenue", ["Revenues", "SalesRevenueNet"]),
    selectSecMetric(usGaap, "grossProfit", ["GrossProfit"]),
    selectSecMetric(usGaap, "costOfGoodsSold", ["CostOfGoodsAndServicesSold", "CostOfMerchandiseSalesBuyingAndOccupancyCosts"]),
    selectSecMetric(usGaap, "inventory", ["InventoryFinishedGoodsNetOfReserves", "InventoryFinishedGoods"]),
    selectSecMetric(usGaap, "operatingIncome", ["OperatingIncomeLoss"])
  ].filter((metric): metric is SecCompanyMetric => Boolean(metric));

  const revenue = metrics.find((metric) => metric.canonicalName === "revenue")?.value;
  const grossProfit = metrics.find((metric) => metric.canonicalName === "grossProfit")?.value;
  const inventory = metrics.find((metric) => metric.canonicalName === "inventory")?.value;

  return {
    cik,
    entityName: stringValueField(payload, "entityName", "unknown"),
    metrics,
    derived: {
      grossMargin: revenue && grossProfit ? roundNumber(grossProfit / revenue) : undefined,
      inventoryToRevenue: revenue && inventory ? roundNumber(inventory / revenue) : undefined
    }
  };
}

export async function fetchFredLatestObservation(args: {
  seriesId: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
}): Promise<FredSeriesPoint> {
  const fetcher = args.fetchImpl ?? fetch;
  const params = new URLSearchParams({
    series_id: args.seriesId,
    api_key: args.apiKey,
    file_type: "json",
    sort_order: "desc",
    limit: "8"
  });
  const response = await fetchWithRetry(
    fetcher,
    `https://api.stlouisfed.org/fred/series/observations?${params.toString()}`,
    undefined,
    "FRED"
  );
  if (!response.ok) {
    throw new Error(`FRED request failed: ${response.status} ${response.statusText}`);
  }

  const payload = requireJsonRecord(await response.json(), "FRED");
  const latest = recordArrayField(payload, "observations").find((row) => {
    const value = row.value;
    return value !== undefined && value !== null && value !== ".";
  });
  if (!latest) {
    throw new Error(`FRED returned no numeric observations for ${args.seriesId}`);
  }

  return {
    seriesId: args.seriesId,
    date: stringValueField(latest, "date", "unknown"),
    value: Number(latest.value)
  };
}

export async function fetchBlsLatestSeriesPoint(args: {
  seriesId: string;
  startYear: number;
  endYear: number;
  fetchImpl?: typeof fetch;
}): Promise<BlsSeriesPoint> {
  const fetcher = args.fetchImpl ?? fetch;
  const url = `https://api.bls.gov/publicAPI/v2/timeseries/data/${encodeURIComponent(args.seriesId)}?${new URLSearchParams(
    {
      startyear: String(args.startYear),
      endyear: String(args.endYear)
    }
  ).toString()}`;
  const response = await fetchWithRetry(fetcher, url, undefined, "BLS");
  if (!response.ok) {
    throw new Error(`BLS request failed: ${response.status} ${response.statusText}`);
  }

  const payload = requireJsonRecord(await response.json(), "BLS");
  const status = stringField(payload, "status");
  if (status && status !== "REQUEST_SUCCEEDED") {
    const messageValue = payload.message;
    const messages = Array.isArray(messageValue) ? messageValue.map(String).join("; ") : String(messageValue ?? "");
    throw new Error(`BLS request did not succeed: ${status}${messages ? ` ${messages}` : ""}`);
  }

  const series = recordArrayField(recordField(payload, "Results"), "series")[0];
  const latest = recordArrayField(series, "data").find(
    (row) => stringField(row, "period") !== "M13" && Number.isFinite(Number(row.value))
  );
  if (!latest) {
    throw new Error(`BLS returned no numeric observations for ${args.seriesId}`);
  }

  return {
    seriesId: stringValueField(series, "seriesID", args.seriesId),
    year: stringValueField(latest, "year", "unknown"),
    period: stringValueField(latest, "period", "unknown"),
    periodName: stringValueField(latest, "periodName", stringValueField(latest, "period", "unknown")),
    value: Number(latest.value)
  };
}

export async function fetchOpenSupplyHubSearch(args: {
  query: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
}): Promise<OpenSupplyHubSearchSummary> {
  const fetcher = args.fetchImpl ?? fetch;
  const params = new URLSearchParams({ q: args.query, pageSize: "1" });
  const response = await fetchWithRetry(
    fetcher,
    `https://opensupplyhub.org/api/facilities/?${params.toString()}`,
    {
      headers: {
        Authorization: `Token ${args.apiKey}`,
        Accept: "application/json"
      }
    },
    "Open Supply Hub"
  );
  if (!response.ok) {
    throw new Error(`Open Supply Hub request failed: ${response.status} ${response.statusText}`);
  }

  const payload = requireJsonRecord(await response.json(), "Open Supply Hub");
  const features = recordArrayField(payload, "features");
  const results = features.length > 0 ? features : recordArrayField(payload, "results");
  const firstRow = results[0];
  const first = recordField(firstRow, "properties") ?? firstRow ?? {};
  const count = numberField(payload, "count") ?? Number(payload.count ?? results.length);

  return {
    query: args.query,
    count,
    firstFacilityName: stringField(first, "name"),
    firstFacilityId: stringField(first, "os_id") ?? stringField(first, "id")
  };
}

export async function fetchComtradeFlowSummary(args: {
  reporterCode: string;
  partnerCode: string;
  commodityCode: string;
  period: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
}): Promise<ComtradeFlowSummary> {
  const fetcher = args.fetchImpl ?? fetch;
  const params = new URLSearchParams({
    reporterCode: args.reporterCode,
    partnerCode: args.partnerCode,
    cmdCode: args.commodityCode,
    flowCode: "M",
    period: args.period
  });
  const response = await fetchWithRetry(
    fetcher,
    `https://comtradeapi.un.org/data/v1/get/C/A/HS?${params.toString()}`,
    {
      headers: {
        "Ocp-Apim-Subscription-Key": args.apiKey,
        Accept: "application/json"
      }
    },
    "UN Comtrade"
  );
  if (!response.ok) {
    throw new Error(`UN Comtrade request failed: ${response.status} ${response.statusText}`);
  }

  const payload = requireJsonRecord(await response.json(), "UN Comtrade");
  const dataRows = recordArrayField(payload, "data");
  const rows = dataRows.length > 0 ? dataRows : recordArrayField(payload, "Data");
  const first = rows[0] ?? {};

  return {
    reporterCode: args.reporterCode,
    partnerCode: args.partnerCode,
    commodityCode: args.commodityCode,
    period: args.period,
    recordCount: rows.length,
    tradeValue: numberField(first, "primaryValue")
  };
}

async function fetchWithRetry(
  fetcher: typeof fetch,
  input: string,
  init: RequestInit | undefined,
  label: string
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetcher(input, init);
      if (response.ok || attempt === 2 || ![408, 429, 500, 502, 503, 504].includes(response.status)) {
        return response;
      }
      lastError = new Error(`${label} temporary HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
      if (attempt === 2) break;
    }
    await new Promise((resolve) => setTimeout(resolve, 750));
  }

  const detail = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`${label} fetch failed after retry: ${detail}`);
}

export function worldBankPointToEvidence(source: IntelligenceSource, point: WorldBankIndicatorPoint): EvidenceEntry {
  return createEvidenceEntry({
    source,
    kind: "macro_control",
    subject: `${point.country} ${point.indicator}`,
    claim: `${point.country} has an official World Bank value for ${point.indicator} in ${point.date}`,
    observedAt: new Date().toISOString(),
    period: point.date,
    geography: point.country,
    value: point.value,
    unit: point.unit || "World Bank indicator native unit",
    method: "api",
    url: "https://api.worldbank.org/v2/",
    conversions: ["No unit conversion applied; preserve World Bank native indicator unit."],
    crossChecks: ["fred", "ilo", "national_statistics"],
    notes: ["反证扫描: compare against national statistics or IMF/OECD before using as a hard business conclusion."]
  });
}

export function ecbFxRatesToEvidence(source: IntelligenceSource, rates: EcbFxRates): EvidenceEntry {
  const usdJpyCross = rates.rates.JPY / rates.rates.USD;
  return createEvidenceEntry({
    source,
    kind: "macro_control",
    subject: "EUR reference FX rates",
    claim: `ECB exposes EUR reference rates for ${Object.keys(rates.rates).length} currencies on ${rates.date}`,
    observedAt: new Date().toISOString(),
    period: rates.date,
    value: `USD=${rates.rates.USD};JPY=${rates.rates.JPY};USDJPY_cross=${roundNumber(usdJpyCross)}`,
    unit: "EUR base reference rates",
    method: "api",
    url: "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml",
    conversions: ["USD/JPY cross-rate derived as ECB JPY per EUR divided by USD per EUR."],
    crossChecks: ["fred", "central_bank", "world-bank"],
    notes: ["反证扫描: ECB rates are EUR-based reference rates; compare with FRED or market data before pricing decisions."]
  });
}

export function eurostatPointToEvidence(source: IntelligenceSource, point: EurostatDataPoint): EvidenceEntry {
  return createEvidenceEntry({
    source,
    kind: "macro_control",
    subject: `${point.geography} ${point.label}`,
    claim: `Eurostat exposes ${point.label} for ${point.geography} in ${point.time}`,
    observedAt: new Date().toISOString(),
    period: point.time,
    geography: point.geography,
    value: point.value,
    unit: "Eurostat dataset native unit",
    method: "api",
    url: `https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/${point.dataset}`,
    conversions: ["No unit conversion applied; preserve Eurostat JSON-stat native unit."],
    crossChecks: ["world-bank", "national_statistics"],
    notes: ["反证扫描: verify dataset dimensions before using this macro context in a brand-level conclusion."]
  });
}

export function usCensusTradeToEvidence(source: IntelligenceSource, record: UsCensusTradeRecord): EvidenceEntry {
  return createEvidenceEntry({
    source,
    kind: "trade_flow_primary",
    subject: `${record.countryName} ${record.commodityCode}`,
    claim: `U.S. Census reports HS ${record.commodityCode} imports from ${record.countryName} in ${record.time}`,
    observedAt: new Date().toISOString(),
    period: record.time,
    geography: "United States",
    value: record.monthlyGeneralImportValue,
    unit: "monthly general import value USD",
    method: "api",
    url: "https://api.census.gov/data/timeseries/intltrade/imports/hs",
    conversions: ["No FOB/CIF or quantity conversion applied; preserve Census GEN_VAL_MO USD field."],
    crossChecks: ["usitc-dataweb", "un-comtrade", "company_financials"],
    notes: ["反证扫描: mirror with exporter-side customs and quantity units before brand or supplier shipment conclusions."]
  });
}

export function secFactsToEvidence(source: IntelligenceSource, summary: SecCompanyFactsSummary): EvidenceEntry {
  return createEvidenceEntry({
    source,
    kind: "financial_primary",
    subject: summary.entityName,
    claim: `${summary.entityName} has structured SEC company facts available`,
    observedAt: new Date().toISOString(),
    geography: "United States",
    value: summary.factCount,
    unit: "structured fact count",
    method: "api",
    url: `https://data.sec.gov/api/xbrl/companyfacts/CIK${summary.cik}.json`,
    conversions: ["No financial unit conversion applied at this health-check stage."],
    crossChecks: ["company_ir", "sec_filings_index"],
    notes: ["反证扫描: facts availability proves data access, not supply-chain truth."]
  });
}

export function secMetricSetToEvidence(source: IntelligenceSource, metricSet: SecCompanyMetricSet): EvidenceEntry {
  const metricSummary = metricSet.metrics
    .map((metric) => `${metric.canonicalName}:${metric.value}${metric.unit ? ` ${metric.unit}` : ""}`)
    .join("; ");
  const derivedSummary = [
    metricSet.derived.grossMargin === undefined ? undefined : `grossMargin=${metricSet.derived.grossMargin}`,
    metricSet.derived.inventoryToRevenue === undefined
      ? undefined
      : `inventoryToRevenue=${metricSet.derived.inventoryToRevenue}`
  ]
    .filter(Boolean)
    .join("; ");

  return createEvidenceEntry({
    source,
    kind: "financial_primary",
    subject: metricSet.entityName,
    claim: `${metricSet.entityName} has SEC XBRL operating metrics for revenue, margin, inventory, and cost-chain analysis`,
    observedAt: new Date().toISOString(),
    geography: "United States",
    value: derivedSummary ? `${metricSummary}; ${derivedSummary}` : metricSummary,
    unit: "SEC XBRL native units",
    method: "api",
    url: `https://data.sec.gov/api/xbrl/companyfacts/CIK${metricSet.cik}.json`,
    conversions: [
      "SEC XBRL USD values preserved.",
      "Gross margin derived as grossProfit / revenue.",
      "Inventory intensity derived as inventory / revenue."
    ],
    crossChecks: ["company_ir", "customs_records", "platform_sales", "supplier_shipments"],
    notes: [
      "反证扫描: financial metrics indicate operating pressure, but do not prove supplier-level shipments without customs and platform checks."
    ]
  });
}

function roundNumber(value: number) {
  return Math.round(value * 10_000) / 10_000;
}

async function fetchSecCompanyFactsPayload(args: { cik: string; fetchImpl?: typeof fetch }): Promise<JsonRecord> {
  const fetcher = args.fetchImpl ?? fetch;
  const cik = args.cik.padStart(10, "0");
  const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;
  const response = await fetchWithRetry(
    fetcher,
    url,
    {
      headers: {
        "User-Agent": "industry-intelligence-agent/0.1 research-contact@example.com",
        Accept: "application/json"
      }
    },
    "SEC EDGAR"
  );
  if (!response.ok) {
    throw new Error(`SEC EDGAR request failed: ${response.status} ${response.statusText}`);
  }
  return requireJsonRecord(await response.json(), "SEC EDGAR");
}

function selectSecMetric(
  usGaap: JsonRecord,
  canonicalName: SecCompanyMetric["canonicalName"],
  candidateTags: string[]
): SecCompanyMetric | undefined {
  for (const tag of candidateTags) {
    const fact = recordField(usGaap, tag);
    if (!fact) continue;
    const units = recordField(fact, "units") ?? {};
    const unitName = Object.keys(units).find((unit) => recordArrayField(units, unit).length > 0);
    if (!unitName) continue;
    const candidates = recordArrayField(units, unitName)
      .filter(isSecUnitFact)
      .sort((a, b) => secMetricSortKey(b) - secMetricSortKey(a));
    const annual =
      candidates.find((item) => stringField(item, "form")?.startsWith("10-K") && stringField(item, "fp") === "FY") ??
      candidates[0];
    if (!annual) continue;
    return {
      canonicalName,
      tag,
      label: stringField(fact, "label"),
      unit: unitName,
      value: annual.val,
      fy: numberField(annual, "fy"),
      fp: stringField(annual, "fp"),
      form: stringField(annual, "form"),
      filed: stringField(annual, "filed"),
      end: stringField(annual, "end")
    };
  }
  return undefined;
}

function secMetricSortKey(item: JsonRecord) {
  const filedValue = stringField(item, "filed");
  const endValue = stringField(item, "end");
  const filed = filedValue ? Date.parse(filedValue) : 0;
  const end = endValue ? Date.parse(endValue) : 0;
  const safeEndDays = Number.isFinite(end) && end > 0 ? Math.floor(end / 86_400_000) : 0;
  const safeFiledDays = Number.isFinite(filed) && filed > 0 ? Math.floor(filed / 86_400_000) : 0;
  return safeEndDays * 100_000 + safeFiledDays;
}

function requireJsonRecord(value: unknown, label: string): JsonRecord {
  if (!isRecord(value)) {
    throw new Error(`${label} response shape changed`);
  }
  return value;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSecUnitFact(value: JsonRecord): value is SecUnitFact {
  return numberField(value, "val") !== undefined;
}

function recordField(record: JsonRecord | undefined, key: string): JsonRecord | undefined {
  if (!record) return undefined;
  const value = record[key];
  return isRecord(value) ? value : undefined;
}

function recordArrayField(record: JsonRecord | undefined, key: string): JsonRecord[] {
  if (!record) return [];
  const value = record[key];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function stringField(record: JsonRecord | undefined, key: string): string | undefined {
  if (!record) return undefined;
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function stringValueField(record: JsonRecord | undefined, key: string, fallback: string): string {
  if (!record) return fallback;
  const value = record[key];
  return value === undefined || value === null ? fallback : String(value);
}

function numberField(record: JsonRecord | undefined, key: string): number | undefined {
  if (!record) return undefined;
  const value = record[key];
  return typeof value === "number" ? value : undefined;
}

export function fredPointToEvidence(source: IntelligenceSource, point: FredSeriesPoint): EvidenceEntry {
  return createEvidenceEntry({
    source,
    kind: "macro_control",
    subject: point.seriesId,
    claim: `FRED exposes a latest observation for ${point.seriesId} on ${point.date}`,
    observedAt: new Date().toISOString(),
    period: point.date,
    value: point.value,
    unit: "FRED series native unit",
    method: "api",
    url: "https://api.stlouisfed.org/fred/series/observations",
    conversions: ["No unit conversion applied; preserve FRED series native unit."],
    crossChecks: ["central_bank", "world-bank"],
    notes: ["反证扫描: compare with central-bank or market-source series before using in cost transmission."]
  });
}

export function blsPointToEvidence(source: IntelligenceSource, point: BlsSeriesPoint): EvidenceEntry {
  return createEvidenceEntry({
    source,
    kind: "market_signal",
    subject: point.seriesId,
    claim: `BLS exposes a latest public series observation for ${point.seriesId} in ${point.year} ${point.period}`,
    observedAt: new Date().toISOString(),
    period: `${point.year}-${point.period}`,
    geography: "United States",
    value: point.value,
    unit: "BLS series native index/value",
    method: "api",
    url: `https://api.bls.gov/publicAPI/v2/timeseries/data/${point.seriesId}`,
    conversions: ["No unit conversion applied; preserve BLS series native index/value."],
    crossChecks: ["fred", "company_financials", "platform_sales", "web_price_monitor"],
    notes: [
      "反证扫描: BLS price or labor series are market context, not proof of brand purchase volume, supplier shipment, or platform orders."
    ]
  });
}

export function openSupplyHubSearchToEvidence(
  source: IntelligenceSource,
  summary: OpenSupplyHubSearchSummary
): EvidenceEntry {
  return createEvidenceEntry({
    source,
    kind: "supplier_identity",
    subject: summary.query,
    claim: `Open Supply Hub returned facility matches for ${summary.query}`,
    observedAt: new Date().toISOString(),
    value: summary.count,
    unit: "facility match count",
    method: "api",
    url: "https://opensupplyhub.org/api/facilities/",
    conversions: ["Facility identity is not a shipment or production quantity; no quantity conversion applied."],
    crossChecks: ["company_registry", "brand_supplier_list", "customs_records"],
    notes: ["反证扫描: OS Hub facility matches are identity leads, not proof of active supplier relationship."]
  });
}

export function comtradeFlowToEvidence(source: IntelligenceSource, summary: ComtradeFlowSummary): EvidenceEntry {
  return createEvidenceEntry({
    source,
    kind: "trade_flow_primary",
    subject: `${summary.reporterCode}-${summary.partnerCode}-${summary.commodityCode}`,
    claim: `UN Comtrade returned ${summary.recordCount} records for reporter ${summary.reporterCode}, partner ${summary.partnerCode}, commodity ${summary.commodityCode} in ${summary.period}`,
    observedAt: new Date().toISOString(),
    period: summary.period,
    value: summary.tradeValue ?? summary.recordCount,
    unit: summary.tradeValue === undefined ? "record count" : "primary trade value",
    method: "api",
    url: "https://comtradeapi.un.org/data/v1/get/C/A/HS",
    conversions: ["Trade values and quantities require FOB/CIF and HS-unit normalization before brand-level use."],
    crossChecks: ["usitc-dataweb", "eurostat", "national_customs"],
    notes: ["反证扫描: mirror with importer-side customs before using as hard shipment conclusion."]
  });
}
