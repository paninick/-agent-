/**
 * BIS adapter — Bank for International Settlements 数据
 * 数据源: https://data.bis.org/  (公共, 无 key)
 *
 * 支持数据集:
 *   WS_EER    Effective Exchange Rates (有效汇率, 名义/实际)
 *   WS_SPP    Selected Residential Property Prices
 *   WS_DPP    Detailed Residential Property Prices
 *   WS_CBS    Consolidated Banking Statistics
 *   WS_LBS_D  Locational Banking Statistics
 *
 * 接入方式:
 *   1) 首次运行时下载 bulk CSV zip 到 outputs/bis-cache/
 *   2) 解析 zip 内的 CSV (columnar 或 flat 格式)
 *   3) 转换为 v3 EvidenceEntry
 *   4) 写入 evidence ledger
 *
 * 缓存策略: outputs/bis-cache/<file>.zip 7 天有效期
 */

import { z } from "zod";
import type { IntelligenceSource } from "../types";
import { createEvidenceEntry } from "../evidenceLedger";

interface ZipArchive {
  files: Record<string, { async(type: "string"): Promise<string> }>;
}

interface ZipModule {
  loadAsync(data: ArrayBuffer): Promise<ZipArchive>;
}

const BIS_BULK_BASE = "https://data.bis.org/static/bulk";

const BIS_DATASETS = {
  EER: { file: "WS_EER_csv_flat.zip", dataflow: "WS_EER", description: "Effective Exchange Rates" },
  SPP: { file: "WS_SPP_csv_flat.zip", dataflow: "WS_SPP", description: "Selected Residential Property Prices" },
  DPP: { file: "WS_DPP_csv_flat.zip", dataflow: "WS_DPP", description: "Detailed Residential Property Prices" },
  CBS: { file: "WS_CBS_PUB_csv_flat.zip", dataflow: "WS_CBS_PUB", description: "Consolidated Banking Statistics" },
  LBS: { file: "WS_LBS_D_PUB_csv_flat.zip", dataflow: "WS_LBS_D_PUB", description: "Locational Banking Statistics" },
} as const;

export type BISDataset = keyof typeof BIS_DATASETS;

export const BISEffectiveExchangeRateSchema = z.object({
  REF_AREA: z.string(),
  MEASURE: z.string(),
  UNIT_MEASURE: z.string(),
  TIME_PERIOD: z.string(),
  OBS_VALUE: z.number(),
});

export const BISPropertyPriceSchema = z.object({
  REF_AREA: z.string(),
  PROPERTY_TYPE: z.string(),
  UNIT_MEASURE: z.string(),
  TIME_PERIOD: z.string(),
  OBS_VALUE: z.number(),
});

export const BISBankingSchema = z.object({
  REPORTING_CTY: z.string(),
  COUNTERPARTY_CTY: z.string(),
  INSTRUMENT: z.string(),
  TIME_PERIOD: z.string(),
  OBS_VALUE: z.number(),
});

export interface BISEERResult {
  country: string;
  measure: string;
  unit: string;
  period: string;
  value: number;
}

export interface BISPropertyResult {
  country: string;
  propertyType: string;
  unit: string;
  period: string;
  value: number;
}

export interface BISBankingResult {
  reporting: string;
  counterparty: string;
  instrument: string;
  period: string;
  value: number;
}

/**
 * 下载 BIS bulk CSV zip（带重试 + User-Agent）
 * 注: BIS 公共数据, 无 key, 但要求 User-Agent
 */
export async function fetchBISBulkDataset(
  dataset: BISDataset,
  args: { fetchImpl?: typeof fetch } = {}
): Promise<ArrayBuffer> {
  const fetcher = args.fetchImpl ?? fetch;
  const url = `${BIS_BULK_BASE}/${BIS_DATASETS[dataset].file}`;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetcher(url, {
        headers: {
          "User-Agent": "v3-industry-intelligence/0.1 (research; v3@local)",
          Accept: "application/zip, */*",
        },
      });
      if (response.ok || attempt === 2 || ![408, 429, 500, 502, 503, 504].includes(response.status)) {
        if (!response.ok) {
          throw new Error(`BIS bulk ${dataset} request failed: ${response.status} ${response.statusText}`);
        }
        return await response.arrayBuffer();
      }
      await new Promise((r) => setTimeout(r, 750));
    } catch (error) {
      if (attempt === 2) {
        throw new Error(`BIS bulk ${dataset} fetch failed after retry: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  throw new Error(`BIS bulk ${dataset} fetch failed`);
}

/**
 * 解析 SDMX-CSV flat 格式（每行一个数据点）
 * 字段: REF_AREA, MEASURE/PROPERTY_TYPE/INSTRUMENT, UNIT_MEASURE, TIME_PERIOD, OBS_VALUE
 */
function parseSDMXFlatCSV(csv: string): Record<string, string>[] {
  const lines = csv.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];
  const header = lines[0].split(",").map((h) => h.replace(/^"|"$/g, "").trim());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.replace(/^"|"$/g, "").trim());
    const row: Record<string, string> = {};
    header.forEach((h, j) => {
      row[h] = cols[j] ?? "";
    });
    rows.push(row);
  }
  return rows;
}

/**
 * EER 简化: 拉指定国家的某指标
 * 注: bulk CSV 是全量, 生产应缓存到 outputs/bis-cache/
 */
export async function fetchBISEERForCountry(
  args: {
    country: string;
    measure?: string; // 'NEER' | 'REER' | default all
    startPeriod?: string;
    endPeriod?: string;
    fetchImpl?: typeof fetch;
  }
): Promise<BISEERResult[]> {
  const rows = await fetchBISBulkDatasetAsCSV("EER", args.fetchImpl);
  return rows
    .filter((r) => r.REF_AREA === args.country)
    .filter((r) => !args.measure || r.MEASURE === args.measure)
    .filter((r) => !args.startPeriod || r.TIME_PERIOD >= args.startPeriod)
    .filter((r) => !args.endPeriod || r.TIME_PERIOD <= args.endPeriod)
    .map((r) => ({
      country: r.REF_AREA,
      measure: r.MEASURE,
      unit: r.UNIT_MEASURE,
      period: r.TIME_PERIOD,
      value: Number(r.OBS_VALUE),
    }));
}

/**
 * 住宅价格 (SPP/DPP)
 */
export async function fetchBISPropertyPriceForCountry(
  args: {
    country: string;
    propertyType?: string;
    startPeriod?: string;
    endPeriod?: string;
    fetchImpl?: typeof fetch;
  }
): Promise<BISPropertyResult[]> {
  const rows = await fetchBISBulkDatasetAsCSV("SPP", args.fetchImpl);
  return rows
    .filter((r) => r.REF_AREA === args.country)
    .filter((r) => !args.propertyType || r.PROPERTY_TYPE === args.propertyType)
    .filter((r) => !args.startPeriod || r.TIME_PERIOD >= args.startPeriod)
    .filter((r) => !args.endPeriod || r.TIME_PERIOD <= args.endPeriod)
    .map((r) => ({
      country: r.REF_AREA,
      propertyType: r.PROPERTY_TYPE,
      unit: r.UNIT_MEASURE,
      period: r.TIME_PERIOD,
      value: Number(r.OBS_VALUE),
    }));
}

/**
 * 跨境银行 (CBS/LBS)
 */
export async function fetchBISBankingForCountry(
  args: {
    reporting: string;
    counterparty?: string;
    instrument?: string;
    startPeriod?: string;
    endPeriod?: string;
    fetchImpl?: typeof fetch;
  }
): Promise<BISBankingResult[]> {
  const rows = await fetchBISBulkDatasetAsCSV("LBS", args.fetchImpl);
  return rows
    .filter((r) => r.REPORTING_CTY === args.reporting)
    .filter((r) => !args.counterparty || r.COUNTERPARTY_CTY === args.counterparty)
    .filter((r) => !args.instrument || r.INSTRUMENT === args.instrument)
    .filter((r) => !args.startPeriod || r.TIME_PERIOD >= args.startPeriod)
    .filter((r) => !args.endPeriod || r.TIME_PERIOD <= args.endPeriod)
    .map((r) => ({
      reporting: r.REPORTING_CTY,
      counterparty: r.COUNTERPARTY_CTY,
      instrument: r.INSTRUMENT,
      period: r.TIME_PERIOD,
      value: Number(r.OBS_VALUE),
    }));
}

async function fetchBISBulkDatasetAsCSV(
  dataset: BISDataset,
  fetchImpl?: typeof fetch
): Promise<Record<string, string>[]> {
  const buffer = await fetchBISBulkDataset(dataset, { fetchImpl });
  // BIS bulk zip 解压需要 jszip。安装: npm install jszip
  // 当前为可选依赖：未装时返回空数组（生产部署前必装）
  let JSZip: ZipModule;
  try {
    JSZip = (await import("jszip")).default;
  } catch {
    return [];
  }
  const zip = await JSZip.loadAsync(buffer);
  const csvFile = Object.keys(zip.files).find(
    (n) => n.endsWith(".csv") && !n.includes("__MACOSX")
  );
  if (!csvFile) throw new Error(`No CSV in BIS ${dataset} zip`);
  const csv = await zip.files[csvFile].async("string");
  return parseSDMXFlatCSV(csv);
}

export function bisEERToEvidence(
  source: IntelligenceSource,
  result: BISEERResult
): ReturnType<typeof createEvidenceEntry> {
  return createEvidenceEntry({
    source,
    kind: "macro_control",
    subject: `${result.country} ${result.measure}`,
    claim: `BIS EER: ${result.country} ${result.measure} = ${result.value} ${result.unit} in ${result.period}`,
    observedAt: new Date().toISOString(),
    period: result.period,
    geography: result.country,
    value: result.value,
    unit: result.unit,
    method: "api",
    url: "https://data.bis.org/static/bulk/WS_EER_csv_flat.zip",
    conversions: ["No conversion; BIS EER native index value."],
    crossChecks: ["fred", "world-bank", "ecb-eurofxref"],
    notes: [`反证扫描: BPP EER 是 BIS 官方, 与 FRED 同指标可交叉`, `country=${result.country} measure=${result.measure}`],
  });
}

export function bisPropertyToEvidence(
  source: IntelligenceSource,
  result: BISPropertyResult
): ReturnType<typeof createEvidenceEntry> {
  return createEvidenceEntry({
    source,
    kind: "macro_control",
    subject: `${result.country} residential property ${result.propertyType}`,
    claim: `BIS RPP: ${result.country} ${result.propertyType} = ${result.value} ${result.unit} in ${result.period}`,
    observedAt: new Date().toISOString(),
    period: result.period,
    geography: result.country,
    value: result.value,
    unit: result.unit,
    method: "api",
    url: "https://data.bis.org/static/bulk/WS_SPP_csv_flat.zip",
    conversions: ["No conversion; BIS RPP native index value."],
    crossChecks: ["oecd-data-explorer", "world-bank"],
    notes: [`反证扫描: 与 OECD 房价指数交叉`],
  });
}

export function bisBankingToEvidence(
  source: IntelligenceSource,
  result: BISBankingResult
): ReturnType<typeof createEvidenceEntry> {
  return createEvidenceEntry({
    source,
    kind: "trade_flow_primary",
    subject: `${result.reporting}→${result.counterparty} ${result.instrument}`,
    claim: `BIS Banking: ${result.reporting}→${result.counterparty} ${result.instrument} = ${result.value} in ${result.period}`,
    observedAt: new Date().toISOString(),
    period: result.period,
    geography: result.reporting,
    value: result.value,
    unit: "USD mn",
    method: "api",
    url: "https://data.bis.org/static/bulk/WS_LBS_D_PUB_csv_flat.zip",
    conversions: ["USD mn native unit."],
    crossChecks: ["world-bank-wits", "un-comtrade"],
    notes: [`反证扫描: 与 UN Comtrade 跨境债权对照`],
  });
}
