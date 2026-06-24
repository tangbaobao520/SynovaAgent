/** 阈值判断工具函数 */
export function evaluateThreshold(value: number, threshold: { warning: number; critical: number }, direction: 'higher_is_worse'|'lower_is_worse' = 'lower_is_worse'): 'ok'|'warning'|'critical' {
  if (direction === 'lower_is_worse') { if (value <= threshold.critical) return 'critical'; if (value <= threshold.warning) return 'warning'; return 'ok'; }
  if (value >= threshold.critical) return 'critical'; if (value >= threshold.warning) return 'warning'; return 'ok';
}
export function isWarning(value: number, threshold: { warning: number; critical: number }, direction?: 'higher_is_worse'|'lower_is_worse'): boolean { return evaluateThreshold(value, threshold, direction) === 'warning'; }
export function isCritical(value: number, threshold: { warning: number; critical: number }, direction?: 'higher_is_worse'|'lower_is_worse'): boolean { return evaluateThreshold(value, threshold, direction) === 'critical'; }
