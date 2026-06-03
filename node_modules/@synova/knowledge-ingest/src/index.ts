/**
 * @synova/knowledge-ingest — 知识摄取类型 + 文件读取
 *
 * 纯文件读取逻辑。engine-core 集成在 synova-agent 侧。
 */
import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '@synova/logger';

const log = createLogger('knowledge-ingest');

export interface IngestResult {
  filePath: string;
  fileType: 'pdf' | 'docx' | 'xlsx' | 'txt' | 'unknown';
  entityCount: number;
  relationCount: number;
  summary: string;
  sogCreated: boolean;
  error?: string;
  degraded: boolean;
}

/**
 * Read a file's text content and detect its type.
 * Does NOT parse PDF/DOCX/Excel — that requires engine-core knowledge-ingest modules.
 */
export function readFileContent(filePath: string): { content: string; fileType: IngestResult['fileType']; error?: string } {
  const ext = path.extname(filePath).toLowerCase();
  let fileType: IngestResult['fileType'] = 'unknown';
  if (ext === '.pdf') fileType = 'pdf';
  else if (ext === '.docx') fileType = 'docx';
  else if (ext === '.xlsx' || ext === '.xls') fileType = 'xlsx';
  else if (ext === '.txt' || ext === '.md' || ext === '.csv') fileType = 'txt';

  try {
    const content = fs.readFileSync(filePath, 'utf-8').slice(0, 50000);
    return { content, fileType };
  } catch (err: any) {
    log.warn({ err, filePath }, '文件读取失败');
    return { content: '', fileType, error: err.message };
  }
}

/**
 * Extract basic entities from text (email, URL, capitalized terms).
 * Full SOG mapping requires engine-core knowledge-ingest.
 */
export function extractEntities(content: string): string[] {
  const entities: string[] = [];
  const emailPattern = /[\w.-]+@[\w.-]+\.\w+/g;
  const urlPattern = /https?:\/\/[^\s]+/g;
  const capitalPattern = /\b[A-Z一-鿿][\w一-鿿]+\b/g;

  let match;
  while ((match = emailPattern.exec(content)) !== null) entities.push(match[0]);
  while ((match = urlPattern.exec(content)) !== null) entities.push(match[0]);
  while ((match = capitalPattern.exec(content)) !== null) {
    if (match[0].length >= 2) entities.push(match[0]);
  }

  return [...new Set(entities)].slice(0, 50);
}
