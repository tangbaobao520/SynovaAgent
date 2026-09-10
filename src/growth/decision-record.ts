/**
 * src/growth/decision-record.ts — 决策记录（DecisionRecord）
 *
 * 导航权威（2026-09-06）第二章 §2.3/§2.8：老板凭直觉/经验拍板的新方向决策，
 * 是目标三类来源之一（诊断驱动 / 决策驱动 / 外部驱动）中「决策驱动」的载体。
 * 决策记录把老板的直觉纳入验证闭环，用结果裁决对错。
 *
 * 契约:
 *   @input  — DecisionRecordInput（decidedBy/direction/rationale/relationToDiagnosis/...）
 *   @output — DecisionRecordResult { ok, record?, error? }
 *   @degraded — store 失败 → { ok:false, error }（不抛，铁律 24/31）
 *   @error    — 校验失败 → { ok:false, error }；不抛
 */

import { randomUUID } from 'node:crypto';
import { createLogger } from '@synova/logger';
import type { GraphBridgeLike } from './goal-types';

const log = createLogger('growth/decision-record');

// ═══ 类型定义（第二章 §2.3 原样字段） ═══

/** 决策与诊断的关系：对齐 / 覆盖 / 无关 */
export type DecisionRelationToDiagnosis = 'aligned' | 'overriding' | 'unrelated';

/** 全部 3 个有效 relationToDiagnosis 值（模块内部校验用） */
const VALID_DECISION_RELATIONS: readonly DecisionRelationToDiagnosis[] = [
  'aligned', 'overriding', 'unrelated',
];

/**
 * DecisionRecord — 老板直觉拍板的决策记录。
 *
 * 与 `Goal.source.decisionRecordId` 关联（决策驱动的目标来源）。
 * 事后可补充/修正 rationale（§2.8 保留完整审计链）。
 */
export interface DecisionRecord {
  /** 唯一标识 */
  id: string;
  /** 决策人（老板/创始人） */
  decidedBy: { role: 'founder' | 'ga'; name: string };
  /** 决策时间（ISO-8601） */
  decidedAt: string;
  /** 决策内容（一句话方向，如 "明年进军东南亚市场"） */
  direction: string;
  /** 决策依据（老板口述的理由，可自由文本） */
  rationale: string;
  /** 与诊断的关系 */
  relationToDiagnosis: DecisionRelationToDiagnosis;
  /** 若 overriding：覆盖了哪条诊断建议 */
  overriddenRecommendationId?: string;
  /** 关联的约束（预算上限/资源，若老板口述） */
  constraints?: { budget?: number; resource?: string };
  /** 分解出的部门目标 */
  derivedGoals: string[];
}

/** 创建 DecisionRecord 的输入（id/decidedAt 由 create 生成） */
export interface DecisionRecordInput {
  decidedBy: { role: 'founder' | 'ga'; name: string };
  direction: string;
  rationale: string;
  relationToDiagnosis: DecisionRelationToDiagnosis;
  overriddenRecommendationId?: string;
  constraints?: { budget?: number; resource?: string };
  derivedGoals?: string[];
}

/** DecisionRecord 操作结果（fail-closed，不抛） */
export interface DecisionRecordResult {
  ok: boolean;
  record?: DecisionRecord;
  error?: string;
}

// ═══ 持久化常量 ═══

/** DecisionRecord 的节点类型（GraphStore 持久化键，模块内部） */
const DECISION_RECORD_NODE_TYPE = 'DECISION_RECORD';
/** 默认图名称（与 goal-store 一致，模块内部） */
const DECISION_RECORD_GRAPH = 'growth';

/**
 * 把 DecisionRecord 转成 GraphStore props（显式构造，避免类型逃逸断言）。
 */
function toProps(record: DecisionRecord): Record<string, unknown> {
  const props: Record<string, unknown> = {
    decidedBy: record.decidedBy,
    decidedAt: record.decidedAt,
    direction: record.direction,
    rationale: record.rationale,
    relationToDiagnosis: record.relationToDiagnosis,
    derivedGoals: record.derivedGoals,
  };
  if (record.overriddenRecommendationId !== undefined) {
    props.overriddenRecommendationId = record.overriddenRecommendationId;
  }
  if (record.constraints !== undefined) {
    props.constraints = record.constraints;
  }
  return props;
}

/**
 * 从 GraphStore props 重建 DecisionRecord（逐字段读取 + 运行时收窄，
 * 不用类型逃逸断言；缺失/非法字段回退保守默认值）。
 *
 * `id` 取自节点 id（SqliteGraphStore.createNode 恒生成 `node-${uuid}` 并忽略
 * props.id，故 record.id 必须与节点 id 对齐，否则 get/update 取不回）。
 */
function fromProps(id: string, props: Record<string, unknown>): DecisionRecord {
  const decidedByRaw = props.decidedBy;
  const decidedBy: { role: 'founder' | 'ga'; name: string } =
    typeof decidedByRaw === 'object' && decidedByRaw !== null
      ? {
          role: (decidedByRaw as { role?: unknown }).role === 'founder' ? 'founder' : 'ga',
          name: typeof (decidedByRaw as { name?: unknown }).name === 'string'
            ? (decidedByRaw as { name: string }).name
            : '',
        }
      : { role: 'ga', name: '' };

  const relationRaw = props.relationToDiagnosis;
  const relationToDiagnosis: DecisionRelationToDiagnosis =
    typeof relationRaw === 'string' && (VALID_DECISION_RELATIONS as readonly string[]).includes(relationRaw)
      ? (relationRaw as DecisionRelationToDiagnosis)
      : 'unrelated';

  const derivedRaw = props.derivedGoals;
  const derivedGoals: string[] = Array.isArray(derivedRaw)
    ? derivedRaw.filter((goal): goal is string => typeof goal === 'string')
    : [];

  const record: DecisionRecord = {
    id,
    decidedBy,
    decidedAt: typeof props.decidedAt === 'string' ? props.decidedAt : '',
    direction: typeof props.direction === 'string' ? props.direction : '',
    rationale: typeof props.rationale === 'string' ? props.rationale : '',
    relationToDiagnosis,
    derivedGoals,
  };
  if (typeof props.overriddenRecommendationId === 'string') {
    record.overriddenRecommendationId = props.overriddenRecommendationId;
  }
  const constraintsRaw = props.constraints;
  if (typeof constraintsRaw === 'object' && constraintsRaw !== null) {
    const budget = (constraintsRaw as { budget?: unknown }).budget;
    const resource = (constraintsRaw as { resource?: unknown }).resource;
    const constraints: { budget?: number; resource?: string } = {};
    if (typeof budget === 'number') constraints.budget = budget;
    if (typeof resource === 'string') constraints.resource = resource;
    if (constraints.budget !== undefined || constraints.resource !== undefined) {
      record.constraints = constraints;
    }
  }
  return record;
}

// ═══ DecisionRecordStore ═══

/**
 * DecisionRecord 存储 —— create/get/list/updateRationale。
 *
 * 复用 `GraphBridgeLike` 持久化（与 goal-store 同风格）。
 * 所有失败路径返回 `{ ok:false, error }`（degraded），不抛。
 */
export class DecisionRecordStore {
  constructor(
    private readonly store: GraphBridgeLike,
    private readonly graph: string = DECISION_RECORD_GRAPH,
  ) {}

  /** 记录一条新决策（校验 direction/rationale/relationToDiagnosis）。 */
  create(input: DecisionRecordInput): DecisionRecordResult {
    const direction = input.direction?.trim();
    if (!direction) return { ok: false, error: 'direction 不能为空' };
    const rationale = input.rationale?.trim();
    if (!rationale) return { ok: false, error: 'rationale 不能为空' };
    if (!VALID_DECISION_RELATIONS.includes(input.relationToDiagnosis)) {
      return { ok: false, error: `relationToDiagnosis 非法: ${String(input.relationToDiagnosis)}` };
    }

    const record: DecisionRecord = {
      id: randomUUID(),
      decidedBy: input.decidedBy,
      decidedAt: new Date().toISOString(),
      direction,
      rationale,
      relationToDiagnosis: input.relationToDiagnosis,
      derivedGoals: input.derivedGoals ?? [],
    };
    if (input.overriddenRecommendationId !== undefined) {
      record.overriddenRecommendationId = input.overriddenRecommendationId;
    }
    if (input.constraints !== undefined) {
      record.constraints = input.constraints;
    }

    try {
      // 节点 id 由 store 生成（SqliteGraphStore.createNode 忽略 props.id）——
      // 用返回值覆盖 record.id，保证后续 get/update 能按同一 id 取回。
      const storeId = this.store.createNode(DECISION_RECORD_NODE_TYPE, toProps(record), this.graph);
      const persisted: DecisionRecord = { ...record, id: storeId };
      log.info({ id: persisted.id, relation: persisted.relationToDiagnosis }, 'DecisionRecord 已创建');
      return { ok: true, record: persisted };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn({ err: msg, id: record.id }, 'DecisionRecord 创建失败 — degraded');
      return { ok: false, error: msg };
    }
  }

  /** 按 id 读取，不存在返回 null（读失败也返回 null + log.warn）。 */
  get(id: string): DecisionRecord | null {
    try {
      const node = this.store.getNode(id, this.graph) as { props?: Record<string, unknown> } | null;
      if (node?.props === undefined) return null;
      return fromProps(id, node.props);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn({ err: msg, id }, 'DecisionRecord 读取失败 — 返回 null');
      return null;
    }
  }

  /** 列出全部决策记录（读失败返回空数组 + log.warn）。 */
  list(): DecisionRecord[] {
    try {
      return this.store.queryNodes(DECISION_RECORD_NODE_TYPE, {}, this.graph)
        .map((node) => fromProps(node.id, node.props));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn({ err: msg }, 'DecisionRecord 列表读取失败 — 返回空数组');
      return [];
    }
  }

  /** 事后补充/修正决策依据（§2.8 事后可补充、可修正）。 */
  updateRationale(id: string, rationale: string): DecisionRecordResult {
    const trimmed = rationale?.trim();
    if (!trimmed) return { ok: false, error: 'rationale 不能为空' };
    const existing = this.get(id);
    if (existing === null) return { ok: false, error: `DecisionRecord ${id} 不存在` };
    const updated: DecisionRecord = { ...existing, rationale: trimmed };
    try {
      this.store.updateNode(id, toProps(updated), this.graph);
      log.info({ id }, 'DecisionRecord rationale 已修正');
      return { ok: true, record: updated };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn({ err: msg, id }, 'DecisionRecord rationale 修正失败 — degraded');
      return { ok: false, error: msg };
    }
  }

  /**
   * 把分解出的 Goal 关联回决策记录（§2.3 决策 → 分解为 Goal 的闭环）。
   * 幂等：已含该 goalId 时直接返回 ok。失败降级 `{ ok:false, error }`。
   */
  linkGoal(id: string, goalId: string): DecisionRecordResult {
    const existing = this.get(id);
    if (existing === null) return { ok: false, error: `DecisionRecord ${id} 不存在` };
    if (existing.derivedGoals.includes(goalId)) return { ok: true, record: existing };
    const updated: DecisionRecord = {
      ...existing,
      derivedGoals: [...existing.derivedGoals, goalId],
    };
    try {
      this.store.updateNode(id, toProps(updated), this.graph);
      log.info({ id, goalId }, 'DecisionRecord 已关联分解 Goal');
      return { ok: true, record: updated };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn({ err: msg, id, goalId }, 'DecisionRecord 关联 Goal 失败 — degraded');
      return { ok: false, error: msg };
    }
  }
}
