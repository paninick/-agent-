/**
 * client/ChannelsView.tsx — 渠道集成视图
 *
 * 定位：数据源/渠道的管理工作台（不只是只读面板）。
 *
 * 与 IntelligenceDashboard 内嵌的 CollectionHealthPanel 区别：
 *   - CollectionHealthPanel 是只读展示（汇总 + 列表）
 *   - ChannelsView 是管理工作台：按 Tier 分组、按状态过滤、凭证状态总览、
 *     官方 URL 跳转、覆盖维度穿透
 *
 * 数据源：复用 apiClient.getCollectionHealth() + getDimensionCoverage()
 *
 * 布局：
 *   顶部：汇总条（总数 / 健康 / 降级 / 失败 / 不可用 / 凭证缺失）
 *   中部：状态过滤 + Tier 分组切换
 *   主体：数据源列表（可过滤）+ 选中数据源的详情抽屉
 *   底部：维度覆盖网格
 */

import React, { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Database,
  ExternalLink,
  Filter,
  Key,
  Layers,
  Shield,
  XCircle,
} from "lucide-react/dist/esm/lucide-react.mjs";
import {
  summarizeCollectionHealth,
  type DimensionCoverageEntry,
  type SourceHealthEntry,
  type SourceHealthStatus,
} from "./analysisTypes";
import { apiClient, useAsync } from "./apiClient";
import { DimensionCoveragePanel } from "./AnalysisPanels";

// ===== Metadata =====

const HEALTH_META: Record<SourceHealthStatus, { label: string; color: string; Icon: typeof CheckCircle2 }> = {
  healthy: { label: "健康", color: "var(--mint)", Icon: CheckCircle2 },
  degraded: { label: "降级", color: "var(--amber)", Icon: AlertTriangle },
  failed: { label: "失败", color: "var(--red)", Icon: XCircle },
  unavailable: { label: "不可用", color: "var(--ink-muted)", Icon: Shield },
};

const TIER_META: Record<SourceHealthEntry["tier"], { label: string; color: string; description: string }> = {
  "S": { label: "S 级", color: "#FFD700", description: "最高可信级 — 官方统计机构 / 央行 / 政府公开 API" },
  "A+": { label: "A+ 级", color: "#8ef0bf", description: "权威级 — 行业权威数据商 / 审计公开数据" },
  "A": { label: "A 级", color: "#79d9ee", description: "专业级 — 学术研究 / 行业协会 / 专业数据库" },
  "B": { label: "B 级", color: "#9fb6c7", description: "一般级 — 商业数据源 / 聚合平台" },
  "C": { label: "C 级", color: "#aab7ac", description: "参考级 — 非结构化 / 需交叉验证" },
};

const STATUS_FILTERS: Array<{ id: SourceHealthStatus | "all"; label: string }> = [
  { id: "all", label: "全部" },
  { id: "healthy", label: "健康" },
  { id: "degraded", label: "降级" },
  { id: "failed", label: "失败" },
  { id: "unavailable", label: "不可用" },
];

// ===== Subcomponents =====

function SourceRow({ entry, selected, onSelect }: { entry: SourceHealthEntry; selected: boolean; onSelect: () => void }) {
  const meta = HEALTH_META[entry.status];
  const Icon = meta.Icon;
  const tierMeta = TIER_META[entry.tier];
  return (
    <button
      type="button"
      className={selected ? "channel-row selected" : "channel-row"}
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
    >
      <div className="channel-row-head">
        <span className="channel-tier-badge" style={{ borderColor: tierMeta.color, color: tierMeta.color }}>
          {entry.tier}
        </span>
        <span className="channel-status-icon" style={{ color: meta.color }} aria-label={meta.label}>
          <Icon size={14} />
        </span>
        <strong className="channel-name">{entry.name}</strong>
        <span className="channel-latency">{entry.latencyMs}ms</span>
      </div>
      <div className="channel-row-meta">
        <span className="channel-records">{entry.recordCount} 条记录</span>
        <span className="channel-dims">{entry.coverageDimensions.length} 维度</span>
        {entry.credentialRequired && (
          <span className={entry.credentialPresent ? "channel-credential ok" : "channel-credential missing"}>
            <Key size={11} /> {entry.credentialPresent ? "已配置" : "缺凭证"}
          </span>
        )}
      </div>
      {entry.failureReason && <p className="channel-fail-reason">{entry.failureReason}</p>}
    </button>
  );
}

function SourceDetailDrawer({ entry, coverage, onClose }: { entry: SourceHealthEntry; coverage: DimensionCoverageEntry[]; onClose: () => void }) {
  const meta = HEALTH_META[entry.status];
  const Icon = meta.Icon;
  const tierMeta = TIER_META[entry.tier];
  const matchedDims = coverage.filter((c) => c.matchedSourceIds.includes(entry.sourceId));

  return (
    <div className="channel-detail-drawer" role="dialog" aria-label={`数据源详情 ${entry.name}`}>
      <div className="channel-detail-head">
        <div>
          <div className="channel-detail-badges">
            <span className="channel-tier-badge" style={{ borderColor: tierMeta.color, color: tierMeta.color }}>{entry.tier}</span>
            <span className="channel-status-badge" style={{ color: meta.color, borderColor: meta.color }}>
              <Icon size={13} /> {meta.label}
            </span>
          </div>
          <h3 className="channel-detail-title">{entry.name}</h3>
        </div>
        <button type="button" className="channel-detail-close" onClick={onClose} aria-label="关闭">×</button>
      </div>

      <div className="channel-detail-grid">
        <div className="channel-detail-metric">
          <span className="channel-detail-metric-label">延迟</span>
          <span className="channel-detail-metric-value">{entry.latencyMs}ms</span>
        </div>
        <div className="channel-detail-metric">
          <span className="channel-detail-metric-label">本次记录</span>
          <span className="channel-detail-metric-value">{entry.recordCount}</span>
        </div>
        <div className="channel-detail-metric">
          <span className="channel-detail-metric-label">覆盖维度</span>
          <span className="channel-detail-metric-value">{entry.coverageDimensions.length}</span>
        </div>
        <div className="channel-detail-metric">
          <span className="channel-detail-metric-label">凭证</span>
          <span className="channel-detail-metric-value" style={{ color: entry.credentialRequired ? (entry.credentialPresent ? "var(--mint)" : "var(--red)") : "var(--ink-muted)" }}>
            {entry.credentialRequired ? (entry.credentialPresent ? "已配置" : "缺失") : "无需"}
          </span>
        </div>
      </div>

      <div className="channel-detail-section">
        <h4 className="channel-detail-section-title">描述</h4>
        <p className="channel-detail-text">{tierMeta.description}</p>
      </div>

      {entry.failureReason && (
        <div className="channel-detail-section">
          <h4 className="channel-detail-section-title">失败原因</h4>
          <p className="channel-detail-text channel-fail-text">{entry.failureReason}</p>
        </div>
      )}

      <div className="channel-detail-section">
        <h4 className="channel-detail-section-title">覆盖维度 ({matchedDims.length})</h4>
        <div className="channel-dim-list">
          {matchedDims.length === 0 ? (
            <p className="channel-empty-hint">未参与任何维度覆盖</p>
          ) : (
            matchedDims.map((dim) => (
              <span key={dim.dimension} className="channel-dim-chip">
                {dim.icon} {dim.label}
              </span>
            ))
          )}
        </div>
      </div>

      <div className="channel-detail-section">
        <h4 className="channel-detail-section-title">最近检查</h4>
        <p className="channel-detail-text">{new Date(entry.lastCheckedAt).toLocaleString("zh-CN")}</p>
      </div>

      <a
        href={entry.officialUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="channel-official-link"
      >
        <ExternalLink size={14} /> 访问官方源
      </a>
    </div>
  );
}

// ===== Main component =====

export function ChannelsView() {
  const [statusFilter, setStatusFilter] = useState<SourceHealthStatus | "all">("all");
  const [tierFilter, setTierFilter] = useState<SourceHealthEntry["tier"] | "all">("all");
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);

  const { data: entries, loading, error } = useAsync(() => apiClient.getCollectionHealth(), []);
  const { data: coverage } = useAsync(() => apiClient.getDimensionCoverage(), []);

  const summary = useMemo(() => (entries ? summarizeCollectionHealth(entries) : null), [entries]);

  const filteredEntries = useMemo(() => {
    if (!entries) return [];
    return entries.filter((e) => {
      if (statusFilter !== "all" && e.status !== statusFilter) return false;
      if (tierFilter !== "all" && e.tier !== tierFilter) return false;
      return true;
    });
  }, [entries, statusFilter, tierFilter]);

  const selectedEntry = useMemo(
    () => entries?.find((e) => e.sourceId === selectedSourceId) ?? null,
    [entries, selectedSourceId]
  );

  const countsByStatus = useMemo(() => {
    if (!entries) return {} as Record<string, number>;
    const counts: Record<string, number> = { all: entries.length };
    for (const e of entries) {
      counts[e.status] = (counts[e.status] ?? 0) + 1;
    }
    return counts;
  }, [entries]);

  const countsByTier = useMemo(() => {
    if (!entries) return {} as Record<string, number>;
    const counts: Record<string, number> = { all: entries.length };
    for (const e of entries) {
      counts[e.tier] = (counts[e.tier] ?? 0) + 1;
    }
    return counts;
  }, [entries]);

  if (loading) {
    return (
      <section className="channels-view" aria-label="渠道集成">
        <div className="data-loading" role="status">加载渠道数据…</div>
      </section>
    );
  }

  if (error || !entries || !summary) {
    return (
      <section className="channels-view" aria-label="渠道集成">
        <div className="data-error-banner" role="alert">
          渠道数据加载失败：{error ?? "未知错误"}
        </div>
      </section>
    );
  }

  return (
    <section className="channels-view" aria-label="渠道集成">
      <header className="channels-view-head">
        <div className="channels-view-title">
          <h2><Database size={20} /> 渠道集成</h2>
          <p className="channels-view-subtitle">数据源接入管理与健康监控 — 按可信度分级，追踪凭证状态与覆盖维度</p>
        </div>
      </header>

      {/* 汇总条 */}
      <div className="channels-summary">
        <div className="channels-summary-item">
          <span className="channels-summary-label"><Database size={13} /> 数据源总数</span>
          <strong className="channels-summary-value">{summary.totalCount}</strong>
        </div>
        <div className="channels-summary-item">
          <span className="channels-summary-label"><CheckCircle2 size={13} /> 健康</span>
          <strong className="channels-summary-value ok">{summary.healthyCount}</strong>
        </div>
        <div className="channels-summary-item">
          <span className="channels-summary-label"><AlertTriangle size={13} /> 降级</span>
          <strong className="channels-summary-value warn">{summary.degradedCount}</strong>
        </div>
        <div className="channels-summary-item">
          <span className="channels-summary-label"><XCircle size={13} /> 失败</span>
          <strong className="channels-summary-value fail">{summary.failedCount}</strong>
        </div>
        <div className="channels-summary-item">
          <span className="channels-summary-label"><Shield size={13} /> 不可用</span>
          <strong className="channels-summary-value muted">{summary.unavailableCount}</strong>
        </div>
        <div className="channels-summary-item">
          <span className="channels-summary-label"><Key size={13} /> 凭证缺失</span>
          <strong className={summary.missingCredentialCount > 0 ? "channels-summary-value fail" : "channels-summary-value ok"}>
            {summary.missingCredentialCount}
          </strong>
        </div>
        <div className="channels-summary-item">
          <span className="channels-summary-label"><Activity size={13} /> 平均延迟</span>
          <strong className="channels-summary-value">{summary.avgLatencyMs}ms</strong>
        </div>
      </div>

      {/* 过滤器 */}
      <div className="channels-filters">
        <div className="channels-filter-group">
          <Filter size={13} aria-hidden="true" />
          <span className="channels-filter-label">状态:</span>
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={statusFilter === f.id ? "channels-filter active" : "channels-filter"}
              onClick={() => setStatusFilter(f.id)}
            >
              {f.label}
              <span className="channels-filter-count">{countsByStatus[f.id] ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="channels-filter-group">
          <Layers size={13} aria-hidden="true" />
          <span className="channels-filter-label">可信度:</span>
          <button
            type="button"
            className={tierFilter === "all" ? "channels-filter active" : "channels-filter"}
            onClick={() => setTierFilter("all")}
          >
            全部
            <span className="channels-filter-count">{countsByTier.all ?? 0}</span>
          </button>
          {(Object.keys(TIER_META) as Array<SourceHealthEntry["tier"]>).map((tier) => (
            <button
              key={tier}
              type="button"
              className={tierFilter === tier ? "channels-filter active" : "channels-filter"}
              style={tierFilter === tier ? { borderColor: TIER_META[tier].color, color: TIER_META[tier].color } : undefined}
              onClick={() => setTierFilter(tier)}
            >
              {tier}
              <span className="channels-filter-count">{countsByTier[tier] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 主体：列表 + 详情 */}
      <div className="channels-body">
        <div className="channels-list" role="list">
          {filteredEntries.length === 0 ? (
            <p className="channels-empty-hint">无匹配的数据源。调整过滤条件查看。</p>
          ) : (
            filteredEntries.map((entry) => (
              <SourceRow
                key={entry.sourceId}
                entry={entry}
                selected={selectedSourceId === entry.sourceId}
                onSelect={() => setSelectedSourceId(entry.sourceId)}
              />
            ))
          )}
        </div>

        <div className="channels-detail">
          {selectedEntry ? (
            <SourceDetailDrawer
              entry={selectedEntry}
              coverage={coverage ?? []}
              onClose={() => setSelectedSourceId(null)}
            />
          ) : (
            <div className="channels-detail-placeholder">
              <Database size={32} aria-hidden="true" />
              <p>选择左侧数据源查看详情</p>
            </div>
          )}
        </div>
      </div>

      {/* 底部：维度覆盖 */}
      <div className="channels-coverage">
        <DimensionCoveragePanel />
      </div>
    </section>
  );
}
