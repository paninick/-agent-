/**
 * client/habitat/TaskCore.tsx — 任务核心展示 + 拆解弹窗
 *
 * 中央显示当前需求，点击"展开工作路径"弹出子任务依赖关系。
 */

import { useState, useCallback, useEffect, useId, useRef, useMemo, type ReactNode } from "react";
import type { DynamicTask, AgentIdentity } from "./types";

interface TaskCoreProps {
  need: string;
  receivedAt: string;
  tasks: DynamicTask[];
  allAgents: AgentIdentity[];
  onExpand?: () => void;
}

const STATUS_DOT: Record<DynamicTask["status"], string> = {
  completed: "#4BA89A",
  running: "#4E72D8",
  waiting: "#C75A4A",
  blocked: "#C75A4A",
  queued: "#5f6e8a",
};

const STATUS_LABEL: Record<DynamicTask["status"], string> = {
  completed: "已完成",
  running: "进行中",
  waiting: "等待中",
  blocked: "阻塞",
  queued: "待开始",
};

interface TaskTreeNode {
  task: DynamicTask;
  children: TaskTreeNode[];
}

/**
 * 根据依赖关系构建任务树。
 * - dependsOn 为空的任务作为根节点（如"理解需求"）。
 * - 有依赖的任务挂到其第一个有效依赖下，保证每个任务只出现一次。
 */
function buildTaskTree(tasks: DynamicTask[]): TaskTreeNode[] {
  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const nodeMap = new Map<string, TaskTreeNode>();
  const roots: TaskTreeNode[] = [];

  // 按依赖数升序排序，保证父节点先创建，渲染顺序稳定。
  const ordered = [...tasks].sort(
    (a, b) => a.dependsOn.length - b.dependsOn.length,
  );

  for (const task of ordered) {
    nodeMap.set(task.id, { task, children: [] });
  }

  for (const task of ordered) {
    const node = nodeMap.get(task.id)!;
    const parentDepId = task.dependsOn.find((depId) => taskMap.has(depId));
    if (parentDepId) {
      const parent = nodeMap.get(parentDepId);
      if (parent) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    } else {
      roots.push(node);
    }
  }

  return roots;
}

/** 渲染单个树节点（递归）。 */
function renderTaskNode(
  node: TaskTreeNode,
  depth: number,
  agentMap: Map<string, AgentIdentity>,
  taskMap: Map<string, DynamicTask>,
): ReactNode {
  const { task, children } = node;
  const agents = task.assignedAgentIds
    .map((id) => agentMap.get(id))
    .filter((a): a is AgentIdentity => Boolean(a));
  const isRoot = depth === 0;
  const isCollab = task.assignedAgentIds.length > 1;
  const hasEvidence = task.evidenceIds.length > 0;
  const waitingDepNames = task.dependsOn
    .map((id) => taskMap.get(id)?.title)
    .filter((n): n is string => Boolean(n));
  const indent = depth * 22;

  return (
    <div key={task.id} className="habitat-task-tree-branch">
      <div
        className={`habitat-task-tree-item habitat-task-${task.status}`}
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          marginLeft: indent,
          gridTemplateColumns: "unset",
        }}
      >
        <span
          className="habitat-task-tree-dot"
          style={{
            background: STATUS_DOT[task.status],
            marginTop: 6,
          }}
        />
        <div className="habitat-task-tree-main" style={{ flex: 1, minWidth: 0 }}>
          <div
            className="habitat-task-tree-head"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              flexWrap: "wrap",
            }}
          >
            <span className="habitat-task-tree-title">{task.title}</span>
            <span
              className="habitat-task-tree-status"
              style={{
                color: STATUS_DOT[task.status],
                fontSize: "0.62rem",
                fontWeight: 600,
              }}
            >
              {STATUS_LABEL[task.status]}
            </span>
            {isRoot && (
              <span className="habitat-task-tree-badge habitat-task-tree-badge-root">
                规划者拆解
              </span>
            )}
            {isCollab && (
              <span className="habitat-task-tree-badge habitat-task-tree-badge-collab">
                协作
              </span>
            )}
            {hasEvidence && (
              <span className="habitat-task-tree-badge habitat-task-tree-badge-evidence">
                有证据
              </span>
            )}
          </div>

          {task.rationale && (
            <div
              className="habitat-task-tree-rationale"
              style={{
                marginTop: 4,
                color: "var(--ink-muted)",
                fontSize: "0.68rem",
                lineHeight: 1.4,
              }}
            >
              {task.rationale}
            </div>
          )}

          {task.status === "waiting" && waitingDepNames.length > 0 && (
            <div
              className="habitat-task-tree-waiting"
              style={{
                marginTop: 4,
                color: "#E4A84B",
                fontSize: "0.66rem",
              }}
            >
              等待 {waitingDepNames.join("、")} 完成
            </div>
          )}

          {agents.length > 0 && (
            <div
              className="habitat-task-tree-agents"
              style={{
                marginTop: 6,
                display: "flex",
                flexDirection: "column",
                gap: 3,
              }}
            >
              {agents.map((a) => (
                <span
                  key={a.id}
                  className="habitat-task-tree-agent"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    fontSize: "0.66rem",
                    color: "var(--ink-muted)",
                    flexWrap: "wrap",
                  }}
                >
                  <span
                    className="habitat-task-tree-agent-dot"
                    style={{
                      display: "inline-block",
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background: a.accent,
                      flexShrink: 0,
                    }}
                  />
                  <span
                    className="habitat-task-tree-agent-name"
                    style={{ color: "#cdd6e6", fontWeight: 600 }}
                  >
                    {a.name}
                  </span>
                  {a.purpose && (
                    <span className="habitat-task-tree-agent-purpose">
                      · {a.purpose}
                    </span>
                  )}
                  <span
                    className={`habitat-task-tree-tenure ${
                      a.tenure === "ephemeral"
                        ? "habitat-task-tree-tenure-ephemeral"
                        : "habitat-task-tree-tenure-resident"
                    }`}
                    style={{
                      padding: "1px 5px",
                      fontSize: "0.58rem",
                      fontWeight: 700,
                      letterSpacing: "0.04em",
                      border:
                        a.tenure === "ephemeral"
                          ? "1px solid rgba(228, 168, 75, 0.4)"
                          : "1px solid rgba(91, 112, 138, 0.4)",
                      background:
                        a.tenure === "ephemeral"
                          ? "rgba(228, 168, 75, 0.08)"
                          : "rgba(91, 112, 138, 0.08)",
                      color:
                        a.tenure === "ephemeral" ? "#E4A84B" : "#9fb0c9",
                    }}
                  >
                    {a.tenure === "ephemeral" ? "临时" : "常驻"}
                  </span>
                  {a.expiresWhen === "task_completed" && (
                    <span
                      className="habitat-task-tree-tenure habitat-task-tree-tenure-expire"
                      style={{
                        padding: "1px 5px",
                        fontSize: "0.58rem",
                        fontWeight: 700,
                        letterSpacing: "0.04em",
                        border: "1px solid rgba(75, 168, 154, 0.4)",
                        background: "rgba(75, 168, 154, 0.08)",
                        color: "#4BA89A",
                      }}
                    >
                      完成后解散
                    </span>
                  )}
                </span>
              ))}
            </div>
          )}
        </div>
        <span
          className="habitat-task-tree-progress"
          style={{ flexShrink: 0, marginTop: 2 }}
        >
          {task.status === "completed"
            ? "100%"
            : `${Math.round(task.progress * 100)}%`}
        </span>
      </div>

      {children.length > 0 && (
        <div
          className="habitat-task-tree-children"
          style={{
            marginLeft: indent + 11,
            paddingLeft: 11,
            borderLeft: "1px solid rgba(91, 112, 138, 0.25)",
          }}
        >
          {children.map((child) =>
            renderTaskNode(child, depth + 1, agentMap, taskMap),
          )}
        </div>
      )}
    </div>
  );
}

export function TaskCore({
  need,
  receivedAt,
  tasks,
  allAgents,
  onExpand,
}: TaskCoreProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const titleId = useId();
  const modalContentRef = useRef<HTMLDivElement>(null);

  const handleToggle = useCallback(() => {
    setModalOpen((v) => !v);
    if (onExpand && !modalOpen) onExpand();
  }, [modalOpen, onExpand]);

  const handleClose = useCallback(() => setModalOpen(false), []);

  // Escape 键关闭模态框
  useEffect(() => {
    if (!modalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setModalOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [modalOpen]);

  // 模态框打开时将焦点移到模态框内
  useEffect(() => {
    if (modalOpen && modalContentRef.current) {
      modalContentRef.current.focus();
    }
  }, [modalOpen]);

  // 使用 Intl.DateTimeFormat 格式化时间显示
  const receivedTimeText = useMemo(() => {
    const d = new Date(receivedAt);
    if (Number.isNaN(d.getTime())) return receivedAt;
    return new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  }, [receivedAt]);

  const agentMap = new Map(allAgents.map((a) => [a.id, a]));
  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const tree = buildTaskTree(tasks);

  return (
    <>
      <div className="habitat-task-core">
        <div className="habitat-task-core-text">{need}</div>
        <div className="habitat-task-core-sub">新需求 {receivedTimeText}</div>
        <button
          className="habitat-task-core-expand"
          onClick={handleToggle}
          aria-expanded={modalOpen}
          aria-haspopup="dialog"
        >
          展开工作路径
        </button>
      </div>

      {modalOpen && (
        <div className="habitat-modal-overlay" onClick={handleClose}>
          <div
            className="habitat-modal-content"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            ref={modalContentRef}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="habitat-modal-title" id={titleId}>工作路径</div>
            <div className="habitat-task-tree">
              {tree.length === 0 ? (
                <div
                  className="habitat-task-tree-empty"
                  style={{
                    color: "var(--ink-muted)",
                    fontSize: "0.74rem",
                    padding: "12px 4px",
                  }}
                >
                  暂无任务
                </div>
              ) : (
                tree.map((node) => renderTaskNode(node, 0, agentMap, taskMap))
              )}
            </div>
            <button className="habitat-modal-close" onClick={handleClose}>
              关闭
            </button>
          </div>
        </div>
      )}
    </>
  );
}
