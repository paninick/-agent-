/**
 * client/habitat/WorkspaceCanvas.tsx — Canvas 2D 活动空间渲染层
 *
 * 纯渲染组件，无业务逻辑。接收位置和动画参数，绘制：
 * - 背景渐变 + 网格 + 浮动粒子
 * - Squad 集群环形光晕 + 阶段标签 + 进度弧 + 对峙光带
 * - Squad 内部证据流连线（含对峙红色虚线）
 * - 常驻 Agent 光体 + 标签
 * - 临时 Agent 光体 + 进度条
 * - 任务核心脉冲环
 * - Agent 间连接线 + 流动光点
 *
 * 集群渲染委托给 squadRenderer.ts，本文件只负责动画循环和组合。
 */

import { useRef, useEffect, useCallback } from "react";
import type { AgentIdentity, AgentRenderPosition, SquadRenderGroup, SquadEvidenceFlow } from "./types";
import { drawSquadHalo, drawSquadFlows } from "./squadRenderer";
import { getStateVisual, computeStateScale } from "./habitatStates";
import type { StateVisual } from "./habitatStates";
import type { HabitatAgentState } from "../../domain/agentHabitat";

interface WorkspaceCanvasProps {
  residents: AgentIdentity[];
  ephemerals: AgentIdentity[];
  residentPositions: AgentRenderPosition[];
  ephemeralPositions: AgentRenderPosition[];
  taskCoreX: number;
  taskCoreY: number;
  /** 连线关系：[fromId, toId, color, isDashed] */
  connections: Array<[string, string, string, boolean]>;
  /** Squad 集群渲染组 */
  squadGroups: SquadRenderGroup[];
  /** Squad 内部证据流 */
  squadFlows: SquadEvidenceFlow[];
  /** 是否启用动画 */
  animate: boolean;
  /** 是否减少动画 */
  reduced: boolean;
}

interface AgentDrawData {
  id: string;
  px: number;
  py: number;
  color: string;
  name: string;
  stateText: string;
  state: HabitatAgentState;
  stateVisual: StateVisual;
  radius: number;
  alpha: number;
  phaseOffset: number;
  progress?: number;
}

export function WorkspaceCanvas({
  residents,
  ephemerals,
  residentPositions,
  ephemeralPositions,
  taskCoreX,
  taskCoreY,
  connections,
  squadGroups,
  squadFlows,
  animate,
  reduced,
}: WorkspaceCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);
  const timeRef = useRef(0);

  const getPos = useCallback(
    (id: string, positions: AgentRenderPosition[]): { x: number; y: number } | undefined => {
      return positions.find((p) => p.agentId === id);
    },
    []
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let running = true;

    function resize() {
      if (!canvas || !ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (!rect) return;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = rect.width + "px";
      canvas.style.height = rect.height + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    resize();
    window.addEventListener("resize", resize);

    function drawAgentBody(
      x: number, y: number, radius: number, color: string,
      alpha: number, time: number, phaseOffset: number,
      sv: StateVisual, showProgress?: number
    ) {
      if (!ctx) return;
      // 根据状态动效计算缩放（替代统一呼吸）
      const scale = computeStateScale(sv.motion, time, phaseOffset, reduced);
      const r = radius * scale;

      // === 外环：根据 ringStyle 差异化 ===
      ctx.save();
      const ringColor = sv.stateColor;
      switch (sv.ringStyle) {
        case "solid":
          ctx.strokeStyle = ringColor + "40";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(x, y, r * 1.35, 0, Math.PI * 2);
          ctx.stroke();
          break;
        case "dashed":
          // 阻塞：红色虚线外环
          ctx.strokeStyle = ringColor + "99";
          ctx.lineWidth = 1.2;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.arc(x, y, r * 1.4, 0, Math.PI * 2);
          ctx.stroke();
          break;
        case "double":
          // 思考/计划/协作：双环（外细 + 内细，内环可旋转）
          ctx.strokeStyle = ringColor + "30";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(x, y, r * 1.45, 0, Math.PI * 2);
          ctx.stroke();
          ctx.strokeStyle = ringColor + "60";
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 5]);
          if (animate && !reduced && sv.motion === "spin_slow") {
            ctx.lineDashOffset = -time * 6;
          }
          ctx.beginPath();
          ctx.arc(x, y, r * 1.2, 0, Math.PI * 2);
          ctx.stroke();
          break;
        case "glow_alert":
          // 等待用户：琥珀色高亮环 + 缓慢闪烁
          ctx.strokeStyle = ringColor + (animate && !reduced
            ? Math.round(180 + Math.sin(time * 2) * 60).toString(16).padStart(2, "0")
            : "cc");
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.arc(x, y, r * 1.5, 0, Math.PI * 2);
          ctx.stroke();
          break;
        case "dim":
          // 消散/交接：暗淡灰环
          ctx.strokeStyle = ringColor + "20";
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.arc(x, y, r * 1.3, 0, Math.PI * 2);
          ctx.stroke();
          break;
      }
      ctx.restore();

      // === Body（agent accent 不变） ===
      const alphaHex = Math.round(alpha * 255).toString(16).padStart(2, "0");
      ctx.fillStyle = color + alphaHex;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();

      // === Core：用状态色叠加（替代统一 cc） ===
      ctx.fillStyle = sv.stateColor + "cc";
      ctx.beginPath();
      ctx.arc(x, y, r * 0.35, 0, Math.PI * 2);
      ctx.fill();

      // === 状态图标（居中白字） ===
      ctx.fillStyle = "#ffffff";
      ctx.font = '600 10px "Aptos", "Segoe UI", sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(sv.icon, x, y);

      // Progress bar for ephemerals
      if (showProgress !== undefined && showProgress > 0) {
        const barW = 40;
        const barH = 3;
        const barX = x - barW / 2;
        const barY = y + r + 34;
        ctx.fillStyle = "rgba(42, 58, 85, 0.5)";
        ctx.fillRect(barX, barY, barW, barH);
        ctx.fillStyle = color + "aa";
        ctx.fillRect(barX, barY, barW * showProgress, barH);
      }
    }

    function drawConnection(
      x1: number, y1: number, x2: number, y2: number,
      color: string, flowPhase: number, dashed: boolean
    ) {
      if (!ctx) return;
      ctx.save();
      ctx.strokeStyle = color + "50";
      ctx.lineWidth = 1.5;
      if (dashed) {
        ctx.setLineDash([6, 4]);
        ctx.lineDashOffset = -flowPhase * 20;
      }
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      // 去玄幻化：移除流动光点粒子，保留干净的连线
      ctx.restore();
    }

    function render() {
      if (!canvas || !ctx) return;
      const w = canvas.width / (window.devicePixelRatio || 1);
      const h = canvas.height / (window.devicePixelRatio || 1);

      timeRef.current++;
      const t = timeRef.current;

      ctx.clearRect(0, 0, w, h);

      // 去玄幻化：纯色背景代替渐变
      ctx.fillStyle = "#0d1422";
      ctx.fillRect(0, 0, w, h);

      // 静态网格（不依赖动画状态）
      ctx.strokeStyle = "rgba(42, 58, 85, 0.08)";
      ctx.lineWidth = 0.5;
      const gridSize = 60;
      for (let x = 0; x < w; x += gridSize) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      for (let y = 0; y < h; y += gridSize) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }
      // 去玄幻化：移除浮动粒子

      // === Squad 集群环形光晕（先于 Agent 绘制，作为背景聚合层） ===
      const rctx = canvas && ctx ? { canvas, ctx } : null;
      const size = { w, h };
      if (rctx) {
        for (const group of squadGroups) {
          drawSquadHalo(rctx, group, size, t * 0.005, animate, reduced);
        }
      }

      // Build draw data
      const allAgents: AgentDrawData[] = [
        ...residents.map((a, i) => {
          const pos = getPos(a.id, residentPositions);
          return {
            id: a.id,
            px: pos ? pos.x * w : 0,
            py: pos ? pos.y * h : 0,
            color: a.accent,
            name: a.name,
            stateText: a.stateReason,
            state: a.state,
            stateVisual: getStateVisual(a.state),
            radius: 22,
            alpha: 1,
            phaseOffset: i * 1.5,
          };
        }),
        ...ephemerals.map((a, i) => {
          const pos = getPos(a.id, ephemeralPositions);
          return {
            id: a.id,
            px: pos ? pos.x * w : 0,
            py: pos ? pos.y * h : 0,
            color: a.accent,
            name: a.name,
            stateText: a.stateReason,
            state: a.state,
            stateVisual: getStateVisual(a.state),
            radius: 16,
            alpha: 0.7,
            phaseOffset: i * 2.1 + 3,
          };
        }),
      ];

      // === Squad 内部证据流（在普通 connections 之前绘制） ===
      if (rctx) {
        const agentPosMap: Record<string, { x: number; y: number }> = {};
        for (const a of allAgents) {
          agentPosMap[a.id] = { x: a.px / w, y: a.py / h };
        }
        drawSquadFlows(rctx, squadFlows, agentPosMap, size, t * 0.005, animate, reduced);
      }

      // Draw connections
      for (const [fromId, toId, color, dashed] of connections) {
        const from = allAgents.find((a) => a.id === fromId);
        const to = allAgents.find((a) => a.id === toId);
        if (from && to) {
          drawConnection(from.px, from.py, to.px, to.py, color, t * 0.005, dashed);
        }
      }

      // Draw agents
      for (const agent of allAgents) {
        // 每帧累加时间，根据 stateVisual.motionSpeed 推进（替代统一 t * 0.03）
        const agentTime = animate
          ? t * agent.stateVisual.motionSpeed * 60 + agent.phaseOffset
          : agent.phaseOffset;
        drawAgentBody(
          agent.px, agent.py, agent.radius, agent.color, agent.alpha,
          agentTime, agent.phaseOffset, agent.stateVisual
        );

        // Label
        ctx.fillStyle = agent.color;
        ctx.font = '600 11px "Aptos", "Segoe UI", sans-serif';
        ctx.textAlign = "center";
        ctx.textBaseline = "alphabetic";
        ctx.fillText(agent.name, agent.px, agent.py + agent.radius + 16);

        // State badge（图标 + 标签）
        ctx.fillStyle = agent.stateVisual.stateColor;
        ctx.font = '500 9px "Aptos", "Segoe UI", sans-serif';
        ctx.fillText(
          `${agent.stateVisual.icon} ${agent.stateVisual.label}`,
          agent.px, agent.py + agent.radius + 30
        );

        // State reason（更小字）
        ctx.fillStyle = "#9aa8c2";
        ctx.font = '400 8px "Aptos", "Segoe UI", sans-serif';
        ctx.fillText(agent.stateText, agent.px, agent.py + agent.radius + 42);
      }

      // Task core — 去玄幻化：细环代替渐变光晕
      const coreRadius = Math.min(w, h) * 0.12;
      ctx.strokeStyle = "rgba(232, 236, 244, 0.15)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(taskCoreX * w, taskCoreY * h, coreRadius, 0, Math.PI * 2);
      ctx.stroke();

      if (animate && !reduced) {
        const pulseR = coreRadius + Math.sin(t * 0.02) * 2;
        ctx.strokeStyle = "rgba(78, 114, 216, 0.15)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(taskCoreX * w, taskCoreY * h, pulseR, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (running && animate) {
        frameRef.current = requestAnimationFrame(render);
      }
    }

    if (animate) {
      render();
    } else {
      // Single frame for non-animated
      timeRef.current = 0;
      render();
    }

    return () => {
      running = false;
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [
    residents, ephemerals, residentPositions, ephemeralPositions,
    taskCoreX, taskCoreY, connections, squadGroups, squadFlows, animate, reduced, getPos,
  ]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: "100%", height: "100%", display: "block" }}
    />
  );
}
