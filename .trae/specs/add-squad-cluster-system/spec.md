# Squad 集群系统 Spec

## Why

个人 Agent 栖息地的核心组织形式是「动态小队（Squad）」：常驻 Agent 与临时 Agent 围绕一个目标动态组队、协作、对峙、交付、解散。在引入本变更前，`DynamicSquad` 类型已存在但 UI 层完全未消费它——集群只是数据，没有视觉、没有编排、没有生命周期。本 spec 为已实施的集群系统建立契约，作为后续扩展（状态机动画触发、生命周期事件流、多 squad 并存）的基础。

## What Changes

- 扩展 `DynamicSquad` 领域类型：新增 `phase` / `leadAgentId` / `memberRoles` / `hasAdversarialReview` / `dissolvedAt` 字段
- 新增 `SquadPhase` 类型：5 阶段生命周期 `forming | working | reviewing | delivering | dissolving`
- 新增 `AgentRoleInSquad` 类型：4 种角色 `lead | contributor | reviewer | boundary_keeper`
- 新增 `SquadMemberRole` 关系类型：记录成员加入时间与角色
- 新增 `squadLifecycle.ts` 模块：5 阶段状态机、阶段转换规则、角色校验、进度计算、状态文案
- 新增 `squadLayout.ts` 模块：环形布局计算（lead 在正上方，按角色优先级顺时针分布）、半径随阶段动态变化、证据流连线构造
- 新增 `squadRenderer.ts` 模块：Canvas 纯绘制函数（环形光晕、阶段标签、进度弧、对峙光带、流动粒子）
- 扩展 UI 类型 `types.ts`：新增 `SquadRenderGroup` / `SquadEvidenceFlow` / `SquadRenderBundle`
- 修改 `HabitatWorkspace.tsx`：构建 squad 渲染包，squad 成员位置覆盖默认位置，topbar 显示当前 squad 状态
- 修改 `WorkspaceCanvas.tsx`：新增 `squadGroups` / `squadFlows` 参数，在背景粒子后、Agent 前绘制 squad 光晕，在普通 connections 前绘制证据流
- 修改 `habitatMock.ts`：mock squad 补全 6 个成员的角色映射（planner=lead，guardian=reviewer，3 个 ephemeral=contributor，steward=boundary_keeper）
- 扩展 `index.ts` barrel export：导出 `layoutSquad` / `getMemberPositions` / `buildSquadFlows` / `drawSquadHalo` 等
- 扩展 `styles.css`：新增 `.habitat-squad-status` 样式

## Impact

- **Affected specs**: 无（本 spec 为新增）
- **Affected code**:
  - `src/domain/agentHabitat.ts` — DynamicSquad 扩展
  - `src/domain/squadLifecycle.ts` — 新增状态机模块
  - `src/client/habitat/types.ts` — UI 类型扩展
  - `src/client/habitat/squadLayout.ts` — 新增布局计算
  - `src/client/habitat/squadRenderer.ts` — 新增 Canvas 渲染辅助
  - `src/client/habitat/HabitatWorkspace.tsx` — 主容器集成
  - `src/client/habitat/WorkspaceCanvas.tsx` — Canvas 渲染扩展
  - `src/client/habitat/habitatMock.ts` — mock 数据丰富
  - `src/client/habitat/index.ts` — barrel export
  - `src/client/styles.css` — squad 状态徽章样式

## ADDED Requirements

### Requirement: Squad 5 阶段生命周期状态机

系统 SHALL 为每个 Squad 维护一个 5 阶段生命周期状态机：`forming → working → reviewing → delivering → dissolving`。

阶段转换 SHALL 遵循以下规则：
- `forming` 只能进入 `working`
- `working` 可进入 `reviewing` / `delivering` / `dissolving`
- `reviewing` 可回到 `working` 或进入 `delivering`
- `delivering` 只能进入 `dissolving`
- `dissolving` 为终态，无后续转换

系统 SHALL 通过 `canTransitionTo(from, to)` 函数校验转换合法性，非法转换 SHALL 抛出 Error。

系统 SHALL 通过 `transitionSquadPhase(squad, to, now)` 函数应用阶段转换，返回新的不可变 squad 对象，并在进入 `dissolving` 阶段时填充 `dissolvedAt` 时间戳。

#### Scenario: 合法的阶段转换
- **WHEN** squad 当前处于 `working` 阶段
- **AND** 调用 `transitionSquadPhase(squad, "reviewing", now)`
- **THEN** 返回新 squad 对象，`phase` 为 `reviewing`，`phaseEnteredAt` 为 `now`

#### Scenario: 非法的阶段转换
- **WHEN** squad 当前处于 `forming` 阶段
- **AND** 调用 `transitionSquadPhase(squad, "delivering", now)`
- **THEN** 抛出 Error，错误消息包含 `非法状态转换`

### Requirement: Squad 角色 system

系统 SHALL 为每个 Squad 成员分配 4 种角色之一：`lead`（领队）/ `contributor`（贡献者）/ `reviewer`（审查员）/ `boundary_keeper`（边界守门人）。

每个阶段 SHALL 要求特定角色在场：
- `forming` 要求 `lead`
- `working` 要求 `lead` + `contributor`
- `reviewing` 要求 `lead` + `reviewer`
- `delivering` 要求 `lead` + `boundary_keeper`
- `dissolving` 要求 `lead`

系统 SHALL 通过 `missingRolesForPhase(squad)` 函数返回当前阶段缺失的角色数组（空数组表示满足）。

系统 SHALL 通过 `getAgentsByRole(squad, role)` 函数返回担任指定角色的 Agent ID 列表。

#### Scenario: working 阶段缺少 contributor
- **GIVEN** squad 处于 `working` 阶段
- **AND** 成员只有 1 个 `lead`，没有 `contributor`
- **WHEN** 调用 `missingRolesForPhase(squad)`
- **THEN** 返回 `["contributor"]`

### Requirement: Squad 阶段视觉映射

系统 SHALL 为每个阶段定义中文标签和视觉主色：
- `forming` → "召集中" → `#4BA89A`（薄荷绿）
- `working` → "协作中" → `#4E72D8`（蓝）
- `reviewing` → "对峙审查" → `#C75A4A`（红）
- `delivering` → "交付中" → `#E4A84B`（金）
- `dissolving` → "解散中" → `#8B6CCF`（紫）

系统 SHALL 通过 `describeSquadState(squad)` 函数返回简短的状态说明文案，包含阶段标签和成员数。

### Requirement: Squad 环形布局

系统 SHALL 通过 `layoutSquad(squad, tasks, center, baseRadius)` 函数计算 Squad 的环形布局：
- `lead` SHALL 位于环形正上方（angle=0）
- 其余成员 SHALL 按角色优先级顺时针排列：`lead` → `contributor` → `reviewer` → `boundary_keeper`
- 同角色 SHALL 按加入时间 `joinedAt` 升序排列
- 半径 SHALL 根据阶段动态调整：
  - `forming`：0.85 × baseRadius（紧凑，体现召集）
  - `working`：1.0 × baseRadius（标准）
  - `reviewing`：1.05 × baseRadius（稍扩张，体现对峙）
  - `delivering`：0.95 × baseRadius（紧凑，体现汇聚交付）
  - `dissolving`：1.2 × baseRadius（扩张，体现散开）

布局结果 SHALL 包含 `memberAngles`（成员角度映射，0=正上方，顺时针递增）和 `memberRoles`（成员角色映射）。

系统 SHALL 通过 `getMemberPositions(group)` 函数将环形布局转换为画布坐标（归一化 0-1）。

#### Scenario: lead 位于正上方
- **GIVEN** squad 有 1 个 lead 和 2 个 contributor
- **WHEN** 调用 `layoutSquad(squad, tasks)`
- **THEN** lead 的 angle 为 0
- **AND** lead 的位置为 `(centerX, centerY - radius)`（即正上方）

### Requirement: Squad 证据流连线

系统 SHALL 通过 `buildSquadFlows(group)` 函数构造 Squad 内部的证据流连线：
- `lead` 与每个非 lead 成员之间 SHALL 有双向证据流
- `working` 阶段下，所有 `contributor` 之间 SHALL 互连（弱流，intensity=0.3）
- `reviewing` 阶段下，`reviewer` → `lead` SHALL 额外生成一条对峙连线（`adversarial=true`，红色 `#C75A4A`，intensity=0.9）

每条证据流 SHALL 包含 `squadId` / `fromId` / `toId` / `color` / `intensity` / `adversarial` 字段。

### Requirement: Squad 进度计算

系统 SHALL 通过 `computeSquadProgress(squad, tasks)` 函数计算 Squad 整体进度（0-1）：
- `dissolving` 阶段 SHALL 强制返回 1
- 其他阶段 SHALL 返回 squad 关联任务的平均 progress
- 任务列表为空时 SHALL 返回 0
- 结果 SHALL 被 clamp 到 [0, 1]

### Requirement: Squad Canvas 视觉聚合渲染

系统 SHALL 通过 `drawSquadHalo(rctx, group, size, timePhase, animate, reduced)` 函数绘制 Squad 的环形光晕，包含 5 层视觉：
1. 外圈径向渐变光晕（阶段色，`dissolving` 阶段透明度降为 0.4）
2. 成员环线（虚线，缓慢旋转，`animate && !reduced` 时启用 `lineDashOffset` 动画）
3. 进度弧（从 12 点钟开始顺时针，按 `progress` 弧长填充，lineCap=round）
4. 对峙光带（`hasAdversarialReview` 或 `phase === "reviewing"` 时显示，红色虚线外圈）
5. 中心标签（squad 名称 + 阶段中文标签 + 进度百分比）

系统 SHALL 通过 `drawSquadFlows(rctx, flows, agentPositions, size, timePhase, animate, reduced)` 函数绘制证据流：
- 普通流：颜色细线，透明度由 `intensity` 决定
- 对峙流：红色虚线（`#C75A4A99`），`lineDashOffset` 动画
- 流动粒子：`intensity > 0.4` 时显示，对峙流粒子数为 2，普通流粒子数为 1

#### Scenario: reviewing 阶段渲染对峙光带
- **GIVEN** squad 处于 `reviewing` 阶段
- **WHEN** 调用 `drawSquadHalo(...)`
- **THEN** 在进度弧外圈额外绘制红色虚线圆环（`#C75A4A80`，lineDash=[8,4]）

### Requirement: HabitatWorkspace 集成 Squad 数据流

`HabitatWorkspace` 组件 SHALL 通过 `buildSquadRenderBundle(snapshot)` 函数构建 Squad 渲染包（`groups` + `flows`）：
- 已解散的 squad（`phase === "dissolving" && dissolvedAt` 已填充）SHALL 被跳过
- 每个 active squad SHALL 通过 `layoutSquad` 计算环形布局
- 每个 active squad SHALL 通过 `buildSquadFlows` 构造证据流

组件 SHALL 通过 `mergePositions(defaultPositions, squadGroups)` 函数合并位置：
- 在 squad 中的 Agent 位置 SHALL 被 squad 环形位置覆盖
- 不在任何 squad 中的 Agent SHALL 保持默认位置

组件 SHALL 将 `squadGroups` 和 `squadFlows` 传递给 `WorkspaceCanvas` 组件。

组件 SHALL 在 topbar 显示当前 squad 的状态说明（通过 `describeSquadState`），无 active squad 时不显示。

### Requirement: WorkspaceCanvas 接收集群参数

`WorkspaceCanvas` 组件 SHALL 接受新增的 `squadGroups: SquadRenderGroup[]` 和 `squadFlows: SquadEvidenceFlow[]` 参数。

渲染顺序 SHALL 为：
1. 背景渐变 + 网格 + 浮动粒子
2. **Squad 环形光晕**（通过 `drawSquadHalo` 绘制每个 group）
3. **Squad 证据流**（通过 `drawSquadFlows` 绘制，在普通 connections 之前）
4. 普通 connections
5. Agent 光体（最上层，作为视觉焦点）
6. 任务核心脉冲环

Agent 光体作为视觉焦点位于最上层，证据流和 connections 在 Agent 之下作为连接线层。

`useEffect` 依赖数组 SHALL 包含 `squadGroups` 和 `squadFlows`，确保 squad 数据变化触发重渲染。

## MODIFIED Requirements

### Requirement: DynamicSquad 领域类型

`DynamicSquad` 接口 SHALL 包含以下新增字段：
- `phase: SquadPhase` — 当前生命周期阶段
- `phaseEnteredAt: string` — 阶段进入时间（ISO）
- `leadAgentId: string` — 小队领队 Agent ID
- `memberRoles: SquadMemberRole[]` — 成员角色映射
- `hasAdversarialReview: boolean` — 是否处于对峙状态
- `dissolvedAt?: string` — 解散时间（仅 dissolving 阶段后填充）

原有字段（`id` / `goalId` / `label` / `objective` / `agentIds` / `taskIds` / `formedAt` / `dissolveWhenComplete`）保持不变。
