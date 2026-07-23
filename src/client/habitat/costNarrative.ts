/**
 * client/habitat/costNarrative.ts — 成本自然语言表达
 *
 * 将 CostSummary 数字转化为口语化的中文叙述，
 * 让用户一眼看懂"花了多少、花在哪、预算够不够"。
 */

import type { CostSummary } from "./types";

/** 中文数字（0-10） */
const CN_DIGITS = ["零", "一", "两", "三", "四", "五", "六", "七", "八", "九", "十"];

/** 将 0-10 的整数转为中文数字；超出范围回退阿拉伯数字 */
function toCnSmall(n: number): string {
  if (n >= 0 && n <= 10) return CN_DIGITS[Math.round(n)];
  return String(Math.round(n));
}

/** 近似整数：4.8 → "不到5"；5.2 → "5多"；6.0 → "6" */
function approxAmount(n: number): string {
  const rounded = Math.round(n);
  const diff = n - rounded;
  if (Math.abs(diff) < 0.05) return String(rounded);
  if (diff < 0) return `不到${rounded}`;
  return `${rounded}多`;
}

/** 百分比 → 中文口语：8% → "不到一成"；62% → "六成多"；50% → "一半" */
function approxRatio(ratio: number): string {
  const pct = ratio * 100;
  if (pct < 10) return "不到一成";
  if (pct < 15) return "一成多";
  if (pct < 25) return "两成左右";
  if (pct < 40) return "三成左右";
  if (pct < 45) return "四成左右";
  if (pct < 55) return "一半";
  if (pct < 65) return "六成多";
  if (pct < 75) return "七成左右";
  if (pct < 85) return "八成多";
  if (pct < 95) return "九成左右";
  return "几乎全部";
}

/** 工作时长 → 口语：7h → "七个小时"；1.5h → "一个半小时"；0.5h → "不到一小时" */
function narrateDuration(seconds: number): string {
  const hours = seconds / 3600;
  const wholeHours = Math.floor(hours);
  const frac = hours - wholeHours;
  if (wholeHours === 0 && frac > 0) return "不到一小时";
  if (wholeHours === 0) return "刚启动";
  if (frac < 0.15) return `${toCnSmall(wholeHours)}个小时`;
  if (frac < 0.4) return `${toCnSmall(wholeHours)}个多小时`;
  if (frac < 0.6) return `${toCnSmall(wholeHours)}个半小时`;
  return `将近${toCnSmall(wholeHours + 1)}个小时`;
}

/** 工具调用次数 → 口语：23 → "二十多次" */
function narrateToolCalls(count: number): string {
  if (count === 0) return "还没调用工具";
  if (count < 5) return `${toCnSmall(count)}次`;
  if (count < 15) return "十几次";
  if (count < 25) return "二十多次";
  if (count < 50) return "三四十次";
  return `${Math.round(count / 10) * 10}多次`;
}

/** 预算占比 → 口语 */
function narrateBudgetUsage(cost: number, budget: number): string {
  if (budget <= 0) return `花了${approxAmount(cost)}元`;
  const usage = cost / budget;
  if (usage < 0.05) return `花了${approxAmount(cost)}元，预算${approxAmount(budget)}元，才用了不到一成`;
  if (usage < 0.15) return `花了${approxAmount(cost)}元，预算${approxAmount(budget)}元，用了一成左右`;
  if (usage < 0.3) return `花了${approxAmount(cost)}元，预算${approxAmount(budget)}元，用了不到三成`;
  if (usage < 0.5) return `花了${approxAmount(cost)}元，预算${approxAmount(budget)}元，用了不到一半`;
  if (usage < 0.7) return `花了${approxAmount(cost)}元，预算${approxAmount(budget)}元，用了过半`;
  if (usage < 0.9) return `花了${approxAmount(cost)}元，预算${approxAmount(budget)}元，用了七成多`;
  if (usage < 1) return `花了${approxAmount(cost)}元，预算${approxAmount(budget)}元，快用完了`;
  return `花了${approxAmount(cost)}元，预算${approxAmount(budget)}元，已超支`;
}

export interface CostNarrative {
  /** 概述句：今天工作多久、调用几次工具 */
  overview: string;
  /** 花费句：花了多少、预算多少、用了几成 */
  spending: string;
  /** 重点句：最耗资源的目标占多少 */
  focus: string;
}

/** 将 CostSummary 转为自然语言叙述 */
export function narrateCost(c: CostSummary): CostNarrative {
  return {
    overview: `今天${narrateDuration(c.workSeconds)}，${narrateToolCalls(c.toolCalls)}`,
    spending: narrateBudgetUsage(c.estimatedCost, c.monthlyBudget),
    focus: `主要是${c.topCostGoal}，占了${approxRatio(c.topCostRatio)}`,
  };
}
