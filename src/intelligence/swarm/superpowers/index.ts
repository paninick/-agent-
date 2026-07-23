/**
 * swarm/superpowers/index.ts - Superpowers 模式 barrel 导出
 *
 * 集中导出所有从 superpowers v5.1.0 移植的架构模式模块。
 * 外部消费者只需 import { ... } from "../superpowers" 即可访问所有模式。
 */

// 模式 13：验证门
export * from "../verification-gate";

// 模式 8：三级严重度（code-reviewer 严重度分级）
export * from "../severity";

// 模式 2：指令优先级体系
export * from "../priority";

// 模式 1：自由度分级（rigid vs flexible）
export * from "../degrees-of-freedom";

// 模式 10：渐进式披露
export * from "../progressive-disclosure";

// 模式 9：CSO 描述验证
export * from "../cso";

// 模式 4：两阶段审查
export * from "../two-stage-review";

// 模式 12：系统化调试
export * from "../systematic-debugging";

// 模式 3：并行派发
export * from "../parallel-dispatch";

// 模式 11：计划-验证-执行
export * from "../plan-validate-execute";

// 模式 1/2/8/13：契约校验 + 验证门 + 红旗
export * from "../contract";

// 模式 4/6/11/12：四态处理 + 升级阶梯 + 两阶段审查
export * from "../escalation";
