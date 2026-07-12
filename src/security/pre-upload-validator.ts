/**
 * src/security/pre-upload-validator.ts — D42: 知识基座上传播前隐私预检
 *
 * 安全规范 6.1。上传前执行隐私预检：
 * 扫描内容 → 检测PII模式 → 检测企业机密关键词 → blocked阻止上传 | warn标记"需GA审查"
 *
 * 复用 PIIScrubber 的 PII 模式库，不重复实现检测逻辑。
 * 铁律 24+31: 降级不阻断 — 验证服务故障时放行（宁可漏报不可误阻）。
 * 铁律 38: 零 as any。
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createLogger } from '@synova/logger';
import { PIIScrubber, type SensitivityLevel } from './pii-scrubber';

const log = createLogger('security/pre-upload-validator');

// ═══ Types ═══

export interface SensitiveKeywords {
  blocked: string[];
  warn: string[];
}

export interface PreUploadResult {
  ok: boolean;
  warnings: string[];
  blocked: boolean;
}

// ═══ PreUploadValidator ═══

export class PreUploadValidator {
  private scrubber: PIIScrubber;
  private keywords: SensitiveKeywords;

  constructor(scrubber: PIIScrubber, keywords?: SensitiveKeywords) {
    this.scrubber = scrubber;
    this.keywords = keywords ?? { blocked: [], warn: [] };
  }

  /**
   * validate — 验证内容是否含敏感信息。
   *
   * @param content — 待检测文本
   * @param tenantId — 租户 ID（用于日志追踪）
   * @returns PreUploadResult
   *
   * 边界条件:
   * - 空内容 → 直接通过
   * - 超大文本(>100KB) → 截断前100KB检测
   * - PIIScrubber 不可用 → 降级放行（blocked=false）
   * - 关键词文件缺失 → 跳过关键词检测
   */
  validate(content: string, _tenantId: string): PreUploadResult {
    // 边界: 空内容直接通过
    if (!content || content.trim().length === 0) {
      return { ok: true, warnings: [], blocked: false };
    }

    try {
      // 边界: 超大文本截断前100KB检测
      const sample = content.length > 102400 ? content.slice(0, 102400) : content;

      // 1. S4级别PII检测 → blocked
      const s4Matches = this.scrubber.detectOnly(sample, 'S4');
      if (s4Matches.length > 0) {
        const types = [...new Set(s4Matches.map(m => m.type))];
        log.warn({ types, tenantId: _tenantId }, 'S4级别PII检测→上传已阻止');
        return {
          ok: false,
          warnings: ['检测到S4级别敏感数据（' + types.join(', ') + '），上传已阻止'],
          blocked: true,
        };
      }

      // 2. 企业机密关键词匹配 → blocked
      for (const kw of this.keywords.blocked) {
        if (sample.includes(kw)) {
          log.warn({ keyword: kw, tenantId: _tenantId }, '企业机密关键词匹配→上传已阻止');
          return {
            ok: false,
            warnings: ['检测到企业机密关键词: ' + kw + '，上传已阻止'],
            blocked: true,
          };
        }
      }

      // 3. S2-S3 PII → warn but allow
      const allPii = this.scrubber.detectOnly(sample, 'S2');
      const s2s3Matches = allPii.filter(m => m.level === 'S2' || m.level === 'S3');
      const warnings: string[] = [];
      if (s2s3Matches.length > 0) {
        warnings.push('内容含PII（' + s2s3Matches.length + '处），已标记需GA审查');
      }

      // 4. warn级别关键词
      for (const kw of this.keywords.warn) {
        if (sample.includes(kw)) {
          warnings.push('内容含敏感关键词: ' + kw + '，建议审查');
        }
      }

      return { ok: true, warnings, blocked: false };
    } catch (err: unknown) {
      // 约束3: 降级不阻断 — validate() 异常时放行
      const msg = err instanceof Error ? err.message : String(err);
      log.error({ err: msg, tenantId: _tenantId }, 'PreUploadValidator异常→降级放行');
      return { ok: true, warnings: ['验证服务不可用，请GA人工审查'], blocked: false };
    }
  }

  /** 重新加载关键词列表（GA修改文件后热加载） */
  reloadKeywords(keywords?: SensitiveKeywords): void {
    if (keywords) {
      this.keywords = keywords;
    } else {
      const loaded = loadKeywordsFromFile();
      if (loaded) this.keywords = loaded;
    }
    log.info({ blocked: this.keywords.blocked.length, warn: this.keywords.warn.length }, '关键词列表已重新加载');
  }
}

// ═══ 文件驱动关键词加载 ═══

const KEYWORDS_PATH = join(process.cwd(), 'extensions', 'security', 'sensitive-keywords.json');

/**
 * 从文件读取敏感关键词列表。
 * 文件不存在或解析失败 → 返回 null（调用方降级处理）。
 */
export function loadKeywordsFromFile(): SensitiveKeywords | null {
  try {
    if (!existsSync(KEYWORDS_PATH)) {
      log.warn({ path: KEYWORDS_PATH }, 'sensitive-keywords.json 不存在→跳过关键词检测');
      return null;
    }
    const raw = readFileSync(KEYWORDS_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as SensitiveKeywords;
    if (!Array.isArray(parsed.blocked) || !Array.isArray(parsed.warn)) {
      log.warn({}, 'sensitive-keywords.json 格式错误');
      return null;
    }
    return parsed;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn({ err: msg, path: KEYWORDS_PATH }, 'sensitive-keywords.json 读取失败');
    return null;
  }
}

// ═══ Singleton ═══

let _validatorInstance: PreUploadValidator | null = null;

/**
 * 获取 PreUploadValidator 单例。
 * 使用默认 PIIScrubber + 文件驱动的关键词列表初始化。
 */
export function getPreUploadValidator(inject?: PreUploadValidator): PreUploadValidator {
  if (inject) { _validatorInstance = inject; return inject; }
  if (!_validatorInstance) {
    const scrubber = new PIIScrubber();
    const keywords = loadKeywordsFromFile() ?? { blocked: [], warn: [] };
    _validatorInstance = new PreUploadValidator(scrubber, keywords);
  }
  return _validatorInstance;
}
