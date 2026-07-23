/**
 * services/workflow-validator.ts - SwarmWorkflow 结构校验器
 *
 * 从 NP3 (agent-os-2) 的 WorkflowValidator 模式提炼，
 * 适配 NP2 的 SwarmWorkflow（steps: AgentRole[] 线性序列）而非 NP3 的 DAG。
 *
 * 校验规则：
 *   1. steps 非空
 *   2. 所有 AgentRole 合法（与 AgentRole 联合类型同步）
 *   3. 首步必须是 scout 或 collector（LIVE_WORKFLOW 跳过 scout）
 *   4. 末步必须是 memory（闭环必须落盘记忆）
 *   5. 无重复角色（scout/collector/verifier/analyst/synthesizer 各最多一次；memory 仅末尾一次）
 */

import type { AgentRole, SwarmWorkflow } from "../intelligence/spine/types";

const VALID_ROLES: ReadonlySet<AgentRole> = new Set([
  "scout",
  "collector",
  "data_janitor",
  "verifier",
  "analyst",
  "devils_advocate",
  "adjudicator",
  "reconciliation_scorer",
  "synthesizer",
  "memory",
]);

const VALID_ROLE_LABEL = [...VALID_ROLES].join("/");

export interface WorkflowValidationIssue {
  code: string;
  role?: AgentRole;
  message: string;
}

export interface WorkflowValidationResult {
  valid: boolean;
  issues: WorkflowValidationIssue[];
}

export class WorkflowValidator {
  validate(workflow: SwarmWorkflow): WorkflowValidationResult {
    const issues: WorkflowValidationIssue[] = [];
    const steps = workflow.steps;

    if (!steps || steps.length === 0) {
      issues.push({
        code: "WORKFLOW_STEPS_EMPTY",
        message: "Workflow steps must not be empty.",
      });
      return { valid: false, issues };
    }

    // 校验角色合法性
    for (const role of steps) {
      if (!VALID_ROLES.has(role)) {
        issues.push({
          code: "WORKFLOW_UNKNOWN_ROLE",
          role,
          message: `Unknown agent role: ${role}. Must be one of ${VALID_ROLE_LABEL}.`,
        });
      }
    }

    // 首步必须是 scout 或 collector
    const first = steps[0];
    if (first !== "scout" && first !== "collector") {
      issues.push({
        code: "WORKFLOW_INVALID_FIRST_STEP",
        role: first,
        message: `First step must be "scout" or "collector", got "${first}".`,
      });
    }

    // 末步必须是 memory
    const last = steps[steps.length - 1];
    if (last !== "memory") {
      issues.push({
        code: "WORKFLOW_INVALID_LAST_STEP",
        role: last,
        message: `Last step must be "memory" to close the loop, got "${last}".`,
      });
    }

    // 检查重复角色（memory 允许出现在末尾，不允许中间出现）
    const seen = new Set<AgentRole>();
    for (let i = 0; i < steps.length; i++) {
      const role = steps[i];
      if (seen.has(role)) {
        issues.push({
          code: "WORKFLOW_DUPLICATE_ROLE",
          role,
          message: `Role "${role}" appears more than once in workflow steps.`,
        });
      }
      // memory 不允许出现在非末尾位置
      if (role === "memory" && i !== steps.length - 1) {
        issues.push({
          code: "WORKFLOW_MEMORY_NOT_LAST",
          role,
          message: `Role "memory" must be the last step, but found at position ${i}.`,
        });
      }
      seen.add(role);
    }

    return { valid: issues.length === 0, issues };
  }
}
