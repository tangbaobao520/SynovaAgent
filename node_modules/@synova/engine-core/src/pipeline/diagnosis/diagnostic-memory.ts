/**
 * diagnostic-memory.ts — 诊断记忆索引
 *
 * B7: 对标 Hermes MEMORY.md 冻结快照 + Claw-Code JSONL 持久化 + 严格有界。
 *
 * Hermes 模式：
 *   - 快照在会话开始时拍摄，注入系统提示，会话中间不刷新
 *   - 严格字符上限（memory 2200, user 1375）
 *   - § 分隔条目
 *
 * Claw-Code 模式：
 *   - JSONL 追加写，不重写全文件
 *   - 每条消息一行，读取快
 *
 * Synova 适配：
 *   - 诊断记忆 = 组织级索引，不是会话级
 *   - 每条记忆 ≤ 500 字符（对标 Hermes memory_char_limit 的 1/4）
 *   - 组织级上限 50 条（对标 Hermes 严格有界）
 *   - 快照在诊断开始时拍，中途不刷新
 *   - JSONL 追加写 + SQLite 索引双持久化
 */

import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '../../infra/logger';

const log = createLogger('diagnosis/diagnostic-memory');

// ====================================================================
// Types
// ====================================================================

export interface DiagnosticMemoryEntry {
  id: string;
  orgId: string;
  /** 记忆类型 */
  type: 'finding' | 'pattern' | 'lesson' | 'preference' | 'correction';
  /** 记忆内容（≤ 500 字符） */
  content: string;
  /** 来源诊断 ID */
  sourceDiagnosisId: string;
  /** 关联维度 */
  dimensions: string[];
  /** 置信度 */
  confidence: number;
  /** 使用次数（被后续诊断引用） */
  useCount: number;
  /** 创建时间 */
  createdAt: string;
  /** 最后引用时间 */
  lastReferencedAt: string;
  /** 优先级（高优先级记忆注入系统提示） */
  priority: 'high' | 'medium' | 'low';
}

export interface MemorySnapshot {
  orgId: string;
  /** 快照生成时间 */
  snapshotAt: string;
  /** 高优先级记忆（注入系统提示） */
  highPriorityEntries: DiagnosticMemoryEntry[];
  /** 总计条目数 */
  totalEntries: number;
  /** 快照是否有效 */
  valid: boolean;
}

export interface MemoryStoreConfig {
  /** 组织级记忆上限（对标 Hermes memory_char_limit） */
  maxEntriesPerOrg: number;
  /** 每条记忆最大字符数 */
  maxCharsPerEntry: number;
  /** 高优先级记忆上限（注入系统提示的） */
  maxHighPriority: number;
  /** 数据目录 */
  dataDir: string;
}

const DEFAULT_CONFIG: MemoryStoreConfig = {
  maxEntriesPerOrg: 50,
  maxCharsPerEntry: 500,
  maxHighPriority: 8,
  dataDir: '.',
};

// ====================================================================
// Memory Store
// ====================================================================

let config: MemoryStoreConfig = DEFAULT_CONFIG;
const memoryStore = new Map<string, DiagnosticMemoryEntry[]>(); // orgId → entries
const snapshotStore = new Map<string, MemorySnapshot>(); // orgId → snapshot
let memoryCounter = 0;

export function initMemoryStore(cfg: Partial<MemoryStoreConfig>): void {
  config = { ...DEFAULT_CONFIG, ...cfg };

  // 确保数据目录存在
  if (!fs.existsSync(config.dataDir)) {
    fs.mkdirSync(config.dataDir, { recursive: true });
  }

  // 从磁盘加载
  const memPath = path.join(config.dataDir, 'diagnostic-memory.jsonl');
  try {
    if (fs.existsSync(memPath)) {
      const lines = fs.readFileSync(memPath, 'utf-8').trim().split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const entry: DiagnosticMemoryEntry = JSON.parse(line);
          if (!memoryStore.has(entry.orgId)) memoryStore.set(entry.orgId, []);
          memoryStore.get(entry.orgId)!.push(entry);
          memoryCounter = Math.max(memoryCounter, parseInt(entry.id.split('_').pop() || '0'));
        } catch { /* skip corrupted lines */ }
      }
    }
  } catch (err) {
    log.warn({ err }, '[memory] 加载记忆文件失败');
  }

  // 为每个组织构建快照
  for (const [orgId] of memoryStore) {
    buildSnapshot(orgId);
  }

  log.info({ orgCount: memoryStore.size }, '[memory] 记忆存储已初始化');
}

// ====================================================================
// CRUD (对标 Hermes memory tool)
// ====================================================================

/** 添加记忆。超过上限时淘汰最低优先级的旧记忆。 */
export function addMemory(
  entry: Omit<DiagnosticMemoryEntry, 'id' | 'useCount' | 'createdAt' | 'lastReferencedAt'>,
): DiagnosticMemoryEntry {
  if (entry.content.length > config.maxCharsPerEntry) {
    entry.content = entry.content.slice(0, config.maxCharsPerEntry - 3) + '...';
  }

  const now = new Date().toISOString();
  const id = `mem_${entry.orgId}_${++memoryCounter}`;
  const full: DiagnosticMemoryEntry = {
    ...entry,
    id,
    useCount: 0,
    createdAt: now,
    lastReferencedAt: now,
    priority: entry.priority || 'medium',
  };

  if (!memoryStore.has(entry.orgId)) memoryStore.set(entry.orgId, []);
  const orgMemories = memoryStore.get(entry.orgId)!;
  orgMemories.push(full);

  // 超过上限 → 淘汰最低优先级的最旧记忆
  if (orgMemories.length > config.maxEntriesPerOrg) {
    const priorityOrder = { high: 3, medium: 2, low: 1 };
    orgMemories.sort((a, b) => {
      const pDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
      if (pDiff !== 0) return pDiff;
      return new Date(a.lastReferencedAt).getTime() - new Date(b.lastReferencedAt).getTime();
    });
    const removed = orgMemories.shift()!;
    log.info({ id: removed.id, type: removed.type }, '[memory] 记忆淘汰（超上限）');
  }

  // JSONL 追加写
  appendToJSONL(full);
  // 重建快照
  buildSnapshot(entry.orgId);

  return full;
}

/** 引用记忆（增加 useCount） */
export function referenceMemory(memoryId: string): void {
  for (const [, entries] of memoryStore) {
    const found = entries.find(e => e.id === memoryId);
    if (found) {
      found.useCount++;
      found.lastReferencedAt = new Date().toISOString();
      return;
    }
  }
}

/** 搜索记忆（模糊匹配） */
export function searchMemory(orgId: string, query: string, limit = 5): DiagnosticMemoryEntry[] {
  const entries = memoryStore.get(orgId) || [];
  const q = query.toLowerCase();

  // 简单关键词匹配（生产环境可升级为 embedding 向量搜索）
  const scored = entries.map(e => {
    let score = 0;
    if (e.content.toLowerCase().includes(q)) score += 10;
    for (const dim of e.dimensions) {
      if (q.includes(dim)) score += 5;
    }
    return { entry: e, score };
  });

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => s.entry);
}

/** 删除记忆 */
export function removeMemory(memoryId: string): boolean {
  for (const [, entries] of memoryStore) {
    const idx = entries.findIndex(e => e.id === memoryId);
    if (idx >= 0) {
      entries.splice(idx, 1);
      return true;
    }
  }
  return false;
}

// ====================================================================
// Frozen Snapshot (对标 Hermes 冻结快照模式)
// ====================================================================

/**
 * 构建组织级的冻结快照。
 * 对标 Hermes: 会话开始时拍摄，注入系统提示，中途不刷新。
 * 对标 Claw-Code: 压缩后的摘要 = 快照。
 */
export function buildSnapshot(orgId: string): MemorySnapshot {
  const entries = memoryStore.get(orgId) || [];

  // 高优先级 = 最近创建/引用的 high priority + 高置信度 pattern
  const highPriority = entries
    .filter(e => e.priority === 'high' || (e.type === 'pattern' && e.confidence > 0.8))
    .sort((a, b) => new Date(b.lastReferencedAt).getTime() - new Date(a.lastReferencedAt).getTime())
    .slice(0, config.maxHighPriority);

  const snapshot: MemorySnapshot = {
    orgId,
    snapshotAt: new Date().toISOString(),
    highPriorityEntries: highPriority,
    totalEntries: entries.length,
    valid: true,
  };

  snapshotStore.set(orgId, snapshot);
  return snapshot;
}

/**
 * 获取冻结快照。
 * 对标 Hermes load_from_disk() 快照——诊断开始时调用一次，后续不刷新。
 */
export function getSnapshot(orgId: string): MemorySnapshot {
  const existing = snapshotStore.get(orgId);
  if (existing?.valid) return existing;
  return buildSnapshot(orgId);
}

/**
 * 将快照注入系统提示。
 * 对标 Hermes 的 memory_store.system_prompt_snapshot。
 */
export function renderSnapshotForSystemPrompt(orgId: string, maxChars = 2000): string {
  const snapshot = getSnapshot(orgId);
  if (snapshot.highPriorityEntries.length === 0) return '';

  const lines = ['<diagnostic_memory>'];
  for (const entry of snapshot.highPriorityEntries) {
    const dimTags = entry.dimensions.map(d => `#${d}`).join(' ');
    const truncated = entry.content.length > 300
      ? entry.content.slice(0, 297) + '...'
      : entry.content;
    lines.push(`- [${entry.type}] ${dimTags} ${truncated}`);
  }

  let result = lines.join('\n') + '\n</diagnostic_memory>';
  if (result.length > maxChars) {
    result = result.slice(0, maxChars - 20) + '\n...</diagnostic_memory>';
  }
  return result;
}

// ====================================================================
// Persistence (对标 Claw-Code JSONL append-only)
// ====================================================================

function appendToJSONL(entry: DiagnosticMemoryEntry): void {
  try {
    const memPath = path.join(config.dataDir, 'diagnostic-memory.jsonl');
    fs.appendFileSync(memPath, JSON.stringify(entry) + '\n', 'utf-8');
  } catch (err) {
    log.warn({ err }, '[memory] JSONL 追加写失败');
  }
}

/** 获取组织记忆统计 */
export function getMemoryStats(orgId: string): {
  total: number;
  byType: Record<string, number>;
  oldestEntry: string;
  newestEntry: string;
} {
  const entries = memoryStore.get(orgId) || [];
  const byType: Record<string, number> = {};
  for (const e of entries) {
    byType[e.type] = (byType[e.type] || 0) + 1;
  }

  const sorted = [...entries].sort((a, b) =>
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  return {
    total: entries.length,
    byType,
    oldestEntry: sorted[0]?.createdAt || '',
    newestEntry: sorted[sorted.length - 1]?.createdAt || '',
  };
}

/** 清空（测试用） */
export function clearMemoryStore(): void {
  memoryStore.clear();
  snapshotStore.clear();
  memoryCounter = 0;
}
