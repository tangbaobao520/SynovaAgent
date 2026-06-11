/**
 * knowledge-ingest/parsers/docx-parser.ts — Word (.docx) 文档解析器
 */

import type { ParseResult } from './index';

export async function parseDocx(buffer: Buffer, fileName: string): Promise<ParseResult> {
  try {
    let extractRawText: (buf: Buffer) => Promise<string>;
    try {
      const mammoth = require('mammoth');
      extractRawText = (buf: Buffer) =>
        mammoth.extractRawText({ buffer: buf }).then((r: { value: string }) => r.value);
    } catch {
      return {
        success: false,
        chunks: [],
        error: 'mammoth 未安装。请运行 npm install mammoth',
        metadata: { fileName, format: 'docx', totalChars: 0, chunkCount: 0, parsedAt: new Date().toISOString() },
      };
    }

    const text = await extractRawText(buffer);
    const MAX_CHARS = 3000;
    const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 0);
    const chunks: Array<{
      id: string;
      text: string;
      sourceFileName: string;
      sourceFormat: string;
      chunkIndex: number;
      totalChunks: number;
    }> = [];

    let current = '';
    let idx = 0;
    for (const p of paragraphs) {
      if (current.length + p.length > MAX_CHARS && current.length > 0) {
        chunks.push({ id: `${fileName}_${idx}`, text: current.trim(), sourceFileName: fileName, sourceFormat: 'docx', chunkIndex: idx, totalChunks: 0 });
        idx++;
        current = p;
      } else {
        current += (current ? '\n\n' : '') + p;
      }
    }
    if (current.trim()) {
      chunks.push({ id: `${fileName}_${idx}`, text: current.trim(), sourceFileName: fileName, sourceFormat: 'docx', chunkIndex: idx, totalChunks: 0 });
      idx++;
    }
    for (const c of chunks) c.totalChunks = chunks.length;

    return {
      success: true,
      chunks,
      metadata: { fileName, format: 'docx', totalChars: text.length, chunkCount: chunks.length, parsedAt: new Date().toISOString() },
    };
  } catch (err) {
    return {
      success: false,
      chunks: [],
      error: `DOCX 解析失败: ${(err as Error).message}`,
      metadata: { fileName, format: 'docx', totalChars: 0, chunkCount: 0, parsedAt: new Date().toISOString() },
    };
  }
}
