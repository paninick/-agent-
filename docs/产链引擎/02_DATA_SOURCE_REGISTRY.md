## ⚠️ 安全规则 (4 个独立审查 critical issue 已确认)

**所有 API Key 不得出现在任何文档、报告、提交、聊天最终回复中**

### 规则
1. **写真实 Key = 不对**: 文档/报告/提交/聊天回复中只写真实 ENV 变量名
   - ✓ `UN_COMTRADE_KEY_1` (写真实 ENV 变量名)
   - ✗ 写真实 Key 字符串 (写真实 Key 会泄露给所有读者, 即使截图)
2. **真实 Key 的保存位置**: `.env.local` 文件, 不入 git, 不同步到云端
3. **Key 撤销/重置**: 每个供应商都有官方管理后台, 需要时手动轮换
4. **自动化检查**: 文档提交前 grep 32 位 hex / 64 位 base64 等 Key 模式

### Key 与 ENV 变量对应表

| 数据源 | ENV 变量名 | 实际 Key 存储位置 |
|---|---|---|
| UN Comtrade #1 | UN_COMTRADE_KEY_1 | .env.local |
| UN Comtrade #2 | UN_COMTRADE_KEY_2 | .env.local |
| FRED | FRED_API_KEY | .env.local |
| Massive.com | MASSIVE_API_KEY | .env.local |
| 方舟 ARK | ARK_API_KEY | .env.local |
| 其他 | <PROVIDER>_API_KEY | .env.local |

### 这条规则如何产生

4 个独立审查同时发现此 critical issue:
- Claude subagent CEO: "API keys are written directly in planning docs while the docs say keys must never be stored"
- Claude subagent Eng: "Comtrade, FRED, Massive keys appear in `00_INDEX.md`, `02_DATA_SOURCE_REGISTRY.md`, `10_PROBE_RESULTS.md`"
- Codex CEO: "Security discipline already failed. Evidence: API keys are written directly in planning docs"
- Codex Eng: "Severity: Critical. Fix: Rotate all keys, purge repo/history, add secret scanning"

用户决策 (2026-06-30): 暂时保留 Key 不轮换 (免费 Key, 撤销重建成本 > 收益), 但文档不再写真实 Key。

---

## ⚠️ ENV 变量名 + 数据源状态统一表（2026-07-01 校准）

**目的**：解决 §矛盾 #3 #4 的 ENV 变量名不一致 + 数据源状态打架问题。

**用法**：本表为唯一真源。任何 .env.example / README / 脚本 / 配置必须按本表取名。

### 数据源状态矩阵

| 数据源 | 真源 ENV 变量 | 文档 10_PROBE 实测 | 文档 RUNBOOK 实测 | 真实状态(以代码为准) |
|---|---|---|---|---|
| **UN Comtrade** | `UN_COMTRADE_API_KEY` | ✅ 已验证（写作 `UN_COMTRADE_KEY_1/2`）| ⚠️ skipped_auth_required | ⚠️ **adapter 已实现**（`fetchComtradeFlowSummary`，reporter=392 partner=156 HS=61），缺 key 时 skipped_auth_required。**ENV 变量真名 `UN_COMTRADE_API_KEY`（单 key）**，旧的 `UN_COMTRADE_KEY_1/2` 多 key 表述作废 |
| **FRED** | `FRED_API_KEY` | ✅ 已验证（必须 .lower()）| ⚠️ skipped_auth_required | ⚠️ **adapter 已实现**（`fetchFredLatestObservation`，默认拉 DEXJPUS 8 条），缺 key 时 skipped_auth_required。**代码不强制 .lower()**，依赖 FRED 服务端校验 |
| **U.S. Census** | `CENSUS_API_KEY` | ❌ 待验证 | ⚠️ skipped_auth_required | ⚠️ **adapter 已实现**（`fetchUsCensusImportHs`，默认 time=2024-12 HS=611020 国家=5700），缺 key 时 skipped_auth_required |
| **Open Supply Hub** | `OPEN_SUPPLY_HUB_API_KEY` | ❌ 受限 | ⚠️ skipped_auth_required | ⚠️ **adapter 已实现**（`fetchOpenSupplyHubSearch`，默认 query="Shenzhou"），缺 key 时 skipped_auth_required |
| **Massive.com** | — | ✅ 已验证（NKE/LULU/TJX/HBI）| 未列入 | 🔴 **adapter 未实现**——`src/intelligence/officialApis.ts` 无 fetchMassiveAdapter，seed 23 源中也无 massive。**10_PROBE_RESULTS 描述的验证为孤证，无法在当前 monorepo 复现** |
| **ARK Agent Plan** | `ARK_API_KEY` | ✅ 已验证 | 未列入 RUNBOOK | ➖ 不属 v3 intelligence 范围（仅 env 存在） |
| **World Bank** | 无（公开）| 未测 | ✅ verified | ✅ **verified**（无条件，`fetchWorldBankIndicator` 实测 VNM GDP + 关税 + BGD 劳动率 3 个 indicator） |
| **SEC EDGAR** | 无（公开）| 未测 | ✅ verified | ✅ **verified**（无条件，`fetchSecCompanyMetricSet` 实测 GAP, INC CIK 39911 5 字段） |
| **Eurostat** | 无（公开）| 未测 | ✅ verified | ✅ **verified**（无条件，`fetchEurostatDataPoint` 实测 demo_pjan DE 2024） |
| **ECB 汇率** | 无（公开）| 未测 | ✅ verified | ✅ **verified**（无条件，`fetchEcbEuroReferenceRates` 解析 daily XML） |
| **BLS Public Data** | 无（公开）| 未测 | ✅ verified | ✅ **verified**（无条件，`fetchBlsLatestSeriesPoint` 实测 CUSR0000SAA） |

### ENV 变量命名约定

```
{SOURCE}_{KEY 或 _KEY_1/_KEY_2}    多 key 才加数字后缀
单 key 永远用单数 _KEY
不使用 _TOKEN / _SECRET / _PASSWORD (避免歧义)
不混用下划线与连字符
```

### 已知冲突说明

| 冲突 | 详情 | 决策 |
|---|---|---|
| UN Comtrade 多 key 表述 | 10_PROBE_RESULTS 用 `UN_COMTRADE_KEY_1` / `_KEY_2`，RUNBOOK 与 v3 真实栈（`src/intelligence/officialApis.ts` `fetchComtradeFlowSummary`）用单 `UN_COMTRADE_API_KEY` | **以单 key 为准**：`UN_COMTRADE_API_KEY`。`UN_COMTRADE_KEY_1/2` 旧表述归档不再使用 |
| FRED 旧 key 状态 | 10_PROBE_RESULTS 写"已验证"，但实际新部署 REPL 跑时返回 401 | 以 `npm run verify:intelligence` 当下输出为准。旧文"已验证"作历史记录保留，不作为当前真实 |

### .env.example 模板（唯一真源）

```bash
# === v3 真实 ENV 变量（仅非空值，未用即注释） ===
# 数据源（统一单 key，命名按本表）
UN_COMTRADE_API_KEY=
FRED_API_KEY=
MASSIVE_API_KEY=
CENSUS_API_KEY=
OPEN_SUPPLY_HUB_API_KEY=

# LLM 凭据
ARK_API_KEY=
# ANTHROPIC_API_KEY=
# OPENAI_API_KEY=

# 通知（可选）
# FEISHU_WEBHOOK_URL=
# SERVER_CHAN_KEY=
```

---

# 数据源分级注册表

---

### 代码真源识别（2026-07-01 读 src/intelligence/*.ts + seed.json）

| 项 | docs 描述 | 代码实情 | 修复 |
|---|---|---|---|
| **数据源等级权重** | 03_AGENT_SOP §三：S=1.0 A+=0.9 A=0.8 B+=0.6 B=0.4 C=0.2 | seed 实际：**A=0.75, B=0.5, C=0.25，无 B+ 等级，5 档制** | 03_AGENT_SOP §三的权重表应改为代码真值。**0.05 差距会影响 scoreEvidence 的 chainAlignment 计算** |
| **Massive.com 状态** | 10_PROBE_RESULTS §三："已验证 NKE/LULU/TJX/HBI" | 🔴 `src/intelligence/officialApis.ts` 0 处提到 massive；seed 23 源中也无 massive | 10_PROBE_RESULTS §三标注 DEPRECATED 或补 `fetchMassiveAdapter` |
| **FRED 大小写要求** | 10_PROBE_RESULTS §2.1："Key 必须 .lower()" | 代码不强制 .lower()（直接传 apiKey 到 FRED）| 若依赖 FRED 服务端校验，可删除"必须小写"条款 |
| **adapter HTTP 库** | 04_CODE_SOP / 多份：建议 httpx / Playwright | 代码用原生 `fetch`（与 Express + Vite 栈一致）| 04_CODE_SOP 的 Python 模板已与 v3 TS 栈不一致，归档 |
| **重复检测 / 回放** | RUNBOOK §6.3："同 raw_hash 不重复写入" | 代码 evidence 用 `stableEvidenceId(source/kind/subject/claim/period)`，**无 hash 字段、无重复检测** | 属未来增强项，不阻塞当前 P-Block 1 |
| **source registry schema** | 02 §一 早期描述"56 个源"等 | seed 实际 23 个源 | 已统一到 23，旧的 56 表述作废 |

---

# 数据源分级注册表
> **状态**：第一版（基于实测）
> **原则**：第一信息源优先（海关/财报/官方 API > 行业研报 > 新闻）

---

## 数据源分级标准

| 等级 | 定义 | 用途 | 引用规则 |
|---|---|---|---|
| **S (10)** | 政府/交易所原始数据 | 直接定量主证据 | 可单独引用 |
| **A+ (9)** | 上市公司审计年报/季报 | 经营验证 | 可单独引用 |
| **A (8)** | 政府机构/行业协会权威 | 口径校准 | 可单独引用 |
| **B+ (6)** | 知名券商/咨询研报 | 趋势解读 | 需 A 级源交叉 |
| **B (4)** | 行业媒体 | 假设生成 | 必须 A 级源验证 |
| **C (2)** | 未验证自媒体/社媒 | 线索 | 不可引用 |

---

## 一、已实测可用的数据源 (P0)

### 1.1 S 级 - 官方原始数据

#### UN Comtrade (全球贸易数据) ★ 已实测

```
URL:         https://comtrade.un.org/
ENV 变量:    UN_COMTRADE_KEY_1, UN_COMTRADE_KEY_2 (从 .env.local 读取)
Python 包:   pip install comtradeapicall
限制:        公开免费 Key, 单次 500 条/查询, 250K 每月

⚠️ 安全说明 (来自 4 个独立审查的 critical issue):
  - 文档不写真实 API Key, 仅写真实 ENV 变量名
  - Key 实际值保存在 .env.local (不入 git, 不入文档, 不入聊天)
  - 撤销/重置 Key 见 https://comtradedeveloper.un.org/profile
```

| 维度 | 数据 | 精度 | 已验证用例 |
|---|---|---|---|
| 越南 HS60 进口 | 国家分布 × 金额 × 重量 | HS6 位 | 中国 66.1%, 韩国 12.4% |
| 越南 HS61 出口 | 目的地分布 | HS4 位 | 美国 53.1%, 日本 12.9% |
| 美国 HS61 进口 | 国家分布 | HS6 位 | 中国 22.1%, 越南 17.4% |
| 全球 HS60 出口 | 来源国分析 | HS4 位 | 中国 $21.5B, 韩国 $1.8B |

**已知限制**：
- 孟加拉数据未收录（可能滞后报送）
- 净重数据对部分国家缺失（用金额推算）
- 月度数据需更高 Key 级别

#### FRED (美联储经济数据) ★ 已实测

```
URL:         https://fred.stlouisfed.org/
ENV 变量:    FRED_API_KEY (从 .env.local 读取, 使用时需转小写)
限制:        120 req/min
```

| 指标 ID | 名称 | 用途 |
|---|---|---|
| CUUR0000SAA1 | 美国服装 CPI | 价格信号 (不能替代销量) |
| PCOTTINDUSDM | 全球棉花价格指数 | 原料价格 |
| DEXJPUS | USD/JPY 汇率 | 日元波动 |
| DCOILWTICO | WTI 原油 | 化纤成本联动 |
| DGORDER | 制造业新订单 | 需求信号 |
| UNRATE | 失业率 | 消费力指标 |
| INDPRO | 工业产出 | 制造活跃度 |

#### Massive.com (前 Polygon.io) ★ 已实测

```
URL:         https://massive.com/
ENV 变量:    MASSIVE_API_KEY (从 .env.local 读取)
限制:        免费 tier 限制 (需查 docs)
```

| 端点 | 数据 | 用途 |
|---|---|---|
| /v3/reference/tickers/{ticker} | 公司基础信息 | CIK 查询 |
| /vX/reference/financials?cik= | SEC 财报数据 | 品牌财报 |
| /v2/aggs/ticker/{ticker}/range | 历史股价 | 市值/估值 |

**已知限制**：
- 财务数据字段深（如 income_statement.gross_profit.value）
- 单次请求慢，需控制并发
- 部分字段缺失（如 inventory 需要试多个字段名）

### 1.2 A+ 级 - 品牌/工厂公开数据

#### 各品牌官网供应商名单

| 品牌 | URL | 内容 |
|---|---|---|
| 优衣库 (Fast Retailing) | fastretailing.com/sustainability/ | 工厂名+地址+产品 |
| H&M | hm.com/sustainability/ | 工厂名+地址+工人数 |
| Inditex (Zara) | inditex.com/... | 工厂名+地址 |
| Gap Inc. | gapinc.com/... | 工厂名+国家 |
| Nike | nike.com/... | 工厂名+地址+产品 |
| Adidas | adidas.com/... | T1/T2 分层 |
| Levi Strauss | levistrauss.com/... | 详细 |
| Patagonia | patagonia.com/... | 详细到工序 |
| MUJI (无印良品) | muji.com/... | 工厂名+国家 |
| UNIQLO 优衣库 | uniqlo.com/... | 完整名单 |

#### 已接入的 MCP (当前 Claude Code 会话可用)

| MCP | 用途 | 数据 |
|---|---|---|
| 通达信 (tdx-connector) | 金融数据 | 财报/研报/宏观/公告 |
| 企查查 (qcc-company) | 企业信息 | 工商/股东/风险/知产 |
| 天眼查 (tyc-mcp) | 企业搜索 | 企业/人物/专利 |
| 方舟 OpenViking | 记忆+向量 | 证据持久化 |
| 方舟 DataPro-search | 专业搜索 | 学术/企业/金融 |
| 方舟 askecho | 联网搜索 | 实时新闻/政策 |

---

## 二、待对接的数据源 (P1)

### 2.1 国家级海关

| 国家 | URL | 状态 | 接入方式 |
|---|---|---|---|
| 日本 | customs.go.jp/toukei/ | D:\Downloads 有部分表格 | WebFetch + Excel 解析 |
| 越南 | customs.gov.vn | 待验证 | WebFetch |
| 孟加拉 | customs.gov.bd | Comtrade 未收录 | WebFetch (优先) |
| 印尼 | beacukai.go.id | 待验证 | WebFetch |
| 韩国 | customs.go.kr | 待验证 | WebFetch |

### 2.2 工厂/品牌实体

| 来源 | URL | 需要 |
|---|---|---|
| Open Supply Hub | opensupplyhub.org | API Key (免费申请) |
| Panjiva | panjiva.com | 付费 ($400+/月) |
| ImportGenius | importgenius.com | 付费 ($99+/月) |
| Factiva | factiva.com | 付费 |
| Brand24 | brand24.com | 付费 |

### 2.3 行业特定

| 来源 | 数据 | 接入方式 |
|---|---|---|
| USDOC (美国商务部) | 关税/HTS 详情 | API |
| USITC DataWeb | 美国关税 | API Key |
| EDINET (日本) | 日企财报 | WebFetch |
| World Bank | 宏观 (已验证) | API (免费) |
| IMF | 汇率/经济 | API (免费) |
| ILO | 劳动/工资 | API (免费) |
| OECD | 经济指标 | API (免费) |

### 2.4 商品/原料价格

| 来源 | 数据 | 接入方式 |
|---|---|---|
| ICE | 棉花期货 | 公开网站 |
| USDA WASDE | 棉花供需 | 月度 PDF |
| Cotlook A | 棉花现货指数 | WebFetch |
| Keqiao 柯桥指数 | 面料价格 | WebFetch |
| LME | 金属 | API (免费) |

---

## 三、运营/合规 (P2)

### 3.1 社交信号源 (公开渠道)

| 平台 | 数据价值 | 接入方式 |
|---|---|---|
| LinkedIn | 品牌高管动态 | WebSearch (合规) |
| X (Twitter) | 行业观点/展会 | WebSearch |
| Facebook | 区域动态 | WebSearch |
| 小红书 | 中国市场反馈 | WebSearch |
| TikTok/抖音 | 销售/退货信号 | WebSearch |
| LINE | 日本市场 | WebSearch |
| Telegram | 行业群组 (公开) | WebSearch |

### 3.2 展会/活动

| 来源 | 数据 |
|---|---|
| Premiere Vision | 面料展 (巴黎/上海) |
| Intertextile | 中国面料展 |
| Magic | 成衣展 (拉斯维加斯) |
| Canton Fair | 广交会 |
| AAFA | 美国服装鞋类协会 |
| JETRO | 日本贸易振兴 |

---

## 四、数据接入优先级

```
P0 - 立即接入 (已实测可用):
  - UN Comtrade (免费 Key)
  - FRED (免费 Key)
  - Massive.com (免费 Key)
  - 通达信 MCP / 企查查 / 天眼查 (已接入)
  - 方舟 MCP (已接入)

P1 - 本周对接 (有官方 URL 但需调研):
  - 日本海关 customs.go.jp (Excel 解析)
  - Open Supply Hub (申请 Key)
  - 越南海关 customs.gov.vn
  - 孟加拉海关 customs.gov.bd
  - 印尼海关 beacukai.go.id

P2 - 月度对接 (需付费或合规审查):
  - USITC DataWeb (申请)
  - Panjiva / ImportGenius (付费 $400+/月)
  - Factiva / Brand24 (付费)
  - 社媒 API (需 OAuth + 合规审查)
```

---

## 五、数据使用纪律

```
1. 每个数据点必须声明:
   - 来源 (URL/API Key)
   - 时间戳 (fetched_at)
   - 原始指标 (metric_name)
   - 抓取时间 (period/date)
   - 等级 (S/A+/A/B+/B/C)
   - TTL (何时需要重新拉取)

2. 等级 < A 的数据:
   - 不可单独引用
   - 必须有 A 级源交叉
   - 在结论中必须标注不确定度

3. 间接推导:
   - 每个参数必须声明来源等级
   - 关键参数如果是 B/C 级, 结论只能称"估算"
   - 必须列出推导链, 任何一步是假设都要标注

4. 数据缺口:
   - 必须显式标注 [DATA_GAP]
   - 列出填补该缺口需要的具体数据源
   - 评估缺口对结论的影响程度
```
