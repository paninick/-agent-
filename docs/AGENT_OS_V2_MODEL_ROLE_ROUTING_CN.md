# Agent OS v2 模型角色路由规则

更新日期：2026-07-05

## 1. 目的

本文件定义 Agent OS v2 在多模型协作中的固定节点路由。模型可以分工，但不能各自定义阶段、状态、放行标准或封版口径。

## 2. 节点到模型路由

| 节点 | 必经模型 / 工具 | 职责 |
|---|---|---|
| `N0_PRD_LOCK` | `glm-5.2` | 锁定 PRD、范围、禁止事项、验收标准。 |
| `N1_LONG_CONTEXT_ARCH_REVIEW` | `longcat` | 用长上下文审查阶段边界、架构一致性和历史约束。 |
| `N2_TECH_REVIEW` | `deepseek-v4-pro` | 审查技术可行性、类型、接口、风险和 blocking issues。 |
| `N3_IMPLEMENTATION` | `doubao-seed-2.0-code` / Codex | 在允许文件范围内实现最小闭环。 |
| `N4_FILE_STRUCTURE_REVIEW` | `doubao-seed-2.0-code` / Codex | 检查文件结构、模块边界、import 边界和命名一致性。 |
| `N5_VALIDATION` | `deepseek-v4-pro` | 执行或复核 lint、typecheck、test、build 和阶段专属验证。 |
| `N6_DOC_SYNC` | `doubao-seed-2.0-pro` | 同步 README、CHANGELOG、Runbook、Handoff Packet。 |
| `N7_RELEASE_SEAL` | `glm-5.2` | 最终封版，只有本节点可以输出 `SEALED`。 |

## 3. Kimi 规则

当前不使用 Kimi 作为必经节点。

Kimi 如出现，只能作为 optional reviewer 或辅助代码审查者，不得成为放行节点，不得替代 `N2_TECH_REVIEW`、`N5_VALIDATION` 或 `N7_RELEASE_SEAL`。

## 4. 放行规则

- 每个节点必须输出 `STATUS` 和 `NEXT_NODE`。
- `STATUS = BLOCK` 时必须给出 blocking issue、影响文件和最小修复动作。
- 非 `BLOCK` 状态不得输出开放式暂停语。
- 只有 `N7_RELEASE_SEAL` 可以输出 `SEALED`。
- vendor 工具文件不得覆盖本路由规则。

## 5. Handoff Packet

```text
HANDOFF_PACKET

CURRENT_STAGE:
CURRENT_NODE:
STATUS:
DECISION:
FILES_ALLOWED:
FILES_FORBIDDEN:
TYPES_LOCKED:
RULES_LOCKED:
TESTS_REQUIRED:
BOUNDARY_WARNINGS:
NEXT_MODEL:
NEXT_NODE:
```
