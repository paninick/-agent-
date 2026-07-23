# 国家统计局 MCP 数据目录 + 工作流预设

> **工具**：`national-stats-mcp`（npm，免费，无需 API Key）
> **API**：V2.0 新版 + 旧版兼容
> **数据库**：10 个（全国 3 + 分省 3 + 城市 2 + 港澳台 2）

---

## 一、10 个数据库总览

| # | dbcode | 名称 | 频率 | v3 用途 |
|---|--------|------|------|---------|
| 1 | hgyd | 月度数据 | 月度 | **核心**：CPI/PPI/零售额/工业/贸易 |
| 2 | hgjd | 季度数据 | 季度 | **核心**：GDP/工业增加值/就业 |
| 3 | hgnd | 年度数据 | 年度 | 人均收入/投资/人口/能源 |
| 4 | fsyd | 分省月度 | 月度 | 区域经济/产业集群 |
| 5 | fsjd | 分省季度 | 季度 | 区域 GDP 对比 |
| 6 | fsnd | 分省年度 | 年度 | 省份排名/结构分析 |
| 7 | csyd | 城市月度 | 月度 | 城市消费/工业 |
| 8 | csnd | 城市年度 | 年度 | 城市 GDP/人口 |
| 9 | gatyd | 港澳台月度 | 月度 | 出口目的地/汇率影响 |
| 10 | gatnd | 港澳台年度 | 年度 | 贸易伙伴分析 |

---

## 二、月度数据 Top 10 指标（hgyd）

| # | 指标 | zb_code | 产业链环节 | v3 工作流 |
|---|------|---------|-----------|----------|
| 1 | **CPI 衣着类** | A090102 | ⑧消费者 | 每日简报 + 弹性计算 |
| 2 | **CPI 总指数** | A090101 | ⑧消费者 | 每日简报 + 通胀监控 |
| 3 | **PPI 衣着类** | A080602 | ⑤制造 | 成本传导链 |
| 4 | **PPI 纺织业** | A080601 | ③面料 | 原料价格传导 |
| 5 | **服装零售额** | A070302 | ⑦渠道 | 消费弹性计算 |
| 6 | **网上穿类零售额** | A070304 | ⑦渠道 | 电商渠道监控 |
| 7 | **社会消费品零售总额** | A070101 | ⑦渠道 | 宏观消费趋势 |
| 8 | **出口总额** | A110101 | ⑤制造 | 出口订单监控 |
| 9 | **纺织服装出口** | A110106 | ⑤制造 | 产业链出口 |
| 10 | **规上工业增加值** | A060101 | ⑤制造 | 制造业景气度 |

---

## 三、季度数据 Top 10 指标（hgjd）

| # | 指标 | zb_code | 产业链环节 | v3 工作流 |
|---|------|---------|-----------|----------|
| 1 | **GDP 当季值** | A010101 | 全链 | 每日简报 |
| 2 | **GDP 累计值** | A010102 | 全链 | 月度报告 |
| 3 | **第二产业增加值** | A010202 | ⑤制造 | 制造业趋势 |
| 4 | **第三产业增加值** | A010203 | ⑦渠道 | 服务业趋势 |
| 5 | **固定资产投资** | A020101 | ⑤制造 | 产能扩张 |
| 6 | **社会融资规模** | A040101 | ⑬金融 | 信贷环境 |
| 7 | **M2 货币供应** | A040201 | ⑬金融 | 流动性 |
| 8 | **居民人均可支配收入** | A0A01 | ⑧消费者 | 消费能力 |
| 9 | **城镇调查失业率** | A030101 | 全链 | 就业景气 |
| 10 | **PMI 制造业** | A0B0101 | ⑤制造 | 先行指标 |

---

## 四、年度数据 Top 10 指标（hgnd）

| # | 指标 | zb_code | 产业链环节 | v3 工作流 |
|---|------|---------|-----------|----------|
| 1 | **GDP 总量** | A010101 | 全链 | 月度报告 |
| 2 | **人均 GDP** | A010105 | ⑧消费者 | 消费水平 |
| 3 | **人均衣着消费支出** | A090103 | ⑧消费者 | **弹性计算核心** |
| 4 | **固定资产投资总额** | A020101 | ⑤制造 | 产能投资 |
| 5 | **进出口总额** | A110101 | ⑫海关 | 贸易总量 |
| 6 | **棉花产量** | A010801 | ①原料 | 国内供给 |
| 7 | **化纤产量** | A010802 | ②化纤 | 国内供给 |
| 8 | **纱产量** | A010803 | ②化纤 | 中间品供给 |
| 9 | **布产量** | A010804 | ③面料 | 面料供给 |
| 10 | **服装产量** | A010805 | ⑤制造 | 成衣供给 |

---

## 五、分省月度 Top 5（fsyd）

| # | 指标 | 用途 | v3 工作流 |
|---|------|------|----------|
| 1 | 分省 CPI | 区域价格差异 | 区域成本对比 |
| 2 | 分省 PPI | 区域出厂价 | 区域成本对比 |
| 3 | 分省服装零售额 | 区域消费 | 区域市场分析 |
| 4 | 分省工业增加值 | 区域制造 | 产业集群监控 |
| 5 | 分省出口额 | 区域出口 | 南通 vs 其他集群 |

---

## 六、分省年度 Top 5（fsnd）

| # | 指标 | 用途 | v3 工作流 |
|---|------|------|----------|
| 1 | 分省 GDP | 区域经济 | 南通产业定位 |
| 2 | 分省人均收入 | 区域消费力 | 目标市场选择 |
| 3 | 分省纺织服装产值 | 产业集群 | 竞争格局 |
| 4 | 分省固定资产投资 | 产能扩张 | 竞品产能监控 |
| 5 | 分省进出口 | 区域贸易 | 出口结构分析 |

---

## 七、港澳台月度 Top 5（gatyd）

| # | 指标 | 用途 | v3 工作流 |
|---|------|------|----------|
| 1 | 日本 CPI | 日本市场 | 对日出口定价 |
| 2 | 日本零售额 | 日本消费 | 优衣库/MUJI 市场 |
| 3 | 香港进出口 | 中转贸易 | 转口贸易监控 |
| 4 | 韩国 CPI | 韩国市场 | 韩国客户定价 |
| 5 | 台湾零售额 | 台湾市场 | 台湾客户分析 |

---

## 八、工作流预设（10 个工作流 × MCP 工具映射）

### 工作流 1：每日宏观简报

```yaml
name: "每日宏观简报"
trigger: "每日 08:00"
tools:
  - search_statistics: "CPI 最新"
  - search_statistics: "PPI 纺织"
  - search_statistics: "服装零售额"
  - search_statistics: "出口总额"
output: "Obsidian/_每日简报/{date}.md"
cost: "~¥0"
```

### 工作流 2：CPI/PPI 月度追踪

```yaml
name: "CPI/PPI 月度追踪"
trigger: "每月 10 日（NBS 发布日）"
tools:
  - get_statistics_data: "CPI 衣着类（hgyd, LAST6）"
  - get_statistics_data: "PPI 纺织业（hgyd, LAST6）"
  - get_statistics_data: "PPI 衣着类（hgyd, LAST6）"
output: "Obsidian/_产业链图谱/_因果链条/CPI_PPI月度.md"
cost: "~¥0"
```

### 工作流 3：消费弹性计算

```yaml
name: "消费弹性计算"
trigger: "每月 15 日"
tools:
  - get_statistics_data: "CPI 衣着类（hgyd, 202401-202612）"
  - get_statistics_data: "服装零售额（hgyd, 202401-202612）"
  - get_statistics_data: "网上穿类零售额（hgyd, 202401-202612）"
calculation: "ln(零售额) ~ ln(CPI衣着) → OLS 回归 → β = 弹性系数"
output: "Obsidian/_因果链条/弹性系数月度.md"
cost: "~¥0"
```

### 工作流 4：GDP 季度分析

```yaml
name: "GDP 季度分析"
trigger: "每季度 GDP 发布后"
tools:
  - get_statistics_data: "GDP 当季值（hgjd, LAST8）"
  - get_statistics_data: "第二产业增加值（hgjd, LAST8）"
  - get_statistics_data: "固定资产投资（hgjd, LAST8）"
output: "Obsidian/_产业链图谱/_因果链条/GDP季度.md"
cost: "~¥0"
```

### 工作流 5：出口订单监控

```yaml
name: "出口订单监控"
trigger: "每月 12 日（海关数据发布）"
tools:
  - search_statistics: "纺织服装出口"
  - get_statistics_data: "出口总额（hgyd, LAST12）"
  - get_statistics_data: "纺织服装出口（hgyd, LAST12）"
output: "Obsidian/_产业链图谱/_因果链条/出口月度.md"
cost: "~¥0"
```

### 工作流 6：区域经济对比

```yaml
name: "区域经济对比"
trigger: "每季度"
tools:
  - get_statistics_data: "分省 GDP（fsnd, LAST4）"
  - get_statistics_data: "分省纺织服装产值（fsnd, LAST4）"
  - get_statistics_data: "分省人均收入（fsnd, LAST4）"
output: "Obsidian/_产业链图谱/_因果链条/区域经济对比.md"
cost: "~¥0"
```

### 工作流 7：日本市场追踪

```yaml
name: "日本市场追踪"
trigger: "每月"
tools:
  - get_statistics_data: "日本 CPI（gatyd, LAST6）"
  - get_statistics_data: "日本零售额（gatyd, LAST6）"
  - get_statistics_data: "日元汇率（hgyd, LAST6）"
output: "Obsidian/_客户画像/日本市场月度.md"
cost: "~¥0"
```

### 工作流 8：产业链供给监控

```yaml
name: "产业链供给监控"
trigger: "每季度"
tools:
  - get_statistics_data: "棉花产量（hgnd, 2020-2025）"
  - get_statistics_data: "化纤产量（hgnd, 2020-2025）"
  - get_statistics_data: "纱产量（hgnd, 2020-2025）"
  - get_statistics_data: "布产量（hgnd, 2020-2025）"
  - get_statistics_data: "服装产量（hgnd, 2020-2025）"
output: "Obsidian/_产业链图谱/_因果链条/供给趋势.md"
cost: "~¥0"
```

### 工作流 9：消费者信心追踪

```yaml
name: "消费者信心追踪"
trigger: "每月"
tools:
  - search_statistics: "居民人均可支配收入"
  - get_statistics_data: "人均衣着消费支出（hgnd, LAST5）"
  - get_statistics_data: "社会消费品零售总额（hgyd, LAST12）"
output: "Obsidian/_产业链图谱/环节08-消费者/消费者信心月度.md"
cost: "~¥0"
```

### 工作流 10：制造业景气度

```yaml
name: "制造业景气度"
trigger: "每月 1 日"
tools:
  - search_statistics: "PMI 制造业"
  - get_statistics_data: "规上工业增加值（hgyd, LAST6）"
  - get_statistics_data: "PPI 纺织业（hgyd, LAST6）"
output: "Obsidian/_产业链图谱/环节05-生产制造/景气度月度.md"
cost: "~¥0"
```

---

## 九、MCP 工具使用速查

| 需求 | 工具 | 示例 |
|------|------|------|
| 快速查最新值 | `search_statistics` | `search_statistics("CPI 衣着")` |
| 查历史趋势 | `get_statistics_data` | `get_statistics_data({zb:"A090102", dbcode:"hgyd", sj:"LAST12"})` |
| 批量查多指标 | `batch_get_statistics` | 一次传入多个 zb_code |
| 浏览分类树 | `get_statistics_categories` | `get_statistics_categories({dbcode:"hgyd"})` |
| 查可用时间 | `get_statistics_time_options` | `get_statistics_time_options({dbcode:"hgyd"})` |

---

## 十、安装配置

```bash
# 1. 安装
npm i -g national-stats-mcp

# 2. Claude Desktop 配置
# 编辑 %APPDATA%\Claude\claude_desktop_config.json
{
  "mcpServers": {
    "national-stats": {
      "command": "npx",
      "args": ["-y", "national-stats-mcp"]
    }
  }
}

# 3. 重启 Claude Desktop

# 4. 验证
# 在对话中说："帮我查一下最新 CPI 衣着类数据"
```

---

> **核心价值**：10 个数据库 × 免费 × 无需 API Key × MCP 协议 × 1 行安装 = 国统局数据全自动化抓取
