/**
 * client/habitat/squadRenderer.ts — Canvas 2D Squad 渲染辅助
 *
 * 提供 squad 视觉聚合的绘制函数：环形光晕、阶段标签、进度环、对峙光带。
 * WorkspaceCanvas.tsx 调用本模块的函数，自身只关心动画循环。
 *
 * 设计原则：
 * - 纯绘制函数，接收 ctx + group + 时间相位，无副作用
 * - 颜色透明度由阶段决定（forming 较淡，working 标准，reviewing 加红，dissolving 渐隐）
 * - 动画相位由调用方传入（timeRef），本模块不维护状态
 */

import type { SquadRenderGroup, SquadEvidenceFlow } from "./types";
import { SQUAD_PHASE_LABELS } from "../../domain/squadLifecycle";

interface RenderContextLike {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

/** 画布尺寸（CSS 像素，已应用 DPR） */
interface CanvasSize {
  w: number;
  h: number;
}

/**
 * 绘制单个 squad 的环形光晕。
 * - 外圈：阶段色径向渐变光晕
 * - 中圈：成员连接环线（虚线，缓慢旋转）
 * - 进度弧：从 12 点钟开始，按 progress 弧长填充
 */
export function drawSquadHalo(
  rctx: RenderContextLike,
  group: SquadRenderGroup,
  size: CanvasSize,
  timePhase: number,
  animate: boolean,
  reduced: boolean
): void {
  const { ctx } = rctx;
  const { w, h } = size;
  const cx = group.centerX * w;
  const cy = group.centerY * h;
  const radius = group.radius * Math.min(w, h);

  // dissolving 阶段渐隐
  const phaseAlpha = group.phase === "dissolving" ? 0.4 : 0.85;

  // 去玄幻化：细环代替大范围径向渐变光晕
  ctx.strokeStyle = group.phaseColor + Math.round(phaseAlpha * 40).toString(16).padStart(2, "0");
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 1.15, 0, Math.PI * 2);
  ctx.stroke();

  // 2. 成员环线（虚线，缓慢旋转）
  ctx.save();
  ctx.strokeStyle = group.phaseColor + "50";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 6]);
  if (animate && !reduced) {
    ctx.lineDashOffset = -timePhase * 8;
  }
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // 3. 进度弧（从 12 点钟开始，顺时针）
  if (group.progress > 0) {
    ctx.save();
    ctx.strokeStyle = group.phaseColor + "cc";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    const startAngle = -Math.PI / 2;
    const endAngle = startAngle + group.progress * Math.PI * 2;
    ctx.arc(cx, cy, radius + 6, startAngle, endAngle);
    ctx.stroke();
    ctx.restore();
  }

  // 4. 对峙光带（reviewing 阶段）
  if (group.hasAdversarialReview || group.phase === "reviewing") {
    ctx.save();
    ctx.strokeStyle = "#C75A4A80";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([8, 4]);
    if (animate && !reduced) {
      ctx.lineDashOffset = timePhase * 12;
    }
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // 5. 中心标签
  ctx.save();
  ctx.fillStyle = group.phaseColor + "ee";
  ctx.font = '600 11px "Aptos", "Segoe UI", sans-serif';
  ctx.textAlign = "center";
  ctx.fillText(group.label, cx, cy - 6);

  ctx.fillStyle = "#9aa8c2";
  ctx.font = '400 9px "Aptos", "Segoe UI", sans-serif';
  ctx.fillText(SQUAD_PHASE_LABELS[group.phase], cx, cy + 8);

  // 进度百分比
  ctx.fillStyle = group.phaseColor + "aa";
  ctx.font = '500 9px "Aptos", "Segoe UI", sans-serif';
  ctx.fillText(`${Math.round(group.progress * 100)}%`, cx, cy + 22);
  ctx.restore();
}

/**
 * 绘制 squad 内部的证据流连线。
 * - 普通流：彩色细线 + 流动粒子
 * - 对峙流：红色虚线 + 高强度粒子
 */
export function drawSquadFlows(
  rctx: RenderContextLike,
  flows: SquadEvidenceFlow[],
  agentPositions: Record<string, { x: number; y: number }>,
  size: CanvasSize,
  timePhase: number,
  animate: boolean,
  reduced: boolean
): void {
  const { ctx } = rctx;
  const { w, h } = size;

  for (const flow of flows) {
    const from = agentPositions[flow.fromId];
    const to = agentPositions[flow.toId];
    if (!from || !to) continue;

    const x1 = from.x * w;
    const y1 = from.y * h;
    const x2 = to.x * w;
    const y2 = to.y * h;

    ctx.save();
    if (flow.adversarial) {
      // 对峙连线：红色虚线
      ctx.strokeStyle = "#C75A4A99";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 3]);
      if (animate && !reduced) {
        ctx.lineDashOffset = -timePhase * 15;
      }
    } else {
      // 普通证据流：颜色细线，透明度由强度决定
      const alpha = Math.round(flow.intensity * 80).toString(16).padStart(2, "0");
      ctx.strokeStyle = flow.color + alpha;
      ctx.lineWidth = 1;
    }
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.restore();
    // 去玄幻化：移除流动粒子，保留干净的证据流连线
  }
}

/**
 * 绘制 squad 阶段转换时的脉冲圈（forming/dissolving 触发）。
 * 调用方需要维护触发时机，本函数只负责绘制当前帧。
 */
export function drawSquadPulse(
  rctx: RenderContextLike,
  group: SquadRenderGroup,
  size: CanvasSize,
  pulseProgress: number // 0-1，0=未开始，1=完成
): void {
  if (pulseProgress <= 0 || pulseProgress >= 1) return;
  const { ctx } = rctx;
  const { w, h } = size;
  const cx = group.centerX * w;
  const cy = group.centerY * h;
  const baseR = group.radius * Math.min(w, h);
  const r = baseR * (1 + pulseProgress * 1.5);
  const alpha = 1 - pulseProgress;

  ctx.save();
  ctx.strokeStyle = group.phaseColor + Math.round(alpha * 200).toString(16).padStart(2, "0");
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
