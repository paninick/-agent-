# v3 产链引擎数学模型 v2.0（完整版）

> **版本**：v2.0 | **日期**：2026-07-01
> **基础**：v1.0 6 个方程 → v2.0 新增 18 个模型（全 9 节点覆盖）
> **配套**：[docs/AGENT_ARCHITECTURE.md](./AGENT_ARCHITECTURE.md) — 13 agent + 6 验证门
> **目标**：把"因果世界模型"从 6 方程扩到 24 模型 + agent 层验证

---

## 〇、版本演进

| 版本 | 内容 | 状态 |
|---|---|---|
| v1.0 | 6 个方程 + 12 参数（原料/加工/FOB/零售/需求/汇率）| ✅ 已有 |
| **v2.0** | **24 个模型（全 9 节点 + 6 元模型）** | 🟡 **本文** |
| v3.0 | VAR/CGE/SD 三层元模型验证 | P2 远期 |

---

## 一、符号系统（扩展）

### 1.1 状态变量（新增 8 个）

| 符号 | 含义 | 单位 | 数据源 |
|---|---|---|---|
| $C_t$ | 棉花价格（t 期）| ¥/吨 | USDA WASDE |
| $P_t$ | PTA 价格（t 期）| ¥/吨 | 隆众 |
| $Y_t$ | 纱线价格（t 期）| ¥/吨 | Obsidian |
| $F_t$ | 面料价格（t 期）| ¥/米 | **柯桥指数（v2.0 新增接入）** |
| $E_t$ | 能源成本（t 期）| ¥/件 | PPI 燃料+电力 |
| $L_t$ | 人工成本（t 期）| ¥/件 | ILO + 国统局 |
| $G_t$ | 成衣出厂价（t 期）| ¥/件 FOB | 申洲/晶苑 |
| $R_t$ | 零售价（t 期）| ¥/件 | 品牌年报 |
| $D_t$ | 需求量（t 期）| 万件/月 | 国统局零售额 |
| $Q_t$ | 汇率（t 期）| JPY/CNY | FRED |
| **$W_t$** | **Keqiao 纺织指数** | **点** | **柯桥指数（中纤网）** ⭐ |
| **$Dye_t$** | **染料成本** | **¥/件** | **中国染料工业协会** ⭐ |
| **$TR_t$** | **趋势强度** | **[0, 1]** | **WGSN / Pantone** ⭐ |
| **$LC_t$** | **学习曲线累计产出** | **件** | **工厂 ERP** ⭐ |
| **$Rec_t$** | **再生含量 %** | **[0, 1]** | **Textile Exchange / GRS** ⭐ |
| **$CO2_t$** | **碳足迹 kg CO₂e/件** | **kg** | **Ecoinvent** ⭐ |
| **$Logi_t$** | **物流费** | **¥/件** | **Freightos / 船司** ⭐ |
| **$Ch_t$** | **渠道加价率** | **%** | **平台规则 + 蝉妈妈** ⭐ |

### 1.2 参数（v1.0 的 12 个保留，新增 18 个）

| 符号 | 含义 | 值 | 来源 | 置信度 |
|---|---|---|---|---|
| $\alpha$ | 棉花占纱线成本 | 0.72 | Obsidian | A+ |
| $\beta$ | PTA 占涤纶成本 | 0.96 | 2026 回归 | A |
| $\gamma$ | 出厂价占零售价（优衣库）| 0.286 | 年报 | A |
| $\delta$ | 出厂价占零售价（ZARA）| 0.200 | 年报 | A |
| $\varepsilon$ | 需求价格弹性 | -0.50 | 文献 | C |
| $\eta$ | 能源占 FOB | 0.027 | 成本拆分 | A |
| $\lambda$ | 人工占 FOB | 0.467 | 成本拆分 | A |
| $\omega_e$ | 能源中电力占比 | 0.625 | 拆分 | A |
| $\omega_t$ | 能源中热能占比 | 0.375 | 拆分 | A |
| $\pi_l$ | 工资年通胀 | 0.05 | 行业 | A |
| $\pi_e$ | PPI 燃料同比 | 变量 | 国统局 | A+ |
| $\pi_p$ | PPI 电力同比 | 变量 | 国统局 | A+ |
| **$\eta_d$** | **染料占面料成本** | **0.15** | **行业** | **🆕 B** |
| **$\eta_w$** | **面料占成衣 FOB** | **0.65** | **申洲年报** | **🆕 B** |
| **$\eta_l$** | **面料占成衣数量损耗率** | **0.04** | **工厂 IE** | **🆕 B** |
| **$p_{min}$** | **Bass 创新系数** | **0.001-0.03** | **WGSN 历史** | **🆕 C** |
| **$q_{imp}$** | **Bass 模仿系数** | **0.3-0.5** | **WGSN 历史** | **🆕 C** |
| **$b_{LC}$** | **学习曲线指数** | **0.85-0.95** | **申洲年报** | **🆕 B** |
| **$t_{hazard}$** | **款式淘汰率** | **变量** | **平台数据** | **🆕 C** |
| **$SR_{Rec}$** | **面料可回收率** | **0.20-0.60** | **GRS 标准** | **🆕 B** |
| **$EF_{cotton}$** | **棉花碳排放因子** | **5.4 kg CO₂e/kg** | **Ecoinvent** | **🆕 A** |
| **$EF_{poly}$** | **涤纶碳排放因子** | **3.4** | **Ecoinvent** | **🆕 A** |
| **$CBAM_t$** | **欧盟碳边境调节税** | **€/t CO₂** | **EU** | **🆕 A** |
| **$Logi_{sea}$** | **海运基价** | **$/container** | **Freightos** | **🆕 B** |
| **$Ch_{tmall}$** | **天猫佣金** | **0.045** | **公开** | **🆕 A** |
| **$Ch_{tiktok}$** | **抖音佣金** | **0.05** | **公开** | **🆕 A** |
| **$Ch_{amazon}$** | **亚马逊佣金** | **0.15** | **公开** | **🆕 A** |
| **$Logit_{brand}$** | **品牌 Logit 偏好系数** | **变量** | **平台数据** | **🆕 C** |

### 1.3 滞后期

| 边 | 滞后 | 单位 | 说明 |
|---|---|---|---|
| 棉花→纱线 | 1-2 | 周 | 纱厂报价周期 |
| PTA→POY | 0-1 | 周 | 化纤厂 |
| **MEG→涤纶** | **1-2** | **周** | **🆕 化纤链** |
| **纱线→面料** | **2-4** | **周** | **已有 + 染整 1 周** |
| **染整→面料** | **1-2** | **周** | **🆕 染色周期** |
| 面料→成衣 | 4-8 | 周 | 含打样 |
| **BOM 改版→新款上架** | **8-16** | **周** | **🆕 设计周期** |
| 成衣→零售 | 12-24 | 周 | 品牌定价 |
| **零售→消费** | **0-4** | **周** | **已有** |
| **海运→港口** | **2-4** | **周** | **🆕 物流** |
| **清关→末端配送** | **0.5-2** | **周** | **🆕 跨境** |
| **回收→再生料** | **4-12** | **周** | **🆕 ⑨ 回收** |

---

## 二、节点 ① 农业（棉花/羊毛/丝麻）—— 3 模型

### 2.1 棉花价格时间序列 ⭐ 新增

$$C_t = \mu + \sum_{i=1}^{p}{\phi_i \cdot C_{t-i}} + \sum_{j=1}^{q}{\theta_j \cdot \varepsilon_{t-j}} + \beta_X \cdot X_t + \varepsilon_t$$

```
X_t = [种植面积, USDA 库存, 美元指数, NYMEX 投机头寸]
参数: p=1, d=1, q=1（先简单）
数据: USDA WASDE 月度 + ICE 周度
v3 实现: src/intelligence/models/cotton_arima.ts
```

### 2.2 棉花供需平衡 ⭐ 新增

$$库存_t = 库存_{t-1} + 产量_t - 消费_t - 出口_t + 进口_t$$

```
当库存 < 阈值 → 价格上行 5-15%
当库存 > 阈值 → 价格下行 5-10%
数据: USDA PS&D（Production Supply & Demand）
阈值: 全球年消费 × 0.4（IMO）
```

### 2.3 Cotlook A 指数 ⭐ 新增

$$Cotlook_A = \sum_{i=1}^{15}w_i \cdot P_i$$

```
15 个港口报价加权平均
反映：国际棉花现货价
数据: Cotlook / Cotton Outlook 周度
```

---

## 三、节点 ② 化学纤维（涤纶 / 尼龙 / 氨纶）—— 3 模型

### 3.1 PTA-PX-MEG 三元关系 ⭐ 新增

```
价格方程组:
  pPX = 0.65 × pPTA + 0.35 × pMX + ε₁
  pPTA = 0.65 × pPX + 0.35 × pMEG + ε₂
  pMEG = 0.70 × pEO + 0.30 × pEthylene + ε₃
求解: 三元物料平衡 + 价格联立方程
数据: CCFEI + 隆众日报
```

### 3.2 涤纶完整成本分解 ⭐ 新增（替代 v1.0 简化版）

$$涤纶成本 = 0.655 \cdot pPTA + 0.345 \cdot pMEG + 加工费 + 三费$$

```
加工费 = 设备折旧 + 水电 + 人工 (与节点 ⑤ 类似)
三费 = 财务费 + 销售费 + 管理费
约 800-1200 元/吨
```

### 3.3 化纤产能利用率 → 价格弹性 ⭐ 新增

$$p_t = a + b \cdot \ln(util_t) + c \cdot util_t^{-1}$$

```
util_t 利用率 60-90% 区间
util ↑ 1% → 价格 ↓ 0.3-0.5% (经验弹性)
util > 90% → 价格指数级上行（瓶颈）
数据: 中纤网周度
```

---

## 四、节点 ③ 面料织造与染整（v2.0 最大新增）—— 5 模型

### 3.1 柯桥纺织指数接入 ⭐ 新增

$$Keqiao_t = \sum_{i=1}^{N}w_i \cdot Price_{i,t}$$

```
N=20+ 主流品类（涤纶/棉/混纺/针织/梭织/特种）
权重: 行业销售加权
数据: 中国柯桥纺织指数官网（日度, 2003-）
接入: src/intelligence/adapters/kqindex.ts
```

### 3.2 面料成本分解（v2.0 革命性升级）

$$Fabric_t = Yarn_t \times 用量 + Dyeing_t + Finishing_t + 损耗$$

```
Yarn_t = 来自节点 ② (0.65 ¥/米 占大头)
用量 = 衣片数 × (1 + 损耗率 4-8%)
Dyeing_t = 0.85 元/件基础 + 颜色数 × 0.30 元/件
Finishing_t = 0.40 元/件（轧光/压光/防水）
损耗率 = 4% (织造) + 2% (染整) = 6% 综合
关键改良: v1.0 只算金额总和, v2.0 拆分量价
```

### 3.3 染整传递函数 ⭐ 新增

$$Dyeing_t = K \cdot White\_Cloth_t - L_{dye}$$

```
K = 染色吸色率 (90-95%)
L_dye = 染整损耗（水耗 100L/件 + 蒸汽 2kg + 染料 50g）
White_Cloth_t = Yarn 织成的白坯布
数据: 中国印染行业协会能耗统计 + 工厂实测
```

### 3.4 涤棉混纺比与价格 ⭐ 新增

$$Price = p_c \cdot r + p_p \cdot (1-r)$$

```
r = 棉含量 [0, 1]
p_c / p_p = 棉价 / 涤纶价 (动态)
应用: 混纺面料成本快速估算
```

### 3.5 印花复杂度-成本 ⭐ 新增

$$Price = Base + \sum_{i=1}^{n}C_i$$

```
Base = 基础印花费 1.2 元/件
C_i = 第 i 套色费 0.3 元/件
n = 印花色数（通常 1-8）
应用: 印花订单报价精度 ±5%
```

---

## 五、节点 ④ 设计开发（v2.0 新增）—— 4 模型

### 4.1 Bass 扩散模型 ⭐ 新增（核心）

$$F(t) = \frac{1 - e^{-(p+q)t}}{1 + \frac{q}{p} \cdot e^{-(p+q)t}}$$

$$f(t) = \frac{dF}{dt} = [p + q \cdot F(t)] \cdot [m - F(t)]$$

```
F(t) = 累积采纳率
f(t) = 瞬时采纳率 (销量)
p = 创新系数 0.001-0.03 (独立早期采用者)
q = 模仿系数 0.3-0.5 (跟随大众)
m = 市场潜力 (总销量上限)
应用: 新 SKU 上市 → 6 个月销量预测
v3 实现: src/intelligence/models/bass.ts
```

### 4.2 款式生命周期（Gompertz 增长）⭐ 新增

$$N(t) = m \cdot e^{-b \cdot e^{-c \cdot t}}$$

```
m = 饱和销量
b = 起始规模 (0=b 大量出货)
c = 增速
曲线: 慢启动 → 急升 → 饱和 → 衰退
应用: 替代 Bass 用于"非创新"款式（更平缓）
```

### 4.3 款式相似度 ⭐ 新增

$$\text{相似度} = \frac{A \cdot B}{\|A\| \|B\|}$$

```
A, B = 款式 embedding（颜色 + 廓形 + 材质 + 元素）
应用: 平台 SKU dedup + 趋势信号 → SKU 命中率
需预训练多模态 embedding 模型
```

### 4.4 趋势信号 → SKU 命中率 ⭐ 新增

$$\text{Hit Rate} = \frac{|SKU_{attr} \cap Trend_{kw}|}{|SKU_{attr} \cup Trend_{kw}|}$$

```
SKU_attr: 款式属性向量 (颜色/廓形/材质/工艺/元素)
Trend_kw: WGSN/Pantone 季度关键词
阈值: Hit Rate > 0.4 → 高把握度新款
```

---

## 六、节点 ⑤ 生产制造（v1.0 升级 + 3 新模型）—— 5 模型

### 5.1 加工费分解（v1.0 保留）

$$Processing(t) = L(t) + E(t) + M(t) + D$$

```
保留 v1.0 公式
增加 v2.0: 增加学习曲线项（见 5.4）
```

### 5.2 人工成本动态

$$L(t) = L(t-1) \times (1 + \pi_l) = L(t-1) \times 1.05$$

### 5.3 能源成本动态

$$E(t) = 0.25 \times (1 + \pi_p) + 0.15 \times (1 + \pi_e)$$

### 5.4 学习曲线 ⭐ 新增（重要）

$$Y_n = Y_1 \times n^{b}$$

```
Y_n = 第 n 件工时/成本
Y_1 = 首件工时/成本
n = 累计件数
b = log₂(学习率) 通常 -0.07 to -0.32
学习率 0.85 = b = -0.234 (累计件数翻倍, 成本降 15%)
应用: 产能扩张 → 边际成本下降
数据: 申洲/晶苑年报披露
示例: 首件 100 元, 翻倍 85 元, 再翻倍 72 元
```

### 5.5 OEE 综合效率 ⭐ 新增

$$OEE = 可用率 \times 性能率 \times 良品率$$

```
可用率 = 实际开机 / 计划开机 = 85-95%
性能率 = 标准产能 / 实际产能 = 80-95%
良品率 = 合格品 / 总产量 = 95-99.5%
行业基准: OEE = 77% (世界级制造)
传导: OEE ↑10% → FOB -1.5%
```

### 5.6 AQL 抽检 (ISO 2859-1) ⭐ 新增

```
抽样表 = f(批量, AQL%等级, 检验级别)
普通检验水平 II, AQL 2.5:
  批量 1000 → 抽 50 → 允收 ≤ 5
  批量 10000 → 抽 80 → 允收 ≤ 7
应用: 工厂出货前抽检判定
风险: 抽样错判率（生产者风险 + 消费者风险）
```

---

## 七、节点 ⑥ 品牌运营（v1.0 升级 + 3 新模型）—— 4 模型

### 6.1 品牌倍率（v1.0 保留）

$$\gamma = 1/品牌倍率$$

```
优衣库 1/3.5 = 0.286
ZARA 1/5.0 = 0.200
高端 1/6.5 = 0.154
```

### 6.2 品牌健康度评分 ⭐ 新增

$$Health = 0.3 \cdot G + 0.3 \cdot M + 0.2 \cdot I - 0.2 \cdot C$$

```
G = 增长分 (营收增速, EPS 增速)
M = 利润率 (营业, 净)
I = 库存健康 (DIO < 90, 折价 < 10%)
C = 关店 / 退货 / 投诉 (扣分)
应用: SEC 10-K + 季报自动计算
```

### 6.3 品牌切换 Markov 链 ⭐ 新增

$$P_{ij}^{(t+1)} = P_{ij}^{(t)} \cdot \pi_{ij}$$

```
P_ij = 客户从品牌 i 切到 j 的概率
Π = 转移矩阵 (列和为 1)
锁定客户: P_ii 大, 切换率高: P_ij 大
应用: 客户留存预测
```

### 6.4 议价博弈论 ⭐ 新增

$$P^* = MC_{工厂} \times \frac{1 + \gamma_s}{1 + \gamma_s + \gamma_b}$$

```
γ_s = 供应商议价能力 (0.1-0.5)
γ_b = 买家议价能力 (0.2-0.7)
P* = 纳什均衡价格
MC = 工厂边际成本
应用: 预测年度议价空间
```

---

## 八、节点 ⑦ 渠道与零售（v2.0 大补充）—— 4 模型

### 7.1 渠道价公式（v1.0 升级）

$$R_t = G_t / \gamma \times (1 + Ch_t + Logi_t + Tax_t)$$

```
Ch_t = 渠道加价 (5-50% 平台差异)
Logi_t = 物流费 (5-15%)
Tax_t = 税 (跨境 VAT/关税)
应用: 跨境电商 vs 国内贸易价差
```

### 7.2 平台渠道费分解 ⭐ 新增

$$Ch_{platform} = c_{base} + c_{comm} \cdot GMV + c_{ad}$$

```
c_base = 平台基础费（开店费/年）
c_comm = 佣金率 (天猫 4.5% / 抖音 5% / 亚马逊 15%)
c_ad = 广告费 (GMV 的 10-30%)
应用: 不同平台真实利润对比
```

### 7.3 跨境物流费 ⭐ 新增

$$Logi = 海运 + 港杂 + 关税 + 保险 + 末端$$

```
海运 = $Sea \times 距离因子 (50-100 USD/件)
港杂 = 海运 × 0.15
关税 = (G + 海运 + 保险) × 关税率
保险 = G × 0.005
末端 = (境内) 8-15 元/件
数据: Freightos / 海关
```

### 7.4 直播电商漏斗 ⭐ 新增

$$GMV = UV \times CTR \times CVR \times AOV$$

```
UV: 直播间访客
CTR: 点击率 (3-15%)
CVR: 转化率 (1-8%)
AOV: 客单价
工具: 蝉妈妈 / 飞瓜
应用: 实时 GMV 预测
```

---

## 九、节点 ⑧ 消费者行为（v1.0 升级 + 4 新模型）—— 5 模型

### 8.1 需求弹性（v1.0 保留）

$$D_t = D_0 \times (R_t / R_0)^\varepsilon$$

### 8.2 OLS 双对数回归 ⭐ 新增（数据驱动）

$$\ln(Q_t) = \alpha + \beta_1 \cdot \ln(P_t) + \beta_2 \cdot \ln(Income_t) + \sum_{i}{\gamma_i \cdot Month_i} + \varepsilon_t$$

```
Q_t = 服装零售量 (PPI 服装指数平减)
P_t = CPI 衣着
Income_t = 人均可支配收入
Month_i = 季节虚拟变量
β1 = 价格弹性 (预期 -0.4 到 -0.6)
β2 = 收入弹性 (预期 +0.8)
样本: ≥ 36 个月
```

### 8.3 Logit 品牌选择 ⭐ 新增

$$P(选 A) = \frac{e^{V_A}}{\sum_{j} e^{V_j}}$$

```
V_A = β_price × 价格 + β_quality × 质量 + β_brand × 品牌
β 系数通过面板回归估计
应用: 4 角色 4 真相的量化版
```

### 8.4 消费者信心指数传导 ⭐ 新增

$$Retail_{t+6} = \alpha + \beta \cdot CCI_t + \varepsilon$$

```
CCI_t → 6-12 月后 → 零售额
β 通常 0.3-0.5
应用: 提前预警
数据: 国家统计局月度 CCI
```

### 8.5 收入弹性分层 ⭐ 新增

$$\varepsilon_{income,group} = \frac{\Delta Q_{group} / Q_{group}}{\Delta Income_{group} / Income_{group}}$$

```
按收入 5 分位层, 计算各层弹性
低收入: 弹性 +1.2 (服装非必需)
高收入: 弹性 +0.4
应用: 收入分配对服装消费影响
```

---

## 十、节点 ⑨ 回收与循环经济（v2.0 全新章节）—— 4 模型

### 9.1 材料流平衡 ⭐ 新增

$$B_t = R_t + C_t - E_t - L_t - Stock_t$$

```
B = 旧衣输入
R = 回收量
C = 闭环再生料
E = 出口 (二手市场)
L = 损耗 (无法回收)
Stock = 库存
应用: 循环利用率 = R/B
```

### 9.2 再生含量评分 ⭐ 新增

$$\text{再生\%} = \frac{\sum_i m_i \cdot rec_i}{\sum_i m_i}$$

```
m_i = 第 i 种材料重量
rec_i = 该材料再生含量 [0, 1]
阈值: ≥20% GRS 标签, ≥50% "主要再生"
应用: 客户 ESG 报告
```

### 9.3 LCA 碳足迹 ⭐ 新增

$$CO_2e = \sum_i m_i \cdot EF_i + E_{制造} \cdot F + L$$

```
m_i × EF_i = 物料碳排放 (棉花 5.4 / 涤纶 3.4 / 羊毛 20)
E_制造 × F = 制造过程碳 (电力 0.5 + 热能 0.3)
L = 物流碳 (海运 × 0.01, 空运 × 0.5)
行业对标: T 恤 5-15 kg CO₂e/件
应用: EU CBAM 碳边境调节税应对
```

### 9.4 碳价（CBAM）传导 ⭐ 新增

$$\Delta p_{export} = CBAM_t \times CO_2e_t \times Q_t$$

```
CBAM = 欧盟碳价 €/t CO₂ (2026 ~ €80)
CO2e = 单位产品碳足迹
Q = 出口数量
应用: 2026 年起对欧盟出口的真实成本
```

---

## 十一、跨节点元模型

### 11.1 VAR（向量自回归）⭐ 新增核心元模型

$$Y_t = c + A_1 \cdot Y_{t-1} + A_2 \cdot Y_{t-2} + \varepsilon_t$$

```
Y_t = [cotton, yarn, fabric, fob, retail]_t
捕捉: 跨环节相互冲击 (棉花涨 → 纱线涨, 但零售滞后)
优点: 全部 5 个价格一起预测, 看冲击传导
实施: 需要 ≥ 30 月数据, statsmodels.ts
应用: 月度整体价格预测
```

### 11.2 CGE（可计算一般均衡）⭐ 新增元模型

```
数据库:
  - GTAP 全球贸易 (170+ 行业 × 130+ 国家)
  - SAM (社会核算矩阵)
实施: GAMS / CGEBox
应用: 关税政策传导 (优衣库转单孟加拉)
应用: 碳价传导 (EU CBAM → 全球纺织重组)
工作量大: 30+ 天首版
```

### 11.3 System Dynamics ⭐ 新增元模型

```
Stocks + Flows + 反馈环 + 时滞
库: 订单、库存、在制品、成品
工具: Stella / Vensim / PySD
应用: 工厂排产 + 库存波动
应用: 反证 Skill Creator 的"库存 → 报工 → 排产"反证
```

### 11.4 Bass 扩散 + 多代 S-curve ⭐ 新增

```
第一代 SKU: Bass (p=0.02, q=0.4)
第二代衍生: Bass (p=0.05, q=0.6) 更快达到峰值
第三代: 在第一代峰值时启动
应用: 产品线生命周期管理
```

### 11.5 物料流闭环 (Industrial Ecology) ⭐ 新增

```
Material Flow Analysis (MFA):
  边界 = 全球 / 国家 / 企业 / 产品
输入 = 原料 + 水 + 能 + 进口
输出 = 产品 + 废 + 排放 + 出口
应用: LCA + ⑨ 回收 + 节点 ① 农业的闭环
工具: STAN (免费)
```

### 11.6 跨节点蒙特卡洛仿真 ⭐ 增强

```python
# 保留 v1.0 算法, 加入 9 节点而非 5 节点
for _ in range(1000):
    # ① 棉花价格（含 ARIMA 残差）
    cotton = base['cotton'] * shock_arima()
    # ② 涤纶价格（含产能利用率扰动）
    polyester = cost_chain(cotton, pta, meg, util=base['util'])
    # ③ 面料价格（含染整扰动）
    fabric = fabric_cost(yarn, dye, dye_complexity)
    # ④ 设计周期（含 Bass 扩散）
    sku_adoption = bass(t, p, q, m)
    # ⑤ 加工费（含学习曲线 + OEE）
    processing = learning_curve_adj(processing_base, oee)
    # ⑥ 品牌倍数（含议价博弈 + 健康度）
    gamma = gamma_brand(health_score, bargain_power)
    # ⑦ 渠道费（含平台 + 物流 + 碳价）
    channel = channel_cost(platform, logistics, cbam)
    # ⑧ 需求（含 OLS + 收入分层）
    demand = ols_demand(price, income, cci)
    # ⑨ 碳足迹 + 回收
    co2e = lca_footprint(materials, energy, logistics)
    recycled = recycle_rate(year_used)
    profit_impact = co2e * cbam + recycled * green_subsidy
```

---

## 十二、关键模型代码骨架

```typescript
// src/intelligence/models/index.ts
export * from './cotton_arima'
export * from './keqiao_index'
export * from './fabric_cost'           // v2.0 革命性升级
export * from './dyeing_transfer'
export * from './bass_diffusion'
export * from './gompertz_lifecycle'
export * from './learning_curve'
export * from './oee_efficiency'
export * from './aql_sampling'
export * from './brand_health_score'
export * from './markov_brand_switch'
export * from './logit_brand_choice'
export * from './channel_fee'
export * from './cross_border_logistics'
export * from './livestream_funnel'
export * from './ols_demand_elasticity'
export * from './income_elasticity_layered'
export * from './material_flow_balance'
export * from './lca_co2e_footprint'
export * from './cbam_carbon_price'
export * from './var_cross_node'
```

---

## 十三、工作量与优先级（重排）

### P0（1 周见效，~30 天工作量）

| 模型 | 工作量 | 价值 |
|---|---|---|
| **③ 面料柯桥指数 + 成本分解** | 15 天 | **最大缺口终结** |
| **④ Bass 扩散 + Gompertz** | 5 天 | SKU 销量预测 |
| **⑤ 学习曲线** | 3 天 | 申洲/晶苑数据直接可用 |
| **⑨ LCA 碳足迹 + 再生评分** | 7 天 | CBAM 应对 |
| P0 小计 | **30 天** | |

### P1（中等优先级，~30 天工作量）

| 模型 | 工作量 | 价值 |
|---|---|---|
| **VAR 元模型** | 10 天 | 月度价格跃升 |
| **⑧ OLS 双对数回归（实际跑数据）** | 5 天 | 把 ε 从 -0.50 验证成精确值 |
| **⑥ 品牌健康度 + Markov** | 5 天 | 4 立场 4 真相量化 |
| **⑦ 跨境物流 + 平台渠道费** | 7 天 | 真实利润分析 |
| **② 涤纶三元成本分解** | 3 天 | 补齐化纤 |
| P1 小计 | **30 天** | |

### P2（演进，~70 天工作量）

| 模型 | 工作量 | 价值 |
|---|---|---|
| **CGE** | 30 天 | 政策评估 |
| **System Dynamics** | 20 天 | 工厂排程 |
| **① 棉花 ARIMAX 完整** | 8 天 | 行业领先 |
| **⑨ Material Flow Analysis** | 8 天 | 闭环复用 |
| **Logit 4 立场 4 真相** | 4 天 | 决策科学 |
| P2 小计 | **70 天** | |

### 总工作量

```
P0: 30 天  /  价值 ★★★★★
P1: 30 天  /  价值 ★★★☆
P2: 70 天  /  价值 ★★☆☆☆
──────────────────────
合计: 130 天 (~6-7 个月 / 1 人)
```

---

## 十四、模型局限性（v2.0 扩展）

| 局限 | 涉及节点 | 缓解方案 |
|---|---|---|
| 实际产量数据滞后 | ⑤ | 接入工厂 ERP 实时数据 |
| Bass 系数 p/q 难估计 | ④ | 用历史 6+ 月 SKU 销量回归 |
| OLS 需 36 月数据 | ⑧ | 接入国统局长时序 |
| 议价博弈论假设过强 | ⑥ | 仅作决策辅助, 不作预测 |
| LCA 排放因子地域差异大 | ⑨ | 用 Ecoinvent 数据库校准 |
| 跨节点 VAR 黑盒 | 全部 | 配 IRF + 协整检验, 增加可解释性 |
| 化纤产能利用率数据真实性 | ② | 用装置检修公告 + 行业协会核对 |

---

## 十五、Monte Carlo 跨节点仿真（v2.0 升级版）

**输入扩展**:
```yaml
simulation_input:
  base_state:
    cotton: 15300
    pta: 6116
    meg: 4500
    dye: 28  # 元/kg
    cotton_yarn_ratio: 0.72
    fabric_base: 8.5
    fabric_loss: 0.06
    fob_base: 15
    profit: 3
    demand_volume: 10000
    retail_base: 60
    keqiao_index: 1280
    oee_avg: 0.77
    learning_rate: 0.85
  
  shock_scenarios:
    cotton_shock: +0.05
    pta_shock: +0.10
    energy_shock: +0.20
    labor_shock: +0.08
    fx_shock: -0.05
    demand_shock: -0.10
    dye_shock: +0.05
    platform_fee_change: +0.02
    
  monte_carlo:
    n_simulations: 1000
    confidence_level: 0.95
    time_horizon: 12  # 月
```

---

## 十六、不做什么（明确边界）

```
❌ 不接所有第三方 OEM 全生命周期数据
❌ 不预测具体到 SKU ID 级别的销售
❌ 不做精确到秒的高频交易模型
❌ 不擅自跑生产数据
❌ 不用学术文献的固定系数代替实时数据
❌ 不跨节点预测需要精确实时反馈的事件
```

---

> **数学模型 = 24 模型 + 30 参数 + 9 节点 + 6 元模型**
>
> **v1.0 已有**: 6 方程 + 12 参数
> **v2.0 新增**: 18 模型 + 18 参数
> **未实装**: 18 个（其中 9 个在 P0 / 6 个在 P1 / 3 个在 P2）
>
> **核心公式**: G_t = α·C_{t-τ} + L(t) + E(t) + M + D + Profit
> **新增核心**: Fabric_t = Yarn·用量 + Dyeing + Finishing + 损耗 + 印花费
> **新增核心**: CO2e = Σ(m_i × EF_i) + 能源 + 物流
>
> **关键数字（待验证升级）**:
> - α = 0.72 (棉花→纱线) ✅
> - β = 0.96 (PTA→POY) ✅
> - γ = 0.286 (优衣库 FOB/零售) ✅
> - η_d = 0.15 (染料/面料) 🆕 行业默认
> - SR_Rec = 0.20-0.60 (面料可回收率) 🆕 GRS 标准
> - EF_cotton = 5.4 kg CO₂e/kg 🆕 Ecoinvent
> - Ch_tmall = 0.045 (平台佣金) 🆕 公开
> - b_LC = 0.85 (学习率) 🆕 申洲年报
---

## 十七、Agent 层数据真实性验证（v3 配套）

### 17.1 为什么需要 agent 层

```
数学模型再精确，如果数据源头是污染的，结论也是污染的。
例:
  - USDA 报告滞后 30 天 → 模型拿到的"今天"是 30 天前
  - 工厂自报 OEE 95% → 实际可能 65%（电耗数据反推）
  - 中国棉花产量少报 → 政治敏感

模型层: 解决"如何计算"
Agent 层: 解决"数据是不是真的"
```

### 17.2 6 道验证门

| 门 | 维度 | 评分 | 失败后果 |
|---|---|---|---|
| 1 | 来源溯源（provenance） | 0/0.4/0.7/1.0 | 任一 FAIL → 整条 REJECT |
| 2 | Schema 匹配 | 0-1.0 | < 0.8 → 不进 ledger |
| 3 | 值域合理性 | 0/0.4/0.7/1.0 | = 0 → 整条 REJECT |
| 4 | 新鲜度（freshness） | 0/0.4/0.7/1.0 | < 0.4 → retry 一次 |
| 5 | 跨源一致性 | 0/0.4/0.7/0.7 | = 0 → 标冲突源 |
| 6 | 历史正常性 | 0/0.7/1.0 | = 0 → 极端异常 REJECT |

```
综合 score = geometric mean(6 门分数)
判定:
  ≥ 0.85 → flag=high_authenticity (主评估)
  0.70-0.85 → flag=normal (主评估)
  0.40-0.70 → flag=low_authenticity (lead_only)
  0.10-0.40 → retry (换源)
  < 0.10 → REJECT
```

### 17.3 13 agent 注册表（详见 AGENT_ARCHITECTURE.md）

```
Layer 1 (9 Node Agents):
  CottonNode / PTANode / KeqiaoNode / DesignBassNode /
  ManufacturingOEENode / BrandMarkovNode / ChannelLogisticsNode /
  ConsumerLogitNode / RecycleLCANode

Layer 2 (3 Cross-Source Verifiers):
  ProvenanceVerifier / CrossSourceVerifier / HistoricalAnomalyVerifier

Layer 3 (1 Orchestrator):
  Orchestrator.runPipeline(nodeId, input)
```

### 17.4 与 evidence ledger 衔接

```typescript
// 旧 (v2.0)
confidence = sourceWeight × recencyFactor × methodFactor × chainAlignment - contradictionPenalty

// 新 (v3 + agent layer)
authenticityScore = geometricMean([
  provenanceScore, schemaScore, rangeScore,
  freshnessScore, crossSourceScore, historicalScore,
])
confidence = authenticityScore × sourceWeight × methodFactor × chainAlignment - contradictionPenalty
```

### 17.5 与 brandChainGate 衔接（7 账本）

```
现有 6 ledger: financials / trade / supplier / platform / materials / macro_disruption
新增第 7 ledger: data_authenticity
  - 平均 provenanceScore ≥ 0.7
  - 至少 2 源交叉验证 (crossSourceScore ≥ 0.5)
  - 历史 z-score 正常 (historicalScore ≥ 0.6)
  - freshness 全过

→ brandChainGate 升级到 7/7 (原 6/6)
→ visualizationReadiness 需 data_authenticity ≥ 0.7 才算 ready
```

---

## 十八、与现有代码衔接清单（实施路线）

```
现状: src/intelligence/*.ts (9 fetch + ledger + 6 ledger + 7 监控 + 5 门槛)
升级: 把 9 fetch 包装成 9 NodeAgent + 6 validator + 3 verifier + 1 Orchestrator

不重写:
  - 9 fetch 函数 (复用)
  - scoreEvidence (扩展字段)
  - 23 seed 源 (复用)

新写:
  - src/intelligence/agents/validators/*.ts (6 验证门)
  - src/intelligence/agents/nodes/*.ts (9 NodeAgent)
  - src/intelligence/agents/verifiers/*.ts (3 Cross-Source)
  - src/intelligence/agents/Orchestrator.ts (1 编排)
  - 扩 evidenceLedger.ts 加 authenticityScore 字段
  - 扩 brandChainGate.ts 加第 7 ledger

工作量:
  6 validator 函数: 3 天
  9 NodeAgent 骨架: 2 周
  3 Verifier + 1 Orchestrator: 1 周
  端到端测试 + docs: 1 周
  总计: ~4 周 / 1 人
```

---

**版本 v3 · 2026-07-01 · agent 层验证接入**
