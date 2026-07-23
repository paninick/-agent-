/**
 * memory/types.ts — 神经记忆架构类型 (Layer 2 + Layer 3 + 访问声明)
 *
 * 4 层神经记忆：
 *   Layer 0: Working memory  — EvidenceLedger (已有，../evidenceLedger)
 *   Layer 1: Short-term memory — MemoryStore (已有，./store)
 *   Layer 2: Associative memory — MemoryAssociation 图谱边 (本文件)
 *   Layer 3: Procedural memory — ReflexPathway 肌肉记忆 (本文件)
 *
 * MemoryBroker 是 4 层的中枢 (见 ./broker.ts)：
 *   preload()  — PUSH 模式：agent 主动推送到工作区
 *   query()    — DIRECT 模式：跨层检索
 *   commit()   — BROKERED WRITE：agent 声明意图，broker 路由到正确层
 *
 * Agent 不声明层级，只声明意图。Broker 根据内容路由。
 */

import type { MemoryEntry } from "../spine/types";

// === Layer 2: Associative Memory — 关联记忆图谱边 ===

/** 关联关系类型 */
export type AssociationRelation =
  | "supports" // 支持/印证
  | "contradicts" // 矛盾/反驳
  | "causes" // 因果
  | "temporal" // 时序
  | "semantic"; // 语义相似

/** 关联边 — 连接两个 MemoryEntry，随共现次数增强 */
export interface MemoryAssociation {
  id: string;
  /** 起点 MemoryEntry.key */
  fromKey: string;
  /** 终点 MemoryEntry.key */
  toKey: string;
  /** 关联类型 */
  relation: AssociationRelation;
  /** 权重 0-1，随共现次数增强 (每次 +0.1，上限 1.0) */
  weight: number;
  createdAt: string;
  /** 最后强化时间 */
  lastReinforcedAt: string;
  /** 共现次数 */
  coOccurrenceCount: number;
  /**
   * v3: 元数据 - 存储传导系数、来源规则等附加信息。
   * 如 { coefficient: 0.6, source: "transmission", lagDays: 30 }
   * 归因引擎可读取 coefficient 做加权连乘。
   */
  metadata?: Record<string, unknown>;
}

// === Layer 3: Procedural Memory — 肌肉记忆反射通路 ===

/** 反射通路 — 重复出现的 trigger→action 模式自动沉淀为肌肉记忆 */
export interface ReflexPathway {
  id: string;
  /** 触发条件描述 (如 "cotton_price rising above 20000") */
  trigger: string;
  /** 反射动作 (如 "probe yarn_price + verify textile_supply") */
  action: string;
  /** 反射可信度 0-1，随命中次数提升 */
  confidence: number;
  /** 命中次数 */
  hitCount: number;
  createdAt: string;
  /** 最后触发时间 */
  lastTriggeredAt?: string;
  /** 语义标签 */
  tags: string[];
  /** 行业分区 (如 "apparel") */
  industry?: string;
}

// === Agent 记忆访问声明 ===

/** 访问模式 — 对应 Broker 的 3 个接口 */
export type MemoryAccessMode = "preload" | "query" | "commit";

/** Agent 角色的记忆访问声明 — 加到 AgentRoleProfile.memoryAccess */
export interface MemoryAccessDeclaration {
  /** 该角色允许的访问模式 */
  modes: MemoryAccessMode[];
  /** commit 时允许写的 MemoryEntry.kind */
  writableKinds: MemoryEntry["kind"][];
  /** query 时允许读的记忆层 (0=工作, 1=短期, 2=关联, 3=肌肉) */
  readableLayers: (0 | 1 | 2 | 3)[];
}

// === Broker 查询与提交结果 ===

/** 查询命中的统一结果 — 跨层检索后排序返回 */
export interface MemoryQueryResult {
  /** 命中层 */
  layer: 0 | 1 | 2 | 3;
  /** 命中条目的 key (Layer 0 用 evidence.id) */
  key: string;
  /** 文本内容 (evidence.claim / memory.value / reflex.trigger 等) */
  text: string;
  /** 综合得分 0-1 (文本匹配 + tag 匹配 + 关联权重) */
  score: number;
  /** 命中原因标签 */
  matchedOn: ("text" | "tag" | "association" | "reflex")[];
  /** 原始条目 (类型层不同，用 unknown 便于调用方按 layer 断言) */
  raw: unknown;
}

/** commit 返回 — 告诉 agent 写到了哪层 */
export interface CommitResult {
  /** 是否写入持久层 (confidence >= 0.6 才写 Layer 1) */
  persisted: boolean;
  /** 写入的层 (0=未持久化仅 preload, 1=MemoryStore, 2=建了关联边, 3=提取了反射) */
  layersWritten: (0 | 1 | 2 | 3)[];
  /** 写入的 MemoryEntry (若 persisted) */
  entry?: MemoryEntry;
  /** 新建的关联边 (若有 relatedKeys) */
  newAssociations?: MemoryAssociation[];
  /** 新提取的反射通路 (若触发 extractReflex) */
  newReflex?: ReflexPathway;
  /** 跳过原因 (confidence 不足等) */
  reason?: string;
}
