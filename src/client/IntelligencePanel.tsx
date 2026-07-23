/**
 * client/IntelligencePanel.tsx - 情报蜂群面板
 *
 * 调用 POST /api/intelligence/swarm，展示：
 *   - 采集日志（哪些源成功/skip/失败）
 *   - Scout 匹配的候选来源
 *   - 蜂群执行步骤（6 角色）
 *   - 综合简报（标题 + 置信度 + 正文）
 *   - 证据列表
 *   - 后续任务
 *
 * 独立组件 - 不修改 Launch Desk 的任何逻辑。
 */

import React, { useState, useEffect } from "react";
import { Radar, Play, Loader2, AlertCircle, Database, Layers, FileCheck, TrendingUp, FileText, Brain, ChevronRight, Workflow, Sparkles, Swords, Scale, BarChart3, Square } from "lucide-react/dist/esm/lucide-react.mjs";
import { WorkflowDesigner } from "./WorkflowDesigner";
import { useSwarmStream, type StepEvent, type DoneEvent } from "./useSwarmStream";

// === 类型定义（镜像服务端返回结构）===

type CollectionLogEntry = {
  sourceId: string;
  status: "collected" | "skipped_no_key" | "failed" | "not_implemented";
  recordCount: number;
  error?: string;
};

type EvidenceEntry = {
  id: string;
  sourceId: string;
  sourceTier: string;
  subject: string;
  claim: string;
  value?: number | string | boolean;
  unit?: string;
  period?: string;
  geography?: string;
};

type CleaningLogEntry = {
  evidenceId: string;
  field: string;
  transform: string;
  originalValue?: number | string;
  normalizedValue?: number | string;
  note: string;
  severity?: "info" | "warning" | "critical";
};

type DataJanitorOutput = {
  cleaningLog: CleaningLogEntry[];
  anomalyCount: number;
  outlierCount: number;
};

type ChallengeEntry = {
  findingId: string;
  signal: string;
  challengeType: string;
  alternativeExplanation: string;
  impactScore: number;
};

type DevilsAdvocateOutput = {
  challenges: ChallengeEntry[];
  overallWeakness: number;
};

type VerdictEntry = {
  findingId: string;
  signal: string;
  originalConfidence: number;
  adjustedConfidence: number;
  decision: "upheld" | "modified" | "rejected";
  reasoning: string;
};

type AdjudicatorOutput = {
  verdicts: VerdictEntry[];
  overallVerdict: "strong" | "moderate" | "weak" | "insufficient";
  summary: string;
};

type ReconciliationDimensionScore = {
  dimension: string;
  score: number;
  status: "matched" | "warning" | "mismatch" | "insufficient_data";
  details: string;
};

type ReconciliationScorerOutput = {
  dimensions: ReconciliationDimensionScore[];
  overallHealth: number;
  criticalMismatches: string[];
};

type AgentRunResult = {
  taskId: string;
  role: string;
  status: string;
  evidence?: EvidenceEntry;
  evidenceList?: EvidenceEntry[];
  finding?: { summary: string; confidence: number; signals: string[] };
  synthesis?: { title: string; brief: string; confidence: number; evidenceIds?: string[] };
  janitorOutput?: DataJanitorOutput;
  challenges?: DevilsAdvocateOutput;
  verdict?: AdjudicatorOutput;
  reconciliationScores?: ReconciliationScorerOutput;
  error?: string;
  concerns?: string[];
};

type SynthesisOutput = {
  title: string;
  brief: string;
  confidence: number;
  evidenceIds?: string[];
};

type FollowUpTask = {
  id: string;
  kind: "probe" | "task";
  objective: string;
  rationale: string;
};

type SwarmRunResult = {
  triggerId: string;
  results: AgentRunResult[];
  synthesis?: SynthesisOutput;
  followUps?: FollowUpTask[];
  costRecord?: { totalCost: number; modelCost: number; toolCost: number; mcpCost: number };
};

type LiveSwarmResult = {
  candidateSourceIds: string[];
  collectionLog: CollectionLogEntry[];
  rawRecordCount: number;
  swarmRun: SwarmRunResult;
};

type IntentInfo = {
  detectedIntent: string;
  assumptions: string[];
  riskLevel: string;
};

type BudgetInfo = {
  maxCostUsd: number;
  withinBudget: boolean;
};

type SwarmResponse = {
  ok: true;
  result: LiveSwarmResult;
  intent?: IntentInfo;
  budget?: BudgetInfo;
} | { ok: false; error: string; message: string };

// === 静态图标 ===

const radarIcon = <Radar size={18} aria-hidden="true" />;
const runIcon = <Play size={18} aria-hidden="true" />;
const spinnerIcon = <Loader2 size={18} className="spin" aria-hidden="true" />;
const errorIcon = <AlertCircle size={18} aria-hidden="true" />;
const dbIcon = <Database size={15} aria-hidden="true" />;
const layersIcon = <Layers size={15} aria-hidden="true" />;
const verifyIcon = <FileCheck size={15} aria-hidden="true" />;
const trendIcon = <TrendingUp size={15} aria-hidden="true" />;
const briefIcon = <FileText size={15} aria-hidden="true" />;
const brainIcon = <Brain size={15} aria-hidden="true" />;
const janitorIcon = <Sparkles size={15} aria-hidden="true" />;
const devilIcon = <Swords size={15} aria-hidden="true" />;
const judgeIcon = <Scale size={15} aria-hidden="true" />;
const scoreIcon = <BarChart3 size={15} aria-hidden="true" />;

const ROLE_ICONS: Record<string, React.ReactNode> = {
  scout: dbIcon,
  collector: layersIcon,
  data_janitor: janitorIcon,
  verifier: verifyIcon,
  analyst: trendIcon,
  devils_advocate: devilIcon,
  adjudicator: judgeIcon,
  reconciliation_scorer: scoreIcon,
  synthesizer: briefIcon,
  memory: brainIcon,
};

const STATUS_COLORS: Record<string, string> = {
  completed: "var(--mint)",
  done_with_concerns: "var(--amber)",
  failed: "var(--red)",
  blocked: "var(--red)",
  needs_context: "var(--amber)",
  running: "var(--cyan)",
};

const COLLECTION_ICONS: Record<string, string> = {
  collected: "✅",
  skipped_no_key: "⏭️",
  failed: "❌",
  not_implemented: "🚫",
};

// === 默认目标示例 ===

const DEFAULT_OBJECTIVE = "apparel cotton price cost transmission macro economic Vietnam Bangladesh";

// === 组件 ===

interface IntelligencePanelProps {
  /** Called when SSE stream produces new step data — for dashboard dynamic binding */
  onStreamStep?: (steps: StepEvent[]) => void;
  /** Called when SSE stream completes — for dashboard final state */
  onStreamDone?: (result: DoneEvent) => void;
}

export function IntelligencePanel({ onStreamStep, onStreamDone }: IntelligencePanelProps = {}) {
  const [objective, setObjective] = useState(DEFAULT_OBJECTIVE);
  const [packId, setPackId] = useState("apparel");
  const [validationError, setValidationError] = useState("");
  const { state: streamState, steps, finalResult, error: streamError, stream, abort, reset } = useSwarmStream();

  // Notify dashboard of step updates
  useEffect(() => {
    if (steps.length > 0) onStreamStep?.(steps);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps]);

  // Notify dashboard of completion
  useEffect(() => {
    if (finalResult) onStreamDone?.(finalResult);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finalResult]);

  // Derived state — reuse existing result rendering when done
  const loading = streamState === "streaming";
  const result: LiveSwarmResult | null =
    streamState === "done" && finalResult ? (finalResult.result as LiveSwarmResult) : null;
  const intent: IntentInfo | null = (finalResult?.intent as IntentInfo | undefined) ?? null;
  const budget: BudgetInfo | null = (finalResult?.budget as BudgetInfo | undefined) ?? null;
  const error =
    validationError
    || (streamState === "error" ? (streamError || "流式连接失败。") : "")
    || ((finalResult?.error as string | undefined) ?? "");

  const totalSteps = steps.length > 0 ? steps[0].total : 0;

  const runSwarm = async () => {
    if (objective.trim().length < 8) {
      setValidationError("目标描述至少 8 个字符。");
      return;
    }
    setValidationError("");
    reset();
    await stream(objective, packId);
  };

  const cancelStream = () => {
    abort();
  };

  // 从蜂群结果中提取所有证据
  const allEvidence: EvidenceEntry[] = [];
  if (result) {
    for (const r of result.swarmRun.results) {
      if (r.evidenceList) allEvidence.push(...r.evidenceList);
      else if (r.evidence) allEvidence.push(r.evidence);
    }
  }

  // 提取新 Agent 的产出
  const janitorResult = result?.swarmRun.results.find((r) => r.role === "data_janitor");
  const devilResult = result?.swarmRun.results.find((r) => r.role === "devils_advocate");
  const judgeResult = result?.swarmRun.results.find((r) => r.role === "adjudicator");
  const reconResult = result?.swarmRun.results.find((r) => r.role === "reconciliation_scorer");
  const janitorOutput = janitorResult?.janitorOutput;
  const challenges = devilResult?.challenges;
  const verdict = judgeResult?.verdict;
  const reconScores = reconResult?.reconciliationScores;

  // 采集统计
  const collected = result?.collectionLog.filter((e) => e.status === "collected").length ?? 0;
  const skipped = result?.collectionLog.filter((e) => e.status === "skipped_no_key").length ?? 0;
  const failed = result?.collectionLog.filter((e) => e.status === "failed").length ?? 0;
  const notImpl = result?.collectionLog.filter((e) => e.status === "not_implemented").length ?? 0;

  return (
    <section className="intel-panel" aria-label="任务执行面板">
      <div className="panel-heading">
        <span className="panel-title">INTELLIGENCE SWARM</span>
        <span className="panel-desc">从公开数据源采集真实情报，10 步管道产出综合简报。</span>
      </div>

      {/* 输入区 */}
      <div className="intel-input">
        <label className="intel-field" htmlFor="intel-objective-input">
          <span className="intel-field-label">情报目标 (Objective)</span>
          <textarea
            id="intel-objective-input"
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            placeholder="例: apparel cotton price cost transmission Vietnam Bangladesh"
            rows={3}
            spellCheck={false}
            aria-label="情报目标描述"
            aria-required="true"
            aria-invalid={!!error}
            aria-describedby={error ? "intel-error-msg" : undefined}
          />
        </label>
        <div className="intel-controls">
          <label className="intel-pack-select" htmlFor="intel-pack-select">
            <span className="intel-field-label">行业包</span>
            <select
              id="intel-pack-select"
              value={packId}
              onChange={(e) => setPackId(e.target.value)}
              aria-label="选择行业包"
            >
              <option value="apparel">Apparel (服装)</option>
            </select>
          </label>
          <button
            className="primary intel-run-btn"
            type="button"
            onClick={runSwarm}
            disabled={loading}
            aria-label="运行任务采集"
            aria-busy={loading}
          >
            {loading ? spinnerIcon : runIcon}
            {loading ? "采集中…" : "运行任务"}
          </button>
          {loading ? (
            <button
              className="quiet-action intel-cancel-btn"
              type="button"
              onClick={cancelStream}
              aria-label="取消采集中断流"
            >
              <Square size={14} aria-hidden="true" />
              取消
            </button>
          ) : null}
        </div>
      </div>

      {/* 错误 */}
      {error ? (
        <div className="error-banner" role="alert" id="intel-error-msg">
          {errorIcon}
          <span>{error}</span>
        </div>
      ) : null}

      {/* 结果 */}
      {result ? (
        <div className="intel-result" role="region" aria-label="任务采集结果">
          {/* 概览指标 */}
          <div className="intel-metrics" role="list" aria-label="采集指标概览">
            <div className="intel-metric" role="listitem">
              <span className="intel-metric-value">{collected}</span>
              <span className="intel-metric-label">采集成功</span>
            </div>
            <div className="intel-metric" role="listitem">
              <span className="intel-metric-value">{skipped}</span>
              <span className="intel-metric-label">缺 key 跳过</span>
            </div>
            <div className="intel-metric" role="listitem">
              <span className="intel-metric-value">{failed + notImpl}</span>
              <span className="intel-metric-label">失败/未实现</span>
            </div>
            <div className="intel-metric" role="listitem">
              <span className="intel-metric-value">{result.rawRecordCount}</span>
              <span className="intel-metric-label">RawRecord</span>
            </div>
            <div className="intel-metric" role="listitem">
              <span className="intel-metric-value">{allEvidence.length}</span>
              <span className="intel-metric-label">证据</span>
            </div>
            <div className="intel-metric" role="listitem">
              <span className="intel-metric-value">{result.swarmRun.results.length}</span>
              <span className="intel-metric-label">执行步骤</span>
            </div>
            {result.swarmRun.costRecord ? (
              <div
                className={`intel-metric intel-metric-cost ${budget && !budget.withinBudget ? "intel-metric-overrun" : ""}`}
                role="listitem"
                aria-label={`总成本 ${result.swarmRun.costRecord.totalCost.toFixed(4)} 美元${budget && !budget.withinBudget ? "，预算超支" : ""}`}
              >
                <span className="intel-metric-value">
                  ${result.swarmRun.costRecord.totalCost.toFixed(4)}
                </span>
                <span className="intel-metric-label">
                  {budget ? `预算 $${budget.maxCostUsd.toFixed(2)}` : "总成本"}
                  {budget && !budget.withinBudget ? " ⚠️ 超支" : ""}
                </span>
              </div>
            ) : null}
          </div>

          {/* 成本明细 */}
          {result.swarmRun.costRecord ? (
            <details className="intel-section intel-cost-breakdown">
              <summary>
                <span>成本明细</span>
                <span className="intel-section-count">
                  ${result.swarmRun.costRecord.totalCost.toFixed(4)}
                </span>
              </summary>
              <div className="intel-section-body">
                <div className="intel-cost-bars">
                  <div className="intel-cost-bar-item">
                    <span className="intel-cost-bar-label">模型</span>
                    <div className="intel-cost-bar-track">
                      <div
                        className="intel-cost-bar-fill intel-cost-bar-model"
                        style={{
                          width: `${(result.swarmRun.costRecord.modelCost / Math.max(result.swarmRun.costRecord.totalCost, 0.0001)) * 100}%`,
                        }}
                      />
                    </div>
                    <span className="intel-cost-bar-value">
                      ${result.swarmRun.costRecord.modelCost.toFixed(4)}
                    </span>
                  </div>
                  <div className="intel-cost-bar-item">
                    <span className="intel-cost-bar-label">工具</span>
                    <div className="intel-cost-bar-track">
                      <div
                        className="intel-cost-bar-fill intel-cost-bar-tool"
                        style={{
                          width: `${(result.swarmRun.costRecord.toolCost / Math.max(result.swarmRun.costRecord.totalCost, 0.0001)) * 100}%`,
                        }}
                      />
                    </div>
                    <span className="intel-cost-bar-value">
                      ${result.swarmRun.costRecord.toolCost.toFixed(4)}
                    </span>
                  </div>
                  <div className="intel-cost-bar-item">
                    <span className="intel-cost-bar-label">MCP</span>
                    <div className="intel-cost-bar-track">
                      <div
                        className="intel-cost-bar-fill intel-cost-bar-mcp"
                        style={{
                          width: `${(result.swarmRun.costRecord.mcpCost / Math.max(result.swarmRun.costRecord.totalCost, 0.0001)) * 100}%`,
                        }}
                      />
                    </div>
                    <span className="intel-cost-bar-value">
                      ${result.swarmRun.costRecord.mcpCost.toFixed(4)}
                    </span>
                  </div>
                </div>
                {budget ? (
                  <p className={`intel-cost-budget-line ${!budget.withinBudget ? "intel-cost-overrun" : ""}`}>
                    预算: ${budget.maxCostUsd.toFixed(2)} · 已用: {((result.swarmRun.costRecord.totalCost / budget.maxCostUsd) * 100).toFixed(1)}%
                    {!budget.withinBudget ? " ⚠️ 超支" : ""}
                  </p>
                ) : null}
              </div>
            </details>
          ) : null}

          {/* 意图编译结果 */}
          {intent ? (
            <div className="intel-intent-bar">
              <span className="intel-intent-badge">
                {intent.detectedIntent}
              </span>
              <span className="intel-intent-risk">风险: {intent.riskLevel}</span>
              <span className="intel-intent-assumptions">
                {intent.assumptions.length} 条假设
              </span>
            </div>
          ) : null}

          {/* 采集日志 */}
          <details className="intel-section" open>
            <summary>
              {dbIcon}
              <span>采集日志</span>
              <span className="intel-section-count">{result.collectionLog.length} 源</span>
            </summary>
            <div className="intel-section-body">
              {result.candidateSourceIds.length > 0 ? (
                <p className="intel-scout-match">
                  Scout 匹配: {result.candidateSourceIds.join(", ")}
                </p>
              ) : null}
              <ul className="intel-log-list">
                {result.collectionLog.map((entry, i) => (
                  <li key={`log-${i}`} className={`intel-log-item intel-log-${entry.status}`}>
                    <span className="intel-log-icon">{COLLECTION_ICONS[entry.status] ?? "❓"}</span>
                    <code className="intel-log-source">{entry.sourceId}</code>
                    <span className="intel-log-status">{entry.status}</span>
                    <span className="intel-log-count">{entry.recordCount} 条</span>
                    {entry.error ? <span className="intel-log-error">{entry.error}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          </details>

          {/* 蜂群执行步骤 */}
          <details className="intel-section" open>
            <summary>
              {layersIcon}
              <span>任务执行</span>
              <span className="intel-section-count">{result.swarmRun.results.length} 步</span>
            </summary>
            <div className="intel-section-body">
              <ol className="intel-step-list">
                {result.swarmRun.results.map((r, i) => {
                  const color = STATUS_COLORS[r.status] ?? "var(--ink-muted)";
                  const icon = ROLE_ICONS[r.role] ?? <ChevronRight size={15} aria-hidden="true" />;
                  return (
                    <li key={`step-${i}`} className="intel-step">
                      <span className="intel-step-icon">{icon}</span>
                      <span className="intel-step-role">{r.role}</span>
                      <span className="intel-step-status" style={{ color }}>
                        {r.status}
                      </span>
                      <span className="intel-step-detail">
                        {r.synthesis ? `→ "${r.synthesis.title}"` :
                         r.finding ? `→ ${r.finding.signals.length} signals (${(r.finding.confidence * 100).toFixed(0)}%)` :
                         r.evidence ? `→ ${r.evidence.subject}` :
                         r.evidenceList && r.evidenceList.length > 0 ? `→ ${r.evidenceList.length} evidence` :
                         r.error ? `→ ${r.error}` : ""}
                      </span>
                      {r.concerns && r.concerns.length > 0 ? (
                        <span className="intel-step-concerns">{r.concerns.join("; ")}</span>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            </div>
          </details>

          {/* Data Janitor 数据清洗日志 */}
          {janitorOutput && janitorOutput.cleaningLog.length > 0 ? (
            <details className="intel-section">
              <summary>
                {janitorIcon}
                <span>Data Janitor 清洗日志</span>
                <span className="intel-section-count">{janitorOutput.cleaningLog.length} 项</span>
              </summary>
              <div className="intel-section-body">
                <div className="intel-stats-row">
                  <span className="intel-stat">异常: {janitorOutput.anomalyCount}</span>
                  <span className="intel-stat">离群值: {janitorOutput.outlierCount}</span>
                </div>
                <ul className="intel-cleaning-list">
                  {janitorOutput.cleaningLog.slice(0, 10).map((entry, i) => (
                    <li key={`clean-${i}`} className="intel-cleaning-item">
                      <span className="intel-cleaning-severity" data-severity={entry.severity ?? "info"}>
                        {entry.severity ?? "info"}
                      </span>
                      <code className="intel-cleaning-evidence">{entry.evidenceId}</code>
                      <span className="intel-cleaning-action">{entry.transform}</span>
                      <span className="intel-cleaning-details">{entry.note}</span>
                    </li>
                  ))}
                </ul>
                {janitorOutput.cleaningLog.length > 10 && (
                  <p className="intel-section-more">还有 {janitorOutput.cleaningLog.length - 10} 条...</p>
                )}
              </div>
            </details>
          ) : null}

          {/* Devil's Advocate 魔鬼代言人质疑 */}
          {challenges && challenges.challenges.length > 0 ? (
            <details className="intel-section">
              <summary>
                {devilIcon}
                <span>Devil's Advocate 质疑</span>
                <span className="intel-section-count">{challenges.challenges.length} 项</span>
              </summary>
              <div className="intel-section-body">
                <div className="intel-stats-row">
                  <span className="intel-stat">整体弱点: {(challenges.overallWeakness * 100).toFixed(0)}%</span>
                </div>
                <ul className="intel-challenge-list">
                  {challenges.challenges.slice(0, 8).map((ch, i) => (
                    <li key={`ch-${i}`} className="intel-challenge-item">
                      <span className="intel-challenge-type">{ch.challengeType}</span>
                      <span className="intel-challenge-signal">{ch.signal}</span>
                      <span className="intel-challenge-impact">影响: {(ch.impactScore * 100).toFixed(0)}%</span>
                      <p className="intel-challenge-explanation">{ch.alternativeExplanation}</p>
                    </li>
                  ))}
                </ul>
                {challenges.challenges.length > 8 && (
                  <p className="intel-section-more">还有 {challenges.challenges.length - 8} 项...</p>
                )}
              </div>
            </details>
          ) : null}

          {/* Adjudicator 裁决结果 */}
          {verdict && verdict.verdicts.length > 0 ? (
            <details className="intel-section">
              <summary>
                {judgeIcon}
                <span>Adjudicator 裁决</span>
                <span className="intel-section-count">{verdict.verdicts.length} 项</span>
              </summary>
              <div className="intel-section-body">
                <div className="intel-stats-row">
                  <span className={`intel-verdict-badge intel-verdict-${verdict.overallVerdict}`}>
                    {verdict.overallVerdict}
                  </span>
                  <span className="intel-stat">{verdict.summary}</span>
                </div>
                <ul className="intel-verdict-list">
                  {verdict.verdicts.slice(0, 8).map((v, i) => (
                    <li key={`v-${i}`} className="intel-verdict-item">
                      <span className="intel-verdict-signal">{v.signal}</span>
                      <span className="intel-verdict-confidence">
                        {(v.originalConfidence * 100).toFixed(0)}% → {(v.adjustedConfidence * 100).toFixed(0)}%
                      </span>
                      <p className="intel-verdict-reasoning">{v.reasoning}</p>
                    </li>
                  ))}
                </ul>
                {verdict.verdicts.length > 8 && (
                  <p className="intel-section-more">还有 {verdict.verdicts.length - 8} 项...</p>
                )}
              </div>
            </details>
          ) : null}

          {/* Reconciliation Scorer 对账评分 */}
          {reconScores && reconScores.dimensions.length > 0 ? (
            <details className="intel-section">
              <summary>
                {scoreIcon}
                <span>Reconciliation 对账评分</span>
                <span className="intel-section-count">健康度: {reconScores.overallHealth.toFixed(0)}</span>
              </summary>
              <div className="intel-section-body">
                <div className="intel-stats-row">
                  <span className="intel-stat">整体健康度: <strong>{reconScores.overallHealth.toFixed(0)}/100</strong></span>
                  {reconScores.criticalMismatches.length > 0 && (
                    <span className="intel-stat intel-stat-warning">
                      关键不匹配: {reconScores.criticalMismatches.length}
                    </span>
                  )}
                </div>
                <div className="intel-recon-grid">
                  {reconScores.dimensions.map((dim, i) => (
                    <div key={`dim-${i}`} className="intel-recon-dimension">
                      <span className="intel-recon-name">{dim.dimension}</span>
                      <div className="intel-recon-bar">
                        <div
                          className={`intel-recon-fill intel-recon-${dim.status}`}
                          style={{ width: `${dim.score}%` }}
                        />
                      </div>
                      <span className="intel-recon-score">{dim.score.toFixed(0)}</span>
                      <span className={`intel-recon-status intel-status-${dim.status}`}>
                        {dim.status}
                      </span>
                    </div>
                  ))}
                </div>
                {reconScores.criticalMismatches.length > 0 && (
                  <div className="intel-critical-mismatches">
                    <strong>关键不匹配:</strong>
                    <ul>
                      {reconScores.criticalMismatches.slice(0, 5).map((cm, i) => (
                        <li key={`cm-${i}`}>{cm}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </details>
          ) : null}

          {/* 工作流图 */}
          <details className="intel-section">
            <summary>
              <Workflow size={15} aria-hidden="true" />
              <span>工作流图</span>
            </summary>
            <div className="intel-section-body">
              <WorkflowDesigner
                steps={result.swarmRun.results.map((r) => r.role)}
                results={result.swarmRun.results}
                costRecord={result.swarmRun.costRecord}
              />
            </div>
          </details>

          {/* 综合简报 */}
          {result.swarmRun.synthesis ? (
            <details className="intel-section intel-synthesis" open>
              <summary>
                {briefIcon}
                <span>综合简报</span>
                <span className="intel-confidence">
                  置信度 {(result.swarmRun.synthesis.confidence * 100).toFixed(1)}%
                </span>
              </summary>
              <div className="intel-section-body">
                <h3 className="intel-brief-title">{result.swarmRun.synthesis.title}</h3>
                <pre className="intel-brief-body">{result.swarmRun.synthesis.brief}</pre>
                {result.swarmRun.synthesis.evidenceIds && result.swarmRun.synthesis.evidenceIds.length > 0 ? (
                  <p className="intel-brief-evidence">关联证据: {result.swarmRun.synthesis.evidenceIds.length} 条</p>
                ) : null}
              </div>
            </details>
          ) : null}

          {/* 证据列表 */}
          {allEvidence.length > 0 ? (
            <details className="intel-section">
              <summary>
                {verifyIcon}
                <span>证据列表</span>
                <span className="intel-section-count">{allEvidence.length} 条</span>
              </summary>
              <div className="intel-section-body">
                <ul className="intel-evidence-list">
                  {allEvidence.map((ev, i) => (
                    <li key={`ev-${i}`} className="intel-evidence-item">
                      <div className="intel-evidence-header">
                        <span className={`intel-tier intel-tier-${ev.sourceTier}`}>{ev.sourceTier}</span>
                        <code className="intel-evidence-source">{ev.sourceId}</code>
                        <span className="intel-evidence-subject">{ev.subject}</span>
                      </div>
                      <p className="intel-evidence-claim">{ev.claim}</p>
                      {ev.value !== undefined ? (
                        <p className="intel-evidence-value">
                          值: {String(ev.value)}{ev.unit ? ` ${ev.unit}` : ""}
                          {ev.period ? ` (${ev.period})` : ""}
                          {ev.geography ? ` @ ${ev.geography}` : ""}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            </details>
          ) : null}

          {/* 后续任务 */}
          {result.swarmRun.followUps && result.swarmRun.followUps.length > 0 ? (
            <details className="intel-section">
              <summary>
                {brainIcon}
                <span>后续任务</span>
                <span className="intel-section-count">{result.swarmRun.followUps.length} 条</span>
              </summary>
              <div className="intel-section-body">
                <ul className="intel-followup-list">
                  {result.swarmRun.followUps.map((fu, i) => (
                    <li key={`fu-${i}`} className="intel-followup-item">
                      <span className={`intel-followup-kind intel-kind-${fu.kind}`}>{fu.kind}</span>
                      <span className="intel-followup-objective">{fu.objective}</span>
                      <span className="intel-followup-rationale">{fu.rationale}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </details>
          ) : null}
        </div>
      ) : loading ? (
        <div className="intel-streaming" role="region" aria-label="任务流式执行中" aria-live="polite">
          {/* Progress bar */}
          <div
            className="intel-stream-progress"
            role="progressbar"
            aria-valuenow={steps.length}
            aria-valuemax={totalSteps}
            aria-valuemin={0}
          >
            <div
              className="intel-stream-progress-bar"
              style={{ width: `${totalSteps > 0 ? (steps.length / totalSteps) * 100 : 0}%` }}
            />
            <span className="intel-stream-progress-text">{steps.length} / {totalSteps}</span>
          </div>

          {/* Phase indicator */}
          {steps.length === 0 ? (
            <div className="intel-stream-prefetch">
              {radarIcon}
              <p>Scout 匹配数据源 → 采集中…</p>
            </div>
          ) : (
            <div className="intel-stream-phase-bar">
              {steps[steps.length - 1]?.phase}
            </div>
          )}

          {/* Progressive step list */}
          {steps.length > 0 ? (
            <details className="intel-section" open>
              <summary>
                {layersIcon}
                <span>蜂群执行（流式中）</span>
                <span className="intel-section-count">{steps.length} / {totalSteps}</span>
              </summary>
              <div className="intel-section-body">
                <ol className="intel-step-list">
                  {steps.map((s, i) => {
                    const color = STATUS_COLORS[s.status] ?? "var(--ink-muted)";
                    const icon = ROLE_ICONS[s.role] ?? <ChevronRight size={15} aria-hidden="true" />;
                    const r = s.result as AgentRunResult | undefined;
                    return (
                      <li key={`stream-step-${i}`} className="intel-step intel-step-appearing">
                        <span className="intel-step-icon">{icon}</span>
                        <span className="intel-step-role">{s.role}</span>
                        <span className="intel-step-status" style={{ color }}>{s.status}</span>
                        <span className="intel-step-detail">
                          {r?.synthesis ? `→ "${r.synthesis.title}"` :
                           r?.finding ? `→ ${r.finding.signals.length} signals (${(r.finding.confidence * 100).toFixed(0)}%)` :
                           r?.evidence ? `→ ${r.evidence.subject}` :
                           r?.evidenceList && r.evidenceList.length > 0 ? `→ ${r.evidenceList.length} evidence` :
                           r?.error ? `→ ${r.error}` : ""}
                        </span>
                        {r?.concerns && r.concerns.length > 0 ? (
                          <span className="intel-step-concerns">{r.concerns.join("; ")}</span>
                        ) : null}
                      </li>
                    );
                  })}
                  {/* Skeleton placeholders for remaining steps */}
                  {Array.from({ length: Math.max(0, totalSteps - steps.length) }).map((_, i) => (
                    <li key={`skeleton-${i}`} className="intel-step intel-step-skeleton" aria-hidden="true">
                      <span className="intel-step-icon">{spinnerIcon}</span>
                      <span className="intel-step-role">等待中…</span>
                    </li>
                  ))}
                </ol>
              </div>
            </details>
          ) : null}
        </div>
      ) : (
        <div className="empty-state" role="status">
          {radarIcon}
          <p className="empty-title">尚未运行</p>
          <p>输入情报目标，点击"运行任务"开始采集真实数据。</p>
        </div>
      )}
    </section>
  );
}
