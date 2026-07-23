# Agent Habitat 信息架构层设计规格

**日期**: 2026-07-12
**范围**: 用户 10 点设计审计反馈中的 #9 视觉层级精简 + #4 24 小时生活状态
**状态**: 已批准（2026-07-12）→ 过渡到 writing-plans
**前置完成**: P1 TaskCore 任务依赖树 / P2 DecisionCard 互动个人化 / P3 MemoryPanel 分区展示

---

## 1. 问题陈述

当前 HabitatWorkspace 首屏存在视觉层级拥挤问题：中心任务、Agent 角色、说明文字、审批卡、目标轨道、时间线和成本信息同时争夺注意力。用户无法一眼识别"Agent 现在在做什么"和"什么需要我回应"。

同时，目标轨道（GoalTrack）仅以扁平列表呈现 5 种 trackKind，无法表达 Agent 的注意力分配比例，用户不知道 Agent 的资源和注意力现在分配在哪里。

**本规格解决两个问题**：
- #9 首屏精简为 3 个视觉焦点，其余移入详情层
- #4 用轻量注意力条表达 24 小时生活状态

---

## 2. 设计决策（已与用户确认）

| # | 决策 | 选择 |
|---|------|------|
| 1 | 布局策略 | 激进：3 焦点 + 详情抽屉 |
| 2 | 目标轨道形态 | 注意力条（slim 水平条，5 段按比例） |
| 3 | 详情层机制 | 按焦点分抽屉（每焦点独立抽屉） |
| 4 | TaskCore 位置 | 上下分区（上部需求区 + 下部画布区） |

---

## 3. 布局方案（方案 A：上下分区 + 顶部注意力带 + 右侧回应栏）

```
┌──────────────────────────────────────────────────────────┐
│ [脉搏条] ▓▓▓▓▓▓▓▓ 聚焦 ▓▓▓▓▓ 后台 ▓▓ 定时 ▓▓▓ 等待 ▓▓ 完成│  6vh
├─────────────────────────────────────┬────────────────────┤
│  当前需求区（上部）                  │                    │
│  ─────────                          │   需要回应区        │
│  need 文字 (display 800)             │   ─────────         │
│  TaskCore 任务依赖树（可滚动）       │   DecisionCard      │
│  焦点区标题: "你的需求"              │   (已增强)          │
│  约 40% 高                           │                    │
├─────────────────────────────────────┤   修改条件输入      │
│  Agent 小队画布区（下部）            │   权限等级          │
│  ─────────                          │   自动授权          │
│  WorkspaceCanvas                    │                    │
│  (agents + connections + squads)    │   焦点区标题:       │
│  焦点区标题: "工作中"                │   "需要你"          │
│  约 60% 高                           │   全高 25%          │
└─────────────────────────────────────┴────────────────────┘
        左 75%                           右 25%
点击任一焦点区 → 右侧详情抽屉滑入（per-focus）
```

### 3.1 三焦点定义

1. **当前需求区（左上，约 40% 高）**：显示 need 文字 + TaskCore 任务依赖树。点击 → 任务详情抽屉（完整依赖图、证据链、Agent 能力）。
2. **Agent 小队画布区（左下，约 60% 高）**：WorkspaceCanvas 渲染 Agent 节点 + 连接 + squad 集群。点击 → Agent 详情抽屉（能力说明、工具调用历史、协作关系）。
3. **需要回应区（右，全高 25%）**：DecisionCard 堆叠。点击 → 证据链抽屉（推荐依据、已尝试路径、历史决策）。

**布局说明**：左侧上下分区（需求 + 画布），右侧全高回应栏。左侧占 75% 宽，右侧占 25% 宽。画布获得更大垂直空间（60% 高），避免节点拥挤。

### 3.2 注意力脉搏条（顶部，6vh）

- 全宽水平条，5 段按 trackKind 占比等高分布
- 段宽 = (该 trackKind 目标数 / 总目标数) × 100%
- 段内显示 trackKind 标签 + 计数（如"聚焦 1"）
- 段间 1px 深色缝隙分隔
- 4 秒呼吸周期（opacity 0.85↔1.0），暗示 Agent 持续工作
- 点击任一段 → 展开目标轨道详情抽屉

---

## 4. 视觉 Token 系统

### 4.1 签名元素（Signature）

**注意力脉搏条（Attention Pulse）** — 本设计的单一记忆点。所有其他元素保持克制，仅此处承担视觉个性。

### 4.2 色彩 Token

```css
/* 主屏表面 */
--habitat-void:    #0a0d0b;  /* 比当前 #0d1110 更深一档，主屏背景 */
--habitat-surface: #141815;  /* 焦点区表面 */
--habitat-edge:    #2a332d;  /* 焦点区分隔线 */
--habitat-ink:     #e8ece4;  /* 主文字，比 #eef2e8 略沉 */
--habitat-mute:    #8a958c;  /* 次要文字 */

/* 注意力脉搏条 5 段色（降饱和度，避免与 Agent 身份色竞争） */
--pulse-focused:    #6B9E8F;  /* 聚焦 - 沉稳青绿 */
--pulse-background: #5B7AC4;  /* 后台 - 沉稳蓝 */
--pulse-scheduled:  #7B62B5;  /* 定时 - 沉稳紫 */
--pulse-waiting:    #C99850;  /* 等待 - 沉稳琥珀 */
--pulse-completed:  #5A6470;  /* 完成 - 中性灰蓝 */
```

**Agent 身份色保留原值**（steward #E4A84B / planner #4E72D8 / memory #8B6CCF / guardian #C75A4A），仅在 Agent 节点上使用。注意力条用降饱和版本，避免竞争——这是非默认选择。

### 4.3 字型 Token

```css
--font-display: "Aptos", "Segoe UI", sans-serif;    /* 标题 - need、焦点区标题 */
--font-body:    "Aptos", "Segoe UI", sans-serif;    /* 正文 - 任务树、决策卡 */
--font-data:    "Cascadia Code", "Consolas", mono;  /* 数据 - 时间、成本、坐标 */
```

不引入衬线体（避免 AI 默认）。用同一无衬线家族靠字重和字号对比建立层次：display 800/900，body 600，data 等宽。

### 4.4 焦点区标题

用 eyebrow 小标签（amber 色，0.7rem，大写，字距 0.08em）标识焦点区身份："你的需求" / "工作中" / "需要你"。这是结构化信息编码，不是装饰。

---

## 5. 动效原则

| 元素 | 动效 | reduced-motion |
|------|------|----------------|
| 脉搏条 | 4 秒呼吸（opacity 0.85↔1.0） | 停止呼吸，静态显示 |
| 焦点区 | 无入场动画 | 同 |
| 详情抽屉 | 240ms ease-out transform 滑入 | 改为 opacity 过渡，无位移 |
| Agent 画布 | 保留现有三档（full/reduced/none） | reduced 模式仅保留节点呼吸 |
| 脉搏条段宽变化 | 300ms width 过渡 | 即时变化 |

**强制规则**：所有动效必须包裹在 `@media (prefers-reduced-motion: reduce)` 守护中。

---

## 6. 详情抽屉规格

### 6.1 当前需求抽屉

- 触发：点击当前需求区
- 内容：完整任务依赖图（含证据链）、Agent 能力说明、工具调用历史
- 结构：`role="dialog"` + `aria-modal="true"` + `aria-labelledby`
- 键盘：Escape 关闭、focus trap、`overscroll-behavior: contain`

### 6.2 Agent 小队抽屉

- 触发：点击画布区
- 内容：选中 Agent 的能力说明、工具调用历史、协作关系图
- 同 6.1 结构

### 6.3 需要回应抽屉

- 触发：点击回应区
- 内容：推荐依据、已尝试路径、历史决策、证据链
- 同 6.1 结构

### 6.4 注意力脉搏条抽屉

- 触发：点击脉搏条任一段
- 内容：对应 trackKind 的目标列表、进度、预算、自动化等级
- 同 6.1 结构

---

## 7. 可访问性修复基线（来自 web-design-guidelines 审查）

以下 P0 问题必须在本轮重构中修复：

### 7.1 TaskCore 模态框
- 添加 `role="dialog"` + `aria-modal="true"` + `aria-labelledby`
- 添加 Escape 键关闭
- 实现 focus trap
- 触发按钮添加 `aria-expanded`
- 时间格式改用 `Intl.DateTimeFormat`

### 7.2 DecisionCard 输入框
- 添加 `<label>` 或 `aria-label`
- 添加 `autocomplete="off"`
- 添加 `name="adjustCondition"`
- placeholder "..." → "…"
- 异步状态变化添加 `aria-live="polite"`

### 7.3 GoalTrack 列表语义
- `<div>` → `<ul>` + `<li>` 或 `role="list"` + `role="listitem"`
- 色彩指示器添加 `aria-label` 文本替代
- 空状态显示消息而非返回 null

### 7.4 跨文件
- 所有 habitat 动效添加 `prefers-reduced-motion` 守护
- 模态/抽屉添加 `overscroll-behavior: contain`
- 视图 tab 状态同步到 URL（`?view=agents` 等）
- 添加 skip link 到 main content
- 焦点区标题用 `<h2>` 建立层级（`<h1>` 在页面顶部）

---

## 8. 组件变更清单

### 8.1 新增组件

| 组件 | 职责 |
|------|------|
| `AttentionPulse.tsx` | 顶部注意力脉搏条，5 段比例分布 + 呼吸动效 |
| `FocusDrawer.tsx` | 通用详情抽屉壳（dialog + focus trap + Escape） |
| `NeedFocus.tsx` | 当前需求焦点区（need + TaskCore 摘要） |
| `SquadFocus.tsx` | Agent 小队焦点区（画布容器 + 标题） |
| `ResponseFocus.tsx` | 需要回应焦点区（DecisionCard 堆叠） |

### 8.2 修改组件

| 组件 | 变更 |
|------|------|
| `HabitatWorkspace.tsx` | 重构为 3 焦点布局，移除右侧面板堆叠和底部栏 |
| `GoalTrack.tsx` | 改为注意力条形态，从右侧面板移到顶部 |
| `TaskCore.tsx` | 修复模态框 a11y，移到当前需求区内 |
| `DecisionCard.tsx` | 修复输入框 a11y，移到需要回应区内 |
| `MemoryPanel.tsx` | 移到当前需求抽屉中（不再常驻主屏） |
| `ActivityTimeline.tsx` | 移到注意力脉搏条抽屉中 |
| `styles.css` | 新增注意力条 + 焦点区 + 抽屉样式，添加 reduced-motion 守护 |

### 8.3 删除/迁移

- 底部成本栏 → 移到注意力脉搏条抽屉
- Zone Labels（常驻区/能力池/成果与记忆/用户互动边界）→ 移除或改为 aria-only

---

## 9. 数据模型扩展

### 9.1 GoalTrackEntry 增强

当前 `GoalTrackEntry` 仅有 `goalId / need / trackKind`。扩展为：

```typescript
interface GoalTrackEntry {
  goalId: string;
  need: string;
  trackKind: "focused" | "background" | "scheduled" | "waiting" | "completed";
  progress: number;          // 新增：0-1 进度
  budget?: { spent: number; limit: number; currency: "CNY" | "USD" };  // 新增
  autonomy: AutonomyLevel;   // 新增：自动化等级
  agentCount: number;        // 新增：关联 Agent 数
}
```

### 9.2 注意力分配计算

```typescript
function computeAttentionAllocation(
  entries: GoalTrackEntry[]
): Array<{ trackKind: GoalTrackEntry["trackKind"]; count: number; ratio: number }> {
  const total = entries.length;
  const grouped = new Map<GoalTrackEntry["trackKind"], number>();
  for (const e of entries) {
    grouped.set(e.trackKind, (grouped.get(e.trackKind) ?? 0) + 1);
  }
  return [...grouped.entries()].map(([trackKind, count]) => ({
    trackKind,
    count,
    ratio: total > 0 ? count / total : 0,
  }));
}
```

---

## 10. 范围与非目标

### 10.1 本轮范围

- HabitatWorkspace 3 焦点布局重构
- 注意力脉搏条组件
- 4 个详情抽屉（当前需求 / Agent 小队 / 需要回应 / 注意力条）
- 现有组件 a11y 修复（P0）
- 视觉 token 应用（色彩 + 字型 + 签名）
- prefers-reduced-motion 守护

### 10.2 非目标（后续轮次）

- #5 结果区独立时间线（MemoryPanel 已覆盖部分）
- #6 信任与权限模型全局管理面板
- #7 成本个人化自然语言表达
- #8 动画状态系统（8 种状态动画）
- #10 关键状态补齐（10 种 habitat 状态设计）
- Agent 画布节点视觉去玄幻化（#1）
- 后端 API 接入（当前用 mock）

---

## 11. 验收标准

- [ ] 首屏仅显示 3 焦点区 + 顶部注意力条，无其他常驻面板
- [ ] 注意力条 5 段按 trackKind 占比分布，显示标签 + 计数
- [ ] 点击任一焦点区触发对应详情抽屉
- [ ] 抽屉含 `role="dialog"` / `aria-modal` / Escape / focus trap
- [ ] 所有动效响应 `prefers-reduced-motion`
- [ ] TypeScript 0 错误
- [ ] 现有测试全部通过（允许 1 个预存 E2E flaky 失败）
- [ ] 新增注意力条 + 焦点区组件测试
- [ ] 视觉 token 在 styles.css 中定义并应用
- [ ] 焦点区标题用 `<h2>`，页面顶部有 `<h1>`

---

## 12. 风险

| 风险 | 缓解 |
|------|------|
| 画布 75% 宽 × 60% 高仍可能拥挤 | 优化 squadLayout 环形布局参数，节点最小间距可调 |
| 注意力条 6vh 占用垂直空间 | 在小屏（<620px）改为 4vh，隐藏段内文字 |
| 右侧回应栏 25% 宽 DecisionCard 可能过窄 | DecisionCard 内部布局改为垂直堆叠，宽度自适应 |
| 抽屉 focus trap 实现复杂 | 使用 React 原生 + 自定义 hook，不引入第三方依赖 |
| 现有测试可能因布局重构失败 | 重构 HabitatWorkspace 测试以匹配新结构 |
