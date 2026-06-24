/** 统计工具函数 */
export function mean(values: number[]): number { return values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : 0; }
export function stddev(values: number[]): number { const m = mean(values); return Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(values.length, 1)); }
export function trend(values: number[]): 'up'|'down'|'flat' { if (values.length < 2) return 'flat'; const l = values[values.length - 1], p = values[values.length - 2]; if (l > p * 1.05) return 'up'; if (l < p * 0.95) return 'down'; return 'flat'; }
export function percentChange(current: number, previous: number): number { return previous !== 0 ? (current - previous) / Math.abs(previous) : 0; }
