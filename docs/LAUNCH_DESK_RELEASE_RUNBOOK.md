# Launch Desk Release Runbook

> **Phase 5 — Release Operations Pack**
>
> 本文档为 Launch Desk 的发布运维手册。任何接手者可通过本文档启动项目、确认封版状态、运行验收、并从归档恢复 sealed baseline。

---

## 1. 环境要求

| 项目 | 要求 |
|------|------|
| Node.js | ≥ 18（需支持 `ReadableStream`、`TextDecoder`、ESM） |
| npm | ≥ 9 |
| 浏览器 | Chrome / Edge / Firefox 最新版（需支持 `localStorage`、`<details>`、`fetch` streaming） |
| 操作系统 | macOS / Linux / Windows（Git Bash 推荐） |
| API Key | 至少一个 provider key（`DEEPSEEK_API_KEY`、`ARK_API_KEY`、`OPENROUTER_API_KEY`、`LONGCAT_API_KEY`）或 `OPENAI_API_KEY` |

> **注意**：本项目不可以在没有额度的情况下调用付费 API。如果没有额度，请提醒用户。请勿使用 `https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks` 或 `https://ark.cn-beijing.volces.com/api/v3/images/generations`，接入会产生额外费用。

---

## 2. 安装 / 启动 / 测试命令

### 2.1 安装依赖

```bash
npm install
```

> 不新增任何 npm 依赖。`package.json` 的 `dependencies` 和 `devDependencies` 在 Phase 1B–4 期间未变更。

### 2.2 配置环境变量

```bash
cp .env.example .env.local
```

编辑 `.env.local`：

```bash
# 至少配置一个 provider key
DEEPSEEK_API_KEY=sk-your-key
# 或
ARK_API_KEY=your-ark-key
# 或
OPENAI_API_KEY=sk-proj-your-key

# 可选：模型选择
LAUNCH_DESK_MODEL=deepseek-v4-flash

# 可选：端口
PORT=8787
```

> `.env` 和 `.env.local` 已在 `.gitignore` 中排除。API key 仅从 `process.env` 读取，不硬编码，不记录日志。

### 2.3 启动开发服务器

**终端 1 — API 服务器：**

```bash
npm run dev:server
```

服务器默认监听 `http://127.0.0.1:8787`。

**终端 2 — 前端开发服务器：**

```bash
npm run dev:web
```

前端默认监听 `http://127.0.0.1:5173`。

打开浏览器访问 `http://127.0.0.1:5173`。

### 2.4 验证 SSE 流

```bash
npm run verify:stream
```

该脚本向 `http://127.0.0.1:8787/api/launch-plan` 发送一个示例 brief，并验证流中至少包含一个 `tool_progress` 事件和一个 `text_delta` 事件。

### 2.5 运行完整测试套件

```bash
npm run typecheck   # TypeScript 类型检查
npm run test        # 33 文件 / 373 测试
npm run build       # 生产构建
npm run lint        # tsc --noEmit
npm run verify:secrets  # 密钥扫描
```

---

## 3. 如何确认当前 tag / commit

```bash
# 查看当前分支
git branch --show-current
# 应输出: master

# 查看最近提交
git log --oneline -5
# 应看到:
#   94279c44 chore: gitignore archive bundle and zip artifacts
#   19ccfcee merge: seal launch desk phases 1B-4 baseline
#   d399ccd7 feat: add launch desk phases 1B-4 (interaction, approval, ledger, history)
#   a423592d feat: add p17 visual brand assets (favicon + og banner via seedream 5.0)

# 查看封版 tag
git tag --list
# 应包含: launch-desk-phase-1b-4-sealed

# 查看 tag 指向的 commit
git rev-list -n 1 launch-desk-phase-1b-4-sealed
# 应输出: 19ccfcee...（merge commit）

# 查看 tag 详情
git show launch-desk-phase-1b-4-sealed --no-patch
```

---

## 4. 如何从 bundle 恢复

Git bundle 包含完整的仓库历史，可以通过 `git clone` 恢复：

```bash
# 从 bundle 克隆一个新仓库
git clone launch-desk-phase-1b-4-sealed.bundle launch-desk-restored

# 进入恢复的仓库
cd launch-desk-restored

# 验证恢复
git log --oneline -5
git tag --list
```

Bundle 包含：
- 完整的 master 分支历史
- 所有提交记录
- `launch-desk-phase-1b-4-sealed` tag

Bundle 不包含：
- `node_modules/`（需重新 `npm install`）
- `.env.local`（需重新配置）
- `skills/ECC` 子模块内容（需单独初始化）

验证 bundle 完整性：

```bash
git bundle verify launch-desk-phase-1b-4-sealed.bundle
# 应输出: "is okay" + "records a complete history"
```

---

## 5. 如何从 zip 使用

Zip 归档是 master 分支的工作树快照（不含 `.git` 历史），适合快速查看代码：

```bash
# 解压
unzip launch-desk-phase-1b-4-sealed.zip -d launch-desk-snapshot

# 进入快照目录
cd launch-desk-snapshot

# 安装依赖
npm install

# 配置环境
cp .env.example .env.local
# 编辑 .env.local

# 启动
npm run dev:server  # 终端 1
npm run dev:web      # 终端 2
```

> **注意**：zip 快照没有 git 历史，无法用 `git log` 查看提交记录。如需完整历史，请使用 bundle。

---

## 6. 如何确认 secrets scan 为 0

```bash
npm run verify:secrets
```

预期输出：

```
✓ scan-secrets: no findings
summary: 0 CRITICAL, 0 HIGH, 0 MEDIUM
```

如果有发现：
- **CRITICAL/HIGH**：必须修复，不可发布。
- **MEDIUM**：检查是否为误报（如 CSS 注释中的 `=` 字符串、文档中的示例文本）。

密钥扫描覆盖所有 Git 跟踪文件。`.gitignore` 中的文件（`node_modules/`、`.env*`、`dist/`、`*.bundle`、`*.zip`）默认不扫描。

---

## 7. 如何确认 localStorage key

Launch Desk 使用唯一的 localStorage key 存储运行历史。

### 7.1 在浏览器中检查

1. 打开浏览器开发者工具（F12）
2. 切换到 **Application** 标签
3. 左侧选择 **Local Storage** → `http://127.0.0.1:5173`
4. 查找 key: `launchdesk:run_history`

### 7.2 在控制台中检查

```javascript
// 查看历史记录数量
const history = JSON.parse(localStorage.getItem("launchdesk:run_history") || "[]");
console.log(`Records: ${history.length}`);

// 查看第一条记录的 schemaVersion
if (history.length > 0) {
  console.log(`schemaVersion: ${history[0].schemaVersion}`);
  console.log(`runId: ${history[0].runId}`);
  console.log(`events type: ${Array.isArray(history[0].events) ? "array" : "unknown"}`);
  // 确认 events 中没有 payloadPreview
  const hasPayloadPreview = history[0].events.some(e => "payloadPreview" in e);
  console.log(`payloadPreview present: ${hasPayloadPreview}`);  // 应为 false
}
```

### 7.3 确认 key 名称

- ✅ 正确：`launchdesk:run_history`
- ❌ 不存在其他 Launch Desk 相关的 localStorage key
- `__launchdesk_test__` 是可用性探测，会被立即删除，不会持久化

---

## 8. 如何清理浏览器历史数据

### 8.1 通过 UI 清理

1. 在 Run History 面板中点击 **Clear local history** 按钮
2. 浏览器弹出确认对话框：`This will clear all saved run records from your browser. Continue?`
3. 点击 **OK** 确认
4. `launchdesk:run_history` key 被删除，历史列表显示空状态

### 8.2 通过控制台清理

```javascript
// 只删除 Launch Desk 历史记录（不影响其他 localStorage key）
localStorage.removeItem("launchdesk:run_history");

// 验证删除
console.log(localStorage.getItem("launchdesk:run_history"));  // 应输出 null
```

> **注意**：`clearRunHistory()` 只删除 `launchdesk:run_history`，不调用 `localStorage.clear()`，不影响其他 key。

### 8.3 通过浏览器清理

浏览器设置 → 清除浏览数据 → Cookie 和站点数据 → 清除。

> 这会清除所有 localStorage，包括其他网站的数据。

---

## 9. 验证命令速查

| 命令 | 用途 | 预期结果 |
|------|------|---------|
| `npm run typecheck` | TypeScript 类型检查 | exit 0 |
| `npm run test` | 完整测试套件 | 33 files / 373 tests passed |
| `npm run build` | 生产构建 | exit 0, dist/client/ 生成 |
| `npm run lint` | 代码检查 (tsc --noEmit) | exit 0 |
| `npm run verify:secrets` | 密钥扫描 | 0 CRITICAL, 0 HIGH, 0 MEDIUM |
| `npm run verify:stream` | SSE 流验证 | 至少 1 tool_progress + 1 text_delta |
| `npm run verify:env` | 环境变量检查 | .env.example 无真实 key |
| `npm run verify:all` | env + secrets + intelligence | 全部通过 |

---

## 10. 封版基线信息

| 项目 | 值 |
|------|-----|
| master HEAD | `94279c44` |
| sealed tag | `launch-desk-phase-1b-4-sealed` → `19ccfcee` |
| feature branch | `feat/launch-desk-phases-1b-through-4` → `d399ccd7` (保留) |
| merge 方式 | `--no-ff` |
| 文件变更 | 16 files, +6146 / -155 |
| 测试 | 33 files / 373 tests |
| secrets | 0 findings |
| 归档 | `.bundle` (~40MB) + `.zip` (~43MB), gitignored |

---

## 11. 已封版阶段

| 阶段 | 功能 | 状态 |
|------|------|------|
| Phase 1B | Interaction Enhancements + UI Copy | ✅ SEALED |
| Phase 2 | Approval Governance Backend + Frontend Gate | ✅ SEALED |
| Phase 3 | Run Review Ledger + Operator Audit View | ✅ SEALED |
| Phase 3.5 | Demo Readiness + Browser QA Hardening | ✅ SEALED |
| Phase 4 | Run Persistence Contract / Local Run History | ✅ SEALED |

---

## 12. Future 项（明确未实现）

以下项在 Phase 1B–4 中**未实现**，保持 Future 状态：

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
