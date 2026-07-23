/**
 * client/EvidenceChainDrawer.tsx — 决策证据链下钻抽屉
 *
 * 设计原则（1主+1辅+抽屉布局中的"抽屉"）：
 * - 从右侧滑入，覆盖式抽屉，宽度 min(560px, 92vw)
 * - 用户在 DecisionCenter / ActionAdvisePanel / MetricsPanel 点击"查看证据"时打开
 * - 显示两层信息：
 *   1) 证据链树（EvidenceChainNode）：来源→机构→验证→方法论 四类节点
 *   2) 原始数据条目（RawDataEntry）：机构等级、新鲜度、完整性、交叉验证状态
 * - 每个原始数据条目可展开查看验证说明和标准化值
 * - 颜色编码：
 *   - 机构等级 A=绿 B=青 C=琥珀 D=灰
 *   - 交叉验证 consistent=绿 deviation=琥珀 conflict=红
 *   - 新鲜度 0天=绿 1-3天=琥珀 >7天=红
 *   - 完整性 <0.7=红 0.7-0.9=琥珀 >0.9=绿
 *
 * 可访问性：
 * - role="dialog" aria-modal="true"
 * - ESC 键关闭
 * - 焦点陷阱（简化版：打开时聚焦关闭按钮）
 * - 点击遮罩关闭
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  X,
  ChevronRight,
  ChevronDown,
  Database,
  Building2,
  ShieldCheck,
  FlaskConical,
  Clock,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  ExternalLink,
  FileText,
  Layers,
} from "lucide-react/dist/esm/lucide-react.mjs";
import type {
  RawDataEntry,
  EvidenceChainNode,
} from "./decisionTypes";

// ============================================================
// Props
// ============================================================

export interface EvidenceChainDrawerProps {
  /** 是否打开 */
  isOpen: boolean;
  /** 关闭回调 */
  onClose: () => void;
  /** 抽屉标题（如"决策证据 - 越南面料供应商交货延迟"） */
  title: string;
  /** 上下文标签（如"P0 风险决策" / "critical 行动建议" / "原料传导率指标"） */
  contextLabel?: string;
  /** 关联的证据ID列表 */
  evidenceIds: string[];
  /** 原始数据池（从中按 evidenceIds 过滤） */
  rawData: RawDataEntry[];
  /** 可选：预构建的证据链树根节点 */
  evidenceChain?: EvidenceChainNode[];
}

// ============================================================
// 常量映射
// ============================================================

/** 机构等级徽章样式 */
const TIER_META: Record<
  RawDataEntry["tier"],
  { colorVar: string; label: string; description: string }
> = {
  A: { colorVar: "--mint", label: "A", description: "官方权威机构" },
  B: { colorVar: "--cyan", label: "B", description: "行业领先机构" },
  C: { colorVar: "--amber", label: "C", description: "一般可信来源" },
  D: { colorVar: "--ink-muted", label: "D", description: "待验证来源" },
};

/** 交叉验证状态样式 */
const VALIDATION_META: Record<
  RawDataEntry["crossValidation"],
  {
    colorVar: string;
    label: string;
    Icon: React.ComponentType<{
      size?: number;
      "aria-hidden"?: boolean | "true" | "false";
    }>;
  }
> = {
  consistent: { colorVar: "--mint", label: "一致", Icon: CheckCircle2 },
  deviation: { colorVar: "--amber", label: "偏离", Icon: AlertTriangle },
  conflict: { colorVar: "--red", label: "冲突", Icon: AlertCircle },
};

/** 证据链节点类型样式 */
const CHAIN_NODE_META: Record<
  EvidenceChainNode["type"],
  {
    colorVar: string;
    Icon: React.ComponentType<{
      size?: number;
      "aria-hidden"?: boolean | "true" | "false";
    }>;
    label: string;
  }
> = {
  source: { colorVar: "--cyan", Icon: Database, label: "数据源" },
  institution: { colorVar: "--mint", Icon: Building2, label: "机构" },
  validation: { colorVar: "--amber", Icon: ShieldCheck, label: "验证" },
  methodology: { colorVar: "--steel", Icon: FlaskConical, label: "方法论" },
};

// ============================================================
// 工具函数
// ============================================================

/** 新鲜度颜色 */
function freshnessColor(days: number): string {
  if (days <= 0) return "var(--mint)";
  if (days <= 3) return "var(--amber)";
  return "var(--red)";
}

/** 新鲜度文案 */
function freshnessLabel(days: number): string {
  if (days <= 0) return "实时";
  if (days === 1) return "1 天前";
  return `${days} 天前`;
}

/** 完整度颜色 */
function completenessColor(value: number): string {
  if (value >= 0.9) return "var(--mint)";
  if (value >= 0.7) return "var(--amber)";
  return "var(--red)";
}

/** 格式化时间 */
function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/** 从原始数据动态构建证据链树（当未提供 evidenceChain 时） */
function buildChainFromRawData(
  rawData: RawDataEntry[],
  evidenceIds: string[]
): EvidenceChainNode[] {
  const filtered = rawData.filter((d) => evidenceIds.includes(d.id));
  if (filtered.length === 0) return [];

  // 按机构分组
  const byInstitution = new Map<string, RawDataEntry[]>();
  for (const entry of filtered) {
    const list = byInstitution.get(entry.institution) ?? [];
    list.push(entry);
    byInstitution.set(entry.institution, list);
  }

  // 构建：来源根节点 → 机构节点 → 验证节点 → 方法论节点
  return [
    {
      id: "chain-root",
      type: "source",
      label: `证据来源（${filtered.length} 条原始数据）`,
      detail: `来自 ${byInstitution.size} 个机构的 ${filtered.length} 条原始数据`,
      children: Array.from(byInstitution.entries()).map(([inst, entries], i) => ({
        id: `chain-inst-${i}`,
        type: "institution",
        label: inst,
        detail: `等级 ${entries[0].tier} · ${entries.length} 条数据`,
        children: entries.map((e, j) => ({
          id: `chain-val-${i}-${j}`,
          type: "validation",
          label: `${e.dataType} · ${e.rawValue}`,
          detail:
            e.validationNote ??
            `交叉验证: ${VALIDATION_META[e.crossValidation].label}`,
          children: e.normalizedValue
            ? [
                {
                  id: `chain-meth-${i}-${j}`,
                  type: "methodology" as const,
                  label: "标准化处理",
                  detail: `标准化值: ${e.normalizedValue}`,
                },
              ]
            : undefined,
        })),
      })),
    },
  ];
}

// ============================================================
// 子组件：证据链树节点
// ============================================================

interface ChainNodeProps {
  node: EvidenceChainNode;
  depth: number;
  defaultExpanded?: boolean;
}

function ChainNode({ node, depth, defaultExpanded = true }: ChainNodeProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const meta = CHAIN_NODE_META[node.type];
  const hasChildren = node.children && node.children.length > 0;
  const { Icon } = meta;

  return (
    <div className="chain-node" style={{ "--chain-depth": depth } as React.CSSProperties}>
      <div
        className="chain-node-header"
        role={hasChildren ? "button" : undefined}
        tabIndex={hasChildren ? 0 : undefined}
        onClick={hasChildren ? () => setExpanded((v) => !v) : undefined}
        onKeyDown={
          hasChildren
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setExpanded((v) => !v);
                }
              }
            : undefined
        }
        aria-expanded={hasChildren ? expanded : undefined}
      >
        <span className="chain-node-toggle" aria-hidden="true">
          {hasChildren ? (
            expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
          ) : (
            <span className="chain-node-toggle-dot" />
          )}
        </span>
        <span className="chain-node-icon" style={{ color: `var(${meta.colorVar})` }}>
          <Icon size={14} aria-hidden="true" />
        </span>
        <span className="chain-node-label">{node.label}</span>
        <span className="chain-node-type-tag" style={{ color: `var(${meta.colorVar})` }}>
          {meta.label}
        </span>
      </div>
      <div className="chain-node-detail">{node.detail}</div>
      {hasChildren && expanded && (
        <div className="chain-node-children">
          {node.children!.map((child) => (
            <ChainNode key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// 子组件：原始数据条目
// ============================================================

interface RawDataItemProps {
  entry: RawDataEntry;
  index: number;
}

function RawDataItem({ entry, index }: RawDataItemProps) {
  const [expanded, setExpanded] = useState(false);
  const tierMeta = TIER_META[entry.tier];
  const valMeta = VALIDATION_META[entry.crossValidation];
  const { Icon: ValIcon } = valMeta;

  return (
    <article className="raw-data-item">
      <header
        className="raw-data-header"
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded((v) => !v);
          }
        }}
        aria-expanded={expanded}
        aria-controls={`raw-detail-${entry.id}`}
      >
        <span className="raw-data-index" aria-hidden="true">
          {String(index + 1).padStart(2, "0")}
        </span>
        <span
          className="raw-data-tier"
          style={{
            color: `var(${tierMeta.colorVar})`,
            borderColor: `var(${tierMeta.colorVar})`,
          }}
          title={tierMeta.description}
        >
          {tierMeta.label}
        </span>
        <span className="raw-data-institution">{entry.institution}</span>
        <span className="raw-data-type">{entry.dataType}</span>
        <span className="raw-data-toggle" aria-hidden="true">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
      </header>

      <div className="raw-data-body">
        <div className="raw-data-value-row">
          <span className="raw-data-value-label">原始值</span>
          <span className="raw-data-value">{entry.rawValue}</span>
        </div>
        {entry.normalizedValue !== undefined && (
          <div className="raw-data-value-row raw-data-normalized">
            <span className="raw-data-value-label">标准化值</span>
            <span className="raw-data-value">{entry.normalizedValue}</span>
          </div>
        )}

        <div className="raw-data-meta-row">
          <div className="raw-data-meta-item" title="数据新鲜度">
            <Clock size={12} aria-hidden="true" />
            <span style={{ color: freshnessColor(entry.freshnessDays) }}>
              {freshnessLabel(entry.freshnessDays)}
            </span>
          </div>
          <div className="raw-data-meta-item" title="字段完整性">
            <span className="raw-data-completeness-label">完整性</span>
            <span className="raw-data-completeness-track" aria-hidden="true">
              <span
                className="raw-data-completeness-fill"
                style={{
                  width: `${Math.round(entry.completeness * 100)}%`,
                  background: completenessColor(entry.completeness),
                }}
              />
            </span>
            <span
              className="raw-data-completeness-num"
              style={{ color: completenessColor(entry.completeness) }}
            >
              {Math.round(entry.completeness * 100)}%
            </span>
          </div>
          <div
            className="raw-data-meta-item raw-data-validation"
            style={{ color: `var(${valMeta.colorVar})` }}
            title={`交叉验证: ${valMeta.label}`}
          >
            <ValIcon size={12} aria-hidden="true" />
            <span>{valMeta.label}</span>
          </div>
          <div className="raw-data-meta-item raw-data-time" title="采集时间">
            <FileText size={12} aria-hidden="true" />
            <span>{formatTime(entry.collectedAt)}</span>
          </div>
        </div>

        {expanded && entry.validationNote && (
          <div id={`raw-detail-${entry.id}`} className="raw-data-detail">
            <span className="raw-data-detail-label">验证说明</span>
            <p className="raw-data-detail-text">{entry.validationNote}</p>
          </div>
        )}

        {expanded && (
          <div className="raw-data-source-id">
            <ExternalLink size={11} aria-hidden="true" />
            <span>sourceId: {entry.sourceId}</span>
          </div>
        )}
      </div>
    </article>
  );
}

// ============================================================
// 主组件
// ============================================================

export function EvidenceChainDrawer({
  isOpen,
  onClose,
  title,
  contextLabel,
  evidenceIds,
  rawData,
  evidenceChain,
}: EvidenceChainDrawerProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  // ESC 键关闭
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  // 打开时聚焦关闭按钮
  useEffect(() => {
    if (isOpen) {
      // 延迟一帧以等待 DOM 渲染
      requestAnimationFrame(() => {
        closeButtonRef.current?.focus();
      });
    }
  }, [isOpen]);

  // 阻止背景滚动
  useEffect(() => {
    if (!isOpen) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [isOpen]);

  // 过滤相关原始数据
  const filteredRawData = useMemo(() => {
    if (evidenceIds.length === 0) return [];
    return rawData.filter((d) => evidenceIds.includes(d.id));
  }, [rawData, evidenceIds]);

  // 构建证据链树
  const chainTree = useMemo(() => {
    if (evidenceChain && evidenceChain.length > 0) return evidenceChain;
    return buildChainFromRawData(rawData, evidenceIds);
  }, [evidenceChain, rawData, evidenceIds]);

  // 统计
  const stats = useMemo(() => {
    const total = filteredRawData.length;
    const tierA = filteredRawData.filter((d) => d.tier === "A").length;
    const consistent = filteredRawData.filter(
      (d) => d.crossValidation === "consistent"
    ).length;
    const avgCompleteness =
      total > 0
        ? filteredRawData.reduce((s, d) => s + d.completeness, 0) / total
        : 0;
    const maxFreshness = total > 0 ? Math.max(...filteredRawData.map((d) => d.freshnessDays)) : 0;
    return { total, tierA, consistent, avgCompleteness, maxFreshness };
  }, [filteredRawData]);

  if (!isOpen) return null;

  return (
    <div
      className="evidence-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="presentation"
    >
      <aside
        ref={drawerRef}
        className="evidence-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="evidence-title"
      >
        {/* === Header === */}
        <header className="evidence-header">
          <div className="evidence-header-text">
            <div className="evidence-eyebrow">
              <Layers size={12} aria-hidden="true" />
              <span>证据链下钻</span>
              {contextLabel && (
                <span className="evidence-context-tag">{contextLabel}</span>
              )}
            </div>
            <h2 id="evidence-title" className="evidence-title">
              {title}
            </h2>
          </div>
          <button
            ref={closeButtonRef}
            className="evidence-close"
            onClick={onClose}
            aria-label="关闭证据链抽屉"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        {/* === Stats Bar === */}
        <div className="evidence-stats">
          <div className="evidence-stat">
            <span className="evidence-stat-num">{stats.total}</span>
            <span className="evidence-stat-label">原始数据</span>
          </div>
          <div className="evidence-stat">
            <span className="evidence-stat-num" style={{ color: "var(--mint)" }}>
              {stats.tierA}
            </span>
            <span className="evidence-stat-label">A 级来源</span>
          </div>
          <div className="evidence-stat">
            <span className="evidence-stat-num" style={{ color: "var(--mint)" }}>
              {stats.consistent}
            </span>
            <span className="evidence-stat-label">交叉验证一致</span>
          </div>
          <div className="evidence-stat">
            <span
              className="evidence-stat-num"
              style={{ color: completenessColor(stats.avgCompleteness) }}
            >
              {Math.round(stats.avgCompleteness * 100)}%
            </span>
            <span className="evidence-stat-label">平均完整度</span>
          </div>
          <div className="evidence-stat">
            <span
              className="evidence-stat-num"
              style={{ color: freshnessColor(stats.maxFreshness) }}
            >
              {stats.maxFreshness}d
            </span>
            <span className="evidence-stat-label">最新鲜度</span>
          </div>
        </div>

        {/* === Body: 可滚动 === */}
        <div className="evidence-body">
          {filteredRawData.length === 0 ? (
            <div className="evidence-empty">
              <Database size={32} aria-hidden="true" />
              <p>暂无关联的原始数据</p>
              <span>证据 ID: {evidenceIds.join(", ") || "无"}</span>
            </div>
          ) : (
            <>
              {/* === 证据链树 === */}
              {chainTree.length > 0 && (
                <section className="evidence-section">
                  <h3 className="evidence-section-title">
                    <Layers size={13} aria-hidden="true" />
                    证据链
                  </h3>
                  <div className="evidence-chain-tree">
                    {chainTree.map((node) => (
                      <ChainNode key={node.id} node={node} depth={0} />
                    ))}
                  </div>
                </section>
              )}

              {/* === 原始数据列表 === */}
              <section className="evidence-section">
                <h3 className="evidence-section-title">
                  <Database size={13} aria-hidden="true" />
                  原始数据条目
                  <span className="evidence-section-count">
                    {filteredRawData.length}
                  </span>
                </h3>
                <div className="raw-data-list">
                  {filteredRawData.map((entry, i) => (
                    <RawDataItem key={entry.id} entry={entry} index={i} />
                  ))}
                </div>
              </section>
            </>
          )}
        </div>

        {/* === Footer === */}
        <footer className="evidence-footer">
          <span className="evidence-footer-note">
            点击条目展开查看验证说明与标准化详情
          </span>
          <button className="evidence-footer-close secondary" onClick={onClose}>
            关闭
          </button>
        </footer>
      </aside>
    </div>
  );
}

export default EvidenceChainDrawer;
