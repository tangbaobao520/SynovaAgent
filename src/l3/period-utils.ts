/**
 * l3/period-utils.ts — period → 时间字段推导工具函数 (D33)
 *
 * 数据层规范 §2.2: period 格式映射规则。
 * 铁律 39: L3 层，同时被 L2 data-ingest-service 和 L4 graph-bridge 引用。
 *    L2→L3✓  L4→L3✓  无跨层违规。
 */

/** 从 period 推导 valid_from (起始日期) */
export function deriveValidFrom(period: string): string {
  const qMatch = period.match(/^(\d{4})-Q([1-4])$/);
  if (qMatch) {
    const quarters: Record<string, string> = { '1': '01-01', '2': '04-01', '3': '07-01', '4': '10-01' };
    return `${qMatch[1]}-${quarters[qMatch[2]]}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(period)) return period;
  if (/^\d{4}-\d{2}$/.test(period)) return `${period}-01`;
  if (/^\d{4}$/.test(period)) return `${period}-01-01`;
  return period;
}

/** 从 period 推导 valid_to (结束日期) */
export function deriveValidTo(period: string): string {
  const qMatch = period.match(/^(\d{4})-Q([1-4])$/);
  if (qMatch) {
    const quarterEnds: Record<string, string> = { '1': '03-31', '2': '06-30', '3': '09-30', '4': '12-31' };
    return `${qMatch[1]}-${quarterEnds[qMatch[2]]}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(period)) return period;
  if (/^\d{4}-\d{2}$/.test(period)) {
    const [y, m] = period.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    return `${period}-${String(lastDay).padStart(2, '0')}`;
  }
  if (/^\d{4}$/.test(period)) return `${period}-12-31`;
  return period;
}
