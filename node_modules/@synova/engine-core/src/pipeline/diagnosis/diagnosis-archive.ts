/**
 * diagnosis-archive.ts — 诊断归档
 *
 * 提供：
 *   - 诊断报告持久化（自包含 HTML）
 *   - 跨会话索引与检索
 *   - 知识提取（从历史诊断中提取可复用洞察）
 *   - 时间线聚合
 */

import type { StructuredDiagnosisReport } from './types';

// ====================================================================
// 类型定义
// ====================================================================

/** 归档条目 */
export interface ArchiveEntry {
  /** 唯一标识 */
  id: string;
  /** 团队 ID */
  teamId: string;
  /** 诊断时间 */
  timestamp: string;
  /** 报告摘要（CEO 一句话） */
  summary: string;
  /** 最高风险的三个维度 */
  topRiskDimensions: string[];
  /** 关键指标快照 */
  metrics: Record<string, number>;
  /** 完整报告 */
  report: StructuredDiagnosisReport;
  /** 标签（便于检索） */
  tags: string[];
}

/** 归档查询过滤 */
export interface ArchiveFilter {
  teamId?: string;
  from?: string;
  to?: string;
  tags?: string[];
  /** 关键词搜索（匹配摘要和标签） */
  keyword?: string;
  /** 按时间排序 */
  order?: 'asc' | 'desc';
  limit?: number;
}

/** 跨诊断知识提取 */
export interface ExtractedKnowledge {
  /** 识别出的持久性模式 */
  persistentPatterns: string[];
  /** 重复出现的缝隙维度 */
  recurringDimensions: string[];
  /** 已改善的维度（对比历史） */
  improvedDimensions: string[];
  /** 恶化的维度 */
  degradedDimensions: string[];
  /** 上次修复方案的采纳率 */
  actionAdoptionRate: number;
  /** 团队成熟度趋势 -1（退化）到 +1（进步） */
  maturityTrend: number;
}

// ====================================================================
// 归档存储
// ====================================================================

/** 内存归档存储 */
class ArchiveStore {
  private entries: Map<string, ArchiveEntry> = new Map();
  private maxEntries: number;
  private idSeq = 0;

  constructor(maxEntries = 200) {
    this.maxEntries = maxEntries;
  }

  /** 存储诊断报告，返回存入库中的条目（含唯一 ID） */
  archive(entry: ArchiveEntry): ArchiveEntry {
    // 确保 ID 唯一：追加递增序号防 Date.now() 碰撞
    const uniqueId = `${entry.id}-${++this.idSeq}`;
    const stored = { ...entry, id: uniqueId };
    this.entries.set(uniqueId, stored);
    // 过上限时删除最旧条目
    if (this.entries.size > this.maxEntries) {
      const oldest = [...this.entries.values()]
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())[0];
      if (oldest) this.entries.delete(oldest.id);
    }
    return stored;
  }

  /** 按 ID 获取 */
  get(id: string): ArchiveEntry | null {
    return this.entries.get(id) ?? null;
  }

  /** 查询 */
  query(filter: ArchiveFilter = {}): ArchiveEntry[] {
    let results = [...this.entries.values()];

    if (filter.teamId) {
      results = results.filter(e => e.teamId === filter.teamId);
    }
    if (filter.from) {
      const fromMs = new Date(filter.from).getTime();
      results = results.filter(e => new Date(e.timestamp).getTime() >= fromMs);
    }
    if (filter.to) {
      const toMs = new Date(filter.to).getTime();
      results = results.filter(e => new Date(e.timestamp).getTime() <= toMs);
    }
    if (filter.tags && filter.tags.length > 0) {
      results = results.filter(e => filter.tags!.some(t => e.tags.includes(t)));
    }
    if (filter.keyword) {
      const kw = filter.keyword.toLowerCase();
      results = results.filter(e =>
        e.summary.toLowerCase().includes(kw) ||
        e.tags.some(t => t.toLowerCase().includes(kw)),
      );
    }

    // 默认按时间降序
    const order = filter.order ?? 'desc';
    results.sort((a, b) => {
      const diff = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      return order === 'asc' ? diff : -diff;
    });

    if (filter.limit && filter.limit > 0) {
      results = results.slice(0, filter.limit);
    }

    return results;
  }

  /** 删除过期条目 */
  deleteOlderThan(maxAgeMs: number): number {
    const cutoff = Date.now() - maxAgeMs;
    let removed = 0;
    for (const [id, entry] of this.entries) {
      if (new Date(entry.timestamp).getTime() < cutoff) {
        this.entries.delete(id);
        removed++;
      }
    }
    return removed;
  }

  /** 条目数 */
  get count(): number {
    return this.entries.size;
  }

  /** 清空 */
  clear(): void {
    this.entries.clear();
  }
}

// 单例
let store: ArchiveStore | null = null;

function getStore(): ArchiveStore {
  if (!store) store = new ArchiveStore();
  return store;
}

// ====================================================================
// 公开 API
// ====================================================================

/** 归档一个诊断报告 */
export function archiveDiagnosis(
  report: StructuredDiagnosisReport,
  teamId: string,
  tags: string[] = [],
): ArchiveEntry {
  const id = `diag-${teamId}-${Date.now()}`;
  const topRiskDims = Object.entries(report.gapRadar)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([dim]) => dim);

  const entry: ArchiveEntry = {
    id,
    teamId,
    timestamp: report.generatedAt,
    summary: report.ceoSummary,
    topRiskDimensions: topRiskDims,
    metrics: report.gapRadar,
    report,
    tags,
  };

  return getStore().archive(entry);
}
export function getArchive(id: string): ArchiveEntry | null {
  return getStore().get(id);
}

/** 查询归档 */
export function queryArchives(filter: ArchiveFilter = {}): ArchiveEntry[] {
  return getStore().query(filter);
}

/** 获取团队诊断历史 */
export function getTeamHistory(teamId: string, limit = 10): ArchiveEntry[] {
  return getStore().query({ teamId, order: 'desc', limit });
}

/** 最新一次诊断 */
export function getLatestDiagnosis(teamId: string): ArchiveEntry | null {
  const results = getStore().query({ teamId, order: 'desc', limit: 1 });
  return results[0] ?? null;
}

/** 清理过期归档 */
export function cleanupArchive(maxAgeMs: number): number {
  return getStore().deleteOlderThan(maxAgeMs);
}

/** 重置归档存储（测试用） */
export function resetArchive(): void {
  store?.clear();
  store = null;
}

// ====================================================================
// 跨诊断知识提取
// ====================================================================

/** 从历史归档中提取可复用知识 */
export function extractKnowledge(teamId: string): ExtractedKnowledge {
  const history = getStore().query({ teamId, order: 'asc' });

  if (history.length < 2) {
    return {
      persistentPatterns: [],
      recurringDimensions: [],
      improvedDimensions: [],
      degradedDimensions: [],
      actionAdoptionRate: 0,
      maturityTrend: 0,
    };
  }

  // 维度频率分析
  const dimFrequency = new Map<string, number>();
  for (const entry of history) {
    for (const dim of entry.topRiskDimensions) {
      dimFrequency.set(dim, (dimFrequency.get(dim) ?? 0) + 1);
    }
  }

  // 重复出现的维度（出现在 >= 60% 的诊断中）
  const threshold = history.length * 0.6;
  const recurringDimensions = [...dimFrequency.entries()]
    .filter(([, count]) => count >= threshold)
    .map(([dim]) => dim);

  // 持久性模式：总结高频维度
  const persistentPatterns = recurringDimensions.map(dim =>
    `「${dim}」在最近 ${history.length} 次诊断中出现 ${dimFrequency.get(dim)} 次，属于持续性挑战`,
  );

  // 趋势对比（最新 vs 最早）
  const latest = history[history.length - 1];
  const earliest = history[0];

  const improvedDimensions: string[] = [];
  const degradedDimensions: string[] = [];
  let improvementSum = 0;
  let improvementCount = 0;

  for (const [dim, latestScore] of Object.entries(latest.metrics)) {
    const earliestScore = earliest.metrics[dim];
    if (earliestScore !== undefined) {
      const delta = latestScore - earliestScore;
      if (delta > 0.1) improvedDimensions.push(dim);
      else if (delta < -0.1) degradedDimensions.push(dim);
      improvementSum += delta;
      improvementCount++;
    }
  }

  const maturityTrend = improvementCount > 0
    ? Math.max(-1, Math.min(1, improvementSum / improvementCount))
    : 0;

  return {
    persistentPatterns,
    recurringDimensions,
    improvedDimensions,
    degradedDimensions,
    actionAdoptionRate: 0, // 需要外部追踪系统补充
    maturityTrend: Math.round(maturityTrend * 100) / 100,
  };
}
