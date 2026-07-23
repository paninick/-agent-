/**
 * client/habitat/index.ts — 活动空间 barrel export
 */

export { HabitatWorkspace } from "./HabitatWorkspace";
export { WorkspaceCanvas } from "./WorkspaceCanvas";
export { DecisionCard } from "./DecisionCard";
export { TaskCore } from "./TaskCore";
export { GoalTrack } from "./GoalTrack";
export { MemoryPanel } from "./MemoryPanel";
export { ActivityTimeline } from "./ActivityTimeline";
export { AttentionPulse } from "./AttentionPulse";
export { FocusDrawer } from "./FocusDrawer";
export { NeedFocus } from "./NeedFocus";
export { SquadFocus } from "./SquadFocus";
export { ResponseFocus } from "./ResponseFocus";
export { useFocusTrap } from "./useFocusTrap";
export { useHabitatMotion } from "./useHabitatMotion";
export { createMockHabitatSnapshot } from "./habitatMock";
export { narrateCost } from "./costNarrative";
export type { CostNarrative } from "./costNarrative";
export { TrustPanel } from "./TrustPanel";
export { TimelinePanel } from "./TimelinePanel";
export type { TimelineEntry, TimelineCategory } from "./TimelinePanel";
export {
  habitatApi,
  useHabitatSnapshot,
  extractAutonomyFromRequest,
} from "./habitatApi";
export type {
  ApiResult,
  RequestActionResult,
  GoalAutonomyResult,
  MemoryConfirmResult,
  AsyncState as HabitatAsyncState,
} from "./habitatApi";
export {
  STATE_VISUAL,
  getStateVisual,
  computeStateScale,
  advanceTime,
} from "./habitatStates";
export type {
  StateVisual,
  StateMotion,
  StateRingStyle,
  StateIcon,
} from "./habitatStates";
export {
  layoutSquad,
  getMemberPositions,
  buildSquadFlows,
  DEFAULT_SQUAD_CENTER,
  DEFAULT_SQUAD_RADIUS,
} from "./squadLayout";
export {
  drawSquadHalo,
  drawSquadFlows,
  drawSquadPulse,
} from "./squadRenderer";
export type {
  AgentRenderPosition,
  TaskCoreDisplay,
  GoalTrackEntry,
  AttentionAllocation,
  AutonomyLevel,
  TimelineEventDisplay,
  CostSummary,
  SquadRenderGroup,
  SquadEvidenceFlow,
  SquadRenderBundle,
} from "./types";
export { computeAttentionAllocation } from "./types";
export type {
  AgentIdentity,
  PersonalGoalContract,
  DynamicTask,
  DynamicSquad,
  SquadPhase,
  AgentRoleInSquad,
  UserBoundaryRequest,
  HabitatMemoryArtifact,
  HabitatActivityEvent,
  HabitatSnapshot,
  MotionPreference,
} from "./types";
