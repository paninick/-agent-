# Launch Desk Demo Script

> **Phase 5 — Release Operations Pack**
>
> 本文档为 Launch Desk 的演示脚本。按顺序执行 Demo 1–6 可完整展示 Phase 1B–4 的全部功能。

---

## 前置准备

1. 启动 API 服务器：`npm run dev:server`
2. 启动前端：`npm run dev:web`
3. 打开浏览器：`http://127.0.0.1:5173`
4. 确认 `.env.local` 中至少配置了一个 provider key
5. 清空浏览器 localStorage（可选，确保干净演示状态）：
   ```javascript
   localStorage.removeItem("launchdesk:run_history");
   ```

---

## Demo 1: Normal Launch Plan Streaming

**目标**：展示正常的 launch plan 流式生成。

**步骤**：

1. 点击 **Load example** 按钮（表单填入示例 brief）
2. 点击 **Generate plan** 按钮
3. 观察：
   - Signal 变为 `Streaming…`（mint 色）
   - 左侧 Generate plan 按钮变为 disabled，显示 `Planning…` + spinner
   - 显示 snapshot hint：`This run uses the input snapshot from when you clicked Generate.`
   - 右侧 status-row 计数实时增长（Tool events / Text deltas）
   - Event Rail 显示最近 8 个事件（mint chip = tool，cyan chip = text delta）
   - Plan Output 区域实时流式显示 markdown 文本，自动滚到底部

4. 等待运行完成：
   - Signal 变为 `Plan ready`（mint 色）
   - agent state 变为 `Done`
   - 出现 **Copy result** 和 **Export markdown** 按钮
   - Run Review Ledger 自动展开

**验收点**：
- ✅ 流式文本实时拼接
- ✅ tool_progress 计数正确
- ✅ run_completed 后 Signal = `Plan ready`
- ✅ Copy / Export 按钮出现
- ✅ Ledger 自动展开

---

## Demo 2: Approval Required / Approve Path

**目标**：展示审批门控的 approve 路径。

> **前提**：`approvalPolicy.enabled = true` 或 agent 在生成过程中触发 `approval_required` 事件。如果 demo 环境未启用审批策略，此 demo 可能无法触发——可跳过或使用 mock 数据。

**步骤**：

1. 填写一个包含 customer-facing launch copy 的 brief（如示例 brief）
2. 点击 **Generate plan**
3. 当 agent 生成完成时，观察：
   - 出现 **Approval Gate**（amber 边框区块）
   - Gate 标题：`Approval required` + AlertTriangle 图标
   - 显示 riskLevel chip（如 `HIGH`，red 色）
   - 显示 `Tool: {toolName}`（等宽字体）
   - 显示 reason 说明文字
   - 显示 payloadPreview `<details>` 可折叠 JSON 预览
   - 两个按钮：**Reject**（red 描边）+ **Approve and continue**（mint primary）

4. 点击 **Approve and continue**：
   - 两按钮变为 disabled，显示 `Approving…` + spinner
   - 等待 `approval_resolved`（approved）SSE 事件
   - Gate 消失
   - 发送 `run_completed`，Signal 变为 `Plan ready`

**验收点**：
- ✅ Approval Gate 出现在 output-panel 内
- ✅ Gate 显示 reason / riskLevel / toolName / payloadPreview
- ✅ Approve 后 Gate 消失，进入 Done 状态
- ✅ Reject 路径不走 error

---

## Demo 3: Approval Required / Reject Safe Path

**目标**：展示审批拒绝的安全路径（reject 不走 error，而是安全说明 + run_completed）。

**步骤**：

1. 重复 Demo 2 的步骤 1–3（填写 brief，Generate，等待 Approval Gate 出现）
2. 点击 **Reject** 按钮：
   - 两按钮变为 disabled，显示 `Rejecting…` + spinner
   - 等待 `approval_resolved`（rejected）SSE 事件
   - Gate 消失
   - 收到安全说明 `text_delta`（如 `[Run stopped]` 或类似安全消息）
   - 收到 `run_completed`，Signal 变为 `Plan ready`
   - **不显示 Error Banner**

**验收点**：
- ✅ Reject 后 Gate 消失
- ✅ 收到安全说明 text_delta
- ✅ 进入 Done 状态（不是 Error 状态）
- ✅ Error Banner 不显示
- ✅ 保留已有 output

---

## Demo 4: Run Ledger After Completion

**目标**：展示 Run Review Ledger 的只读审计能力。

**步骤**：

1. 完成一个正常的 run（Demo 1 或 Demo 2）
2. 在右侧 output-panel 中找到 **RUN REVIEW LEDGER**（`<details>` 元素，自动展开）
3. 观察 Ledger 内容：

   **Timeline（事件时间线）**：
   - 每条条目含序号（`01`、`02`…）+ 类型标签 + 详情 + 时间戳
   - `run_started` → `Run started`（steel 色）
   - `tool_progress` → `called/completed {toolName}`（mint 色）
   - `text_delta`（连续聚合）→ `Model text stream` + `{N} deltas, {M} chars`（cyan 色）
   - `run_completed` → `Run completed`（mint 色）

   **Approval Review（审批摘要，如有）**：
   - approvalId（等宽字体）
   - riskLevel chip（low=mint / medium=amber / high=red）
   - toolName（等宽字体）
   - decision（approved=mint / rejected=red / pending=amber）

   **Final Summary（运行总结）**：
   - Total events / Tool calls / Text deltas / Approval / Final state（Done）

4. 点击 summary 行折叠/展开 Ledger：
   - 折叠后指示器显示 `▸`
   - 展开后指示器显示 `▾`
   - 折叠后不会因 re-render 重新展开

**验收点**：
- ✅ Ledger 从 events[] 派生，无独立 state
- ✅ text_delta 连续聚合为单条
- ✅ Final Summary 显示正确计数
- ✅ 折叠/展开正常工作
- ✅ Ledger 只读，不发起新请求

---

## Demo 5: Local History List / Detail / Export / Clear

**目标**：展示 localStorage 运行历史的完整生命周期。

### 5.1 历史列表

1. 完成至少一次 run（Demo 1）
2. 在 `.grid` 下方找到 **RUN HISTORY** 面板（`<details>` 元素）
3. 展开 panel：
   - 显示 `RUN HISTORY — {N} records`
   - 每行显示：序号（`#1`）+ 日期时间 + `completed` status chip + tool/text 计数 + approval decision（如有）
   - 最新的 run 在最上方

### 5.2 历史详情

1. 点击历史列表中的某一行
2. output-panel 切换为只读 detail view：
   - 顶部 amber banner：`HISTORY REVIEW — READ ONLY` + 日期时间
   - Approval Review 摘要（如历史条目含 approval）
   - Run Review Ledger（只读，从 PersistedRunEvent[] 派生）
   - 完整 output markdown（只读 `<pre>`）
   - **Back to current run** 按钮
   - **Export markdown** 按钮

3. 点击 **Back to current run**：
   - 恢复实时视图（live output 或 empty state）

### 5.3 导出 Markdown

1. 在历史详情视图中点击 **Export markdown**
2. 浏览器下载 `launch-plan-{completedAt date}.md` 文件
3. 文件内容为 `# Launch Plan\n\n{history output}`

### 5.4 清除历史

1. 在 RUN HISTORY 面板的 summary 行找到 **Clear local history** 按钮（red 描边）
2. 点击按钮
3. 浏览器弹出确认对话框：`This will clear all saved run records from your browser. Continue?`
4. 点击 **OK**
5. 历史列表显示空状态：`No saved runs. Completed runs will appear here.`
6. `Clear local history` 按钮消失

**验收点**：
- ✅ 历史列表从 localStorage 加载
- ✅ 详情视图只读，不重新发送 SSE
- ✅ Back to current run 恢复实时视图
- ✅ Export 使用历史 output
- ✅ Clear 使用 window.confirm，只删除 launchdesk:run_history
- ✅ payloadPreview 不被持久化

---

## Demo 6: No Future Features Present

**目标**：确认 Future 项确实未实现。

**检查清单**：

1. **Cancel / Stop Run**：
   - 运行中查看 UI — 无 Cancel 或 Stop 按钮
   - Generate plan 按钮在运行中为 disabled，无法中断

2. **run_cancelled event**：
   - 检查 SSE 事件流 — 无 `run_cancelled` 事件类型
   - 在控制台验证：`grep -rn "run_cancelled" src/client/` = 0 匹配

3. **Retry button**：
   - error 状态后查看 UI — 无 Retry 按钮
   - Error Banner 只显示消息和 `Edit your input and try again.` 提示

4. **recoverable error field**：
   - 检查 error 事件 payload — 无 `recoverable` 字段
   - 在控制台验证：`grep -rn "recoverable" src/client/` = 0 匹配

5. **backend persistence / database**：
   - 历史记录仅在浏览器 localStorage，不发送到后端
   - 无 `/api/history` 或类似 endpoint
   - 无数据库连接

6. **IndexedDB**：
   - 在控制台验证：`grep -rn "IndexedDB\|indexedDB" src/client/` = 0 匹配

7. **cross-device sync**：
   - 无同步功能，历史记录仅在本浏览器

8. **rerun from history**：
   - 历史详情视图无 "Rerun" 或 "Re-execute" 按钮
   - 历史详情只读，不发起 fetch 或 SSE

**验收点**：
- ✅ 无 Cancel / Stop Run 按钮
- ✅ 无 run_cancelled 事件
- ✅ 无 Retry 按钮
- ✅ 无 recoverable 字段
- ✅ 无后端持久化
- ✅ 无 IndexedDB
- ✅ 无 cross-device sync
- ✅ 无 rerun from history
