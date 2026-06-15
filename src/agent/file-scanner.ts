/**
 * agent/file-scanner.ts — 文件扫描器 (Phase 0 文件优先范式)
 *
 * 启动时扫描文件目录，建立索引。支持 /api/reload 热加载。
 * 每个文件解析失败独立隔离 — 一个坏文件不影响其他文件加载。
 *
 * 扫描目录:
 *   expert/{name}/  → IDENTITY.md, SOUL.md, TOOLS.md, RULES.md, KNOWLEDGE.md
 *   measurers/*.yml → 测量器配置
 *   knowledge/{行业}/*.md → 行业知识
 */
import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '../logger';

const log = createLogger('agent/file-scanner');

// ═══ Types ═══

export interface ScannedFile {
  /** 相对于扫描根目录的路径, e.g. "expert/strategy/SOUL.md" */
  relativePath: string;
  /** 绝对路径 */
  absolutePath: string;
  /** 文件内容 (文本) */
  content: string;
  /** 文件大小 (bytes) */
  size: number;
  /** 最后修改时间 (ISO 8601) */
  lastModified: string;
}

export interface ExpertFiles {
  /** 专家名称 (目录名), e.g. "strategy" */
  name: string;
  /** 文件映射: "IDENTITY" | "SOUL" | "TOOLS" | "RULES" | "KNOWLEDGE" → ScannedFile */
  files: Partial<Record<'IDENTITY' | 'SOUL' | 'TOOLS' | 'RULES' | 'KNOWLEDGE', ScannedFile>>;
}

export interface MeasurerConfig {
  /** 文件名 (不含扩展名) */
  name: string;
  /** YAML 原文 */
  rawYaml: string;
  file: ScannedFile;
}

export interface KnowledgeFile {
  /** 行业名 (目录名), e.g. "月子中心行业" */
  industry: string;
  /** 知识条目列表 */
  entries: ScannedFile[];
}

export interface FileIndex {
  /** 扫描时间 (ISO 8601) */
  scannedAt: string;
  /** 项目根目录 */
  rootDir: string;
  /** 专家文件 */
  experts: ExpertFiles[];
  /** 测量器配置 */
  measurers: MeasurerConfig[];
  /** 行业知识 */
  knowledge: KnowledgeFile[];
  /** 扫描错误 (文件路径 → 错误信息) */
  errors: Array<{ file: string; error: string }>;
}

// ═══ Constants ═══

const EXPERT_FILE_NAMES = ['IDENTITY.md', 'SOUL.md', 'TOOLS.md', 'RULES.md', 'KNOWLEDGE.md'] as const;
const FILE_KEY_MAP: Record<string, string> = {
  'IDENTITY.md': 'IDENTITY', 'SOUL.md': 'SOUL', 'TOOLS.md': 'TOOLS',
  'RULES.md': 'RULES', 'KNOWLEDGE.md': 'KNOWLEDGE',
};

// ═══ FileScanner ═══

export class FileScanner {
  private rootDir: string;
  private index: FileIndex | null = null;

  constructor(rootDir?: string) {
    this.rootDir = rootDir || path.resolve(process.cwd());
  }

  /** 全量扫描 — 启动时 + /api/reload 时调用 */
  scan(): FileIndex {
    const scannedAt = new Date().toISOString();
    const errors: Array<{ file: string; error: string }> = [];

    const experts = this.scanExperts(errors);
    const measurers = this.scanMeasurers(errors);
    const knowledge = this.scanKnowledge(errors);

    this.index = {
      scannedAt, rootDir: this.rootDir,
      experts, measurers, knowledge, errors,
    };

    const totalFiles = experts.reduce((s, e) => s + Object.keys(e.files).length, 0)
      + measurers.length + knowledge.reduce((s, k) => s + k.entries.length, 0);
    log.info({
      experts: experts.length, measurers: measurers.length,
      knowledge: knowledge.length, totalFiles, errors: errors.length,
    }, '文件扫描完成');

    return this.index;
  }

  /** 获取最近一次扫描的索引 */
  getIndex(): FileIndex | null {
    return this.index;
  }

  /** 按专家名查询 */
  getExpert(name: string): ExpertFiles | undefined {
    return this.index?.experts.find(e => e.name === name);
  }

  /** 列出所有专家名 */
  listExpertNames(): string[] {
    return this.index?.experts.map(e => e.name) || [];
  }

  // ── Private scanners ──

  private scanExperts(errors: Array<{ file: string; error: string }>): ExpertFiles[] {
    const expertDir = path.join(this.rootDir, 'expert');
    if (!fs.existsSync(expertDir)) {
      log.info('expert/ 目录不存在 — 跳过专家文件扫描');
      return [];
    }

    const results: ExpertFiles[] = [];
    try {
      const entries = fs.readdirSync(expertDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        // 跳过模板目录
        if (entry.name.startsWith('_')) continue;

        const expertPath = path.join(expertDir, entry.name);
        const files: ExpertFiles['files'] = {};

        for (const fileName of EXPERT_FILE_NAMES) {
          const filePath = path.join(expertPath, fileName);
          try {
            if (fs.existsSync(filePath)) {
              const stat = fs.statSync(filePath);
              const content = fs.readFileSync(filePath, 'utf-8');
              const relativePath = path.relative(this.rootDir, filePath);
              files[FILE_KEY_MAP[fileName] as keyof typeof files] = {
                relativePath,
                absolutePath: filePath,
                content,
                size: stat.size,
                lastModified: stat.mtime.toISOString(),
              };
            }
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            errors.push({ file: filePath, error: msg });
            log.warn({ file: filePath, err: msg }, '专家文件读取失败 — 跳过');
          }
        }

        if (Object.keys(files).length > 0) {
          results.push({ name: entry.name, files });
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push({ file: expertDir, error: msg });
      log.warn({ err: msg }, 'expert/ 目录扫描失败 — degraded');
    }

    return results;
  }

  private scanMeasurers(errors: Array<{ file: string; error: string }>): MeasurerConfig[] {
    const dir = path.join(this.rootDir, 'measurers');
    if (!fs.existsSync(dir)) {
      log.info('measurers/ 目录不存在 — 跳过测量器配置扫描');
      return [];
    }

    const results: MeasurerConfig[] = [];
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        if (!entry.name.endsWith('.yml') && !entry.name.endsWith('.yaml')) continue;

        const filePath = path.join(dir, entry.name);
        try {
          const stat = fs.statSync(filePath);
          const content = fs.readFileSync(filePath, 'utf-8');
          const relativePath = path.relative(this.rootDir, filePath);
          const name = entry.name.replace(/\.(yml|yaml)$/, '');
          results.push({
            name,
            rawYaml: content,
            file: { relativePath, absolutePath: filePath, content, size: stat.size, lastModified: stat.mtime.toISOString() },
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push({ file: filePath, error: msg });
          log.warn({ file: filePath, err: msg }, '测量器配置文件读取失败 — 跳过');
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push({ file: dir, error: msg });
      log.warn({ err: msg }, 'measurers/ 目录扫描失败 — degraded');
    }

    return results;
  }

  private scanKnowledge(errors: Array<{ file: string; error: string }>): KnowledgeFile[] {
    const dir = path.join(this.rootDir, 'knowledge');
    if (!fs.existsSync(dir)) {
      log.info('knowledge/ 目录不存在 — 跳过知识文件扫描');
      return [];
    }

    const results: KnowledgeFile[] = [];
    try {
      const industries = fs.readdirSync(dir, { withFileTypes: true });
      for (const industry of industries) {
        if (!industry.isDirectory()) continue;

        const industryPath = path.join(dir, industry.name);
        const entries: ScannedFile[] = [];
        try {
          const files = fs.readdirSync(industryPath, { withFileTypes: true });
          for (const file of files) {
            if (!file.isFile()) continue;
            if (!file.name.endsWith('.md')) continue;

            const filePath = path.join(industryPath, file.name);
            try {
              const stat = fs.statSync(filePath);
              const content = fs.readFileSync(filePath, 'utf-8');
              const relativePath = path.relative(this.rootDir, filePath);
              entries.push({
                relativePath, absolutePath: filePath, content,
                size: stat.size, lastModified: stat.mtime.toISOString(),
              });
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : String(err);
              errors.push({ file: filePath, error: msg });
              log.warn({ file: filePath, err: msg }, '知识文件读取失败 — 跳过');
            }
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push({ file: industryPath, error: msg });
          log.warn({ err: msg }, `knowledge/${industry.name}/ 扫描失败 — degraded`);
        }

        if (entries.length > 0) {
          results.push({ industry: industry.name, entries });
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push({ file: dir, error: msg });
      log.warn({ err: msg }, 'knowledge/ 目录扫描失败 — degraded');
    }

    return results;
  }
}
