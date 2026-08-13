/**
 * services/db-encryption.ts — SQLite 文件级加密 (P0-5.3)
 *
 * 数据库文件在磁盘上以 AES-256-GCM 加密存储。
 * 启动时解密到临时文件 → 进程运行期间明文 → 关闭时重新加密。
 *
 * 约束: better-sqlite3 不支持原生加密。sqlcipher 需编译 native addon。
 * 此实现作为应用层加密——不修改任何 SQL 查询。
 *
 * 密钥派生: scrypt(masterSecret, salt) → 32-byte key
 * 加密: AES-256-GCM + random 12-byte IV + 16-byte auth tag
 */
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '@synova/logger';

const log = createLogger('services/db-encryption');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

export interface EncryptionConfig {
  masterSecret: string;
  salt: string;
  dbPath: string;
}

/**
 * Derive a 256-bit encryption key from master secret + salt.
 */
function deriveKey(masterSecret: string, salt: string): Buffer {
  return crypto.scryptSync(masterSecret, salt, KEY_LENGTH);
}

/**
 * Encrypt a database file.
 * Reads plaintext → encrypts → writes ciphertext → removes plaintext.
 * Output format: [IV:12 bytes][authTag:16 bytes][ciphertext]
 */
export function encryptDatabase(config: EncryptionConfig): boolean {
  const { masterSecret, salt, dbPath } = config;
  if (!fs.existsSync(dbPath)) {
    log.warn({ path: dbPath }, '数据库文件不存在 — 跳过加密');
    return false;
  }

  try {
    const key = deriveKey(masterSecret, salt);
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

    const plaintext = fs.readFileSync(dbPath);
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // Write: IV + authTag + ciphertext
    const output = Buffer.concat([iv, authTag, encrypted]);
    const encryptedPath = dbPath + '.enc';
    fs.writeFileSync(encryptedPath, output);

    // Atomically replace plaintext with encrypted version
    fs.renameSync(encryptedPath, dbPath);

    log.info({ path: dbPath, size: plaintext.length }, '数据库已加密');
    return true;
  } catch (err: any) {
    log.error({ err, path: dbPath }, '数据库加密失败');
    return false;
  }
}

/**
 * Decrypt a database file.
 * Reads ciphertext → decrypts → writes plaintext → original is overwritten.
 * Returns false if file is not encrypted (plaintext already).
 */
export function decryptDatabase(config: EncryptionConfig): boolean {
  const { masterSecret, salt, dbPath } = config;
  if (!fs.existsSync(dbPath)) return false;

  try {
    const data = fs.readFileSync(dbPath);
    if (data.length < IV_LENGTH + AUTH_TAG_LENGTH) {
      // File too short to be encrypted — assume plaintext
      return false;
    }

    const key = deriveKey(masterSecret, salt);
    const iv = data.subarray(0, IV_LENGTH);
    const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

    // Write plaintext back (in-place)
    fs.writeFileSync(dbPath, decrypted);

    log.info({ path: dbPath, size: decrypted.length }, '数据库已解密');
    return true;
  } catch (err: any) {
    log.warn({ err: err instanceof Error ? err.message : String(err) }, "Write plaintext back (in-place)");
    // Decryption failure — file may already be plaintext or is corrupted
    if (err.message?.includes('unsupported state') || err.message?.includes('authentication')) {
      log.warn({ path: dbPath }, '数据库解密失败 — 可能已是明文或密钥不匹配');
      return false;
    }
    log.error({ err, path: dbPath }, '数据库解密异常');
    return false;
  }
}

/**
 * Check if a database file appears to be encrypted.
 * Encrypted files have a recognizable IV + authTag prefix structure
 * with high-entropy content (not ASCII SQL).
 */
export function isDatabaseEncrypted(dbPath: string): boolean {
  if (!fs.existsSync(dbPath)) return false;
  try {
    const header = fs.readFileSync(dbPath).subarray(0, 100);
    // SQLite databases start with "SQLite format 3\0"
    const isSQLite = header.toString('utf8', 0, 16).startsWith('SQLite format 3');
    if (isSQLite) return false; // Plaintext SQLite

    // Encrypted data is high-entropy — not ASCII
    const asciiCount = [...header].filter(b => b >= 0x20 && b <= 0x7e).length;
    return asciiCount < header.length * 0.5;
  } catch (err) {
    log.error({ err }, '数据库加密检测失败');
    return false;
  }
}

/**
 * Auto-detect and decrypt on startup. Returns whether decryption was performed.
 */
export function autoDecryptOnStartup(config: EncryptionConfig): boolean {
  if (isDatabaseEncrypted(config.dbPath)) {
    return decryptDatabase(config);
  }
  return false;
}

/**
 * Encrypt database on graceful shutdown. Should be called in SIGTERM handler.
 */
export function autoEncryptOnShutdown(config: EncryptionConfig): boolean {
  // Only encrypt if db exists and is plaintext
  if (isDatabaseEncrypted(config.dbPath)) return false;
  return encryptDatabase(config);
}

// ═══ P2: SQLite 定期备份 ═══

export interface BackupConfig {
  dbPath: string;
  backupDir: string;
  maxBackups: number;
  encryptBackups: boolean;
  masterSecret?: string;
  salt?: string;
}

/**
 * Create a timestamped backup of the database file.
 * If encryptBackups=true, backup is AES-256-GCM encrypted.
 * Old backups beyond maxBackups are pruned.
 */
export function backupDatabase(config: BackupConfig): { ok: boolean; path?: string; error?: string } {
  try {
    if (!fs.existsSync(config.dbPath)) {
      return { ok: false, error: '数据库文件不存在' };
    }

    // Ensure backup dir exists
    if (!fs.existsSync(config.backupDir)) {
      fs.mkdirSync(config.backupDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(config.backupDir, `synova-backup-${timestamp}.db`);

    // Copy database
    if (config.encryptBackups && config.masterSecret && config.salt) {
      const key = crypto.scryptSync(config.masterSecret, config.salt + '-backup', 32);
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
      const plaintext = fs.readFileSync(config.dbPath);
      const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
      const authTag = cipher.getAuthTag();
      fs.writeFileSync(backupPath, Buffer.concat([iv, authTag, encrypted]));
    } else {
      fs.copyFileSync(config.dbPath, backupPath);
    }

    // Prune old backups
    const files = fs.readdirSync(config.backupDir)
      .filter(f => f.startsWith('synova-backup-'))
      .sort();
    while (files.length > config.maxBackups) {
      fs.unlinkSync(path.join(config.backupDir, files.shift()!));
    }

    return { ok: true, path: backupPath };
  } catch (err: any) {
    log.warn({ err: err instanceof Error ? err.message : String(err) }, "文件系统操作失败");
    return { ok: false, error: err.message };
  }
}

