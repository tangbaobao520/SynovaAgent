/**
 * agent/file-scanner.ts — 文件扫描器 (Phase 0 文件优先范式)
 *
 * 启动时扫描文件目录，建立索引。支持 /api/reload 热加载。
 * 每个文件解析失败独立隔离 — 一个坏文件不影响其他文件加载。
 *
 * 扫描目录:
 *   expert/{name}/  → IDENTITY.md, SOUL.md, TOOLS.md, RULES.md, KNOWLEDGE.md, THEORY.md, STAGE_LOGIC.md, CROSS_EXPERT.md
 *   measurers/*.yml → 测量器配置
 *   knowledge/{行业}/*.md → 行业知识
 */
import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '@synova/logger';

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
  /** 文件映射: IDENTITY/SOUL/TOOLS/RULES/KNOWLEDGE/THEORY/STAGE_LOGIC/CROSS_EXPERT → ScannedFile */
  files: Partial<Record<'IDENTITY' | 'SOUL' | 'TOOLS' | 'RULES' | 'KNOWLEDGE' | 'THEORY' | 'STAGE_LOGIC' | 'CROSS_EXPERT', ScannedFile>>;
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

const EXPERT_FILE_NAMES = ['IDENTITY.md', 'SOUL.md', 'TOOLS.md', 'RULES.md', 'KNOWLEDGE.md', 'THEORY.md', 'STAGE_LOGIC.md', 'CROSS_EXPERT.md'] as const;
const FILE_KEY_MAP: Record<string, string> = {
  'IDENTITY.md': 'IDENTITY', 'SOUL.md': 'SOUL', 'TOOLS.md': 'TOOLS',
  'RULES.md': 'RULES', 'KNOWLEDGE.md': 'KNOWLEDGE',
  'THEORY.md': 'THEORY', 'STAGE_LOGIC.md': 'STAGE_LOGIC', 'CROSS_EXPERT.md': 'CROSS_EXPERT',
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

  // ═══ Hot Reload & File Snapshot (Loop Engineering v3) ═══

  private watchMode: boolean = false;
  private watcher: fs.FSWatcher | null = null;

  /** 启用文件监听（开发环境默认开启，生产环境由管理员配置） */
  enableWatch(onChange?: (path: string) => void): void {
    if (this.watcher) return;
    this.watchMode = true;

    const expertDir = path.join(this.rootDir, 'expert');
    const knowledgeDir = path.join(this.rootDir, 'knowledge');

    const dirsToWatch = [expertDir, knowledgeDir].filter(d => fs.existsSync(d));

    this.watcher = fs.watch(
      dirsToWatch[0],
      { recursive: true },
      (_eventType, filename) => {
        if (!filename || !filename.endsWith('.md')) return;
        const fullPath = path.join(dirsToWatch[0], filename);
        log.info({ file: fullPath }, '检测到文件变更');
        try {
          this.reloadFile(fullPath);
          if (onChange) onChange(fullPath);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          log.error({ file: fullPath, err: msg }, '热加载失败');
        }
      },
    );

    log.info({ dirs: dirsToWatch, watchMode: true }, '文件监听已启用');
  }

  /** 禁用文件监听 */
  disableWatch(): void {
    if (this.watcher) { this.watcher.close(); this.watcher = null; }
    this.watchMode = false;
    log.info('文件监听已禁用');
  }

  /** 生成文件快照——记录文件路径+内容哈希+版本，写入诊断日志 */
  generateSnapshot(): Map<string, { hash: string; version: string; lastModified: string }> {
    const crypto = require('crypto');
    const snapshot = new Map<string, { hash: string; version: string; lastModified: string }>();

    if (!this.index) return snapshot;

    for (const expert of this.index.experts) {
      for (const [key, file] of Object.entries(expert.files)) {
        if (!file) continue;
        const hash = crypto.createHash('sha256').update(file.content).digest('hex').slice(0, 16);
        // 从 YAML front matter 中提取 version
        const parts = file.content.split('---');
        let version = 'unknown';
        if (parts.length >= 3) {
          const vMatch = parts[1].match(/version:\s*"([^"]+)"/);
          if (vMatch) version = vMatch[1];
        }
        snapshot.set(file.relativePath, {
          hash,
          version,
          lastModified: file.lastModified,
        });
      }
    }

    return snapshot;
  }

  /** 热加载单个文件——校验通过后更新索引 */
  reloadFile(filePath: string): boolean {
    if (!fs.existsSync(filePath)) {
      log.warn({ file: filePath }, '文件不存在——热加载跳过');
      return false;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const stat = fs.statSync(filePath);

    // 简单校验: 必须有 YAML front matter
    const parts = content.split('---');
    if (parts.length < 3) {
      log.error({ file: filePath }, 'YAML front matter 缺失——热加载拒绝');
      return false;
    }

    // 更新索引中的对应文件
    const relativePath = path.relative(this.rootDir, filePath);
    if (this.index) {
      for (const expert of this.index.experts) {
        for (const [key, file] of Object.entries(expert.files)) {
          if (file && file.relativePath === relativePath) {
            expert.files = { ...expert.files, [key]: {
              relativePath,
              absolutePath: filePath,
              content,
              size: stat.size,
              lastModified: stat.mtime.toISOString(),
            } };
            log.info({ file: relativePath, size: stat.size }, '文件热加载成功');
            return true;
          }
        }
      }
    }

    // 如果索引中没有记录但文件存在——触发全量重扫
    log.info({ file: relativePath }, '新文件检测——建议全量重扫');
    return false;
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
