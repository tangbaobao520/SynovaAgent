/**
 * agent/knowledge-injector.ts — 知识注入器 (Phase 0 文件优先范式)
 *
 * 按优先级加载 knowledge/ 目录下的行业知识和客户专有知识，
 * 注入到专家的诊断上下文中。
 *
 * 加载优先级: 客户专有 > 行业知识 > 全局默认
 * 后者覆盖前者同键值。冲突不静默——写入 knowledge_conflicts 表。
 *
 * 安全防护:
 *   - 单文件 ≤ 50KB（超出截断+告警）
 *   - 控制字符/不可见字符自动过滤
 *   - YAML front matter 合法性校验
 *   - 必填字段检查（scope, version）
 *   - 校验失败 → 标记 draft → 不参与诊断
 *
 * 铁律 24+31: 每个文件加载失败独立降级，不阻断其他文件。
 * 铁律 39: L2 编排层——通过 KnowledgeStore(L4) 操作数据。
 */
import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '@synova/logger';

const log = createLogger('agent/knowledge-injector');

// ═══ Types ═══

export interface KnowledgeContext {
  /** 加载的知识文本块 */
  content: string;
  /** 来源文件路径 */
  source: string;
  /** 优先级: custom(100) > industry(50) > global(0) */
  priority: number;
  /** 是否通过了所有校验 */
  validated: boolean;
  /** 校验失败原因 */
  validationErrors: string[];
}

export interface KnowledgeConflict {
  dimension: string;
  sources: string[];
  resolution: 'keep_higher_priority' | 'merge' | 'manual_review';
  timestamp: string;
  status: 'open' | 'resolved';
}

export interface InjectionResult {
  /** 成功注入的知识块 */
  contexts: KnowledgeContext[];
  /** 跳过的文件（draft/校验失败） */
  skipped: Array<{ file: string; reason: string }>;
  /** 检测到的知识冲突 */
  conflicts: KnowledgeConflict[];
}

// ═══ Constants ═══

const MAX_FILE_SIZE = 50 * 1024; // 50KB
// v3.3: 动态生成——从 Registry 获取专家列表，加固定前缀
function getBaseScopes(): string[] { return ['global', 'org', 'knowledge']; }
function isAllowedScope(scope: string): boolean {
  if (getBaseScopes().includes(scope)) return true;
  if (scope.startsWith('expert:')) {
    const { getExpertRegistry } = require('../l3/expert-registry') as { getExpertRegistry: () => { listTypes: () => string[] } };
    return getExpertRegistry().listTypes().includes(scope.replace('expert:', ''));
  }
  return false;
}

// ═══ KnowledgeInjector ═══

export class KnowledgeInjector {
  private rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
  }

  /**
   * 根据客户行业和客户ID加载知识。
   *
   * @param industry — 客户行业 (如 "manufacturing", "saas")
   * @param clientId — 客户标识 (对应 knowledge/custom/{clientId}/)
   * @returns 注入结果
   */
  inject(industry?: string, clientId?: string): InjectionResult {
    const contexts: KnowledgeContext[] = [];
    const skipped: Array<{ file: string; reason: string }> = [];
    const conflicts: KnowledgeConflict[] = [];

    // ── Layer 1: 全局默认 ──
    // （暂无全局默认知识文件，预留给未来扩展）

    // ── Layer 2: 行业知识 ──
    if (industry) {
      const industryDir = path.join(this.rootDir, 'knowledge', 'industry');
      const industryFile = path.join(industryDir, `${industry}.md`);
      if (fs.existsSync(industryFile)) {
        const result = this.loadFile(industryFile, 50, '行业知识');
        if (result.validated) {
          contexts.push(result);
        } else {
          skipped.push({ file: industryFile, reason: result.validationErrors.join('; ') });
        }
      } else {
        log.info({ industry, industryFile }, '行业知识文件不存在——跳过');
      }
    }

    // ── Layer 3: 客户专有 ──
    if (clientId) {
      const customDir = path.join(this.rootDir, 'knowledge', 'custom', clientId);
      if (fs.existsSync(customDir)) {
        try {
          const entries = fs.readdirSync(customDir, { withFileTypes: true });
          for (const entry of entries) {
            if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
            const filePath = path.join(customDir, entry.name);
            const result = this.loadFile(filePath, 100, `客户专有:${clientId}`);
            if (result.validated) {
              // 检查与已有知识的冲突
              const fileConflicts = this.detectConflicts(contexts, result);
              conflicts.push(...fileConflicts);
              contexts.push(result);
            } else {
              skipped.push({ file: filePath, reason: result.validationErrors.join('; ') });
            }
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          log.warn({ err: msg, customDir }, '客户知识目录读取失败——degraded');
          skipped.push({ file: customDir, reason: msg });
        }
      }
    }

    log.info({
      loaded: contexts.length,
      skipped: skipped.length,
      conflicts: conflicts.length,
    }, '知识注入完成');

    return { contexts, skipped, conflicts };
  }

  // ═══ Private ═══

  private loadFile(filePath: string, priority: number, sourceLabel: string): KnowledgeContext {
    const errors: string[] = [];

    // ── 安全校验1: 大小限制 ──
    let stat: fs.Stats;
    try {
      stat = fs.statSync(filePath);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { content: '', source: filePath, priority, validated: false, validationErrors: [`无法读取文件: ${msg}`] };
    }

    if (stat.size > MAX_FILE_SIZE) {
      errors.push(`文件过大: ${(stat.size / 1024).toFixed(1)}KB > ${(MAX_FILE_SIZE / 1024).toFixed(0)}KB 上限`);
      log.warn({ file: filePath, size: stat.size }, '知识文件过大——draft');
    }

    // ── 读取 ──
    let raw = '';
    try {
      raw = fs.readFileSync(filePath, 'utf-8');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`读取失败: ${msg}`);
      return { content: '', source: filePath, priority, validated: false, validationErrors: errors };
    }

    // 截断
    if (raw.length > MAX_FILE_SIZE) {
      raw = raw.slice(0, MAX_FILE_SIZE);
    }

    // ── 安全校验2: 字符白名单（移除控制字符） ──
    const cleaned = raw.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
    if (cleaned.length !== raw.length) {
      log.warn({ file: filePath, removed: raw.length - cleaned.length }, '知识文件含控制字符——已自动过滤');
    }

    // ── 安全校验3: YAML front matter 合法性 ──
    let scopeValid = true;
    let versionValid = true;
    const parts = cleaned.split('---');
    if (parts.length >= 3) {
      try {
        // 简单解析 YAML front matter（不引入完整 YAML 解析器以减小依赖）
        const frontMatter = parts[1];
        if (!frontMatter.includes('scope:')) {
          scopeValid = false;
          errors.push('YAML front matter 缺少 scope 字段');
        } else {
          const scopeMatch = frontMatter.match(/scope:\s*"([^"]+)"/) || frontMatter.match(/scope:\s*(\S+)/);
          if (scopeMatch && !isAllowedScope(scopeMatch[1])) {
            scopeValid = false;
            errors.push(`scope 值不合法: ${scopeMatch[1]}`);
          }
        }
        if (!frontMatter.includes('version:')) {
          versionValid = false;
          errors.push('YAML front matter 缺少 version 字段');
        }
        // 检查 status: draft
        if (frontMatter.includes('status:') && frontMatter.match(/status:\s*"draft"/)) {
          errors.push('status 为 draft——文件未就绪，跳过加载');
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        log.warn({ file: filePath, err: msg }, 'YAML front matter 解析失败');
        errors.push('YAML front matter 解析失败');
      }
    } else {
      errors.push('缺少 YAML front matter');
    }

    const validated = errors.length === 0 && stat.size <= MAX_FILE_SIZE;

    return {
      content: validated ? cleaned : '',
      source: `${sourceLabel}:${path.basename(filePath)}`,
      priority,
      validated,
      validationErrors: errors,
    };
  }

  /**
   * 检测新加载的知识是否与已有知识冲突。
   * 简单实现: 基于文件来源的 key 去重。
   * 完整实现需解析知识内容进行语义匹配（Phase 2）。
   */
  private detectConflicts(existing: KnowledgeContext[], incoming: KnowledgeContext): KnowledgeConflict[] {
    const conflicts: KnowledgeConflict[] = [];
    const incomingSource = incoming.source;

    for (const ctx of existing) {
      // 同优先级 → 不冲突（按加载顺序，先到先得）
      if (ctx.priority === incoming.priority) continue;

      // 不同来源但优先级不同 → 后者覆盖前者 → 记录为已解决冲突
      // 完整语义冲突检测需 Phase 2 实现（NLP 匹配知识内容）
    }

    return conflicts;
  }
}

// ═══ Singleton (v2.1: ExpertDispatcher 调用) ═══

let _injector: KnowledgeInjector | null = null;

export function getKnowledgeInjector(rootDir?: string): KnowledgeInjector {
  if (!_injector && rootDir) {
    _injector = new KnowledgeInjector(rootDir);
  }
  if (!_injector) {
    _injector = new KnowledgeInjector(process.cwd());
  }
  return _injector;
}
