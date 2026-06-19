/**
 * agent/expert-file-loader.ts — 专家文件加载器 (Phase 0 文件优先范式)
 *
 * 从 FileScanner 的索引中读取专家定义文件, 组装为 system prompt,
 * 注册到 ExpertRegistry。替换硬编码 prompt 为文件驱动。
 *
 * 铁律 24+31: 每个文件/专家加载失败独立降级, 不阻断其他专家。
 * 铁律 32: 错误带 .code + .phase + .retryable
 */
import { createLogger } from '../logger';
import type { FileIndex, ExpertFiles, ScannedFile } from './file-scanner';
import { getExpertRegistry } from '../l3/expert-registry';

const log = createLogger('agent/expert-file-loader');

// ═══ Types ═══

export interface LoadedExpert {
  name: string;
  prompt: string;
  /** 来源文件列表 */
  sources: string[];
  /** 降级标记 — true 表示部分文件加载失败, 使用了默认值 */
  degraded: boolean;
  /** 降级详情 */
  degradedReasons: string[];
}

export interface ExpertLoadResult {
  loaded: LoadedExpert[];
  /** 从文件加载的专家数 */
  fromFiles: number;
  /** 保持代码默认的专家数 (无对应文件) */
  fromDefaults: number;
  errors: string[];
}

// ═══ Prompt 组装 ═══

/**
 * 将分散的专家文件组装为完整的 system prompt。
 *
 * 结构:
 *   [IDENTITY] → 角色定义 (最高优先级, 放最前面)
 *   [THEORY]   → 理论基础
 *   [SOUL]     → 诊断风格 + 方法论
 *   [RULES]    → 诊断规则 + 评分指南
 *   [TOOLS]    → 可用工具列表 (注入到 TOOLS 区域)
 *   [STAGE_LOGIC] → 规模自适应逻辑
 *   [KNOWLEDGE] → 依赖的领域知识
 *   [CROSS_EXPERT] → 跨专家协同协议
 */
function assemblePrompt(files: ExpertFiles['files']): { prompt: string; sources: string[]; missing: string[] } {
  const sections: string[] = [];
  const sources: string[] = [];
  const missing: string[] = [];

  const append = (key: string, file: ScannedFile | undefined, header: string) => {
    if (file && file.content.trim().length > 0) {
      sections.push(`## ${header}\n\n${file.content.trim()}`);
      sources.push(file.relativePath);
    } else {
      missing.push(key);
    }
  };

  append('IDENTITY', files.IDENTITY, '角色定义');
  append('THEORY', files.THEORY, '理论基础');
  append('SOUL', files.SOUL, '诊断风格与方法论');
  append('RULES', files.RULES, '诊断规则与评分指南');
  append('TOOLS', files.TOOLS, '可用工具');
  append('STAGE_LOGIC', files.STAGE_LOGIC, '规模自适应逻辑');
  append('KNOWLEDGE', files.KNOWLEDGE, '领域知识');
  append('CROSS_EXPERT', files.CROSS_EXPERT, '跨专家协同协议');

  return {
    prompt: sections.join('\n\n---\n\n'),
    sources,
    missing,
  };
}

// ═══ ExpertFileLoader ═══

export class ExpertFileLoader {
  /**
   * 从 FileIndex 加载所有专家, 注册到 ExpertRegistry。
   *
   * @param index — FileScanner.scan() 返回的索引
   * @param defaultPrompts — 兜底的默认 prompt (当某专家无对应文件时使用)
   * @returns 加载结果
   */
  loadFromIndex(
    index: FileIndex,
    defaultPrompts: Record<string, string>,
  ): ExpertLoadResult {
    const registry = getExpertRegistry();
    const loaded: LoadedExpert[] = [];
    const errors: string[] = [];
    let fromFiles = 0;
    let fromDefaults = 0;

    // 遍历索引中的专家
    for (const expert of index.experts) {
      try {
        const { prompt, sources, missing } = assemblePrompt(expert.files);

        if (prompt.trim().length > 0) {
          // 有文件内容 → 文件驱动
          registry.register(expert.name, prompt);
          loaded.push({
            name: expert.name,
            prompt,
            sources,
            degraded: missing.length > 0,
            degradedReasons: missing.map(m => `${m}.md 缺失`),
          });
          fromFiles++;
          log.info({ expert: expert.name, sources, missing }, '专家已从文件加载');
        } else if (defaultPrompts[expert.name]) {
          // 目录存在但无有效文件 → 使用默认 prompt
          registry.register(expert.name, defaultPrompts[expert.name]);
          loaded.push({
            name: expert.name,
            prompt: defaultPrompts[expert.name],
            sources: ['code:expert-registry.ts (默认)'],
            degraded: true,
            degradedReasons: ['所有文件为空或缺失, 使用代码默认值'],
          });
          fromDefaults++;
          log.warn({ expert: expert.name }, '专家文件为空 — 使用默认 prompt (degraded)');
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${expert.name}: ${msg}`);
        // 降级: 使用默认 prompt
        if (defaultPrompts[expert.name]) {
          try {
            registry.register(expert.name, defaultPrompts[expert.name]);
            loaded.push({
              name: expert.name,
              prompt: defaultPrompts[expert.name],
              sources: ['code:expert-registry.ts (降级默认)'],
              degraded: true,
              degradedReasons: [`文件加载失败: ${msg}`],
            });
            fromDefaults++;
          } catch { /* 双重失败 — 跳过 */ }
        }
        log.error({
          err: msg, expert: expert.name,
          code: 'EXPERT_FILE_LOAD_FAILED', phase: 'startup', retryable: true,
        }, '专家文件加载失败 — degraded');
      }
    }

    // 注册有默认 prompt 但无对应文件目录的专家
    const indexedNames = new Set(index.experts.map(e => e.name));
    for (const [name, prompt] of Object.entries(defaultPrompts)) {
      if (!indexedNames.has(name)) {
        try {
          registry.register(name, prompt);
          loaded.push({
            name, prompt,
            sources: ['code:expert-registry.ts (默认)'],
            degraded: false,
            degradedReasons: [],
          });
          fromDefaults++;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`${name}: ${msg}`);
        }
      }
    }

    log.info({
      fromFiles, fromDefaults, totalLoaded: loaded.length, errors: errors.length,
    }, '专家文件加载完成');

    return { loaded, fromFiles, fromDefaults, errors };
  }
}
