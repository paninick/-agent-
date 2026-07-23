# RunStore v1 + Approval Resume v1 运行手册

更新日期：2026-07-04

## 1. RunStore 是什么

RunStore 是 Agent OS v2 的运行态存储接口。本轮实现的是 `MemoryRunStore`，只把 Run、checkpoint、resumePoint 和 audit event id 保存在当前 Node.js 进程内存中。

它解决的问题：

- 每次执行都有 `runId`。
- DAG 执行状态可以查询。
- 遇到人工审批节点时可以暂停。
- 审批后可以从 checkpoint 继续执行。
- 拒绝后不会继续执行后续节点。

本轮不实现数据库、Redis、BullMQ、真实并发 worker、真实 LLM、真实 MCP、UI 重构。

## 2. Run status 生命周期

```text
running -> waiting_approval -> paused -> running -> completed
running -> waiting_approval -> rejected
running -> failed
```

禁止路径包括：

- `completed -> running`
- `completed -> waiting_approval`
- `rejected -> running`
- `rejected -> completed`
- `failed -> running`
- unknown `runId` 的任何状态变更

状态含义：

| status | 含义 |
|---|---|
| `running` | DAG 正在执行或准备继续执行。 |
| `waiting_approval` | 命中 `human_approval` / `waiting_approval` 节点，已保存 checkpoint，等待人工决定。 |
| `paused` | 已 approve，但尚未 resume；不会伪造成 completed。 |
| `completed` | DAG 后续节点执行完成。 |
| `failed` | 执行节点出现异常。 |
| `rejected` | 人工拒绝，DAG 不再继续。 |

## 3. waiting_approval 如何进入

`DAGExecutor` 执行到 `human_approval` 或 `waiting_approval` 节点时：

1. 停止继续执行后续节点。
2. 写入 `run.status = waiting_approval`。
3. 写入 `waitingApprovalNodeId`。
4. 保存 `ResumePoint`。
5. 保存 `contextSnapshot`。
6. 写入 audit event。

后续节点不会执行，直到调用 `approveRun` 后再调用 `resumeRun`。

## 4. approve / reject / resume 区别

| 动作 | 前置状态 | 行为 |
|---|---|---|
| `approveRun(runId)` | `waiting_approval` | 写入审批结果到 context，并把 run 改为 `paused`。不直接完成。 |
| `rejectRun(runId)` | `waiting_approval` | 把 run 改为 `rejected`，写入 audit event，后续节点不执行。 |
| `resumeRun(runId)` | `paused` 且存在 `resumePoint` | 从 `ResumePoint` 恢复 context，跳过 completed nodes，继续 DAG。 |

非法状态会返回安全错误，例如 completed run 不允许 approve，rejected run 不允许 resume，unknown runId 返回 `run_not_found`。

## 4.1 Approval Queue v1

Approval Queue v1 不是独立队列系统，也不接 BullMQ / Redis。它由 RunStore 查询表达：

```ts
runStore.listRuns().filter((run) => run.status === "waiting_approval")
```

这能列出所有等待人工审批的 run。后续如果进入 P1，再考虑 Tool Permission Hooks / Credential Gating；本轮不实现。

## 5. checkpoint / resumePoint 含义

`ResumePoint` 是恢复执行所需的最小状态：

```ts
{
  runId: string
  nodeId: string
  batchIndex?: number
  executionCursor?: string
  contextSnapshot: Record<string, unknown>
}
```

`nodeId` 指向等待审批或恢复执行的节点。`executionCursor` 是轻量游标，本轮使用字符串标识。`contextSnapshot` 保存恢复所需上下文。

## 6. RunStore 方法

- `createRun(input)`
- `getRun(runId)`
- `updateRun(runId, patch)`
- `persistCheckpoint(runId, resumePoint)`
- `listRuns()`
- `appendAuditEvent(runId, event)`
- `getAuditEvents(runId)`

所有 invalid runId 都安全返回错误，不抛出未捕获异常。

## 7. Memory RunStore 限制

- 进程重启后 Run 状态会丢失。
- 不支持跨实例共享。
- 不支持队列调度。
- 不支持真实并发 worker。
- 当前 `DAGExecutor` 是串行执行。
- 不提供持久化事务。

后续数据库、Redis、queue、worker pool、真实 LLM/MCP 执行都不在本轮实现范围内。
