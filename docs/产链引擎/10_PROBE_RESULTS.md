# 实测数据记录

> **更新日期**：2026-06-30
> **目的**：记录每个数据源的真实测试结果，作为后续使用的依据

---

## 一、UN Comtrade (已验证)

### 1.1 API Key 验证

```
ENV 变量: UN_COMTRADE_KEY_1, UN_COMTRADE_KEY_2 (从 .env.local 读取)
状态: ✓ 有效 (Key 1 可访问 getFinalData, 单次最大 500 条)
注意: Key 1 是公开免费版，限速更严

ENV 变量: UN_COMTRADE_KEY_2
状态: ✓ 有效 (备选)
```

### 1.2 Python 包安装

```bash
pip install comtradeapicall
# 验证安装
python -c "import comtradeapicall; print(comtradeapicall.__version__)"
# 输出: 1.3.2
```

### 1.3 已成功调用的查询

#### A. 越南 HS60 进口来源国 (2023)

```
参数: reporter=704, cmd=60, period=2023, flow=M
返回: 52 条记录
中国占比: 66.1% ($3.59B)
详细:
  1. China: 66.1% ($3,590.6M)
  2. Other Asia, nes: 12.7% ($690.1M)
  3. Rep. of Korea: 12.4% ($671.6M)
  4. Japan: 2.4% ($130.5M)
  5. Thailand: 2.1% ($113.6M)
  
结论: 越南 HS60 高度依赖中国（66.1%），其次韩国
```

#### B. 越南 HS60 6 位细分 × 来源国 (2023)

```
HS6001 绒头织物: 总额 $526M, 中国 87.8%
HS6002 窄幅 ≤30cm: 总额 $23M, 中国 64.4%
HS6003 窄幅其他: 总额 $9M, 中国 57.0%
HS6004 弹性针织(宽): 总额 $1,505M, 中国 68.7% ★
HS6005 经编: 总额 $397M, 中国 62.5%
HS6006 其他宽幅: 总额 $2,976M, 中国 61.4%

关键: HS6004 弹力针织对中国依赖度 68.7%，是核心品类
```

#### C. 美国 HS61 进口 (2023)

```
HS61 总进口: $45.24B
Top 10:
  1. China: 22.1% ($10.0B)
  2. Viet Nam: 17.4% ($7.87B)
  3. Cambodia: 5.3% ($2.42B)
  4. Bangladesh: 5.3% ($2.41B)
  5. Indonesia: 4.8% ($2.18B)
  6. Honduras: 4.8% ($2.17B) ← 中美洲!
  7. India: 4.7%
  8. Nicaragua: 3.5%
  9. El Salvador: 3.3%
  10. Guatemala: 3.1%
  
美国 HS6109 T恤 ($6.93B):
  - 洪都拉斯 12.1% (第1!)
  - 尼加拉瓜 11.2%
  - 中国 8.4% (第3)
  - 越南 6.2% (第8)
  → T恤市场已被中美洲主导，亚洲份额有限

美国 HS6110 毛衣 ($13.36B):
  - 中国 18.8%
  - 越南 16.6%
  - 柬埔寨 6.3%
  - 孟加拉 5.2%
  → 毛衣市场亚洲仍主导，中越双寡头

美国 HS6115 袜类 ($2.31B):
  - 中国 55.8% (绝对主导)
  - 巴基斯坦 9.5%
  - 萨尔瓦多 9.0%
  - 越南 3.9%
  → 袜类是中国护城河品类
```

#### D. 越南 HS61 出口目的地 (2023)

```
总额: $14.76B
Top 10:
  1. USA: 53.1% ($7.84B) ★
  2. Japan: 12.9% ($1.91B)
  3. Rep. of Korea: 6.7%
  4. Canada: 3.6%
  5. Netherlands: 3.2%
  6. China: 2.6%
  7. Germany: 2.2%
  
关键: 越南对美国 53.1%，关税风险集中
```

#### E. 中国 HS61 进口 (2023)

```
总额: $3.96B
Top 10:
  1. Italy: 25.0% ($992M) ← 高端品牌转售
  2. Viet Nam: 18.5% ($733M) ← 中国也从越南进口!
  3. Portugal: 7.3%
  4. China: 6.5% (统计口径)
  5. Cambodia: 6.3%
  6. Bangladesh: 4.5%
  
反直觉发现: 中国也是越南成衣的进口国
```

#### F. 其他国家 HS61 出口

```
印尼 HS61 出口 ($3.83B, 2023):
  USA 60.3% ($2.31B) ← 高度依赖美国市场

柬埔寨 HS61 出口 ($5.48B, 2023):
  USA 34.4% ($1.89B)
  UK 8.7%
  Canada 8.4%
  Germany 7.7%
  → 比越南更分散

孟加拉 HS61 出口: 
  - Comtrade 未收录（数据报送延迟）
  - 需用 BGMEA 协会数据替代（B 级源）
```

### 1.4 失败的查询

```
1. 越南 2024 年数据
   错误: 服务暂不可用
   解决: 等待 24-48 小时后重试
   
2. 孟加拉所有查询
   错误: 始终返回空
   原因: Comtrade 未收录孟加拉数据
   解决: 用 BGMEA 替代
   
3. 越南数据 netWgt 字段
   问题: 大量记录 netWgt = 0
   原因: 越南海关报送不完整
   解决: 用 primaryValue 反推
```

### 1.5 已知限制

```
- 月度数据需要更高 Key 级别
- 一些 6 位 HS 编码可能超过 500 条记录上限
- 部分国家净重数据缺失
- 越南/孟加拉关税编码与品牌品类定义不完全对应
```

---

## 二、FRED (已验证)

### 2.1 API Key 验证

```
ENV 变量: FRED_API_KEY (从 .env.local 读取)
状态: ✓ 有效
注意: 使用时 Key 必须转小写 (在代码中 .lower())
```

### 2.2 已成功调用的数据

#### A. 美国服装 CPI (CUUR0000SAA1)

```
最新数据: 2026-05-01 = 133.573
趋势:
  2024-01: ...
  2025-12: 124.784
  2026-01: 129.240
  2026-02: 134.457
  2026-03: 134.517
  2026-04: 133.897
  2026-05: 133.573

用途: 美国服装价格趋势
限制: 月度滞后约 1 个月
```

### 2.3 失败的查询

```
1. 部分时段网络超时
   错误: HTTPSConnectionPool(...): Max retries exceeded
   原因: 国内访问 FRED 不稳定
   解决: 1) 加重试 2) 考虑代理
   
2. 初次用大写 Key 失败
   错误: Bad Request. The value for variable api_key is not a 32 character alpha-numeric lower-case string
   解决: 必须小写
```

### 2.4 计划调用但未测试

```
- PCOTTINDUSDM: 全球棉花价格指数
- DEXJPUS: USD/JPY 汇率
- DCOILWTICO: WTI 原油价格
- DGORDER: 制造业新订单
- UNRATE: 失业率
- INDPRO: 工业产出
```

---

## 三、Massive.com (历史已验证 / 当前 DEPRECATED)

> **⚠️ DEPRECATED · 2026-07-01**
> 本节描述的 Massive.com Nike/LULU/TJX/HBI 验证记录为**历史实测**，来自早期 monorepo 之前的代码环境。
> **当前 v3 产链引擎 monorepo 中**：
> - `src/intelligence/officialApis.ts` 无 `fetchMassiveAdapter` 函数（0 处引用 massive）
> - `data/intelligence-source-registry.seed.json` 23 个源中**无 massive**（仅有 UN Comtrade / FRED / Census / OS Hub 4 个授权源）
> - `verify:intelligence` 不会跑 massive probe
> 如需恢复 massive：补 `fetchMassiveAdapter` 加进 `src/intelligence/officialApis.ts` 并注册到 seed.json；否则视为历史归档。

### 3.1 API Key 验证（历史）

```
ENV 变量: MASSIVE_API_KEY (从 .env.local 读取)
状态: ✓ 有效（但有网络超时问题）
```

### 3.2 已成功调用的数据

#### A. Nike 公司基础信息 (CIK: 0000320187)

```
返回: 完整 JSON
关键字段:
  - ticker: NKE
  - name: Nike, Inc.
  - market: stocks
  - primary_exchange: XNYS
  - currency_name: usd
  - cik: 0000320187
  - market_cap: 60346146594.75
  - phone_number: (503) 671-3173
  - address: ONE BOWERMAN DR, BEAVERTON, OR 97005
  - sic_code: 3021
  - sic_description: RUBBER & PLASTICS FOOTWEAR
  - total_employees: 77800
  - description: 详细业务描述
  
  - share_class_shares_outstanding: 1,199,499,281
  - weighted_shares_outstanding: 1,480,887,033
```

#### B. Nike 财务报表 (FY2025)

```
返回: 完整结构化财务数据
关键字段 (FY2025):
  - 营收: $46,309,000,000 (FY24 同比 -9.8%)
  - 毛利: $19,790,000,000
  - 经营利润: $3,885,000,000
  - 净利润: $3,219,000,000
  - 基本 EPS: $2.17

  对比历史:
  FY2023: 营收 $51.2B, 经营 $6.2B, 净利 $5.07B
  FY2024: 营收 $51.4B, 经营 $6.7B, 净利 $5.7B
  FY2025: 营收 $46.3B, 经营 $3.9B, 净利 $3.2B ← 明显下滑
```

#### C. Lululemon (CIK: 0001397187)

```
FY2025:
  - 营收: $10.6B
  - 毛利: 59.2%
  - 经营利润: 23.7%
  - 净利润: $1,815M
```

#### D. TJX Companies (CIK: 0000109198)

```
FY2026:
  - 营收: $60.4B
  - 毛利: 31.0%
  - 经营利润: 12.1%
  - 净利润: $5,494M
```

#### E. Hanesbrands (CIK: 0001359841)

```
FY2023:
  - 营收: $5.6B
  - 毛利: 33.6%
  - 经营利润: 5.1%
  - 净利润: -$18M (亏损!)
```

### 3.3 字段路径问题

```
问题: 库存字段在不同公司路径不同
  Nike: income_statement.cost_of_revenue (但 inventory 路径在 balance_sheet)
  部分公司: balance_sheet.inventory_net
  部分公司: balance_sheet.inventories

解决: 试多个字段名，或使用关键词模糊匹配
```

### 3.4 网络超时问题

```
错误: HTTPSConnectionPool(host='api.massive.com', port=443): timed out
原因: 国内访问 Massive.com 网络不稳定
影响: 频繁需要重试
解决: 1) 加重试机制 2) 考虑代理 3) 限制并发
```

---

## 四、Ark Agent Plan (已验证)

### 4.1 资源清单

```
Profile: agent-plan_cn-beijing_personal
套餐: Medium
到期: 2026-09-23

可用模型 (14 个):
  - doubao-seed-2-0-code-preview
  - doubao-seed-2-0-pro
  - doubao-seed-2-0-lite
  - doubao-seed-2-0-mini
  - glm-5.2
  - kimi-k2.7-code
  - minimax-m3
  - deepseek-v4-flash-260425
  - deepseek-v4-pro-260425
  - glm-5.1
  - minimax-m2.7
  - kimi-k2.6
  - deepseek-v3.2
```

### 4.2 配额状态

```
月额度: 100,000 AFP
已用: 99,998.76 (99.99%) ← 已耗尽!
周额度: 35,000 AFP
已用: 1,568 (4.48%) ← 充裕
5h窗口: 10,000 AFP
已用: 1.98 (0.02%) ← 充裕

警告: 月额度已耗尽，下月重置前用周/5h窗口
```

### 4.3 免费资源包

```
deepseek-v4-pro: 499,959 / 500,000 剩余 ← 关键！
doubao-seed-2-1-pro: 490,779 / 500,000 剩余
doubao-seed-evolving: 493,200 / 500,000 剩余
glm-4-7: 500,000 / 500,000 剩余 ← 全新
doubao-seed-1-8: 500,000 / 500,000 剩余 ← 全新
```

### 4.4 使用记录 (2026-06)

```
总调用: 210 次
总 token: 8,403,894
  - 输入: 6,273,262
  - 输出: 2,130,632
  - 缓存命中: 3,036,344 (38% 命中率)
图片: 55 张
```

---

## 五、其他工具 (待测)

### 5.1 已接入 (未实测)

```
- 通达信 MCP: tdx-connector
  工具: tdx_api_data, tdx_kline, wenda_report_query
  状态: 接入, 未测试当前数据访问
  
- 企查查 MCP: qcc-company
  工具: get_company_profile, get_shareholder_info
  状态: 接入, 待用
  
- 天眼查 MCP: tyc-mcp
  工具: search_companies_by_industry_region
  状态: 接入, 待用
  
- 方舟 OpenViking: openviking-dataplane
  工具: read, write, search, remember
  状态: 接入, 待用
  
- DataPro Search: dataPro-search
  工具: dataPro_search
  状态: 接入, 待用
  
- askecho 联网搜索
  状态: 接入, 待用
```

### 5.2 待接入

```
- 日本海关 customs.go.jp (D:\Downloads 有部分表格)
- 越南海关 customs.gov.vn
- 孟加拉海关 customs.gov.bd (Comtrade 失败)
- 印尼海关 beacukai.go.id
- USITC DataWeb (需 Key)
- US Census International Trade (需 Key)
- Open Supply Hub (Key 审批延迟)
- D&B / ImportGenius (付费, 排除)
```

---

## 六、汇总

### 6.1 已实测可用的 S 级数据源

```
✓ UN Comtrade (Key 1, Key 2)
✓ FRED (key 小写)
✓ Massive.com (Nike/LULU/TJX/HBI 已验证)
✓ World Bank (官方)
✓ SEC EDGAR (官方)
✓ Eurostat (官方)
✓ ECB (官方)
✓ BLS (官方)
```

### 6.2 数据缺口

```
- 孟加拉海关 (Comtrade 未收录)
- 越南 2024 年数据 (服务暂不可用)
- 企业级提单 (ImportGenius 排除)
- 工厂 ID 数据库 (OS Hub 受限)
- 越南面料净重数据 (报送不完整)
- 部分历史时期数据 (需更高 Comtrade Key)
```

### 6.3 质量评估

```
S 级数据完整度: 7/8 (87.5%) - 仅缺孟加拉
A 级数据完整度: 取决于具体品牌
  - Nike/LULU/TJX: 完整
  - Hanesbrands: 完整但亏损
  - 中小服装公司: 大量缺失
时效性: 满足需求（核心指标 < 30 天）
成本: 全部免费 (除 Massive.com 网络问题)
```