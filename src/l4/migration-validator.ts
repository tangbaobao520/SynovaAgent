/**
 * src/l4/migration-validator.ts — 迁移验证器 (V4.3.0)
 *
 * 一次性验证工具。在 Task B（compute 函数图遍历迁移）完成后，
 * 比较新旧 compute 函数输出的一致性。
 *
 * 规则:
 *   diff < 1%  → pass  (自动通过)
 *   diff 1-5%  → review (人工审查浮点精度 vs 迁移错误)
 *   diff > 5%  → block  (阻断，退回对应实例修正)
 *
 * 注意: 本文件在 Phase 3 切换完成后会被删除（一次性工具）。
 */
import { createLogger } from '@synova/logger';

const log = createLogger('l4/migration-validator');

// ═══ Types ═══

export type ValidationStatus = string;

export interface ValidationReport {
  /** compute 函数名 */
  functionName: string;
  /** 所属哨兵 ID */
  sentinelId: string;
  /** 旧函数输出（KV 模式） */
  oldOutput: unknown;
  /** 新函数输出（图遍历模式） */
  newOutput: unknown;
  /** 相对差异百分比 (0 = 完全一致, 1 = 100% 差异) */
  diffPercent: number;
  /** 状态分类 */
  status: ValidationStatus;
  /** 降级标记 */
  degraded: boolean;
  /** 警告/错误信息 */
  warnings: string[];
}

interface ComputeOutput {
  value?: number;
  degraded?: boolean;
  [key: string]: unknown;
}

interface ComputeEntry {
  functionName: string;
  sentinelId: string;
  fn: () => ComputeOutput;
}

// ═══ 核心验证函数 ═══

/**
 * 验证单个 compute 函数的迁移一致性。
 *
 * @param functionName — compute 函数名
 * @param sentinelId — 所属哨兵 ID
 * @param oldFn — 旧（KV 模式）compute 函数
 * @param newFn — 新（图遍历模式）compute 函数
 * @returns ValidationReport
 */
export function validateMigration(
  functionName: string,
  sentinelId: string,
  oldFn: () => ComputeOutput,
  newFn: () => ComputeOutput,
): ValidationReport {
  try {
    const oldOutput = oldFn();
    const newOutput = newFn();

    const oldVal = typeof oldOutput?.value === 'number' ? oldOutput.value : 0;
    const newVal = typeof newOutput?.value === 'number' ? newOutput.value : 0;

    // 计算 diffPercent: |old - new| / max(|old|, 1)
    const denominator = Math.max(Math.abs(oldVal), 1);
    const diff = Math.abs(oldVal - newVal);
    const diffPercent = denominator > 0 ? diff / denominator : 0;

    // 状态分类
    const status = classifyStatus(diffPercent);

    // 降级检测
    const degraded = !!(newOutput?.degraded);

    const warnings: string[] = [];
    if (oldOutput?.degraded && !newOutput?.degraded) {
      warnings.push('旧版本降级但新版本正常 — 可能是数据覆盖率提升');
    }
    if (!oldOutput?.degraded && newOutput?.degraded) {
      warnings.push('新版本降级 — 图遍历未能获取足够数据');
    }

    log.info({ functionName, status, diffPercent, degraded }, '迁移验证完成');

    return { functionName, sentinelId, oldOutput, newOutput, diffPercent, status, degraded, warnings };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err, functionName }, '迁移验证失败');
    return {
      functionName,
      sentinelId,
      oldOutput: null,
      newOutput: null,
      diffPercent: 1,
      status: 'block',
      degraded: true,
      warnings: [`验证执行异常: ${msg}`],
    };
  }
}

/**
 * 批量验证多个 compute 函数。
 *
 * 通过 functionName 配对 old 和 new compute 函数。
 * 无法配对的函数标记为 block。
 *
 * @param oldComputes — 旧 compute 函数列表
 * @param newComputes — 新 compute 函数列表
 * @returns ValidationReport[]
 */
export function validateAll(
  oldComputes: ComputeEntry[],
  newComputes: ComputeEntry[],
): ValidationReport[] {
  const reports: ValidationReport[] = [];

  // 按 functionName 建立索引
  const newMap = new Map<string, ComputeEntry>();
  for (const entry of newComputes) {
    if (newMap.has(entry.functionName)) {
      log.warn({ functionName: entry.functionName }, '批量验证: 新列表中有重复函数名');
    }
    newMap.set(entry.functionName, entry);
  }

  // 遍历旧函数，与对应的新函数配对验证
  for (const oldEntry of oldComputes) {
    const newEntry = newMap.get(oldEntry.functionName);
    if (!newEntry) {
      log.warn({ functionName: oldEntry.functionName }, '批量验证: 新版本中缺少对应函数');
      reports.push({
        functionName: oldEntry.functionName,
        sentinelId: oldEntry.sentinelId,
        oldOutput: null,
        newOutput: null,
        diffPercent: 1,
        status: 'block',
        degraded: true,
        warnings: ['新版本中缺少此函数 — 无法验证'],
      });
      continue;
    }

    const report = validateMigration(
      oldEntry.functionName,
      oldEntry.sentinelId,
      oldEntry.fn,
      newEntry.fn,
    );
    reports.push(report);
  }

  // 检查新列表中是否有旧列表中没有的函数
  for (const newEntry of newComputes) {
    if (!oldComputes.find(o => o.functionName === newEntry.functionName)) {
      reports.push({
        functionName: newEntry.functionName,
        sentinelId: newEntry.sentinelId,
        oldOutput: null,
        newOutput: null,
        diffPercent: 1,
        status: 'block',
        degraded: true,
        warnings: ['旧版本中缺少此函数 — 可能是新增函数，需人工确认'],
      });
    }
  }

  return reports;
}

// ═══ 辅助函数 ═══

function classifyStatus(diffPercent: number): ValidationStatus {
  if (diffPercent < 0.01) return 'pass';
  if (diffPercent <= 0.05) return 'review';
  return 'block';
}
