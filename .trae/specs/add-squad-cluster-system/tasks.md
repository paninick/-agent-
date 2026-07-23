# Tasks — Squad 集群系统

> 注：本 spec 为 retroactive spec，所有任务已实施完成。任务清单用于追溯实施过程与后续扩展定位。

- [x] Task 1: 扩展 DynamicSquad 领域类型
  - [x] SubTask 1.1: 新增 `SquadPhase` 类型（5 阶段：forming/working/reviewing/delivering/dissolving）
  - [x] SubTask 1.2: 新增 `AgentRoleInSquad` 类型（4 角色：lead/contributor/reviewer/boundary_keeper）
  - [x] SubTask 1.3: 新增 `SquadMemberRole` 关系接口（agentId + role + joinedAt）
  - [x] SubTask 1.4: 在 `DynamicSquad` 接口中新增 phase/phaseEnteredAt/leadAgentId/memberRoles/hasAdversarialReview/dissolvedAt 字段

- [x] Task 2: 创建 squadLifecycle.ts 状态机模块
  - [x] SubTask 2.1: 定义 `SQUAD_PHASE_TRANSITIONS` 阶段转换图常量
  - [x] SubTask 2.2: 定义 `SQUAD_PHASE_LABELS` / `SQUAD_PHASE_COLORS` / `PHASE_REQUIRED_ROLES` 常量映射
  - [x] SubTask 2.3: 实现 `canTransitionTo(from, to)` 转换合法性校验函数
  - [x] SubTask 2.4: 实现 `transitionSquadPhase(squad, to, now)` 不可变转换函数（含非法转换抛错）
  - [x] SubTask 2.5: 实现 `getAgentsByRole(squad, role)` 角色查询函数
  - [x] SubTask 2.6: 实现 `missingRolesForPhase(squad)` 缺失角色检测函数
  - [x] SubTask 2.7: 实现 `computeSquadProgress(squad, tasks)` 进度计算函数（dissolving 强制 1，clamp [0,1]）
  - [x] SubTask 2.8: 实现 `describeSquadState(squad)` 状态文案生成函数

- [x] Task 3: 扩展 client/habitat/types.ts UI 类型
  - [x] SubTask 3.1: re-export `DynamicSquad` / `SquadPhase` / `AgentRoleInSquad` 领域类型
  - [x] SubTask 3.2: 新增 `SquadRenderGroup` 接口（squadId/label/phase/centerX/centerY/radius/memberAgentIds/memberAngles/memberRoles/progress 等）
  - [x] SubTask 3.3: 新增 `SquadEvidenceFlow` 接口（squadId/fromId/toId/color/intensity/adversarial）
  - [x] SubTask 3.4: 新增 `SquadRenderBundle` 接口（groups + flows）

- [x] Task 4: 创建 squadLayout.ts 环形布局计算模块
  - [x] SubTask 4.1: 定义 `ROLE_PRIORITY` 角色优先级常量（lead=0, contributor=1, reviewer=2, boundary_keeper=3）
  - [x] SubTask 4.2: 定义 `DEFAULT_SQUAD_CENTER` / `DEFAULT_SQUAD_RADIUS` 默认值常量
  - [x] SubTask 4.3: 实现 `radiusFactorForPhase(phase)` 半径系数函数（forming=0.85, working=1.0, reviewing=1.05, delivering=0.95, dissolving=1.2）
  - [x] SubTask 4.4: 实现 `layoutSquad(squad, tasks, center, baseRadius)` 环形布局主函数（按角色优先级+加入时间排序，lead 固定 angle=0）
  - [x] SubTask 4.5: 实现 `getMemberPositions(group)` 位置换算函数（angle→dx/dy，0=正上方顺时针）
  - [x] SubTask 4.6: 实现 `buildSquadFlows(group)` 证据流构造函数（lead↔member 双向 + working 阶段 contributor 互连 + reviewing 阶段 reviewer→lead 对峙连线）

- [x] Task 5: 创建 squadRenderer.ts Canvas 渲染辅助模块
  - [x] SubTask 5.1: 定义 `RenderContextLike` / `CanvasSize` 内部接口
  - [x] SubTask 5.2: 实现 `drawSquadHalo(rctx, group, size, timePhase, animate, reduced)` 环形光晕绘制（5 层：径向光晕/虚线环/进度弧/对峙光带/中心标签）
  - [x] SubTask 5.3: 实现 `drawSquadFlows(rctx, flows, agentPositions, size, timePhase, animate, reduced)` 证据流绘制（普通流+对峙流+流动粒子）
  - [x] SubTask 5.4: 实现 `drawSquadPulse(rctx, group, size, pulseProgress)` 阶段转换脉冲圈绘制

- [x] Task 6: 修改 habitatMock.ts 丰富 squad 数据
  - [x] SubTask 6.1: 在 `createMockSquad()` 中新增 phase="working" / phaseEnteredAt / leadAgentId="resident-planner"
  - [x] SubTask 6.2: 添加 6 个成员的 memberRoles 映射（planner=lead, steward=boundary_keeper, 3 个 ephemeral=contributor, guardian=reviewer）
  - [x] SubTask 6.3: 添加 hasAdversarialReview=false 字段
  - [x] SubTask 6.4: 在 agentIds 中补充 "resident-guardian"

- [x] Task 7: 修改 HabitatWorkspace.tsx 集成 squad 数据流
  - [x] SubTask 7.1: 导入 layoutSquad/getMemberPositions/buildSquadFlows/DEFAULT_SQUAD_CENTER 和 describeSquadState
  - [x] SubTask 7.2: 实现 `buildSquadRenderBundle(snapshot)` 函数（跳过已解散 squad，构造 groups+flows）
  - [x] SubTask 7.3: 实现 `mergePositions(defaultPositions, squadGroups)` 函数（squad 位置覆盖默认位置）
  - [x] SubTask 7.4: 在组件中调用 `useMemo` 计算 squadBundle 和 activeSquadDescription
  - [x] SubTask 7.5: 用 `mergePositions` 包裹 residentPositions 和 ephemeralPositions 计算
  - [x] SubTask 7.6: 向 WorkspaceCanvas 传递 squadGroups 和 squadFlows props
  - [x] SubTask 7.7: 在 topbar 的 agent-count 区域显示 activeSquadDescription

- [x] Task 8: 修改 WorkspaceCanvas.tsx 增加 squad 渲染分支
  - [x] SubTask 8.1: 导入 SquadRenderGroup/SquadEvidenceFlow 类型和 drawSquadHalo/drawSquadFlows 函数
  - [x] SubTask 8.2: 在 WorkspaceCanvasProps 中新增 squadGroups 和 squadFlows 参数
  - [x] SubTask 8.3: 在函数签名解构中添加 squadGroups/squadFlows
  - [x] SubTask 8.4: 在 render 函数中（背景粒子后、Agent 前）调用 drawSquadHalo 绘制每个 squad 光晕
  - [x] SubTask 8.5: 在 render 函数中（Agent 数据构建后、普通 connections 前）调用 drawSquadFlows 绘制证据流
  - [x] SubTask 8.6: 在 useEffect 依赖数组中添加 squadGroups 和 squadFlows

- [x] Task 9: 更新 index.ts barrel export
  - [x] SubTask 9.1: 导出 layoutSquad/getMemberPositions/buildSquadFlows/DEFAULT_SQUAD_CENTER/DEFAULT_SQUAD_RADIUS
  - [x] SubTask 9.2: 导出 drawSquadHalo/drawSquadFlows/drawSquadPulse
  - [x] SubTask 9.3: 导出类型 SquadRenderGroup/SquadEvidenceFlow/SquadRenderBundle
  - [x] SubTask 9.4: 在类型 re-export 中补充 DynamicSquad/SquadPhase/AgentRoleInSquad

- [x] Task 10: 扩展 styles.css 样式
  - [x] SubTask 10.1: 新增 `.habitat-squad-status` 样式（圆角徽章，蓝色背景，等宽字体优化）

- [x] Task 11: 验证 tsc + vitest
  - [x] SubTask 11.1: 运行 `npx tsc --noEmit`，确认 0 错误
  - [x] SubTask 11.2: 运行 `npx vitest run src/`，确认 722 passed / 10 skipped / 0 failed

- [x] Task 12: 修复 spec 渲染顺序描述（Checkpoint 50 偏差）
  - [x] SubTask 12.1: 修改 spec.md 中 "WorkspaceCanvas 接收集群参数" 部分的渲染顺序，从「背景→squad光晕→Agent→squad证据流→普通connections→任务核心」改为「背景→squad光晕→squad证据流→普通connections→Agent→任务核心」（Agent 在最上层作为视觉焦点）
  - [x] SubTask 12.2: 修改 checklist.md 中 Checkpoint 50 的描述以匹配新 spec
  - [x] SubTask 12.3: 勾选 Checkpoint 50

# Task Dependencies

- Task 2 依赖 Task 1（状态机引用 SquadPhase/AgentRoleInSquad 类型）
- Task 3 依赖 Task 1（UI 类型 re-export 领域类型）
- Task 4 依赖 Task 2 + Task 3（布局引用 SQUAD_PHASE_COLORS 和 SquadRenderGroup）
- Task 5 依赖 Task 3 + Task 2（渲染引用 SquadRenderGroup/SquadEvidenceFlow 和 SQUAD_PHASE_LABELS）
- Task 6 依赖 Task 1（mock 数据需要新字段）
- Task 7 依赖 Task 4 + Task 2（集成引用 layoutSquad 和 describeSquadState）
- Task 8 依赖 Task 5 + Task 3（Canvas 引用 drawSquadHalo 和 SquadRenderGroup 类型）
- Task 9 依赖 Task 4 + Task 5（barrel 导出新模块）
- Task 10 独立
- Task 11 依赖 Task 1-10 全部完成

# 后续扩展候选（不属于本 spec 范围）

- 集群阶段转换动画触发（forming/dissolving 脉冲圈实际激活）
- 多 squad 并存布局（避免环形重叠）
- 集群生命周期事件流（与 HabitatActivityEvent 集成）
- 集群状态机单元测试（squadLifecycle.test.ts）
- 集群布局单元测试（squadLayout.test.ts）
