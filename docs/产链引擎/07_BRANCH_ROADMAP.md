# 分支实施路线图

> **更新日期**：2026-06-30
> **目的**：定义 DeepSeek 生成 + Claude 审核 + 测试验证的代码生产流水线

---

## 一、整体流程

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ Claude/用户  │    │   DeepSeek   │    │ Claude Code  │    │  测试验证    │
│  设计 SOP    │ ─→ │   生成代码   │ ─→ │    审核      │ ─→ │  (Pytest)   │
│  数据契约    │    │              │    │              │    │              │
└──────────────┘    └──────────────┘    └──────────────┘    └──────┬───────┘
                                                                     │
                                                              ┌──────┴───────┐
                                                              ↓              ↓
                                                        ┌─────────┐   ┌─────────┐
                                                        │ 通过    │   │ 失败    │
                                                        │ 合并入主│   │ 反馈    │
                                                        └─────────┘   └─────────┘
```

---

## 二、各阶段详细

### 2.1 设计阶段（Claude / 用户）

```
输入:
  - SOP（从 03_AGENT_SOP.md 提取）
  - 数据契约（从 06_USER_REQUIREMENTS.md 提取）
  - 现有代码（如果存在）
  - 测试要求

输出:
  - 详细的代码任务说明（自然语言）
  - 接口签名（输入/输出）
  - 验收标准

示例:
  任务: 实现 comtrade_adapter.py
  输入: reporter_code (str), period (str), cmd_code (str)
  输出: List[Dict]
  关键字段: primaryValue, netWgt, partnerDesc, reporterDesc
  错误处理: 超时/404/限流 → 重试 + 备用 Key
  测试: mock HTTP, 验证字段提取
```

### 2.2 生成阶段（DeepSeek）

```
DeepSeek Prompt 模板:

"你是 Python 后端开发工程师。根据以下 SOP 生成生产代码。

## SOP
{paste from 03_AGENT_SOP.md}

## 任务
{task description}

## 数据契约
{data contract}

## 约束（强制）
- Python 3.11+ 必须有 type hints
- 必须有 docstring (模块/函数/类)
- 必须有错误处理（重试/超时/降级）
- 必须有日志（结构化 JSON）
- 必须从环境变量读取 API Key
- 必须有单元测试
- 输出符合 Evidence schema
- 任何外部 API 调用必须有 timeout 设置

## 验证清单（你必须自检）
□ 类型注解完整
□ 函数 docstring 完整
□ 错误处理覆盖所有路径
□ 日志使用 StructuredLogger
□ 单元测试覆盖率 > 80%
□ 没有硬编码密钥
□ 数值计算用代码不用 LLM

## 输出格式
返回完整代码文件内容，用 ```python 包裹。
代码之后给出'自检报告'，逐项勾选验证清单。"
```

### 2.3 审核阶段（Claude Code）

```
Claude Code Prompt:

"你是 Python 资深工程师，审核以下 DeepSeek 生成的代码。

## 代码路径
{file path}

## 评估维度（每项 0-10 分）

1. 正确性（30%）
   - 是否满足 SOP 要求
   - 数据契约是否一致
   - 边界条件处理（空/错/超时）

2. 错误处理（20%）
   - 异常覆盖度
   - 重试策略合理性
   - 降级方案

3. 可维护性（15%）
   - 代码可读性
   - 函数/类职责单一
   - 命名规范

4. 性能（10%）
   - 连接复用
   - 批量处理
   - 超时设置

5. 安全性（15%）
   - 无硬编码密钥
   - 数据脱敏
   - 审计日志

6. 测试（10%）
   - 单元测试覆盖
   - mock 完整
   - 集成测试可能性

## 输出格式
{
  "overall_score": 0-10,
  "critical_issues": [必须修复才能合并],
  "warnings": [建议修复但不阻塞],
  "suggestions": [改进建议],
  "ready_to_merge": true/false
}

如果 overall_score < 7 或 critical_issues > 0，返回 false。"
```

### 2.4 测试验证

```yaml
测试类型:
  unit_test:
    工具: pytest
    覆盖目标: 每个外部 API 调用、每个边界条件
    验证: 字段提取、错误处理、数据类型
    
  integration_test:
    工具: pytest + 真实 API（限流内）
    频率: 每天 1 次（CI 任务）
    验证: 真实数据返回正确
    
  live_smoke_test:
    工具: 手动 + Claude
    频率: 每次新数据源接入
    验证: 跑通完整 Collector → Cleaner → Writer 链路

测试通过标准:
  - unit_test: 100% 通过
  - integration_test: 100% 通过
  - live_smoke_test: 至少能产出一条可用的 Evidence 条目
```

---

## 三、DeepSeek 调用方式

### 3.1 Ark 模型路由

```
首选模型: DeepSeek V4 Pro (免费额度 ~500K token)
备选: Doubao Seed 2.1 Pro (免费额度 ~490K token)
用途: 代码生成、初版 prompt 设计

API Key: 
  已在 arkcli 配置（Agent Plan profile）
  
调用方式:
  arkcli chat --model "deepseek-v4-pro-260425" \
    --system "..." --user "{prompt}" \
    --output {file_path}
```

### 3.2 prompt 模板存放

```
D:\ERP\intelligence\prompts\
├── code_generation.md          # 通用代码生成
├── adapter_generation.md      # API adapter 模板
├── probe_generation.md        # Probe 脚本模板
├── agent_generation.md        # Agent 实现模板
└── test_generation.md         # 测试代码模板
```

---

## 四、失败处理流程

### 4.1 重试规则

```
┌────────────────────────────────────────────────┐
│ DeepSeek 生成失败                                 │
├────────────────────────────────────────────────┤
│ 第 1 次: 检查测试错误 → 把具体错误反馈给 DeepSeek │
│ 第 2 次: Claude Code 介入 → 手动修复关键问题        │
│          让 DeepSeek 学习这个修正                   │
│ 第 3 次: 升级人工 → 记录问题到 99_CHANGELOG.md     │
└────────────────────────────────────────────────┘

关键: 不要简单重跑（同样的 prompt 会得到同样结果）
      要基于反馈优化 prompt 或手动干预
```

### 4.2 异常升级路径

```
自动处理 (无需人工):
  - 单条数据异常 (自动剔除)
  - 单次 API 失败 (重试备用源)
  - 单个 Agent 失败 (重试或降级)

需要人工确认:
  - Devil's Advocate ESCALATE
  - 连续 3 次同类型失败
  - 关键结论置信度 < 0.3 但决策需要

需要立即升级:
  - 关键数据源永久失效
  - 模型供应商政策变更
  - 法规变化 (如《数据安全法》新规)
  - 系统判断 "前所未有" 事件
```

---

## 五、首批 DeepSeek 生成任务清单

按业务价值排序：

### 5.1 P0 - 立即生成

```
1. probes/cotton_probe.py
   SOP: 03_AGENT_SOP §Collector
   数据源: FRED (PCOTTINDUSDM)
   阈值: 周变化 > 3%
   
2. adapters/comtrade_adapter.py
   SOP: 03_AGENT_SOP §Collector
   数据源: UN Comtrade
   端点: get_final (250K 行)
   
3. probes/fx_probe.py
   数据源: FRED (DEXJPUS)
   阈值: 周变化 > 1.5%
   
4. probes/brand_finance_probe.py
   数据源: Massive.com + SEC
   监控: 库存周转 > 100 天
```

### 5.2 P1 - 一周内生成

```
5. parsers/excel_parser.py (日本海关 Excel 自动化)
6. adapters/fred_adapter.py
7. adapters/massive_adapter.py
8. agents/collector.py (通用 Collector)
9. agents/cleaner.py
10. agents/weigher.py
11. storage/sqlite_store.py
12. storage/obsidian_writer.py
```

### 5.3 P2 - 月内生成

```
13. agents/reasoner.py
14. agents/devil_advocate.py
15. agents/predictor.py
16. workflow/orchestrator.py
17. workflow/signal_router.py
18. workflow/scheduler.py
19. dashboard/web_api.py
20. dashboard/notifier.py
```

---

## 六、Claude 审核重点 checklist

```
每次审核必查 (10 项):

1. □ 类型注解完整（无 bare dict / Any）
2. □ 函数有 docstring
3. □ 没有 hardcoded 密钥/URL/邮箱
4. □ 错误处理覆盖所有 try/except 路径
5. □ 日志使用 StructuredLogger
6. □ API 调用有 timeout + retry
7. □ 输出符合 Evidence schema
8. □ 单元测试存在且可运行
9. □ 没有不需要的 LLM 调用
10. □ 函数/类不超过 100 行（拆得过细）

只在 Reasoner / Devil's Advocate 审核时加查:
11. □ prompt template 清晰且有 examples
12. □ 输出 schema 与数据契约一致
13. □ 模型选择符合能力矩阵
14. □ 置信度评分逻辑正确
15. □ 反证搜索逻辑完整
```

---

## 七、迭代改进

### 7.1 持续改进信号

```
每月底评估:
  1. 上月 DeepSeek 生成代码的"一次通过率"
     (无 critical issues 的比例)
  2. Claude 审核的"重复出现"问题
     (同类问题反复出现 → 优化 prompt)
  3. 测试覆盖率趋势
  4. 生产事故归因
```

### 7.2 prompt 优化策略

```
观察以下信号并优化:

信号 A: DeepSeek 经常遗漏 X
  → 在 prompt 中加显式条款

信号 B: Claude 审核总挑同一个问题
  → 在 prompt 中预包含该问题的解决方案

信号 C: 某些任务 DeepSeek 完全跑偏
  → 拆分为更小的子任务
```

---

## 八、版本历史

- **v1.0** (2026-06-30): 初版
  - 定义 DeepSeek → Claude → 测试 三阶段流程
  - 首批 20 个生成任务清单
  - 失败处理与重试规则
  - Claude 审核 15 项 checklist