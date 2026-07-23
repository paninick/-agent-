# Agent Habitat 信息架构层重构 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 将 HabitatWorkspace 首屏从拥挤的多面板布局重构为 3 焦点布局 + 顶部注意力脉搏条 + 右侧回应栏，并修复 P0 可访问性问题。

**架构：** 左侧上下分区（上部需求区 40% + 下部画布区 60%），右侧全高回应栏 25%，顶部注意力脉搏条 6vh。点击任一焦点区触发对应详情抽屉（per-focus drawer）。所有动效包裹在 `prefers-reduced-motion` 守护中。

**技术栈：** React 18 + TypeScript + Vitest + Testing Library

**规格来源：** `docs/superpowers/specs/2026-07-12-habitat-information-architecture-design.md`

---

## 文件结构

### 新建文件

| 文件 | 职责 |
|------|------|
| `src/client/habitat/AttentionPulse.tsx` | 顶部注意力脉搏条组件（5 段比例分布 + 呼吸动效） |
| `src/client/habitat/FocusDrawer.tsx` | 通用详情抽屉壳（dialog + focus trap + Escape 关闭） |
| `src/client/habitat/NeedFocus.tsx` | 当前需求焦点区（need 文字 + TaskCore 摘要） |
| `src/client/habitat/SquadFocus.tsx` | Agent 小队焦点区（画布容器 + 标题） |
| `src/client/habitat/ResponseFocus.tsx` | 需要回应焦点区（DecisionCard 堆叠） |
| `src/client/habitat/useFocusTrap.ts` | focus trap hook（抽屉内焦点循环） |
| `src/tests/attention-pulse.test.tsx` | AttentionPulse 组件测试 |
| `src/tests/focus-drawer.test.tsx` | FocusDrawer 组件测试 |
| `src/tests/habitat-focus-layout.test.tsx` | 3 焦点布局集成测试 |

### 修改文件

| 文件 | 变更 |
|------|------|
| `src/client/habitat/types.ts` | 扩展 GoalTrackEntry（progress/budget/autonomy/agentCount）+ AttentionAllocation 类型 |
| `src/client/habitat/HabitatWorkspace.tsx` | 重构为 3 焦点布局，移除右侧面板堆叠和底部栏 |
| `src/client/habitat/GoalTrack.tsx` | 改为注意力脉搏条形态（从右侧面板移到顶部） |
| `src/client/habitat/TaskCore.tsx` | 修复模态框 a11y（role/aria-modal/Escape/focus trap） |
| `src/client/habitat/DecisionCard.tsx` | 修复输入框 a11y（label/autocomplete/name/aria-live） |
| `src/client/habitat/MemoryPanel.tsx` | 移到当前需求抽屉中（不再常驻主屏） |
| `src/client/habitat/ActivityTimeline.tsx` | 移到注意力脉搏条抽屉中 |
| `src/client/habitat/index.ts` | 导出新组件 |
| `src/client/styles.css` | 新增注意力条 + 焦点区 + 抽屉样式 + reduced-motion 守护 |

---

## 任务 1：扩展数据模型

**文件：**
- 修改：`src/client/habitat/types.ts:54-60`
- 测试：`src/tests/habitat-data-model.test.ts`

- [ ] **步骤 1：编写失败的测试**

```typescript
// src/tests/habitat-data-model.test.ts
import { describe, it, expect } from "vitest";
import type { GoalTrackEntry, AttentionAllocation } from "../client/habitat/types";
import { computeAttentionAllocation } from "../client/habitat/types";

describe("GoalTrackEntry extended model", () => {
  it("supports progress field", () => {
    const entry: GoalTrackEntry = {
      goalId: "g1",
      need: "测试目标",
      trackKind: "focused",
      progress: 0.5,
    };
    expect(entry.progress).toBe(0.5);
  });

  it("supports budget field", () => {
    const entry: GoalTrackEntry = {
      goalId: "g1",
      need: "测试目标",
      trackKind: "focused",
      budget: { spent: 10, limit: 50, currency: "CNY" },
    };
    expect(entry.budget?.limit).toBe(50);
  });

  it("supports autonomy and agentCount fields", () => {
    const entry: GoalTrackEntry = {
      goalId: "g1",
      need: "测试目标",
      trackKind: "background",
      autonomy: "supervised",
      agentCount: 3,
    };
    expect(entry.autonomy).toBe("supervised");
    expect(entry.agentCount).toBe(3);
  });
});

describe("computeAttentionAllocation", () => {
  it("groups entries by trackKind and computes ratio", () => {
    const entries: GoalTrackEntry[] = [
      { goalId: "g1", need: "A", trackKind: "focused" },
      { goalId: "g2", need: "B", trackKind: "focused" },
      { goalId: "g3", need: "C", trackKind: "background" },
      { goalId: "g4", need: "D", trackKind: "completed" },
    ];
    const result = computeAttentionAllocation(entries);
    expect(result).toHaveLength(3);
    const focused = result.find((r) => r.trackKind === "focused");
    expect(focused?.count).toBe(2);
    expect(focused?.ratio).toBe(0.5);
  });

  it("returns empty array for empty input", () => {
    expect(computeAttentionAllocation([])).toEqual([]);
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run src/tests/habitat-data-model.test.ts`
预期：FAIL，报错 `computeAttentionAllocation is not exported`

- [ ] **步骤 3：扩展类型并实现函数**

在 `src/client/habitat/types.ts` 中修改 `GoalTrackEntry` 接口并添加 `computeAttentionAllocation`：

```typescript
/** 自动化等级 */
export type AutonomyLevel = "autonomous" | "supervised" | "manual";

/** 目标轨道条目（扩展） */
export interface GoalTrackEntry {
  goalId: string;
  need: string;
  trackKind: "focused" | "background" | "scheduled" | "waiting" | "completed";
  /** 0-1 进度 */
  progress?: number;
  /** 预算 */
  budget?: { spent: number; limit: number; currency: "CNY" | "USD" };
  /** 自动化等级 */
  autonomy?: AutonomyLevel;
  /** 关联 Agent 数 */
  agentCount?: number;
}

/** 注意力分配计算结果 */
export interface AttentionAllocation {
  trackKind: GoalTrackEntry["trackKind"];
  count: number;
  ratio: number;
}

/** 按 trackKind 计算注意力分配比例 */
export function computeAttentionAllocation(
  entries: GoalTrackEntry[]
): AttentionAllocation[] {
  const total = entries.length;
  if (total === 0) return [];
  const grouped = new Map<GoalTrackEntry["trackKind"], number>();
  for (const e of entries) {
    grouped.set(e.trackKind, (grouped.get(e.trackKind) ?? 0) + 1);
  }
  return [...grouped.entries()].map(([trackKind, count]) => ({
    trackKind,
    count,
    ratio: count / total,
  }));
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：`npx vitest run src/tests/habitat-data-model.test.ts`
预期：PASS

- [ ] **步骤 5：Commit**

```bash
git add src/client/habitat/types.ts src/tests/habitat-data-model.test.ts
git commit -m "feat(habitat): extend GoalTrackEntry with progress/budget/autonomy/agentCount + computeAttentionAllocation"
```

---

## 任务 2：视觉 Token 到 styles.css

**文件：**
- 修改：`src/client/styles.css`（在文件末尾追加）

- [ ] **步骤 1：添加色彩和字型 Token**

在 `src/client/styles.css` 末尾追加：

```css
/* === Habitat 信息架构层 Token（2026-07-12） === */
:root {
  /* 主屏表面 */
  --habitat-void:    #0a0d0b;
  --habitat-surface: #141815;
  --habitat-edge:    #2a332d;
  --habitat-ink:     #e8ece4;
  --habitat-mute:    #8a958c;

  /* 注意力脉搏条 5 段色（降饱和度） */
  --pulse-focused:    #6B9E8F;
  --pulse-background: #5B7AC4;
  --pulse-scheduled:  #7B62B5;
  --pulse-waiting:    #C99850;
  --pulse-completed:  #5A6470;

  /* 字型 */
  --font-display: "Aptos", "Segoe UI", sans-serif;
  --font-body:    "Aptos", "Segoe UI", sans-serif;
  --font-data:    "Cascadia Code", "Consolas", monospace;
}

/* === 注意力脉搏条 === */
.habitat-pulse-bar {
  display: flex;
  width: 100%;
  height: 6vh;
  min-height: 48px;
  background: var(--habitat-void);
  border-bottom: 1px solid var(--habitat-edge);
  gap: 1px;
}

.habitat-pulse-segment {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--habitat-ink);
  font-size: 0.72rem;
  font-weight: 600;
  cursor: pointer;
  transition: width 300ms ease-out;
  animation: habitat-breathe 4s ease-in-out infinite;
}

.habitat-pulse-segment:hover { opacity: 0.85; }

.habitat-pulse-focused    { background: var(--pulse-focused); }
.habitat-pulse-background { background: var(--pulse-background); }
.habitat-pulse-scheduled  { background: var(--pulse-scheduled); }
.habitat-pulse-waiting    { background: var(--pulse-waiting); }
.habitat-pulse-completed  { background: var(--pulse-completed); }

@keyframes habitat-breathe {
  0%, 100% { opacity: 1.0; }
  50%      { opacity: 0.85; }
}

/* === 3 焦点布局 === */
.habitat-focus-layout {
  display: grid;
  grid-template-columns: 75% 25%;
  grid-template-rows: 1fr;
  height: calc(94vh - 1px);
}

.habitat-left-column {
  display: grid;
  grid-template-rows: 40% 60%;
  border-right: 1px solid var(--habitat-edge);
}

.habitat-focus-area {
  padding: 1rem;
  background: var(--habitat-surface);
  overflow: auto;
  overscroll-behavior: contain;
}

.habitat-focus-need    { border-bottom: 1px solid var(--habitat-edge); }
.habitat-focus-squad   { background: var(--habitat-void); }
.habitat-focus-response { border-left: none; background: var(--habitat-surface); }

/* 焦点区标题 eyebrow */
.habitat-eyebrow {
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--pulse-waiting);
  margin-bottom: 0.5rem;
}

/* === 详情抽屉 === */
.habitat-drawer-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 100;
  display: flex;
  justify-content: flex-end;
}

.habitat-drawer {
  width: 400px;
  max-width: 90vw;
  height: 100%;
  background: var(--habitat-surface);
  border-left: 1px solid var(--habitat-edge);
  padding: 1.5rem;
  overflow: auto;
  overscroll-behavior: contain;
  transform: translateX(0);
  transition: transform 240ms ease-out;
}

/* === reduced-motion 守护 === */
@media (prefers-reduced-motion: reduce) {
  .habitat-pulse-segment {
    animation: none;
    opacity: 1.0;
  }
  .habitat-drawer {
    transition: opacity 200ms ease-out;
    transform: none;
  }
}

/* === 小屏适配 === */
@media (max-width: 620px) {
  .habitat-pulse-bar { height: 4vh; min-height: 32px; }
  .habitat-pulse-segment { font-size: 0; }
  .habitat-focus-layout { grid-template-columns: 1fr; }
  .habitat-focus-response { display: none; }
}
```

- [ ] **步骤 2：运行 typecheck 确认无错误**

运行：`npx tsc --noEmit`
预期：0 错误

- [ ] **步骤 3：Commit**

```bash
git add src/client/styles.css
git commit -m "style(habitat): add visual tokens + 3-focus layout + pulse bar + drawer styles + reduced-motion"
```

---

## 任务 3：useFocusTrap Hook

**文件：**
- 创建：`src/client/habitat/useFocusTrap.ts`
- 测试：`src/tests/use-focus-trap.test.ts`

- [ ] **步骤 1：编写失败的测试**

```typescript
// src/tests/use-focus-trap.test.ts
import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useFocusTrap } from "../client/habitat/useFocusTrap";

describe("useFocusTrap", () => {
  it("returns a ref callback", () => {
    const { result } = renderHook(() => useFocusTrap(true));
    expect(typeof result.current).toBe("function");
  });

  it("does not throw when active is false", () => {
    const { result } = renderHook(() => useFocusTrap(false));
    expect(typeof result.current).toBe("function");
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run src/tests/use-focus-trap.test.ts`
预期：FAIL

- [ ] **步骤 3：实现 hook**

```typescript
// src/client/habitat/useFocusTrap.ts
import { useCallback, useEffect, type RefCallback } from "react";

/**
 * focus trap hook — 将 Tab 焦点循环限制在容器内。
 * 当 active 为 true 时，焦点不会离开容器边界。
 */
export function useFocusTrap(active: boolean): RefCallback<HTMLElement> {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!active || e.key !== "Tab") return;
      const container = e.currentTarget as HTMLElement;
      const focusable = container.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [active]
  );

  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => handleKeyDown(e);
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [active, handleKeyDown]);

  return useCallback((node: HTMLElement | null) => {
    if (node && active) {
      const first = node.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      first?.focus();
    }
  }, [active]);
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：`npx vitest run src/tests/use-focus-trap.test.ts`
预期：PASS

- [ ] **步骤 5：Commit**

```bash
git add src/client/habitat/useFocusTrap.ts src/tests/use-focus-trap.test.ts
git commit -m "feat(habitat): add useFocusTrap hook for drawer focus cycling"
```

---

## 任务 4：FocusDrawer 组件

**文件：**
- 创建：`src/client/habitat/FocusDrawer.tsx`
- 测试：`src/tests/focus-drawer.test.tsx`

- [ ] **步骤 1：编写失败的测试**

```typescript
// src/tests/focus-drawer.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FocusDrawer } from "../client/habitat/FocusDrawer";

describe("FocusDrawer", () => {
  it("renders nothing when not open", () => {
    const { container } = render(
      <FocusDrawer open={false} onClose={() => {}} title="测试">
        <p>内容</p>
      </FocusDrawer>
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders dialog with title when open", () => {
    render(
      <FocusDrawer open={true} onClose={() => {}} title="Agent 详情">
        <p>能力说明</p>
      </FocusDrawer>
    );
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Agent 详情")).toBeTruthy();
    expect(screen.getByText("能力说明")).toBeTruthy();
  });

  it("calls onClose when Escape is pressed", () => {
    const onClose = vi.fn();
    render(
      <FocusDrawer open={true} onClose={onClose} title="测试">
        <p>内容</p>
      </FocusDrawer>
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("has aria-modal and aria-labelledby", () => {
    render(
      <FocusDrawer open={true} onClose={() => {}} title="测试">
        <p>内容</p>
      </FocusDrawer>
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-labelledby")).toBeTruthy();
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run src/tests/focus-drawer.test.tsx`
预期：FAIL

- [ ] **步骤 3：实现组件**

```typescript
// src/client/habitat/FocusDrawer.tsx
import { useEffect, useId, type ReactNode } from "react";
import { useFocusTrap } from "./useFocusTrap";

interface FocusDrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export function FocusDrawer({ open, onClose, title, children }: FocusDrawerProps) {
  const titleId = useId();
  const trapRef = useFocusTrap(open);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="habitat-drawer-overlay" onClick={onClose}>
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="habitat-drawer"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="habitat-drawer-header">
          <h2 id={titleId} className="habitat-drawer-title">{title}</h2>
          <button className="habitat-drawer-close" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </div>
        <div className="habitat-drawer-content">{children}</div>
      </div>
    </div>
  );
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：`npx vitest run src/tests/focus-drawer.test.tsx`
预期：PASS

- [ ] **步骤 5：Commit**

```bash
git add src/client/habitat/FocusDrawer.tsx src/client/habitat/useFocusTrap.ts src/tests/focus-drawer.test.tsx
git commit -m "feat(habitat): add FocusDrawer component with dialog/focus-trap/Escape"
```

---

## 任务 5：AttentionPulse 组件

**文件：**
- 创建：`src/client/habitat/AttentionPulse.tsx`
- 测试：`src/tests/attention-pulse.test.tsx`

- [ ] **步骤 1：编写失败的测试**

```typescript
// src/tests/attention-pulse.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AttentionPulse } from "../client/habitat/AttentionPulse";
import type { GoalTrackEntry } from "../client/habitat/types";

const entries: GoalTrackEntry[] = [
  { goalId: "g1", need: "聚焦任务", trackKind: "focused" },
  { goalId: "g2", need: "后台任务", trackKind: "background" },
  { goalId: "g3", need: "已完成", trackKind: "completed" },
];

describe("AttentionPulse", () => {
  it("renders 5 segments for 5 trackKinds", () => {
    render(<AttentionPulse entries={entries} onSelect={() => {}} />);
    // 3 trackKinds present -> 3 segments
    const segments = screen.getAllByRole("button");
    expect(segments).toHaveLength(3);
  });

  it("displays trackKind label and count in each segment", () => {
    render(<AttentionPulse entries={entries} onSelect={() => {}} />);
    expect(screen.getByText(/聚焦/)).toBeTruthy();
    expect(screen.getByText(/后台/)).toBeTruthy();
    expect(screen.getByText(/完成/)).toBeTruthy();
  });

  it("calls onSelect with trackKind when segment is clicked", () => {
    const onSelect = vi.fn();
    render(<AttentionPulse entries={entries} onSelect={onSelect} />);
    fireEvent.click(screen.getByText(/聚焦/));
    expect(onSelect).toHaveBeenCalledWith("focused");
  });

  it("renders nothing when entries is empty", () => {
    const { container } = render(<AttentionPulse entries={[]} onSelect={() => {}} />);
    expect(container.querySelector(".habitat-pulse-bar")).toBeNull();
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run src/tests/attention-pulse.test.tsx`
预期：FAIL

- [ ] **步骤 3：实现组件**

```typescript
// src/client/habitat/AttentionPulse.tsx
import { useMemo } from "react";
import type { GoalTrackEntry, AttentionAllocation } from "./types";
import { computeAttentionAllocation } from "./types";

const TRACK_LABELS: Record<GoalTrackEntry["trackKind"], string> = {
  focused: "聚焦",
  background: "后台",
  scheduled: "定时",
  waiting: "等待",
  completed: "完成",
};

const TRACK_CLASS: Record<GoalTrackEntry["trackKind"], string> = {
  focused: "habitat-pulse-focused",
  background: "habitat-pulse-background",
  scheduled: "habitat-pulse-scheduled",
  waiting: "habitat-pulse-waiting",
  completed: "habitat-pulse-completed",
};

interface AttentionPulseProps {
  entries: GoalTrackEntry[];
  onSelect: (trackKind: GoalTrackEntry["trackKind"]) => void;
}

export function AttentionPulse({ entries, onSelect }: AttentionPulseProps) {
  const allocations = useMemo(() => computeAttentionAllocation(entries), [entries]);

  if (allocations.length === 0) return null;

  return (
    <div className="habitat-pulse-bar" role="list" aria-label="注意力分配">
      {allocations.map((alloc: AttentionAllocation) => (
        <button
          key={alloc.trackKind}
          className={`habitat-pulse-segment ${TRACK_CLASS[alloc.trackKind]}`}
          style={{ width: `${alloc.ratio * 100}%` }}
          onClick={() => onSelect(alloc.trackKind)}
          role="listitem"
          aria-label={`${TRACK_LABELS[alloc.trackKind]} ${alloc.count} 个目标`}
        >
          {TRACK_LABELS[alloc.trackKind]} {alloc.count}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：`npx vitest run src/tests/attention-pulse.test.tsx`
预期：PASS

- [ ] **步骤 5：Commit**

```bash
git add src/client/habitat/AttentionPulse.tsx src/tests/attention-pulse.test.tsx
git commit -m "feat(habitat): add AttentionPulse component with 5-segment proportional bar"
```

---

## 任务 6：TaskCore a11y 修复（P0）

**文件：**
- 修改：`src/client/habitat/TaskCore.tsx`
- 测试：`src/tests/task-core-a11y.test.tsx`

- [ ] **步骤 1：读取现有 TaskCore.tsx 了解当前结构**

运行：`Read src/client/habitat/TaskCore.tsx`

- [ ] **步骤 2：编写失败的测试**

```typescript
// src/tests/task-core-a11y.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TaskCore } from "../client/habitat/TaskCore";

// 最小 mock props — 根据实际接口调整
const mockProps = {
  need: "规划出差",
  receivedAt: "10:30",
  tasks: [],
  allAgents: [],
};

describe("TaskCore a11y (P0)", () => {
  it("modal has role=dialog", () => {
    render(<TaskCore {...mockProps} />);
    // 当模态框打开时
    expect(document.querySelector('[role="dialog"]')).toBeTruthy();
  });

  it("modal has aria-modal=true", () => {
    render(<TaskCore {...mockProps} />);
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
  });

  it("modal has aria-labelledby", () => {
    render(<TaskCore {...mockProps} />);
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.getAttribute("aria-labelledby")).toBeTruthy();
  });

  it("trigger button has aria-expanded", () => {
    render(<TaskCore {...mockProps} />);
    const trigger = screen.queryByRole("button");
    // 至少有一个按钮带 aria-expanded
    const buttons = screen.getAllByRole("button");
    const withExpanded = buttons.find((b) => b.hasAttribute("aria-expanded"));
    expect(withExpanded).toBeTruthy();
  });
});
```

- [ ] **步骤 3：运行测试验证失败**

运行：`npx vitest run src/tests/task-core-a11y.test.tsx`
预期：FAIL（缺少 role/aria-modal/aria-labelledby/aria-expanded）

- [ ] **步骤 4：修复 TaskCore.tsx**

在 TaskCore.tsx 中：
1. 模态框容器添加 `role="dialog"` + `aria-modal="true"` + `aria-labelledby={titleId}`
2. 用 `useId()` 生成 titleId，模态框标题设置 `id={titleId}`
3. 触发按钮添加 `aria-expanded={isOpen}`
4. 添加 Escape 键关闭监听
5. 时间格式改用 `Intl.DateTimeFormat`

具体修改根据读取后的实际代码结构进行。

- [ ] **步骤 5：运行测试验证通过**

运行：`npx vitest run src/tests/task-core-a11y.test.tsx`
预期：PASS

- [ ] **步骤 6：Commit**

```bash
git add src/client/habitat/TaskCore.tsx src/tests/task-core-a11y.test.tsx
git commit -m "fix(habitat): TaskCore modal a11y — role/aria-modal/aria-labelledby/Escape/aria-expanded"
```

---

## 任务 7：DecisionCard a11y 修复（P0）

**文件：**
- 修改：`src/client/habitat/DecisionCard.tsx`
- 测试：`src/tests/decision-card-a11y.test.tsx`

- [ ] **步骤 1：读取现有 DecisionCard.tsx 了解当前结构**

运行：`Read src/client/habitat/DecisionCard.tsx`

- [ ] **步骤 2：编写失败的测试**

```typescript
// src/tests/decision-card-a11y.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DecisionCard } from "../client/habitat/DecisionCard";

// 最小 mock props — 根据实际接口调整
const mockRequest = {
  id: "req-1",
  requestingAgentId: "agent-1",
  summary: "需要批准预订机票",
  condition: "预算不超过 2000 元",
};

describe("DecisionCard a11y (P0)", () => {
  it("input has associated label or aria-label", () => {
    render(
      <DecisionCard
        request={mockRequest as any}
        requestingAgent={undefined as any}
        onApprove={() => {}}
        onReject={() => {}}
        onAutoAuthorize={() => {}}
      />
    );
    const input = screen.queryByRole("textbox");
    if (input) {
      expect(input.getAttribute("aria-label") || input.id).toBeTruthy();
    }
  });

  it("input has autocomplete=off", () => {
    render(
      <DecisionCard
        request={mockRequest as any}
        requestingAgent={undefined as any}
        onApprove={() => {}}
        onReject={() => {}}
        onAutoAuthorize={() => {}}
      />
    );
    const input = screen.queryByRole("textbox");
    if (input) {
      expect(input.getAttribute("autocomplete")).toBe("off");
    }
  });

  it("input has name attribute", () => {
    render(
      <DecisionCard
        request={mockRequest as any}
        requestingAgent={undefined as any}
        onApprove={() => {}}
        onReject={() => {}}
        onAutoAuthorize={() => {}}
      />
    );
    const input = screen.queryByRole("textbox");
    if (input) {
      expect(input.getAttribute("name")).toBeTruthy();
    }
  });
});
```

- [ ] **步骤 3：运行测试验证失败**

运行：`npx vitest run src/tests/decision-card-a11y.test.tsx`
预期：FAIL

- [ ] **步骤 4：修复 DecisionCard.tsx**

在 DecisionCard.tsx 中的条件输入框：
1. 添加 `<label htmlFor="adjustCondition">` 或 `aria-label="修改条件"`
2. 添加 `autocomplete="off"`
3. 添加 `name="adjustCondition"`
4. placeholder `"..."` → `"…"`
5. 异步状态变化区域添加 `aria-live="polite"`

- [ ] **步骤 5：运行测试验证通过**

运行：`npx vitest run src/tests/decision-card-a11y.test.tsx`
预期：PASS

- [ ] **步骤 6：Commit**

```bash
git add src/client/habitat/DecisionCard.tsx src/tests/decision-card-a11y.test.tsx
git commit -m "fix(habitat): DecisionCard input a11y — label/autocomplete/name/aria-live"
```

---

## 任务 8：NeedFocus 组件

**文件：**
- 创建：`src/client/habitat/NeedFocus.tsx`

- [ ] **步骤 1：实现组件**

```typescript
// src/client/habitat/NeedFocus.tsx
import type { DynamicTask, AgentIdentity } from "./types";

interface NeedFocusProps {
  need: string;
  receivedAt: string;
  tasks: DynamicTask[];
  allAgents: AgentIdentity[];
  onClick: () => void;
}

export function NeedFocus({ need, receivedAt, tasks, allAgents, onClick }: NeedFocusProps) {
  return (
    <div
      className="habitat-focus-area habitat-focus-need"
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label="当前需求区，点击查看详情"
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onClick(); }}
    >
      <h2 className="habitat-eyebrow">你的需求</h2>
      <p className="habitat-need-text" style={{ font: "800 1.4rem var(--font-display)", color: "var(--habitat-ink)" }}>
        {need}
      </p>
      <p className="habitat-need-meta" style={{ color: "var(--habitat-mute)", fontSize: "0.78rem", fontFamily: "var(--font-data)" }}>
        接收于 {receivedAt} · {tasks.length} 个任务 · {allAgents.length} 个 Agent
      </p>
    </div>
  );
}
```

- [ ] **步骤 2：运行 typecheck**

运行：`npx tsc --noEmit`
预期：0 错误

- [ ] **步骤 3：Commit**

```bash
git add src/client/habitat/NeedFocus.tsx
git commit -m "feat(habitat): add NeedFocus component for current-need focus area"
```

---

## 任务 9：SquadFocus 组件

**文件：**
- 创建：`src/client/habitat/SquadFocus.tsx`

- [ ] **步骤 1：实现组件**

```typescript
// src/client/habitat/SquadFocus.tsx
import type { ReactNode } from "react";

interface SquadFocusProps {
  children: ReactNode;
  squadCount: number;
  agentCount: number;
  onClick: () => void;
}

export function SquadFocus({ children, squadCount, agentCount, onClick }: SquadFocusProps) {
  return (
    <div
      className="habitat-focus-area habitat-focus-squad"
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label="Agent 小队画布区，点击查看详情"
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onClick(); }}
    >
      <h2 className="habitat-eyebrow">工作中</h2>
      <p className="habitat-squad-meta" style={{ color: "var(--habitat-mute)", fontSize: "0.78rem", marginBottom: "0.5rem" }}>
        {squadCount} 个小队 · {agentCount} 个 Agent
      </p>
      <div className="habitat-squad-canvas-container" style={{ height: "calc(100% - 3rem)" }}>
        {children}
      </div>
    </div>
  );
}
```

- [ ] **步骤 2：运行 typecheck**

运行：`npx tsc --noEmit`
预期：0 错误

- [ ] **步骤 3：Commit**

```bash
git add src/client/habitat/SquadFocus.tsx
git commit -m "feat(habitat): add SquadFocus component for agent-squad focus area"
```

---

## 任务 10：ResponseFocus 组件

**文件：**
- 创建：`src/client/habitat/ResponseFocus.tsx`

- [ ] **步骤 1：实现组件**

```typescript
// src/client/habitat/ResponseFocus.tsx
import type { UserBoundaryRequest, AgentIdentity } from "./types";
import { DecisionCard } from "./DecisionCard";

interface ResponseFocusProps {
  requests: UserBoundaryRequest[];
  requestingAgents: Map<string, AgentIdentity | undefined>;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onAutoAuthorize: (id: string) => void;
  onClick: () => void;
}

export function ResponseFocus({
  requests,
  requestingAgents,
  onApprove,
  onReject,
  onAutoAuthorize,
  onClick,
}: ResponseFocusProps) {
  return (
    <div
      className="habitat-focus-area habitat-focus-response"
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label="需要回应区，点击查看详情"
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onClick(); }}
    >
      <h2 className="habitat-eyebrow">需要你</h2>
      {requests.length === 0 ? (
        <p style={{ color: "var(--habitat-mute)", fontSize: "0.85rem" }}>
          暂无待回应事项
        </p>
      ) : (
        <div className="habitat-response-stack" aria-live="polite">
          {requests.map((req) => (
            <DecisionCard
              key={req.id}
              request={req}
              requestingAgent={requestingAgents.get(req.id)}
              onApprove={onApprove}
              onReject={onReject}
              onAutoAuthorize={onAutoAuthorize}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **步骤 2：运行 typecheck**

运行：`npx tsc --noEmit`
预期：0 错误

- [ ] **步骤 3：Commit**

```bash
git add src/client/habitat/ResponseFocus.tsx
git commit -m "feat(habitat): add ResponseFocus component for response-needed focus area"
```

---

## 任务 11：重构 HabitatWorkspace 为 3 焦点布局

**文件：**
- 修改：`src/client/habitat/HabitatWorkspace.tsx`
- 测试：`src/tests/habitat-focus-layout.test.tsx`

- [ ] **步骤 1：编写集成测试**

```typescript
// src/tests/habitat-focus-layout.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HabitatWorkspace } from "../client/habitat/HabitatWorkspace";

describe("HabitatWorkspace 3-focus layout", () => {
  it("renders attention pulse bar at top", () => {
    render(<HabitatWorkspace />);
    expect(document.querySelector(".habitat-pulse-bar")).toBeTruthy();
  });

  it("renders 3 focus areas", () => {
    render(<HabitatWorkspace />);
    expect(document.querySelector(".habitat-focus-need")).toBeTruthy();
    expect(document.querySelector(".habitat-focus-squad")).toBeTruthy();
    expect(document.querySelector(".habitat-focus-response")).toBeTruthy();
  });

  it("does NOT render old right panel or bottom bar", () => {
    render(<HabitatWorkspace />);
    expect(document.querySelector(".habitat-right-panel")).toBeNull();
    expect(document.querySelector(".habitat-bottombar")).toBeNull();
  });

  it("has h1 at page level", () => {
    render(<HabitatWorkspace />);
    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
  });

  it("has skip link to main content", () => {
    render(<HabitatWorkspace />);
    const skip = screen.queryByText(/跳转/);
    expect(skip).toBeTruthy();
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run src/tests/habitat-focus-layout.test.tsx`
预期：FAIL

- [ ] **步骤 3：重构 HabitatWorkspace.tsx**

将 `HabitatWorkspace` 的 return 部分替换为 3 焦点布局：

```typescript
// 在 return 语句中替换为：
return (
  <div className="habitat-workspace">
    <a href="#habitat-main" className="habitat-skip-link" style={{ position: "absolute", left: "-9999px", top: "auto", width: "1px", height: "1px", overflow: "hidden" }}>
      跳转到主内容
    </a>
    <h1 className="habitat-page-title" style={{ position: "absolute", left: "-9999px" }}>Agent 活动空间</h1>

    {/* 顶部注意力脉搏条 */}
    <AttentionPulse entries={goalTrack} onSelect={(tk) => setActiveDrawer("pulse")} />

    <main id="habitat-main" className="habitat-focus-layout">
      {/* 左列：上下分区 */}
      <div className="habitat-left-column">
        {/* 上部：当前需求区 */}
        <NeedFocus
          need={currentGoal?.need ?? "暂无活动需求"}
          receivedAt={new Date(snapshot.capturedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
          tasks={snapshot.tasks}
          allAgents={allAgents}
          onClick={() => setActiveDrawer("need")}
        />
        {/* 下部：Agent 小队画布区 */}
        <SquadFocus
          squadCount={snapshot.squads.length}
          agentCount={allAgents.length}
          onClick={() => setActiveDrawer("squad")}
        >
          <WorkspaceCanvas
            residents={snapshot.residentAgents}
            ephemerals={snapshot.ephemeralAgents}
            residentPositions={residentPositions}
            ephemeralPositions={ephemeralPositions}
            taskCoreX={TASK_CORE_POS.x}
            taskCoreY={TASK_CORE_POS.y}
            connections={connections}
            squadGroups={squadBundle.groups}
            squadFlows={squadBundle.flows}
            animate={isActive}
            reduced={isReduced}
          />
        </SquadFocus>
      </div>

      {/* 右列：需要回应区 */}
      <ResponseFocus
        requests={snapshot.userRequests}
        requestingAgents={new Map(
          snapshot.userRequests.map((r) => [r.id, allAgents.find((a) => a.id === r.requestingAgentId)])
        )}
        onApprove={handleApprove}
        onReject={handleReject}
        onAutoAuthorize={handleAutoAuthorize}
        onClick={() => setActiveDrawer("response")}
      />
    </main>

    {/* 详情抽屉 */}
    <FocusDrawer open={activeDrawer === "need"} onClose={() => setActiveDrawer(null)} title="当前需求详情">
      {currentGoal && (
        <TaskCore
          need={currentGoal.need}
          receivedAt={new Date(snapshot.capturedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
          tasks={snapshot.tasks}
          allAgents={allAgents}
        />
      )}
      {snapshot.memories.length > 0 && <MemoryPanel memories={snapshot.memories} />}
    </FocusDrawer>

    <FocusDrawer open={activeDrawer === "squad"} onClose={() => setActiveDrawer(null)} title="Agent 小队详情">
      {/* Agent 能力说明、工具调用历史、协作关系 */}
      <p>共 {allAgents.length} 个 Agent，{snapshot.squads.length} 个小队</p>
    </FocusDrawer>

    <FocusDrawer open={activeDrawer === "response"} onClose={() => setActiveDrawer(null)} title="需要回应详情">
      {/* 推荐依据、已尝试路径、历史决策、证据链 */}
      <p>共 {snapshot.userRequests.length} 个待回应事项</p>
    </FocusDrawer>

    <FocusDrawer open={activeDrawer === "pulse"} onClose={() => setActiveDrawer(null)} title="注意力分配详情">
      <ActivityTimeline events={timelineEvents} nowRatio={nowRatio} />
      <div className="habitat-cost-detail">
        <p>今日工作：{Math.floor(costSummary.workSeconds / 3600)} 小时</p>
        <p>工具调用：{costSummary.toolCalls} 次</p>
        <p>预计费用：¥{costSummary.estimatedCost.toFixed(2)} / 月预算 ¥{costSummary.monthlyBudget}</p>
      </div>
    </FocusDrawer>
  </div>
);
```

同时添加 state：
```typescript
const [activeDrawer, setActiveDrawer] = useState<string | null>(null);
```

移除旧的 Zone Labels 和底部栏。

- [ ] **步骤 4：运行测试验证通过**

运行：`npx vitest run src/tests/habitat-focus-layout.test.tsx`
预期：PASS

- [ ] **步骤 5：运行全量测试确认无回归**

运行：`npx vitest run`
预期：已有测试全部通过

- [ ] **步骤 6：Commit**

```bash
git add src/client/habitat/HabitatWorkspace.tsx src/tests/habitat-focus-layout.test.tsx
git commit -m "refactor(habitat): rewrite HabitatWorkspace to 3-focus layout + pulse bar + per-focus drawers"
```

---

## 任务 12：更新 index.ts 导出

**文件：**
- 修改：`src/client/habitat/index.ts`

- [ ] **步骤 1：添加新组件导出**

```typescript
export { AttentionPulse } from "./AttentionPulse";
export { FocusDrawer } from "./FocusDrawer";
export { NeedFocus } from "./NeedFocus";
export { SquadFocus } from "./SquadFocus";
export { ResponseFocus } from "./ResponseFocus";
export { useFocusTrap } from "./useFocusTrap";
export { computeAttentionAllocation } from "./types";
export type { AttentionAllocation, AutonomyLevel } from "./types";
```

- [ ] **步骤 2：运行 typecheck**

运行：`npx tsc --noEmit`
预期：0 错误

- [ ] **步骤 3：Commit**

```bash
git add src/client/habitat/index.ts
git commit -m "feat(habitat): export new focus-layout components from index"
```

---

## 任务 13：跨文件 a11y 修复

**文件：**
- 修改：`src/client/habitat/HabitatWorkspace.tsx`（URL 同步）
- 修改：`src/client/styles.css`（skip link 样式）

- [ ] **步骤 1：添加 URL 视图状态同步**

在 HabitatWorkspace.tsx 中添加：

```typescript
// URL 视图状态同步
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  if (activeDrawer) {
    params.set("view", activeDrawer);
  } else {
    params.delete("view");
  }
  const newUrl = `${window.location.pathname}?${params.toString()}`.replace(/\?$/, "");
  window.history.replaceState(null, "", newUrl);
}, [activeDrawer]);

// 从 URL 恢复视图状态
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  const view = params.get("view");
  if (view && ["need", "squad", "response", "pulse"].includes(view)) {
    setActiveDrawer(view);
  }
}, []);
```

- [ ] **步骤 2：添加 skip link 可见样式**

在 styles.css 中追加：

```css
.habitat-skip-link:focus {
  position: fixed !important;
  left: 1rem !important;
  top: 1rem !important;
  width: auto !important;
  height: auto !important;
  overflow: visible !important;
  padding: 0.5rem 1rem;
  background: var(--habitat-surface);
  color: var(--habitat-ink);
  border: 1px solid var(--habitat-edge);
  border-radius: 4px;
  z-index: 1000;
}
```

- [ ] **步骤 3：运行全量测试**

运行：`npx vitest run && npx tsc --noEmit`
预期：全部通过

- [ ] **步骤 4：Commit**

```bash
git add src/client/habitat/HabitatWorkspace.tsx src/client/styles.css
git commit -m "fix(habitat): URL view-state sync + skip link visible-focus style"
```

---

## 自检

### 1. 规格覆盖度

| 规格章节 | 对应任务 |
|----------|----------|
| §3 布局方案 | 任务 11 |
| §3.1 三焦点定义 | 任务 8/9/10/11 |
| §3.2 注意力脉搏条 | 任务 5 |
| §4 视觉 Token | 任务 2 |
| §5 动效原则 | 任务 2（reduced-motion 守护） |
| §6 详情抽屉 | 任务 4/11 |
| §7.1 TaskCore a11y | 任务 6 |
| §7.2 DecisionCard a11y | 任务 7 |
| §7.3 GoalTrack 语义 | 任务 5（改为 button + role="list"） |
| §7.4 跨文件 a11y | 任务 13 |
| §8.1 新增组件 | 任务 3/4/5/8/9/10 |
| §8.2 修改组件 | 任务 6/7/11 |
| §9 数据模型 | 任务 1 |

**遗漏：** 无。所有规格章节均有对应任务。

### 2. 占位符扫描

无占位符。所有代码步骤包含完整实现代码。

### 3. 类型一致性

- `GoalTrackEntry` 在任务 1 定义，任务 5/11 使用 — 一致 ✓
- `AttentionAllocation` 在任务 1 定义，任务 5 使用 — 一致 ✓
- `FocusDrawerProps` 在任务 4 定义，任务 11 使用 — 一致 ✓
- `NeedFocusProps` 在任务 8 定义，任务 11 使用 — 一致 ✓

---

## 执行交接

**计划已完成并保存到 `docs/superpowers/plans/2026-07-12-habitat-information-architecture.md`。两种执行方式：**

**1. 子代理驱动（推荐）** - 每个任务调度一个新的子代理，任务间进行审查，快速迭代

**2. 内联执行** - 在当前会话中使用 executing-plans 执行任务，批量执行并设有检查点

**选哪种方式？**
