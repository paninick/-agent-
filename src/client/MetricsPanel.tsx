/**
 * client/MetricsPanel.tsx — 7维度专业指标解读卡
 *
 * 来自 UI/UX 专家论证：
 * - 每个指标必须暴露学科方法论（理论+公式+局限性）
 * - 不堆砌硬数据：sparkline + 基准区间 + 异常点构成视觉主线
 * - 方法论默认折叠，避免抢占注意力但保留可下钻信任链
 * - 7维度色系：price=琥珀/capacity=蓝/inventory=绿/trade=紫/policy=灰/finance=青/competition=粉
 *
 * 学科方法论是壁垒：每个指标都标注所属学科、理论、公式、适用场景、局限性
 * 这是项目"专业学科方法论融入"核心需求的最直接体现
 */

import React, { useMemo, useState } from "react";
import {
  BookOpen,
  ChevronDown,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronRight,
} from "lucide-react/dist/esm/lucide-react.mjs";
import type {
  ProfessionalMetric,
  MetricDimension,
  TrendPoint,
  AnomalyMark,
  Methodology,
} from "./decisionTypes";

// === 维度元数据 ===
// 7 维度色系：每个维度一个识别色 + 学科标签
const DIMENSION_META: Record<
  MetricDimension,
  { label: string; discipline: string; color: string }
> = {
  price: { label: "价格", discipline: "微观经济学", color: "#F59E0B" },
  capacity: { label: "产能", discipline: "生产理论", color: "#3B82F6" },
  inventory: { label: "库存", discipline: "运筹学", color: "#84CC16" },
  trade: { label: "贸易", discipline: "国际贸易学", color: "#8B5CF6" },
  policy: { label: "政策法规", discipline: "政策学", color: "#9CA3AF" },
  finance: { label: "汇率金融", discipline: "金融学", color: "#06B6D4" },
  competition: { label: "竞争", discipline: "产业组织理论", color: "#EC4899" },
};

// === Sparkline（内联SVG） ===
// 签名元素：每张指标卡顶部的趋势线，异常点用环形高亮
interface SparklineProps {
  data: TrendPoint[];
  color: string;
  anomalies: AnomalyMark[];
  width?: number;
  height?: number;
}

function Sparkline({ data, color, anomalies, width = 220, height = 48 }: SparklineProps) {
  // 计算路径：将数据点映射到 viewBox 坐标
  const { pathD, points, anomalyPoints } = useMemo(() => {
    if (data.length === 0) {
      return { pathD: "", points: [] as { x: number; y: number; ts: string; v: number }[], anomalyPoints: [] as { x: number; y: number; type: string }[] };
    }
    const values = data.map((d) => d.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1; // 避免除零
    const padding = 4;
    const innerH = height - padding * 2;
    const stepX = data.length > 1 ? (width - padding * 2) / (data.length - 1) : 0;

    const pts = data.map((d, i) => ({
      x: padding + i * stepX,
      y: padding + innerH - ((d.value - min) / range) * innerH,
      ts: d.timestamp,
      v: d.value,
    }));

    const dStr = pts
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(" ");

    // 异常点：通过 timestamp 匹配
    const anomPts = anomalies
      .map((a) => {
        const matchIdx = data.findIndex((d) => d.timestamp === a.timestamp);
        if (matchIdx < 0) return null;
        return { x: pts[matchIdx].x, y: pts[matchIdx].y, type: a.type };
      })
      .filter(Boolean) as { x: number; y: number; type: string }[];

    return { pathD: dStr, points: pts, anomalyPoints: anomPts };
  }, [data, anomalies, width, height]);

  if (data.length === 0) {
    return (
      <div className="metric-sparkline-empty" style={{ width, height }}>
        暂无趋势数据
      </div>
    );
  }

  return (
    <svg
      className="metric-sparkline"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {/* 渐变填充区域 */}
      <defs>
        <linearGradient id={`sparkline-grad-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.32" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* 趋势区域填充 */}
      {points.length > 1 && (
        <path
          d={`${pathD} L ${points[points.length - 1].x.toFixed(1)} ${height} L ${points[0].x.toFixed(1)} ${height} Z`}
          fill={`url(#sparkline-grad-${color.replace("#", "")})`}
          stroke="none"
        />
      )}
      {/* 趋势线 */}
      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* 数据点 */}
      {points.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={i === points.length - 1 ? 2.4 : 1.6}
          fill={color}
        />
      ))}
      {/* 异常点：环形高亮 */}
      {anomalyPoints.map((p, i) => (
        <circle
          key={`anom-${i}`}
          cx={p.x}
          cy={p.y}
          r="4"
          fill="none"
          stroke="var(--red)"
          strokeWidth="1.5"
        />
      ))}
    </svg>
  );
}

// === 基准区间条 ===
// 可视化当前值在基准 min-max 区间中的位置
function BenchmarkRange({
  value,
  benchmark,
  color,
  unit,
}: {
  value: number;
  benchmark: { min: number; max: number; label: string };
  color: string;
  unit: string;
}) {
  const { min, max } = benchmark;
  const range = max - min || 1;
  // 将 value 钳制到 [min - range*0.2, max + range*0.2] 以处理超界值
  const clamped = Math.max(min - range * 0.2, Math.min(max + range * 0.2, value));
  const pct = ((clamped - (min - range * 0.2)) / (range * 1.4)) * 100;
  const minPct = ((min - (min - range * 0.2)) / (range * 1.4)) * 100;
  const maxPct = ((max - (min - range * 0.2)) / (range * 1.4)) * 100;
  const inRange = value >= min && value <= max;

  return (
    <div className="metric-benchmark" aria-label={`当前值 ${value}${unit}，基准区间 ${min}-${max}${unit}`}>
      <div className="metric-benchmark-track" aria-hidden="true">
        {/* 基准区间：mint色实心段 */}
        <div
          className="metric-benchmark-range"
          style={{ left: `${minPct}%`, width: `${maxPct - minPct}%` }}
        />
        {/* 当前值标记 */}
        <div
          className={`metric-benchmark-marker ${inRange ? "in-range" : "out-of-range"}`}
          style={{ left: `${pct}%`, background: inRange ? color : "var(--red)" }}
        />
      </div>
      <div className="metric-benchmark-labels">
        <span className="metric-benchmark-min">{min}{unit}</span>
        <span className="metric-benchmark-zone">{benchmark.label}</span>
        <span className="metric-benchmark-max">{max}{unit}</span>
      </div>
    </div>
  );
}

// === 置信区间 ===
function ConfidenceIntervalBar({
  ci,
  value,
  color,
  unit,
}: {
  ci: { lower: number; upper: number; level: number };
  value: number;
  color: string;
  unit: string;
}) {
  const range = ci.upper - ci.lower || 1;
  const valuePct = ((value - ci.lower) / range) * 100;
  return (
    <div
      className="metric-ci"
      aria-label={`${ci.level}% 置信区间 ${ci.lower}-${ci.upper}${unit}，当前值 ${value}${unit}`}
    >
      <div className="metric-ci-track" aria-hidden="true">
        <div className="metric-ci-range" style={{ background: `color-mix(in srgb, ${color} 28%, transparent)` }} />
        <div
          className="metric-ci-marker"
          style={{ left: `${Math.max(0, Math.min(100, valuePct))}%`, background: color }}
        />
      </div>
      <div className="metric-ci-labels">
        <span>{ci.lower}{unit}</span>
        <span className="metric-ci-level">{ci.level}% CI</span>
        <span>{ci.upper}{unit}</span>
      </div>
    </div>
  );
}

// === 方法论披露（可折叠） ===
function MethodologyDisclosure({ methodology }: { methodology: Methodology }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="metric-methodology">
      <button
        type="button"
        className="metric-methodology-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <BookOpen size={13} aria-hidden="true" />
        <span className="metric-methodology-discipline">{methodology.discipline}</span>
        <span className="metric-methodology-theory">{methodology.theory}</span>
        <ChevronDown
          size={13}
          aria-hidden="true"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.15s", marginLeft: "auto" }}
        />
      </button>
      {open && (
        <div className="metric-methodology-body">
          <div className="metric-methodology-formula">
            <span className="metric-methodology-formula-label">公式</span>
            <code>{methodology.formula}</code>
          </div>
          <p className="metric-methodology-desc">{methodology.description}</p>
          {methodology.applicableScenarios.length > 0 && (
            <div className="metric-methodology-section">
              <span className="metric-methodology-section-label">适用场景</span>
              <ul className="metric-methodology-list">
                {methodology.applicableScenarios.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
          )}
          {methodology.limitations.length > 0 && (
            <div className="metric-methodology-section">
              <span className="metric-methodology-section-label">局限性</span>
              <ul className="metric-methodology-list metric-methodology-limitations">
                {methodology.limitations.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </div>
          )}
          {methodology.references && methodology.references.length > 0 && (
            <div className="metric-methodology-section">
              <span className="metric-methodology-section-label">参考文献</span>
              <ul className="metric-methodology-list metric-methodology-refs">
                {methodology.references.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// === 趋势方向图标 ===
function TrendDirectionIcon({ data }: { data: TrendPoint[] }) {
  if (data.length < 2) return <Minus size={13} aria-hidden="true" />;
  const first = data[0].value;
  const last = data[data.length - 1].value;
  const delta = last - first;
  const threshold = Math.abs(first) * 0.01 || 0.01;
  if (delta > threshold) return <TrendingUp size={13} aria-hidden="true" />;
  if (delta < -threshold) return <TrendingDown size={13} aria-hidden="true" />;
  return <Minus size={13} aria-hidden="true" />;
}

// === 单张指标卡 ===
interface MetricCardProps {
  metric: ProfessionalMetric;
  onDrillDown: (metricId: string) => void;
}

function MetricCard({ metric, onDrillDown }: MetricCardProps) {
  const dim = DIMENSION_META[metric.dimension];
  const accentColor = metric.color || dim.color;
  const lastTrend = metric.trend[metric.trend.length - 1];
  const firstTrend = metric.trend[0];
  const trendDelta = lastTrend && firstTrend ? lastTrend.value - firstTrend.value : 0;
  const trendPct = firstTrend && firstTrend.value !== 0
    ? ((trendDelta / Math.abs(firstTrend.value)) * 100).toFixed(1)
    : "0";

  return (
    <article
      className={`metric-card ${metric.isAbnormal ? "abnormal" : ""}`}
      style={{ "--metric-color": accentColor } as React.CSSProperties}
      aria-label={`${metric.name} 指标卡`}
    >
      {/* 头部：图标 + 名称 + 维度标签 + 异常标记 */}
      <header className="metric-card-head">
        <div className="metric-card-title-row">
          <span className="metric-card-icon" aria-hidden="true">{metric.icon}</span>
          <div className="metric-card-name-block">
            <h3 className="metric-card-name">{metric.name}</h3>
            <span className="metric-card-dim">
              <span className="metric-card-dim-label">{dim.label}</span>
              <span className="metric-card-dim-sep">·</span>
              <span className="metric-card-dim-discipline">{dim.discipline}</span>
            </span>
          </div>
        </div>
        {metric.isAbnormal && (
          <span className="metric-abnormal-badge" role="alert">
            <AlertTriangle size={12} aria-hidden="true" />
            <span>异常</span>
          </span>
        )}
      </header>

      {/* 数值区：大数字 + 单位 + 趋势变化 */}
      <div className="metric-card-value-row">
        <div className="metric-card-value-block">
          <span
            className="metric-card-value"
            style={{ color: accentColor }}
          >
            {metric.value}
          </span>
          <span className="metric-card-unit">{metric.unit}</span>
        </div>
        <div
          className={`metric-card-delta ${trendDelta > 0 ? "up" : trendDelta < 0 ? "down" : "flat"}`}
        >
          <TrendDirectionIcon data={metric.trend} />
          <span>
            {trendDelta > 0 ? "+" : ""}{trendPct}%
          </span>
        </div>
      </div>

      {/* Sparkline 趋势线 */}
      <div className="metric-card-sparkline">
        <Sparkline
          data={metric.trend}
          color={accentColor}
          anomalies={metric.anomalies}
        />
      </div>

      {/* 一句话解读 */}
      <p className="metric-card-interpretation">{metric.interpretation}</p>

      {/* 基准区间条 */}
      <BenchmarkRange
        value={metric.value}
        benchmark={metric.benchmark}
        color={accentColor}
        unit={metric.unit}
      />

      {/* 置信区间 */}
      <ConfidenceIntervalBar
        ci={metric.confidenceInterval}
        value={metric.value}
        color={accentColor}
        unit={metric.unit}
      />

      {/* 方法论披露（可折叠） */}
      <MethodologyDisclosure methodology={metric.methodology} />

      {/* 异常点说明 */}
      {metric.anomalies.length > 0 && (
        <div className="metric-anomalies">
          <span className="metric-anomalies-label">
            <AlertTriangle size={12} aria-hidden="true" />
            <span>{metric.anomalies.length} 个异常点</span>
          </span>
          <ul className="metric-anomalies-list">
            {metric.anomalies.map((a, i) => (
              <li key={i} className="metric-anomaly-item">
                <span className="metric-anomaly-type">{a.type}</span>
                <span className="metric-anomaly-note">{a.note}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 下钻按钮 */}
      <button
        type="button"
        className="metric-card-drilldown"
        onClick={() => onDrillDown(metric.id)}
      >
        <span>查看 {metric.evidenceIds.length} 条原始数据</span>
        <ChevronRight size={13} aria-hidden="true" />
      </button>
    </article>
  );
}

// === 主组件 ===
interface MetricsPanelProps {
  metrics: ProfessionalMetric[];
  /** 维度过滤 */
  dimensionFilter?: MetricDimension | "all";
  /** 是否只显示异常指标 */
  onlyAbnormal?: boolean;
  /** 点击下钻回调，打开证据链抽屉 */
  onDrillDown?: (metricId: string) => void;
}

export function MetricsPanel({
  metrics,
  dimensionFilter = "all",
  onlyAbnormal = false,
  onDrillDown = () => {},
}: MetricsPanelProps) {
  const [localDimFilter, setLocalDimFilter] = useState<MetricDimension | "all">(dimensionFilter);
  const [localOnlyAbnormal, setLocalOnlyAbnormal] = useState(onlyAbnormal);

  const visibleMetrics = useMemo(() => {
    let list = metrics.slice();
    if (localDimFilter !== "all") {
      list = list.filter((m) => m.dimension === localDimFilter);
    }
    if (localOnlyAbnormal) {
      list = list.filter((m) => m.isAbnormal);
    }
    return list;
  }, [metrics, localDimFilter, localOnlyAbnormal]);

  // 统计：按维度计数 + 异常数
  const stats = useMemo(() => {
    const byDim: Record<string, number> = {};
    let abnormalCount = 0;
    metrics.forEach((m) => {
      byDim[m.dimension] = (byDim[m.dimension] ?? 0) + 1;
      if (m.isAbnormal) abnormalCount++;
    });
    return { byDim, abnormalCount, total: metrics.length };
  }, [metrics]);

  return (
    <section className="metrics-panel" aria-label="专业指标面板">
      <header className="metrics-panel-head">
        <div className="metrics-panel-title">
          <h2>专业指标解读</h2>
          <span className="metrics-panel-subtitle">
            {stats.total} 项 / {stats.abnormalCount} 异常
          </span>
        </div>
        <div className="metrics-panel-filters">
          {/* 维度过滤 */}
          <label className="metric-filter">
            <span className="metric-filter-label">维度</span>
            <select
              value={localDimFilter}
              onChange={(e) => setLocalDimFilter(e.target.value as MetricDimension | "all")}
              aria-label="按维度过滤"
            >
              <option value="all">全部 ({stats.total})</option>
              {Object.entries(DIMENSION_META).map(([key, meta]) => (
                <option key={key} value={key}>
                  {meta.label} ({stats.byDim[key] ?? 0})
                </option>
              ))}
            </select>
          </label>
          {/* 只看异常 */}
          <label className="metric-filter-checkbox">
            <input
              type="checkbox"
              checked={localOnlyAbnormal}
              onChange={(e) => setLocalOnlyAbnormal(e.target.checked)}
            />
            <span>仅看异常 ({stats.abnormalCount})</span>
          </label>
        </div>
      </header>

      {visibleMetrics.length === 0 ? (
        <div className="metrics-panel-empty">
          <AlertTriangle size={28} aria-hidden="true" />
          <p className="empty-title">当前过滤条件下无指标</p>
          <p className="empty-hint">调整维度过滤或异常筛选条件查看更多指标。</p>
        </div>
      ) : (
        <div className="metric-card-grid">
          {visibleMetrics.map((m) => (
            <MetricCard key={m.id} metric={m} onDrillDown={onDrillDown} />
          ))}
        </div>
      )}
    </section>
  );
}

export default MetricsPanel;
