/**
 * client/WorkflowDesigner.tsx - React Flow DAG 工作流可视化
 *
 * 从 NP3 (agent-os-2) 的 WorkflowDesigner 移植，适配 NP2 类型：
 *   - 输入：SwarmWorkflow 的 steps: AgentRole[] 线性序列
 *   - 叠加执行状态（从 swarmRun.results 映射）
 *   - 保持 NP2 CSS 变量体系（--panel, --line, --mint, --cyan, --amber, --red）
 *   - 不引入 Tailwind，纯 CSS 变量 + React Flow 内置样式
 */

import { useMemo, useState } from "react";
import { Background, Controls, ReactFlow, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

// === 类型（镜像服务端结构，避免跨模块导入）===

type AgentRole = "scout" | "collector" | "verifier" | "analyst" | "synthesizer" | "memory";

type AgentRunResultLite = {
  role: string;
  status: string;
};

type CostRecordLite = {
  totalCost: number;
  modelCost: number;
} | undefined;

interface WorkflowDesignerProps {
  /** 工作流步骤序列（角色名字符串） */
  steps: string[];
  /** 蜂群执行结果（可选，用于叠加状态） */
  results?: AgentRunResultLite[];
  /** 成本记录（可选，用于显示总成本） */
  costRecord?: CostRecordLite;
}

// === 角色元数据 ===

const ROLE_LABELS: Record<string, string> = {
  scout: "Scout",
  collector: "Collector",
  verifier: "Verifier",
  analyst: "Analyst",
  synthesizer: "Synthesizer",
  memory: "Memory",
};

const STATUS_COLORS: Record<string, string> = {
  completed: "var(--mint)",
  done_with_concerns: "var(--amber)",
  failed: "var(--red)",
  blocked: "var(--red)",
  needs_context: "var(--amber)",
  running: "var(--cyan)",
  pending: "var(--ink-muted)",
};

// === 组件 ===

export function WorkflowDesigner({ steps, results, costRecord }: Readonly<WorkflowDesignerProps>) {
  const [selectedIdx, setSelectedIdx] = useState(0);

  const { nodes, edges } = useMemo(() => {
    const nodeSpacing = { x: 220, y: 100 };
    const startIdx = steps.length > 5 ? 0 : 0;

    const flowNodes: Node[] = steps.map((role, index) => {
      const result = results?.[index];
      const state = result?.status ?? "pending";
      const color = STATUS_COLORS[state] ?? "var(--ink-muted)";
      const selected = selectedIdx === index;

      return {
        id: `node-${index}`,
        position: {
          x: (index - startIdx) * nodeSpacing.x,
          y: Math.floor((index - startIdx) / 4) * nodeSpacing.y,
        },
        data: {
          label: `${ROLE_LABELS[role] ?? role}`,
          state,
        },
        draggable: false,
        selectable: true,
        selected,
        style: {
          width: 160,
          borderRadius: 0,
          border: `1px solid ${selected ? "var(--cyan)" : "var(--line)"}`,
          background: "var(--panel-strong)",
          color,
          fontSize: "12px",
          fontWeight: 500,
          padding: "8px 12px",
          boxShadow: state === "running" ? "0 0 0 2px rgba(121,217,238,0.3)" : "none",
        },
        type: "default",
      };
    });

    const flowEdges: Edge[] = steps.slice(1).map((_, index) => ({
      id: `edge-${index}-${index + 1}`,
      source: `node-${index}`,
      target: `node-${index + 1}`,
      animated: true,
      style: { stroke: "var(--steel)", strokeWidth: 1.5 },
    }));

    return { nodes: flowNodes, edges: flowEdges };
  }, [steps, results, selectedIdx]);

  const selectedRole = steps[selectedIdx];
  const selectedResult = results?.[selectedIdx];
  const selectedState = selectedResult?.status ?? "pending";

  return (
    <div className="wf-designer" role="region" aria-label="工作流 DAG 可视化">
      <div className="wf-designer-header">
        <span className="wf-designer-title">WORKFLOW GRAPH</span>
        {costRecord ? (
          <span className="wf-cost-badge" aria-label={`总成本 ${costRecord.totalCost.toFixed(4)} 美元`}>
            ${costRecord.totalCost.toFixed(4)}
          </span>
        ) : null}
      </div>

      <div className="wf-flow-container">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          fitView
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={true}
          onNodeClick={(_, node) => {
            const idx = parseInt(node.id.split("-")[1] ?? "0", 10);
            setSelectedIdx(idx);
          }}
          proOptions={{ hideAttribution: true }}
          aria-label="蜂群工作流节点图"
        >
          <Background gap={16} size={1} color="var(--line)" />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>

      {/* 节点详情面板 */}
      <div className="wf-node-detail" role="status" aria-live="polite">
        <div className="wf-node-detail-row">
          <span className="wf-detail-label">角色</span>
          <span className="wf-detail-value">{ROLE_LABELS[selectedRole] ?? selectedRole}</span>
        </div>
        <div className="wf-node-detail-row">
          <span className="wf-detail-label">状态</span>
          <span
            className="wf-detail-value"
            style={{ color: STATUS_COLORS[selectedState] ?? "var(--ink-muted)" }}
          >
            {selectedState}
          </span>
        </div>
        <div className="wf-node-detail-row">
          <span className="wf-detail-label">步骤</span>
          <span className="wf-detail-value">{selectedIdx + 1} / {steps.length}</span>
        </div>
      </div>
    </div>
  );
}
