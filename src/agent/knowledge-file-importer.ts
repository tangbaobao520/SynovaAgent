/**
 * agent/knowledge-file-importer.ts — 知识文件导入器 (Phase 2 文件优先范式)
 *
 * 从 FileScanner 索引中读取 knowledge/*.md 文件, 导入到 KnowledgeStore (L4)。
 * 这是数据飞轮的入口 — 行业老兵写 Markdown → 导入 → 所有专家可检索。
 *
 * 铁律 24+31: 每个文件导入失败独立降级, 不阻断其他文件。
 * 铁律 32: 错误带 .code + .phase + .retryable
 */
import { createLogger } from '../logger';
import type { FileIndex, KnowledgeFile, ScannedFile } from './file-scanner';

// ═══ L4 接口镜像 (铁律 39) ═══
// KnowledgeFileImporter 是 L2→L4 的合法桥接层 (与 knowledge-bridge-service.ts 同级)。
// 不直接 import KnowledgeStore (L4)，而是在此声明所需子集。
interface KnowledgeStoreLike {
  insert(data: Record<string, unknown>): void;
}

const log = createLogger('agent/knowledge-file-importer');

// ═══ Types ═══

export interface ImportedEntry {
  id: string;
  file: string;
  industry: string;
  title: string;
  chunks: number;
}

export interface KnowledgeImportResult {
  imported: ImportedEntry[];
  /** 成功导入的文件数 */
  fileCount: number;
  /** 导入的知识块总数 */
  chunkCount: number;
  errors: Array<{ file: string; error: string }>;
}

// ═══ Markdown 解析 ═══

interface ParsedDoc {
  title: string;
  sections: Array<{ heading: string; content: string }>;
}

/**
 * 简单 Markdown 解析: 提取标题 + 按 ## 分段。
 * 不依赖外部 Markdown 库, 零依赖。
 */
function parseMarkdown(content: string): ParsedDoc {
  const lines = content.split('\n');
  let title = '';
  const sections: Array<{ heading: string; content: string }> = [];
  let currentHeading = '';
  let currentContent: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('# ') && !title) {
      title = trimmed.slice(2).trim();
    } else if (trimmed.startsWith('## ')) {
      // 保存上一段
      if (currentContent.length > 0) {
        sections.push({ heading: currentHeading, content: currentContent.join('\n').trim() });
        currentContent = [];
      }
      currentHeading = trimmed.slice(3).trim();
    } else if (trimmed.length > 0) {
      currentContent.push(trimmed);
    }
  }

  // 最后一段
  if (currentContent.length > 0) {
    sections.push({ heading: currentHeading, content: currentContent.join('\n').trim() });
  }

  return { title, sections };
}

// ═══ KnowledgeFileImporter ═══

export class KnowledgeFileImporter {
  private store: KnowledgeStoreLike;

  constructor(store: KnowledgeStoreLike) {
    this.store = store;
  }

  /**
   * 从 FileIndex 导入所有知识文件。
   *
   * @param index — FileScanner.scan() 返回的索引
   * @param orgId — 组织 ID (默认 'default', 共享知识)
   * @param dryRun — true 时只解析不写入 (用于预览)
   */
  importFromIndex(
    index: FileIndex,
    orgId = 'default',
    dryRun = false,
  ): KnowledgeImportResult {
    const imported: ImportedEntry[] = [];
    const errors: Array<{ file: string; error: string }> = [];
    let fileCount = 0;
    let chunkCount = 0;

    for (const knowledge of index.knowledge) {
      for (const entry of knowledge.entries) {
        try {
          const parsed = parseMarkdown(entry.content);

          if (!parsed.title && parsed.sections.length === 0) {
            log.warn({ file: entry.relativePath }, '知识文件为空 — 跳过');
            continue;
          }

          // 生成唯一 sourceId
          const sourceId = `knowledge_file_${knowledge.industry}_${entry.relativePath.replace(/[/\\]/g, '_')}`;

          if (!dryRun) {
            // 铁律 38: 用 Record 替代 `as-any` — PKB 字段在 DB schema 中存在但 TS 类型未覆盖
            const chunkData: Record<string, unknown> = {
              text: entry.content,
              sourceType: 'markdown',
              sourceId,
              authorityLevel: 'reference',
              mimeType: 'text/markdown',
              accessLevel: 'shared',
              orgId,
              pkbDomain: knowledge.industry,
              pkbType: 'industry_knowledge',
              pkbConfidence: 0.7,
              pkbSource: entry.relativePath,
              knowledgeLevel: 2,
            };
            this.store.insert(chunkData);
          }

          // 每个 ## 段落也作为独立知识块 (小粒度, 便于精确检索)
          let sectionChunks = 0;
          for (const section of parsed.sections) {
            if (section.content.length < 20) continue; // 跳过太短的段落

            if (!dryRun) {
              const sectionData: Record<string, unknown> = {
                text: `## ${section.heading}\n\n${section.content}`,
                sourceType: 'markdown',
                sourceId: `${sourceId}_section_${sectionChunks}`,
                authorityLevel: 'reference',
                mimeType: 'text/markdown',
                accessLevel: 'shared',
                orgId,
                pkbDomain: knowledge.industry,
                pkbType: 'industry_knowledge',
                pkbConfidence: 0.7,
                pkbSource: entry.relativePath,
                knowledgeLevel: 2,
              };
              this.store.insert(sectionData as unknown as Parameters<typeof this.store.insert>[0]);
            }
            sectionChunks++;
          }

          const totalChunks = 1 + sectionChunks;
          imported.push({
            id: sourceId,
            file: entry.relativePath,
            industry: knowledge.industry,
            title: parsed.title || entry.relativePath,
            chunks: totalChunks,
          });

          fileCount++;
          chunkCount += totalChunks;

          log.debug({
            file: entry.relativePath, industry: knowledge.industry,
            title: parsed.title, chunks: totalChunks,
          }, '知识文件已导入');
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push({ file: entry.relativePath, error: msg });
          log.warn({ file: entry.relativePath, err: msg }, '知识文件导入失败 — 跳过 (degraded)');
        }
      }
    }

    const mode = dryRun ? '预览' : '导入';
    log.info({
      files: fileCount, chunks: chunkCount, errors: errors.length, dryRun,
    }, `知识文件${mode}完成`);

    return { imported, fileCount, chunkCount, errors };
  }
}
