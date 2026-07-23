# v3 Security & Credential Management Policy

> **版本**：v1.0 | **日期**：2026-07-02
> **目的**：v3 项目的凭据管理、敏感信息防护、风险评估 SOP
> **背景**：本会话发生 pipeworx API key 泄露事件，作为 SOP 起点

---

## 一、绝不能再发生的事

### 1.1 红线清单（5 条）

```
🚫 禁止在 AI 聊天、截图、commit message、公开文档粘贴：
   - 任何形如 pwx_xxx / sk-xxx / AKIAxxx / ghp_xxx / xox*-xxx 的字符串
   - 包含完整 32 位 hex / 64 位 base64 / sk_live_ / sk_test_ 的字符串
   - 个人邮箱、电话、SSN 等 PII

🚫 禁止用 URL query string 携带 API key（如 ?pwx=xxx）
   - URL 会被 CDN、浏览器历史、聊天同步、屏幕截图、日志
   - 这是本会话 pipeworx 事件的核心错误

🚫 禁止在 .env 之外的任何文件写真实 key
   - 只能写 ${ENV_VAR} 占位符
   - .env / .env.local / .env.production 都不入 git

🚫 禁止在 commit message 写真实 endpoint URL + key
   - 即便是测试 endpoint + 假 key 也不允许（污染搜索）
   - 只写真实 endpoint + 占位 key

🚫 禁止承认"这个 key 是假的"或"不会用"
   - Claude 的安全策略是"一视同仁"
   - 任何疑似 key 都按真 key 处理
```

### 1.2 当你不小心泄露时的 30 秒 SOP

```
Step 1: 立刻去该服务后台撤销 key (Revoke)
Step 2: 检查 usage log 看是否被滥用
Step 3: 检查 .git 目录是否被污染
        grep -r "已泄露 key" .
        git log --all -S "已泄露 key"
Step 4: 如果 git 污染, 用 git filter-branch 或 BFG 清
Step 5: 写事故报告 docs/INCIDENTS/2026-07-02-pwx-leak.md
Step 6: 启动新 key 流程：1Password / Vault + IP 白名单 + 7 天过期
```

---

## 二、v3 凭据管理体系

### 2.1 三档存储（按敏感度）

| 敏感度 | 内容 | 存储位置 | git | 轮换 |
|---|---|---|---|---|
| **L0 公开** | world-bank / OECD / Eurostat / BLS 等无 key | 直接 hardcode | ✅ 可入 | N/A |
| **L1 凭据** | UN Comtrade / FRED / Census / OS Hub | `.env.local` | ❌ 永不入 | 90 天 |
| **L2 商业** | Shopee / Temu / 1688 / 客户 API | `.env.local` + IP 白名单 | ❌ 永不入 | 30 天 |
| **L3 核心** | 客户数据、合同金额、生产成本 | Bitwarden / 1Password + 加密卷 | ❌ 永不入 | 7 天 |

### 2.2 物理 SOP

```
启动新数据源:
  1. Owner 在 1Password 创建 entry (URL + key + 注册邮箱)
  2. v3 fetch adapter 用 import.meta.env 读取
  3. .env.local 写 ENV_VAR=value (不入 git)
  4. .env.example 写 ENV_VAR= 占位 (可入 git)
  5. package.json 启动时检查: 缺 key 立即 .throw()，不静默

日常使用:
  1. 不粘贴 key 到任何 AI 聊天
  2. 截图/录屏前先遮盖
  3. 不在公共 WiFi 调用 L2+ 服务
  4. 不在 U 盘 / 共享盘放 .env.local
```

### 2.3 .env.example 模板（必须可入 git）

```bash
# === v3 .env.example 模板（不含真值）===

# L1 凭据（必填）
UN_COMTRADE_API_KEY=
FRED_API_KEY=
CENSUS_API_KEY=
OPEN_SUPPLY_HUB_API_KEY=

# L2 商业（按需）
SHOPEE_API_KEY=
TEMU_API_KEY=
ALI_1688_API_KEY=

# 通知
FEISHU_WEBHOOK_URL=
SERVER_CHAN_KEY=

# 监控
LOG_LEVEL=info
SENTRY_DSN=
```

### 2.4 package.json 启动检查

```json
{
  "scripts": {
    "preverify": "node scripts/check-env.ts",
    "verify": "tsx scripts/verify-intelligence-sources.ts"
  }
}
```

```typescript
// scripts/check-env.ts (落地到 v3)
const REQUIRED_L1 = ['UN_COMTRADE_API_KEY', 'FRED_API_KEY', 'CENSUS_API_KEY', 'OPEN_SUPPLY_HUB_API_KEY']
for (const k of REQUIRED_L1) {
  if (!process.env[k] || process.env[k].length < 16) {
    console.error(`❌ Missing or invalid: ${k}`)
    process.exit(1)
  }
}
console.log('✅ All L1 credentials present')
```

---

## 三、v3 数据源风险评估（10 个 L1+ 数据源）

| 数据源 | tier | key 状态 | 泄露影响 | v3 状态 |
|---|---|---|---|---|
| UN Comtrade | S | 个人免费 | 低（恢复易）| ✅ 草稿已写 |
| FRED API | S | 个人免费 | 低 | ⏳ 待申请 |
| U.S. Census | S | 政府申请 | 中（审批慢）| ⏳ 待申请 |
| Open Supply Hub | A | 申请制 | 中 | ⏳ 被拒（需替代）|
| EDINET 日本 | S | 申请制 | 中 | ⏳ |
| e-Stat 日本 | S | appId | 中 | ⏳ |
| USITC DataWeb | S | 账号 | 中 | ⏳ |
| Shopee Open Platform | A+ | 商家授权 | **高**（业务数据）| 🔒 暂不接 |
| Temu Partner API | A+ | 商家授权 | **高** | 🔒 暂不接 |
| Alibaba Open Platform | A+ | 商家授权 | **高** | 🔒 暂不接 |
| McKinsey BoF | B | 付费 | 中 | 🔒 暂不接 |

**结论**：v3 短期内只用 4 个 L1 数据源（Comtrade/FRED/Census/OS Hub），全部 S/A 级，业务数据风险=0。

---

## 四、pipeworx-io 风险评估（最终版）

### 4.1 真实风险

| 维度 | 评级 | 原因 |
|---|---|---|
| 公司主体匿名 | 🔴 高 | 无公司名 / 创始人 / 注册地披露 |
| 安全认证 | 🔴 高 | 无 SOC2 / ISO 27001 / VDP |
| /status 计数器失效 | 🔴 高 | "tracked sources" 和 "healthy last 24h" 显示 "—" |
| 数据外泄 | 🔴 高 | 所有请求经 Cloudflare Workers 中转 |
| 关键事件：公司主体变更无法追踪 | 🔴 高 | 无注册地 = 无管辖 |
| API key 通过 URL 暴露 | 🔴 中 | 文档示例本身就是"好实践"，诱导用户 |

### 4.2 v3 决策

```
结论: 不接 pipeworx 作为生产数据源
原因:
  1. 治理盲点（公司主体匿名 + 无安全认证）
  2. 数据外泄链（所有请求经第三方）
  3. 商业模式不可持续（1.7M requests/月没有企业客户背书）
  4. 设计诱导危险用法（key 在 URL）

替代:
  - L0 公开数据 → 直连 BIS API (stats.bis.org)
  - L1 凭据 → 自建 adapter (src/intelligence/adapters/bis.ts)
  - 任何 pipeworx 的元工具设计灵感 → 借鉴到 v3 Orchestrator
```

### 4.3 借鉴的 7 个元工具设计

| pipeworx 元工具 | v3 Orchestrator 对应 |
|---|---|
| `ask_pipeworx({ question })` | `Orchestrator.runNaturalLanguage(question)` |
| `discover_tools({ domain })` | `L1.discover({ query })` skill 发现 |
| `resolve_entity({ name })` | `Orchestrator.resolveNode({ nodeId })` |
| `compare_entities({ a, b })` | `Reasoner.compare({ evidence_a, evidence_b })` |
| `entity_profile({ id })` | `Orchestrator.profile({ nodeId, days })` |
| `recent_changes({ id, days })` | `Ledger.changes({ nodeId, days })` |
| `remember/recall/forget` | `arkMemory.{store, retrieve, delete}` |

**借鉴点**：API 命名 + 参数设计 + 引用 URI 模式 (`pipeworx://`) → v3 Orchestrator 用 `mcp://` URI + 同 7 个动词。

---

## 五、v3 内部事故记录模板

```markdown
# 事故报告：YYYY-MM-DD-<short-name>

## 时间
YYYY-MM-DD HH:MM UTC

## 类型
[ ] 凭据泄露
[ ] 数据外泄
[ ] 模型偏差
[ ] 系统故障
[ ] 其他

## 影响
- 范围: [L0/L1/L2/L3]
- 暴露数据: [...]
- 受影响用户: [...]

## 根因
...

## 立即行动
1. [完成]
2. [完成]

## 长期修复
- [ ] 加入 SOP
- [ ] 加入自动检测
- [ ] 培训 Owner

## Owner 签字
```

---

## 六、给 v3 Owner 的 5 个安全建议

1. **立刻**：用 1Password / Bitwarden 替换脑记 key 的工作流
2. **本周**：建 `docs/INCIDENTS/` 目录，把本会话的 key 泄露事件写成首份事故报告
3. **本月**：在 CI 加 secret scanning（gitleaks 或 TruffleHog）
4. **本季度**：把 v3 现有 23 源的"key 申请/轮换/SOP"全部文档化
5. **未来**：v3 L2+ 业务数据（Shopee/Temu）**永不接**（仅在客户主动提供本地部署环境时考虑）

---

## 七、检测脚本（v3 落地）

```typescript
// scripts/scan-secrets.ts
// 在 commit 前自动跑
const FORBIDDEN = [
  { pattern: /sk_live_[A-Za-z0-9]{20,}/, label: 'Stripe live key' },
  { pattern: /pwx_[a-f0-9]{30,}/i, label: 'Pipeworx key' },
  { pattern: /AKIA[0-9A-Z]{16}/, label: 'AWS access key' },
  { pattern: /ghp_[A-Za-z0-9]{30,}/, label: 'GitHub PAT' },
  { pattern: /sk-[A-Za-z0-9]{20,}/, label: 'OpenAI API key' },
  { pattern: /xox[baprs]-[A-Za-z0-9-]{10,}/, label: 'Slack token' },
]
// git diff + 全部 .ts/.json/.md 都跑这个
```

---

**版本 v1.0 · 2026-07-02 · 包含 pipeworx key 泄露事件 + 5 条红线 + 完整 SOP**