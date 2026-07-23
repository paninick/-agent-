# M0 详细设计文档

> **⚠️ DEPRECATED · 2026-07-01**
>
> 本文档**作废**。
>
> **原因**：
> - 00c_RESTART_PLAN_v3.md §一 第 5 行明确写："❌ 删 04b_M0_DESIGN → ✅ 归档"
> - 00c_RESTART_PLAN_v3.md §一 第 21 行重复确认"4 授权源 + 4 P0 MCP 是真实 P0 缺口"
> - 实际 v3 实现的 M0 由 4 个文件组成：`src/intelligence/{sourceRegistry,evidenceLedger,brandChainGate,coverage,visualizationReadiness,officialApis,materialReconciliation}.ts`
> - 本文档描述的 FastAPI + Pydantic + asyncio.Queue + 7 agent handoff 等栈**从未实施到代码**（实际栈是 Express + Zod + OpenAI Agents SDK）
> - 本文档 §二 Context Store Pydantic Schema 与代码 `src/intelligence/types.ts` 的 Zod + TypeScript 接口在概念上对应，但**字段命名与默认值有差异**
>
> **如需 v3 M0 实际结构**，请直接阅读：
> - `src/intelligence/types.ts` — 真实接口定义（EvidenceEntry / IntelligenceSource / SourceRegistry）
> - `src/intelligence/evidenceLedger.ts` — 真实评分与硬结论门槛（与本节 §决策门槛对应）
> - `src/intelligence/brandChainGate.ts` — 真实 6 账本门禁
> - `src/intelligence/coverage.ts` — 真实 7 维度覆盖
> - `src/intelligence/visualizationReadiness.ts` — 真实 5 门槛
> - `scripts/verify-intelligence-sources.ts` — 真实跑通的入口
>
> **保留本节作为 v2 历史归档**，因为它仍记录了 v2 阶段对 FastAPI/Redis/异步队列的设计思考，这些原则在 v3 TS 单进程同步结构中以简化形式保留（如 `fetchWithRetry 2 次` 替代了 Celery 重试）。

---

> **更新日期**：2026-06-30
> **状态**：设计稿，待用户审核
> **配套**：v2.2 重启规划 §四 / §七.3
> **目标**：4 个支撑模块（Context Store / Agent Scheduler / Token Counter / Event Stream）实现前的契约与流程

---

## 一、模块总览

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (4 面板)                        │
│             WebSocket 订阅 ←─────── push ───────                │
└─────────────────────────┬───────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────┐
│                    Event Stream (app/ops/events.py)            │
│   - 异步 pub/sub                                                │
│   - WebSocket 推送 (关键事件即时, 普通事件 500ms 聚合)            │
└──┬─────────────┬──────────────┬──────────────┬─────────────────┘
   │             │              │              │
   ▼             ▼              ▼              ▼
┌────────┐  ┌──────────┐  ┌────────────┐  ┌────────────────────┐
│Context │  │Scheduler │  │Token       │  │Agents              │
│Store   │  │(状态机)  │  │Counter     │  │(M1, 7 个)         │
└────────┘  └──────────┘  └────────────┘  └────────────────────┘
   │             │              │              │
   └─────────────┴──────────────┴──────────────┘
                  │
                  ▼
              SQLite
```

---

## 二、Context Store (Pydantic Schema)

### 2.1 设计原则

```
- Evidence / Decision / Action 用 Pydantic v2 + discriminated_union 表达
- Protocol + Union 预留多行业扩展点 (Knit-only v0, 未来加 Knit | Manufacturing | ...)
- 每条 Evidence 自带 raw_hash → 可重放验证
- 所有时间戳 UTC ISO 8601
```

### 2.2 Evidence schema (v0.1)

```python
# app/core/evidence.py
from __future__ import annotations
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional
from uuid import UUID, uuid4
from pydantic import BaseModel, Field, ConfigDict


class SourceGrade(str, Enum):
    S = "S"        # 政府/交易所原始数据 (default weight 1.0)
    A_PLUS = "A+"  # 上市公司审计披露 (0.9)
    A = "A"        # 行业协会/权威机构 (0.75)
    B_PLUS = "B+"  # 知名券商/咨询研报 (0.6)
    B = "B"        # 行业媒体 (0.4)
    C = "C"        # 未验证自媒体 (0.2, 不可单独引用)


class SourceTier(str, Enum):
    """Data security tier (06_USER_REQUIREMENTS §3.2)."""
    L0_PUBLIC = "L0"
    L1_INTERNAL = "L1"
    L2_COMMERCIAL = "L2"
    L3_CONFIDENTIAL = "L3"


class EntityType(str, Enum):
    """v0: knit-only. Future: discriminated_union for multi-industry."""
    BRAND = "brand"
    FACTORY = "factory"
    MATERIAL = "material"
    COUNTRY = "country"
    PORT = "port"
    PRODUCT = "product"
    SEASONALITY = "seasonality"


class Entity(BaseModel):
    """Subject of an evidence point. Protocol + Union shape."""
    model_config = ConfigDict(frozen=True)
    id: str                         # canonical entity id, e.g. "brand:uniqlo"
    type: EntityType
    name: str
    attributes: Dict[str, Any] = Field(default_factory=dict)


class Evidence(BaseModel):
    """One piece of evidence collected from a source."""
    id: UUID = Field(default_factory=uuid4)
    source_id: str                  # e.g. "un-comtrade", "fred", "massive"
    source_grade: SourceGrade
    entity: Entity
    fetched_at: datetime            # UTC
    period: str                     # e.g. "2026Q2" or "2026-06-30"
    raw_data: Dict[str, Any]        # full API response
    raw_hash: str                   # sha256 of canonical JSON(raw_data)
    extracted_fields: Dict[str, Any]
    completeness: float = Field(ge=0.0, le=1.0)
    missing_fields: List[str] = Field(default_factory=list)
    status: str                     # "success" | "partial" | "failed"
    ttl_seconds: int = 86400        # 1 day default
    tier: SourceTier = SourceTier.L0_PUBLIC
    error: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
```

### 2.3 Decision / Action schema (v0.1)

```python
# app/core/decision.py
from __future__ import annotations
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Literal, Optional
from uuid import UUID, uuid4
from pydantic import BaseModel, Field, ConfigDict

from app.core.evidence import Evidence


class Verdict(str, Enum):
    PASS = "PASS"
    WARN = "WARN"
    FAIL = "FAIL"
    ESCALATE = "ESCALATE"


class CausalPath(BaseModel):
    """One of N independent reasoning paths to the same conclusion."""
    model_config = ConfigDict(frozen=True)
    path_id: str
    description: str                # e.g. "cotton -> CN HS60 -> VN HS60 -> VN HS61"
    evidence_ids: List[UUID]        # links back to Evidence.id
    strength: float                 # 0-1, how strong this path is


class Decision(BaseModel):
    """A reasoned conclusion + adversarial verification + scenario prediction."""
    id: UUID = Field(default_factory=uuid4)
    trigger_id: str                 # e.g. "cotton_spike_2026q2"
    created_at: datetime
    statement: str                  # one-sentence conclusion
    confidence: float = Field(ge=0.0, le=1.0)
    causal_paths: List[CausalPath]
    primary_evidence_ids: List[UUID]
    counter_evidence: List[str]     # free text counter-findings
    data_gaps: List[str]            # explicit [DATA_GAP] markers
    feedback_loops: List[str] = Field(default_factory=list)
    boundary_conditions: List[str] = Field(default_factory=list)
    verdict: Verdict
    verdict_notes: Optional[str] = None
    scenarios: List["Scenario"] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class Scenario(BaseModel):
    """One of 3+ scenarios from the Predictor agent."""
    name: Literal["optimistic", "baseline", "pessimistic"]
    probability: float = Field(ge=0.0, le=1.0)
    description: str
    timeline_days: int
    invalidation_triggers: List[str]
    historical_analogue: Optional[str] = None


class ActionType(str, Enum):
    ADJUST_QUOTE = "adjust_quote"        # 调报价 X%
    TRIGGER_PURCHASE = "trigger_purchase"  # 触发补单
    FOLLOW_UP_CLIENT = "follow_up_client"  # 客户跟进
    RISK_ALERT = "risk_alert"            # 风险预警
    OPPORTUNITY = "opportunity"          # 机会识别
    NO_ACTION = "no_action"              # 静默


class Action(BaseModel):
    """Actionable suggestion derived from a Decision."""
    id: UUID = Field(default_factory=uuid4)
    decision_id: UUID
    type: ActionType
    summary: str
    impact: str                       # e.g. "estimated ¥50K margin protection"
    urgency: Literal["low", "medium", "high", "critical"]
    requires_approval: bool = True
    payload: Dict[str, Any]           # type-specific payload
    created_at: datetime
    dispatched_to: List[str] = Field(default_factory=list)  # channel ids
```

### 2.4 SQLite schema (DDL)

```sql
-- app/db/schema.sql
CREATE TABLE IF NOT EXISTS evidence (
    id TEXT PRIMARY KEY,              -- UUID
    source_id TEXT NOT NULL,
    source_grade TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    fetched_at TEXT NOT NULL,
    period TEXT NOT NULL,
    raw_data TEXT NOT NULL,           -- JSON
    raw_hash TEXT NOT NULL,
    extracted_fields TEXT NOT NULL,   -- JSON
    completeness REAL NOT NULL,
    missing_fields TEXT NOT NULL,     -- JSON array
    status TEXT NOT NULL,
    tier TEXT NOT NULL,
    error TEXT,
    metadata TEXT NOT NULL            -- JSON
);
CREATE INDEX IF NOT EXISTS idx_evidence_entity ON evidence(entity_id);
CREATE INDEX IF NOT EXISTS idx_evidence_source ON evidence(source_id);
CREATE INDEX IF NOT EXISTS idx_evidence_fetched ON evidence(fetched_at);

CREATE TABLE IF NOT EXISTS decision (
    id TEXT PRIMARY KEY,
    trigger_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    statement TEXT NOT NULL,
    confidence REAL NOT NULL,
    causal_paths TEXT NOT NULL,       -- JSON
    primary_evidence_ids TEXT NOT NULL, -- JSON array
    counter_evidence TEXT NOT NULL,   -- JSON
    data_gaps TEXT NOT NULL,
    feedback_loops TEXT NOT NULL,
    boundary_conditions TEXT NOT NULL,
    verdict TEXT NOT NULL,
    verdict_notes TEXT,
    scenarios TEXT NOT NULL,
    metadata TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_decision_created ON decision(created_at);

CREATE TABLE IF NOT EXISTS action (
    id TEXT PRIMARY KEY,
    decision_id TEXT NOT NULL,
    type TEXT NOT NULL,
    summary TEXT NOT NULL,
    impact TEXT NOT NULL,
    urgency TEXT NOT NULL,
    requires_approval INTEGER NOT NULL,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL,
    dispatched_to TEXT NOT NULL,
    FOREIGN KEY (decision_id) REFERENCES decision(id)
);

CREATE TABLE IF NOT EXISTS audit_trail (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    decision_id TEXT NOT NULL,
    event_type TEXT NOT NULL,         -- decision.made, action.dispatched, action.approved
    actor TEXT NOT NULL,              -- "ai" | "user:<id>"
    payload TEXT NOT NULL,            -- JSON
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_decision ON audit_trail(decision_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_trail(created_at);
```

---

## 三、Agent Scheduler

### 3.1 状态机

```
                ┌─────────────────────────────────────────┐
                │                                         │
                ▼                                         │
          ┌──────────┐  start()   ┌──────────┐  done   ┌─────────┐
   enqueue│ PENDING  │ ─────────→ │ RUNNING  │ ──────→ │ SUCCESS │
   ─────→ │          │            │          │         └─────────┘
          └──────────┘            └────┬─────┘
              ▲                        │ raise / err
              │ retry                  ▼
              │                  ┌─────────┐
              └──────────────────│ FAILED  │
                                 └─────────┘
                                 
   cancel(PENDING|RUNNING) → CANCELLED
   timeout(RUNNING > budget) → TIMEOUT
```

### 3.2 API 契约

```python
# app/ops/scheduler.py
from __future__ import annotations
import asyncio
from datetime import datetime
from typing import Any, Awaitable, Callable, Dict, List, Optional
from uuid import UUID, uuid4

from app.core.types import AgentRole, RunStatus


class AgentRun(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    role: AgentRole
    status: RunStatus = RunStatus.PENDING
    payload: Dict[str, Any]         # role-specific input
    enqueued_at: datetime
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    error: Optional[str] = None
    parent_run_id: Optional[UUID] = None  # for handoff chain
    step_history: List[Dict[str, Any]] = Field(default_factory=list)


class AgentScheduler:
    """MVP: in-memory queue + asyncio. Redis for production."""
    
    def __init__(self, max_concurrent: int = 4):
        self.max_concurrent = max_concurrent
        self._queue: asyncio.Queue[AgentRun] = asyncio.Queue()
        self._runs: Dict[UUID, AgentRun] = {}
        self._semaphore = asyncio.Semaphore(max_concurrent)
        self._subscribers: List[Callable[[AgentRun], Awaitable[None]]] = []
    
    async def enqueue(
        self, role: AgentRole, payload: dict, parent_run_id: Optional[UUID] = None
    ) -> AgentRun:
        run = AgentRun(
            role=role, payload=payload, parent_run_id=parent_run_id,
            enqueued_at=datetime.utcnow(),
        )
        self._runs[run.id] = run
        await self._queue.put(run)
        await self._notify(run)
        return run
    
    async def cancel(self, run_id: UUID) -> bool: ...
    def list_runs(self, status: Optional[RunStatus] = None) -> List[AgentRun]: ...
    def get_run(self, run_id: UUID) -> Optional[AgentRun]: ...
    def subscribe(self, callback: Callable[[AgentRun], Awaitable[None]]) -> None: ...
```

### 3.3 REST 端点

```
GET  /ops/agents                       list runs (filter by status)
GET  /ops/agents/{id}                  detail + step_history
POST /ops/agents/{id}/cancel           cancel
POST /ops/agents/run                   enqueue (used by triggers M3)
```

---

## 四、Token Counter

### 4.1 阈值规则（v0.1，与决策表一致）

```python
# app/ops/token_budget.py
from enum import Enum

class TokenState(str, Enum):
    NORMAL = "normal"
    WARNING = "warning"      # single call cost >= ¥1.5
    DEGRADED = "degraded"    # single call cost >= ¥2.0 (auto-fallback to cheap model)
    BLOCKED = "blocked"      # 5h window exceeded (kill switch)


# Pricing (approximate, update quarterly)
PRICE_TABLE = {
    "claude-opus-4-8":      {"input": 75.0, "output": 300.0},   # ¥ / M tokens
    "claude-sonnet-4-6":    {"input": 22.5, "output": 90.0},
    "deepseek-v4-pro":      {"input": 4.0,  "output": 12.0},
    "deepseek-v4-flash":    {"input": 0.4,  "output": 1.0},     # 降级目标
    "doubao-seed-2-pro":    {"input": 8.0,  "output": 12.0},
    "glm-5":                {"input": 6.0,  "output": 12.0},
}

FALLBACK_MODEL = "deepseek-v4-flash"   # 降级时统一目标
```

### 4.2 状态机

```
         ┌──────────┐  cost >= 1.5  ┌──────────┐
   start │ NORMAL   │ ─────────────→│ WARNING  │
   ─────→│          │               │          │
         └──────────┘               └─────┬────┘
              ▲                          │ cost >= 2.0
              │ cost < 1.5              ▼
              │                    ┌──────────┐
              └────────────────────│ DEGRADED │
                                   │ model =  │
                                   │ fallback │
                                   └──────────┘
                                   
   5h_window_used >= budget → BLOCKED (kill switch)
```

### 4.3 API 契约

```python
# app/ops/token_budget.py
class TokenUsage(BaseModel):
    timestamp: datetime
    agent_role: AgentRole
    model: str
    input_tokens: int
    output_tokens: int
    cost_cny: float
    state: TokenState
    request_id: Optional[str] = None


class TokenCounter:
    """Records every LLM call, computes cost, emits budget events."""
    
    async def record(
        self,
        agent_role: AgentRole,
        model: str,
        input_tokens: int,
        output_tokens: int,
        request_id: Optional[str] = None,
    ) -> TokenUsage:
        cost = self._compute_cost(model, input_tokens, output_tokens)
        state = self._classify(cost)
        usage = TokenUsage(...)
        self._save(usage)
        await self._emit_event(usage)
        return usage
    
    def should_degrade(self, usage: TokenUsage) -> bool:
        return usage.state == TokenState.DEGRADED
    
    def should_block(self) -> bool:
        """Kill switch: 5h window used > 80%."""
        return self._window_used_cny() > settings.token_5h_budget_cny * 0.8
```

---

## 五、Event Stream

### 5.1 事件类型

```python
# app/ops/events.py
from enum import Enum

class EventType(str, Enum):
    # Agent lifecycle
    AGENT_QUEUED = "agent.queued"
    AGENT_STARTED = "agent.started"
    AGENT_STEP = "agent.step"                 # 内部 step 进度
    AGENT_COMPLETED = "agent.completed"
    AGENT_FAILED = "agent.failed"
    AGENT_CANCELLED = "agent.cancelled"
    
    # Token / budget
    TOKEN_USED = "token.used"
    TOKEN_WARNING = "token.warning"
    TOKEN_DEGRADED = "token.degraded"
    TOKEN_BLOCKED = "token.blocked"
    
    # Evidence / Decision / Action
    EVIDENCE_COLLECTED = "evidence.collected"
    EVIDENCE_FAILED = "evidence.failed"
    DECISION_MADE = "decision.made"
    VERDICT_RENDERED = "verdict.rendered"
    SCENARIO_PREDICTED = "scenario.predicted"
    ACTION_PROPOSED = "action.proposed"
    ACTION_DISPATCHED = "action.dispatched"
    
    # Trigger (M3)
    TRIGGER_FIRED = "trigger.fired"
```

### 5.2 推送协议

```python
# app/ops/events.py
class Event(BaseModel):
    """Single event pushed to subscribers (WS or in-process)."""
    id: UUID = Field(default_factory=uuid4)
    type: EventType
    timestamp: datetime
    run_id: Optional[UUID] = None
    payload: Dict[str, Any]
    severity: Literal["info", "warn", "error"] = "info"


class EventBus:
    """Async pub/sub. WebSocket subscribers + internal listeners."""
    
    def __init__(self):
        self._subscribers: List[Callable[[Event], Awaitable[None]]] = []
        self._batch_ms: int = 500  # non-critical events batched
        self._critical_types = {EventType.AGENT_FAILED, EventType.TOKEN_DEGRADED, EventType.TOKEN_BLOCKED}
    
    def subscribe(self, callback: Callable[[Event], Awaitable[None]]) -> None: ...
    async def emit(self, event: Event) -> None:
        """Critical → push immediately. Others → batch every 500ms."""
        if event.type in self._critical_types:
            await self._broadcast([event])
        else:
            await self._buffer_or_broadcast(event)
    
    async def _broadcast(self, events: List[Event]) -> None:
        await asyncio.gather(*[cb(e) for cb in self._subscribers for e in events],
                             return_exceptions=True)
```

### 5.3 WebSocket 端点

```
WS /ws/events
  on connect: send backlog of last 100 events (cold start)
  on message "subscribe {event_types[]}": filter incoming
  on message "ping": reply "pong"
  on disconnect: remove subscriber

Server pushes JSON:
{
  "id": "uuid",
  "type": "agent.step",
  "timestamp": "2026-06-30T14:23:17Z",
  "run_id": "...",
  "payload": { "step": 3, "total": 5, "name": "causal_paths" },
  "severity": "info"
}
```

---

## 六、模块依赖与启动顺序

```
启动序列:
1. configure_logging()        ──→ 启动日志
2. Settings()                  ──→ 加载 env
3. DBEngine.init()             ──→ 建表
4. EventBus()                  ──→ 空总线
5. TokenCounter()              ──→ 订阅 EventBus (监听 token.*)
6. AgentScheduler()            ──→ 订阅 EventBus (监听 agent.*)
7. FastAPI app + WebSocket     ──→ 挂载 EventBus.subscribe(broadcast_to_ws)

依赖:
  EventBus 不依赖其他
  TokenCounter 依赖 EventBus
  AgentScheduler 依赖 EventBus + TokenCounter (agent 跑前查预算)
  Context Store 独立
```

---

## 七、不在 M0 范围

```
- 任何 LLM 真实调用 (M1 才接)
- 数据源真实拉取 (M1 Collector 才接)
- 决策 / 推理逻辑 (M1 Reasoner + Devil 才接)
- 触发规则 (M3)
- 多租户 (M4)
- 一键部署 (M4)
```

---

## 八、待用户审核的决策

| # | 项 | 选择 | 风险 |
|---|---|---|---|
| 1 | 队列后端 | **in-memory (asyncio.Queue)** MVP | 进程重启 = 任务丢失；生产换 Redis |
| 2 | 事件批处理 | **500ms 窗口** | 100ms 事件可感知延迟；可调 |
| 3 | Token 计量 | **tiktoken + 价格表近似** | 与真实计费 ±5%；可后续校准 |
| 4 | SQLite vs Postgres | **SQLite MVP** | 单写并发，生产需迁；schema 一致可平滑 |
| 5 | Agent 最大并发 | **4** | 单机 asyncio 跑得动；多机需重新设计 |

---

## 九、版本历史

- **v0.1** (2026-06-30 晚): 初版设计，待用户审核