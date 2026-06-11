/**
 * knowledge-curator.ts — 知识生命周期管理器
 *
 * 进化引擎 30→100 核心模块。对标 Hermes Curator（agent/curator.py, 1801行）。
 *
 * Hermes Curator 模式：
 *   - 7天周期审查 → 自动检测陈旧知识 → 合并/归档
 *   - active → stale → archived → reactivated 四态生命周期
 *   - 快照+回滚（curator_backup.py）
 *   - Usage telemetry 驱动决策（.usage.json）
 *   - Provenance filtering（只管理 agent 创作的知识）
 *
 * Synova 适配：
 *   - 诊断知识项（规则、术语、基准、模式）替代技能文件
 *   - 组织级知识（Layer 2）→ 全局知识（Layer 3，联邦进化）
 *   - 知识代谢 = 陈旧规则自动降级 + 合并相似规则 + 归档过时规则
 */

import { createLogger } from '../../infra/logger';

const log = createLogger('diagnosis/knowledge-curator');

// ====================================================================
// Types
// ====================================================================

export type KnowledgeState = 'active' | 'stale' | 'archived';
export type KnowledgeType = 'rule' | 'terminology' | 'benchmark' | 'pattern' | 'baseline';
export type KnowledgeSource = 'agent_derived' | 'user_confirmed' | 'federated' | 'bundled';

export interface KnowledgeItem {
  id: string;
  type: KnowledgeType;
  state: KnowledgeState;
  source: KnowledgeSource;
  orgId: string;
  /** 知识内容 */
  content: string;
  /** 关联维度 */
  dimensions: string[];
  /** 置信度 */
  confidence: number;
  /** 使用次数 */
  useCount: number;
  /** 验证次数（被后续诊断确认有效） */
  validationCount: number;
  /** 失效次数（被后续诊断推翻） */
  invalidationCount: number;
  /** 创建时间 */
  createdAt: string;
  /** 最后使用时间 */
  lastUsedAt: string;
  /** 最后验证时间 */
  lastValidatedAt?: string;
  /** 标记为 stale 的时间 */
  staleAt?: string;
  /** 归档时间 */
  archivedAt?: string;
  /** 是否锁定（锁定项不参与自动代谢） */
  pinned: boolean;
  /** 合并来源（如果是从其他知识项合并而来） */
  mergedFrom?: string[];
  /** 被合并到的目标 */
  mergedInto?: string;
}

export interface CuratorState {
  lastRunAt: string;
  lastRunDurationMs: number;
  lastRunSummary: string;
  runCount: number;
  paused: boolean;
}

export interface CuratorConfig {
  /** 审查间隔（小时），默认 168 = 7 天 */
  intervalHours: number;
  /** 标记 stale 天数 */
  staleAfterDays: number;
  /** 归档天数 */
  archiveAfterDays: number;
  /** 最小使用次数（低于此值的知识不参与合并） */
  minUseCountForConsolidation: number;
  /** 合并相似度阈值 */
  consolidationSimilarityThreshold: number;
}

const DEFAULT_CONFIG: CuratorConfig = {
  intervalHours: 168,       // 7 天
  staleAfterDays: 30,       // 30 天未使用 → stale
  archiveAfterDays: 90,     // 90 天 stale → archive
  minUseCountForConsolidation: 3,
  consolidationSimilarityThreshold: 0.7,
};

// ====================================================================
// Knowledge Store
// ====================================================================

const knowledgeStore = new Map<string, KnowledgeItem>();
const curatorStateStore = new Map<string, CuratorState>(); // orgId → state
const curatorConfigStore = new Map<string, CuratorConfig>(); // orgId → config

// ====================================================================
// CRUD
// ====================================================================

let knowledgeCounter = 0;

export function addKnowledge(item: Omit<KnowledgeItem, 'id' | 'state' | 'useCount' | 'validationCount' | 'invalidationCount' | 'createdAt' | 'lastUsedAt'>): KnowledgeItem {
  const now = new Date().toISOString();
  const entry: KnowledgeItem = {
    ...item,
    id: `kn_${Date.now().toString(36)}_${++knowledgeCounter}`,
    state: 'active',
    useCount: 0,
    validationCount: 0,
    invalidationCount: 0,
    createdAt: now,
    lastUsedAt: now,
    pinned: item.pinned ?? false,
  };
  knowledgeStore.set(entry.id, entry);
  return entry;
}

export function getKnowledge(id: string): KnowledgeItem | undefined {
  return knowledgeStore.get(id);
}

export function listOrgKnowledge(orgId: string, state?: KnowledgeState): KnowledgeItem[] {
  const all = [...knowledgeStore.values()].filter(k => k.orgId === orgId);
  return state ? all.filter(k => k.state === state) : all;
}

export function updateKnowledge(id: string, patch: Partial<KnowledgeItem>): KnowledgeItem | null {
  const item = knowledgeStore.get(id);
  if (!item) return null;
  Object.assign(item, patch);
  return item;
}

// ====================================================================
// Usage Telemetry（对标 Hermes skill_usage.py — .usage.json）
// ====================================================================

export function recordKnowledgeUse(id: string): void {
  const item = knowledgeStore.get(id);
  if (!item) return;
  item.useCount++;
  item.lastUsedAt = new Date().toISOString();

  // 使用即复活：archived → active
  if (item.state === 'archived') {
    item.state = 'active';
    item.archivedAt = undefined;
    item.staleAt = undefined;
    log.info({ id, type: item.type }, '[curator] 知识复活（archived→active）');
  } else if (item.state === 'stale') {
    item.state = 'active';
    item.staleAt = undefined;
    log.info({ id, type: item.type }, '[curator] 知识复活（stale→active）');
  }
}

export function recordKnowledgeValidation(id: string, isValid: boolean): void {
  const item = knowledgeStore.get(id);
  if (!item) return;
  if (isValid) {
    item.validationCount++;
  } else {
    item.invalidationCount++;
  }
  item.lastValidatedAt = new Date().toISOString();
}

// ====================================================================
// Auto-Transitions（对标 Hermes apply_automatic_transitions）
// ====================================================================

export function applyAutoTransitions(orgId: string): {
  markedStale: number;
  archived: number;
  reactivated: number;
  checked: number;
} {
  const config = curatorConfigStore.get(orgId) ?? DEFAULT_CONFIG;
  const now = Date.now();
  const result = { markedStale: 0, archived: 0, reactivated: 0, checked: 0 };

  for (const item of knowledgeStore.values()) {
    if (item.orgId !== orgId) continue;
    if (item.pinned) continue;       // 锁定项不参与自动代谢
    if (item.source === 'bundled') continue; // 内置知识不参与

    result.checked++;

    const lastActivity = new Date(item.lastUsedAt).getTime();
    const daysSinceActivity = (now - lastActivity) / 86400000;

    if (item.state === 'active' && daysSinceActivity > config.staleAfterDays) {
      item.state = 'stale';
      item.staleAt = new Date().toISOString();
      result.markedStale++;
      log.info({ id: item.id, type: item.type, daysSinceActivity: Math.round(daysSinceActivity) },
        '[curator] 知识标记为 stale');
    }

    if (item.state === 'stale') {
      const staleAt = item.staleAt ? new Date(item.staleAt).getTime() : lastActivity;
      const daysSinceStale = (now - staleAt) / 86400000;

      if (daysSinceStale > config.archiveAfterDays) {
        item.state = 'archived';
        item.archivedAt = new Date().toISOString();
        result.archived++;
        log.info({ id: item.id, type: item.type },
          '[curator] 知识归档');
      }
    }

    // 陈旧但有最近活动的 → 复活
    if (item.state === 'stale' && daysSinceActivity < 7) {
      item.state = 'active';
      item.staleAt = undefined;
      result.reactivated++;
    }
  }

  return result;
}

// ====================================================================
// Consolidation（对标 Hermes consolidate — 合并相似知识）
// ====================================================================

export interface ConsolidationResult {
  consolidated: Array<{ from: string[]; into: string; reason: string }>;
  pruned: Array<{ id: string; reason: string }>;
}

/**
 * 简单合并：同维度 + 同类型 + 内容相似 → 合并为一个，旧的归档。
 * 生产环境此函数应由 LLM 审查替代（对标 Hermes curator LLM review pass）。
 */
export function consolidateKnowledge(orgId: string): ConsolidationResult {
  const config = curatorConfigStore.get(orgId) ?? DEFAULT_CONFIG;
  const active = listOrgKnowledge(orgId, 'active');
  const result: ConsolidationResult = { consolidated: [], pruned: [] };

  // 按类型分组
  const byType = new Map<KnowledgeType, KnowledgeItem[]>();
  for (const item of active) {
    if (item.pinned || item.source === 'bundled') continue;
    if (item.useCount < config.minUseCountForConsolidation) continue;
    if (!byType.has(item.type)) byType.set(item.type, []);
    byType.get(item.type)!.push(item);
  }

  // 每组内按维度+内容相似度合并
  for (const [type, items] of byType) {
    if (items.length < 2) continue;

    // 简单规则：同维度的同类型知识合并
    const byDim = new Map<string, KnowledgeItem[]>();
    for (const item of items) {
      const key = item.dimensions.sort().join(',');
      if (!byDim.has(key)) byDim.set(key, []);
      byDim.get(key)!.push(item);
    }

    for (const [, group] of byDim) {
      if (group.length < 2) continue;

      // 保留置信度最高+使用次数最多的作为主条目
      group.sort((a, b) =>
        (b.confidence * b.useCount) - (a.confidence * a.useCount));
      const primary = group[0];
      const merged = group.slice(1);

      for (const item of merged) {
        item.state = 'archived';
        item.archivedAt = new Date().toISOString();
        item.mergedInto = primary.id;
        if (!primary.mergedFrom) primary.mergedFrom = [];
        primary.mergedFrom.push(item.id);
      }

      result.consolidated.push({
        from: merged.map(m => m.id),
        into: primary.id,
        reason: `同类型(${type})+同维度(${group[0].dimensions.join(',')})，${merged.length} 条合并入 ${primary.id}`,
      });
    }
  }

  // 清理：使用次数=0 且创建超过 90 天的 → 建议清理
  const now = Date.now();
  for (const item of active) {
    if (item.pinned || item.source === 'bundled') continue;
    const daysSinceCreation = (now - new Date(item.createdAt).getTime()) / 86400000;
    if (item.useCount === 0 && daysSinceCreation > 90) {
      item.state = 'archived';
      item.archivedAt = new Date().toISOString();
      result.pruned.push({
        id: item.id,
        reason: `创建 ${Math.round(daysSinceCreation)} 天，零使用，自动归档`,
      });
    }
  }

  return result;
}

// ====================================================================
// Curator Orchestrator（对标 Hermes run_curator_review）
// ====================================================================

export function runCuratorPass(orgId: string): {
  autoTransitions: ReturnType<typeof applyAutoTransitions>;
  consolidations: ConsolidationResult;
  summary: string;
} {
  const startTime = Date.now();

  // 1. 自动生命周期转换
  const autoTransitions = applyAutoTransitions(orgId);

  // 2. 知识合并
  const consolidations = consolidateKnowledge(orgId);

  // 3. 更新策展人状态
  const duration = Date.now() - startTime;
  const summary = [
    `检查 ${autoTransitions.checked} 项`,
    `标记 stale: ${autoTransitions.markedStale}`,
    `归档: ${autoTransitions.archived}`,
    `复活: ${autoTransitions.reactivated}`,
    `合并组: ${consolidations.consolidated.length}`,
    `清理: ${consolidations.pruned.length}`,
  ].join(', ');

  const state: CuratorState = {
    lastRunAt: new Date().toISOString(),
    lastRunDurationMs: duration,
    lastRunSummary: summary,
    runCount: (curatorStateStore.get(orgId)?.runCount ?? 0) + 1,
    paused: false,
  };
  curatorStateStore.set(orgId, state);

  log.info({ orgId, ...autoTransitions, consolidations: consolidations.consolidated.length },
    '[curator] 策展审查完成');

  return { autoTransitions, consolidations, summary };
}

/** 检查是否应该运行策展审查 */
export function shouldRunCurator(orgId: string): boolean {
  const state = curatorStateStore.get(orgId);
  if (!state) return true; // 首次运行
  if (state.paused) return false;

  const config = curatorConfigStore.get(orgId) ?? DEFAULT_CONFIG;
  const lastRun = new Date(state.lastRunAt).getTime();
  const hoursSinceLastRun = (Date.now() - lastRun) / 3600000;

  return hoursSinceLastRun >= config.intervalHours;
}

export function getCuratorState(orgId: string): CuratorState | undefined {
  return curatorStateStore.get(orgId);
}

export function setCuratorConfig(orgId: string, config: Partial<CuratorConfig>): void {
  curatorConfigStore.set(orgId, { ...DEFAULT_CONFIG, ...config });
}

/** 清空（测试用） */
export function clearCuratorStore(): void {
  knowledgeStore.clear();
  curatorStateStore.clear();
  curatorConfigStore.clear();
  knowledgeCounter = 0;
}
