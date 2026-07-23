# 产链引擎 MVP v1.0

> **⚠️ DEPRECATED · 2026-07-01**
> **当前生效方案：`产链引擎/00c_RESTART_PLAN_v3.md`（8 P-Block 路线）**
> **本文件保留原因**：MVP 极简方案（3 probe + 1 weekly brief + Server酱微信）作为 v3 的"GO/PIVOT 失败回退"备选；week 4 决策点 GO/PIVOT/KILL 的 PIVOT 路径需引用本设计。
> **请勿将本文与 v3 并行实施**。当前活跃迭代见 `00c_RESTART_PLAN_v3.md`。

> **更新日期**：2026-06-30
> **状态**：基于 4 个独立审查 (2 Claude subagent + 2 Codex) 共识重新设计
> **原则**：先验证用户真的会用，再扩张

---

## 一、MVP 定位 (取代原 12 份文档体系)

### 1.1 一句话定位

**Weekly Markdown brief to 富泉纺织's 老板 via WeChat, powered by 3 probes + 1 LLM call — prove within 8 weeks that the user actually opens it on Tuesday morning before deciding what to buy that week.**

### 1.2 不做什么 (明确范围)

```
✗ 7-agent / 7-layer 架构 (Eng 评分: 7-agent 是角色扮演)
✗ 12 份规划文档 (CEO 评分: 是方法论论文不是产品)
✗ Devil's Advocate + Predictor 独立 agent (Eng: 应合并到单次 LLM 调用)
✗ DeepSeek 生成 → Claude 审核流程 (Eng: 没有证据优于 Claude 直接写)
✗ ¥900/月预算的"7 agent 7×24 运行"假设 (CEO: 预算是虚构)
✗ 56 个数据源 (Eng: 1-2 人团队无法维护, 应聚焦 5-7 个)
✗ 向量库 / SQLite / Ark Memory 三层架构 (Eng: 选择未被指定且影响重大)
✗ 多模型路由 (Eng: 没有证据证明 ROI)
✗ 全产业链因果推导平台 (CEO: 用户问题可能不存在于这个层面)
```

### 1.3 只做什么 (MVP 核心)

```
✓ 3 个 probe (规则脚本, 零 LLM 调用)
✓ 1 个 weekly brief 生成器 (1 次 LLM 调用)
✓ 1 个 WeChat 推送通道 (微信文件传输助手)
✓ 1 个 SQLite evidence ledger (结构化, 可重放)
✓ 1 个 dry-run 测试套件 (用历史数据回测)
```

---

## 二、MVP 产品: Weekly Brief

### 2.1 输出格式 (固定模板)

```markdown
# 富泉纺织 每周情报简报
# 第 N 期 | 2026-07-08 ~ 2026-07-14

## 本周结论 (TL;DR)
1. **棉花**: 周均价 $X (↗ +2.3%) → 是否调价? — **建议: 不调, 涨幅 < 3% 阈值**
2. **越南 HS60 面料**: 中国占比 $X ($X M) → 对我们影响? — **建议: ...**
3. **优衣库**: 供应商名单本周变化 (新增 X, 移除 Y) → 关注 — **行动: 内部检查**

## 数据快照
| 指标 | 本周 | 上周 | 变化 | 来源 |
|---|---|---|---|---|
| 棉花期货 (ICE) | $X/lb | $X/lb | +X% | FRED PCOTTINDUSDM |
| 越南 HS60 进口 (USD) | $X M | $X M | +X% | Comtrade HS60 |
| USD/JPY | X | X | -X% | FRED DEXJPUS |
| 优衣库供应商名单 | X 家 | X 家 | +X | 品牌官网 |

## 风险预警
- [高] (如果有超阈值)
- [中] (如果接近阈值)
- [低] (无预警)

## 行动建议
1. (本周需要做的事)
2. (下周关注什么)
3. (本月趋势)

## 数据来源声明
本简报基于 3 个第一信息源: FRED, UN Comtrade, 优衣库官网.
数据采集时间: 2026-07-14 09:00 CST
下次更新: 2026-07-21 09:00 CST
置信度: 中 (基于 3 个独立源)
```

### 2.2 长度限制

```
- 总长度: ≤ 2 页 Markdown (打印约 1.5 张 A4)
- 表格: ≤ 4 个
- 结论: ≤ 3 条
- 行动建议: ≤ 3 条
- 推送时间: 每周二早上 9:00
- 推送方式: WeChat 文件传输助手
```

---

## 三、3 个 Probe 设计

### 3.1 Probe 1: 棉花价格监控

```python
# probes/cotton_probe.py

输入: 无 (使用 FRED API Key from env)
输出: signals/pending/cotton_YYYYMMDD.json
频率: 每周一 06:00 CST
阈值:
  - 周变化 > 3% → 高预警
  - 周变化 1-3% → 中预警
  - 周变化 < 1% → 低/无

指标:
  - PCOTTINDUSDM (全球棉花价格指数)
  - 备选: Cotlook A (用 WebFetch)

LLM 调用: 0 (纯规则脚本)
代码量: < 100 行
依赖: requests
```

### 3.2 Probe 2: 越南 HS60 进口变化

```python
# probes/vietnam_hs60_probe.py

输入: 无 (使用 Comtrade API Key from env)
输出: signals/pending/vietnam_hs60_YYYYMMDD.json
频率: 每月 1 号 06:00 CST (Comtrade 月度更新, 间隔太短无意义)
查询: 越南(reporter=704) HS60 进口 上月数据
对比: 上月 vs 上上月 vs 去年同期 (3 个时间窗口)

阈值:
  - 中国占比变化 > 2pp → 高预警 (e.g., 66.1% → 68%)
  - 韩国占比上升 > 1pp → 中预警 (替代中国信号)
  - 总金额变化 > 10% → 中预警 (整体需求变化)

LLM 调用: 0 (纯规则脚本)
代码量: < 150 行
依赖: comtradeapicall
```

### 3.3 Probe 3: 优衣库供应商名单变化

```python
# probes/uniqlo_supplier_probe.py

输入: 无
输出: signals/pending/uniqlo_suppliers_YYYYMMDD.json
频率: 每周一 07:00 CST
来源: https://www.fastretailing.com/sustainability/

逻辑:
  1. WebFetch 页面 (raw HTML)
  2. 解析工厂列表 (地址 + 国家)
  3. 与上次快照对比
  4. 检测新增/移除/变更

阈值:
  - 新增越南工厂 ≥ 2 → 高预警 (供应链转移中)
  - 移除中国工厂 ≥ 3 → 高预警 (脱钩中)
  - 整体变化 < 5 → 低/无

LLM 调用: 0 (HTML 解析是确定性操作)
代码量: < 200 行
依赖: requests, beautifulsoup4
```

---

## 四、Weekly Brief 生成器

### 4.1 设计原则

```
- 1 次 LLM 调用 (Claude Sonnet)
- 输入: 本周 3 个 probe 的输出 + 上周 brief
- 输出: 1 份 Markdown brief
- 不做: 多模型对抗验证 (Eng: 合并到单次调用足够)
- 不做: 复杂因果网络 (CEO: 用户问题不在这个层面)
```

### 4.2 Prompt 模板

```python
# brief/generator.py

BRIEF_PROMPT = """
你是富泉纺织 (中型针织出口企业) 的情报分析师.

## 背景
富泉对日/欧美出口 ODM 成衣, 月产 50 万件, 面料占成本 45%.

## 本周数据
{cotton_data}
{vietnam_hs60_data}
{uniqlo_suppliers_data}

## 上周 brief
{last_week_brief}

## 任务
生成一份 2 页以内的 weekly brief, 严格按以下结构:
1. 本周结论 (3 条 TL;DR, 每条 ≤ 30 字)
2. 数据快照 (4 个表格, 每表 ≤ 4 行)
3. 风险预警 (高/中/低, 标记具体指标)
4. 行动建议 (3 条, 每条 ≤ 50 字, 必须可执行)
5. 数据来源声明 (3 个数据源)

## 严禁
- 不要预测未来 (无法验证)
- 不要超过 2 页
- 不要重复上周已说过的内容 (除非有变化)
- 不要把估算说成事实
- 不要用"行业共识"替代实测

## 输出
Markdown 格式, 不要 code block 包裹.
"""
```

### 4.3 LLM 调用参数

```
model: claude-sonnet-4-6 (性价比, 不必 Opus)
max_tokens: 2000 (限制 2 页)
temperature: 0.3 (适度创造性, 不要 0 = 完全确定性)
timeout: 60 秒
retry: 2 次
cost: ~¥0.05-0.10/brief
```

---

## 五、WeChat 推送

### 5.1 推送方式选择

```
方案对比:

A) 微信文件传输助手 (wxhelper / itchat)
   优点: 直接到老板微信
   缺点: 需登录态, 风控风险
   复杂度: 中 (需维护登录)

B) 邮件 + 微信绑定提醒
   优点: 无需登录, 通用
   缺点: 邮件到微信延迟 5-10 分钟
   复杂度: 低

C) Server酱 (server_chan) 微信推送
   优点: 微信直接接收, 配对简单
   缺点: 免费版每天限 5 条
   复杂度: 低

D) 飞书/Lark Bot
   优点: 公司主流, 风控稳
   缺点: 需用户用飞书
   复杂度: 中

MVP 选择: C (Server酱), 实施 1 周后看用户习惯决定是否升级到 A/D
```

### 5.2 推送配置

```python
# brief/pusher.py

SERVER_CHAN_KEY = os.getenv("SERVER_CHAN_KEY")  # 用户单独申请
PUSH_TIME = "Tuesday 09:00 CST"
PUSH_TEMPLATE = """
📊 富泉每周情报 #{week_number}

{summary_3_lines}

→ 完整报告见附件
→ 数据来源: FRED + Comtrade + 优衣库官网
→ 下次更新: 周二 9:00
"""
```

---

## 六、SQLite Evidence Ledger

### 6.1 唯一数据表设计

```sql
-- evidence_ledger.sql

CREATE TABLE IF NOT EXISTS evidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  probe_name TEXT NOT NULL,             -- 'cotton', 'vietnam_hs60', 'uniqlo_suppliers'
  fetched_at TEXT NOT NULL,             -- ISO 8601 UTC
  data_date TEXT NOT NULL,               -- 数据本身的日期
  raw_payload TEXT NOT NULL,             -- JSON (完整原始响应)
  raw_hash TEXT NOT NULL,                -- sha256(raw_payload)
  extracted_fields TEXT NOT NULL,        -- JSON (关键字段)
  completeness REAL,                     -- 0-1
  status TEXT DEFAULT 'success',         -- success/partial/failed
  ttl_seconds INTEGER DEFAULT 604800      -- 7 天默认
);

CREATE INDEX idx_evidence_probe_date ON evidence(probe_name, data_date DESC);
CREATE INDEX idx_evidence_hash ON evidence(raw_hash);
```

### 6.2 写入规则

```python
# Append-only ledger: 同 raw_hash 不重复写入, 不同则新增一条
# superseded 字段: 当上游 API 数据被修订, 旧条目不被删除, 标记 superseded=true
# 这就是 Eng 审查要求的 "snapshot-and-replay discipline"
```

### 6.3 为什么不是其他存储

```
✗ 拒绝 Obsidian 双链: 不可重放, 不可查询, 不可对比
✗ 拒绝 Ark Memory: 1-2 人团队不需要云端记忆
✗ 拒绝 向量库: 3 个 probe 都是结构化数据, 不需要语义检索
✗ 拒绝 Postgres/ClickHouse: 3 个 probe 月产 100 条记录, SQLite 足够
✗ 拒绝 DuckDB: 增加运维复杂度, SQLite 性能足够
```

---

## 七、8 周验证 SOP (这是 MVP 的核心)

### 7.1 验证目标 (定义成功)

```
第一周: 用户收到第一份 brief → 是否打开 (邮件已读回执 / 微信点击)
第二周: 是否继续打开 (如果第一周没打开, 触发访谈)
第三周: 行动追踪 (本周 brief 中提到的建议, 用户是否执行)
第四周: 中期评估 (访谈: brief 有没有改变任何决策)
第五-七周: 持续监测 (打开率 + 行动率)
第八周: 决策点 (go / pivot / kill)
```

### 7.2 评估指标

```
硬指标:
  - 打开率: ≥ 70% (每周)
  - 行动率: ≥ 30% (brief 中建议至少 30% 被部分执行)
  - 决策改变: ≥ 1 次 (8 周内 brief 至少改变一次真实决策)

软指标 (访谈):
  - 老板是否觉得"省时间" (vs 原来手动查)
  - brief 是否"包含我没想过的视角"
  - brief 是否有"错误信息让我做了错的决定"
```

### 7.3 决策点 (第 8 周末)

```
if 打开率 ≥ 70% AND 行动率 ≥ 30% AND 决策改变 ≥ 1:
  → GO: 继续 + 扩展到第 2 个 brief (周报 + 月报) + 增加 2 个 probe
elif 打开率 40-70% OR 行动率 10-30%:
  → PIVOT: 调整 brief 内容/格式/时间, 再 4 周验证
elif 打开率 < 40% AND 行动率 < 10%:
  → KILL: 归档 MVP, 不继续投入
```

### 7.4 风险预案

```
最可能失败的原因 → 预案:
  - "老板不看微信文件" → 改为飞书 Bot 推送文本
  - "brief 太技术, 老板看不懂" → 用比喻 + 减少专业术语
  - "brief 没新意" → 增加 1 个差异化 probe (如汇率)
  - "数据延迟了" → 增加"数据延迟声明"
  - "3 个 probe 不够" → 不增加 probe, 优化 brief 呈现
```

---

## 八、成本核算 (重新校准)

### 8.1 月度成本估算

```
原计划 (12 份文档):
  Agent Plan: ¥200
  按量 API: ¥100
  Claude Code: 已在订阅
  DeepSeek 免费额度: ¥0
  Comtrade 免费: ¥0
  FRED 免费: ¥0
  Massive 免费: ¥0
  应急: ¥550
  月度总成本: ¥300 + 应急 (实际可能 ¥300-2000)

MVP 重新估算 (1 个 brief / 周):
  Claude Sonnet (4 calls/月 × ¥0.05): ¥0.20
  Comtrade (4 calls/月, 免费): ¥0
  FRED (4 calls/月, 免费): ¥0
  Massive (4 calls/月, 免费): ¥0
  WeChat 推送 (免费): ¥0
  VPS/服务器 (轻量): ¥50/月
  月度总成本: ¥50-60
  → 月度节省: ¥150-1940 vs 原计划
```

### 8.2 实施时间

```
3 个 probe: 1 人 × 3 天 = 3 人天
1 个 brief 生成: 1 人 × 2 天 = 2 人天
SQLite + 推送: 1 人 × 1 天 = 1 人天
测试 + 调试: 1 人 × 2 天 = 2 人天
─────────────────────
总: 8 人天 ≈ 2 周 (1 个人)
```

---

## 九、对比: 原 12 份文档 vs MVP

| 维度 | 原 12 份文档体系 | MVP |
|---|---|---|
| 文档数量 | 12 份 (3828 行) | 1 份 plan + 1 份 brief (每周新增) |
| Agent 数量 | 7 个 | 0 个 (1 次 LLM 调用) |
| LLM 调用/周 | 不确定 (估计 10-50 次) | 1 次 (brief 生成) |
| 月成本 | ¥300-2000 (不确定) | ¥50-60 (确定) |
| 实施时间 | 9-12 个月 | 2 周 |
| 验证标准 | 模糊 (backtest 框架未实施) | 清晰 (8 周打开率/行动率) |
| 实际用户反馈 | 无 (纸上) | 8 周内可见 |
| 失败成本 | 高 (9 个月投入) | 低 (2 周投入) |
| 退出路径 | 困难 (系统复杂) | 容易 (1 个 brief 归档即可) |

---

## 十、未来扩张路径 (GO 后)

```
如果 8 周验证 GO:
  Week 9-12:
    - 增加 probe 4: USD/JPY 汇率 (FRED 已有)
    - 增加 probe 5: 中国海关对日 HS61 出口 (Comtrade 已有)
    - 增加 monthly brief (月度报告, 比 weekly 更深入)
  
  Week 13-20:
    - 增加 probe 6: 客户财报 (Massive 已有, NKE/LULU/TJX)
    - 增加 probe 7: 日本海关月度 (customs.go.jp, 待对接)
    - 增加 chat interface (老板问"棉花对越南影响?", 1 次 LLM 回答)
  
  Week 21-30:
    - 增加 probe 8: 价格传导模型 (棉花→面料→成衣 FOB)
    - 增加 客户风险评估 (单一客户维度)
    - 增加 场景模拟 (棉花 +12% 假设推演)

  Week 31+:
    - 评估是否需要 7-agent 架构 (此时有了真实使用数据)
    - 评估是否需要多用户 (其他工厂加入)
```

---

## 十一、版本历史

- **v1.0** (2026-06-30): 初版
  - 基于 4 个独立审查 (2 Claude subagent + 2 Codex) 的共识设计
  - 取代原 12 份文档体系 (归档, 不删除, 作为 Phase 2+ 参考)
  - 8 周验证 SOP 已就绪
  - 月成本从 ¥300-2000 降至 ¥50-60
  - 实施时间从 9-12 月降至 2 周