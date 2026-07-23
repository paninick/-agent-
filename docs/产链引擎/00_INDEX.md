# 产链引擎 / IndustryChain Engine

> **产业链信源验证与传导分析系统** — 从第一信息源构建可验证的产业分析工具
> **目标用户**：服装出口企业（针织为主）的老板、销售总监、采购经理、生产厂长
> **当前状态**：P0 数据源验证完成，进入分支设计阶段

---

## 项目定位

不是再建一个 AI 工作台（市场已饱和），而是：
- 用现有产品的 MCP/CLI/API 组合编排一个**情报流水线**
- 核心差异化：**从第一信息源构建产业链关联图谱**——每个结论都能沿着链条验证到底

---

## 文档结构

| 文件 | 内容 | 状态 |
|---|---|---|
| `00_INDEX.md` | 项目入口 | ✅ |
| `00b_RESTART_PLAN_v2.md` | ~~重启规划 v2 (产品级)~~ → **作废**（栈错，方向对，路径错） | ⚠️ |
| `00c_RESTART_PLAN_v3.md` | **重启规划 v3 (继承已有资产)**：8 P-Block 路线，对齐真实栈 (Express + Zod + OpenAI Agents SDK) | ✅ |
| `01_MASTER_PLAN.md` | 总体规划（架构、阶段、里程碑） | ✅ |
| `02_DATA_SOURCE_REGISTRY.md` | 数据源分级注册表（已验证 vs 待对接） | ✅ |
| `03_AGENT_SOP.md` | 每个 Agent 角色的输入/输出/验证 SOP | ✅ |
| `04_CODE_SOP.md` | 代码层 SOP（数据获取→清洗→分析→输出） | ✅ |
| `05_VERIFICATION_STANDARDS.md` | 每个环节的质量门禁和验证标准 | ✅ |
| `06_USER_REQUIREMENTS.md` | 用户需求明确化（基于本次对话） | ✅ |
| `07_BRANCH_ROADMAP.md` | 分支实施路线图（DeepSeek 生成 → Claude 审核） | ✅ |
| `10_PROBE_RESULTS.md` | 实测数据记录（Comtrade/FRED/Massive 等） | ✅ |
| `20_REAL_DATA_INSIGHTS.md` | 基于真实数据的产业洞察 | ✅ |
| `30_DOWNLOADED_DATA_INDEX.md` | D:\Downloads\ 中已下载数据索引 | 待整理 |
| `99_CHANGELOG.md` | 变更日志 | ✅ |

---

## 实测可用的数据源（已验证）

```
S 级（原始官方数据，已实测）:
  ✓ UN Comtrade (ENV: UN_COMTRADE_KEY_1, UN_COMTRADE_KEY_2)
    - 全球 HS 编码贸易数据
    - 单次最大 250K 条记录（免费 Key）
    - 实测可获取越南/美国/中国/日韩进出口完整来源国数据

  ✓ FRED (ENV: FRED_API_KEY)
    - 美国服装 CPI (CUUR0000SAA1)
    - 全球棉花价格指数 (PCOTTINDUSDM)
    - USD/JPY 汇率 (DEXJPUS)
    - 1000+ 时间序列可用

  ✓ Massive.com (前 Polygon.io) (ENV: MASSIVE_API_KEY)
    - 美股财报数据 (NKE/LULU/TJX 等已验证可拉)
    - 公司 CIK/股票代码/SEC 财务字段
    - 注意：财务字段路径深（如 balance_sheet.inventory_net），需仔细解析

A+ 级（品牌/工厂公开数据）:
  ✓ 各品牌官网供应商名单 (WebFetch)
  ✓ 通达信 MCP（已接入，当前会话可用）
  ✓ 企查查 MCP（已接入）
  ✓ 天眼查 MCP（已接入）
  ✓ 方舟专业搜索 MCP（DataPro-search，已接入）

需对接（待研究 API）:
  ◯ 日本海关 customs.go.jp (WebFetch + Excel)
  ◯ 越南海关 customs.gov.vn (网站内容)
  ◯ 孟加拉海关 customs.gov.bd (Comtrade 未收录，需自接)
  ◯ 印尼海关 beacukai.go.id
  ◯ Open Supply Hub (工厂 ID 数据库，需申请 Key)
  ◯ USITC DataWeb (美国关税，需 Key)
```

---

## 已验证的真实数据洞察

详见 `20_REAL_DATA_INSIGHTS.md`。核心发现：

1. **越南 HS60 针织面料 66.1% 来自中国**（实测验证）
2. **越南棉花只有 25.1% 来自中国**（关键发现）
3. **越南 HS60 弹力面料 68.7% 来自中国**（功能性品类依赖度极高）
4. **越南 HS61 出口 53.1% 到美国**（关税风险集中）
5. **美国 HS6109 T 恤市场被中美洲主导 36%**（越南/中国份额有限）
6. **中国袜类占美国 55.8%**（中国护城河品类）

---

## 实施分支

详见 `07_BRANCH_ROADMAP.md`。

**Phase 1 (当前)**：第一信息源深度对接
- 实测验证每个 API 的真实可用性和数据精度
- 建立日本海关 Excel 自动化解析流程
- 完成越南/孟加拉/印尼海关数据源调研

**Phase 2**：DeepSeek 自动化生成初版代码
- 由 DeepSeek 基于已验证的数据集和 SOP 生成 Collector/Reasoner/Verifier 脚本
- Claude Code 进行审核和质量门禁
- 建立人机协作的代码生成流水线

**Phase 3**：端到端验证
- 跑通"棉花涨价 → 越南工厂成本传导 → 品牌发单决策"完整链路
- 验证每个数字都能沿着链条追溯到原始数据源

---

## 联系信息

- 项目路径：`D:\Documents\New project 2\docs\产链引擎\`
- 同步至 Obsidian：待办
- 关键关联：[[../INDUSTRY_INTELLIGENCE_AGENT_SPEC_CN.md|原规范]]、[[../AI_MODEL_ROUTING_PLAN_CN.md|模型路由]]
