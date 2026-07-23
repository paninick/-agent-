/**
 * client/analysisTypes.ts — Phase 2 分析视图类型定义
 *
 * 三大分析面板的类型与 mock 数据：
 *   1. 采集健康（CollectionHealthPanel）— 9 数据源健康状态
 *   2. 维度覆盖（DimensionCoveragePanel）— 7 维度数据源覆盖
 *   3. 管道阶段（PipelineStagesPanel）— 7 阶段认知流输入输出
 *
 * 对齐后端：
 *   - src/intelligence/adapter-health.ts 的 AdapterHealthStatus / SourceResultStatus
 *   - src/intelligence/collection/live-collector.ts 的 9 个 sourceId
 *   - src/intelligence/swarm/agents/ 的 10 角色（合并为 7 阶段展示）
 *   - src/client/decisionTypes.ts 的 MetricDimension（7 维度）
 */

import type { MetricDimension } from "./decisionTypes";

// ============================================================
// 1. 采集健康 — 9 数据源健康状态
// ============================================================

/** 数据源健康状态（对齐后端 AdapterHealthStatus） */
export type SourceHealthStatus =
  | "healthy"        // ✓ 健康可用
  | "degraded"       // ⚠ 降级（延迟/部分字段缺失）
  | "failed"         // ✗ 失败（凭证无效/Schema 错误）
  | "unavailable";   // ◌ 不可用（缺凭证/未实现/未探测）

/** 单个数据源健康条目 */
export interface SourceHealthEntry {
  sourceId: string;
  name: string;
  tier: "S" | "A+" | "A" | "B" | "C";
  status: SourceHealthStatus;
  /** 采集延迟 ms */
  latencyMs: number;
  /** 最近一次检查时间 ISO */
  lastCheckedAt: string;
  /** 是否需要凭证 */
  credentialRequired: boolean;
  /** 凭证是否存在 */
  credentialPresent: boolean;
  /** 本次采集记录数 */
  recordCount: number;
  /** 覆盖的维度 */
  coverageDimensions: MetricDimension[];
  /** 失败原因（status=failed/unavailable 时） */
  failureReason?: string;
  /** 官方 URL */
  officialUrl: string;
}

/** 采集健康汇总 */
export interface CollectionHealthSummary {
  totalCount: number;
  healthyCount: number;
  degradedCount: number;
  failedCount: number;
  unavailableCount: number;
  /** 总记录数 */
  totalRecords: number;
  /** 平均延迟 ms */
  avgLatencyMs: number;
  /** 凭证缺失数 */
  missingCredentialCount: number;
}

// ============================================================
// 2. 维度覆盖 — 7 维度数据源覆盖
// ============================================================

/** 维度覆盖状态 */
export type DimensionCoverageStatus =
  | "covered"    // ✓ 充分覆盖（≥2 源）
  | "partial"    // ⚠ 部分覆盖（1 源）
  | "gap";       // ✗ 覆盖缺口（0 源）

/** 单个维度的覆盖情况 */
export interface DimensionCoverageEntry {
  dimension: MetricDimension;
  /** 维度中文名 */
  label: string;
  /** 维度图标 */
  icon: string;
  /** 学科基础 */
  discipline: string;
  /** 覆盖状态 */
  status: DimensionCoverageStatus;
  /** 匹配的数据源 ID 列表 */
  matchedSourceIds: string[];
  /** 数据源数量 */
  sourceCount: number;
  /** 缺失说明 */
  missingCoverage: string;
  /** 该维度的关键指标示例 */
  keyMetrics: string[];
}

// ============================================================
// 3. 管道阶段 — 7 阶段认知流
// ============================================================

/** 管道阶段 ID（10 角色合并为 7 阶段展示） */
export type PipelineStageId =
  | "scout"           // 侦察员
  | "collector"       // 采集员
  | "verifier"        // 验证员（含 data-janitor 清洗）
  | "analyst"         // 分析员（含 devils-advocate 反证）
  | "adjudicator"     // 裁决员（含 reconciliation-scorer 对账）
  | "synthesizer"     // 综合员
  | "memory";         // 记忆员

/** 阶段状态 */
export type PipelineStageStatus =
  | "completed"       // ✓ 已完成
  | "running"         // ⏵ 运行中
  | "idle"            // ◌ 待命
  | "failed"          // ✗ 失败
  | "skipped";        // ⊘ 跳过

/** 单个管道阶段 */
export interface PipelineStage {
  stageId: PipelineStageId;
  /** 阶段名（中文） */
  name: string;
  /** 阶段序号 01-07 */
  order: number;
  /** 包含的角色 */
  roles: string[];
  status: PipelineStageStatus;
  /** 输入摘要 */
  inputSummary: string;
  /** 输出摘要 */
  outputSummary: string;
  /** 耗时 ms */
  durationMs: number;
  /** 关键发现 */
  findings: string[];
  /** 产出证据数 */
  evidenceCount: number;
  /** 置信度 0-1 */
  confidence: number;
}

/** 管道汇总 */
export interface PipelineSummary {
  totalStages: number;
  completedStages: number;
  runningStages: number;
  totalDurationMs: number;
  totalEvidence: number;
  overallConfidence: number;
}

// ============================================================
// Mock 数据生成器
// ============================================================

/** 9 数据源健康 mock（对齐后端 sourceId） */
export function createMockCollectionHealth(): SourceHealthEntry[] {
  const now = new Date().toISOString();
  return [
    {
      sourceId: "world-bank",
      name: "World Bank 世界银行",
      tier: "S",
      status: "healthy",
      latencyMs: 820,
      lastCheckedAt: now,
      credentialRequired: false,
      credentialPresent: true,
      recordCount: 3,
      coverageDimensions: ["price", "policy", "finance"],
      officialUrl: "https://api.worldbank.org/v2",
    },
    {
      sourceId: "sec-edgar",
      name: "SEC EDGAR 美国证券交易委员会",
      tier: "S",
      status: "healthy",
      latencyMs: 1240,
      lastCheckedAt: now,
      credentialRequired: false,
      credentialPresent: true,
      recordCount: 12,
      coverageDimensions: ["finance", "competition"],
      officialUrl: "https://www.sec.gov/cgi-bin/browse-edgar",
    },
    {
      sourceId: "eurostat",
      name: "Eurostat 欧盟统计局",
      tier: "A+",
      status: "healthy",
      latencyMs: 950,
      lastCheckedAt: now,
      credentialRequired: false,
      credentialPresent: true,
      recordCount: 1,
      coverageDimensions: ["policy", "trade"],
      officialUrl: "https://ec.europa.eu/eurostat",
    },
    {
      sourceId: "ecb-eurofxref",
      name: "ECB 欧洲央行汇率参考",
      tier: "S",
      status: "healthy",
      latencyMs: 410,
      lastCheckedAt: now,
      credentialRequired: false,
      credentialPresent: true,
      recordCount: 31,
      coverageDimensions: ["finance"],
      officialUrl: "https://www.ecb.europa.eu/stats/eurofxref",
    },
    {
      sourceId: "bls-public-api",
      name: "BLS 美国劳工统计局",
      tier: "A+",
      status: "degraded",
      latencyMs: 2100,
      lastCheckedAt: now,
      credentialRequired: false,
      credentialPresent: true,
      recordCount: 1,
      coverageDimensions: ["price"],
      failureReason: "freshness 门降级：数据延迟 2 天，超过 1 天阈值",
      officialUrl: "https://api.bls.gov/publicAPI/v2/timeseries/data",
    },
    {
      sourceId: "fred",
      name: "FRED 圣路易斯联邦储备银行",
      tier: "A+",
      status: "unavailable",
      latencyMs: 0,
      lastCheckedAt: now,
      credentialRequired: true,
      credentialPresent: false,
      recordCount: 0,
      coverageDimensions: ["finance", "price"],
      failureReason: "FRED_API_KEY 未配置",
      officialUrl: "https://fred.stlouisfed.org/docs/api/fred",
    },
    {
      sourceId: "us-census-trade",
      name: "US Census 美国人口普查局贸易",
      tier: "A",
      status: "unavailable",
      latencyMs: 0,
      lastCheckedAt: now,
      credentialRequired: true,
      credentialPresent: false,
      recordCount: 0,
      coverageDimensions: ["trade"],
      failureReason: "CENSUS_API_KEY 未配置",
      officialUrl: "https://api.census.gov/data/timeseries/intltrade/imports",
    },
    {
      sourceId: "open-supply-hub",
      name: "Open Supply Hub 开放供应链数据库",
      tier: "A",
      status: "unavailable",
      latencyMs: 0,
      lastCheckedAt: now,
      credentialRequired: true,
      credentialPresent: false,
      recordCount: 0,
      coverageDimensions: ["capacity", "competition"],
      failureReason: "OPEN_SUPPLY_HUB_API_KEY 未配置",
      officialUrl: "https://opensupplyhub.org/api",
    },
    {
      sourceId: "un-comtrade",
      name: "UN Comtrade 联合国贸易统计",
      tier: "S",
      status: "unavailable",
      latencyMs: 0,
      lastCheckedAt: now,
      credentialRequired: true,
      credentialPresent: false,
      recordCount: 0,
      coverageDimensions: ["trade"],
      failureReason: "UN_COMTRADE_API_KEY 未配置",
      officialUrl: "https://comtradeapi.un.org/data/v1",
    },
  ];
}

/** 计算采集健康汇总 */
export function summarizeCollectionHealth(entries: SourceHealthEntry[]): CollectionHealthSummary {
  const healthy = entries.filter((e) => e.status === "healthy");
  const totalRecords = entries.reduce((sum, e) => sum + e.recordCount, 0);
  const probedEntries = entries.filter((e) => e.status === "healthy" || e.status === "degraded");
  const avgLatency = probedEntries.length > 0
    ? Math.round(probedEntries.reduce((sum, e) => sum + e.latencyMs, 0) / probedEntries.length)
    : 0;
  return {
    totalCount: entries.length,
    healthyCount: healthy.length,
    degradedCount: entries.filter((e) => e.status === "degraded").length,
    failedCount: entries.filter((e) => e.status === "failed").length,
    unavailableCount: entries.filter((e) => e.status === "unavailable").length,
    totalRecords,
    avgLatencyMs: avgLatency,
    missingCredentialCount: entries.filter((e) => e.credentialRequired && !e.credentialPresent).length,
  };
}

/** 7 维度覆盖 mock */
export function createMockDimensionCoverage(
  healthEntries: SourceHealthEntry[]
): DimensionCoverageEntry[] {
  const dimensionMeta: Array<{
    dimension: MetricDimension;
    label: string;
    icon: string;
    discipline: string;
    keyMetrics: string[];
  }> = [
    { dimension: "price", label: "价格", icon: "💲", discipline: "微观经济学", keyMetrics: ["棉花现货价", "纱线报价", "面料单价"] },
    { dimension: "capacity", label: "产能", icon: "📦", discipline: "生产理论", keyMetrics: ["产能利用率", "设备开工率", "工人人数"] },
    { dimension: "inventory", label: "库存", icon: "📊", discipline: "运筹学/供应链管理", keyMetrics: ["库销比", "安全库存", "库存龄期"] },
    { dimension: "trade", label: "贸易", icon: "🚢", discipline: "国际贸易学", keyMetrics: ["HS编码进出口", "关税税率", "贸易流量"] },
    { dimension: "policy", label: "政策法规", icon: "⚖️", discipline: "政策学", keyMetrics: ["关税政策", "出口退税", "劳工合规"] },
    { dimension: "finance", label: "汇率金融", icon: "💱", discipline: "金融学", keyMetrics: ["USD/CNY汇率", "利率", "通胀CPI"] },
    { dimension: "competition", label: "竞争", icon: "🏆", discipline: "产业组织理论", keyMetrics: ["市场集中度HHI", "品牌份额", "供应商集中度"] },
  ];

  return dimensionMeta.map((meta) => {
    const matched = healthEntries.filter((e) =>
      e.coverageDimensions.includes(meta.dimension) && (e.status === "healthy" || e.status === "degraded")
    );
    const matchedIds = matched.map((e) => e.sourceId);
    const sourceCount = matched.length;
    const status: DimensionCoverageStatus = sourceCount >= 2 ? "covered" : sourceCount === 1 ? "partial" : "gap";
    const missingCoverage = status === "gap"
      ? `无可用数据源覆盖（${meta.dimension} 维度需要至少 1 个健康数据源）`
      : status === "partial"
        ? `仅 ${sourceCount} 源覆盖，建议补充交叉验证源`
        : `${sourceCount} 源交叉覆盖`;
    return {
      dimension: meta.dimension,
      label: meta.label,
      icon: meta.icon,
      discipline: meta.discipline,
      status,
      matchedSourceIds: matchedIds,
      sourceCount,
      missingCoverage,
      keyMetrics: meta.keyMetrics,
    };
  });
}

/** 7 阶段管道 mock */
export function createMockPipelineStages(): PipelineStage[] {
  return [
    {
      stageId: "scout",
      name: "侦察扫描",
      order: 1,
      roles: ["scout"],
      status: "completed",
      inputSummary: "业务目标：降低华东零售补货缺货率 8.4% → 6.0%",
      outputSummary: "匹配 9 个候选数据源，覆盖 7 维度中的 5 个",
      durationMs: 1200,
      findings: ["棉花价格信号已触发", "汇率波动在阈值内", "贸易数据待采集"],
      evidenceCount: 0,
      confidence: 0.92,
    },
    {
      stageId: "collector",
      name: "并行采集",
      order: 2,
      roles: ["collector"],
      status: "completed",
      inputSummary: "9 个候选源（5 免 key + 4 需 key）",
      outputSummary: "5 源采集成功，48 条原始记录；4 源因缺 key 跳过",
      durationMs: 8400,
      findings: ["World Bank 返回 3 条", "SEC EDGAR 返回 12 条", "ECB 汇率 31 条", "BLS 延迟 2 天降级"],
      evidenceCount: 48,
      confidence: 0.85,
    },
    {
      stageId: "verifier",
      name: "清洗验证",
      order: 3,
      roles: ["data_janitor", "verifier"],
      status: "completed",
      inputSummary: "48 条原始记录",
      outputSummary: "通过 6 道验证门，保留 42 条；6 条因 freshness/冲突剔除",
      durationMs: 3200,
      findings: ["provenance 门全通过", "BLS 数据 freshness 降级", "World Bank vs BLS 价格偏离 3%"],
      evidenceCount: 42,
      confidence: 0.88,
    },
    {
      stageId: "analyst",
      name: "根因分析",
      order: 4,
      roles: ["analyst", "devils_advocate"],
      status: "completed",
      inputSummary: "42 条已验证证据",
      outputSummary: "定位缺货根因：棉花价格上涨 8% 传导至面料成本",
      durationMs: 5600,
      findings: ["原料传导率 0.72（Engel-Granger 协整）", "魔鬼代言人：替代解释已排除季节性因素", "影响链：棉花→纱线→面料→成衣"],
      evidenceCount: 42,
      confidence: 0.82,
    },
    {
      stageId: "adjudicator",
      name: "裁决对账",
      order: 5,
      roles: ["adjudicator", "reconciliation_scorer"],
      status: "completed",
      inputSummary: "分析结论 + 反证结果",
      outputSummary: "调整置信度 0.82→0.86；业务维度对账一致",
      durationMs: 2100,
      findings: ["裁决：维持原料传导结论", "对账：库销比、产能利用率、贸易流量三维度一致", "置信度上调 +0.04"],
      evidenceCount: 42,
      confidence: 0.86,
    },
    {
      stageId: "synthesizer",
      name: "综合建议",
      order: 6,
      roles: ["synthesizer"],
      status: "completed",
      inputSummary: "裁决结论 + 42 条证据",
      outputSummary: "生成 4 项行动建议（1 高优先 + 2 中 + 1 监控）",
      durationMs: 2800,
      findings: ["建议 1：锁定棉花 3 个月远期合约", "建议 2：启动面料替代方案 B", "建议 3：调整补货阈值", "建议 4：监控库销比"],
      evidenceCount: 42,
      confidence: 0.86,
    },
    {
      stageId: "memory",
      name: "沉淀记忆",
      order: 7,
      roles: ["memory"],
      status: "running",
      inputSummary: "4 项建议 + 42 条证据 + 置信度 0.86",
      outputSummary: "正在写入 Neon 持久化 + 触发下一轮观察",
      durationMs: 900,
      findings: ["Neon 写入中", "下一轮观察窗口：T+7 天", "跟踪指标：棉花价格、库销比"],
      evidenceCount: 42,
      confidence: 0.86,
    },
  ];
}

/** 计算管道汇总 */
export function summarizePipeline(stages: PipelineStage[]): PipelineSummary {
  const completed = stages.filter((s) => s.status === "completed");
  const totalDuration = stages.reduce((sum, s) => sum + s.durationMs, 0);
  const lastConfidence = stages[stages.length - 1]?.confidence ?? 0;
  return {
    totalStages: stages.length,
    completedStages: completed.length,
    runningStages: stages.filter((s) => s.status === "running").length,
    totalDurationMs: totalDuration,
    totalEvidence: stages[stages.length - 1]?.evidenceCount ?? 0,
    overallConfidence: lastConfidence,
  };
}

// ============================================================
// 4. 清洗穿透 — 全链路追溯
// ============================================================

/** 追溯层级 ID */
export type ProvenanceLayerId =
  | "raw_data"     // 原始数据采集
  | "cleaning"     // 数据清洗
  | "validation"   // 验证门
  | "metric"       // 指标计算
  | "decision";    // 决策建议

/** 追溯层级状态 */
export type ProvenanceLayerStatus = "passed" | "warning" | "failed" | "skipped";

/** 单个追溯层级 */
export interface ProvenanceLayer {
  layerId: ProvenanceLayerId;
  /** 层级名（中文） */
  layerName: string;
  /** 层级序号 01-05 */
  order: number;
  status: ProvenanceLayerStatus;
  /** 时间戳 ISO */
  timestamp: string;
  /** 输入摘要 */
  inputSummary: string;
  /** 输出摘要 */
  outputSummary: string;
  /** 应用的规则/公式 */
  rules: string[];
  /** 通过数/总数 */
  passedCount: number;
  totalCount: number;
  /** 详细信息 */
  details: ProvenanceDetail[];
}

/** 追溯详细信息条目 */
export interface ProvenanceDetail {
  /** 条目名 */
  label: string;
  /** 值 */
  value: string;
  /** 状态 */
  status: ProvenanceLayerStatus;
  /** 说明 */
  note?: string;
}

/** 完整追溯链 */
export interface ProvenanceTrace {
  /** 追溯链标题（如"棉花价格传导至面料成本"） */
  title: string;
  /** 上下文标签 */
  contextLabel: string;
  /** 5 个层级 */
  layers: ProvenanceLayer[];
  /** 最终置信度 */
  finalConfidence: number;
  /** 数据源数 */
  sourceCount: number;
  /** 总记录数 */
  totalRecords: number;
}

/** 生成 mock 全链路追溯数据 */
export function createMockProvenanceTrace(stageId?: PipelineStageId): ProvenanceTrace {
  const now = new Date().toISOString();
  const baseLayers: ProvenanceLayer[] = [
    {
      layerId: "raw_data",
      layerName: "原始数据采集",
      order: 1,
      status: "passed",
      timestamp: now,
      inputSummary: "9 个候选数据源（5 免 key + 4 需 key）",
      outputSummary: "5 源采集成功，48 条原始记录",
      rules: ["并行采集 + 15s 超时", "缺 key graceful skip", "not_implemented 跳过"],
      passedCount: 5,
      totalCount: 9,
      details: [
        { label: "World Bank", value: "3 条", status: "passed", note: "GDP + 关税 + 劳动力" },
        { label: "SEC EDGAR", value: "12 条", status: "passed", note: "GAP (CIK:39911) 财务指标" },
        { label: "ECB 汇率", value: "31 条", status: "passed", note: "月度参考汇率" },
        { label: "Eurostat", value: "1 条", status: "passed", note: "德国人口数据" },
        { label: "BLS", value: "1 条", status: "warning", note: "CPI 系列，延迟 2 天" },
        { label: "FRED", value: "0 条", status: "skipped", note: "FRED_API_KEY 未配置" },
        { label: "US Census", value: "0 条", status: "skipped", note: "CENSUS_API_KEY 未配置" },
        { label: "Open Supply Hub", value: "0 条", status: "skipped", note: "OPEN_SUPPLY_HUB_API_KEY 未配置" },
        { label: "UN Comtrade", value: "0 条", status: "skipped", note: "UN_COMTRADE_API_KEY 未配置" },
      ],
    },
    {
      layerId: "cleaning",
      layerName: "数据清洗",
      order: 2,
      status: "passed",
      timestamp: now,
      inputSummary: "48 条原始记录",
      outputSummary: "42 条清洗后保留，6 条剔除",
      rules: [
        "去重：相同 sourceId + subject + period 去重",
        "归一化：货币统一 USD，单位统一 kg/条/天",
        "异常标记：3σ 外值标记为 outlier",
        "时区对齐：全部转 UTC",
      ],
      passedCount: 42,
      totalCount: 48,
      details: [
        { label: "去重", value: "3 条重复", status: "passed", note: "ECB 汇率每日重复" },
        { label: "归一化", value: "48 条", status: "passed", note: "USD 标准化 + kg 单位统一" },
        { label: "异常标记", value: "2 条 outlier", status: "warning", note: "BLS 价格偏离 3σ" },
        { label: "时区对齐", value: "48 条", status: "passed", note: "全部 UTC" },
        { label: "剔除", value: "6 条", status: "failed", note: "3 重复 + 2 异常 + 1 schema 错误" },
      ],
    },
    {
      layerId: "validation",
      layerName: "6 道验证门",
      order: 3,
      status: "passed",
      timestamp: now,
      inputSummary: "42 条清洗后记录",
      outputSummary: "42 条通过验证，0 条被拒",
      rules: [
        "provenance：来源溯源链完整",
        "schema_match：字段符合 zod schema",
        "range_plausibility：值在合理区间",
        "freshness：数据新鲜度在阈值内",
        "cross_source：多源交叉验证",
        "historical：历史趋势一致性",
      ],
      passedCount: 42,
      totalCount: 42,
      details: [
        { label: "provenance", value: "42/42 通过", status: "passed", note: "全部有 sourceId + collectedAt" },
        { label: "schema_match", value: "42/42 通过", status: "passed", note: "zod schema 验证" },
        { label: "range_plausibility", value: "42/42 通过", status: "passed", note: "值在 knownRanges 内" },
        { label: "freshness", value: "41/42 通过", status: "warning", note: "BLS 延迟 2 天，降级但保留" },
        { label: "cross_source", value: "40/42 一致", status: "warning", note: "World Bank vs BLS 价格偏离 3%" },
        { label: "historical", value: "42/42 通过", status: "passed", note: "无历史趋势断裂" },
      ],
    },
    {
      layerId: "metric",
      layerName: "指标计算",
      order: 4,
      status: "passed",
      timestamp: now,
      inputSummary: "42 条已验证证据",
      outputSummary: "计算 6 个学科方法论指标",
      rules: [
        "原料传导率：Engel-Granger 协整检验",
        "库销比：EOQ 安全库存基准",
        "产能利用率：Cobb-Douglas 生产函数",
        "供应链风险指数：AHP + Monte Carlo",
        "交货延迟指数：订单级统计",
        "市场集中度 HHI：Σ(份额²)",
      ],
      passedCount: 6,
      totalCount: 6,
      details: [
        { label: "原料传导率", value: "0.72", status: "passed", note: "棉花→面料传导率 72%" },
        { label: "库销比", value: "3.2", status: "warning", note: "超过 3.0 健康阈值" },
        { label: "产能利用率", value: "87%", status: "passed", note: "高于 85% 警戒线" },
        { label: "供应链风险指数", value: "0.68", status: "warning", note: "中高风险" },
        { label: "交货延迟指数", value: "14 天", status: "failed", note: "超过 7 天正常值" },
        { label: "市场集中度 HHI", value: "1820", status: "passed", note: "适度集中" },
      ],
    },
    {
      layerId: "decision",
      layerName: "决策建议生成",
      order: 5,
      status: "passed",
      timestamp: now,
      inputSummary: "6 个指标 + 42 条证据",
      outputSummary: "生成 4 项行动建议（1 高优先 + 2 中 + 1 监控）",
      rules: [
        "置信度 ≥ 0.8：可执行建议",
        "置信度 0.6-0.8：参考建议",
        "置信度 < 0.6：仅监控",
        "魔鬼代言人：排除替代解释",
        "裁决员：调整置信度",
      ],
      passedCount: 4,
      totalCount: 4,
      details: [
        { label: "锁定棉花远期合约", value: "P0 高优先", status: "passed", note: "置信度 0.86" },
        { label: "启动面料替代方案", value: "P1 中优先", status: "passed", note: "置信度 0.79" },
        { label: "调整补货阈值", value: "P1 中优先", status: "passed", note: "置信度 0.75" },
        { label: "监控库销比", value: "P2 监控", status: "passed", note: "置信度 0.68" },
      ],
    },
  ];

  // 如果指定了 stageId，只返回该阶段对应的层级
  const stageToLayer: Record<PipelineStageId, ProvenanceLayerId[]> = {
    scout: ["raw_data"],
    collector: ["raw_data"],
    verifier: ["cleaning", "validation"],
    analyst: ["metric"],
    adjudicator: ["metric", "decision"],
    synthesizer: ["decision"],
    memory: ["decision"],
  };

  const filteredLayerIds = stageId ? stageToLayer[stageId] : undefined;
  const layers = filteredLayerIds
    ? baseLayers.filter((l) => filteredLayerIds.includes(l.layerId))
    : baseLayers;

  return {
    title: stageId
      ? `清洗穿透 - ${layers[0]?.layerName ?? ""}`
      : "清洗穿透 - 全链路追溯",
    contextLabel: stageId ? `${stageId} 阶段证据链` : "从采集到决策的完整链路",
    layers,
    finalConfidence: 0.86,
    sourceCount: 5,
    totalRecords: 48,
  };
}

