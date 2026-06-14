/**
 * tui-v2/lib/grapheme.ts — Grapheme 边界处理
 *
 * 对标 CodeWhale unicode-segmentation。
 * 使用 Intl.Segmenter（Node.js 16+）或 grapheme-splitter 回退。
 * 确保 CJK/emoji 不被截断。
 */

import GraphemeSplitter from 'grapheme-splitter';

// 优先使用原生 Intl.Segmenter（性能更好）
const hasSegmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl;

let segmenter: Intl.Segmenter | null = null;
if (hasSegmenter) {
  try {
    segmenter = new Intl.Segmenter('zh-Hans', { granularity: 'grapheme' });
  } catch { console.debug('Intl.Segmenter 不可用 — 回退到 grapheme-splitter'); }
    // 回退到 grapheme-splitter
  }

const splitter = !segmenter ? new GraphemeSplitter() : null;

/** 将文本分割为 grapheme 数组 */
export function splitGraphemes(text: string): string[] {
  if (segmenter) {
    return Array.from(segmenter.segment(text), s => s.segment);
  }
  return splitter!.splitGraphemes(text);
}

/** 获取 grapheme 数量（不是字符长度） */
export function graphemeCount(text: string): number {
  if (segmenter) {
    return Array.from(segmenter.segment(text)).length;
  }
  return splitter!.countGraphemes(text);
}

/** 截取前 n 个 grapheme */
export function sliceGraphemes(text: string, start: number, end?: number): string {
  const graphemes = splitGraphemes(text);
  return graphemes.slice(start, end).join('');
}

/** 获取第 n 个 grapheme 的字符串索引 */
export function graphemeIndexToStringIndex(text: string, graphemeIdx: number): number {
  const graphemes = splitGraphemes(text);
  let idx = 0;
  for (let i = 0; i < Math.min(graphemeIdx, graphemes.length); i++) {
    idx += graphemes[i].length;
  }
  return idx;
}

/** 在 grapheme 位置插入文本 */
export function insertAtGrapheme(text: string, graphemePos: number, insert: string): string {
  const stringIdx = graphemeIndexToStringIndex(text, graphemePos);
  return text.slice(0, stringIdx) + insert + text.slice(stringIdx);
}

/** 在 grapheme 位置删除 1 个 grapheme */
export function deleteAtGrapheme(text: string, graphemePos: number): string {
  const graphemes = splitGraphemes(text);
  if (graphemePos < 0 || graphemePos >= graphemes.length) return text;
  graphemes.splice(graphemePos, 1);
  return graphemes.join('');
}

/** 计算文本的显示宽度（CJK = 2，ASCII = 1） */
export function displayWidth(text: string): number {
  let width = 0;
  for (const char of text) {
    const code = char.codePointAt(0) || 0;
    // CJK Unified Ideographs + CJK Extension A-F + Fullwidth forms
    if (
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0x3400 && code <= 0x4dbf) ||
      (code >= 0x20000 && code <= 0x2a6df) ||
      (code >= 0x2a700 && code <= 0x2b73f) ||
      (code >= 0x2b740 && code <= 0x2b81f) ||
      (code >= 0x2b820 && code <= 0x2ceaf) ||
      (code >= 0x2ceb0 && code <= 0x2ebef) ||
      (code >= 0x30000 && code <= 0x3134f) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xff01 && code <= 0xff5e) ||
      (code >= 0xffe0 && code <= 0xffe6)
    ) {
      width += 2;
    } else {
      width += 1;
    }
  }
  return width;
}

/** ANSI 转义序列正则 */
const ANSI_REGEX = /\x1b\[[0-9;]*m/g;

/** 去除 ANSI 转义序列 */
export function stripAnsi(text: string): string {
  return text.replace(ANSI_REGEX, '');
}

/** 计算文本的显示宽度（去除 ANSI 后） */
export function displayWidthStrip(text: string): number {
  return displayWidth(stripAnsi(text));
}

/** 按显示宽度截断文本 */
export function truncateToWidth(text: string, maxWidth: number): string {
  const graphemes = splitGraphemes(text);
  let width = 0;
  let result = '';
  for (const g of graphemes) {
    const gw = displayWidth(g);
    if (width + gw > maxWidth) break;
    result += g;
    width += gw;
  }
  return result;
}
