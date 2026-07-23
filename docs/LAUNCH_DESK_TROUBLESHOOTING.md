# Launch Desk Troubleshooting

> **Phase 5 — Release Operations Pack**
>
> 本文档涵盖 Launch Desk 常见问题的诊断与修复方法。

---

## 1. 开发服务器无法启动

### 1.1 `npm run dev:server` 失败

**症状**：终端报错 `Error: Cannot find module` 或端口已被占用。

**诊断**：

```bash
# 检查依赖是否安装
ls node_modules/ | head -5

# 检查端口占用（默认 8787）
netstat -ano | grep 8787
```

**修复**：

- 依赖缺失：`npm install`
- 端口占用：修改 `.env.local` 中的 `PORT`，或终止占用进程
  ```bash
  # Windows
  taskkill /PID <PID> /F
  # Unix
  kill -9 <PID>
  ```

### 1.2 `npm run dev:web` 失败

**症状**：Vite 启动失败或 5173 端口被占用。

**诊断**：

```bash
netstat -ano | grep 5173
```

**修复**：

- 终止占用进程或修改 `vite.config.ts` 中的 `server.port`
- 清除 Vite 缓存：`rm -rf node_modules/.vite`

### 1.3 启动后页面白屏

**症状**：浏览器打开 `http://127.0.0.1:5173` 后白屏。

**诊断**：

- 打开 DevTools Console 查看错误
- 常见原因：API 服务器未启动、CORS 错误、JS 模块加载失败

**修复**：

- 确认 `npm run dev:server` 已启动并监听 8787
- 检查 `.env.local` 中 `VITE_API_BASE` 是否指向正确地址
- 检查 Console 中是否有模块导入错误

---

## 2. 浏览器历史记录不显示

### 2.1 完成运行后 RUN HISTORY 面板为空

**症状**：完成一次 run 后，RUN HISTORY 面板显示 `No saved runs. Completed runs will appear here.`

**诊断**：

1. 确认 run 是否真的完成（Signal = `Plan ready`，非 Error）
2. 在 DevTools Console 执行：
   ```javascript
   localStorage.getItem("launchdesk:run_history");
   ```
3. 检查返回值：
   - `null` → 未保存（继续诊断）
   - `[]` → 已保存但为空
   - JSON 字符串 → 已保存，可能是渲染问题

**可能原因与修复**：

| 原因 | 修复 |
|------|------|
| run 处于 error 状态 | error run 不保存，这是预期行为 |
| run 仍在进行中 | 等待 run_completed |
| localStorage 被禁用（隐私模式） | 退出隐私模式或在浏览器设置中启用 localStorage |
| QuotaExceededError | 清理浏览器其他 localStorage 数据，腾出空间 |
| React state 未更新 | 刷新页面，mount effect 会重新加载历史 |

### 2.2 历史记录数量不对

**症状**：预期 50 条但只有几条，或超过 50 条。

**诊断**：

```javascript
const h = JSON.parse(localStorage.getItem("launchdesk:run_history") || "[]");
console.log("count:", h.length);
console.log("schemaVersions:", h.map(e => e.schemaVersion));
```

**修复**：

- 超过 50 条：不应发生（saveRunToHistory 强制截断）。若发生，检查 `runHistoryStore.ts` 的 `slice(0, RUN_HISTORY_MAX_ENTRIES)` 逻辑
- 少于预期：schemaVersion 不匹配的记录会被跳过。确认所有记录的 `schemaVersion === 1`

---

## 3. localStorage 损坏

### 3.1 历史记录显示异常或丢失

**症状**：刷新页面后历史记录消失，或 Console 报 JSON 解析错误。

**诊断**：

```javascript
const raw = localStorage.getItem("launchdesk:run_history");
console.log("raw:", raw);
try {
  JSON.parse(raw);
  console.log("JSON valid");
} catch (e) {
  console.log("JSON corrupt:", e.message);
}
```

**修复**：

- **根 JSON 损坏**：`loadRunHistory()` 会自动清除损坏的 key 并返回 `[]`。刷新页面即可恢复（历史会丢失，但应用正常工作）
- **单条记录损坏**：`loadRunHistory()` 会过滤掉损坏记录，保留有效记录。无需手动干预
- **手动清除**：
  ```javascript
  localStorage.removeItem("launchdesk:run_history");
  location.reload();
  ```

### 3.2 QuotaExceededError

**症状**：DevTools Console 出现 `QuotaExceededError: Failed to set 'launchdesk:run_history'`

**诊断**：

- 浏览器 localStorage 配额已满（通常 5–10MB）

**修复**：

- `saveRunToHistory()` 会自动截断到 10 条并重试一次
- 若仍失败，应用会静默跳过保存（当前 run 仍正常完成）
- 手动清理：清除其他网站的 localStorage，或点击 UI 中的 **Clear local history** 按钮

---

## 4. 审批门控不出现

### 4.1 运行完成但未显示 Approval Gate

**症状**：预期会触发审批，但 run 直接完成，无 Approval Gate。

**诊断**：

1. 确认 `approvalPolicy.enabled` 是否为 `true`
2. 检查 SSE 流中是否有 `approval_required` 事件：
   ```bash
   # 在 DevTools Network → SSE 流中查找
   ```
3. 检查 agent 配置是否启用了审批策略

**可能原因**：

| 原因 | 修复 |
|------|------|
| approvalPolicy 未启用 | 在配置中启用审批策略 |
| agent 未触发审批条件 | 调整 brief 或 agent 配置使审批条件满足 |
| approval_required 事件未发送 | 检查 `src/agent/streamLaunchPlan.ts` 的审批触发逻辑 |

### 4.2 Approval Gate 出现但按钮无响应

**症状**：点击 Approve / Reject 按钮后无反应。

**诊断**：

- 打开 DevTools Network 查看 `/api/runs/{runId}/approval` 请求
- 检查请求状态码和响应

**修复**：

- 400 错误：请求体格式错误，检查 payload
- 404 错误：runId 不存在或已过期
- 500 错误：服务器内部错误，查看服务器日志
- 网络错误：确认 API 服务器运行中

---

## 5. Export Markdown 不下载

### 5.1 点击 Export markdown 无反应

**症状**：点击 Export 按钮后浏览器未下载文件。

**诊断**：

1. 打开 DevTools Console 查看是否有错误
2. 检查浏览器是否拦截了下载（弹窗拦截器）
3. 确认 output 非空

**修复**：

- 允许浏览器下载（检查地址栏右侧的拦截提示）
- 手动触发下载（在 Console 中）：
  ```javascript
  const blob = new Blob(["# Launch Plan\n\ntest"], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "test.md";
  a.click();
  ```

### 5.2 下载的文件名不正确

**症状**：文件名包含无效字符或日期格式错误。

**诊断**：

- 检查 `completedAt` 是否为有效 ISO 8601 字符串
- 检查文件名生成逻辑（`exportHistoryMarkdown` 和 `handleExport`）

**修复**：

- 确保历史记录的 `completedAt` 字段有效
- 文件名格式应为 `launch-plan-YYYY-MM-DD.md`

---

## 6. verify:secrets 误报

### 6.1 Secrets 扫描报告假阳性

**症状**：`npm run verify:secrets` 报告 HIGH_ENTROPY 或疑似密钥，但实际是注释或普通字符串。

**诊断**：

```bash
npm run verify:secrets 2>&1 | tee /tmp/secrets.log
# 查看具体匹配的文件和行
```

**常见误报原因**：

| 原因 | 示例 | 修复 |
|------|------|------|
| 长装饰性 CSS 注释 | `/* === many equals signs === */` | 简化为 `/* ... */` |
| 测试用例中的 mock 字符串 | `"api_key_1234567890abcdef"` | 改为明显假的值如 `"test-key"` |
| 长变量名 | `SENSITIVE_FIELD_PATTERN` | 无法避免，添加到扫描白名单 |

**修复流程**：

1. 确认是误报（非真实密钥）
2. 修改触发误报的内容
3. 重新运行 `npm run verify:secrets` 确认 0 命中
4. 若无法修改，在 secrets 扫描配置中添加白名单（最后手段）

---

## 7. Skills / ECC 子模块显示为已修改

### 7.1 `git status` 显示 skills/ 或 ECC/ 已修改

**症状**：`git status` 显示 `skills/` 或 `ECC/` 目录有改动，但实际未手动修改。

**诊断**：

```bash
git status
git diff -- skills/ ECC/
```

**原因**：

- skills 和 ECC 是 git submodule
- 子模块的 HEAD 指针在不同环境间可能不一致

**修复**：

```bash
# 忽略子模块改动（不提交）
git submodule update --init --recursive

# 或在 .gitmodules 中配置 ignore = all
git config submodule.skills.ignore all
git config submodule.ECC.ignore all
```

**注意**：Phase 5 不处理 skills/ECC 子模块。若子模块状态异常，不影响 Launch Desk 主项目发布。

---

## 8. 测试失败

### 8.1 `npm test` 报错

**症状**：部分测试失败。

**诊断**：

```bash
npm test 2>&1 | tee /tmp/test.log
# 查看失败的测试名和错误堆栈
grep -A 20 "FAIL\|✗\|Error:" /tmp/test.log
```

**常见失败原因**：

| 原因 | 修复 |
|------|------|
| DOM 环境未正确初始化 | 确认测试文件顶部有 `// @vitest-environment jsdom` |
| `TextEncoder`/`TextDecoder` 未定义 | 在测试顶部添加 polyfill |
| `IS_REACT_ACT_ENVIRONMENT` 未设置 | 添加 `(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;` |
| `fetch` 未 mock | 使用 `vi.stubGlobal("fetch", mockFn)` |
| `URL.createObjectURL` 未 mock | 使用 `vi.stubGlobal("URL", { ... })` |
| 异步操作未等待 | 增加 `await new Promise(r => setTimeout(r, delay))` |

### 8.2 TypeScript 编译错误

**症状**：`npm run typecheck` 报类型错误。

**诊断**：

```bash
npm run typecheck 2>&1 | tee /tmp/tc.log
```

**修复**：

- 按错误信息逐个修复类型
- 确认所有导出类型正确（如 `export type { PersistedRunEvent }`）
- 确认 `@ts-expect-error` 只用于确实需要的地方（未使用会报错）

---

## 9. 联系与升级

若以上方法均无法解决问题：

1. 查看 `docs/LAUNCH_DESK_RELEASE_RUNBOOK.md` 获取完整运行命令
2. 查看 `docs/PHASE4_PRD.md` 获取 Phase 4 设计细节
3. 查看 `docs/FRONTEND_USAGE_INTERACTION_SPEC.md` 获取交互规范
4. 查看封存基线 tag `launch-desk-phase-1b-4-sealed` 的代码状态

**切勿**：
- 修改 SSE 事件契约（7 个事件冻结）
- 修改审批契约
- 新增 Cancel / Stop Run / Retry / run_cancelled / recoverable
- 新增 npm 依赖
- 接入数据库或外部服务
