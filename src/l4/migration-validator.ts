/**
 * src/l4/migration-validator.ts — 迁移验证器
 *
 * 比较新旧 compute 函数输出的一致性。
 * diff < 1% → pass, 1-5% → review, >5% → block
 * Phase 3 时使用。本阶段只创建框架。
 */
export interface ValidationReport {
  functionName: string;
  sentinelId: string;
  oldOutput: Record<string, unknown>;
  newOutput: Record<string, unknown>;
  diffPercent: number;
  status: 'pass' | 'review' | 'block';
}

export function validateMigration(
  functionName: string,
  sentinelId: string,
  oldOutput: Record<string, unknown>,
  newOutput: Record<string, unknown>,
): ValidationReport {
  const oldVal = typeof oldOutput.value === 'number' ? oldOutput.value : 0;
  const newVal = typeof newOutput.value === 'number' ? newOutput.value : 0;
  const base = Math.abs(oldVal) || 1;
  const diffPercent = Math.abs(newVal - oldVal) / base;

  let status: 'pass' | 'review' | 'block';
  if (diffPercent < 0.01) status = 'pass';
  else if (diffPercent < 0.05) status = 'review';
  else status = 'block';

  return { functionName, sentinelId, oldOutput, newOutput, diffPercent: Math.round(diffPercent * 10000) / 10000, status };
}
