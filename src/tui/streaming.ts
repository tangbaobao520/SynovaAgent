/**
 * tui/streaming.ts — 流式输出引擎
 *
 * Grapheme 对齐分块 + 滴灌渲染 + 增量 Markdown。
 * 对标 CodeWhale streaming/chunking.rs + commit_tick.rs。
 */

// ── Chunking ──

/** 按 grapheme 边界切割，不截断 CJK/emoji */
export function graphemeChunks(text: string, maxLen: number): string[] {
  const seg = new Intl.Segmenter('zh-Hans', { granularity: 'grapheme' });
  const chunks: string[] = [];
  let buf = '';
  for (const { segment } of seg.segment(text)) {
    if (buf.length + segment.length > maxLen) {
      chunks.push(buf);
      buf = segment;
    } else {
      buf += segment;
    }
  }
  if (buf) chunks.push(buf);
  return chunks;
}

// ── Drip Render Buffer ──

export class DripBuffer {
  private buffer = '';
  private committed = 0;
  private width: number;

  constructor(width: number) { this.width = width; }

  /** 追加 raw 内容 */
  push(text: string): void { this.buffer += text; }

  /** 取出已完成的完整行（直到最后一个 \n），返回行数组并标记为已提交 */
  commitLines(): string[] {
    const lastNL = this.buffer.lastIndexOf('\n');
    if (lastNL === -1) return [];
    const complete = this.buffer.slice(0, lastNL + 1);
    this.buffer = this.buffer.slice(lastNL + 1);
    const lines = complete.split('\n');
    // 去掉末尾空字符串（split 产生）
    if (lines[lines.length - 1] === '') lines.pop();
    this.committed += lines.length;
    return lines;
  }

  /** 剩余未提交的内容（流末尾用） */
  flush(): string { const r = this.buffer; this.buffer = ''; return r; }

  /** 已提交行数 */
  get committedLines(): number { return this.committed; }
}

// ── Incremental Markdown ──

import { renderMarkdown } from './markdown';

/**
 * 增量 Markdown 渲染。
 * - 流式过程中：只渲染已提交行 + 当前缓冲行（纯文本，不加 Markdown）
 * - 流结束时：全量 renderMarkdown
 */
export function renderIncremental(committed: string[], pending: string, isEnd: boolean): string {
  const parts: string[] = [];
  // 已提交行渲染 Markdown
  if (committed.length > 0) {
    parts.push(renderMarkdown(committed.join('\n')));
  }
  // 未完成行原样追加
  if (pending) {
    if (parts.length > 0) parts.push(pending);
    else parts.push(pending);
  }
  return parts.join('\n');
}
