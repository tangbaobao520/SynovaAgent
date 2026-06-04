/**
 * security/credential-vault.ts — 凭证加密存储 (L5 Security Sandbox)
 *
 * L5-SECURITY-SANDBOX §P0: 替代 .env 明文。AES-256-GCM 加密，主进程不持有明文。
 */
import * as crypto from 'crypto';
import Database from 'better-sqlite3';
import { createLogger } from '../logger';

const log = createLogger('security/credential-vault');

export class CredentialVault {
  private key: Buffer;
  private db: Database.Database;

  constructor(db: Database.Database, masterSecret: string, salt: string) {
    this.db = db;
    this.key = crypto.scryptSync(masterSecret, salt, 32);
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS connector_credentials (
        id TEXT PRIMARY KEY,
        connector_name TEXT NOT NULL,
        encrypted_data TEXT NOT NULL,
        iv TEXT NOT NULL,
        auth_tag TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
    `);
  }

  /** Store encrypted credentials */
  store(connectorId: string, connectorName: string, creds: Record<string, string>): void {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    const plaintext = JSON.stringify(creds);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    this.db.prepare(
      'INSERT OR REPLACE INTO connector_credentials (id, connector_name, encrypted_data, iv, auth_tag, updated_at) VALUES (?,?,?,?,?,datetime(\'now\'))'
    ).run(connectorId, connectorName, encrypted.toString('base64'), iv.toString('base64'), tag.toString('base64'));

    log.info({ connectorId, connectorName }, '凭证已加密存储');
  }

  /** Decrypt credentials for subprocess — returns JSON string for stdin pipe */
  decryptForSubprocess(connectorId: string): string | null {
    const row = this.db.prepare(
      'SELECT encrypted_data, iv, auth_tag FROM connector_credentials WHERE id=?'
    ).get(connectorId) as { encrypted_data: string; iv: string; auth_tag: string } | undefined;

    if (!row) {
      log.warn({ connectorId }, '凭证不存在');
      return null;
    }

    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, Buffer.from(row.iv, 'base64'));
      decipher.setAuthTag(Buffer.from(row.auth_tag, 'base64'));
      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(row.encrypted_data, 'base64')),
        decipher.final(),
      ]);
      return decrypted.toString('utf8');
    } catch (err: any) {
      log.error({ err, connectorId }, '凭证解密失败');
      return null;
    }
  }

  /** Delete stored credentials */
  delete(connectorId: string): void {
    this.db.prepare('DELETE FROM connector_credentials WHERE id=?').run(connectorId);
  }

  /** List stored connector IDs (no plaintext) */
  list(): Array<{ id: string; name: string; updatedAt: string }> {
    return this.db.prepare(
      'SELECT id, connector_name as name, updated_at as updatedAt FROM connector_credentials ORDER BY updated_at DESC'
    ).all() as Array<{ id: string; name: string; updatedAt: string }>;
  }
}

/** Derive a key from master secret (for vault construction) */
export function createVaultKey(masterSecret: string, salt?: string): { key: Buffer; salt: string } {
  const s = salt || crypto.randomBytes(16).toString('hex');
  const key = crypto.scryptSync(masterSecret, s, 32);
  return { key, salt: s };
}

// ═══ Hermes P6: 凭据池轮换 (CredentialPool) ═══

export interface PoolEntry {
  connectorId: string;
  credentials: Record<string, string>;
  status: 'ok' | 'exhausted' | 'dead';
  lastError?: string;
  usedCount: number;
}

export class CredentialPool {
  private credentials = new Map<string, PoolEntry>();
  private recoveryTimers = new Map<string, ReturnType<typeof setTimeout>>();

  register(connectorId: string, creds: Record<string, string>): void {
    this.credentials.set(connectorId, {
      connectorId, credentials: creds, status: 'ok', usedCount: 0,
    });
  }

  /** Round-robin: 返回使用次数最少的可用凭据 */
  acquire(): { connectorId: string; credentials: Record<string, string> } | null {
    const available = [...this.credentials.values()]
      .filter(c => c.status === 'ok')
      .sort((a, b) => a.usedCount - b.usedCount);
    if (available.length === 0) return null;
    const selected = available[0];
    selected.usedCount++;
    return { connectorId: selected.connectorId, credentials: { ...selected.credentials } };
  }

  /** 标记凭据错误 — exhausted 状态, 24h 后自动恢复 */
  markError(connectorId: string, error: string): void {
    const entry = this.credentials.get(connectorId);
    if (!entry) return;
    entry.lastError = error;
    entry.status = 'exhausted';
    // 清除已有恢复定时器
    const existing = this.recoveryTimers.get(connectorId);
    if (existing) clearTimeout(existing);
    this.recoveryTimers.set(connectorId, setTimeout(() => {
      const e = this.credentials.get(connectorId);
      if (e && e.status === 'exhausted') e.status = 'ok';
    }, 24 * 3600_000));
  }

  /** 标记凭据永久失效 */
  markDead(connectorId: string): void {
    const entry = this.credentials.get(connectorId);
    if (entry) entry.status = 'dead';
  }

  /** 列出所有凭据状态 */
  listStatus(): Array<{ id: string; status: string; usedCount: number; lastError?: string }> {
    return [...this.credentials.entries()].map(([id, e]) => ({
      id, status: e.status, usedCount: e.usedCount, lastError: e.lastError,
    }));
  }
}

let _credentialPool: CredentialPool | null = null;
export function getCredentialPool(): CredentialPool {
  if (!_credentialPool) _credentialPool = new CredentialPool();
  return _credentialPool;
}
