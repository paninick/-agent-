# Frontend Usage & Interaction Specification — Launch Desk

> 配套文档：`docs/UIUX_SPECIFICATION.md`（视觉/色板/字体/品牌资产，本文件不重复）。
> 本文件只回答一个问题：**后端已经能做什么，前端页面应该怎么用、怎么响应、怎么展示、怎么验收。**
>
> 真值来源：`src/agent/streamLaunchPlan.ts`、`src/server/index.ts`、`src/agent/types.ts`、`src/client/main.tsx`。
> 标注约定：
> - `[CURRENT]` = 后端/前端今天已实现的行为
> - `[GAP]` = 本规范要求但后端尚未提供，需后端扩展后前端才能实现
> - `[PROPOSED]` = 前端需新增的交互（当前代码没有）
> - `[P1-FIXED]` = Phase 1 前端修复已落地（见 `docs/FRONTEND_PHASE1_CHANGELOG.md` 或本文件附 §P1）

---

## 1. 用户使用流程

### 1.1 初始页面用户看到什么 `[CURRENT]`

打开 `http://127.0.0.1:5173` 后：

- **Mast**：eyebrow `LAUNCH DESK`（amber）、h1 `Release planning agent for engineering teams`、右上 `.signal` 显示 `📡 Ready`（mint）。
- **左侧 input-panel**：5 个字段**已预填示例数据**（`useState<FormState>(sampleBrief)`），不是空白。即用户第一眼看到的是一份可编辑的示例 brief。
- **右侧 output-panel**：
  - Status Row 三格：`0 / tool events`、`0 / text deltas`、`idle / agent state`。
  - Error Banner：不显示。
  - Event Rail：空（无 chip）。
  - Plan Output：空状态——`Megaphone` 24px 图标 + 文案 `Submit a launch brief to stream a prioritized release plan, risks, owner checklist, copy, and follow-up questions.`

### 1.2 左侧表单每个字段的作用

| 字段 | 图标 | 作用 | 后端校验 |
|------|------|------|---------|
| Product brief | FileText | 描述要发布什么、为什么重要。是 agent 提示词的核心输入。 | **必填**，Zod `min(12)`，少于 12 字符后端返回 error 事件 |
| Audience | Users | 目标用户/团队，帮助 agent 校准语气与渠道。 | 可选，缺省为 `"Unknown"` |
| Launch date | CalendarDays | 发布日期或时间窗口。 | 可选，缺省为 `"Unknown"` |
| Constraints | ShieldCheck | 风险、依赖、人力、合规、灰度限制。 | 可选，缺省为 `"None provided"` |
| Available assets | ClipboardList | 已有文档/截图/demo/指标/客户引述。 | 可选，缺省为 `"None provided"` |

### 1.3 必填 / 可选

- **必填**：仅 `Product brief`（后端 Zod 强制 ≥12 字符）。
- **可选**：`Audience`、`Launch date`、`Constraints`、`Available assets`。
- `[Phase 1B — DONE]` 前端在 Product brief <12 字符时显示 inline error + red 边框，focus 到字段，不发送请求。

### 1.4 点击 Generate plan 后页面哪些区域变化 `[CURRENT]`

`runAgent()` 执行，按顺序：

1. `setIsRunning(true)`。
2. `setEvents([])`、`setOutput("")`、`setError("")` —— **清空旧 events / output / error**。
3. `POST /api/launch-plan`，body 为整个 form。
4. 读取 `response.body` 流，按 `\n\n` 切块解析 SSE。
5. 每个块：`setEvents([...current, parsed])`；若是 `text_delta` 则 `setOutput(current + delta)`；若是 `error` 则 `setError(message)`。
6. `finally`：`setIsRunning(false)`。

变化区域：
- **Signal**：`Ready` → `Streaming`。
- **Generate plan 按钮**：文字 `Generate plan` → `Planning...`，`disabled`。
- **Load example 按钮**：`disabled`。
- **输入框**：仍可编辑（当前未 disable），但编辑不影响进行中的 run。
- **Status Row**：tool events / text deltas 数字随事件递增；agent state `idle` → `live`。
- **Event Rail**：逐个追加 chip（最多显示最近 8 个）。
- **Plan Output**：空状态消失，`<pre>` 内文字实时拼接。

### 1.5 运行中各控件状态 `[CURRENT]`

| 控件 | 状态 |
|------|------|
| Generate plan | `disabled`，文字 `Planning...`，`opacity:0.7`，`cursor:wait` |
| Load example | `disabled` |
| 5 个 textarea | 可编辑（未 disable） |
| Signal | `Streaming` |

`[Phase 1B — DONE]` 运行中显示 snapshot hint 提示"本次生成使用点击时的输入快照"，textarea 保持可编辑但不影响当前 run（提交时取 form 快照）。

### 1.6 右侧如何显示流式事件和流式文本 `[CURRENT]`

- **Event Rail**：每个 SSE 事件追加为一个 chip。
  - `tool_progress` → mint chip，`CheckCircle2` 图标，文字 `{status} {name}`（如 `called prioritize_tasks` / `completed prioritize_tasks`）。
  - `text_delta` → cyan chip，`Megaphone` 图标，文字 `model text delta`。
  - 其它（`run_started`/`run_completed`/`error`/`approval_required`）→ ink-muted chip，文字为 type 的 `_` 替换为空格（如 `run started`）。
  - 仅显示 `events.slice(-8)`，即最近 8 个。
- **Plan Output**：仅 `text_delta.delta` 被拼接到 `output` 字符串，渲染在 `<pre>` 内。tool_progress 等事件**不进**输出文本。

### 1.7 生成完成后用户看到什么 `[CURRENT]`

- Signal：`Streaming` → `Plan ready`。
- Generate plan 按钮：恢复 `Generate plan`，enabled。
- Load example 按钮：enabled。
- Status Row：agent state `live` → `done`；tool events / text deltas 停在最终值。
- Event Rail：保留最后 8 个 chip（含 `run completed`）。
- Plan Output：完整计划文本，`<pre>` 内。

### 1.8 重新生成 / 复制结果 / 修改后再次生成

- **重新生成**：再次点击 Generate plan。`[CURRENT]` 会先清空 events/output/error 再发起新 run。
- **修改输入后再次生成**：编辑 textarea → 点 Generate plan。`[CURRENT]` 无需手动"保存"，提交即取当前 form 快照。
- **复制结果** `[Phase 1B — DONE]`：Plan Output 完成后显示 "Copy result" 与 "Export markdown" 操作（见 §6）。
- **审批完成后再生成**：见 §4。

### 1.9 Load example 行为 `[P1-FIXED]`

- 点击后先比较当前 form 与 sampleBrief：
  - **表单未被修改**（与 sampleBrief 完全一致）→ 直接覆盖（无确认）。
  - **表单已被修改**（任一字段不同）→ 弹 `window.confirm("This will replace your current input with the example brief. Continue?")`，用户确认后才覆盖；取消则不动。
- 运行中（`isRunning`）时该按钮 `disabled`，无法触发。

---

## 2. 页面状态设计（6 态）

> 状态判定由 `isRunning`、`error`、`events` 中的 `approval_required`/`run_completed`、`output` 共同决定。

### 2.1 Idle / Empty state

| 区域 | 显示 |
|------|------|
| Signal | `Ready` |
| Generate plan | enabled，文字 `Generate plan` |
| Load example | enabled |
| Status Row | `0 / tool events`、`0 / text deltas`、`idle / agent state` |
| Event Rail | 空 |
| Plan Output | 空状态文案 + Megaphone 图标 |
| Error Banner | 不显示 |
| Approval Gate | 不显示 |
| 用户下一步 | 编辑表单 / 点 Load example / 点 Generate plan |

注：因初始预填 sampleBrief，纯空态仅在用户手动清空 Product brief 后出现。

### 2.2 Form filled state

| 区域 | 显示 |
|------|------|
| Signal | `Ready` |
| Generate plan | enabled |
| Load example | enabled |
| Status Row | 同 Idle（未运行则计数为 0） |
| Event Rail | 空（或保留上一次 run 的旧 chip——`[CURRENT]` 在新 run 启动时才清空） |
| Plan Output | 空状态，或保留上一次 output（同上） |
| Error Banner | 不显示 |
| Approval Gate | 不显示 |
| 用户下一步 | 点 Generate plan 进入 Streaming |

### 2.3 Streaming state

| 区域 | 显示 |
|------|------|
| Signal | `Streaming` |
| Generate plan | disabled，`Planning...` |
| Load example | disabled |
| Status Row | tool events / text deltas 递增；agent state `live` |
| Event Rail | 实时追加 chip，最多 8 个 |
| Plan Output | `<pre>` 实时拼接 text_delta |
| Error Banner | 不显示 |
| Approval Gate | 不显示 |
| 用户下一步 | 等待；`[PROPOSED]` 应提供 Cancel 按钮（见 §7 `cancelled`） |

### 2.4 Approval required state `[Phase 2 — DONE]`

> Phase 2 补齐后端 approval 能力。`approvalPolicy.enabled = true` 或 `trackingEnabled`（显式传入 orchestrator）时触发审批。默认生产路径 `approvalPolicy.enabled = false`，需显式开启。

| 区域 | 显示 |
|------|------|
| Signal | `Approval required`（amber，等待用户决策，run 未结束）`[Phase 2 — DONE]` |
| Generate plan | disabled |
| Load example | disabled |
| Status Row | agent state `Awaiting approval`（`[Phase 2 — DONE]`） |
| Event Rail | 显示 `approval required` chip |
| Plan Output | 保留已流式生成的部分文本 |
| Error Banner | 不显示 |
| Approval Gate | **显示**（覆盖在 Plan Output 上方或替换空状态位，见 §4） |
| 用户下一步 | Approve → `run_completed` 进入 Done / Reject → 安全说明 `text_delta` + `run_completed` 进入 Done `[Phase 2 — DONE]` |

### 2.5 Error state

| 区域 | 显示 |
|------|------|
| Signal | `Error`（`[Phase 1 — DONE]` Signal 检查 error 状态，error 时显示 `Error`） |
| Generate plan | enabled |
| Load example | enabled |
| Status Row | 保留已累计的 tool/text 计数；agent state `Error`（`[Phase 1 — DONE]`） |
| Event Rail | 保留已有 chip |
| Plan Output | **保留已生成内容**（`[CURRENT]` error 不清空 output） |
| Error Banner | 显示，red 背景，AlertTriangle 图标 + message |
| Approval Gate | 不显示 |
| 用户下一步 | 修正输入后重新 Generate / 点 Retry（`[PROPOSED]`） |

### 2.6 Completed state

| 区域 | 显示 |
|------|------|
| Signal | `Plan ready` |
| Generate plan | enabled |
| Load example | enabled |
| Status Row | 最终计数；agent state `done` |
| Event Rail | 最后 8 个 chip |
| Plan Output | 完整计划 |
| Error Banner | 不显示 |
| Approval Gate | 不显示 |
| 用户下一步 | Copy / Export `[Phase 1B — DONE]` / 重新 Generate / Load example |

---

## 3. 后端事件到前端 UI 的映射

> 真值：`LaunchStreamEvent` 类型（`streamLaunchPlan.ts`）。下面每行 = 收到该事件后的前端动作。

### 3.1 `run_started` `[CURRENT]` payload `{ traceLabel, model, runId? }`

| 目标 | 动作 |
|------|------|
| state | `setEvents([...current, parsed])` |
| Event Rail | 追加 ink-muted chip `run started` |
| Status Row | tool/text 不变；agent state → `live`（由 isRunning=true 推导） |
| Plan Output | 不变 |
| Signal | 已在点击时切到 `Streaming` |
| 按钮 | 已 disabled |

### 3.2 `tool_progress` `[CURRENT]` payload `{ name, status: "called"|"completed", itemType? }`

| 目标 | 动作 |
|------|------|
| state | `setEvents([...current, parsed])`；progress.toolEvents +1 |
| Event Rail | 追加 mint chip：`{status} {name}` |
| Status Row | tool events 计数 +1 |
| Plan Output | 不变 |
| Signal | 不变 |
| 按钮 | 不变 |

### 3.3 `text_delta` `[CURRENT]` payload `{ delta }`

| 目标 | 动作 |
|------|------|
| state | `setEvents([...current, parsed])`；`setOutput(current + delta)` |
| Event Rail | 追加 cyan chip `model text delta` |
| Status Row | text deltas 计数 +1；agent state `live` |
| Plan Output | 实时追加 delta 文本到 `<pre>` |
| Signal | 不变 |
| 按钮 | 不变 |

### 3.4 `approval_required` `[Phase 2 — DONE]` payload 完整

| 目标 | 动作 |
|------|------|
| state | `setEvents([...current, parsed])`；进入 approval 态；`setApprovalData(parsed)` |
| Event Rail | 追加 chip `approval required`（amber） |
| Status Row | agent state → `Awaiting approval` |
| Plan Output | 保留已生成内容 |
| Signal | → `Approval required` |
| 按钮 | Generate / Load example 保持 disabled |
| Approval Gate | **显示**（见 §4） |

Phase 2 后端 payload 已补齐：`{ type, runId, approvalId, title, reason, riskLevel, toolName, requestedAction, payloadPreview, timestamp }`。

### 3.5 `approval_resolved` `[Phase 2 — DONE]`

> Phase 2 后端在 approve/reject/timeout 后发 `approval_resolved { type, runId, approvalId, decision: "approved"|"rejected", timestamp }`。approved 后继续发 `run_completed`；rejected 后发安全说明 `text_delta` + `run_completed`。

| 目标 | 动作 `[Phase 2 — DONE]` |
|------|------|
| state | `setEvents([...current, parsed])` |
| Event Rail | 追加 chip `approval resolved: approved` / `...rejected` |
| Status Row | agent state：approved → 进入 `done`（后端直接发 `run_completed`）；rejected → 进入 `done`（后端发安全说明 `text_delta` + `run_completed`） |
| Plan Output | approved：run 已完成，不再追加；rejected：追加安全说明文本后冻结 |
| Approval Gate | 进入"提交中→已处理"过渡态后隐藏 |
| Signal | approved → `Plan ready`；rejected → `Plan ready`（均经 `run_completed` 进入 `done`） |

### 3.6 `error` `[CURRENT]` payload `{ message }`

| 目标 | 动作 |
|------|------|
| state | `setEvents([...current, parsed])`；`setError(message)` |
| Event Rail | 追加 ink-muted chip `error` |
| Status Row | 计数保留；agent state `Error`（`[Phase 1 — DONE]`） |
| Plan Output | **保留**已生成内容（不清空） |
| Signal | `Error`（`[Phase 1 — DONE]`） |
| 按钮 | isRunning=false → Generate / Load example 恢复 enabled |

### 3.7 `run_completed` `[CURRENT]` payload `{}`

| 目标 | 动作 |
|------|------|
| state | `setEvents([...current, parsed])`；progress.completed=true |
| Event Rail | 追加 chip `run completed` |
| Status Row | agent state → `done` |
| Plan Output | 不变（已是完整文本） |
| Signal | → `Plan ready` |
| 按钮 | 恢复 enabled |

### 3.8 `run_cancelled` `[GAP-后端未发送]`

> 后端当前无取消能力（无 cancel endpoint，前端无 Cancel 按钮）。本规范要求：前端新增 Cancel 按钮 → 调 `POST /api/runs/:runId/cancel`（需后端新增）→ 后端发 `run_cancelled`。

| 目标 | 动作（若后端补齐后） |
|------|------|
| state | `setEvents([...current, parsed])`；isRunning=false |
| Event Rail | 追加 chip `run cancelled` |
| Status Row | agent state → `cancelled` |
| Plan Output | 保留已生成部分 |
| Signal | → `Cancelled` |
| 按钮 | 恢复 enabled |

---

## 4. Approval Gate 交互

> 独立组件，**不**仅放 Event Rail。当收到 `approval_required` 时在 output-panel 内显式渲染。

### 4.1 出现位置

在 output-panel 内、Event Rail 下方、Plan Output 上方插入一个 `approval-gate` 区块。Plan Output 已生成内容保留在下方（可滚动查看），Approval Gate 视觉优先级最高（amber/red 边框）。

### 4.2 标题

`Approval required` —— amber eyebrow 风格，`AlertTriangle` 18px 图标。

### 4.3 字段显示方式

| 字段 | 后端来源 | 显示 |
|------|---------|------|
| `reason` | `[Phase 2 — DONE]` approval_required payload | 一段说明文字，ink-muted，解释为何需要审批 |
| `riskLevel` | `[Phase 2 — DONE]` approval_required payload | 一个 chip：low=mint / medium=amber / high=red，文字大写 |
| `toolName` | `[Phase 2 — DONE]` approval_required payload | 行内 `Tool: {toolName}`，等宽字体 |
| `payloadPreview` | `[Phase 2 — DONE]` approval_required payload | `<details>` 可折叠 `<pre>` 等宽块，JSON.stringify |
| `runId` | `[CURRENT]` 已有 | 不直接展示给用户，仅用于 Approve/Reject 请求 |

Phase 2 后端 payload 已补齐所有字段。

### 4.4 Approve 按钮

- 样式：primary（mint 背景、深色文字），文字 `Approve and continue`，`CheckCircle2` 图标。
- 行为：`POST /api/launch-plan/approval` `{ runId, approvalId, decision: "approved" }`。
- 提交中：disabled，文字 `Approving…`，spinner + `opacity:0.7`。
- 成功：等待后端 `approval_resolved`(approved) `[Phase 2 — DONE]` → `run_completed` → 隐藏 Approval Gate，进入 Completed（post-completion approval 模式：approve 后直接发 `run_completed`，不恢复 Streaming）。
- 失败：Approval Gate 内显示 `.approval-gate-error` inline error，按钮恢复可点，允许重试。

### 4.5 Reject 按钮

- 样式：`.reject`（透明背景，red 边框 + red 文字），文字 `Reject`，`X` 图标。
- 行为：`POST /api/launch-plan/approval` `{ runId, approvalId, decision: "rejected" }`。
- 提交中：disabled，文字 `Rejecting…`，spinner。
- 成功：后端发 `approval_resolved`(rejected) `[Phase 2 — DONE]` → 安全说明 `text_delta` + `run_completed` → 隐藏 Approval Gate。
- 失败：同 Approve 失败处理。

### 4.6 提交中状态

两个按钮均 disabled，Approval Gate 顶部出现 `Processing decision...`（mint，小字）。SSE 流保持连接，等待后端 resume 或 reject。

### 4.7 提交失败状态

Approval Gate 不消失，顶部插入红色 inline 错误条，message 来自 approve/reject 接口的非 2xx 响应 body。用户可重试 Approve/Reject。

### 4.8 用户拒绝后的页面状态

- Signal：`Plan ready`（`[Phase 2 — DONE]` reject 路径发 `approval_resolved(rejected)` + 安全说明 `text_delta` + `run_completed`，前端落入 `done` state）。
- Generate plan：enabled。
- Plan Output：保留审批前已生成内容 + 末尾追加安全说明文本（`Run stopped: … No customer-facing copy was generated.`）。
- Error Banner：不显示（`[Phase 2 — DONE]` reject 不走 error 路径）。
- 用户可修改输入后重新 Generate。

---

## 5. 错误恢复规则

### 5.1 SSE 中断时怎么显示 `[CURRENT]`

reader 抛错（网络断开、连接重置）被 `try/catch` 捕获 → `setError(err.message)`。页面进入 Error state：isRunning=false，output/events **保留**已收到部分。Error Banner 显示原始异常信息（可能是 `Failed to fetch` 等浏览器原生信息）。

### 5.2 后端返回 error 事件时 `[CURRENT]`

`setError(parsed.message)`。同样保留已生成 output/events。后端随后 `res.end()`，流正常关闭。

### 5.3 是否保留已生成内容

**保留**。`[CURRENT]` 无论是 SSE 中断还是 error 事件，都只 `setError`，**不**调用 `setOutput("")`/`setEvents([])`。仅在**新一次** Generate plan 启动时才清空。

### 5.4 是否允许重新点击 Generate

**允许**。error 后 isRunning=false，Generate plan 恢复 enabled。

### 5.5 Retry 是否清空旧结果 `[CURRENT vs PROPOSED]`

- `[CURRENT]` 无独立 Retry 按钮。用户只能再点 Generate plan，**会清空**旧 events/output/error（`runAgent` 开头三行 set）。
- `[PROPOSED]` 新增 Retry 按钮，行为 = 重新提交当前 form（等价 Generate plan），同样清空旧结果。若要"在旧结果基础上续跑"则需后端支持 resume，当前不支持。

### 5.6 Error Banner 文案规则 `[P1-FIXED]`

显示后端 `error.message` 或浏览器异常 message，**追加** ` Edit your input and try again.` 作为可操作建议。Banner 容器带 `role="alert"` + `aria-live="polite"`，屏幕阅读器可感知。常见来源（建议部分仍来自后端原始 message）：
- 后端 Zod 校验失败：`Describe the launch idea in at least a sentence.`（Product brief <12 字符）。
- 无 provider key：`No model provider API keys configured. Set at least one of ...`
- 运行异常：agent 抛出的原始 Error.message。
- 网络异常：`Failed to fetch`。

> 注：审批拒绝（Reject）不走 error 路径 `[Phase 2 — DONE]`。后端发 `approval_resolved(rejected)` + 安全说明 `text_delta` + `run_completed`，前端落入 `done` state，不显示 Error Banner（见 §4.8）。

### 5.7 recoverable / non-recoverable 区别 `[PROPOSED-后端需补字段]`

后端 `error` 当前无 `recoverable` 标志。本规范要求后端在 error payload 补 `recoverable: boolean`：

| 类型 | 含义 | 前端处理 |
|------|------|---------|
| recoverable=true | 瞬时错误（网络、限流、模型超时） | Error Banner 显示 + 提供 Retry 按钮，保留 output |
| recoverable=false | 配置错误（无 key、schema 不合法） | Error Banner 显示，**不**提供 Retry（重试也会失败），引导用户检查输入/配置 |

---

## 6. 输出区域交互

### 6.1 流式文本如何追加 `[CURRENT]`

`setOutput(current => current + parsed.delta)`，`<pre>{output}</pre>` 渲染。等宽字体，`white-space: pre-wrap`，`word-break: break-word`。

### 6.2 是否自动滚动到底部 `[Phase 1B — DONE]`

Plan Output `<pre>` 可垂直滚动（`overflow-y: auto`，6px 暗色 scrollbar）。Phase 1B 已实现自动滚到底部 + 用户上滑暂停 + Jump to latest 浮动按钮（见 §6.3/§6.4）。

### 6.3 用户手动上滚时是否暂停自动滚动 `[Phase 1B — DONE]`

是。检测 `scrollHeight - scrollTop - clientHeight > 120px` 视为用户在上滚，暂停自动 scroll，直到用户滚回底部。

### 6.4 是否显示 "Jump to latest" `[Phase 1B — DONE]`

是。当暂停自动滚动时，在 Plan Output 右下角浮出一个 mint 小按钮 `Jump to latest ↓`，点击滚到底并恢复自动滚动。

### 6.5 Copy result / Export markdown `[Phase 1B — DONE]`

完成态（run_completed）后在 Plan Output 顶部出现操作行：
- **Copy result**：复制 `output` 纯文本到剪贴板，按钮短暂变 `Copied ✓`。
- **Export markdown**：将 `output` 包裹为 `# Launch Plan\n\n{output}` 下载为 `launch-plan.md`。

### 6.6 空状态文案 `[CURRENT]`

`Megaphone` 24px + `Submit a launch brief to stream a prioritized release plan, risks, owner checklist, copy, and follow-up questions.`（max-width 430px，居中，ink-muted）。

### 6.7 长文本滚动条样式 `[P1-FIXED]`

```css
.plan-output pre { overflow-y: auto; overscroll-behavior: contain; }
.plan-output pre::-webkit-scrollbar { width: 6px; }
.plan-output pre::-webkit-scrollbar-thumb { background: #334038; }
.plan-output pre::-webkit-scrollbar-track { background: transparent; }
```
`<pre>` 容器已允许垂直滚动，6px 暗色 `#334038` 滚动条（webkit + Firefox `scrollbar-width: thin`）。`.plan-output` 外层仍 `overflow: hidden`，滚动发生在内层 `<pre>`。

### 6.8 Run Review Ledger（事件审计面板）`[Phase 3 — DONE]` `[Phase 3.5 — HARDENED]`

> Phase 3 新增只读审计 / 可见性层。不改变 SSE event contract，不改变 approval contract，不新增控制能力。Ledger 完全从现有 `events[]` state 派生。Phase 3.5 修正了折叠/展开交互和移动端适配。

**位置**：output-panel 内，event-rail 与 approval-gate 之间（grid row 6，plan-output 为 row 7）。

**渲染条件**：`events.length > 0` 时显示；初始空状态不渲染。

**折叠/展开交互** `[Phase 3.5 — HARDENED]`：
- `<details>` 元素，`open` 绑定到 `ledgerOpen` state（非 `progress.completed`）。
- `run_completed` 时 `useEffect` 自动展开（仅 false→true 转换触发一次）。
- 用户可自由折叠/展开，`onToggle` 同步 `ledgerOpen` state，不会被 re-render 覆盖。
- 新 run 启动时 `ledgerOpen` 重置为 `false`。
- Summary 右侧有 `▸`（收起）/ `▾`（展开）视觉指示器。

| 区域 | 内容 |
|------|------|
| Summary | `RUN REVIEW LEDGER — {N} entries`（amber，uppercase）+ `▸`/`▾` 指示器 |
| Timeline | 有序事件列表，每条含 seq 编号 + 类型标签 + 详情 + 时间戳 |
| Approval Summary | 若存在 `approval_required` 事件，显示只读审批摘要（approvalId、riskLevel chip、toolName、decision） |
| Final Summary | 若 `progress.completed`，显示运行总结（Total events、Tool calls、Text deltas、Approval、Final state） |

**事件条目渲染规则**：

| 事件类型 | Ledger 标签 | 详情 | 颜色 |
|----------|------------|------|------|
| `run_started` | `Run started` | `model: {model}` | steel |
| `tool_progress` | `{status} {name}` | — | mint |
| `text_delta`（连续聚合） | `Model text stream` | `{N} deltas, {M} chars` | cyan |
| `approval_required` | `Approval required` | `{approvalId}, risk: {riskLevel}, tool: {toolName}` | amber |
| `approval_resolved` | `Approval {decision}` | `{approvalId}` | mint（approved）/ red（rejected） |
| `error` | `Error` | `{message}` | red |
| `run_completed` | `Run completed` | — | mint |

> text_delta 聚合规则：连续的 text_delta 事件合并为一条 Ledger 条目，显示 delta 数量和总字符数。被非 text_delta 事件打断后，后续 text_delta 重新开始聚合。

**Approval Review 摘要**：从 `events[]` 中查找 `approval_required` 及其匹配的 `approval_resolved`（同 approvalId），只读展示 approvalId、riskLevel（chip）、toolName、requestedAction、decision。无新 state，纯派生。

**Final Summary 摘要**：run_completed 后展示总事件数、tool calls 计数、text deltas 计数、approval 决策（none / approved / rejected）、Final state（Done）。

**移动端适配** `[Phase 3.5 — HARDENED]`：
- `≤980px`：timeline `max-height` 从 260px 降至 180px。
- `≤620px`：ledger-entry `flex-wrap: wrap`，detail `white-space: normal; word-break: break-all`（不截断审计信息），summary-grid 从 `auto 1fr` 改为 `1fr`（标签/值纵向堆叠）。
- `prefers-reduced-motion`：ledger summary 和指示器 transition 禁用。

---

### 6.9 Run History（本地运行历史）`[Phase 4 — DONE]`

> Phase 4 新增前端本地运行历史持久化。使用浏览器 `localStorage` 保存已完成的 run 历史记录。不改变 SSE event contract，不改变 approval contract，不新增后端 endpoint，不新增 npm 依赖，不接数据库。

**存储键**：`launchdesk:run_history` → JSON-encoded `RunHistoryEntry[]`

**存储规则**：
- 最多 50 条记录（FIFO — 超出时截断最旧记录）。
- `schemaVersion: 1`（不匹配的条目在读取时跳过）。
- 仅保存 `status: "completed"` 的 run（仅在 `run_completed` 后保存）。
- 不保存 error run / in-progress run。
- 同一个 `run_completed` 不重复保存（`savedRunIdRef` 去重）。

**RunHistoryEntry 类型**：
```typescript
type RunHistoryEntry = {
  runId: string;
  schemaVersion: number;       // = 1
  createdAt: string;           // ISO 8601
  completedAt: string;         // ISO 8601
  status: "completed";
  brief: FormState;            // 表单快照
  events: PersistedRunEvent[]; // 脱敏事件（非原始 StreamEvent[]）
  approval: { ... } | null;    // 派生审批摘要
  output: string;              // 完整 markdown 输出
  toolEventCount: number;
  textDeltaCount: number;
};
```

**PersistedRunEvent 类型（脱敏事件）**：
```typescript
type PersistedRunEvent = {
  type: string;
  model?: string; traceLabel?: string;      // run_started
  name?: string; status?: string;            // tool_progress
  delta?: string;                            // text_delta
  message?: string;                          // error
  approvalId?: string; title?: string;       // approval_required
  reason?: string; riskLevel?: RiskLevel;
  toolName?: string; requestedAction?: string;
  timestamp?: string;
  decision?: "approved" | "rejected";        // approval_resolved
  runId?: string;
};
```

> **注意**：`PersistedRunEvent` 不包含 `payloadPreview`。`payloadPreview` 在持久化前被 `sanitizeStreamEventsForHistory()` 剥离。

**sanitizeStreamEventsForHistory(events: StreamEvent[]): PersistedRunEvent[]**：
- 不返回完整 `StreamEvent[]`，返回脱敏后的 `PersistedRunEvent[]`。
- `approval_required` 只保留：`approvalId`、`title`、`reason`、`riskLevel`、`toolName`、`requestedAction`、`timestamp`。
- **删除 `payloadPreview`**（从不持久化）。
- 删除任何匹配 `/header|token|auth|apiKey|secret|credential/i` 的字段（防御性剥离）。
- `text_delta` 只保留 `delta` 与时间戳。
- `tool_progress` 只保留 `name`、`status` 与时间戳。
- `error` 只保留 `message` 与时间戳。
- `run_started` / `run_completed` 只保留必要字段。

**UI 布局**：
- `.run-history-panel`：`<details>` 可折叠面板，位于 `.grid` 下方全宽，`.workspace` 内。
- **列表视图**：每行显示序号、日期/时间、status chip、tool/text 计数、approval decision（如有）。
- **详情视图**：点击历史条目后，output-panel 切换为只读 detail view，显示：
  - `HISTORY REVIEW — READ ONLY` banner（amber 边框）
  - Approval Review 摘要（如历史条目含 approval）
  - Run Review Ledger（复用 Phase 3 ledger 渲染思路，只读）
  - 完整 output markdown（只读 `<pre>`）
  - `Back to current run` 按钮（恢复实时视图）
  - `Export markdown` 按钮（使用历史条目的 output）
- **当前运行与历史详情模式区分**：detail view 有 amber banner 和 read-only 标识，与 live streaming 视觉上清晰区分。

**清除历史**：
- `Clear local history` 按钮（red 描边，位于 history panel summary 行）。
- `window.confirm("This will clear all saved run records from your browser. Continue?")` 确认。
- 只删除 `launchdesk:run_history` 键，不碰其他 localStorage 键。
- 清除后刷新 `runHistory` state，退出 detail view。

**导出 Markdown**：
- 复用 `exportMarkdown()` 逻辑，传入历史条目的 `output` 字段。
- 文件名：`launch-plan-{completedAt date}.md`。

**故障处理**：
| 故障 | 处理 |
|------|------|
| root JSON 无法解析 | 丢弃整个数组，清空损坏键，返回 `[]` |
| 单条记录 malformed | 过滤坏记录，保留可用记录 |
| schemaVersion 不匹配 | 跳过该条记录 |
| localStorage 不可用 | load 返回 `[]`，save/clear 不抛错 |
| QuotaExceededError | 截断旧记录后重试一次；仍失败则静默跳过保存 |
| 清除操作 | 只删除 `launchdesk:run_history`，不碰其他键 |

**历史详情只读**：历史详情视图不重新发送 SSE 事件，不调用后端，不修改 events state。仅从 `PersistedRunEvent[]` 派生 ledger 展示。

---

## 7. 前端状态机

### 7.1 状态集

`idle` · `ready` · `live` · `approval` · `error` · `done` · `cancelled`

> `[CURRENT]` 前端无显式状态机，由 `isRunning`/`error`/`progress.completed` 隐式推导。下表为本规范要求的目标状态机。

### 7.2 转移表

| from | 事件/操作 | to | 说明 |
|------|----------|-----|------|
| ∅ (初始) | 页面加载 | `idle` | output 空、events 空 |
| `idle` | 用户编辑表单使 Product brief ≥12 字符 | `ready` | `[Phase 1B — DONE]` 客户端校验通过 |
| `idle`/`ready` | 点击 Generate plan | `live` | 清空旧结果，POST |
| `live` | 收到 `run_completed` | `done` | Signal=Plan ready |
| `live` | 收到 `approval_required` | `approval` | 显示 Approval Gate |
| `live` | 收到 `error` | `error` | 保留 output |
| `live` | SSE 中断 / reader 抛错 | `error` | 保留 output |
| `live` | 用户点 Cancel `[GAP]` | `cancelled` | 需后端 cancel |
| `approval` | Approve 成功 | `done`（`[Phase 2 — DONE]` 后端直接发 `run_completed`，post-completion 模式不续跑） | 保留 output |
| `approval` | Reject 成功 | `done`（`[Phase 2 — DONE]` 后端发安全说明 `text_delta` + `run_completed`） | 保留 output + 追加安全说明 |
| `approval` | Approve/Reject 请求失败 | `approval` | 保留 Gate，inline error |
| `error` | 点击 Retry / Generate plan | `live` | 清空旧结果重跑 |
| `error` | 用户修正输入 | `ready` | 等待 Generate |
| `done` | 点击 Generate plan | `live` | 清空旧结果重跑 |
| `done` | 用户编辑输入 | `ready` | 等待 Generate |
| `cancelled` | 点击 Generate plan | `live` | 清空重跑 |

### 7.3 状态 → Signal/按钮 速查

| 状态 | Signal | Generate | Load example | Cancel `[GAP]` |
|------|--------|----------|--------------|----------------|
| idle | Ready | enabled | enabled | hidden |
| ready | Ready | enabled | enabled | hidden |
| live | Streaming | disabled | disabled | visible/enabled |
| approval | Approval required `[Phase 2 — DONE]` | disabled | disabled | visible/enabled |
| error | Error `[Phase 1 — DONE]` | enabled | enabled | hidden |
| done | Plan ready | enabled | enabled | hidden |
| cancelled | Cancelled `[PROPOSED]` | enabled | enabled | hidden |

---

## 8. 前端验收标准

> 可直接交给前端工程师逐条勾选。

**通用**
1. 所有组件保持 `border-radius: 0`，不引入圆角。
2. 移动端 `≤620px` 时 `.status-row` 必须纵向排列（`grid-template-columns: 1fr`，`border-right:0; border-bottom:1px solid var(--line)`）。
3. 移动端 `≤980px` 时 `.grid` 与 `.two-up` 必须单列堆叠。
4. 不新增 npm 依赖；动画用纯 CSS `@keyframes`。

**表单**
5. Product brief <12 字符时 Generate plan 不发送请求，给字段 red 边框 + inline error + focus `[Phase 1B — DONE]`。
6. 点击 Load example 覆盖前，若表单已被修改则弹 `window.confirm` 确认 `[P1-FIXED]`；未修改时直接覆盖。
7. 运行中 Load example 必须 disabled `[CURRENT]`。

**Generate / 清空**
8. 点击 Generate plan 后必须清空旧 events / output / error `[CURRENT]`。
9. 运行中 Generate plan 必须 disabled 且文字变 `Planning…`（含 CSS spinner）`[P1-FIXED]`。
10. 运行中 textarea 保持可编辑，显示 snapshot hint 说明"本次生成使用点击时的输入快照" `[Phase 1B — DONE]`。

**SSE 映射**
11. 收到 `text_delta` 必须实时拼接到 Plan Output 的 `<pre>` `[CURRENT]`。
12. 收到 `tool_progress` 必须使 tool events 计数 +1，并追加 mint chip `{status} {name}` `[CURRENT]`。
13. 收到 `error` 必须显示 Error Banner（`role="alert"`+`aria-live`）并**保留**已有 output 与 events `[P1-FIXED]`。
14. 收到 `run_completed` 后 Signal 必须变 `Plan ready`，agent state 变 `done` `[CURRENT]`。
15. Event Rail 最多显示最近 8 个事件，使用全数组稳定 key `[P1-FIXED]`。

**Approval `[Phase 2 — DONE]`**
16. 收到 `approval_required` 必须显示独立 Approval Gate（不只在 Event Rail）。
17. Approval Gate 必须显示 reason / riskLevel / toolName / payloadPreview（Phase 2 后端已补字段）。
18. Approve 调 `POST /api/launch-plan/approval` `{ decision: "approved" }`；提交中两按钮 disabled。
19. Reject 调 `POST /api/launch-plan/approval` `{ decision: "rejected" }`；拒绝后保留 output 并显示安全说明。
20. Approve/Reject 失败时 Gate 不消失，显示 inline error，允许重试。

**错误恢复**
21. SSE 中断时显示 Error Banner，保留已生成 output，Generate plan 恢复 enabled。
22. recoverable=false 的错误不显示 Retry `[PROPOSED-需后端补字段]`。

**输出**
23. 流式期间 Plan Output 自动滚到底部 `[Phase 1B — DONE]`。
24. 用户上滚时暂停自动滚动并显示 `Jump to latest` `[Phase 1B — DONE]`。
25. 完成态提供 Copy result 与 Export markdown `[Phase 1B — DONE]`。

**Run Review Ledger `[Phase 3 — DONE]`**
26. events.length > 0 时显示 Run Review Ledger；初始空状态不渲染 `[Phase 3 — DONE]`。
27. Ledger 展示完整事件生命周期（run_started → tool_progress → text_delta → approval_required → approval_resolved → error → run_completed）`[Phase 3 — DONE]`。
28. 连续 text_delta 事件聚合为单条 Ledger 条目，显示 delta 数和总字符数 `[Phase 3 — DONE]`。
29. 存在 approval_required 事件时显示只读 Approval Review 摘要（approvalId、riskLevel chip、toolName、decision）`[Phase 3 — DONE]`。
30. run_completed 后显示 Final Summary（Total events、Tool calls、Text deltas、Approval、Final state）`[Phase 3 — DONE]`。
31. Ledger 不改变现有 SSE event contract 和 approval contract `[Phase 3 — DONE]`。

**Run History `[Phase 4 — DONE]`**
32. mount 时从 `localStorage` 加载运行历史，渲染列表 `[Phase 4 — DONE]`。
33. `run_completed` 后构建 `RunHistoryEntry` 并保存到 `localStorage`（去重，同一 run 不重复保存）`[Phase 4 — DONE]`。
34. error run / in-progress run 不保存到历史 `[Phase 4 — DONE]`。
35. 点击历史条目进入只读 detail view（brief + ledger + output），有 `Back to current run` 按钮 `[Phase 4 — DONE]`。
36. `Clear local history` 按钮使用 `window.confirm` 确认，只删除 `launchdesk:run_history` 键 `[Phase 4 — DONE]`。
37. 导出 Markdown 使用历史条目的 `output` 字段 `[Phase 4 — DONE]`。
38. 空历史显示空状态提示 `[Phase 4 — DONE]`。
39. root JSON malformed 不崩溃，重置为空 `[Phase 4 — DONE]`。
40. 单条记录 malformed 被过滤，好记录保留 `[Phase 4 — DONE]`。
41. `QuotaExceededError` 不中断当前运行完成 `[Phase 4 — DONE]`。
42. 超过 50 条记录时截断最旧记录 `[Phase 4 — DONE]`。
43. `payloadPreview` 不被持久化（`sanitizeStreamEventsForHistory` 剥离）`[Phase 4 — DONE]`。
44. header/token/auth/apiKey/secret/credential-like 字段不被持久化 `[Phase 4 — DONE]`。
45. 现有 approval gate 行为不回退 `[Phase 4 — DONE]`。
46. Run History 不改变 SSE event contract 和 approval contract `[Phase 4 — DONE]`。

---

## 9. 给美工 / 生图工具的状态图要求（6 张）

> 每张图按桌面端 1480px 宽双栏布局绘制，dark mode，色板见 UIUX 文档，**所有圆角为 0**。每张必须画出左侧 input-panel（5 字段 + 2 按钮）与右侧 output-panel（status-row + event-rail + plan-output）。

### 图 1 — 空状态 (Idle)

- **Mast**：`LAUNCH DESK` / h1 / Signal = `📡 Ready`（mint）。
- **左侧**：5 字段均**空白**（含 placeholder 灰字）；Generate plan（mint）+ Load example（steel 描边）均 enabled。
- **右侧 status-row**：`0 / tool events`、`0 / text deltas`、`idle / agent state`（amber 数字，ink-muted 标签）。
- **event-rail**：空。
- **plan-output**：居中 `Megaphone` 24px + 空状态文案。
- **视觉重点**：右侧大片留白与空状态文案，引导用户去左侧填写。
- **必须出现的文字**：`Ready`、`idle`、`0`×3、`Generate plan`、`Load example`、空状态文案全文。

### 图 2 — 表单填写状态 (Form filled)

- **左侧**：5 字段填满示例文本（Product brief 6 行、Audience/Launch date 3 行、Constraints/Assets 4 行）。
- **Generate plan**：mint，enabled，`▶ Generate plan`。
- **右侧**：status-row 仍 `0/0/idle`；event-rail 空；plan-output 仍空状态。
- **视觉重点**：左侧信息密度高、右侧仍空，形成"待发射"张力。
- **必须出现**：示例 brief 文本（至少 Product brief 前 2 行可见）、`Ready`、`Generate plan` 可点。

### 图 3 — 流式生成状态 (Streaming)

- **Mast Signal**：`📡 Streaming`（mint，可加 pulse 动画示意）。
- **左侧**：Generate plan = mint disabled `Planning...`；Load example disabled。
- **右侧 status-row**：`3 / tool events`、`7 / text deltas`、`live / agent state`。
- **event-rail**：横向 6-8 个 chip——`run started`(muted)、`called prioritize_tasks`(mint)、`completed prioritize_tasks`(mint)、`model text delta`×3-4(cyan)、`called readiness_check`(mint)。右端可淡出表示截断。
- **plan-output**：`<pre>` 内已有约 8-12 行等宽计划文本，最后一行带闪烁光标示意流式。
- **视觉重点**：右侧三区域同时活跃（数字跳动、chip 追加、文本生长）。
- **必须出现**：`Streaming`、`Planning...`、`live`、≥3 个 mint chip、≥3 个 cyan chip、流式文本含光标。

### 图 4 — 审批中断状态 (Approval required)

- **Mast Signal**：`📡 Approval required`（amber）`[Phase 2 — DONE]`。
- **左侧**：两按钮仍 disabled。
- **右侧**：status-row `live`（或 `awaiting approval`）；event-rail 含 `approval required` chip。
- **Approval Gate**（output-panel 内、event-rail 下方）：amber 边框区块，标题 `Approval required` + AlertTriangle；内含：
  - riskLevel chip：`HIGH`（red）
  - `Tool: send_launch_email`
  - reason 一行说明
  - payloadPreview `<pre>` 3 行（收件人、内容摘要）
  - `Approve`（mint primary）+ `Reject`（red 描边）两按钮
- **plan-output**：Gate 下方保留已生成部分计划文本（约 6 行）。
- **视觉重点**：amber/red Approval Gate 是焦点，挡在输出之上。
- **必须出现**：`Approval needed`、`Approval required`、`HIGH`、`Approve`、`Reject`、reason 文本、payload 预览。

### 图 5 — 错误状态 (Error)

- **Mast Signal**：`📡 Error`（red）`[Phase 1 — DONE]`。
- **左侧**：Generate plan 恢复 enabled mint；Load example enabled。
- **右侧**：status-row 保留 `2 / tool events`、`4 / text deltas`、`error / agent state`（`[Phase 1 — DONE]`）。
- **error-banner**：red 半透明背景，AlertTriangle + `No model provider API keys configured. Set at least one of DEEPSEEK_API_KEY, ARK_API_KEY, ...`（用真实后端文案）。
- **event-rail**：保留 `run started`、`error` 等 chip。
- **plan-output**：保留已生成约 4 行文本（error 不清空）。
- **视觉重点**：红色 Error Banner 横在 status-row 与 event-rail 之间，但下方内容仍在。
- **必须出现**：`Error`、error message 全文、AlertTriangle、≥4 行残留 plan 文本、Generate plan 可点。

### 图 6 — 完成状态 (Completed)

- **Mast Signal**：`📡 Plan ready`（mint）。
- **左侧**：Generate plan（mint enabled）、Load example（enabled）。
- **右侧 status-row**：`6 / tool events`、`18 / text deltas`、`done / agent state`。
- **event-rail**：最后 8 chip，末尾为 `run completed`。
- **plan-output 顶部**：操作行 `Copy result` + `Export markdown` 小按钮 `[Phase 1B — DONE]`。
- **plan-output**：完整计划文本（约 18-24 行等宽），含 P0/P1 任务、readiness、owner checklist、follow-up questions 结构。
- **视觉重点**：稳定、完整、可复制导出。
- **必须出现**：`Plan ready`、`done`、`run completed` chip、`Copy result`、`Export markdown`、完整计划文本含 `P0:`/`P1:` 字样。

---

## 附：后端缺口清单

| # | 缺口 | 状态 | 影响章节 |
|---|------|------|---------|
| 1 | 生产路径默认 `approvalPolicy.enabled=false`，不发 `approval_required` | ✅ Phase 2 — `approvalPolicy.enabled` 可显式开启 | §2.4 §3.4 §4 |
| 2 | `approval_required` payload 完整字段 | ✅ Phase 2 — DONE | §3.4 §4.3 |
| 3 | `approval_resolved` 事件 | ✅ Phase 2 — DONE | §3.5 §4.4 §4.5 |
| 4 | 无 `run_cancelled` 事件，无 cancel endpoint | Future — 不在本阶段 | §3.8 §7 |
| 5 | `error` 无 `recoverable` 标志 | Future | §5.7 §8 |
| 6 | 无客户端校验（Product brief <12 字符） | ✅ Phase 1B — DONE | §1.3 §8.5 |
| 7 | 无事件审计 / 可见性面板 | ✅ Phase 3 — DONE | §6.8 §8.26-31 |

> Phase 1/1B/2/3 已补齐缺口 1-3、6、7。缺口 4（Cancel）和 5（recoverable）仍为 Future。

---

## 附：Phase 1 前端修复记录

> **状态：`Phase 1 — Current Backend Streaming UI: DONE`**（已验收，可合并，进入真实浏览器联调）
>
> 覆盖后端真实支持的 5 个 SSE 事件：`run_started` · `tool_progress` · `text_delta` · `error` · `run_completed`。
>
> 范围：修复可用性、可访问性、长文本阅读、基础交互。不扩展 Approval / Cancel，不新增依赖，不改色板/圆角/双栏布局。
> 验证：`npm run typecheck` ✓、`npm run test` 29 文件 / 320 用例全绿 ✓、`npm run build` ✓、`npm run lint` ✓。

### P0 必修（7 项，全部完成）

| # | 修复项 | 落地点 |
|---|--------|--------|
| 1 | keyboard focus：textarea `:focus-visible` + button `:focus-visible`（cyan outline，直角） | `styles.css` |
| 2 | Error Banner 可访问性：`role="alert"` + `aria-live="polite"` + 追加 `Edit your input and try again.` | `main.tsx` |
| 3 | Plan Output 长文本：`<pre>` `overflow-y: auto` + 6px 暗色 scrollbar，保留 `pre-wrap`/`break-word` | `styles.css` |
| 4 | Load example 覆盖确认：表单与 sampleBrief 不一致时 `window.confirm` | `main.tsx` `loadExample()` |
| 5 | decorative icons：12 个 lucide 图标全部 `aria-hidden="true"` | `main.tsx` |
| 6 | textarea 语义：5 字段加 `name` + `autoComplete="off"` + `spellCheck` | `main.tsx` Field |
| 7 | Event Rail key：改用全数组稳定序号 `evt-{fullIndex}` | `main.tsx` |

### P1 一起修（7 项，全部完成）

| # | 修复项 | 落地点 |
|---|--------|--------|
| 8 | CSS spinner（`@keyframes spin`）+ `Planning…` + `Streaming…` 省略号 | `styles.css` + `main.tsx` |
| 9 | `.metric` `font-variant-numeric: tabular-nums` | `styles.css` |
| 10 | button hover/active（`scale(0.98)`）+ `touch-action: manipulation` | `styles.css` |
| 11 | `@media (prefers-reduced-motion: reduce)` 关闭 spinner/active | `styles.css` |
| 12 | `.shell` `env(safe-area-inset-*)` padding | `styles.css` |
| 13 | event chip `max-width:280px` + `text-overflow:ellipsis` + `nowrap` | `styles.css` |
| 14 | `<meta name="theme-color" content="#0d1110">` | `index.html` |

### 额外修复（审查发现，一并完成）

- `textarea:focus` → `textarea:focus-visible`（避免点击留焦点环）
- `event-rail` `overscroll-behavior-x: contain`（防横向滚动 bounce）
- `h1` `text-wrap: balance`（防标题孤行）
- placeholder `...` → `…`（Constraints / Assets）
- `button:disabled:hover` 固定 opacity（防 hover 改变 disabled 视觉）
- `-webkit-tap-highlight-color: transparent`（移动端 tap 闪屏）

### 未处理项 — Phase 2 / Phase 3 / Future

| 项 | 归属 | 状态 |
|----|------|------|
| Approval Gate 独立 UI | Phase 2 | ✅ DONE — 后端补齐 `approval_required` 完整 payload + `approval_resolved` 事件 + `POST /api/launch-plan/approval` endpoint；前端启用 Approval Gate |
| `approval_resolved` 事件 | Phase 2 | ✅ DONE — 后端在 approve/reject 后发 `approval_resolved { decision, runId, approvalId, timestamp }` |
| Run Review Ledger | Phase 3 | ✅ DONE — 前端只读审计面板，展示事件生命周期、审批摘要、运行总结；不改变 SSE/approval contract |
| Cancel / Stop Run 按钮 | Future | 后端无 cancel endpoint、无 `run_cancelled` 事件 |
| `run_cancelled` 事件 | Future | 同上 |
| `recoverable` 错误区分 | Future | 需后端在 error payload 补 `recoverable` 字段 |

### Phase 2 — Approval Governance Backend Contract + Frontend Gate Enablement

> **状态：`Phase 2 — Approval Governance: DONE`**
>
> 补齐后端 approval 能力，前端真实启用 Approval Gate。不包含 Cancel / Stop Run（仍为 Future）。
> 验证：`npm run typecheck` ✓、`npm run test` 31 文件 / 339 用例全绿 ✓、`npm run build` ✓、`npm run lint` ✓。

#### 新增 / 修正的事件协议

| 事件 | 旧 | 新 |
|------|----|----|
| `approval_required` | `{ runId }` | `{ type, runId, approvalId, title, reason, riskLevel, toolName, requestedAction, payloadPreview, timestamp }` |
| `approval_resolved` | 不存在 | `{ type, runId, approvalId, decision: "approved"\|"rejected", timestamp }` |

#### 新增 endpoint

```http
POST /api/launch-plan/approval
Content-Type: application/json

{ "runId": "run_...", "approvalId": "appr_...", "decision": "approved" | "rejected" }
```

返回 `{ "ok": true }` 或 `{ "ok": false, "error": "approval_not_found" }` (404) 或 `{ "ok": false, "error": "invalid_input" }` (400)。

#### Approval policy

```ts
type ApprovalPolicy = { enabled: boolean; requireApprovalForExternalCopy: boolean };
```

默认 `enabled: false`。测试或 demo 可 `approvalPolicy.enabled = true` 启用。`trackingEnabled`（显式传入 orchestrator）也自动启用审批。

#### 运行恢复策略

- `approval_required` 发出后 agent 暂停等待 decision（SSE 流保持打开）
- `approved` → 发 `approval_resolved { decision: "approved" }` → 发 `run_completed`
- `rejected` → 发 `approval_resolved { decision: "rejected" }` → 发安全说明 `text_delta` → 发 `run_completed`
- 5 分钟超时自动 reject（安全默认）
- 内存 Map `pendingApprovals` 存储 PendingApproval，key 为 `runId:approvalId`

#### 前端 Approval Gate 行为

| 状态 | 行为 |
|------|------|
| 收到 `approval_required` | 显示 Approval Gate，agent state → "Awaiting approval"，signal → "Approval required"，Event Rail 添加 amber chip |
| 点击 Approve | POST `/api/launch-plan/approval` `{ decision: "approved" }`，按钮进入 submitting |
| 点击 Reject | POST `/api/launch-plan/approval` `{ decision: "rejected" }`，按钮进入 submitting |
| 收到 `approval_resolved approved` | 隐藏 Gate，后端直接发 `run_completed` → state → done，Signal → Plan ready |
| 收到 `approval_resolved rejected` | 隐藏 Gate，state → done，Plan Output 显示安全替代说明 |
| POST 失败 | Gate 保留，显示 inline error，按钮重新启用 |
| Error 事件 | Gate 不残留（awaitingApproval 派生包含 `!error`） |

#### 视觉规则

- amber 边框 + `--panel-strong` (#1d241f) 深色背景
- `low` = mint, `medium` = amber, `high` = red（risk-chip）
- Approve 按钮 = `.primary` (mint)
- Reject 按钮 = `.reject`（透明背景 + red border + red text）
- `border-radius: 0` 全局
- Event Rail: `approval_required` = amber chip, `approval_resolved` = mint chip

#### 测试覆盖

**后端（8 项）：** payload 字段完整、approve、reject、invalid decision 400、unknown approvalId 404、rejected 安全说明、approved 继续完成、legacy `/api/runs/:runId/approve` 兼容。

**前端（11 项）：** Gate 显示、字段显示（reason/riskLevel/toolName/payloadPreview）、Approve POST body、Reject POST body、submitting 禁用、resolved approved 隐藏、resolved rejected 隐藏、Error 不残留、Event Rail chip、last 8 cap、POST 失败 inline error。

### Phase 1B 路线图（下一步，不扩后端 Approval）

> **状态：`Phase 1B — 交互增强 + UI Copy & Visual Hierarchy: DONE`**
>
> Phase 1 已可合并并进入真实浏览器联调。Phase 1B 在此基础上补交互增强 + UI Copy & Visual Hierarchy 调整。
> 验证：`npm run typecheck` ✓、`npm run test` 29 文件 / 320 用例全绿 ✓、`npm run build` ✓、`npm run lint` ✓。

#### Phase 1B-0 UI Copy & Visual Hierarchy（English primary + 中文辅助）

将页面从"中文暗色 admin 表单"调整为"Launch Desk 工程发布规划 agent 工作台"。英文为主，中文作辅助说明。
新增面板标题、缩 h1、agent state 由大数字 metric 改为小型 state-pill。

| 调整项 | 旧 | 新 | 位置 |
|--------|----|----|------|
| h1 | "Release planning agent" | "Launch Desk" | mast h1 |
| eyebrow | 无 | "LAUNCH DESK" | mast |
| subhead | 无 | "Release planning agent for engineering teams." | mast |
| subhead-zh | 无 | "输入产品概要，实时生成发布任务、风险、负责人清单、渠道文案和后续问题。" | mast |
| panel-heading | 无 | "LAUNCH BRIEF" / "PLAN OUTPUT" + 描述句 | input/output panel |
| agent state | 大号 amber metric 数字 | 小型 state-pill（Idle/Live/Done/Error） | status-row |
| metric labels | 工具事件 / 文本片段 / 代理状态 | tool events / text deltas / agent state | status-row |
| Signal | 准备就绪 / 生成中… / 计划已完成 | Ready / Streaming… / Plan ready / Error | signal |
| Buttons | 生成计划 / 加载示例 | Generate plan / Load example | input panel |
| Empty state | 中文长文案 | "No run yet" + "Submit a launch brief to stream a prioritized release plan." | plan-output |
| Field labels | Launch date / Available assets | Launch window / Assets | form fields |
| h1 clamp | 4rem | clamp(1.6rem, 2.4vw, 2.6rem) | styles.css |
| Copy / Export | 复制结果 / 导出 | Copy / Export markdown | output-actions（completed 态） |

#### Phase 1B 交互增强（7 项，全部完成）

| 序 | 任务 | 落地点 | 说明 |
|----|------|--------|------|
| 1 | Product brief 前端最小校验 | `runAgent()` + `briefError` state + `briefRef.focus()` | <12 字符不发请求，inline error + focus |
| 2 | Plan Output 自动滚到底部 | `useEffect` + `outputRef` + `autoScroll` state | text_delta 追加后 `scrollTop = scrollHeight` |
| 3 | 用户上滑暂停自动滚动 | `handleOutputScroll` | 距底部 >120px 时 `setAutoScroll(false)` |
| 4 | Jump to latest | `.jump-to-latest` 浮动按钮 | 暂停时显示，点击滚底 + 恢复自动滚动 |
| 5 | Copy result | `copyResult()` + `navigator.clipboard` | 完成或有输出时可复制，成功后显示「已复制 ✓」2s |
| 6 | Export markdown | `exportMarkdown()` + Blob 下载 | 文件名 `launch-plan-{YYYY-MM-DD}.md` |
| 7 | 运行中输入快照提示 | `.snapshot-hint` | 运行中显示「本次生成使用点击时的输入快照…」，不锁死 textarea |

---

### Phase 3 — Run Review Ledger + Operator Audit View

> **状态：`Phase 3 — Run Review Ledger: DONE`**
>
> 前端只读审计 / 可见性层。不改变 SSE event contract，不改变 approval contract，不新增控制能力。Ledger 完全从现有 `events[]` state 派生。
> 验证：`npm run typecheck` ✓、`npm run test` 32 文件 / 349 用例全绿 ✓、`npm run build` ✓、`npm run lint` ✓、`npm run verify:secrets` 0 ✓。

#### 设计约束

- **只读**：Ledger 不发起新请求，不修改 events state，不影响 run 生命周期。
- **派生**：Ledger 内容从 `events[]` + `progress` memo 派生。`ledgerOpen` state（Phase 3.5）仅控制 `<details>` 展开/折叠，不参与事件数据派生。
- **不破坏**：output-panel grid 从 6 行扩为 7 行（新增 `auto` 行给 Ledger，plan-output 保持 `1fr`）。
- **折叠**：`<details>` 元素，`open` 绑定 `ledgerOpen` state。run 进行中默认折叠，`run_completed` 时 `useEffect` 自动展开一次，用户可自由折叠/展开（`onToggle` 同步）。新 run 重置为折叠 `[Phase 3.5 — HARDENED]`。
- **text_delta 聚合**：连续 text_delta 合并为单条条目（`{N} deltas, {M} chars`），避免 50+ 条噪音。

#### 新增文件

| 文件 | 类型 | 说明 |
|------|------|------|
| `src/tests/run-ledger-ui.test.tsx` | 新增 | 9 项前端测试 |

#### 修改文件

| 文件 | 修改内容 |
|------|---------|
| `src/client/main.tsx` | `ListTree` 图标、`LedgerEntry` 类型、`ledgerEntries`/`approvalSummary` memo、Ledger JSX、`LedgerEntry` 导出 |
| `src/client/styles.css` | `.run-ledger` 系列 CSS（summary、timeline、entry、approval-summary、final-summary），grid-template-rows 7 行 |
| `package.json` | test 脚本追加 `src/tests/run-ledger-ui.test.tsx` |

#### 测试覆盖

**前端（9 项）：** normal run ledger rendering、approval_required appears in ledger、approval_resolved approved appears in ledger、approval_resolved rejected appears in ledger、run_completed shows final review summary、error event appears in ledger、existing approval gate behavior unchanged、ledger not shown on initial empty state、text_delta events aggregated。

---

### Phase 3.5 — Demo Readiness + Browser QA Hardening

> **状态：`Phase 3.5 — Demo Readiness: DONE`**
>
> 不新增后端能力、不改变 SSE/approval contract。仅修正 Phase 3 Ledger 的折叠/展开交互 bug 和移动端适配。
> 验证：`npm run typecheck` ✓、`npm run test` 32 文件 / 351 用例全绿 ✓、`npm run build` ✓、`npm run lint` ✓、`npm run verify:secrets` 0 ✓。

#### 修正项

| # | 问题 | 修正 | 位置 |
|---|------|------|------|
| 1 | Ledger `<details open={progress.completed}>` 受控属性与原生 toggle 冲突 — 用户无法在 run_completed 后折叠 | `ledgerOpen` state + `useEffect`（completed 时自动展开一次）+ `onToggle` 同步 + 新 run 时重置 | `main.tsx` |
| 2 | 无展开/收起视觉指示器 | `summary::after` 伪元素 `▸`/`▾` | `styles.css` |
| 3 | 移动端 ledger-entry-detail `nowrap` 截断审计信息 | `≤620px`：`flex-wrap: wrap`、`white-space: normal; word-break: break-all` | `styles.css` |
| 4 | 移动端 summary-grid 长值溢出 | `≤620px`：`grid-template-columns: 1fr`（纵向堆叠） | `styles.css` |
| 5 | 小屏 timeline 260px 过高挤压 plan-output | `≤980px`：`max-height: 180px` | `styles.css` |
| 6 | `prefers-reduced-motion` 未覆盖 ledger transition | 补充 `.run-ledger > summary` 和 `::after` transition: none | `styles.css` |

#### 测试覆盖

**前端（+2 项，共 11 项）：** ledger auto-expands on run_completed、ledger can be collapsed after run_completed and stays collapsed（含 re-expand 验证）。

---

### Phase 4 — Run Persistence Contract / Local Run History

> **状态：`Phase 4 — Run History: DONE`**
>
> 前端本地运行历史持久化。使用浏览器 `localStorage` 保存已完成的 run 历史记录。不改变 SSE event contract，不改变 approval contract，不新增后端 endpoint，不新增 npm 依赖，不接数据库，不接外部服务，不新增鉴权系统。
> 验证：`npm run typecheck` ✓、`npm run test` 33 文件 / 373 用例全绿 ✓、`npm run build` ✓、`npm run lint` ✓、`npm run verify:secrets` 0 ✓。

#### PRD 依据

`docs/PHASE4_PRD.md`（PRD_LOCK — Mini Patch Applied）。实现完全基于该 PRD，不参考旧 PRD 中 `events: StreamEvent[]` 的写法。

#### 设计约束

- **前端本地**：纯客户端 localStorage，不调后端，不接数据库，不接外部服务。
- **只保存 completed**：仅 `run_completed` 后保存；error / in-progress run 不保存。
- **脱敏**：事件经 `sanitizeStreamEventsForHistory()` 脱敏后持久化为 `PersistedRunEvent[]`（非原始 `StreamEvent[]`）。
- **payloadPreview 不持久化**：`approval_required.payloadPreview` 在持久化前被剥离。
- **敏感字段不持久化**：任何匹配 `/header|token|auth|apiKey|secret|credential/i` 的字段被防御性剥离。
- **不重复保存**：`savedRunIdRef` 去重，同一 run 只保存一次。
- **去重 + 重置**：新 run 启动时清空 `savedRunIdRef` 并退出历史详情视图。
- **只读详情**：历史详情视图不重新发送 SSE 事件，不修改 events state，仅从 `PersistedRunEvent[]` 派生展示。
- **不破坏**：不改 7 个 SSE event，不改 approval contract，不改 approval gate 行为，不破坏 Run Review Ledger。

#### 新增文件

| 文件 | 类型 | 说明 |
|------|------|------|
| `src/client/runHistoryStore.ts` | 新增 | localStorage 封装：`loadRunHistory`、`saveRunToHistory`、`clearRunHistory`、`sanitizeStreamEventsForHistory`、`buildRunHistoryEntry`、`PersistedRunEvent`、`RunHistoryEntry` 类型 |
| `src/tests/run-history-ui.test.tsx` | 新增 | 22 项前端测试（16 UI + 6 单元） |

#### 修改文件

| 文件 | 修改内容 |
|------|---------|
| `src/client/main.tsx` | `History`/`ArrowLeft`/`Trash2` 图标、`runHistory`/`selectedHistoryRun`/`historyOpen` state、`savedRunIdRef` 去重、mount 加载、`run_completed` 保存 effect、`exportHistoryMarkdown`/`handleClearHistory` handler、`historyLedgerEntries` memo、历史面板 JSX + 详情视图 JSX、`RunHistoryEntry`/`PersistedRunEvent` 导出 |
| `src/client/styles.css` | `.run-history-panel` 系列 CSS（summary、body、list、row、clear-btn）、`.history-detail-*` 详情视图 CSS、移动端适配、reduced-motion 覆盖 |
| `package.json` | test 脚本追加 `src/tests/run-history-ui.test.tsx` |
| `docs/FRONTEND_USAGE_INTERACTION_SPEC.md` | §6.9 Run History 文档、§8 验收标准 #32-46、Phase 4 交付记录 |

#### 存储契约

- **键**：`launchdesk:run_history`
- **值**：JSON-encoded `RunHistoryEntry[]`
- **上限**：50 条（FIFO）
- **schemaVersion**：1（不匹配跳过）
- **仅 completed**：error / in-progress 不保存

#### 脱敏规则

`sanitizeStreamEventsForHistory(events: StreamEvent[]): PersistedRunEvent[]`：
- 返回 `PersistedRunEvent[]`（非 `StreamEvent[]`）
- `approval_required` 只保留：`approvalId`、`title`、`reason`、`riskLevel`、`toolName`、`requestedAction`、`timestamp`
- 删除 `payloadPreview`
- 删除任何 `header`/`token`/`auth`/`apiKey`/`secret`/`credential`-like 字段

#### 故障处理

| 故障 | 处理 |
|------|------|
| root JSON 无法解析 | 丢弃整个数组，清空损坏键，返回 `[]` |
| 单条记录 malformed | 过滤坏记录，保留可用记录 |
| schemaVersion 不匹配 | 跳过该条记录 |
| localStorage 不可用 | load 返回 `[]`，save/clear 不抛错 |
| QuotaExceededError | 截断旧记录后重试一次；仍失败则静默跳过保存 |
| 清除操作 | 只删除 `launchdesk:run_history`，不碰其他键 |

#### 测试覆盖

**前端（22 项 = 16 UI + 6 单元）：**
1. localStorage 中已有历史记录时，挂载后渲染列表
2. run_completed 后保存一条历史记录
3. error run 不保存
4. in-progress run 不保存
5. 点击历史记录行打开详情
6. 返回当前运行恢复实时视图
7. 清除本地历史记录删除 launchdesk:run_history
8. 导出 Markdown 使用历史 output
9. 空历史显示空状态
10. root JSON malformed 不崩溃并重置为空
11. 单条记录 malformed 被过滤，好记录保留
12. QuotaExceededError 不中断当前运行完成
13. 超过 50 条记录时截断最旧记录
14. payloadPreview 不被持久化
15. header/token/auth/apiKey/secret/credential-like 字段不被持久化
16. 现有 approval gate 行为不回退
17. sanitizeStreamEventsForHistory 返回 PersistedRunEvent[]（单元）
18. loadRunHistory 空时返回 []（单元）
19. saveRunToHistory + loadRunHistory 往返正确（单元）
20. clearRunHistory 只删除 run history 键（单元）
21. schemaVersion 不匹配条目被跳过（单元）
22. buildRunHistoryEntry 派生字段正确（单元）

#### Future 项（仍未实现）

以下项在 Phase 4 中**未实现**，保持 Future 状态：

- Cancel / Stop Run
- `run_cancelled` event
- Retry button
- `recoverable` error field
- backend persistence（数据库）
- IndexedDB
- cross-device sync
- rerun from history
- 持久化 error/failed runs
- run comparison / diff view
- search/filter in history
- TTL/auto-expiry for run history
- 持久化 payloadPreview
