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
