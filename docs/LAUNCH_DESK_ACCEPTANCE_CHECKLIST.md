# Launch Desk Acceptance Checklist

> **Phase 5 — Release Operations Pack**
>
> 本文档是 Launch Desk 发布前的验收清单。所有项目必须在发布前逐项确认。

---

## 1. SSE 事件契约（7 个，冻结）

| # | 事件 | 验收点 | 验证方法 |
|---|------|--------|----------|
| 1 | `run_started` | 含 model / traceLabel | DevTools Network → SSE 流查看 |
| 2 | `tool_progress` | 含 name / status (called/completed) | 同上 |
| 3 | `text_delta` | 含 delta 字符串 | 同上 |
| 4 | `approval_required` | 含 approvalId / title / reason / riskLevel / toolName / payloadPreview / timestamp | 同上 |
| 5 | `approval_resolved` | 含 approvalId / decision (approved/rejected) | 同上 |
| 6 | `error` | 含 message | 同上 |
| 7 | `run_completed` | 触发 Signal = `Plan ready` | 同上 |

**冻结确认**：
- ✅ 未新增 SSE 事件类型
- ✅ 未删除 SSE 事件类型
- ✅ 未改变 7 个事件的语义
- ✅ 验证命令：
  ```bash
  grep -rn "type === \"" src/client/main.tsx | grep -v "node_modules" | sort -u
  ```
  应只出现 7 种事件类型。

---

## 2. 审批契约（frozen）

| # | 验收点 | 状态 |
|---|--------|------|
| 1 | Approval Gate 出现在 output-panel 内（不替换 output） | ☐ |
| 2 | Gate 显示 reason / riskLevel / toolName / payloadPreview | ☐ |
| 3 | Reject 路径不走 error，而是安全说明 + run_completed | ☐ |
| 4 | Approve 路径发送 `approval_resolved` (approved) + run_completed | ☐ |
| 5 | Gate 按钮在 approve/reject 期间 disabled | ☐ |
| 6 | 未新增 approval state（仍由 events[] 派生） | ☐ |

---

## 3. Run Review Ledger（只读审计）

| # | 验收点 | 状态 |
|---|--------|------|
| 1 | Ledger 从 events[] 派生，无独立 state | ☐ |
| 2 | Ledger 在 run_completed 后自动展开 | ☐ |
| 3 | Ledger 可折叠并保持折叠状态（不因 re-render 重展开） | ☐ |
| 4 | text_delta 连续聚合成单条 | ☐ |
| 5 | Ledger 含 Approval Review 摘要（如有 approval 事件） | ☐ |
| 6 | Ledger 含 Final Summary（Total events / Tool calls / Text deltas / Approval / Final state） | ☐ |
| 7 | Ledger 只读，不发起新请求 | ☐ |

---

## 4. 本地运行历史（localStorage-only）

| # | 验收点 | 状态 |
|---|--------|------|
| 1 | localStorage key = `launchdesk:run_history` | ☐ |
| 2 | 仅 run_completed 的 run 被保存（error/in-progress 不保存） | ☐ |
| 3 | 最大 50 条，FIFO（最旧被截断） | ☐ |
| 4 | schemaVersion = 1（不匹配的记录被跳过） | ☐ |
| 5 | 历史列表从 localStorage 加载（mount 时） | ☐ |
| 6 | 历史详情视图只读，不重新发送 SSE / fetch | ☐ |
| 7 | Back to current run 按钮恢复实时视图 | ☐ |
| 8 | Export markdown 下载 `launch-plan-{date}.md` | ☐ |
| 9 | Clear local history 使用 window.confirm 二次确认 | ☐ |
| 10 | Clear 只删除 `launchdesk:run_history`，不删除其他 key | ☐ |
| 11 | localStorage 不可用时（隐私模式）无报错，功能降级为只读 | ☐ |
| 12 | JSON 损坏时整条清除，单条损坏时过滤保留有效记录 | ☐ |
| 13 | QuotaExceededError 自动截断重试，仍失败则静默跳过 | ☐ |
| 14 | 无后端持久化（无 `/api/history` endpoint） | ☐ |
| 15 | 无 IndexedDB | ☐ |
| 16 | 无 cross-device sync | ☐ |
| 17 | 无 rerun from history（详情视图无 Rerun 按钮） | ☐ |

---

## 5. 数据脱敏

| # | 验收点 | 验证方法 | 状态 |
|---|--------|----------|------|
| 1 | `payloadPreview` 不被持久化 | `grep -rn "payloadPreview" src/client/runHistoryStore.ts` = 0 匹配 | ☐ |
| 2 | header/token/auth/apiKey/secret/credential 字段不被持久化 | `SENSITIVE_FIELD_PATTERN` 在 sanitize 中应用 | ☐ |
| 3 | 持久化事件为 PersistedRunEvent[]（白名单字段） | 检查 sanitize 函数构造新对象 | ☐ |
| 4 | Defensive sweep 删除任何匹配敏感模式的 key | 检查 sanitize 末尾循环 | ☐ |

---

## 6. Future 项确认（必须未实现）

| # | Future 项 | 验证方法 | 状态 |
|---|-----------|----------|------|
| 1 | 无 Cancel / Stop Run 按钮 | UI 检查 + `grep -rn "cancel\|stop.*run\|StopRun" src/client/main.tsx -i` = 0 匹配 | ☐ |
| 2 | 无 `run_cancelled` 事件 | `grep -rn "run_cancelled" src/` = 0 匹配 | ☐ |
| 3 | 无 Retry 按钮 | UI 检查 + `grep -rn "retry\|Retry" src/client/main.tsx` = 0 匹配 | ☐ |
| 4 | 无 `recoverable` 字段 | `grep -rn "recoverable" src/` = 0 匹配 | ☐ |
| 5 | 无数据库连接 | `grep -rn "database\|sqlite\|postgres\|mysql\|mongo" src/ -i` = 0 匹配 | ☐ |
| 6 | 无外部服务 | `grep -rn "fetch.*http" src/client/runHistoryStore.ts` = 0 匹配 | ☐ |
| 7 | 无新 npm 依赖 | `git diff master -- package.json` 只显示 test script 改动 | ☐ |
| 8 | 无后端 endpoint 新增 | `git diff master -- src/server/` 无 endpoint 改动 | ☐ |
| 9 | 无鉴权系统 | `grep -rn "login\|password\|session\|jwt\|cookie" src/client -i` = 0 匹配 | ☐ |
| 10 | 无 IndexedDB | `grep -rn "IndexedDB\|indexedDB" src/` = 0 匹配 | ☐ |

---

## 7. 测试与代码质量

| # | 验收点 | 验证命令 | 状态 |
|---|--------|----------|------|
| 1 | 全部测试通过 | `npm test` | ☐ |
| 2 | 测试数量 ≥ 373 | 测试输出末尾统计 | ☐ |
| 3 | TypeScript 编译无错误 | `npm run typecheck` | ☐ |
| 4 | Secrets 扫描 0 命中 | `npm run verify:secrets` | ☐ |
| 5 | Pre-commit hook 正常运行 | 尝试 commit，确认 hook 触发 | ☐ |

---

## 8. UI / 交互

| # | 验收点 | 状态 |
|---|--------|------|
| 1 | Generate plan 按钮在运行中 disabled + 显示 spinner | ☐ |
| 2 | snapshot hint 在运行中显示 | ☐ |
| 3 | Event Rail 显示最近 8 个事件 | ☐ |
| 4 | Signal 显示正确状态：Idle / Streaming / Plan ready / Error | ☐ |
| 5 | 暗色工程控制台风格（#0d1110 背景，border-radius:0） | ☐ |
| 6 | 移动端响应式（≤980px / ≤620px） | ☐ |
| 7 | Copy result / Export markdown 按钮在 run_completed 后出现 | ☐ |
| 8 | Error Banner 显示错误消息 + 重试提示文字 | ☐ |
| 9 | prefers-reduced-motion 媒体查询覆盖 | ☐ |

---

## 9. 封存基线

| # | 验收点 | 验证命令 | 状态 |
|---|--------|----------|------|
| 1 | master 分支干净 | `git status` working tree clean | ☐ |
| 2 | Annotated tag 存在 | `git tag -l` 查看 `launch-desk-phase-1b-4-sealed` | ☐ |
| 3 | Tag 指向 master HEAD | `git rev-parse launch-desk-phase-1b-4-sealed` = `git rev-parse master` | ☐ |
| 4 | Bundle 归档存在 | `ls *.bundle` | ☐ |
| 5 | Zip 归档存在 | `ls *.zip` | ☐ |
| 6 | .gitignore 排除 `*.bundle` 和 `*.zip` | `grep -E "\.bundle|\.zip" .gitignore` | ☐ |

---

## 验收总结

```
SSE 契约:        [PASS / FAIL]  (7/7)
审批契约:        [PASS / FAIL]  (6/6)
Ledger 审计:     [PASS / FAIL]  (7/7)
本地历史:        [PASS / FAIL]  (17/17)
数据脱敏:        [PASS / FAIL]  (4/4)
Future 项确认:   [PASS / FAIL]  (10/10)
测试与质量:      [PASS / FAIL]  (5/5)
UI / 交互:       [PASS / FAIL]  (9/9)
封存基线:        [PASS / FAIL]  (6/6)
────────────────────────────────────
总计:            [XX/71]
```

**发布门槛**：所有 71 项必须全部 PASS。任一 FAIL → 阻断发布，转入 REVISE。
