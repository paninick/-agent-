# 中国环境 AI 模型与 Token 立体配置方案

更新日期：2026-06-18

## 1. 目标与边界

本方案同时优化四个目标：

1. 成本：优先使用中国原厂 API 和套餐额度。
2. 体验：控制首 Token 延迟、生成速度、限流和失败重试。
3. 质量：困难任务按规则升级，不让昂贵模型处理简单任务。
4. 稳定性：原厂、套餐、中转和备用供应商相互隔离。

三类资源必须分账：

- 原厂按量 API：用于应用后端、自动化、批处理和定时 Agent。
- Token Plan：用于个人在编码工具或 Agent 工具中的交互操作。
- 中转/网关：用于海外模型、供应商故障切换和统一观测。

Token Plan Key 不得放入生产后端。阿里百炼、火山 Agent Plan、MiMo Token Plan 都对自动化或非交互式使用存在限制。

## 2. 六维选择模型

每次调用按以下六个维度路由，而不是只按模型名路由：

| 维度 | 取值 | 影响 |
|---|---|---|
| 任务 | 摘要、编码、推理、图片、视频、语音 | 决定候选模型族 |
| 难度 | L0-L3 | 决定是否升级到 Pro 或海外模型 |
| 数据 | 公开、内部、敏感 | 决定是否允许经过海外或未知中转 |
| 交互 | 人工、后台、批量、实时 | 决定使用 Plan 还是按量 API |
| 时间 | 普通、高峰、夜间、窗口将满 | 决定供应商和套餐调度 |
| 预算 | 单任务和月度上限 | 决定最大输出、重试和升级次数 |

难度定义：

- L0：分类、提取、改写、短摘要。
- L1：普通问答、常规编码、简单工具调用。
- L2：复杂调试、长文档、多工具 Agent、深度推理。
- L3：核心架构、最终审查、高风险结论、国内模型连续失败。

## 3. 原厂按量 API 成本

有效输入价格公式：

```text
有效输入价 = 缓存命中率 * 缓存价 + (1 - 缓存命中率) * 未命中价
任务成本 = 输入Token/1M * 有效输入价 + 输出Token/1M * 输出价
```

人民币/百万 Token：

| 模型 | 缓存输入 | 未缓存输入 | 输出 | 已知并发/速率 |
|---|---:|---:|---:|---|
| DeepSeek V4 Flash | 0.02 | 1.00 | 2.00 | 并发 2500 |
| DeepSeek V4 Pro | 0.025 | 3.00 | 6.00 | 并发 500 |
| MiMo V2.5 | 0.02 | 1.00 | 2.00 | 动态 |
| MiMo V2.5 Pro | 0.025 | 3.00 | 6.00 | 动态 |
| MiniMax M3（当前优惠） | 0.42 | 2.10 | 8.40 | 标准/优先服务 |

以 50K 输入、5K 输出为标准 Agent 任务：

| 模型 | 0% 命中 | 50% 命中 | 80% 命中 | 90% 命中 |
|---|---:|---:|---:|---:|
| DeepSeek Flash / MiMo V2.5 | 0.0600 | 0.0355 | 0.0208 | 0.0159 |
| DeepSeek Pro / MiMo V2.5 Pro | 0.1800 | 0.1056 | 0.0610 | 0.0461 |
| MiniMax M3 | 0.1470 | 0.1050 | 0.0798 | 0.0714 |

缓存命中率必须从账单读取，不得在预算中直接假定为 80% 或 90%。稳定系统提示、固定工具定义和不变文档前缀更容易获得高命中率。

## 4. Token Plan 与时间窗口

### 4.1 阿里百炼团队版

| 档位 | 月费/席位 | 月额度 |
|---|---:|---:|
| 标准 | 198 元 | 25,000 Credits |
| 高级 | 698 元 | 100,000 Credits |
| 尊享 | 1,398 元 | 250,000 Credits |
| 共享包 | 5,000 元 | 625,000 Credits，有效期一个月 |

适合需要席位分配、成员统计、发票和团队管理的公司。没有公开的五小时窗口，但 Credits 的模型换算是动态的。支持千问、万相以及 DeepSeek、Kimi、GLM、MiniMax 等外部模型。

### 4.2 火山 Agent Plan

| 档位 | 月费 | 月 AFP | 周 AFP | 5 小时 AFP | 视觉日 AFP |
|---|---:|---:|---:|---:|---:|
| Small | 40 元 | 20K | 7K | 2K | 10K，仅图片 |
| Medium | 200 元 | 100K | 35K | 10K | 50K |
| Large | 500 元 | 250K | 87.5K | 25K | 125K |
| Max | 1,000 元 | 500K | 175K | 50K | 250K |

Medium 支持 Seedance 1.5；Seedance 2.0 需要 Large 或 Max。语音和 Harness 仅受月额度限制。可开启超额后付费，但必须设置独立预算告警。

### 4.3 MiMo Token Plan

| 档位 | 月费 | Credits | 官方估算中复杂任务/月 |
|---|---:|---:|---:|
| Lite | 39 元 | 4.1B | 约 200 |
| Standard | 99 元 | 11B | 约 1,600 |
| Pro | 329 元 | 38B | 约 5,600 |
| Max | 659 元 | 82B | 约 12,800 |

无公开五小时窗口。北京时间 00:00-08:00 按 0.8 倍 Credits 消耗，适合夜间集中处理人工任务。只支持 MiMo 模型，不含图片和视频。

### 4.4 MiniMax Token Plan

| 档位 | 月费 | 典型并行 Agent |
|---|---:|---:|
| Plus | 49 元 | 3-4 |
| Max | 119 元 | 4-5 |
| Ultra | 469 元 | 6-7 |

套餐受动态五小时窗口和周窗口限制，公开页面不披露固定 Token 数。工作日 15:00-17:30 可能动态收紧 RPM/TPM，超限后通常约一分钟恢复。积分按 1,000 Credits = 7 元计价，有效期一年，可在套餐额度不足时补充。

### 4.5 Kimi 会员

| 档位 | 普通月费 | 包年折算/月 | 官方估算 Agent 任务/月 |
|---|---:|---:|---:|
| Andante | 49 元 | 39 元 | 30 |
| Moderato | 99 元 | 79 元 | 60 |
| Allegretto | 199 元 | 159 元 | 150 |
| Allegro | 699 元 | 559 元 | 360 |

适合 PPT、Office、研究、Kimi Code 和 Claw 成品功能。额度按月刷新，同时存在五小时和七天动态限制，不作为通用后端 API。

## 5. 中转、网关与其他站点

### 5.1 OpenRouter

- 模型推理价不加价，购买 Credits 收 5.5% 平台费。
- BYOK 每月前 100 万请求免费，之后收模型调用价值的 5%。
- 免费层约 50 请求/天。
- 只对成功的自动回退调用计费。
- 适合 Claude、GPT、Gemini 及海外供应商备用，不作为国内默认主干。

标准任务 50K 输入、5K 输出，按 1 美元约 7.2 元并计入 5.5% 平台费：

| 模型 | 约人民币/任务 | 相对国内 Flash 0.06 元 |
|---|---:|---:|
| Gemini 3.1 Flash Lite | 0.15 | 2.5 倍 |
| GPT-5.4 | 1.52 | 25 倍 |
| Claude Sonnet 4.6 | 1.71 | 29 倍 |
| Claude Opus 4.8 | 2.85 | 48 倍 |
| GPT-5.4 Pro | 18.23 | 304 倍 |

### 5.2 Agnes AI

| 档位 | 促销价/月 | 常规价/月 | 请求数/5 小时 |
|---|---:|---:|---:|
| Starter | 2 美元 | 4 美元 | 1,500 |
| Plus | 5 美元 | 10 美元 | 7,500 |
| Pro | 25 美元 | 50 美元 | 30,000 |

Agnes 是自有模型服务，不是 Claude/GPT 聚合中转。公开页面显示通常约 100 TPS、非高峰约 150 TPS，但未给出单请求最大 Token 和媒体额度换算。只安排小额测试预算，不放敏感生产数据。

### 5.3 Vercel AI Gateway

Vercel AI Gateway 适合作为海外模型的工程网关，而不是替代国内原厂：

- 单一 API 访问多供应商，Token 原价且 BYOK 零加价。
- 自动供应商重试、模型回退、预算、用量、延迟和标签观测。
- 每个 Vercel 团队每月 5 美元免费额度。
- 网关路由开销低于 20ms，但中国到海外供应商的网络延迟仍然存在。
- 用 `user` 和 `tags` 按用户、功能、团队和环境归因成本。

Vercel Gateway 与 OpenRouter 二选一作为主海外网关：

- 已在 Vercel 部署、重视工程观测和 BYOK：Vercel Gateway。
- 重视模型市场、供应商选择和快速试用：OpenRouter。

## 6. 任务路由矩阵

| 场景 | L0/L1 默认 | L2 升级 | L3/最终兜底 |
|---|---|---|---|
| 分类、提取、摘要 | DeepSeek V4 Flash | MiMo V2.5 Pro | 不使用海外模型 |
| 普通编码 | MiMo V2.5 / DeepSeek Flash | DeepSeek V4 Pro | Claude Sonnet 4.6 |
| 架构和疑难调试 | DeepSeek/MiMo Pro | Claude Sonnet 4.6 | Claude Opus 4.8 或 GPT-5.4 |
| 人工编码 Agent | MiMo Standard | 火山 Medium | 火山 Large |
| 自动化 Agent | 国内原厂 API | 国内 Pro API | 海外网关，限一次升级 |
| Office/PPT/研究 | Kimi Moderato | Kimi Allegretto | 人工复核 |
| 图片草稿 | MiniMax Image | Seedream/Qwen Image | 海外高级图片模型 |
| 视频草稿 | MiniMax Hailuo Fast | Seedance 1.5 | Seedance 2.0/Veo |
| ASR | MiMo ASR | 豆包/MiniMax | 专业人工校对 |
| TTS | MiMo TTS | MiniMax Turbo | MiniMax HD/ElevenLabs |

海外升级条件至少满足一项：

1. 国内模型连续两次产生不可修复错误。
2. 编译、测试或结构化输出验证失败。
3. 属于核心架构、最终审查或高价值交付。
4. 单任务预估费用低于其业务价值的 1%。

海外调用量目标控制在总任务的 5%-10%，费用控制在总文本费用的 20%-30%。

## 7. 体验指标与 SLO

每次调用记录：

- `task_type`、`difficulty`、`data_classification`
- `model`、`provider`、`channel`（direct/plan/gateway）
- 输入、缓存、输出和推理 Token
- 首 Token 延迟、总延迟、输出 TPS
- HTTP 状态、重试次数、回退链
- 预估成本和实际成本
- 验证结果、人工返工分钟数

建议目标：

| 指标 | 交互任务 | 后台任务 |
|---|---:|---:|
| P95 首 Token | 小于 3 秒 | 小于 10 秒 |
| 成功率 | 大于 99% | 大于 99.5% |
| 单任务重试 | 最多 1 次 | 最多 2 次 |
| 海外回退率 | 小于 10% | 小于 5% |
| 缓存命中率 | 逐月实测 | 稳定前缀目标大于 60% |

## 8. 三档采购配置

### A. 个人编码型：约 300 元/月

- MiMo Standard：99 元。
- DeepSeek/MiMo 原厂 API：50 元。
- OpenRouter 或 Vercel Gateway：50 元。
- MiniMax 图片/语音：30 元。
- 应急余额：71 元。

### B. 个人全模态型：约 900 元/月

- 火山 Large：500 元。
- 国内原厂 API：100 元。
- MiniMax 媒体备用：150 元。
- 海外网关：100 元。
- 应急余额：50 元。

若不需要 Seedance 2.0，火山降为 Medium，可节省 300 元。

### C. 五人开发团队：约 2,000-3,000 元/月

- 需要统一席位管理：阿里标准席位为主，高级席位只给重度成员。
- 不需要统一席位：每人 MiMo Standard 或按工作类型选择火山 Medium。
- 后端统一使用公司原厂 API Key，与个人套餐完全隔离。
- 海外网关设置项目、环境、用户和功能四层标签。
- 预留总预算 15% 作为媒体和海外模型应急额度。

## 9. 时间调度与熔断

- MiMo 可延后的人工批量任务放在 00:00-08:00，利用 0.8 倍消耗。
- MiniMax 交互任务避开工作日 15:00-17:30；后台任务自动切按量 Key。
- 火山五小时窗口达到 70% 时停止 L0/L1 任务消耗套餐，切国内按量 API。
- 周额度达到 80% 时禁止视频试错，只允许已确认分镜生成。
- 月预算达到 50% 通知，75% 降级，90% 禁止海外 Pro 和视频重试，100% 硬停止。
- 429 只按 `Retry-After` 重试一次；402 立即降级；503 切下一供应商。

## 10. 可执行配置

```yaml
budget:
  monthly_cny: 900
  warning_percent: 50
  downgrade_percent: 75
  emergency_only_percent: 90
  hard_stop_percent: 100

routes:
  simple_text:
    primary: deepseek-v4-flash
    fallback: mimo-v2.5
    max_output_tokens: 4000
  coding:
    primary: mimo-v2.5
    fallback: deepseek-v4-pro
    premium: anthropic/claude-sonnet-4.6
    premium_max_share_percent: 10
  image_draft:
    primary: minimax-image-01
    max_attempts: 3
  video:
    primary: minimax-hailuo-2.3-fast
    premium: doubao-seedance-2.0
    require_storyboard_approval: true

limits:
  max_retries: 1
  max_agent_tool_calls: 15
  max_parallel_agents: 4
  max_context_tokens_standard: 80000
  require_approval_above_cny: 2.0

privacy:
  sensitive_data_allow_channels:
    - domestic_direct
  unknown_relay_allowed: false
```

## 11. 月度复盘

每月只回答五个问题：

1. 哪个场景的人工返工成本最高？
2. 哪个模型按“成功任务”计算最便宜，而不是按 Token 最便宜？
3. 五小时、周和月窗口分别有多少额度浪费或提前耗尽？
4. 海外升级中有多少实际改善了结果？
5. 哪份订阅连续两个月使用率低于 40%，应当取消？

订阅升级以连续两周触达窗口 80% 为依据；订阅取消以连续两月使用率低于 40% 为依据。

## 12. 来源

- DeepSeek：https://api-docs.deepseek.com/zh-cn/quick_start/pricing
- 阿里百炼：https://help.aliyun.com/zh/model-studio/token-plan-overview
- 火山 Agent Plan：https://www.volcengine.com/docs/82379/2366394?lang=zh
- MiMo：https://mimo.mi.com/docs/zh-CN/price/pay-as-you-go
- MiMo Token Plan：https://mimo.mi.com/docs/zh-CN/tokenplan/Token%20Plan/subscription
- MiniMax 按量：https://platform.minimaxi.com/docs/guides/pricing-paygo
- MiniMax Token Plan：https://platform.minimaxi.com/docs/guides/pricing-token-plan
- Kimi：https://www.kimi.com/membership/pricing
- OpenRouter：https://openrouter.ai/pricing
- Agnes AI：https://platform.agnes-ai.com/subscribe/subscription
- Vercel AI Gateway：https://vercel.com/docs/ai-gateway
