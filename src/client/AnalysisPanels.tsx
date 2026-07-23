/**
 * client/AnalysisPanels.tsx — Phase 2 分析视图三大面板
 *
 * 1. CollectionHealthPanel  — 9 数据源采集健康状态
 * 2. DimensionCoveragePanel — 7 维度数据源覆盖
 * 3. PipelineStagesPanel    — 7 阶段认知流管道
 *
 * 数据流：analysisTypes.ts mock → 后续接入真实 /api/health 和 SSE
 */

import React, { useMemo, useState } from "react";
import {
  CheckCircle2, AlertTriangle, XCircle, MinusCircle,
  Database, Activity, Key, ExternalLink,
  Layers, BookOpen,
  GitBranch, ArrowRight, Clock, ShieldCheck, Brain,
  Eye, EyeOff, ChevronDown,
} from "lucide-react/dist/esm/lucide-react.mjs";
import {
  createMockProvenanceTrace,
  summarizeCollectionHealth,
  summarizePipeline,
  type SourceHealthEntry,
  type SourceHealthStatus,
  type DimensionCoverageEntry,
  type DimensionCoverageStatus,
  type PipelineStage,
  type PipelineStageStatus,
  type PipelineStageId,
  type ProvenanceTrace,
  type ProvenanceLayer,
  type ProvenanceLayerStatus,
} from "./analysisTypes";
import { apiClient, useAsync } from "./apiClient";

// ============================================================
// 共享：状态徽章
// ============================================================

const HEALTH_META: Record<SourceHealthStatus, { label: string; color: string; Icon: typeof CheckCircle2 }> = {
  healthy: { label: "健康", color: "var(--mint)", Icon: CheckCircle2 },
  degraded: { label: "降级", color: "var(--amber)", Icon: AlertTriangle },
  failed: { label: "失败", color: "var(--red)", Icon: XCircle },
  unavailable: { label: "不可用", color: "var(--ink-muted)", Icon: MinusCircle },
};

const COVERAGE_META: Record<DimensionCoverageStatus, { label: string; color: string }> = {
  covered: { label: "充分覆盖", color: "var(--mint)" },
  partial: { label: "部分覆盖", color: "var(--amber)" },
  gap: { label: "覆盖缺口", color: "var(--red)" },
};

const STAGE_META: Record<PipelineStageStatus, { label: string; color: string }> = {
  completed: { label: "已完成", color: "var(--mint)" },
  running: { label: "运行中", color: "var(--cyan)" },
  idle: { label: "待命", color: "var(--ink-muted)" },
  failed: { label: "失败", color: "var(--red)" },
  skipped: { label: "跳过", color: "var(--ink-muted)" },
};

const TIER_COLOR: Record<string, string> = {
  S: "var(--mint)",
  "A+": "var(--cyan)",
  A: "var(--steel)",
  B: "var(--amber)",
  C: "var(--ink-muted)",
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}min`;
}

// ============================================================
// 1. CollectionHealthPanel — 采集健康面板
// ============================================================

export function CollectionHealthPanel() {
  const { data: entries, loading, error } = useAsync(
    () => apiClient.getCollectionHealth(),
    []
  );

  if (loading) {
    return (
      <section className="analysis-panel" aria-label="采集健康面板">
        <div className="data-loading" role="status">加载采集健康数据…</div>
      </section>
    );
  }
  if (error || !entries) {
    return (
      <section className="analysis-panel" aria-label="采集健康面板">
        <div className="data-error-banner" role="alert">
          采集健康数据加载失败：{error ?? "未知错误"}
        </div>
      </section>
    );
  }

  const summary = summarizeCollectionHealth(entries);

  return (
    <section className="analysis-panel" aria-label="采集健康面板">
      <header className="analysis-panel-head">
        <div>
          <span className="section-kicker"><Database size={14} /> 采集验证</span>
          <h2>9 数据源健康状态</h2>
        </div>
        <span className="analysis-panel-meta">
          {summary.healthyCount} 健康 / {summary.degradedCount} 降级 / {summary.unavailableCount} 不可用
        </span>
      </header>

      {/* 汇总栏 */}
      <div className="health-summary-grid">
        <div className="health-summary-item">
          <span className="health-summary-label">总记录数</span>
          <strong className="health-summary-value">{summary.totalRecords}</strong>
        </div>
        <div className="health-summary-item">
          <span className="health-summary-label">平均延迟</span>
          <strong className="health-summary-value">{formatDuration(summary.avgLatencyMs)}</strong>
        </div>
        <div className="health-summary-item">
          <span className="health-summary-label"><Key size={12} /> 凭证缺失</span>
          <strong className={`health-summary-value ${summary.missingCredentialCount > 0 ? "warn" : ""}`}>
            {summary.missingCredentialCount}
          </strong>
        </div>
        <div className="health-summary-item">
          <span className="health-summary-label"><Activity size={12} /> 采集成功率</span>
          <strong className="health-summary-value">
            {Math.round((summary.healthyCount / summary.totalCount) * 100)}%
          </strong>
        </div>
      </div>

      {/* 数据源列表 */}
      <div className="source-health-list" role="list">
        {entries.map((entry) => (
          <SourceHealthRow key={entry.sourceId} entry={entry} />
        ))}
      </div>
    </section>
  );
}

function SourceHealthRow({ entry }: { entry: SourceHealthEntry }) {
  const meta = HEALTH_META[entry.status];
  const Icon = meta.Icon;
  return (
    <div className={`source-health-row status-${entry.status}`} role="listitem">
      <div className="source-health-main">
        <span className="source-tier-badge" style={{ borderColor: TIER_COLOR[entry.tier], color: TIER_COLOR[entry.tier] }}>
          {entry.tier}
        </span>
        <div className="source-health-info">
          <strong>{entry.name}</strong>
          <span className="source-health-id">{entry.sourceId}</span>
        </div>
        <span className="source-health-status" style={{ color: meta.color }}>
          <Icon size={14} aria-hidden="true" />
          {meta.label}
        </span>
      </div>
      <div className="source-health-meta">
        <span className="source-meta-item">
          <Clock size={11} aria-hidden="true" />
          {entry.latencyMs > 0 ? formatDuration(entry.latencyMs) : "—"}
        </span>
        <span className="source-meta-item">
          <Database size={11} aria-hidden="true" />
          {entry.recordCount} 条
        </span>
        {entry.credentialRequired && (
          <span className={`source-meta-item ${entry.credentialPresent ? "" : "warn"}`}>
            <Key size={11} aria-hidden="true" />
            {entry.credentialPresent ? "已配置" : "缺失"}
          </span>
        )}
        <span className="source-meta-dims">
          {entry.coverageDimensions.map((d) => (
            <span key={d} className="dim-chip">{d}</span>
          ))}
        </span>
      </div>
      {entry.failureReason && (
        <p className="source-health-reason">{entry.failureReason}</p>
      )}
      <a
        href={entry.officialUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="source-health-link"
        aria-label={`访问 ${entry.name} 官方文档`}
      >
        <ExternalLink size={11} aria-hidden="true" />
        官方 API
      </a>
    </div>
  );
}

// ============================================================
// 2. DimensionCoveragePanel — 7 维度覆盖面板
// ============================================================

export function DimensionCoveragePanel() {
  const { data: coverage, loading, error } = useAsync(
    () => apiClient.getDimensionCoverage(),
    []
  );

  if (loading) {
    return (
      <section className="analysis-panel" aria-label="维度覆盖面板">
        <div className="data-loading" role="status">加载维度覆盖数据…</div>
      </section>
    );
  }
  if (error || !coverage) {
    return (
      <section className="analysis-panel" aria-label="维度覆盖面板">
        <div className="data-error-banner" role="alert">
          维度覆盖数据加载失败：{error ?? "未知错误"}
        </div>
      </section>
    );
  }

  const coveredCount = coverage.filter((c) => c.status === "covered").length;
  const partialCount = coverage.filter((c) => c.status === "partial").length;
  const gapCount = coverage.filter((c) => c.status === "gap").length;

  return (
    <section className="analysis-panel" aria-label="维度覆盖面板">
      <header className="analysis-panel-head">
        <div>
          <span className="section-kicker"><Layers size={14} /> 分解映射</span>
          <h2>7 维度数据源覆盖</h2>
        </div>
        <span className="analysis-panel-meta">
          {coveredCount} 充分 / {partialCount} 部分 / {gapCount} 缺口
        </span>
      </header>

      <div className="dimension-coverage-grid">
        {coverage.map((entry) => (
          <DimensionCoverageCard key={entry.dimension} entry={entry} />
        ))}
      </div>
    </section>
  );
}

function DimensionCoverageCard({ entry }: { entry: DimensionCoverageEntry }) {
  const meta = COVERAGE_META[entry.status];
  return (
    <article className={`dimension-card status-${entry.status}`}>
      <header className="dimension-card-head">
        <span className="dimension-icon" aria-hidden="true">{entry.icon}</span>
        <div>
          <strong>{entry.label}</strong>
          <span className="dimension-discipline"><BookOpen size={10} aria-hidden="true" /> {entry.discipline}</span>
        </div>
        <span className="dimension-status-badge" style={{ color: meta.color, borderColor: meta.color }}>
          {meta.label}
        </span>
      </header>
      <div className="dimension-card-body">
        <div className="dimension-sources">
          <span className="dimension-sources-label">数据源（{entry.sourceCount}）：</span>
          {entry.matchedSourceIds.length > 0 ? (
            entry.matchedSourceIds.map((id) => (
              <span key={id} className="dim-chip">{id}</span>
            ))
          ) : (
            <span className="dimension-no-source">无</span>
          )}
        </div>
        <div className="dimension-key-metrics">
          <span className="dimension-metrics-label">关键指标：</span>
          {entry.keyMetrics.map((metric) => (
            <span key={metric} className="metric-chip">{metric}</span>
          ))}
        </div>
        <p className="dimension-coverage-note">{entry.missingCoverage}</p>
      </div>
    </article>
  );
}

// ============================================================
// 3. PipelineStagesPanel — 7 阶段管道面板
// ============================================================

const STAGE_ICON: Record<PipelineStageId, typeof GitBranch> = {
  scout: GitBranch,
  collector: Database,
  verifier: ShieldCheck,
  analyst: Brain,
  adjudicator: CheckCircle2,
  synthesizer: Layers,
  memory: BookOpen,
};

export function PipelineStagesPanel() {
  const { data: stages, loading, error } = useAsync(
    () => apiClient.getPipelineStages(),
    []
  );
  const [expandedTraceStage, setExpandedTraceStage] = useState<PipelineStageId | null>(null);

  const handleToggleTrace = (stageId: PipelineStageId) => {
    setExpandedTraceStage((prev) => (prev === stageId ? null : stageId));
  };

  if (loading) {
    return (
      <section className="analysis-panel" aria-label="管道阶段面板">
        <div className="data-loading" role="status">加载管道阶段数据…</div>
      </section>
    );
  }
  if (error || !stages) {
    return (
      <section className="analysis-panel" aria-label="管道阶段面板">
        <div className="data-error-banner" role="alert">
          管道阶段数据加载失败：{error ?? "未知错误"}
        </div>
      </section>
    );
  }

  const summary = summarizePipeline(stages);

  return (
    <section className="analysis-panel" aria-label="管道阶段面板">
      <header className="analysis-panel-head">
        <div>
          <span className="section-kicker"><GitBranch size={14} /> 清洗穿透</span>
          <h2>7 阶段认知流管道</h2>
        </div>
        <span className="analysis-panel-meta">
          {summary.completedStages}/{summary.totalStages} 完成 · {summary.runningStages} 运行中
        </span>
      </header>

      {/* 管道汇总栏 */}
      <div className="pipeline-summary-grid">
        <div className="pipeline-summary-item">
          <span className="pipeline-summary-label">总耗时</span>
          <strong>{formatDuration(summary.totalDurationMs)}</strong>
        </div>
        <div className="pipeline-summary-item">
          <span className="pipeline-summary-label">证据数</span>
          <strong>{summary.totalEvidence}</strong>
        </div>
        <div className="pipeline-summary-item">
          <span className="pipeline-summary-label">整体置信度</span>
          <strong>{Math.round(summary.overallConfidence * 100)}%</strong>
        </div>
      </div>

      {/* 阶段时间线 */}
      <ol className="pipeline-timeline" role="list">
        {stages.map((stage, index) => (
          <PipelineStageItem
            key={stage.stageId}
            stage={stage}
            isLast={index === stages.length - 1}
            isTraceExpanded={expandedTraceStage === stage.stageId}
            onToggleTrace={handleToggleTrace}
          />
        ))}
      </ol>

      {/* 全链路穿透（默认折叠，展开后显示完整 5 层） */}
      <ProvenanceTraceView
        trace={createMockProvenanceTrace()}
        collapsed={expandedTraceStage !== null}
      />
    </section>
  );
}

function PipelineStageItem({
  stage,
  isLast,
  isTraceExpanded,
  onToggleTrace,
}: {
  stage: PipelineStage;
  isLast: boolean;
  isTraceExpanded: boolean;
  onToggleTrace: (stageId: PipelineStageId) => void;
}) {
  const meta = STAGE_META[stage.status];
  const Icon = STAGE_ICON[stage.stageId];
  return (
    <li className={`pipeline-stage status-${stage.status} ${isTraceExpanded ? "trace-expanded" : ""}`}>
      <div className="pipeline-stage-marker">
        <span className="pipeline-stage-order">{String(stage.order).padStart(2, "0")}</span>
        <Icon size={18} aria-hidden="true" />
        {!isLast && <span className="pipeline-stage-connector" aria-hidden="true" />}
      </div>
      <div className="pipeline-stage-body">
        <header className="pipeline-stage-head">
          <strong>{stage.name}</strong>
          <span className="pipeline-stage-roles">
            {stage.roles.map((role) => (
              <span key={role} className="role-chip">{role}</span>
            ))}
          </span>
          <span className="pipeline-stage-status" style={{ color: meta.color }}>
            {meta.label}
          </span>
        </header>
        <div className="pipeline-stage-io">
          <div className="pipeline-io-row">
            <span className="pipeline-io-label">输入：</span>
            <span className="pipeline-io-text">{stage.inputSummary}</span>
          </div>
          <div className="pipeline-io-row">
            <ArrowRight size={11} aria-hidden="true" />
            <span className="pipeline-io-label">输出：</span>
            <span className="pipeline-io-text">{stage.outputSummary}</span>
          </div>
        </div>
        <div className="pipeline-stage-meta">
          <span className="pipeline-meta-item"><Clock size={11} /> {formatDuration(stage.durationMs)}</span>
          <span className="pipeline-meta-item"><Database size={11} /> {stage.evidenceCount} 证据</span>
          <span className="pipeline-meta-item"><ShieldCheck size={11} /> {Math.round(stage.confidence * 100)}%</span>
        </div>
        {stage.findings.length > 0 && (
          <ul className="pipeline-stage-findings">
            {stage.findings.map((finding, i) => (
              <li key={i}>{finding}</li>
            ))}
          </ul>
        )}
        <button
          type="button"
          className="trace-toggle-btn"
          onClick={() => onToggleTrace(stage.stageId)}
          aria-expanded={isTraceExpanded}
          aria-label={isTraceExpanded ? `收起 ${stage.name} 证据链穿透` : `展开 ${stage.name} 证据链穿透`}
        >
          {isTraceExpanded ? <EyeOff size={12} aria-hidden="true" /> : <Eye size={12} aria-hidden="true" />}
          {isTraceExpanded ? "收起穿透" : "查看穿透"}
          <ChevronDown size={12} aria-hidden="true" className={`trace-chevron ${isTraceExpanded ? "rotated" : ""}`} />
        </button>
        {isTraceExpanded && (
          <div className="stage-trace-inline">
            <ProvenanceTraceView trace={createMockProvenanceTrace(stage.stageId)} />
          </div>
        )}
      </div>
    </li>
  );
}

// ============================================================
// 4. ProvenanceTraceView — 全链路追溯视图
// ============================================================

const LAYER_STATUS_META: Record<ProvenanceLayerStatus, { label: string; color: string; Icon: typeof CheckCircle2 }> = {
  passed: { label: "通过", color: "var(--mint)", Icon: CheckCircle2 },
  warning: { label: "降级", color: "var(--amber)", Icon: AlertTriangle },
  failed: { label: "失败", color: "var(--red)", Icon: XCircle },
  skipped: { label: "跳过", color: "var(--ink-muted)", Icon: MinusCircle },
};

export function ProvenanceTraceView({
  trace,
  collapsed = false,
}: {
  trace: ProvenanceTrace;
  collapsed?: boolean;
}) {
  const [expanded, setExpanded] = useState(!collapsed);

  if (collapsed && !expanded) {
    return (
      <button
        type="button"
        className="trace-toggle-btn full-trace-toggle"
        onClick={() => setExpanded(true)}
        aria-label="展开全链路追溯"
      >
        <Eye size={12} aria-hidden="true" />
        展开全链路追溯（5 层）
        <ChevronDown size={12} aria-hidden="true" />
      </button>
    );
  }

  return (
    <div className="provenance-trace" role="region" aria-label={trace.title}>
      <header className="provenance-trace-head">
        <div className="provenance-trace-title-row">
          <span className="section-kicker"><Layers size={12} /> 证据链穿透</span>
          <h3>{trace.title}</h3>
          {collapsed && (
            <button
              type="button"
              className="trace-toggle-btn compact"
              onClick={() => setExpanded(false)}
              aria-label="收起全链路追溯"
            >
              <EyeOff size={12} aria-hidden="true" />
              收起
            </button>
          )}
        </div>
        <div className="provenance-trace-meta">
          <span className="provenance-meta-item">
            <Database size={11} aria-hidden="true" /> {trace.sourceCount} 数据源
          </span>
          <span className="provenance-meta-item">
            <Database size={11} aria-hidden="true" /> {trace.totalRecords} 条原始记录
          </span>
          <span className="provenance-meta-item">
            <ShieldCheck size={11} aria-hidden="true" /> 最终置信度 {Math.round(trace.finalConfidence * 100)}%
          </span>
          <span className="provenance-meta-item context">
            <GitBranch size={11} aria-hidden="true" /> {trace.contextLabel}
          </span>
        </div>
      </header>

      <ol className="provenance-layers" role="list">
        {trace.layers.map((layer, index) => (
          <ProvenanceLayerCard key={layer.layerId} layer={layer} isLast={index === trace.layers.length - 1} />
        ))}
      </ol>
    </div>
  );
}

function ProvenanceLayerCard({ layer, isLast }: { layer: ProvenanceLayer; isLast: boolean }) {
  const meta = LAYER_STATUS_META[layer.status];
  const Icon = meta.Icon;
  const passRate = layer.totalCount > 0 ? Math.round((layer.passedCount / layer.totalCount) * 100) : 0;

  return (
    <li className={`provenance-layer status-${layer.status}`}>
      <div className="provenance-layer-marker">
        <span className="provenance-layer-order">{String(layer.order).padStart(2, "0")}</span>
        <Icon size={16} aria-hidden="true" />
        {!isLast && <span className="provenance-layer-connector" aria-hidden="true" />}
      </div>
      <div className="provenance-layer-body">
        <header className="provenance-layer-head">
          <strong>{layer.layerName}</strong>
          <span className="provenance-layer-status" style={{ color: meta.color }}>
            {meta.label} · {layer.passedCount}/{layer.totalCount}（{passRate}%）
          </span>
        </header>
        <div className="provenance-layer-io">
          <div className="provenance-io-row">
            <span className="provenance-io-label">输入：</span>
            <span className="provenance-io-text">{layer.inputSummary}</span>
          </div>
          <div className="provenance-io-row">
            <ArrowRight size={11} aria-hidden="true" />
            <span className="provenance-io-label">输出：</span>
            <span className="provenance-io-text">{layer.outputSummary}</span>
          </div>
        </div>
        {layer.rules.length > 0 && (
          <div className="provenance-layer-rules">
            <span className="provenance-rules-label">应用规则：</span>
            <ul className="provenance-rules-list">
              {layer.rules.map((rule, i) => (
                <li key={i}>{rule}</li>
              ))}
            </ul>
          </div>
        )}
        {layer.details.length > 0 && (
          <ul className="provenance-layer-details">
            {layer.details.map((detail, i) => {
              const detailMeta = LAYER_STATUS_META[detail.status];
              const DetailIcon = detailMeta.Icon;
              return (
                <li key={i} className={`provenance-detail status-${detail.status}`}>
                  <span className="provenance-detail-icon" style={{ color: detailMeta.color }}>
                    <DetailIcon size={12} aria-hidden="true" />
                  </span>
                  <span className="provenance-detail-label">{detail.label}</span>
                  <span className="provenance-detail-value">{detail.value}</span>
                  {detail.note && <span className="provenance-detail-note">{detail.note}</span>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </li>
  );
}
