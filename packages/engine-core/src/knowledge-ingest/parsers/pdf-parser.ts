/**
 * knowledge-ingest/parsers/pdf-parser.ts — PDF 文档解析器
 */

import type { ParseResult } from './index';

export async function parsePdf(buffer: Buffer, fileName: string): Promise<ParseResult> {
  try {
    // 动态加载 pdf-parse（可选依赖）
    let pdfParse: (buf: Buffer) => Promise<{ text: string; numpages: number }>;
    try {
      pdfParse = require('pdf-parse');
    } catch {
      return {
        success: false,
        chunks: [],
        error: 'pdf-parse 未安装。请运行 npm install pdf-parse',
        metadata: { fileName, format: 'pdf', totalChars: 0, chunkCount: 0, parsedAt: new Date().toISOString() },
      };
    }

    const result = await pdfParse(buffer);
    const text = result.text;

    const paragraphs = text
      .split(/\n\n+/)
      .filter(p => p.trim().length > 0);

    const MAX_CHARS = 3000;
    const chunks: Array<{
      id: string;
      text: string;
      sourceFileName: string;
      sourceFormat: string;
      pageNum?: number;
      chunkIndex: number;
      totalChunks: number;
    }> = [];

    let current = '';
    let idx = 0;
    for (const p of paragraphs) {
      if (current.length + p.length > MAX_CHARS && current.length > 0) {
        chunks.push({
          id: `${fileName}_${idx}`,
          text: current.trim(),
          sourceFileName: fileName,
          sourceFormat: 'pdf',
          chunkIndex: idx,
          totalChunks: 0,
        });
        idx++;
        current = p;
      } else {
        current += (current ? '\n\n' : '') + p;
      }
    }
    if (current.trim()) {
      chunks.push({
        id: `${fileName}_${idx}`,
        text: current.trim(),
        sourceFileName: fileName,
        sourceFormat: 'pdf',
        chunkIndex: idx,
        totalChunks: 0,
      });
      idx++;
    }

    for (const c of chunks) c.totalChunks = chunks.length;

    return {
      success: true,
      chunks,
      metadata: {
        fileName,
        format: 'pdf',
        totalChars: text.length,
        chunkCount: chunks.length,
        parsedAt: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      success: false,
      chunks: [],
      error: `PDF 解析失败: ${(err as Error).message}`,
      metadata: { fileName, format: 'pdf', totalChars: 0, chunkCount: 0, parsedAt: new Date().toISOString() },
    };
  }
}
