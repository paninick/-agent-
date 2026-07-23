# 本地 wiki 与配置审计

审计日期：2026-06-30

## 1. 已读取的本地知识库

主知识库路径：

- `D:\obesidian\知识库`

重点读取：

- `D:\obesidian\知识库\主动情报\_渠道\index.md`
- `D:\obesidian\知识库\主动情报\_渠道\情报闭环系统.md`
- `D:\obesidian\知识库\主动情报\_渠道\服装成本模型.md`
- `D:\obesidian\知识库\主动情报\_渠道\服装制造供应链渠道.md`
- `D:\obesidian\知识库\主动情报\_渠道\全球公开数据源.md`
- `D:\obesidian\知识库\主动情报\_渠道\数据采集实操手册.md`
- `D:\obesidian\知识库\主动情报\_产业链图谱\已接入API数据能力.md`
- `D:\obesidian\知识库\主动情报\_产业链图谱\权重信息源注册表.md`
- `D:\obesidian\知识库\_元数据\API凭据存储.md`
- `D:\obesidian\知识库\_元数据\存储分层规则.md`
- `D:\obesidian\知识库\AI学习记忆\2026-06-29\02-技术\技术沉淀.md`

辅助发现：

- `D:\workbuddy-projects\2026-06-29-00-56-11\wiki\2026-06-29_AI短剧最后一公里思考.md`

## 2. wiki 中已有沉淀

本地 wiki 已经有三类关键资产：

1. 情报闭环方法：数据采集、权重、验证、结论、反证。
2. 服装产业知识：成本模型、供应链渠道、产业链环节、富泉相关判断。
3. API 与工具记忆：FRED、Comtrade、通达信、企查查、天眼查、WebSearch/WebFetch、方舟 Agent Plan、专业搜索、向量、记忆等。

结论：wiki 不是空白资料库，已经有产业链情报系统的前期路线和试验记录；当前工作应该继承它，而不是另起炉灶。

## 3. 当前 Codex 会话实际可用能力

已确认：

- Ark CLI 存在，版本为 `1.0.1`。
- Ark 默认 profile 存在，类型为 Agent Plan，地区为 `cn-beijing`，套餐显示为 Medium，有效期到 2026-09-23。
- 当前环境变量中存在 `ARK_API_KEY`。
- 当前 Codex 插件配置中启用了大量插件/连接器，包括 browser、chrome、computer-use、github、notion、hugging-face、vercel、netlify、figma、gmail、slack、canva、nvidia、codex-security 等。
- 本轮通过工具发现可懒加载 Hugging Face 和部分 Codex app 工具。

未在本轮工具列表中直接暴露：

- 通达信 MCP。
- 企查查 MCP。
- 天眼查 MCP。
- 方舟 memory/search/vector 的直接 MCP 工具。
- Factiva、Particl、Brand24、Quartr、Daloopa、S&P、Morningstar 等商业数据工具。

判断：wiki 中记录的是“历史/其他环境可用能力”；当前 Codex 会话没有自动挂载全部能力，需要重新安装、授权或通过工具搜索懒加载。

## 4. 配置风险

发现两个需要立即处理的安全风险：

1. Ark CLI 本地配置中存在明文 API key。
2. Codex 本地配置中存在疑似明文认证字段。

处理要求：

- 不在任何文档、报告、提交、聊天最终回复中暴露完整密钥。
- 尽快轮换这些密钥。
- 后续项目只使用 `.env.local`、系统环境变量、密钥管理器或受控 MCP secret store。
- `.gitignore` 已补充 `.env`、`.env.*`、`.superpowers/`、`dist/` 和 `*.log`。

## 5. 方舟状态

Ark profile 查询可用，但 `arkcli auth status` 触发 Volc SSO token exchange 时出现网络超时。

推断：

- 不是没有 profile。
- 更像是当前网络、代理或 SSO 链路无法访问 `signin.volcengine.com`。
- 因为 `ARK_API_KEY` 环境变量存在，后续可以先尝试直接 API 调用，再补 SSO 登录。

下一步建议：

1. 用一个不暴露密钥的最小 Ark chat/search 调用验证 `ARK_API_KEY` 是否可用。
2. 如果需要方舟 Harness、专业搜索、记忆、向量，优先查本地 `arkcli resources` / `arkcli api-explorer`，再做 MCP 包装。
3. 如果 SSO 仍超时，先修代理/网络，再做 profile 级授权。

## 6. MCP 缺口清单

P0 缺口：

- `official-source-adapters-mcp`：Comtrade、WITS、SEC、EDINET、e-Stat、USITC、FRED、World Bank、OECD、Eurostat、BLS、ILOSTAT。
- `weighted-websearch-mcp`：搜索结果按来源等级、时间、域名、是否官方、是否可反证加权。
- `ark-memory-search-vector-mcp`：方舟记忆、专业搜索、向量统一入口。
- `evidence-ledger-mcp`：所有事实写账本，强制记录来源、口径、权重、换算和反证。

P1 缺口：

- `platform-auth-mcp`：Shopee、Temu、Alibaba/1688 授权接口。
- `brand-market-monitor-mcp`：价格、折扣、评论、上新、广告、用户反馈。
- `supplier-risk-mcp`：供应商新闻、诉讼、产能、招聘、扩产、处罚、合规。

P2 缺口：

- 商业数据插件：Factiva、Brand24、Particl、Quartr、Daloopa、S&P、Morningstar、BigQuery。

## 7. 结论

当前不是“没有数据”，而是“数据能力分散在 wiki、Ark、本机配置、Codex 插件和外部 API 中，还没有统一证据账本”。

下一步应该先做三件事：

1. 密钥安全治理：轮换明文密钥，建立 `.env.local` 和 secret store 规则。
2. 证据账本：把所有来源统一成可追溯、可评分、可反证的数据结构。
3. P0 adapter：先打通 5 个官方免费 API，再接平台和商业源。
