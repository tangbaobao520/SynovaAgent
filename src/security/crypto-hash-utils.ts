/**
 * security/crypto-hash-utils.ts — 审计哈希计算工具 (D41)
 *
 * 纯函数：SHA-256 哈希计算，输入确定则输出确定。
 * 用于审计日志哈希链（prev_hash → current_hash），防止篡改。
 *
 * 安全规范 4.1:
 *   current_hash = SHA256(operation + operator + tenant_id + timestamp + prev_hash + data_snapshot)
 *
 * 设计原则:
 * - 零副作用，可独立测试
 * - 创世块 prev_hash = '0'.repeat(64)
 */
import { createHash } from 'node:crypto';

/**
 * 计算审计日志条目的 SHA-256 哈希。
 *
 * @param operation   - 审计操作（如 "node.create", "threshold.update"）
 * @param operator    - 操作者 ID（如 actorId）
 * @param tenantId    - 租户/组织 ID
 * @param timestamp   - ISO 时间戳
 * @param prevHash    - 上一条记录的 current_hash（创世块为 '0'.repeat(64)）
 * @param dataSnapshot - 操作数据的 JSON 序列化快照
 * @returns 64 字符小写十六进制 SHA-256 哈希值
 */
export function computeAuditHash(
  operation: string,
  operator: string,
  tenantId: string,
  timestamp: string,
  prevHash: string,
  dataSnapshot: string,
): string {
  const input = [
    operation,
    operator,
    tenantId,
    timestamp,
    prevHash,
    dataSnapshot,
  ].join('|');
  return createHash('sha256').update(input, 'utf-8').digest('hex');
}

/**
 * 生成审计数据快照（JSON 序列化）。
 *
 * 将审计条目中可变字段序列化为一致字符串，用于哈希计算。
 * 使用排序键确保确定性输出。
 */
export function buildDataSnapshot(entry: {
  action: string;
  targetType?: string;
  targetId?: string;
  oldValue?: string;
  newValue?: string;
}): string {
  return JSON.stringify({
    action: entry.action,
    targetType: entry.targetType ?? null,
    targetId: entry.targetId ?? null,
    oldVal: entry.oldValue ?? null,
    newVal: entry.newValue ?? null,
  });
}

/**
 * 创世块哈希值（64 个 '0'）。
 */
export const GENESIS_HASH = '0'.repeat(64);
