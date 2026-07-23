/**
 * memory/broker.ts — MemoryBroker 神经记忆中枢
 *
 * 4 层神经记忆的统一入口。Agent 声明意图（"我要写入一条发现"），
 * 不声明层级。Broker 根据内容自动路由到正确的记忆层。
 *
 * 3 种访问模式 (对应 AgentRoleProfile.memoryAccess.modes):
 *   preload()  — PUSH 模式：agent 主动推送到工作区（不写持久层）
 *   query()    — DIRECT 模式：跨层检索（Layer 0-3 统一打分排序）
 *   commit()   — BROKERED WRITE：agent 声明写入意图，broker 决定写到哪层
 *
 * commit 路由规则：
 *   - confidence >= 0.6 → 写 Layer 1 (MemoryStore) + 若有 relatedKeys 则建 Layer 2 边
 *   - confidence < 0.6  → 不写持久层，仅 preload 到工作区 + 记录负信号 tag
 *   - 同 trigger→action 模式累计 ≥ 3 次 → 自动 extractReflex 写 Layer 3
 *
 * 设计约束（遵守用户约定）：
 *   - 纯内存，不接数据库
 *   - 不新增 npm 依赖
 *   - 文件持久化在 Phase 3 通过可选 PersistenceAdapter 注入（本文件不依赖 fs）
 */

import type { EvidenceEntry } from "../types";
import type { MemoryEntry } from "../spine/types";
import type { MemoryStore } from "./store";
import type { PersistenceBackend } from "./persistence/adapter";
import type {
  MemoryAssociation,
  AssociationRelation,
  ReflexPathway,
  MemoryQueryResult,
  CommitResult,
} from "./types";

/** preload 工作区条目 — 不持久化，仅本次运行可见 */
interface PreloadEntry {
  kind: MemoryEntry["kind"];
  value: string;
  tags?: string[];
}

/** commit 意图 — agent 声明想写什么，broker 决定写到哪层 */
export interface CommitIntent {
  kind: MemoryEntry["kind"];
  key: string;
  value: string;
  confidence: number;
  tags?: string[];
  /** 关联到的其它 MemoryEntry.key — 触发 Layer 2 关联边创建 */
  relatedKeys?: string[];
  /** 行业分区 (如 "apparel") */
  industry?: string;
  /** 反射提取线索 — 若提供 trigger+action，累计 ≥3 次自动形成 ReflexPathway */
  reflexTrigger?: string;
  reflexAction?: string;
}

/** 查询参数 */
export interface BrokerQuery {
  text?: string;
  tags?: string[];
  layers?: (0 | 1 | 2 | 3)[];
  limit?: number;
}

/** commit 置信度阈值 — 低于此值不写持久层 */
export const COMMIT_CONFIDENCE_THRESHOLD = 0.6;

/** 关联强化步长 — 每次共现 weight += 此值 */
export const ASSOCIATION_REINFORCE_STEP = 0.1;

/** 反射提取阈值 — 同 trigger→action 累计此次数后形成肌肉记忆 */
export const REFLEX_EXTRACTION_THRESHOLD = 3;

let assocCounter = 0;
let reflexCounter = 0;
let preloadCounter = 0;

function nextAssocId(): string {
  assocCounter += 1;
  return `assoc-${assocCounter}`;
}

function nextReflexId(): string {
  reflexCounter += 1;
  return `reflex-${reflexCounter}`;
}

function nextPreloadId(): string {
  preloadCounter += 1;
  return `preload-${preloadCounter}`;
}

/** 反射提取计数器 key — trigger|action|industry */
function reflexCounterKey(trigger: string, action: string, industry?: string): string {
  return `${trigger}||${action}||${industry ?? ""}`;
}

export class MemoryBroker {
  /** preload 工作区 — 不持久化的临时信息 */
  private readonly preloaded: PreloadEntry[] = [];
  /** 反射提取计数 — key = trigger||action||industry → count */
  private readonly reflexCounts = new Map<string, number>();

  constructor(
    /** Layer 0: 工作记忆 — EvidenceLedger */
    private readonly ledger: EvidenceEntry[],
    /** Layer 1: 短期记忆 — MemoryStore */
    private readonly store: MemoryStore,
    /** Layer 2: 关联记忆 — 图谱边 */
    private readonly associations: Map<string, MemoryAssociation>,
    /** Layer 3: 肌肉记忆 — 反射通路 */
    private readonly reflexes: Map<string, ReflexPathway>,
    /** 注入 now 以保证测试可复现 */
    private now: Date = new Date(),
    /** 可选持久化后端 — 注入后 commit 异步写入（文件或 Neon PostgreSQL） */
    private readonly persistence?: PersistenceBackend,
  ) {}

  // === PUSH 模式: preload ===

  /** 推送信息到工作区（不写持久层）。供 agent 在 query 前预载上下文。 */
  preload(entry: PreloadEntry): void {
    this.preloaded.push({ ...entry, tags: entry.tags ?? [] });
  }

  /** 取全部 preload 条目（测试/调试用） */
  listPreloaded(): readonly PreloadEntry[] {
    return this.preloaded;
  }

  // === DIRECT 模式: query ===

  /**
   * 跨层检索。统一打分排序：
   *   文本匹配 0.4 + tag 匹配 0.3 + 关联权重 0.3
   *
   * layers 未指定时搜全部 4 层。
   */
  query(q: BrokerQuery): MemoryQueryResult[] {
    const layers = q.layers ?? [0, 1, 2, 3];
    const limit = q.limit ?? 20;
    const textLower = q.text?.toLowerCase();
    const tags = q.tags ?? [];

    const results: MemoryQueryResult[] = [];

    // Layer 0: EvidenceLedger
    if (layers.includes(0)) {
      for (const ev of this.ledger) {
        const haystack = `${ev.subject} ${ev.claim} ${ev.value ?? ""}`.toLowerCase();
        const matchedOn: MemoryQueryResult["matchedOn"] = [];
        let score = 0;
        if (textLower && haystack.includes(textLower)) {
          score += 0.4;
          matchedOn.push("text");
        }
        // EvidenceEntry 无 tags 字段 — 用 subject 作为伪 tag 匹配
        if (tags.length > 0 && tags.some((t) => ev.subject.toLowerCase().includes(t.toLowerCase()))) {
          score += 0.3;
          matchedOn.push("tag");
        }
        if (score > 0) {
          results.push({
            layer: 0,
            key: ev.id,
            text: ev.claim,
            score,
            matchedOn,
            raw: ev,
          });
        }
      }
    }

    // Layer 1: MemoryStore
    if (layers.includes(1)) {
      for (const entry of this.store.list()) {
        const haystack = entry.value.toLowerCase();
        const matchedOn: MemoryQueryResult["matchedOn"] = [];
        let score = 0;
        if (textLower && haystack.includes(textLower)) {
          score += 0.4;
          matchedOn.push("text");
        }
        if (tags.length > 0 && entry.tags && tags.some((t) => entry.tags!.includes(t))) {
          score += 0.3;
          matchedOn.push("tag");
        }
        if (score > 0) {
          results.push({
            layer: 1,
            key: entry.key,
            text: entry.value,
            score,
            matchedOn,
            raw: entry,
          });
        }
      }
    }

    // Layer 2: Associations — 沿边扩展（若 text 命中了 Layer 1 的 key，
    // 找到关联的其它 key 并加权）
    if (layers.includes(2)) {
      const hitKeys = new Set(results.filter((r) => r.layer === 1).map((r) => r.key));
      for (const assoc of this.associations.values()) {
        if (hitKeys.has(assoc.fromKey) || hitKeys.has(assoc.toKey)) {
          const otherKey = hitKeys.has(assoc.fromKey) ? assoc.toKey : assoc.fromKey;
          const existing = results.find((r) => r.key === otherKey && r.layer === 1);
          if (existing) {
            existing.score += assoc.weight * 0.3;
            if (!existing.matchedOn.includes("association")) {
              existing.matchedOn.push("association");
            }
          }
        }
      }
    }

    // Layer 3: ReflexPathway
    if (layers.includes(3)) {
      for (const reflex of this.reflexes.values()) {
        const haystack = `${reflex.trigger} ${reflex.action}`.toLowerCase();
        const matchedOn: MemoryQueryResult["matchedOn"] = [];
        let score = 0;
        if (textLower && haystack.includes(textLower)) {
          score += 0.4;
          matchedOn.push("text");
        }
        if (tags.length > 0 && reflex.tags.some((t) => tags.includes(t))) {
          score += 0.3;
          matchedOn.push("tag");
        }
        if (score > 0) {
          results.push({
            layer: 3,
            key: reflex.id,
            text: `${reflex.trigger} → ${reflex.action}`,
            score: Math.min(score + reflex.confidence * 0.3, 1),
            matchedOn,
            raw: reflex,
          });
        }
      }
    }

    // preload 工作区也搜（算 Layer 0 的延伸，不计入持久层）
    if (textLower || tags.length > 0) {
      for (const pe of this.preloaded) {
        const haystack = pe.value.toLowerCase();
        const matchedOn: MemoryQueryResult["matchedOn"] = [];
        let score = 0;
        if (textLower && haystack.includes(textLower)) {
          score += 0.4;
          matchedOn.push("text");
        }
        if (tags.length > 0 && pe.tags && tags.some((t) => pe.tags!.includes(t))) {
          score += 0.3;
          matchedOn.push("tag");
        }
        if (score > 0) {
          results.push({
            layer: 0,
            key: nextPreloadId(),
            text: pe.value,
            score,
            matchedOn,
            raw: pe,
          });
        }
      }
    }

    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  // === BROKERED WRITE: commit ===

  /**
   * 写入意图。Broker 根据置信度和内容决定路由：
   *   - confidence >= 0.6 → 写 Layer 1 + 建 Layer 2 关联边
   *   - confidence < 0.6  → 仅 preload，不持久化
   *   - 若提供 reflexTrigger + reflexAction，累计 ≥3 次自动提取 ReflexPathway
   */
  commit(intent: CommitIntent): CommitResult {
    const nowIso = this.now.toISOString();
    const layersWritten: (0 | 1 | 2 | 3)[] = [];
    const newAssociations: MemoryAssociation[] = [];
    let entry: MemoryEntry | undefined;
    let newReflex: ReflexPathway | undefined;

    // 反射计数（无论 confidence 高低都计）
    // 自指防护：trigger === action 时不计 — 自指反射无意义
    if (intent.reflexTrigger && intent.reflexAction &&
        intent.reflexTrigger.trim().toLowerCase() !== intent.reflexAction.trim().toLowerCase()) {
      const ck = reflexCounterKey(intent.reflexTrigger, intent.reflexAction, intent.industry);
      const count = (this.reflexCounts.get(ck) ?? 0) + 1;
      this.reflexCounts.set(ck, count);
      if (count >= REFLEX_EXTRACTION_THRESHOLD) {
        newReflex = this.extractReflex(intent.reflexTrigger, intent.reflexAction, intent.industry) ?? undefined;
        if (newReflex) {
          layersWritten.push(3);
        }
      }
    }

    // 置信度路由
    if (intent.confidence >= COMMIT_CONFIDENCE_THRESHOLD) {
      // 写 Layer 1
      entry = {
        id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        key: intent.key,
        kind: intent.kind,
        value: intent.value,
        createdAt: nowIso,
        tags: intent.tags,
      };
      this.store.remember(entry);
      layersWritten.push(1);

      // 建 Layer 2 关联边
      if (intent.relatedKeys && intent.relatedKeys.length > 0) {
        for (const toKey of intent.relatedKeys) {
          if (toKey === intent.key) continue; // 不自环
          const assoc = this.createOrReinforceAssociation(intent.key, toKey, "semantic");
          if (assoc) {
            newAssociations.push(assoc);
          }
        }
        if (newAssociations.length > 0) {
          layersWritten.push(2);
        }
      }

      // 文件持久化（异步，不阻塞 — 失败不影响内存写入）
      if (this.persistence) {
        this.persistAsync(entry, newAssociations, newReflex, intent.industry);
      }
    } else {
      // confidence 不足 → 仅 preload
      this.preload({
        kind: intent.kind,
        value: intent.value,
        tags: [...(intent.tags ?? []), "low_confidence"],
      });
      layersWritten.push(0);
    }

    return {
      persisted: intent.confidence >= COMMIT_CONFIDENCE_THRESHOLD,
      layersWritten,
      entry,
      newAssociations: newAssociations.length > 0 ? newAssociations : undefined,
      newReflex,
      reason: intent.confidence < COMMIT_CONFIDENCE_THRESHOLD
        ? `confidence ${intent.confidence.toFixed(2)} < threshold ${COMMIT_CONFIDENCE_THRESHOLD}`
        : undefined,
    };
  }

  /**
   * 异步持久化 — fire-and-forget，不阻塞 commit 返回。
   * 失败只记录，不影响内存状态（内存是 source of truth）。
   */
  private persistAsync(
    entry: MemoryEntry,
    associations: MemoryAssociation[],
    reflex: ReflexPathway | undefined,
    industry?: string,
  ): void {
    if (!this.persistence) return;
    // fire-and-forget — 用 void 标记不等待
    void this.persistence.commitEntry(entry, industry).catch(() => {
      // 持久化失败不影响内存 — 仅静默（生产环境可加日志）
    });
    for (const assoc of associations) {
      void this.persistence.commitAssociation(assoc, industry).catch(() => {});
    }
    if (reflex) {
      void this.persistence.commitReflex(reflex, industry).catch(() => {});
    }
  }

  /** 等待全部未完成的持久化写入完成（测试用） */
  async flush(): Promise<void> {
    // persistence 写入是 fire-and-forget；此方法给测试一个等待点
    // 由于 persistAsync 内部 catch 了 promise，这里无法真正 await
    // 实际等待通过直接调用 persistence 方法实现（测试中用 adapter.commitEntry）
    if (this.persistence) {
      await this.persistence.compactAll().catch(() => {});
    }
  }

  // === 关联强化 ===

  /**
   * 创建或强化关联边。若 fromKey->toKey 同 relation 已存在，则 weight += 0.1（上限 1.0）。
   * 返回新建或强化后的 association（强化时返回更新后的对象）。
   *
   * v3: 增加可选 initialWeight 和 metadata 参数。
   * 新建边时使用 initialWeight（默认 0.3）作为初始权重，
   * 让传导系数成为边的初始权重而非固定值。
   * metadata 存储传导系数、来源规则等附加信息供归因引擎读取。
   */
  createOrReinforceAssociation(
    fromKey: string,
    toKey: string,
    relation: AssociationRelation,
    initialWeight?: number,
    metadata?: Record<string, unknown>,
  ): MemoryAssociation | null {
    const nowIso = this.now.toISOString();
    const existing = this.findAssociation(fromKey, toKey, relation);
    if (existing) {
      existing.weight = Math.min(1.0, existing.weight + ASSOCIATION_REINFORCE_STEP);
      existing.coOccurrenceCount += 1;
      existing.lastReinforcedAt = nowIso;
      // v3: 如果有新的 metadata，合并到已有 metadata 上
      if (metadata) {
        existing.metadata = { ...(existing.metadata ?? {}), ...metadata };
      }
      return existing;
    }
    const assoc: MemoryAssociation = {
      id: nextAssocId(),
      fromKey,
      toKey,
      relation,
      weight: initialWeight ?? 0.3,
      createdAt: nowIso,
      lastReinforcedAt: nowIso,
      coOccurrenceCount: 1,
      ...(metadata ? { metadata } : {}),
    };
    this.associations.set(assoc.id, assoc);
    return assoc;
  }

  /** 公开强化接口 — 供外部调用 */
  reinforceAssociation(fromKey: string, toKey: string, relation: AssociationRelation): void {
    this.createOrReinforceAssociation(fromKey, toKey, relation);
  }

  /** 查找已存在的同向同类型关联边 */
  private findAssociation(
    fromKey: string,
    toKey: string,
    relation: AssociationRelation,
  ): MemoryAssociation | undefined {
    for (const assoc of this.associations.values()) {
      if (assoc.fromKey === fromKey && assoc.toKey === toKey && assoc.relation === relation) {
        return assoc;
      }
    }
    return undefined;
  }

  // === 肌肉记忆提取 ===

  /**
   * 提取反射通路。若该 trigger→action 已存在，增加 hitCount 并提升 confidence。
   * 新建时 confidence = 0.5，每次命中 +0.1（上限 1.0）。
   * 注意：本方法不检查阈值 — 调用方（commit）负责用 reflexCounts 跟踪。
   *
   * 自指防护：若 trigger === action（语义相同），跳过提取 — 自指反射无意义。
   */
  extractReflex(trigger: string, action: string, industry?: string): ReflexPathway | null {
    // 自指防护 — trigger 和 action 语义相同时不提取反射
    if (trigger.trim().toLowerCase() === action.trim().toLowerCase()) {
      return null;
    }
    const nowIso = this.now.toISOString();
    // 查找已存在的同 trigger+action 反射
    let existing: ReflexPathway | undefined;
    for (const r of this.reflexes.values()) {
      if (r.trigger === trigger && r.action === action && r.industry === industry) {
        existing = r;
        break;
      }
    }
    if (existing) {
      existing.hitCount += 1;
      existing.confidence = Math.min(1.0, existing.confidence + 0.1);
      existing.lastTriggeredAt = nowIso;
      return existing;
    }
    // 新建
    const reflex: ReflexPathway = {
      id: nextReflexId(),
      trigger,
      action,
      confidence: 0.5,
      hitCount: 1,
      createdAt: nowIso,
      lastTriggeredAt: nowIso,
      tags: [],
      industry,
    };
    this.reflexes.set(reflex.id, reflex);
    return reflex;
  }

  // === 访问器 (测试/调试用) ===

  get associationCount(): number {
    return this.associations.size;
  }

  get reflexCount(): number {
    return this.reflexes.size;
  }

  get preloadCount(): number {
    return this.preloaded.length;
  }

  /** 列出全部反射通路 */
  listReflexes(): ReflexPathway[] {
    return Array.from(this.reflexes.values());
  }

  /** 列出全部关联边 */
  listAssociations(): MemoryAssociation[] {
    return Array.from(this.associations.values());
  }

  /** 取反射提取计数（测试用） */
  getReflexCount(trigger: string, action: string, industry?: string): number {
    return this.reflexCounts.get(reflexCounterKey(trigger, action, industry)) ?? 0;
  }

  /** 设置 now（测试用，保证确定性） */
  setNow(now: Date): void {
    this.now = now;
  }
}
