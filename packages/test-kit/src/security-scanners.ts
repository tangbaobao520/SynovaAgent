/**
 * security-scanners.ts — 安全扫描工具集
 *
 * 提供可复用的扫描函数，给 tests/security/ 下的测试使用。
 */
import * as fs from 'fs';

export interface ScanResult {
  file: string;
  line: number;
  content: string;
}

/** 扫描所有 catch 块，返回无 log 语句的块 */
export function scanEmptyCatches(files: string[], repoRoot: string): ScanResult[] {
  const results: ScanResult[] = [];
  for (const file of files) {
    const lines = fs.readFileSync(file, 'utf-8').split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (/catch\s*\{/.test(lines[i]) || /catch\s*\([^)]+\)\s*\{/.test(lines[i])) {
        if (/log\./.test(lines[i])) continue;
        if (i + 1 < lines.length && /log\./.test(lines[i + 1])) continue;
        if (/JSON\.parse|noop|non.critical|benign|nosec|fall.through|intentional/.test(lines[i])) continue;
        results.push({ file, line: i + 1, content: lines[i].trim() });
      }
    }
  }
  return results;
}

/** 扫描 as any 用法 */
export function scanAsAny(files: string[]): ScanResult[] {
  const results: ScanResult[] = [];
  const pattern = /\bas\s+any\b/;
  for (const file of files) {
    const lines = fs.readFileSync(file, 'utf-8').split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (pattern.test(lines[i]) && !lines[i].includes('//') && !lines[i].includes('*')) {
        results.push({ file, line: i + 1, content: lines[i].trim().slice(0, 100) });
      }
    }
  }
  return results;
}

/** 检查文件行数是否超标 */
export interface FileSizeWarning {
  file: string;
  lines: number;
}

export function scanFileSizes(files: string[]): { oversized: FileSizeWarning[]; large: FileSizeWarning[] } {
  const oversized: FileSizeWarning[] = [];
  const large: FileSizeWarning[] = [];
  for (const file of files) {
    const lines = fs.readFileSync(file, 'utf-8').split('\n').length;
    if (lines > 1000) oversized.push({ file, lines });
    else if (lines > 500) large.push({ file, lines });
  }
  return { oversized, large };
}
