/**
 * security/external-hash-store.ts — 外部不可变存储接口 (D41)
 *
 * 安全规范 4.2: 定时发布 Root Hash 到外部不可变存储（如 S3 Object Lock、OSS 合规桶）。
 * 当前实现：本地文件存储（默认），云存储接口预留。
 *
 * 设计原则:
 * - 接口抽象：ExternalHashStore 定义 publish() / verify() 契约
 * - LocalFileHashStore 是默认实现，零外部依赖
 * - 云存储实现（S3/OSS）只定义接口不实现（可扩展）
 * - 所有操作有降级路径
 */
import { createHash } from 'node:crypto';
import { createLogger } from '@synova/logger';
import * as fs from 'node:fs';
import * as path from 'node:path';

const log = createLogger('security/external-hash-store');

// ════════════════════════════════════════════════════════════════
// 接口定义
// ════════════════════════════════════════════════════════════════

export interface PublishResult {
  stored: boolean;
  location: string;
}

export interface ExternalHashStore {
  /**
   * 发布根哈希到外部存储。
   * @param orgId     - 组织 ID
   * @param rootHash  - 64 字符十六进制 SHA-256 哈希值
   * @param timestamp - 发布时间（ISO 8601）
   * @param signature - 签名（当前用哈希双计算模拟，未来可用私钥签名）
   * @returns 发布结果
   */
  publish(orgId: string, rootHash: string, timestamp: string, signature: string): Promise<PublishResult>;

  /**
   * 验证外部存储中指定 org 的根哈希。
   * @param orgId   - 组织 ID
   * @param rootHash - 期望的哈希值
   * @returns true=匹配, false=不匹配或记录不存在
   */
  verify(orgId: string, rootHash: string): Promise<boolean>;
}

// ════════════════════════════════════════════════════════════════
// 本地文件实现（默认）
// ════════════════════════════════════════════════════════════════

export class LocalFileHashStore implements ExternalHashStore {
  private readonly baseDir: string;

  /**
   * @param baseDir - 根哈希存储目录（默认为 .claude/audit-hashes/）
   */
  constructor(baseDir?: string) {
    this.baseDir = baseDir || path.join(process.cwd(), '.claude', 'audit-hashes');
  }

  async publish(
    orgId: string,
    rootHash: string,
    timestamp: string,
    signature: string,
  ): Promise<PublishResult> {
    try {
      const orgDir = path.join(this.baseDir, orgId);
      fs.mkdirSync(orgDir, { recursive: true });

      const filename = `root-hash-${timestamp.replace(/[:.]/g, '-')}.json`;
      const filePath = path.join(orgDir, filename);

      const payload = JSON.stringify({
        orgId,
        rootHash,
        timestamp,
        signature,
        publishedAt: new Date().toISOString(),
      }, null, 2);

      fs.writeFileSync(filePath, payload, 'utf-8');
      log.info({ orgId, rootHash: rootHash.slice(0, 12) + '…', filePath }, '根哈希已发布到本地存储');

      return { stored: true, location: filePath };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn({ err: msg, orgId }, '根哈希发布到本地存储失败 — degraded');
      return { stored: false, location: '' };
    }
  }

  async verify(orgId: string, rootHash: string): Promise<boolean> {
    try {
      const orgDir = path.join(this.baseDir, orgId);
      if (!fs.existsSync(orgDir)) return false;

      // 读取目录中最新的发布记录
      const files = fs.readdirSync(orgDir)
        .filter(f => f.startsWith('root-hash-') && f.endsWith('.json'))
        .sort()
        .reverse();

      if (files.length === 0) return false;

      const latestFile = path.join(orgDir, files[0]);
      const content = JSON.parse(fs.readFileSync(latestFile, 'utf-8')) as { rootHash: string };

      return content.rootHash === rootHash;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn({ err: msg, orgId }, '根哈希验证失败 — degraded');
      return false;
    }
  }
}

/**
 * 为 signature 生成"签名"（当前用哈希双计算模拟）。
 * 未来可替换为私钥签名（如 Ed25519）。
 */
export function signRootHash(rootHash: string, secret: string): string {
  return createHash('sha256').update(rootHash + '|' + secret, 'utf-8').digest('hex');
}
