# Checklist — Squad 集群系统

## 领域层契约

- [x] Checkpoint 1: `DynamicSquad` 接口包含 `phase` / `phaseEnteredAt` / `leadAgentId` / `memberRoles` / `hasAdversarialReview` / `dissolvedAt` 字段
- [x] Checkpoint 2: `SquadPhase` 类型定义为 5 阶段联合类型 `forming | working | reviewing | delivering | dissolving`
- [x] Checkpoint 3: `AgentRoleInSquad` 类型定义为 4 角色联合类型 `lead | contributor | reviewer | boundary_keeper`
- [x] Checkpoint 4: `SquadMemberRole` 接口包含 `agentId` / `role` / `joinedAt` 字段

## 状态机模块（squadLifecycle.ts）

- [x] Checkpoint 5: `SQUAD_PHASE_TRANSITIONS` 正确定义转换图（forming→working；working→reviewing/delivering/dissolving；reviewing→working/delivering；delivering→dissolving；dissolving→∅）
- [x] Checkpoint 6: `SQUAD_PHASE_LABELS` 5 阶段中文标签完整（召集中/协作中/对峙审查/交付中/解散中）
- [x] Checkpoint 7: `SQUAD_PHASE_COLORS` 5 阶段颜色映射完整（#4BA89A/#4E72D8/#C75A4A/#E4A84B/#8B6CCF）
- [x] Checkpoint 8: `PHASE_REQUIRED_ROLES` 各阶段所需角色正确（forming=lead；working=lead+contributor；reviewing=lead+reviewer；delivering=lead+boundary_keeper；dissolving=lead）
- [x] Checkpoint 9: `canTransitionTo(from, to)` 在合法转换时返回 true，非法转换时返回 false
- [x] Checkpoint 10: `transitionSquadPhase` 合法转换时返回新对象（不可变），非法转换时抛出 Error
- [x] Checkpoint 11: `transitionSquadPhase` 进入 dissolving 阶段时填充 `dissolvedAt`
- [x] Checkpoint 12: `getAgentsByRole(squad, role)` 正确返回担任指定角色的 Agent ID 列表
- [x] Checkpoint 13: `missingRolesForPhase(squad)` 返回当前阶段缺失的角色数组
- [x] Checkpoint 14: `computeSquadProgress` dissolving 强制返回 1，其他阶段返回关联任务平均 progress，结果 clamp [0,1]
- [x] Checkpoint 15: `describeSquadState` 返回包含阶段标签和成员数的状态说明文案

## UI 类型层（types.ts）

- [x] Checkpoint 16: re-export `DynamicSquad` / `SquadPhase` / `AgentRoleInSquad` 领域类型
- [x] Checkpoint 17: `SquadRenderGroup` 接口包含 squadId/label/objective/phase/phaseColor/centerX/centerY/radius/memberAgentIds/memberAngles/memberRoles/progress/hasAdversarialReview/leadAgentId 字段
- [x] Checkpoint 18: `SquadEvidenceFlow` 接口包含 squadId/fromId/toId/color/intensity/adversarial 字段
- [x] Checkpoint 19: `SquadRenderBundle` 接口包含 groups 和 flows 字段

## 布局计算层（squadLayout.ts）

- [x] Checkpoint 20: `ROLE_PRIORITY` 正确定义（lead=0, contributor=1, reviewer=2, boundary_keeper=3）
- [x] Checkpoint 21: `DEFAULT_SQUAD_CENTER` 默认值 {x:0.5, y:0.5}
- [x] Checkpoint 22: `DEFAULT_SQUAD_RADIUS` 默认值 0.18
- [x] Checkpoint 23: `radiusFactorForPhase` 5 阶段系数正确（forming=0.85, working=1.0, reviewing=1.05, delivering=0.95, dissolving=1.2）
- [x] Checkpoint 24: `layoutSquad` 成员排序规则：先按角色优先级，同角色按 joinedAt 升序
- [x] Checkpoint 25: `layoutSquad` lead 固定 angle=0（正上方）
- [x] Checkpoint 26: `layoutSquad` 其余成员顺时针均匀分布
- [x] Checkpoint 27: `layoutSquad` 返回值包含 memberAngles 和 memberRoles 映射
- [x] Checkpoint 28: `getMemberPositions` 正确将 angle 转换为 dx/dy（dx=sin(angle)*radius, dy=-cos(angle)*radius）
- [x] Checkpoint 29: `buildSquadFlows` lead 与每个非 lead 成员之间生成双向流
- [x] Checkpoint 30: `buildSquadFlows` working 阶段下 contributor 之间生成弱连接（intensity=0.3）
- [x] Checkpoint 31: `buildSquadFlows` reviewing 阶段下 reviewer→lead 额外生成对峙连线（adversarial=true, color=#C75A4A, intensity=0.9）

## Canvas 渲染层（squadRenderer.ts）

- [x] Checkpoint 32: `drawSquadHalo` 绘制 5 层视觉：径向光晕/虚线环/进度弧/对峙光带/中心标签
- [x] Checkpoint 33: `drawSquadHalo` dissolving 阶段透明度降为 0.4
- [x] Checkpoint 34: `drawSquadHalo` 进度弧从 12 点钟开始顺时针填充
- [x] Checkpoint 35: `drawSquadHalo` 仅在 hasAdversarialReview 或 phase==="reviewing" 时绘制对峙光带
- [x] Checkpoint 36: `drawSquadHalo` 中心标签包含 squad 名称 + 阶段中文标签 + 进度百分比
- [x] Checkpoint 37: `drawSquadFlows` 普通流颜色细线，透明度由 intensity 决定
- [x] Checkpoint 38: `drawSquadFlows` 对峙流为红色虚线（#C75A4A99）
- [x] Checkpoint 39: `drawSquadFlows` 流动粒子仅在 intensity>0.4 时显示
- [x] Checkpoint 40: `drawSquadFlows` 对峙流粒子数为 2，普通流粒子数为 1
- [x] Checkpoint 41: `drawSquadPulse` 在 pulseProgress∈(0,1) 时绘制扩张渐隐的圆环

## 主容器集成（HabitatWorkspace.tsx）

- [x] Checkpoint 42: `buildSquadRenderBundle` 跳过已解散的 squad（phase==="dissolving" && dissolvedAt 已填充）
- [x] Checkpoint 43: `buildSquadRenderBundle` 对每个 active squad 调用 layoutSquad 和 buildSquadFlows
- [x] Checkpoint 44: `mergePositions` 在 squad 中的 Agent 位置被 squad 环形位置覆盖
- [x] Checkpoint 45: `mergePositions` 不在任何 squad 中的 Agent 保持默认位置
- [x] Checkpoint 46: 组件向 WorkspaceCanvas 传递 squadGroups 和 squadFlows props
- [x] Checkpoint 47: topbar 在有 active squad 时显示 describeSquadState 文案
- [x] Checkpoint 48: topbar 在无 active squad 时不显示 squad 状态徽章

## Canvas 组件扩展（WorkspaceCanvas.tsx）

- [x] Checkpoint 49: WorkspaceCanvasProps 新增 squadGroups 和 squadFlows 参数
- [x] Checkpoint 50: 渲染顺序为：背景 → squad 光晕 → squad 证据流 → 普通 connections → Agent（最上层视觉焦点）→ 任务核心
- [x] Checkpoint 51: useEffect 依赖数组包含 squadGroups 和 squadFlows
- [x] Checkpoint 52: drawSquadHalo 在背景粒子后、Agent 前绘制
- [x] CheckTask 53: drawSquadFlows 在普通 connections 前绘制

## Mock 数据（habitatMock.ts）

- [x] Checkpoint 54: createMockSquad 返回的 squad 包含 phase/phaseEnteredAt/leadAgentId/memberRoles/hasAdversarialReview 字段
- [x] Checkpoint 55: mock squad 包含 6 个成员角色映射（planner=lead, steward=boundary_keeper, 3 个 ephemeral=contributor, guardian=reviewer）

## Barrel Export（index.ts）

- [x] Checkpoint 56: 导出 layoutSquad/getMemberPositions/buildSquadFlows/DEFAULT_SQUAD_CENTER/DEFAULT_SQUAD_RADIUS
- [x] Checkpoint 57: 导出 drawSquadHalo/drawSquadFlows/drawSquadPulse
- [x] Checkpoint 58: 导出类型 SquadRenderGroup/SquadEvidenceFlow/SquadRenderBundle
- [x] Checkpoint 59: 在类型 re-export 中包含 DynamicSquad/SquadPhase/AgentRoleInSquad

## 样式（styles.css）

- [x] Checkpoint 60: `.habitat-squad-status` 样式存在（圆角徽章，蓝色背景 #4E72D8 透明度 0.08）

## 验证

- [x] Checkpoint 61: `npx tsc --noEmit` 退出码为 0
- [x] Checkpoint 62: `npx vitest run src/` 全部测试通过（722 passed, 10 skipped, 0 failed）
- [x] Checkpoint 63: 防巨石验证：habitat 目录文件职责单一，新增 3 个模块各自独立可测试
