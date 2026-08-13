/**
 * src/l4/migration-validator.ts — 迁移验证器（一次性工具）
 *
 * ⚠️ 一次性工具: 不接入生产路径。Phase 3 哨兵迁移时手动调用。
 * 比较新旧 compute 函数输出的一致性。
 * diff < 1% → pass, 1-5% → review, >5% → block
 * Phase 3 时用于验证 compute 函数从 KV 读取迁移到图遍历后的输出一致性。
 */
export interface ValidationReport {
  functionName: string;
  sentinelId: string;
  oldOutput: Record<string, unknown>;
  newOutput: Record<string, unknown>;
  diffPercent: number;
  status: 'pass' | 'review' | 'block';
  warnings: string[];
}

/**
 * 提取数值进行比较。支持对象 { value: number } 和原始 number。
 */
function extractNumericValue(output: Record<string, unknown>): number {
  if (typeof output.value === 'number') return output.value;
  if (typeof output === 'number') return output;
  // 尝试找第一个数值字段
  for (const val of Object.values(output)) {
    if (typeof val === 'number') return val;
  }
  return 0;
}

/**
 * 比较新旧 compute 函数输出。
 * 支持嵌套对象比较，对每个数值字段计算 diff。
 */
export function validateMigration(
  functionName: string,
  sentinelId: string,
  oldOutput: Record<string, unknown>,
  newOutput: Record<string, unknown>,
): ValidationReport {
  const warnings: string[] = [];

  // 全字段比较
  const allKeys = new Set([...Object.keys(oldOutput), ...Object.keys(newOutput)]);
  let maxDiff = 0;

  for (const key of allKeys) {
    const oldVal = oldOutput[key];
    const newVal = newOutput[key];

    if (typeof oldVal === 'number' && typeof newVal === 'number') {
      const base = Math.abs(oldVal) || 1;
      const diff = Math.abs(newVal - oldVal) / base;
      if (diff > maxDiff) maxDiff = diff;
    } else if (typeof oldVal === 'object' && typeof newVal === 'object' && oldVal !== null && newVal !== null) {
      // 递归比较嵌套对象
      const oldRec = oldVal as Record<string, unknown>;
      const newRec = newVal as Record<string, unknown>;
      for (const subKey of Object.keys({ ...oldRec, ...newRec })) {
        const ov = oldRec[subKey];
        const nv = newRec[subKey];
        if (typeof ov === 'number' && typeof nv === 'number') {
          const base = Math.abs(ov) || 1;
          const diff = Math.abs(nv - ov) / base;
          if (diff > maxDiff) maxDiff = diff;
        }
      }
    } else if (oldVal !== newVal) {
      // 非数值字段不同 — 记录警告但不阻断
      warnings.push(`Field "${key}" differs: old=${JSON.stringify(oldVal)}, new=${JSON.stringify(newVal)}`);
    }
  }

  const diffPercent = Math.round(maxDiff * 10000) / 10000;

  let status: 'pass' | 'review' | 'block';
  if (diffPercent < 0.01) {
    status = 'pass';
  } else if (diffPercent < 0.05) {
    status = 'review';
    warnings.push(`Diff ${(diffPercent * 100).toFixed(2)}% exceeds pass threshold (1%)`);
  } else {
    status = 'block';
    warnings.push(`Diff ${(diffPercent * 100).toFixed(2)}% exceeds review threshold (5%)`);
  }

  if (Object.keys(oldOutput).length === 0 && Object.keys(newOutput).length === 0) {
    warnings.push('Both outputs are empty — validation inconclusive');
  }

  return {
    functionName,
    sentinelId,
    oldOutput,
    newOutput,
    diffPercent,
    status,
    warnings,
  };
}
