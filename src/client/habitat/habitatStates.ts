/**
 * client/habitat/habitatStates.ts — Habitat Agent 状态视觉规范
 *
 * 为 domain/agentHabitat.ts 中定义的 10 种 HabitatAgentState 提供统一的视觉规范：
 * - 中文标签 + 简短描述（用于工具提示 / 状态文字）
 * - 状态色（叠加在 agent accent 上的色调，表达状态语义）
 * - 动效类型与速度（呼吸 / 脉冲 / 旋转 / 渐隐 / 静止 / 共振）
 * - 外环样式（实线 / 虚线 / 双环 / 高亮）
 * - 单字符图标符号（用于状态徽章）
 *
 * 设计原则：
 * - 同一 agent 的 accent 不变；状态色作为外环 / 内核叠加，避免抢色
 * - 动效幅度遵循去玄幻化原则：呼吸 1.5%，脉冲 2px，旋转缓慢
 * - 状态语义颜色与全局 token 对齐：
 *   等待用户 = 琥珀（注意）  阻塞 = 红（警示）  协作 = 蓝（链接）
 *   记忆 = 紫（沉淀）        消散 = 灰（淡出）  工作 = 绿（进行）
 */

import type { HabitatAgentState } from "../../domain/agentHabitat";

/** 状态动效类型 */
export type StateMotion =
  | "breathe"      // 标准呼吸（idle/working）
  | "pulse_slow"   // 缓慢脉冲（understanding/planning）
  | "resonate"     // 共振（collaborating，与 squad 同步）
  | "alert_steady" // 静止高亮（waiting_for_user，等待注意）
  | "static_dim"   // 静止暗淡（blocked）
  | "fade_out"     // 渐隐（dissolving/handoff）
  | "spin_slow";   // 缓慢旋转（consolidating_memory）

/** 外环样式 */
export type StateRingStyle =
  | "solid"        // 实线细环
  | "dashed"       // 虚线（阻塞 / 等待）
  | "double"       // 双环（协作 / 计划）
  | "glow_alert"   // 高亮环（等待用户）
  | "dim";         // 暗淡环（消散）

/** 单字符状态图标（用于状态徽章 / 列表显示） */
export type StateIcon =
  | "·"  // idle
  | "?"  // understanding
  | "▦"  // planning
  | "▶"  // working
  | "⇄"  // collaborating
  | "!"  // waiting_for_user
  | "✕"  // blocked
  | "→"  // handoff
  | "◇"  // consolidating_memory
  | "◌";  // dissolving

/** 状态视觉规范 */
export interface StateVisual {
  /** 中文标签 */
  label: string;
  /** 简短描述（解释状态含义） */
  description: string;
  /** 状态色 hex（6 位，不带 alpha）—— 叠加在 accent 上的语义色 */
  stateColor: string;
  /** 动效类型 */
  motion: StateMotion;
  /** 动效速度（弧度/帧，0 = 静止） */
  motionSpeed: number;
  /** 外环样式 */
  ringStyle: StateRingStyle;
  /** 状态图标 */
  icon: StateIcon;
}

/**
 * 10 种 HabitatAgentState 的视觉规范映射。
 * 颜色语义：
 * - 灰 #6B7A99：闲置 / 过渡
 * - 蓝 #4E72D8：思考 / 计划 / 协作
 * - 绿 #4BA89A：进行中
 * - 琥珀 #E4A84B：等待用户注意
 * - 红 #C75A4A：阻塞
 * - 紫 #8B6CCF：记忆沉淀
 */
export const STATE_VISUAL: Record<HabitatAgentState, StateVisual> = {
  idle: {
    label: "待命",
    description: "等待新需求或后台目标更新",
    stateColor: "#6B7A99",
    motion: "breathe",
    motionSpeed: 0.018,
    ringStyle: "solid",
    icon: "·",
  },
  understanding: {
    label: "理解中",
    description: "解析需求与上下文",
    stateColor: "#4E72D8",
    motion: "pulse_slow",
    motionSpeed: 0.012,
    ringStyle: "double",
    icon: "?",
  },
  planning: {
    label: "规划中",
    description: "拆解目标并组织小队",
    stateColor: "#4E72D8",
    motion: "spin_slow",
    motionSpeed: 0.008,
    ringStyle: "double",
    icon: "▦",
  },
  working: {
    label: "执行中",
    description: "正在执行任务",
    stateColor: "#4BA89A",
    motion: "breathe",
    motionSpeed: 0.030,
    ringStyle: "solid",
    icon: "▶",
  },
  collaborating: {
    label: "协作中",
    description: "与小队成员交换证据",
    stateColor: "#4E72D8",
    motion: "resonate",
    motionSpeed: 0.025,
    ringStyle: "double",
    icon: "⇄",
  },
  waiting_for_user: {
    label: "等待用户",
    description: "需要用户决策才能继续",
    stateColor: "#E4A84B",
    motion: "alert_steady",
    motionSpeed: 0,
    ringStyle: "glow_alert",
    icon: "!",
  },
  blocked: {
    label: "阻塞",
    description: "因依赖或错误无法继续",
    stateColor: "#C75A4A",
    motion: "static_dim",
    motionSpeed: 0,
    ringStyle: "dashed",
    icon: "✕",
  },
  handoff: {
    label: "交接中",
    description: "正在将任务转交其他 Agent",
    stateColor: "#6B7A99",
    motion: "fade_out",
    motionSpeed: 0.010,
    ringStyle: "dim",
    icon: "→",
  },
  consolidating_memory: {
    label: "沉淀记忆",
    description: "将成果与偏好存入长期记忆",
    stateColor: "#8B6CCF",
    motion: "spin_slow",
    motionSpeed: 0.006,
    ringStyle: "solid",
    icon: "◇",
  },
  dissolving: {
    label: "消散中",
    description: "临时 Agent 即将解散",
    stateColor: "#6B7A99",
    motion: "fade_out",
    motionSpeed: 0.015,
    ringStyle: "dim",
    icon: "◌",
  },
};

/** 获取状态视觉规范（带 fallback） */
export function getStateVisual(state: HabitatAgentState): StateVisual {
  return STATE_VISUAL[state] ?? STATE_VISUAL.idle;
}

/**
 * 根据动效类型计算当前帧的缩放因子。
 * - breathe: sin 波动 ±1.5%
 * - pulse_slow: sin 波动 ±2%
 * - resonate: sin 波动 ±2.5%（与 squad 同步，幅度略大）
 * - alert_steady: 静止 1.0（但外环高亮闪烁由调用方处理）
 * - static_dim: 静止 0.95（略暗淡）
 * - fade_out: 0.5 + sin * 0.3（渐隐波动）
 * - spin_slow: 1.0（缩放不变，旋转由外环 lineDashOffset 体现）
 */
export function computeStateScale(
  motion: StateMotion,
  time: number,
  phaseOffset: number,
  reduced: boolean
): number {
  if (reduced) {
    // 减少动画模式：仅保留极弱的呼吸
    if (motion === "breathe" || motion === "pulse_slow" || motion === "resonate") {
      return 1 + Math.sin(time * 0.01 + phaseOffset) * 0.005;
    }
    if (motion === "fade_out") return 0.7;
    if (motion === "static_dim") return 0.95;
    return 1;
  }

  const phase = time + phaseOffset;
  switch (motion) {
    case "breathe":
      return 1 + Math.sin(phase * 1.0) * 0.015;
    case "pulse_slow":
      return 1 + Math.sin(phase * 0.7) * 0.020;
    case "resonate":
      return 1 + Math.sin(phase * 1.2) * 0.025;
    case "alert_steady":
      return 1;
    case "static_dim":
      return 0.95;
    case "fade_out":
      return 0.6 + Math.sin(phase * 0.5) * 0.2;
    case "spin_slow":
      return 1;
    default:
      return 1;
  }
}

/**
 * 根据 motionSpeed 计算 time 推进。
 * 让调用方在每帧累加 time += motionSpeed（而不是统一速度），
 * 从而让不同状态的动效速度独立。
 */
export function advanceTime(
  currentTime: number,
  motionSpeed: number,
  animate: boolean
): number {
  return animate ? currentTime + motionSpeed : currentTime;
}
