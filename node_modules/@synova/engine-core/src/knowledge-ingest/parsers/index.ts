/**
 * knowledge-ingest/parsers/index.ts — 文档解析器注册表
 */

import { parsePdf } from './pdf-parser';
import { parseDocx } from './docx-parser';
import { parseExcel } from './excel-parser';

export interface TextChunk {
  id: string;
  text: string;
  sourceFileName: string;
  sourceFormat: string;
  pageNum?: number;
  rowNum?: number;
  chunkIndex: number;
  totalChunks: number;
}

export interface ParseResult {
  success: boolean;
  chunks: TextChunk[];
  error?: string;
  metadata: {
    fileName: string;
    format: string;
    totalChars: number;
    chunkCount: number;
    parsedAt: string;
  };
}

const parsers: Record<string, (buffer: Buffer, fileName: string) => Promise<ParseResult>> = {
  pdf: parsePdf,
  docx: parseDocx,
  xlsx: parseExcel,
};

const EXT_MAP: Record<string, string> = {
  '.pdf': 'pdf',
  '.docx': 'docx',
  '.xlsx': 'xlsx',
  '.txt': 'text',
  '.csv': 'text',
  '.md': 'text',
};

export async function parseDocument(
  buffer: Buffer,
  fileName: string,
  mimeType?: string,
): Promise<ParseResult> {
  const ext = fileName.toLowerCase().includes('.')
    ? '.' + fileName.split('.').pop()!.toLowerCase()
    : '';
  const format = EXT_MAP[ext] || 'text';

  if (format === 'text') {
    return parseText(buffer, fileName);
  }

  const parser = parsers[format];
  if (!parser) {
    return {
      success: false,
      chunks: [],
      error: `不支持的文件格式: ${format}`,
      metadata: { fileName, format, totalChars: 0, chunkCount: 0, parsedAt: new Date().toISOString() },
    };
  }

  return parser(buffer, fileName);
}

async function parseText(buffer: Buffer, fileName: string): Promise<ParseResult> {
  const text = buffer.toString('utf-8');
  const chunks = splitIntoChunks(text, fileName, 'text');
  return {
    success: true,
    chunks,
    metadata: {
      fileName,
      format: 'text',
      totalChars: text.length,
      chunkCount: chunks.length,
      parsedAt: new Date().toISOString(),
    },
  };
}

function splitIntoChunks(text: string, fileName: string, format: string): TextChunk[] {
  const MAX_CHUNK_CHARS = 3000;
  const chunks: TextChunk[] = [];
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 0);
  let currentChunk = '';
  let chunkIndex = 0;

  for (const para of paragraphs) {
    if (currentChunk.length + para.length > MAX_CHUNK_CHARS && currentChunk.length > 0) {
      chunks.push({
        id: `${fileName}_${chunkIndex}`,
        text: currentChunk.trim(),
        sourceFileName: fileName,
        sourceFormat: format,
        chunkIndex,
        totalChunks: 0, // updated below
      });
      chunkIndex++;
      currentChunk = para;
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + para;
    }
  }

  if (currentChunk.trim().length > 0) {
    chunks.push({
      id: `${fileName}_${chunkIndex}`,
      text: currentChunk.trim(),
      sourceFileName: fileName,
      sourceFormat: format,
      chunkIndex,
      totalChunks: 0,
    });
    chunkIndex++;
  }

  if (chunks.length === 0) {
    chunks.push({
      id: `${fileName}_0`,
      text: text.slice(0, MAX_CHUNK_CHARS),
      sourceFileName: fileName,
      sourceFormat: format,
      chunkIndex: 0,
      totalChunks: 1,
    });
  }

  for (const c of chunks) {
    c.totalChunks = chunks.length;
  }

  return chunks;
}

export { parsePdf, parseDocx, parseExcel, parseText };
