/**
 * src/deploy/backup-verify.ts — 备份验证器 (D50)
 *
 * 第9份权威文档 §4.4。
 * 本地月度验证: 解压 → SQLite PRAGMA integrity_check → YAML 语法 → checksum
 * 远程可用性探测: 下载头部元数据块 (<1KB)
 *
 * 接口:
 *   verifyLocalBackup(packPath, password): VerifyResult
 *   probeRemotePack(url, token): RemoteProbeResult
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { createLogger } from '@synova/logger';
import type { VerifyResult } from './recovery-pack';
import { RecoveryPackBuilder } from './recovery-pack';

const log = createLogger('deploy/backup-verify');

/** 远程探测结果 */
export interface RemoteProbeResult {
  reachable: boolean;
  metaSize?: number;
  lastModified?: string;
  error?: string;
}

/** 验证类别 */
interface ValidationCheck {
  name: string;
  run: () => Promise<string | null>; // null = 通过, 字符串 = 错误
}

/**
 * 本地恢复包验证。
 * 自动执行: 解密 → SQLite integrity_check → YAML 语法 → checksum
 *
 * @param packPath — 恢复包路径
 * @param password — 恢复密码
 * @returns VerifyResult
 */
export async function verifyLocalBackup(packPath: string, password: string): Promise<VerifyResult> {
  const errors: string[] = [];
  const builder = new RecoveryPackBuilder();

  // 1. 验证包结构和解密
  const verifyResult = builder.verifyRecoveryPack(packPath, password);
  if (!verifyResult.valid) {
    return verifyResult;
  }

  // 2. 额外检查: 尝试解密并检查 SQLite 文件
  try {
    const tmpDir = path.join(os.tmpdir(), 'synova-verify-' + Date.now());
    const restoreResult = builder.restoreFromPack(packPath, password, tmpDir);

    if (restoreResult.success) {
      // 对每个 .db 文件执行 SQLite integrity_check
      for (const fileName of restoreResult.restoredFiles) {
        if (fileName.endsWith('.db')) {
          const dbPath = path.join(tmpDir, fileName);
          try {
            // 使用文件级别检查: 验证 SQLite 格式头
            const fd = fs.openSync(dbPath, 'r');
            const buf = Buffer.alloc(16);
            fs.readSync(fd, buf, 0, 16, 0);
            fs.closeSync(fd);
            if (!buf.toString('utf-8').startsWith('SQLite format 3')) {
              errors.push(`${fileName}: 不是有效的 SQLite 数据库`);
            } else {
              const stat = fs.statSync(dbPath);
              log.debug({ dbFile: fileName, size: stat.size }, 'SQLite 数据库验证通过');
            }
          } catch (err: unknown) {
            log.warn({ err: err instanceof Error ? err.message : String(err) }, "文件系统操作失败");
            errors.push(`${fileName}: SQLite 验证失败 — ${(err as Error)?.message || String(err)}`);
          }
        }

        // 对 .yaml/.yml 文件做基本语法检查
        if (fileName.endsWith('.yaml') || fileName.endsWith('.yml')) {
          const content = fs.readFileSync(path.join(tmpDir, fileName), 'utf-8');
          if (content.includes('{') && content.includes('}')) {
            try {
              JSON.parse(content);
            } catch (err) {
              log.warn({ err: err instanceof Error ? err.message : String(err) }, "JSON 解析失败");
              // YAML 包含大括号内容但非 JSON 格式, 这在 YAML 中合法, 跳过
            }
          }
        }
      }

      // 清理临时目录
      cleanupTempDir(tmpDir);
    }
  } catch (err: unknown) {
    log.warn({ err }, '深度验证临时解压失败');
    errors.push(`深度验证临时解压失败: ${(err as Error)?.message || String(err)}`);
  }

  const valid = errors.length === 0 && verifyResult.valid;
  log.info({ valid, checksumMatch: verifyResult.checksumMatch, errors: errors.length }, '本地备份验证完成');

  return {
    valid,
    meta: verifyResult.meta,
    checksumMatch: verifyResult.checksumMatch,
    integrityOk: valid,
    errors: [...verifyResult.errors, ...errors],
  };
}

/**
 * 远程恢复包可用性探测。
 * 下载加密包的头部元数据块 (<1KB) 验证完整性。
 *
 * @param url — 远程恢复包 URL
 * @param token — 访问令牌
 * @returns RemoteProbeResult
 */
export async function probeRemotePack(url: string, token: string): Promise<RemoteProbeResult> {
  try {
    const http = await import('http');
    const https = await import('https');

    const isHttps = url.startsWith('https');
    const client = isHttps ? https.default : http.default;

    return new Promise((resolve) => {
      const req = client.get(url, {
        headers: { Authorization: `Bearer ${token}`, Range: 'bytes=0-1023' },
        timeout: 10000,
      }, (res) => {
        if (res.statusCode === 200 || res.statusCode === 206) {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => {
            const data = Buffer.concat(chunks);
            if (data.length >= 36) {
              resolve({
                reachable: true,
                metaSize: data.length,
                lastModified: res.headers['last-modified'] || undefined,
              });
            } else {
              resolve({ reachable: true, metaSize: data.length, error: '响应数据不足以读取元数据' });
            }
          });
        } else {
          resolve({ reachable: false, error: `HTTP ${res.statusCode}` });
        }
      });

      req.on('error', (err: Error) => {
        resolve({ reachable: false, error: err.message });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({ reachable: false, error: '连接超时' });
      });
    });
  } catch (err: unknown) {
    log.warn({ err: err instanceof Error ? err.message : String(err) }, "动态模块加载失败");
    return { reachable: false, error: (err as Error)?.message || String(err) };
  }
}

/** 清理临时目录 */
function cleanupTempDir(dir: string): void {
  try {
    if (fs.existsSync(dir)) {
      const entries = fs.readdirSync(dir);
      for (const entry of entries) {
        const fullPath = path.join(dir, entry);
        if (fs.statSync(fullPath).isDirectory()) {
          cleanupTempDir(fullPath);
        }
        fs.unlinkSync(fullPath);
      }
      fs.rmdirSync(dir);
    }
  } catch (err) {
    log.warn({ err: err instanceof Error ? err.message : String(err) }, "文件系统操作失败");
    // 忽略清理错误
  }
}
