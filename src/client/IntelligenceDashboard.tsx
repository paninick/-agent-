/**
 * client/IntelligenceDashboard.tsx - 情报蜂群仪表盘
 *
 * 全页情报仪表盘，整合：
 *   - 决策视图（默认首屏）：决策就绪度 + 决策中心 + 专业指标 + 行动建议
 *   - 分析视图：IntelligencePanel（核心采集 + 蜂群执行 + 简报）
 *   - KPI 卡片（数据源状态、任务统计、成本）
 *   - 任务历史队列（localStorage 持久化）
 *   - 证据链下钻抽屉（跨视图共用）
 *
 * 5 项结构性修订：
 *   1. 默认首屏 → 决策中心（待决策问题列表）
 *   2. 6 维度 → 7 维度（新增 policy/finance，"趋势"降级为横向属性）
 *   3. 机构分级 → 分级+评分+溯源链
 *   4. 硬数据策略 → "减少堆砌，保留可下钻原始数据"
 *   5. 布局 → 1 主 + 1 辅 + 抽屉
 */

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Radar, Database, DollarSign, Clock, History, Trash2,
  Target, ShieldCheck, Bot, Send, CheckCircle2, AlertTriangle, Zap,
  MessageCircle, ExternalLink, Pause, Play,
  LayoutDashboard, FlaskConical, Layers, GitBranch, Activity,
} from "lucide-react/dist/esm/lucide-react.mjs";
import { IntelligencePanel } from "./IntelligencePanel";
import { useCountUp } from "./useCountUp";
import type { StepEvent, DoneEvent } from "./useSwarmStream";
import { DecisionReadinessBanner } from "./DecisionReadinessBanner";
import { DecisionCenter } from "./DecisionCenter";
import { MetricsPanel } from "./MetricsPanel";
import { ActionAdvisePanel } from "./ActionAdvisePanel";
import { EvidenceChainDrawer } from "./EvidenceChainDrawer";
import {
  CollectionHealthPanel,
  DimensionCoveragePanel,
  PipelineStagesPanel,
} from "./AnalysisPanels";
import {
  createMockReadiness,
  type DecisionItem,
  type ActionAdvice,
  type ProfessionalMetric,
  type RawDataEntry,
  type DecisionReadiness,
  type ViewMode,
} from "./decisionTypes";
import { apiClient } from "./apiClient";

/** 分析视图子 Tab */
type AnalysisSubTab = "collection" | "dimension" | "pipeline" | "execution";

// === Types ===

type TaskHistoryEntry = {
  id: string;
  objective: string;
  timestamp: string;
  status: "completed" | "failed";
  sourcesCollected: number;
  confidence: number;
  cost: number;
  durationMs: number;
};

/** Done 事件中 result 字段的结构（镜像服务端 LiveSwarmResult 的子集） */
type LiveSwarmResultLite = {
  collectionLog?: Array<{ status: string }>;
  swarmRun?: {
    synthesis?: { confidence: number };
    costRecord?: { totalCost: number };
    results?: Array<{ evidenceList?: unknown[]; evidence?: unknown }>;
  };
};

// === Constants ===

const HISTORY_KEY = "intelligence-task-history";
const MAX_HISTORY = 50;

// Static agent metadata — display names and task descriptions
// Status is dynamic, driven by SSE stream events
const AGENT_META: { role: string; name: string; task: string }[] = [
  { role: "scout", name: "侦察员", task: "扫描需求与供应信号" },
  { role: "collector", name: "采集员", task: "汇聚 9 个可信数据源" },
  { role: "data_janitor", name: "数据清洁员", task: "去重、归一化、异常标记" },
  { role: "verifier", name: "验证员", task: "执行 6 道证据真实性门" },
  { role: "analyst", name: "分析员", task: "定位缺货根因与影响链" },
  { role: "devils_advocate", name: "魔鬼代言人", task: "寻找反证与替代解释" },
  { role: "adjudicator", name: "裁决员", task: "调整结论置信度" },
  { role: "reconciliation_scorer", name: "对账评分员", task: "校验业务维度一致性" },
  { role: "synthesizer", name: "综合员", task: "生成行动建议与简报" },
  { role: "memory", name: "记忆员", task: "沉淀结果并触发下一轮" },
];

// Map SSE status → Chinese display label
const STATUS_LABELS: Record<string, string> = {
  completed: "已完成",
  done_with_concerns: "已完成",
  failed: "失败",
  blocked: "阻塞",
  needs_context: "需补充",
  running: "运行中",
  idle: "待命",
};

// === Helpers ===

function loadHistory(): TaskHistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(entries: TaskHistoryEntry[]): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, MAX_HISTORY)));
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

// === Component ===

export function IntelligenceDashboard() {
  const [history, setHistory] = useState<TaskHistoryEntry[]>([]);
  const [automationPaused, setAutomationPaused] = useState(false);
  const [approvalStatus, setApprovalStatus] = useState<"pending" | "approved">("pending");

  // === Phase 1 MVP: 决策中心视图状态 ===
  const [viewMode, setViewMode] = useState<ViewMode>("decision");
  // Phase 2: 分析视图子 Tab（采集/维度/管道/执行）
  const [analysisSubTab, setAnalysisSubTab] = useState<AnalysisSubTab>("collection");
  const [decisions, setDecisions] = useState<DecisionItem[]>([]);
  const [advices, setAdvices] = useState<ActionAdvice[]>([]);
  const [metrics, setMetrics] = useState<ProfessionalMetric[]>([]);
  const [rawData, setRawData] = useState<RawDataEntry[]>([]);
  const [readiness, setReadiness] = useState<DecisionReadiness>(() => createMockReadiness());
  // 异步加载状态（apiClient + mock fallback）
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);

  // 证据链抽屉状态（跨视图共用）
  const [evidenceDrawer, setEvidenceDrawer] = useState<{
    isOpen: boolean;
    title: string;
    contextLabel?: string;
    evidenceIds: string[];
  }>({ isOpen: false, title: "", evidenceIds: [] });

  const openEvidence = useCallback(
    (title: string, evidenceIds: string[], contextLabel?: string) => {
      setEvidenceDrawer({ isOpen: true, title, contextLabel, evidenceIds });
    },
    []
  );

  const closeEvidence = useCallback(() => {
    setEvidenceDrawer((prev) => ({ ...prev, isOpen: false }));
  }, []);

  // 决策操作回调：本地立即更新 UI + 异步同步到后端（fire-and-forget）
  const handleDecisionAction = useCallback(
    (id: string, action: "accepted" | "rejected" | "deferred") => {
      setDecisions((prev) =>
        prev.map((d) => (d.id === id ? { ...d, status: action } : d))
      );
      // 异步同步到后端（失败时 apiClient 在 DEV 模式会 fallback，不影响 UI）
      void apiClient.updateDecisionStatus(id, action).catch(() => {
        // 静默失败：UI 已更新，后端可在下次刷新时同步
      });
    },
    []
  );

  // 建议操作回调：本地立即更新 UI + 异步同步到后端
  const handleAdviceAction = useCallback(
    (id: string, action: "accepted" | "rejected" | "deferred") => {
      setAdvices((prev) =>
        prev.map((a) => (a.id === id ? { ...a, status: action } : a))
      );
      void apiClient.updateAdviceStatus(id, action).catch(() => {
        // 静默失败
      });
    },
    []
  );

  // D8: Dynamic agent status — driven by SSE stream events from IntelligencePanel
  const [agentStatus, setAgentStatus] = useState<Record<string, string>>({});
  const [streaming, setStreaming] = useState(false);
  const [kpiData, setKpiData] = useState({ stockoutRate: 7.1, coverage: 0, confidence: 0, costUsd: 0, evidence: 0, steps: 0 });

  // Dynamic goal stages — "蜂群执行" stage reflects real-time progress
  const [goalStages, setGoalStages] = useState<{ label: string; value: string; state: string }[]>([
    { label: "业务目标", value: "降低补货缺货率", state: "active" },
    { label: "核心指标", value: "缺货率 ≤ 6.0%", state: "active" },
    { label: "蜂群执行", value: "10 步 · 待运行", state: "waiting" },
    { label: "自动化动作", value: "预警 → 审批 → 通知", state: "waiting" },
  ]);

  // KPI count-up animations
  const kpiStockout = useCountUp(kpiData.stockoutRate);
  const kpiCoverage = useCountUp(kpiData.coverage);
  const kpiConfidence = useCountUp(kpiData.confidence);
  const kpiEvidence = useCountUp(kpiData.evidence);
  const kpiSteps = useCountUp(kpiData.steps);

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  // === Phase 2 后端接入：通过 apiClient 加载决策中心数据 ===
  // 开发环境 API 失败时自动 fallback 到 createMock*（见 apiClient.ts）
  useEffect(() => {
    let cancelled = false;
    setDataLoading(true);
    setDataError(null);
    Promise.all([
      apiClient.getReadiness(),
      apiClient.getDecisions(),
      apiClient.getMetrics(),
      apiClient.getAdvices(),
      apiClient.getRawData(),
    ])
      .then(([r, d, m, a, raw]) => {
        if (cancelled) return;
        setReadiness(r);
        setDecisions(d);
        setMetrics(m);
        setAdvices(a);
        setRawData(raw);
        setDataLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setDataError(err instanceof Error ? err.message : String(err));
        setDataLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const clearHistory = useCallback(() => {
    if (typeof window !== "undefined" && window.confirm("清除所有历史记录？")) {
      localStorage.removeItem(HISTORY_KEY);
      setHistory([]);
    }
  }, []);

  // === SSE stream callbacks — fired by IntelligencePanel ===

  const handleStreamStep = useCallback((newSteps: StepEvent[]) => {
    setStreaming(true);
    setAgentStatus((prev) => {
      const updated = { ...prev };
      // Scout completed before orchestrator steps begin
      updated["scout"] = "已完成";
      // Set each completed step's status
      for (const s of newSteps) {
        updated[s.role] = STATUS_LABELS[s.status] ?? "已完成";
      }
      // Mark next agent as running
      const lastRole = newSteps[newSteps.length - 1].role;
      const lastIdx = AGENT_META.findIndex((a) => a.role === lastRole);
      if (lastIdx >= 0 && lastIdx + 1 < AGENT_META.length) {
        const nextRole = AGENT_META[lastIdx + 1].role;
        if (!updated[nextRole] || updated[nextRole] === "待命") {
          updated[nextRole] = "运行中";
        }
      }
      return updated;
    });
    // Update goal stage for execution progress
    const total = newSteps[0]?.total ?? 0;
    setGoalStages((prev) => {
      const updated = [...prev];
      if (total > 0) {
        updated[2] = {
          ...updated[2],
          value: `10 步 · ${newSteps.length}/${total} 完成`,
          state: newSteps.length >= total ? "active" : "running",
        };
      }
      return updated;
    });
  }, []);

  const handleStreamDone = useCallback((result: DoneEvent) => {
    setStreaming(false);
    // Finalize agent statuses
    setAgentStatus((prev) => {
      const updated = { ...prev };
      for (const meta of AGENT_META) {
        if (!updated[meta.role] || updated[meta.role] === "运行中" || updated[meta.role] === "待命") {
          updated[meta.role] = "已完成";
        }
      }
      return updated;
    });
    // Update goal stages
    setGoalStages((prev) => {
      const updated = [...prev];
      updated[2] = { ...updated[2], value: "10 步 · 已完成", state: "active" };
      updated[3] = { ...updated[3], state: "active" };
      return updated;
    });
    // Extract KPI data from done result
    const liveResult = result.result as LiveSwarmResultLite | undefined;
    if (liveResult?.collectionLog) {
      const collected = liveResult.collectionLog.filter((e) => e.status === "collected").length;
      const totalSources = liveResult.collectionLog.length;
      const coverage = totalSources > 0 ? Math.round((collected / totalSources) * 100) : 0;
      const confidence = liveResult.swarmRun?.synthesis
        ? Math.round(liveResult.swarmRun.synthesis.confidence * 100)
        : 0;
      const costUsd = liveResult.swarmRun?.costRecord?.totalCost ?? 0;
      const evidenceCount = (liveResult.swarmRun?.results ?? []).reduce((acc: number, r) => {
        return acc + (r.evidenceList?.length ?? (r.evidence ? 1 : 0));
      }, 0);
      const stepCount = liveResult.swarmRun?.results?.length ?? 0;
      setKpiData((prev) => ({ stockoutRate: prev.stockoutRate, coverage, confidence, costUsd, evidence: evidenceCount, steps: stepCount }));
    }
  }, []);

  // Compute active agent count for status pill
  const activeCount = Object.values(agentStatus).filter((s) => s === "运行中").length;

  // 构建 id→title 映射（用于冲突决策/建议的标题显示）
  const decisionTitleMap = useMemo(
    () => new Map(decisions.map((d) => [d.id, d.title])),
    [decisions]
  );
  const adviceTitleMap = useMemo(
    () => new Map(advices.map((a) => [a.id, a.title])),
    [advices]
  );

  // 决策/建议下钻回调：点击"查看证据"时打开抽屉
  const handleDecisionSelect = useCallback(
    (id: string) => {
      const decision = decisions.find((d) => d.id === id);
      if (decision) {
        openEvidence(
          `决策证据 - ${decision.title}`,
          decision.evidenceIds,
          `${decision.priority} ${decision.category} 决策`
        );
      }
    },
    [decisions, openEvidence]
  );

  const handleAdviceSelect = useCallback(
    (id: string) => {
      const advice = advices.find((a) => a.id === id);
      if (advice) {
        openEvidence(
          `建议证据 - ${advice.title}`,
          advice.evidenceIds,
          `${advice.priority} ${advice.type} 建议`
        );
      }
    },
    [advices, openEvidence]
  );

  const handleMetricDrillDown = useCallback(
    (metricId: string) => {
      const metric = metrics.find((m) => m.id === metricId);
      if (metric) {
        openEvidence(
          `指标证据 - ${metric.name}`,
          metric.evidenceIds,
          `${metric.dimension} 维度指标`
        );
      }
    },
    [metrics, openEvidence]
  );

  return (
    <section className="dashboard" aria-label="供应链情报中心">
      {/* Mast */}
      <header className="dashboard-mast">
        <div>
          <p className="dashboard-eyebrow">实时任务 · 01</p>
          <h1>供应链任务监控</h1>
          <p className="dashboard-subhead">华东零售补货任务 · 从信号发现到审批通知的可控自动化闭环</p>
        </div>
        <div className="mast-actions">
          <button className="quiet-action" type="button" onClick={() => setAutomationPaused((value) => !value)}>
            {automationPaused ? <Play size={14} /> : <Pause size={14} />}
            {automationPaused ? "恢复自动化" : "暂停自动化"}
          </button>
          <div className={`dashboard-signal ${automationPaused ? "is-paused" : ""}`}>
            <Radar size={18} aria-hidden="true" />
            <span>{automationPaused ? "已暂停" : streaming ? "采集中" : "实时运行"}</span>
          </div>
        </div>
      </header>

      {/* === 视图切换 Tab === */}
      <nav className="view-tabs" role="tablist" aria-label="仪表盘视图切换">
        <button
          type="button"
          role="tab"
          aria-selected={viewMode === "decision"}
          className={`view-tab ${viewMode === "decision" ? "active" : ""}`}
          onClick={() => setViewMode("decision")}
        >
          <LayoutDashboard size={14} aria-hidden="true" />
          决策视图
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={viewMode === "analysis"}
          className={`view-tab ${viewMode === "analysis" ? "active" : ""}`}
          onClick={() => setViewMode("analysis")}
        >
          <FlaskConical size={14} aria-hidden="true" />
          分析视图
        </button>
      </nav>

      {/* === 决策视图（默认首屏）=== */}
      {viewMode === "decision" && (
        <div className="view-panel" key="decision">
          {dataError && (
            <div className="data-error-banner" role="alert">
              <AlertTriangle size={14} aria-hidden="true" />
              数据加载失败：{dataError}（已降级到本地示例数据）
            </div>
          )}
          {dataLoading ? (
            <div className="data-loading" role="status" aria-label="数据加载中">
              <div className="data-loading-spinner" aria-hidden="true" />
              正在加载决策中心数据…
            </div>
          ) : (
            <>
          <DecisionReadinessBanner readiness={readiness} defaultExpanded />

          <DecisionCenter
            decisions={decisions}
            decisionTitleMap={decisionTitleMap}
            onAccept={(id) => handleDecisionAction(id, "accepted")}
            onReject={(id) => handleDecisionAction(id, "rejected")}
            onDefer={(id) => handleDecisionAction(id, "deferred")}
            onSelect={handleDecisionSelect}
          />

          <MetricsPanel
            metrics={metrics}
            onDrillDown={handleMetricDrillDown}
          />

          <ActionAdvisePanel
            advices={advices}
            adviceTitleMap={adviceTitleMap}
            onAccept={(id) => handleAdviceAction(id, "accepted")}
            onReject={(id) => handleAdviceAction(id, "rejected")}
            onDefer={(id) => handleAdviceAction(id, "deferred")}
            onSelect={handleAdviceSelect}
          />
            </>
          )}
        </div>
      )}

      {/* === 分析视图（保留原有仪表盘）=== */}
      {viewMode === "analysis" && (
        <div className="view-panel" key="analysis">
      <section className="mission-card" aria-label="当前业务目标">
        <div className="mission-copy">
          <span className="section-kicker"><Target size={14} /> 当前业务目标</span>
          <h2>未来 14 天将核心 SKU 缺货率从 8.4% 降至 6.0% 以下</h2>
          <p>覆盖上海、杭州、南京 42 家门店；优先保障夏季基础款，单轮自动化预算 ¥120。</p>
        </div>
        <div className="goal-gauge" aria-label="目标完成度 68%">
          <div className="goal-gauge-value">68<span>%</span></div>
          <div className="goal-gauge-track"><span /></div>
          <div className="goal-gauge-caption"><span>当前 {kpiStockout.toFixed(1)}%</span><span>目标 ≤ 6.0%</span></div>
        </div>
      </section>

      <div className="goal-chain" aria-label="目标执行链">
        {goalStages.map((stage, index) => (
          <div className={`goal-stage stage-${stage.state}`} key={stage.label}>
            <span className="goal-stage-index">0{index + 1}</span>
            <span className="goal-stage-label">{stage.label}</span>
            <strong>{stage.value}</strong>
          </div>
        ))}
      </div>

      {/* === Phase 2: 分析视图子 Tab === */}
      <nav className="analysis-subtabs" role="tablist" aria-label="分析视图子面板切换">
        <button
          type="button"
          role="tab"
          aria-selected={analysisSubTab === "collection"}
          className={`analysis-subtab ${analysisSubTab === "collection" ? "active" : ""}`}
          onClick={() => setAnalysisSubTab("collection")}
        >
          <Database size={13} aria-hidden="true" />
          采集健康
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={analysisSubTab === "dimension"}
          className={`analysis-subtab ${analysisSubTab === "dimension" ? "active" : ""}`}
          onClick={() => setAnalysisSubTab("dimension")}
        >
          <Layers size={13} aria-hidden="true" />
          7 维度覆盖
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={analysisSubTab === "pipeline"}
          className={`analysis-subtab ${analysisSubTab === "pipeline" ? "active" : ""}`}
          onClick={() => setAnalysisSubTab("pipeline")}
        >
          <GitBranch size={13} aria-hidden="true" />
          7 阶段管道
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={analysisSubTab === "execution"}
          className={`analysis-subtab ${analysisSubTab === "execution" ? "active" : ""}`}
          onClick={() => setAnalysisSubTab("execution")}
        >
          <Activity size={13} aria-hidden="true" />
          任务执行
        </button>
      </nav>

      {/* === 采集健康面板 === */}
      {analysisSubTab === "collection" && <CollectionHealthPanel />}

      {/* === 7 维度覆盖面板 === */}
      {analysisSubTab === "dimension" && <DimensionCoveragePanel />}

      {/* === 7 阶段管道面板 === */}
      {analysisSubTab === "pipeline" && <PipelineStagesPanel />}

      {/* === 蜂群执行面板（原有 KPI + 编队 + 审批 + 工作台）=== */}
      {analysisSubTab === "execution" && (
        <>
      {/* KPI Cards */}
      <div className="kpi-grid" role="list" aria-label="专业业务指标">
        <div className="kpi-card" role="listitem">
          <Target size={16} aria-hidden="true" />
          <span className="kpi-value">{kpiStockout.toFixed(1)}%</span>
          <span className="kpi-label">预测缺货率</span><small className="kpi-delta good">↓ 1.3pp</small>
        </div>
        <div className="kpi-card" role="listitem">
          <Database size={16} aria-hidden="true" />
          <span className="kpi-value">{kpiCoverage.toFixed(0)}%</span>
          <span className="kpi-label">证据覆盖率</span><small className="kpi-delta">{kpiEvidence.toFixed(0)} 条证据</small>
        </div>
        <div className="kpi-card" role="listitem">
          <ShieldCheck size={16} aria-hidden="true" />
          <span className="kpi-value">{kpiConfidence.toFixed(0)}%</span>
          <span className="kpi-label">结论置信度</span><small className="kpi-delta good">{kpiConfidence >= 70 ? "可执行" : "参考"}</small>
        </div>
        <div className="kpi-card" role="listitem">
          <DollarSign size={16} aria-hidden="true" />
          <span className="kpi-value">${kpiData.costUsd.toFixed(4)}</span>
          <span className="kpi-label">本轮成本</span><small className="kpi-delta">USD</small>
        </div>
        <div className="kpi-card" role="listitem">
          <Clock size={16} aria-hidden="true" />
          <span className="kpi-value">{kpiSteps.toFixed(0)}</span>
          <span className="kpi-label">执行步骤</span><small className="kpi-delta">{streaming ? "执行中" : "已完成"}</small>
        </div>
      </div>

      <div className="operations-grid">
        <section className="ops-panel swarm-roster" aria-labelledby="swarm-title">
          <header className="ops-panel-head">
            <div><span className="section-kicker"><Bot size={14} /> 执行进度</span><h2 id="swarm-title">10 步执行流程</h2></div>
            <span className={`status-pill ${streaming ? "live" : ""}`}>
              {streaming ? `${activeCount} active` : "就绪"}
            </span>
          </header>
          <div className="agent-grid">
            {AGENT_META.map((agent, index) => {
              const status = agentStatus[agent.role] ?? "待命";
              const stateClass = status === "运行中" ? "running" : status === "已完成" ? "done" : "waiting";
              return (
                <div className="agent-card" key={agent.role}>
                  <span className="agent-order">{String(index + 1).padStart(2, "0")}</span>
                  <div><strong>{agent.name}</strong><p>{agent.task}</p></div>
                  <span className={`agent-state ${stateClass}`}>{status}</span>
                </div>
              );
            })}
          </div>
        </section>

        <aside className="ops-side">
          <section className="ops-panel approval-panel" aria-labelledby="approval-title">
            <span className="section-kicker"><AlertTriangle size={14} /> 需要你的决定</span>
            <h2 id="approval-title">批准跨仓调拨 1,280 件</h2>
            <p>预计将缺货率降低 0.8pp，物流成本增加 ¥6,420。安全代理评估为中风险，可回滚。</p>
            <dl className="decision-facts"><div><dt>影响门店</dt><dd>12 家</dd></div><div><dt>置信度</dt><dd>87%</dd></div><div><dt>有效期</dt><dd>18 分钟</dd></div></dl>
            {approvalStatus === "pending" ? (
              <div className="decision-actions"><button type="button" className="primary" onClick={() => setApprovalStatus("approved")}>批准并执行</button><button type="button" className="secondary">查看证据</button></div>
            ) : <div className="approval-complete"><CheckCircle2 size={16} /> 已批准，执行代理正在创建调拨单</div>}
          </section>

          <section className="ops-panel channel-panel" aria-labelledby="channel-title">
            <header className="ops-panel-head"><div><span className="section-kicker"><Send size={14} /> 自动化触达</span><h2 id="channel-title">消息与审批渠道</h2></div><Zap size={16} /></header>
            <div className="channel-row"><span className="channel-icon wechat"><MessageCircle size={17} /></span><div><strong>企业微信</strong><p>缺货预警群 · 通知与回执</p></div><span className="status-pill mock">模拟适配器</span></div>
            <div className="channel-row"><span className="channel-icon feishu">飞</span><div><strong>飞书</strong><p>供应链审批 · 卡片交互</p></div><span className="status-pill mock">模拟适配器</span></div>
            <button className="channel-manage" type="button">管理自动化规则 <ExternalLink size={13} /></button>
            <p className="adapter-note">尚未连接真实服务。接入前需完成凭证保险库、验签、幂等重试、审批持久化与审计配置。</p>
          </section>
        </aside>
      </div>

      {/* Main content: IntelligencePanel */}
      <details className="analysis-workbench">
        <summary>打开任务工作台 <span>运行自定义目标、查看证据与成本明细</span></summary>
        <IntelligencePanel onStreamStep={handleStreamStep} onStreamDone={handleStreamDone} />
      </details>
        </>
      )}
      </div>
      )}

      {/* === /蜂群执行面板 === */}

      {/* Task History Queue */}
      {history.length > 0 ? (
        <details className="task-queue" open>
          <summary>
            <History size={15} aria-hidden="true" />
            <span>任务历史</span>
            <span className="task-queue-count">{history.length} 条</span>
            <button
              className="task-queue-clear"
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); clearHistory(); }}
              aria-label="清除历史记录"
            >
              <Trash2 size={13} aria-hidden="true" />
              清除
            </button>
          </summary>
          <div className="task-queue-body">
            <ol className="task-list">
              {history.map((entry) => (
                <li key={entry.id} className={`task-row task-${entry.status}`}>
                  <span className="task-row-time">{entry.timestamp.slice(11, 19)}</span>
                  <span className="task-row-objective">{entry.objective}</span>
                  <span className="task-row-sources">{entry.sourcesCollected} 源</span>
                  <span className="task-row-confidence">{(entry.confidence * 100).toFixed(0)}%</span>
                  <span className="task-row-cost">${entry.cost.toFixed(4)}</span>
                  <span className="task-row-duration">{(entry.durationMs / 1000).toFixed(1)}s</span>
                </li>
              ))}
            </ol>
          </div>
        </details>
      ) : null}

      {/* === 证据链下钻抽屉（跨视图共用）=== */}
      <EvidenceChainDrawer
        isOpen={evidenceDrawer.isOpen}
        onClose={closeEvidence}
        title={evidenceDrawer.title}
        contextLabel={evidenceDrawer.contextLabel}
        evidenceIds={evidenceDrawer.evidenceIds}
        rawData={rawData}
      />
    </section>
  );
}

export type { TaskHistoryEntry };
export { loadHistory, saveHistory };
