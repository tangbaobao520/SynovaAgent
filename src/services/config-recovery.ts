/**
 * services/config-recovery.ts — 配置恢复 (Phase 4.2)
 *
 * 启动时检测配置文件损坏，自动从 .bak 备份恢复。
 * 校验: JSON 解析 + 文件大小 + 密钥占位符检测。
 *
 * 铁律 24: 降级路径有 log.warn
 * 铁律 38: 纯类型安全
 */
import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '@synova/logger';

const log = createLogger('services/config-recovery');

// ═══ 类型 ═══

export interface VerifyResult {
  ok: boolean;
  corrupted?: boolean;
  restored?: boolean;
  warning?: string;
  error?: string;
}

// ═══ 常量 ═══

/** 占位符模式 — 拒绝恢复含这些值的配置 */
const PLACEHOLDER_PATTERNS = [
  /^\*{3,}$/,          // ***
  /^\[redacted\]$/i,   // [redacted]
  /^\[REDACTED\]$/,    // [REDACTED]
];

// ═══ ConfigRecovery ═══

export class ConfigRecovery {
  /**
   * 验证并尝试恢复配置文件。
   * 1. 检查文件是否存在
   * 2. JSON 解析校验
   * 3. 文件大小对比（与 .bak 比）
   * 4. 密钥占位符检测
   * 5. 损坏时自动从 .bak 恢复
   */
  static verify(configPath: string): VerifyResult {
    // 检查文件是否存在
    if (!fs.existsSync(configPath)) {
      log.warn({ path: configPath }, '配置文件不存在');
      return { ok: false, error: '文件不存在' };
    }

    let content: string;
    let size: number;

    try {
      const stat = fs.statSync(configPath);
      size = stat.size;
      content = fs.readFileSync(configPath, 'utf-8');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn({ err: msg, path: configPath }, '读取配置文件失败');
      return { ok: false, error: msg, corrupted: true, restored: false };
    }

    // JSON 解析校验
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn({ err: msg, path: configPath }, '配置文件 JSON 解析失败 — 尝试恢复');

      // 尝试从 .bak 恢复
      const bakPath = configPath + '.bak';
      if (fs.existsSync(bakPath)) {
        return ConfigRecovery.restoreFromBackup(configPath, bakPath);
      }

      log.warn({ path: configPath }, '无 .bak 备份 — 无法恢复');
      return { ok: false, error: `JSON 解析失败: ${msg}`, corrupted: true, restored: false };
    }

    // 文件大小对比（如果 .bak 存在）
    const bakPath = configPath + '.bak';
    if (fs.existsSync(bakPath)) {
      try {
        const bakSize = fs.statSync(bakPath).size;
        if (bakSize > 0 && size < bakSize * 0.5) {
          log.warn({ path: configPath, size, bakSize }, '配置文件大小下降超过 50% — 标记可疑');
          return { ok: true, warning: `配置文件缩小超过 50% (${size} vs ${bakSize})` };
        }
      } catch (err) {
        log.warn({ err: err instanceof Error ? err.message : String(err) }, "文件系统操作失败");
        /* 检查失败不阻断 */
      }
    }

    // 密钥占位符检测
    const warnings = ConfigRecovery.detectPlaceholders(parsed);
    if (warnings.length > 0) {
      log.warn({ fields: warnings, path: configPath }, '配置文件包含占位符密钥');
    }

    log.info({ path: configPath, size }, '配置校验通过');
    return { ok: true };
  }

  // ═══ Private ═══

  /**
   * 从 .bak 备份恢复配置文件。
   * 恢复前检查备份文件是否有效且不含占位符。
   */
  private static restoreFromBackup(configPath: string, bakPath: string): VerifyResult {
    try {
      const bakContent = fs.readFileSync(bakPath, 'utf-8');
      let bakParsed: unknown;
      try {
        bakParsed = JSON.parse(bakContent);
      } catch {
        log.warn({ path: bakPath }, '备份文件 JSON 也无效 — 无法恢复');
        return { ok: false, error: '备份文件损坏', corrupted: true, restored: false };
      }

      // 检查备份文件是否含占位符
      const placeholders = ConfigRecovery.detectPlaceholders(bakParsed);
      if (placeholders.length > 0) {
        log.warn({ fields: placeholders }, '备份文件包含占位符密钥 — 拒绝恢复');
        return { ok: false, error: `备份含占位符: ${placeholders.join(', ')}`, corrupted: true, restored: false };
      }

      // 执行恢复
      fs.writeFileSync(configPath, bakContent, 'utf-8');
      log.info({ path: configPath, bakPath }, '已从 .bak 恢复配置文件');
      return { ok: true, restored: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn({ err: msg }, '从备份恢复失败');
      return { ok: false, error: msg, corrupted: true, restored: false };
    }
  }

  /**
   * 检测解析后的配置对象中是否含占位符值。
   */
  private static detectPlaceholders(obj: unknown, prefix = ''): string[] {
    const warnings: string[] = [];
    if (obj && typeof obj === 'object') {
      for (const [key, value] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        if (typeof value === 'string') {
          for (const pattern of PLACEHOLDER_PATTERNS) {
            if (pattern.test(value)) {
              warnings.push(fullKey);
              break;
            }
          }
        } else if (value && typeof value === 'object') {
          warnings.push(...ConfigRecovery.detectPlaceholders(value, fullKey));
        }
      }
    }
    return warnings;
  }
}
