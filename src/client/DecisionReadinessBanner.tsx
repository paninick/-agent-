/**
 * client/DecisionReadinessBanner.tsx — 决策就绪度全局信号
 *
 * UX 第一优先级：用户进入仪表盘第一眼看到"能否下决策"。
 *
 * 设计决策（来自 UI/UX 专家论证）：
 * - 三态信号灯（ready/partial/waiting）作为页面签名元素
 * - 不堆砌硬数据：主文案用自然语言，副信息轻量
 * - 缺口列表可折叠，避免抢占注意力
 * - 色彩语义：mint=可执行 / amber=部分就绪 / red=等待补全
 * - 结构编码信息：脉冲点的颜色和频率映射就绪度等级
 *
 * 可访问性：
 * - role="status" 让屏幕阅读器播报状态变化
 * - 折叠按钮使用 aria-expanded
 * - 色彩 + 文字双重编码，不依赖颜色单独传递含义
 */

import React, { useState } from "react";
import { ChevronDown, AlertTriangle, CheckCircle2, Clock } from "lucide-react/dist/esm/lucide-react.mjs";
import type { DecisionReadiness, ReadinessLevel } from "./decisionTypes";

// === 等级元数据 ===
// 每个等级携带视觉、语义、动作建议三层信息
const LEVEL_META: Record<
  ReadinessLevel,
  {
    /** 主色 CSS 变量名 */
    colorVar: string;
    /** 脉冲频率（秒），ready 最慢表示稳定，waiting 最快表示紧迫 */
    pulseDuration: number;
    /** 状态图标 */
    Icon: React.ComponentType<{ size?: number; "aria-hidden"?: boolean | "true" | "false" }>;
    /** 主标语 — 自然语言，不堆数字 */
    headline: (ready: number, pending: number) => string;
    /** 状态标签文字（辅助色盲用户） */
    label: string;
  }
> = {
  ready: {
    colorVar: "--mint",
    pulseDuration: 2.4,
    Icon: CheckCircle2,
    headline: (ready) => `当前情报足以支撑 ${ready} 项 P0 决策`,
    label: "可执行",
  },
  partial: {
    colorVar: "--amber",
    pulseDuration: 1.6,
    Icon: Clock,
    headline: (ready, pending) =>
      `可执行 ${ready} 项 P0 决策，等待 ${pending} 项数据补全`,
    label: "部分就绪",
  },
  waiting: {
    colorVar: "--red",
    pulseDuration: 1.0,
    Icon: AlertTriangle,
    headline: (_ready, pending) =>
      `情报不足，等待 ${pending} 项关键数据补全后才能下决策`,
    label: "等待补全",
  },
};

interface DecisionReadinessBannerProps {
  readiness: DecisionReadiness;
  /** 点击缺口项时的回调，用于跳转到对应数据源配置 */
  onGapClick?: (gap: string, index: number) => void;
  /** 是否默认展开缺口列表 */
  defaultExpanded?: boolean;
}

export function DecisionReadinessBanner({
  readiness,
  onGapClick,
  defaultExpanded = false,
}: DecisionReadinessBannerProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const meta = LEVEL_META[readiness.level];
  const color = `var(${meta.colorVar})`;
  const { Icon } = meta;
  const hasGaps = readiness.gaps.length > 0;

  return (
    <section
      className="readiness-banner"
      role="status"
      aria-live="polite"
      aria-label={`决策就绪度：${meta.label}。${meta.headline(readiness.readyDecisions, readiness.pendingItems)}`}
      data-level={readiness.level}
      style={{ "--readiness-color": color, "--pulse-duration": `${meta.pulseDuration}s` } as React.CSSProperties}
    >
      {/* 信号灯：脉冲点 + 状态图标 + 文字标签（色盲冗余编码） */}
      <div className="readiness-signal">
        <span className="readiness-dot" aria-hidden="true" />
        <Icon size={18} aria-hidden="true" />
        <span className="readiness-label">{meta.label}</span>
      </div>

      {/* 主文案：自然语言，避免硬数据堆砌 */}
      <div className="readiness-headline">
        {meta.headline(readiness.readyDecisions, readiness.pendingItems)}
      </div>

      {/* 副信息：摘要 + 数字徽章 */}
      <div className="readiness-meta">
        <span className="readiness-summary">{readiness.summary}</span>
        <div className="readiness-badges" aria-hidden="true">
          <span className="readiness-badge readiness-badge-ready">
            <span className="readiness-badge-num">{readiness.readyDecisions}</span>
            <span className="readiness-badge-unit">可执行</span>
          </span>
          <span className="readiness-badge readiness-badge-pending">
            <span className="readiness-badge-num">{readiness.pendingItems}</span>
            <span className="readiness-badge-unit">待补全</span>
          </span>
        </div>
      </div>

      {/* 缺口列表：可折叠，避免抢占首屏注意力 */}
      {hasGaps && (
        <button
          type="button"
          className="readiness-toggle"
          aria-expanded={expanded}
          aria-controls="readiness-gaps-list"
          onClick={() => setExpanded((v) => !v)}
        >
          <ChevronDown
            size={14}
            aria-hidden="true"
            style={{
              transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.15s ease",
            }}
          />
          <span>{expanded ? "收起缺口清单" : `查看 ${readiness.gaps.length} 项数据缺口`}</span>
        </button>
      )}

      {hasGaps && expanded && (
        <ul className="readiness-gaps-list" id="readiness-gaps-list">
          {readiness.gaps.map((gap, idx) => (
            <li key={`${gap}-${idx}`} className="readiness-gap-item">
              <span className="readiness-gap-index" aria-hidden="true">
                {String(idx + 1).padStart(2, "0")}
              </span>
              <span className="readiness-gap-text">{gap}</span>
              {onGapClick && (
                <button
                  type="button"
                  className="readiness-gap-action"
                  onClick={() => onGapClick(gap, idx)}
                >
                  前往修复
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default DecisionReadinessBanner;
