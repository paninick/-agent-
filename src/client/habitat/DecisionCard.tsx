/**
 * client/habitat/DecisionCard.tsx — 浮动决策卡
 *
 * Agent 主动走到用户互动边界时展示。
 * 包含：为什么现在问我、第一人称叙述、推荐引用块、权限等级、
 * 修改条件输入、操作按钮、自动授权选项。
 */

import { useCallback, useState } from "react";
import type { UserBoundaryRequest, AgentIdentity } from "./types";
import type { AutonomyLevel } from "../../domain/agentHabitat";

/** 5 级权限等级的中文标签 */
const AUTONOMY_LABELS: Record<AutonomyLevel, string> = {
  observe_only: "只观察",
  prepare_draft: "可准备草稿",
  ask_before_action: "每次询问",
  auto_within_limits: "预算内自动",
  denied: "禁止",
};

/**
 * 根据 request.kind 推断触发此次边界请求的当前权限等级。
 * 所有边界请求本质上都处于"每次询问"档位才会触发；
 * kind 参数保留用于未来按请求类型细化推断。
 */
function inferCurrentAutonomy(_kind: UserBoundaryRequest["kind"]): AutonomyLevel {
  return "ask_before_action";
}

/** 将 attempted 数组转为第一人称自然语言叙述 */
function narrateAttempted(attempted: string[]): string {
  if (attempted.length === 0) return "";
  return `我${attempted.join("，")}。`;
}

interface DecisionCardProps {
  request: UserBoundaryRequest;
  /** 请求发起的 Agent */
  requestingAgent?: AgentIdentity;
  /** 批准回调 */
  onApprove: (id: string) => void;
  /** 拒绝回调 */
  onReject: (id: string) => void;
  /** 自动授权回调 */
  onAutoAuthorize?: (id: string) => void;
}

export function DecisionCard({
  request,
  requestingAgent,
  onApprove,
  onReject,
  onAutoAuthorize,
}: DecisionCardProps) {
  const [adjustCondition, setAdjustCondition] = useState("");

  const handleApprove = useCallback(() => onApprove(request.id), [request.id, onApprove]);
  const handleReject = useCallback(() => onReject(request.id), [request.id, onReject]);
  const handleAuto = useCallback(() => {
    if (onAutoAuthorize) onAutoAuthorize(request.id);
  }, [request.id, onAutoAuthorize]);

  const deadlineText = request.deadline
    ? new Date(request.deadline).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })
    : "";

  const currentAutonomy = inferCurrentAutonomy(request.kind);
  const attemptedNarrative = narrateAttempted(request.attempted);
  const confidencePct = request.recommendation
    ? Math.max(0, Math.min(100, Math.round(request.recommendation.confidence * 100)))
    : 0;
  const confidenceColor =
    confidencePct >= 70 ? "#4BA89A" : confidencePct >= 40 ? "var(--amber)" : "#C75A4A";

  return (
    <div className="habitat-decision-card">
      <div className="habitat-decision-header">
        <div className="habitat-decision-title">{request.question}</div>
        {deadlineText && (
          <span className="habitat-decision-deadline">{deadlineText} 前回复</span>
        )}
      </div>

      {requestingAgent && (
        <div className="habitat-decision-agent">
          <span
            className="habitat-agent-dot"
            style={{ background: requestingAgent.accent }}
          />
          {requestingAgent.name} 已携带决策来到互动边界
        </div>
      )}

      {/* 为什么现在问我 */}
      {request.whyNow && (
        <div
          className="habitat-decision-why-now"
          style={{
            display: "flex",
            gap: "6px",
            padding: "6px 8px",
            background: "rgba(228, 168, 75, 0.06)",
            borderLeft: "2px solid var(--amber)",
            fontSize: "0.7rem",
            lineHeight: 1.4,
            color: "#cfd8d2",
          }}
        >
          <span
            className="habitat-decision-why-now-icon"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "14px",
              height: "14px",
              flexShrink: 0,
              marginTop: "1px",
              borderRadius: "50%",
              border: "1px solid var(--amber)",
              color: "var(--amber)",
              fontWeight: 700,
              fontSize: "0.6rem",
            }}
            aria-hidden
          >
            ?
          </span>
          <span>
            <span
              className="habitat-decision-why-now-label"
              style={{
                color: "var(--amber)",
                fontWeight: 600,
                marginRight: "4px",
              }}
            >
              为什么现在问我
            </span>
            {request.whyNow}
          </span>
        </div>
      )}

      <div className="habitat-decision-context">
        {attemptedNarrative && <p>{attemptedNarrative}</p>}
      </div>

      {/* 推荐引用块 */}
      {request.recommendation && (
        <div
          className="habitat-decision-recommendation"
          aria-live="polite"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "6px",
            padding: "8px 10px",
            background: "rgba(75, 168, 154, 0.06)",
            borderLeft: "3px solid #4BA89A",
          }}
        >
          <div
            className="habitat-decision-rec-head"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              flexWrap: "wrap",
            }}
          >
            <span
              className="habitat-decision-rec-label"
              style={{
                display: "inline-block",
                padding: "1px 6px",
                background: "rgba(75, 168, 154, 0.18)",
                border: "1px solid rgba(75, 168, 154, 0.5)",
                color: "#4BA89A",
                fontSize: "0.66rem",
                fontWeight: 700,
                borderRadius: "2px",
              }}
            >
              {request.recommendation.label}
            </span>
            <span
              className="habitat-decision-rec-confidence"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                color: "var(--ink-muted)",
                fontSize: "0.62rem",
              }}
            >
              <span>置信度</span>
              <span
                className="habitat-decision-confidence-bar"
                role="progressbar"
                aria-valuenow={confidencePct}
                aria-valuemin={0}
                aria-valuemax={100}
                style={{
                  display: "inline-block",
                  width: "48px",
                  height: "4px",
                  background: "rgba(255, 255, 255, 0.08)",
                  borderRadius: "2px",
                  overflow: "hidden",
                }}
              >
                <span
                  style={{
                    display: "block",
                    width: `${confidencePct}%`,
                    height: "100%",
                    background: confidenceColor,
                    transition: "width 0.2s ease",
                  }}
                />
              </span>
              <span style={{ color: "#eef2e8", fontWeight: 600 }}>{confidencePct}%</span>
            </span>
          </div>
          {request.recommendation.reason && (
            <div
              className="habitat-decision-rec-reason"
              style={{
                color: "#cfd8d2",
                fontSize: "0.74rem",
                lineHeight: 1.45,
              }}
            >
              {request.recommendation.reason}
            </div>
          )}
        </div>
      )}

      <div className="habitat-decision-meta">
        <div className="habitat-meta-item">
          <div className="habitat-meta-label">可撤销</div>
          <div className="habitat-meta-value" style={{ color: request.reversible ? "#4BA89A" : "#C75A4A" }}>
            {request.reversible ? "是" : "否"}
          </div>
        </div>
        {deadlineText && (
          <div className="habitat-meta-item">
            <div className="habitat-meta-label">截止时间</div>
            <div className="habitat-meta-value">{deadlineText} 前</div>
          </div>
        )}
        <div className="habitat-meta-item">
          <div className="habitat-meta-label">不回应</div>
          <div className="habitat-meta-value" style={{ fontSize: "0.68rem" }}>
            {request.consequencesOfNoResponse}
          </div>
        </div>
        {/* 权限等级：当前 → 提议 */}
        <div className="habitat-meta-item">
          <div className="habitat-meta-label">权限等级</div>
          <div
            className="habitat-meta-value habitat-decision-autonomy"
            style={{ fontSize: "0.68rem", lineHeight: 1.3 }}
          >
            {request.autonomyOffer ? (
              <span>
                <span style={{ color: "var(--ink-muted)" }}>当前：</span>
                <span>{AUTONOMY_LABELS[currentAutonomy]}</span>
                <span style={{ color: "var(--ink-muted)", margin: "0 4px" }}>→</span>
                <span style={{ color: "#7b9bef" }}>
                  {AUTONOMY_LABELS[request.autonomyOffer.proposedLevel]}
                </span>
              </span>
            ) : (
              <span>{AUTONOMY_LABELS[currentAutonomy]}</span>
            )}
          </div>
        </div>
      </div>

      {/* 修改条件输入框 */}
      <input
        className="habitat-decision-condition-input"
        type="text"
        name="adjustCondition"
        autoComplete="off"
        aria-label="调整条件"
        value={adjustCondition}
        onChange={(e) => setAdjustCondition(e.target.value)}
        placeholder="或者告诉我你想怎么调整…"
        style={{
          width: "100%",
          padding: "6px 8px",
          background: "rgba(11, 18, 32, 0.5)",
          border: "1px solid var(--line)",
          color: "#eef2e8",
          fontSize: "0.72rem",
          fontFamily: "inherit",
          outline: "none",
          transition: "border-color 0.15s ease",
        }}
      />

      <div className="habitat-decision-actions">
        <button className="habitat-btn-approve" onClick={handleApprove}>
          同意
        </button>
        <button className="habitat-btn-reject" onClick={handleReject}>
          再考虑
        </button>
      </div>

      {request.autonomyOffer && onAutoAuthorize && (
        <button className="habitat-btn-autonomy" onClick={handleAuto}>
          {request.autonomyOffer.label}（{request.autonomyOffer.limitDescription}）
        </button>
      )}
    </div>
  );
}
