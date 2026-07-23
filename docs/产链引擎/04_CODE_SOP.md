# 代码 SOP (编程操作手册)

> **⚠️ DEPRECATED · 2026-07-01**
> 本文档**作废**。
>
> **原因**：v3 实际栈与本节描述不一致：
> - 本节 §一目录结构是 Python (`probes/` `adapters/` `core/` `agents/`) + `D:\ERP\intelligence\`
> - v3 实际是 TypeScript + Express + Zod + OpenAI Agents SDK，代码在 `D:\Documents\New project 2\src\intelligence\`
> - 本节 §三 Probe / Adapter / Reasoner 模板用 Python（httpx + tenacity + dataclass）
> - v3 实际用 TS 原生 `fetch` + Zod schema + `evidenceLedger.ts`
> - 本节 §四 部署用 Python 任务计划 + AutoClaw
> - v3 实际用 `npm run verify:intelligence` + bounded artifact (`outputs/intelligence/verification-latest.json`)
>
> **如需代码侧 SOP**，请直接阅读：
> - `src/intelligence/sourceRegistry.ts` — Zod schema + 校验规则
> - `src/intelligence/officialApis.ts` — 9 个真实 fetch adapter 模板（fetchWithRetry 2 次 + 750ms backoff）
> - `src/intelligence/evidenceLedger.ts` — 证据写入 + 评分 + 硬结论门槛
> - `scripts/verify-intelligence-sources.ts` — 真实跑通的 9 探针 + GAP 试点 + counter-evidence 案例
>
> **保留本节作为历史参考**，因为它仍记录了 v0-v2 Python 栈的设计意图（不污染、不硬编码、不串台），这些原则仍适用于 v3 TS 栈。

---

## 一、目录结构（v0-v2 Python 栈 / 已作废）

```
D:\ERP\intelligence\          # 主项目目录
├── probes\                  # 探针脚本 (Cron 任务)
│   ├── cotton_probe.py
│   ├── fx_probe.py
│   ├── custom_probe.py
│   └── brand_finance_probe.py
├── adapters\                # API 适配器
│   ├── comtrade_adapter.py
│   ├── fred_adapter.py
│   ├── massive_adapter.py
│   ├── sec_edgar_adapter.py
│   └── jpn_customs_adapter.py
├── parsers\                 # 数据解析器
│   ├── excel_parser.py
│   ├── html_scraper.py
│   └── pdf_extractor.py
├── core\                    # 核心库
│   ├── evidence.py          # 证据条目 schema
│   ├── weight.py            # 权重计算
│   ├── reasoning.py         # 因果推导
│   └── verification.py      # 验证逻辑
├── agents\                  # Agent 实现
│   ├── collector.py
│   ├── cleaner.py
│   ├── weigher.py
│   ├── reasoner.py
│   ├── devil.py
│   ├── predictor.py
│   └── writer.py
├── workflow\                # 编排
│   ├── orchestrator.py     # 主流程
│   ├── signal_router.py     # 信号路由
│   └── scheduler.py         # 定时调度
├── storage\                 # 存储
│   ├── sqlite_store.py      # 本地权威源
│   ├── obsidian_writer.py   # Obsidian 同步
│   ├── ark_memory.py        # Ark Memory
│   └── vector_store.py      # 向量库
├── dashboard\               # 前端展示
│   ├── web_api.py
│   └── notifier.py          # 飞书/微信告警
├── tests\                   # 测试
│   ├── test_comtrade.py
│   ├── test_fred.py
│   └── fixtures\
├── config\                  # 配置
│   ├── .env.local           # API key (不提交)
│   ├── settings.yaml
│   └── triggers.yaml
├── logs\                    # 日志
└── outputs\                 # 输出
    └── verification-latest.json
```

---

## 二、Python 代码规范

### 2.1 基础规范

```
- Python 3.11+
- 必须使用类型注解
- 模块顶部必须有 docstring (强制要求)
- 命名规范:
  - 变量/函数: snake_case
  - 类: PascalCase
  - 常量: UPPER_SNAKE_CASE
  - 私有: _leading_underscore
```

### 2.2 证据条目结构

```python
@dataclass
class Evidence:
    evidence_id: str                    # uuid4
    source_id: str                       # un_comtrade, fred, etc.
    source_grade: str                    # S, A+, A, B+, B, C
    entity_id: str                       # canonical entity name
    fetched_at: datetime                 # 拉取时间 UTC
    raw_data: dict                       # 原始响应
    raw_hash: str                        # sha256 of raw_data
    extracted_fields: dict              # 结构化字段
    completeness: float                  # 0-1
    missing_fields: List[str] = field(default_factory=list)
    status: str                          # success | partial | failed
    ttl_seconds: int = 86400             # 1 天默认
    data_grade: str = L0                 # L0/L1/L2/L3 安全等级
    error: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
```

### 2.3 配置管理

```
config/.env.local (不提交):
ARK_API_KEY=xxx
UN_COMTRADE_KEY=xxx
FRED_API_KEY=xxx
MASSIVE_API_KEY=xxx
FEISHU_WEBHOOK_URL=xxx

config/settings.yaml:
budget:
  monthly_cny: 900
  warning_pct: 50
  downgrade_pct: 75
  hard_stop_pct: 100
```

### 2.4 日志规范 (结构化 JSONL)

```python
import logging
import json
from datetime import datetime

class StructuredLogger:
    def __init__(self, name, log_file):
        self.logger = logging.getLogger(name)
        handler = logging.FileHandler(log_file)
        self.logger.addHandler(handler)
        self.logger.setLevel(logging.INFO)

    def log(self, level, event, **kwargs):
        record = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "level": level,
            "event": event,
            **kwargs
        }
        self.logger.info(json.dumps(record, ensure_ascii=False))
```

### 2.5 错误处理 (重试 + 超时)

```python
import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=10))
def _request(method, url, **kwargs):
    r = httpx.request(method, url, timeout=30, **kwargs)
    r.raise_for_status()
    return r.json()
```

---

## 三、关键脚本模板

### 3.1 Probe 模板 (cron 探针)

```python
#!/usr/bin/env python3
"""
cotton_probe.py
Cron: 0 9 * * 1-5   # 工作日 09:00
功能: 检查 FRED 棉花价格指数, 超阈值生成信号
"""
import os
import json
import sys
import uuid
import hashlib
from pathlib import Path
from datetime import datetime
from dataclasses import asdict

sys.path.insert(0, str(Path(__file__).parent.parent))
from core.evidence import Evidence
from adapters.fred_adapter import FredAdapter
from core.weight import compute_weight
from core.logger import StructuredLogger

logger = StructuredLogger("cotton_probe", "logs/cotton_probe.jsonl")
THRESHOLD = 3.0  # 3% 阈值

def main():
    adapter = FredAdapter(api_key=os.getenv("FRED_API_KEY"))
    raw = adapter.fetch_series("PCOTTINDUSDM", days=30)

    if not raw or not raw.get("observations"):
        logger.log("error", "fetch_failed", series="PCOTTINDUSDM")
        sys.exit(1)

    latest = raw["observations"][-1]
    week_ago = raw["observations"][-7] if len(raw["observations"]) >= 7 else raw["observations"][0]

    current = float(latest["value"])
    previous = float(week_ago["value"])
    change_pct = (current - previous) / previous * 100

    evidence = Evidence(
        evidence_id=f"cotton_{latest['date'].replace('-','')}",
        source_id="fred_cottindex",
        source_grade="S",
        entity_id="cotton_futures_global",
        fetched_at=datetime.utcnow(),
        raw_data=raw,
        raw_hash=hashlib.sha256(json.dumps(raw, sort_keys=True).encode()).hexdigest(),
        extracted_fields={
            "price_index": current,
            "change_pct_week": round(change_pct, 2),
            "date": latest["date"]
        },
        completeness=1.0,
        status="success"
    )

    if abs(change_pct) >= THRESHOLD:
        signal = {
            "signal_id": str(uuid.uuid4()),
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "type": "price_threshold",
            "entity": "cotton_futures",
            "current_value": current,
            "previous_value": previous,
            "change_pct": round(change_pct, 2),
            "evidence_id": evidence.evidence_id,
            "urgency": "medium" if abs(change_pct) < 5 else "high",
            "suggested_action": "evaluate_impact_on_quotes"
        }

        signal_path = Path("signals/pending/cotton_price.json")
        signal_path.parent.mkdir(parents=True, exist_ok=True)
        signal_path.write_text(json.dumps(signal, indent=2))

        logger.log("info", "signal_generated",
            signal_id=signal["signal_id"], change_pct=round(change_pct, 2))
    else:
        logger.log("info", "no_signal",
            current_value=current, change_pct=round(change_pct, 2))

if __name__ == "__main__":
    main()
```

### 3.2 Adapter 模板

```python
import httpx
import os
from typing import List, Dict, Optional
from tenacity import retry, stop_after_attempt, wait_exponential

@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=10))
def _request(method, url, **kwargs):
    r = httpx.request(method, url, timeout=30, **kwargs)
    r.raise_for_status()
    return r.json()


class ComtradeAdapter:
    def __init__(self, api_key: str = None):
        self.api_key = api_key or os.getenv("UN_COMTRADE_KEY")
        if not self.api_key:
            raise ValueError("UN_COMTRADE_KEY required")
        self.base_url = "https://comtradedeveloper.un.org/api"

    def get_final(self, reporter, period, cmd_code, flow="M",
                  partner=None):
        params = {
            "subscription_key": self.api_key,
            "typeCode": "C",
            "freqCode": "A",
            "clCode": "HS",
            "period": str(period),
            "reporterCode": str(reporter),
            "cmdCode": str(cmd_code),
            "flowCode": flow,
            "partnerCode": str(partner) if partner else None,
            "maxRecords": 250000,
            "format_output": "JSON",
            "breakdownMode": "classic",
            "includeDesc": True
        }
        params = {k: v for k, v in params.items() if v is not None}
        data = _request("GET", f"{self.base_url}/getFinalData/C/A/HS", params=params)
        return data if isinstance(data, list) else data.get("data", [])


class FredAdapter:
    def __init__(self, api_key: str = None):
        self.api_key = api_key or os.getenv("FRED_API_KEY")
        if not self.api_key:
            raise ValueError("FRED_API_KEY required")
        self.base_url = "https://api.stlouisfed.org/fred"

    def fetch_series(self, series_id: str, days: int = 30):
        from datetime import date, timedelta
        end = date.today()
        start = end - timedelta(days=days)
        params = {
            "series_id": series_id,
            "api_key": self.api_key,
            "file_type": "json",
            "observation_start": start.isoformat(),
            "observation_end": end.isoformat()
        }
        data = _request("GET", f"{self.base_url}/series/observations", params=params)
        return data
```

### 3.3 Reasoner 模板

```python
class Reasoner:
    def __init__(self, model="claude-opus-4-7"):
        self.model = model
        self.dag = self._load_dag()

    def reason(self, question, evidence):
        relevant = self._select_relevant(question, evidence)
        if not relevant:
            return None

        prompt = self._build_prompt(question, relevant)
        response = self._call_llm(prompt)
        conclusion = self._parse_conclusion(response)

        # 多路径验证
        paths = conclusion.get("causal_paths", [])
        if len(paths) >= 2:
            conclusion["path_independence"] = self._check_independence(paths)

        # 反证搜索
        if not conclusion.get("counter_evidence"):
            conclusion["counter_evidence"] = self._search_counter(question, relevant)

        # 调整置信度
        conclusion["confidence"] = self._adjust_confidence(conclusion)

        return conclusion

    def _build_prompt(self, question, evidence):
        return f"""
## 分析问题
{question}

## 可用证据 (按因果时序排列)
{self._format_evidence(evidence)}

## 输出格式 (严格 JSON)
{{
  "statement": "一句话结论",
  "confidence": 0.0-1.0,
  "causal_paths": [...],
  "counter_evidence": [...],
  "data_gaps": [...],
  "feedback_loops": [...],
  "boundary_conditions": [...]
}}

## 严禁
- 不要给出没证据支持的数字
- 不要把估算说成已知
- 不要遗漏反证搜索
"""
```

---

## 四、自动化部署

### 4.1 Windows 任务计划

```powershell
$action = New-ScheduledTaskAction `
    -Execute "C:\Users\91306\AppData\Local\Programs\Python\Python311\python.exe" `
    -Argument "D:\ERP\intelligence\probes\cotton_probe.py" `
    -WorkingDirectory "D:\ERP\intelligence"

$trigger = New-ScheduledTaskTrigger -Daily -At "09:00"
Register-ScheduledTask -TaskName "Cotton_Daily_Probe" -Action $action -Trigger $trigger
```

### 4.2 GitHub Actions

```yaml
# .github/workflows/probe.yml
name: Daily Probe
on:
  schedule:
    - cron: '0 1 * * 1-5'  # 工作日 09:00 北京时间
  workflow_dispatch:
jobs:
  probe:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: {python-version: '3.11'}
      - run: pip install -r requirements.txt
      - name: Run probes
        env:
          FRED_API_KEY: ${{ secrets.FRED_API_KEY }}
          UN_COMTRADE_KEY: ${{ secrets.UN_COMTRADE_KEY }}
        run: python probes/run_all.py
```

### 4.3 AutoClaw Docker 部署

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["python", "-m", "scheduler"]
```

---

## 五、代码审查 checklist

每段代码合并前必须检查：

```
功能正确性
  [ ] 处理了空数据/超时/异常
  [ ] 单元测试覆盖关键路径
  [ ] 反向用例已测试

数据完整性
  [ ] 数据点声明 source_id
  [ ] 数据点声明 timestamp
  [ ] 包含完整性评分

性能
  [ ] 有 timeout 设置
  [ ] 使用 connection pooling
  [ ] 大批量数据 streaming

可维护性
  [ ] 函数/类有 docstring
  [ ] 复杂逻辑有注释
  [ ] 关键参数可配置

安全
  [ ] API key 从 env var 读取
  [ ] 敏感字段标记 data_grade
  [ ] 错误日志不暴露密钥
```

---

## 六、DeepSeek 自动化生成流程

### 6.1 生成 Prompt 模板

```
# 任务
基于以下 SOP 生成 Python 代码：

## SOP 摘要
{paste from 03_AGENT_SOP.md}

## 数据契约
{paste from data contract}

## 现有代码参考
{existing adapter or probe code}

## 约束
- Python 3.11+
- 必须有 type hints
- 必须有 docstring
- 必须有错误处理和重试
- 必须有单元测试
- API key 从 env var 读取
- 输出符合 evidence schema

## 验收标准
- 运行 pytest tests/test_xxx.py 通过
- 实测 API 调用返回有效数据
- 代码符合 black, mypy linting
```

### 6.2 Claude 审核 checklist

```
DeepSeek 生成的代码需要人工审核:
  [ ] 处理了所有 SOP 步骤
  [ ] 数据契约一致
  [ ] 错误处理完整
  [ ] 无不必要的 LLM 调用
  [ ] 无硬编码密钥
  [ ] 能通过测试
```

### 6.3 失败重试规则

```
第一次失败 → 检查测试错误，给 DeepSeek 具体反馈，不要简单重跑
第二次失败 → Claude Code 介入，手动修复关键问题
第三次失败 → 升级人工
```