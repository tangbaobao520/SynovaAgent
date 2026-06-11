/**
 * knowledge-ingest/parsers/excel-parser.ts — Excel (.xlsx) 表格解析器
 */

import type { ParseResult } from './index';

export async function parseExcel(buffer: Buffer, fileName: string): Promise<ParseResult> {
  try {
    let XLSX: { read: (buf: Buffer, opts: object) => { SheetNames: string[]; Sheets: Record<string, unknown> }; utils: { sheet_to_csv: (sheet: unknown) => string } };
    try {
      XLSX = require('xlsx');
    } catch {
      return {
        success: false,
        chunks: [],
        error: 'xlsx 未安装。请运行 npm install xlsx',
        metadata: { fileName, format: 'xlsx', totalChars: 0, chunkCount: 0, parsedAt: new Date().toISOString() },
      };
    }

    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const allTexts: string[] = [];

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(sheet);
      allTexts.push(`## Sheet: ${sheetName}\n${csv}`);
    }

    const combinedText = allTexts.join('\n\n');
    const MAX_CHARS = 3000;
    const paragraphs = combinedText.split(/\n\n+/).filter(p => p.trim().length > 0);
    const chunks: Array<{
      id: string;
      text: string;
      sourceFileName: string;
      sourceFormat: string;
      rowNum?: number;
      chunkIndex: number;
      totalChunks: number;
    }> = [];

    let current = '';
    let idx = 0;
    for (const p of paragraphs) {
      if (current.length + p.length > MAX_CHARS && current.length > 0) {
        chunks.push({ id: `${fileName}_${idx}`, text: current.trim(), sourceFileName: fileName, sourceFormat: 'xlsx', chunkIndex: idx, totalChunks: 0 });
        idx++;
        current = p;
      } else {
        current += (current ? '\n\n' : '') + p;
      }
    }
    if (current.trim()) {
      chunks.push({ id: `${fileName}_${idx}`, text: current.trim(), sourceFileName: fileName, sourceFormat: 'xlsx', chunkIndex: idx, totalChunks: 0 });
      idx++;
    }
    for (const c of chunks) c.totalChunks = chunks.length;

    return {
      success: true,
      chunks,
      metadata: { fileName, format: 'xlsx', totalChars: combinedText.length, chunkCount: chunks.length, parsedAt: new Date().toISOString() },
    };
  } catch (err) {
    return {
      success: false,
      chunks: [],
      error: `Excel 解析失败: ${(err as Error).message}`,
      metadata: { fileName, format: 'xlsx', totalChars: 0, chunkCount: 0, parsedAt: new Date().toISOString() },
    };
  }
}
