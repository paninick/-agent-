/**
 * collection/live-collector.ts - 实时采集调度器
 *
 * 接收 Scout 选出的 sourceId 列表，对每个 sourceId 分发到对应 adapter，
 * adapter 调 officialApis.ts 的 fetch 函数获取真实数据，转成 RawRecord[]。
 *
 * 设计原则：
 *   - 每个 source 独立采集，一个失败不中断其他（partial success）
 *   - 缺 key 的源 graceful skip（skipped_no_key），不抛错
 *   - 未实现的源记录 not_implemented，跳过
 *   - API key 由调用方传入（config），不从模块内读 process.env
 *   - fetchImpl 可注入，测试用 mock
 */

import type { RawRecord } from "../spine/types";
import type { IntelligenceSource } from "../types";
import {
  collectWorldBank,
  collectSecEdgar,
  collectEurostat,
  collectEcbFx,
  collectBls,
  collectFred,
  collectCensus,
  collectOpenSupplyHub,
  collectComtrade,
} from "./adapters";

/** 采集配置 - API keys 和注入点 */
export interface LiveCollectorConfig {
  /** FRED API key（缺则 skip） */
  fredApiKey?: string;
  /** US Census API key（缺则 skip） */
  censusApiKey?: string;
  /** Open Supply Hub API key（缺则 skip） */
  openSupplyHubApiKey?: string;
  /** UN Comtrade API key（缺则 skip） */
  comtradeApiKey?: string;
  /** fetch 实现（测试用 mock；不传则用全局 fetch） */
  fetchImpl?: typeof fetch;
  /** 注入 now 以保证测试可复现 */
  now?: Date;
  /** 单源采集超时毫秒（默认 15000；测试可缩短） */
  sourceTimeoutMs?: number;
}

/** 采集日志条目 */
export interface CollectionLogEntry {
  sourceId: string;
  status: "collected" | "skipped_no_key" | "failed" | "not_implemented";
  recordCount: number;
  error?: string;
}

/** 采集结果 */
export interface LiveCollectResult {
  rawRecords: RawRecord[];
  collectionLog: CollectionLogEntry[];
}

/** sourceId -> adapter 映射表 */
const ADAPTER_MAP: Record<string, (source: IntelligenceSource, config: LiveCollectorConfig) => Promise<RawRecord[]>> = {
  "world-bank": collectWorldBank,
  "sec-edgar": collectSecEdgar,
  "eurostat": collectEurostat,
  "ecb-eurofxref": collectEcbFx,
  "bls-public-api": collectBls,
  "fred": collectFred,
  "us-census-trade": collectCensus,
  "open-supply-hub": collectOpenSupplyHub,
  "un-comtrade": collectComtrade,
};

/** 需要 key 的 sourceId 集合 */
const KEY_REQUIRED = new Set(["fred", "us-census-trade", "open-supply-hub", "un-comtrade"]);

/** 检查 config 是否有该 sourceId 的 key */
function hasKey(sourceId: string, config: LiveCollectorConfig): boolean {
  switch (sourceId) {
    case "fred": return Boolean(config.fredApiKey);
    case "us-census-trade": return Boolean(config.censusApiKey);
    case "open-supply-hub": return Boolean(config.openSupplyHubApiKey);
    case "un-comtrade": return Boolean(config.comtradeApiKey);
    default: return true;
  }
}

/** 单源采集超时（毫秒） */
const DEFAULT_SOURCE_TIMEOUT_MS = 15_000;

/**
 * 对 Scout 选出的来源列表执行实时采集。
 *
 * v2 并行版：所有可采集的源通过 Promise.all 并行执行，
 * 每个源独立 15s 超时（AbortController），一个源超时/失败不阻塞其他源。
 *
 * @param sourceIds Scout 匹配出的候选来源 ID
 * @param registrySources 来源注册表（用于查找 IntelligenceSource 对象）
 * @param config 采集配置（API keys + fetchImpl + now）
 * @returns 采集结果（rawRecords + collectionLog）
 */
export async function collectFromSources(
  sourceIds: string[],
  registrySources: IntelligenceSource[],
  config: LiveCollectorConfig,
): Promise<LiveCollectResult> {
  const collectionLog: CollectionLogEntry[] = [];
  const sourceTimeoutMs = config.sourceTimeoutMs ?? DEFAULT_SOURCE_TIMEOUT_MS;

  // 1. 同步过滤：分类每个源的状态
  interface PendingSource {
    sourceId: string;
    source: IntelligenceSource;
    adapter: (source: IntelligenceSource, config: LiveCollectorConfig) => Promise<RawRecord[]>;
  }
  const pendingSources: PendingSource[] = [];

  for (const sourceId of sourceIds) {
    const source = registrySources.find((s) => s.id === sourceId);

    // 来源不在注册表
    if (!source) {
      collectionLog.push({ sourceId, status: "not_implemented", recordCount: 0, error: "source not in registry" });
      continue;
    }

    // 来源无 adapter
    const adapter = ADAPTER_MAP[sourceId];
    if (!adapter) {
      collectionLog.push({ sourceId, status: "not_implemented", recordCount: 0 });
      continue;
    }

    // 缺 key
    if (KEY_REQUIRED.has(sourceId) && !hasKey(sourceId, config)) {
      collectionLog.push({ sourceId, status: "skipped_no_key", recordCount: 0 });
      continue;
    }

    pendingSources.push({ sourceId, source, adapter });
  }

  // 2. 并行采集：每个源独立超时，互不阻塞
  const results = await Promise.all(
    pendingSources.map(async ({ sourceId, source, adapter }): Promise<{ sourceId: string; records: RawRecord[] | null; error?: string }> => {
      // 用 AbortController 做超时（adapter 内部 fetch 应尊重 signal）
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), sourceTimeoutMs);
      try {
        // 注入 signal 到 config.fetchImpl（如果 fetchImpl 支持）
        const configWithSignal: LiveCollectorConfig = {
          ...config,
          fetchImpl: config.fetchImpl
            ? ((input: string | URL | Request, init?: RequestInit) =>
                config.fetchImpl!(input, { ...init, signal: init?.signal ?? controller.signal })) as typeof fetch
            : ((input: string | URL | Request, init?: RequestInit) =>
                fetch(input, { ...init, signal: init?.signal ?? controller.signal })) as typeof fetch,
        };
        // 双保险：Promise.race 确保即使 fetchImpl 忽略 signal 也能超时
        const records = await Promise.race([
          adapter(source, configWithSignal),
          new Promise<RawRecord[]>((_, reject) => {
            timer; // 引用 timer 避免被 GC
            setTimeout(() => reject(new Error(`source_timeout_${sourceId}_${sourceTimeoutMs}ms`)), sourceTimeoutMs);
          }),
        ]);
        return { sourceId, records };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { sourceId, records: null, error: message };
      } finally {
        clearTimeout(timer);
      }
    }),
  );

  // 3. 汇总结果
  const rawRecords: RawRecord[] = [];
  for (const { sourceId, records, error } of results) {
    if (records !== null) {
      rawRecords.push(...records);
      collectionLog.push({ sourceId, status: "collected", recordCount: records.length });
    } else {
      collectionLog.push({ sourceId, status: "failed", recordCount: 0, error });
    }
  }

  return { rawRecords, collectionLog };
}

/**
 * 从 process.env 构造采集配置。
 * 调用方负责调用此函数并传入 keys - 模块本身不读 env。
 */
export function configFromEnv(env: Record<string, string | undefined>): LiveCollectorConfig {
  return {
    fredApiKey: env.FRED_API_KEY,
    censusApiKey: env.CENSUS_API_KEY,
    openSupplyHubApiKey: env.OPEN_SUPPLY_HUB_API_KEY,
    comtradeApiKey: env.UN_COMTRADE_API_KEY,
  };
}
