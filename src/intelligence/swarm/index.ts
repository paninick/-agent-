/**
 * swarm/index.ts - 蜂群模块 barrel export
 *
 * 导出：
 *   - profiles (AgentRoleProfile + DEFAULT_SWARM_WORKFLOW)
 *   - orchestrator (orchestrateSwarm)
 *   - agents (6 类角色执行函数)
 *   - superpowers (15 个架构模式模块)
 *   - contract (契约校验 + 验证门 + 红旗)
 *   - escalation (四态处理 + 升级阶梯)
 */

export * from "./profiles";
export * from "./orchestrator";
export * from "./scout-matcher";
export * from "./agents";
export * from "./contract";
export * from "./escalation";
export * from "./verification-gate";
export * from "./severity";
export * from "./priority";
export * from "./degrees-of-freedom";
export * from "./progressive-disclosure";
export * from "./cso";
export * from "./two-stage-review";
export * from "./systematic-debugging";
export * from "./parallel-dispatch";
export * from "./plan-validate-execute";
export * from "./live-swarm";
