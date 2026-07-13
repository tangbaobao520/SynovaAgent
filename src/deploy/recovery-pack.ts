/**
 * src/deploy/recovery-pack.ts — 一键恢复包生成器 (D50)
 *
 * 第9份权威文档 §4.1-4.2。
 * 本地 SQLite 数据库不需要增量/WAL/checksum 复杂策略。
 * 设计哲学: "降维到用户自救——一个加密自解压恢复包。"
 *
 * 接口:
 *   RecoveryPackBuilder.createRecoveryPack(password): RecoveryPackResult
 *   RecoveryPackBuilder.verifyRecoveryPack(path, password): VerifyResult
 *   RecoveryPackBuilder.restoreFromPack(path, password, targetDir?): RestoreResult
 */
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '@synova/logger';
import { getDataDirectory } from './data-directory';

const log = createLogger('deploy/recovery-pack');

/** 恢复包元数据 */
export interface PackMeta {
  createdAt: string;
  sourceDir: string;
  version: string;
  checksum: string;
  algorithm: string;
  fileCount: number;
}

/** 生成恢复包结果 */
export interface RecoveryPackResult {
  path: string;
  created: boolean;
  size: number;
  meta: PackMeta;
  error?: string;
}

/** 验证结果 */
export interface VerifyResult {
  valid: boolean;
  meta?: PackMeta;
  checksumMatch?: boolean;
  integrityOk?: boolean;
  errors: string[];
}

/** 恢复结果 */
export interface RestoreResult {
  success: boolean;
  targetDir: string;
  restoredFiles: string[];
  warnings: string[];
  error?: string;
}

/** 加密算法常量 */
const ALGORITHM = 'aes-256-cbc';
const KEY_ITERATIONS = 100000;
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16;
const PACK_EXTENSION = '.synova-recovery';

/** 保留的最近恢复包数量 */
const MAX_LOCAL_PACKS = 5;

/**
 * 一键恢复包生成器。
 * 使用 AES-256-CBC 加密，密码派生密钥。
 */
export class RecoveryPackBuilder {
  private dataDir: string;

  constructor() {
    this.dataDir = getDataDirectory();
  }

  /**
   * 从密码派生 AES 密钥 (PBKDF2)。
   */
  private deriveKey(password: string, salt: Buffer): Buffer {
    return crypto.pbkdf2Sync(password, salt, KEY_ITERATIONS, KEY_LENGTH, 'sha256');
  }

  /**
   * 扫描数据目录，收集所有需要备份的文件。
   */
  private collectFiles(): { name: string; content: Buffer }[] {
    const files: { name: string; content: Buffer }[] = [];

    if (!fs.existsSync(this.dataDir)) return files;

    const scanDir = (dir: string, prefix: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('_') || entry.name === '.synova-registry') continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanDir(fullPath, `${prefix}${entry.name}/`);
        } else {
          files.push({
            name: `${prefix}${entry.name}`,
            content: fs.readFileSync(fullPath),
          });
        }
      }
    };

    scanDir(this.dataDir, '');
    return files;
  }

  /**
   * 计算文件列表的整体 checksum (SHA-256)。
   */
  private computeChecksum(files: { name: string; content: Buffer }[]): string {
    const hash = crypto.createHash('sha256');
    // 按文件名排序以保证一致性
    const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name));
    for (const file of sorted) {
      hash.update(file.name);
      hash.update(file.content);
    }
    return hash.digest('hex');
  }

  /**
   * 序列化文件列表为 buffer。
   * 格式: [4字节 nameLen][name][8字节 contentLen][content]...
   */
  private serializeFiles(files: { name: string; content: Buffer }[]): Buffer {
    const parts: Buffer[] = [];

    for (const file of files) {
      const nameBuf = Buffer.from(file.name, 'utf-8');
      const nameLen = Buffer.alloc(4);
      nameLen.writeUInt32BE(nameBuf.length);
      const contentLen = Buffer.alloc(8);
      contentLen.writeBigUInt64BE(BigInt(file.content.length));

      parts.push(nameLen, nameBuf, contentLen, file.content);
    }

    return Buffer.concat(parts);
  }

  /**
   * 从 buffer 反序列化文件列表。
   */
  private deserializeFiles(buf: Buffer): { name: string; content: Buffer }[] {
    const files: { name: string; content: Buffer }[] = [];
    let offset = 0;

    while (offset < buf.length) {
      if (offset + 4 > buf.length) break;
      const nameLen = buf.readUInt32BE(offset);
      offset += 4;
      if (offset + nameLen > buf.length) break;
      const name = buf.toString('utf-8', offset, offset + nameLen);
      offset += nameLen;
      if (offset + 8 > buf.length) break;
      const contentLen = Number(buf.readBigUInt64BE(offset));
      offset += 8;
      if (offset + contentLen > buf.length) break;
      const content = Buffer.from(buf.subarray(offset, offset + contentLen));
      offset += contentLen;
      files.push({ name, content });
    }

    return files;
  }

  /**
   * 获取当前版本号。
   */
  private getVersion(): string {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8'));
      return pkg.version || '0.0.0';
    } catch {
      return '0.0.0';
    }
  }

  /**
   * 清理旧恢复包，只保留最近 MAX_LOCAL_PACKS 个。
   */
  private cleanOldPacks(packDir: string): void {
    try {
      if (!fs.existsSync(packDir)) return;
      const packs = fs.readdirSync(packDir)
        .filter(f => f.endsWith(PACK_EXTENSION))
        .map(f => ({
          name: f,
          path: path.join(packDir, f),
          mtime: fs.statSync(path.join(packDir, f)).mtimeMs,
        }))
        .sort((a, b) => b.mtime - a.mtime); // 最新在前

      if (packs.length <= MAX_LOCAL_PACKS) return;

      for (let i = MAX_LOCAL_PACKS; i < packs.length; i++) {
        fs.unlinkSync(packs[i].path);
        log.info({ path: packs[i].path }, '删除旧恢复包');
      }
    } catch (err: unknown) {
      log.warn({ err }, '清理旧恢复包失败');
    }
  }

  /**
   * 生成加密恢复包。
   * 约束: AES-256-CBC 加密，.synova-recovery 扩展名。
   *
   * @param password — 用户恢复密码
   * @returns RecoveryPackResult
   */
  createRecoveryPack(password: string): RecoveryPackResult {
    if (!password || password.length < 4) {
      return {
        path: '', created: false, size: 0,
        meta: { createdAt: '', sourceDir: '', version: '', checksum: '', algorithm: '', fileCount: 0 },
        error: '密码至少4位',
      };
    }

    const packDir = path.join(this.dataDir, '_recovery_packs');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const packPath = path.join(packDir, `recovery-${timestamp}${PACK_EXTENSION}`);

    try {
      if (!fs.existsSync(packDir)) {
        fs.mkdirSync(packDir, { recursive: true });
      }

      // 收集文件
      const files = this.collectFiles();
      const fileContent = this.serializeFiles(files);
      const checksum = this.computeChecksum(files);

      // 构建元数据
      const version = this.getVersion();
      const meta: PackMeta = {
        createdAt: new Date().toISOString(),
        sourceDir: this.dataDir,
        version,
        checksum,
        algorithm: ALGORITHM,
        fileCount: files.length,
      };

      // 加密
      const salt = crypto.randomBytes(16);
      const iv = crypto.randomBytes(IV_LENGTH);
      const key = this.deriveKey(password, salt);

      const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
      const encrypted = Buffer.concat([cipher.update(fileContent), cipher.final()]);

      // 打包: [salt(16)][iv(16)][metaLen(4)][metaJSON][encrypted]
      const metaJson = Buffer.from(JSON.stringify(meta), 'utf-8');
      const metaLen = Buffer.alloc(4);
      metaLen.writeUInt32BE(metaJson.length);

      const packBuffer = Buffer.concat([salt, iv, metaLen, metaJson, encrypted]);

      // 写入文件
      fs.writeFileSync(packPath, packBuffer);

      const stat = fs.statSync(packPath);

      // 清理旧的恢复包
      this.cleanOldPacks(packDir);

      log.info({ path: packPath, size: stat.size, files: files.length }, '恢复包创建完成');
      return { path: packPath, created: true, size: stat.size, meta };
    } catch (err: unknown) {
      const msg = `恢复包创建失败: ${(err as Error)?.message || String(err)}`;
      log.error({ err }, msg);
      return {
        path: packPath, created: false, size: 0,
        meta: { createdAt: '', sourceDir: '', version: '', checksum: '', algorithm: '', fileCount: 0 },
        error: msg,
      };
    }
  }

  /**
   * 验证恢复包完整性。
   * 解密 → checksum 验证 → 元数据解析。
   *
   * @param packPath — 恢复包路径
   * @param password — 用户恢复密码
   * @returns VerifyResult
   */
  verifyRecoveryPack(packPath: string, password: string): VerifyResult {
    const errors: string[] = [];

    if (!fs.existsSync(packPath)) {
      return { valid: false, errors: [`恢复包不存在: ${packPath}`] };
    }

    try {
      const packBuffer = fs.readFileSync(packPath);

      if (packBuffer.length < 36) { // salt(16) + iv(16) + metaLen(4) 最小值
        return { valid: false, errors: ['恢复包格式无效: 文件过短'] };
      }

      const salt = packBuffer.subarray(0, 16);
      const iv = packBuffer.subarray(16, 32);
      const metaLen = packBuffer.readUInt32BE(32);

      if (36 + metaLen > packBuffer.length) {
        return { valid: false, errors: ['恢复包格式无效: 元数据损坏'] };
      }

      const metaJson = packBuffer.toString('utf-8', 36, 36 + metaLen);
      const meta: PackMeta = JSON.parse(metaJson);
      const encrypted = packBuffer.subarray(36 + metaLen);

      // 解密
      const key = this.deriveKey(password, salt);
      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      let decrypted: Buffer;
      try {
        decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
      } catch {
        return { valid: false, errors: ['密码错误或数据损坏 — 解密失败'] };
      }

      // 反序列化并验证 checksum
      const files = this.deserializeFiles(decrypted);
      const actualChecksum = this.computeChecksum(files);
      const checksumMatch = actualChecksum === meta.checksum;

      if (!checksumMatch) {
        errors.push('Checksum 不匹配 — 数据可能已损坏');
      }

      log.info({ valid: checksumMatch, files: files.length }, '恢复包验证完成');
      return {
        valid: checksumMatch && errors.length === 0,
        meta,
        checksumMatch,
        integrityOk: checksumMatch,
        errors,
      };
    } catch (err: unknown) {
      const msg = `验证失败: ${(err as Error)?.message || String(err)}`;
      errors.push(msg);
      log.error({ err, packPath }, msg);
      return { valid: false, errors };
    }
  }

  /**
   * 从恢复包恢复数据。
   * 解密 → 解压 → 验证 → 释放到数据目录。
   *
   * @param packPath — 恢复包路径
   * @param password — 用户恢复密码
   * @param targetDir — 目标目录，默认 getDataDirectory()
   * @returns RestoreResult
   */
  restoreFromPack(packPath: string, password: string, targetDir?: string): RestoreResult {
    const target = targetDir || this.dataDir;
    const warnings: string[] = [];

    if (!fs.existsSync(packPath)) {
      return { success: false, targetDir: target, restoredFiles: [], warnings, error: `恢复包不存在: ${packPath}` };
    }

    // 先验证
    const verifyResult = this.verifyRecoveryPack(packPath, password);
    if (!verifyResult.valid) {
      return {
        success: false, targetDir: target, restoredFiles: [],
        warnings: verifyResult.errors,
        error: `恢复包验证失败: ${verifyResult.errors.join('; ')}`,
      };
    }

    try {
      const packBuffer = fs.readFileSync(packPath);
      const salt = packBuffer.subarray(0, 16);
      const iv = packBuffer.subarray(16, 32);
      const metaLen = packBuffer.readUInt32BE(32);
      const metaJson = packBuffer.toString('utf-8', 36, 36 + metaLen);
      const meta: PackMeta = JSON.parse(metaJson);
      const encrypted = packBuffer.subarray(36 + metaLen);

      const key = this.deriveKey(password, salt);
      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
      const files = this.deserializeFiles(decrypted);

      // 确保目标目录存在
      if (!fs.existsSync(target)) {
        fs.mkdirSync(target, { recursive: true });
      }

      // 恢复文件
      const restoredFiles: string[] = [];
      for (const file of files) {
        const filePath = path.join(target, file.name);
        const fileDir = path.dirname(filePath);
        if (!fs.existsSync(fileDir)) {
          fs.mkdirSync(fileDir, { recursive: true });
        }
        fs.writeFileSync(filePath, file.content);
        restoredFiles.push(file.name);
      }

      log.info({ target, files: restoredFiles.length }, '恢复完成');
      return { success: true, targetDir: target, restoredFiles, warnings };
    } catch (err: unknown) {
      const msg = `恢复失败: ${(err as Error)?.message || String(err)}`;
      log.error({ err, packPath, target }, msg);
      return { success: false, targetDir: target, restoredFiles: [], warnings, error: msg };
    }
  }

  /**
   * 列出本地可用恢复包。
   */
  listRecoveryPacks(): string[] {
    const packDir = path.join(this.dataDir, '_recovery_packs');
    if (!fs.existsSync(packDir)) return [];

    try {
      return fs.readdirSync(packDir)
        .filter(f => f.endsWith(PACK_EXTENSION))
        .map(f => path.join(packDir, f))
        .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    } catch {
      return [];
    }
  }
}
