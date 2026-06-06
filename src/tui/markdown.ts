/**
 * tui/markdown.ts — 终端 Markdown 渲染
 *
 * 支持的语法: 代码块(```)、内联代码(`)、粗体(**)、表格、标题(#)
 * 输出 ANSI 转义序列，blessed 直接渲染。
 */

import { BOLD, DIM, CYAN, GREEN, YELLOW, WHITE, CLOSE } from './color-tags';
const B = BOLD; const D = DIM; const C = CYAN; const G = GREEN; const Y = YELLOW; const W = WHITE; const R = CLOSE;

/**
 * 将 Markdown 文本渲染为 ANSI 格式化字符串。
 * 宽度为 0 时不换行。
 */
export function renderMarkdown(text: string, width: number = 70): string {
  const lines = text.split('\n');
  const out: string[] = [];
  let inCodeBlock = false;
  let tableRows: string[][] = [];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];

    // ── 代码块 ──
    if (raw.trim().startsWith('```')) {
      if (inCodeBlock) {
        out.push(`${D}└──${R}`);
        out.push('');
        inCodeBlock = false;
      } else {
        const lang = raw.trim().slice(3).trim();
        const label = lang ? ` ${lang} ` : ' code ';
        out.push(`${D}┌──${C}${label}${D}${'─'.repeat(Math.max(0, Math.min(width - label.length - 4, 40)))}${R}`);
        inCodeBlock = true;
      }
      continue;
    }
    if (inCodeBlock) {
      out.push(`${D}│${R} ${C}${truncate(raw, width - 2)}${R}`);
      continue;
    }

    // ── 表格 ──
    if (raw.includes('|') && raw.trim().startsWith('|')) {
      const cells = raw.split('|').filter(c => c.trim()).map(c => c.trim());
      // 跳过分隔行
      if (cells.every(c => /^[-:]+$/.test(c))) continue;
      tableRows.push(cells);
      // 等到连续非表格行时再渲染
      const nextLine = lines[i + 1];
      if (nextLine && nextLine.includes('|') && nextLine.trim().startsWith('|')) continue;

      // 渲染累积的表格
      if (tableRows.length > 0) {
        const colWidths = tableRows[0].map((_, ci) =>
          Math.max(...tableRows.map(r => displayWidth(r[ci] || '')))
        );
        const sep = '─'.repeat(colWidths.reduce((a, b) => a + b + 3, 1));
        out.push(` ${D}┌${sep}┐${R}`);
        for (let ri = 0; ri < tableRows.length; ri++) {
          const row = tableRows[ri];
          const cellStrs = row.map((c, ci) => {
            const w = colWidths[ci];
            const content = ri === 0 ? `${B}${c}${R}` : c;
            return padRight(content, w);
          });
          out.push(` ${D}│${R} ${cellStrs.join(` ${D}│${R} `)} ${D}│${R}`);
        }
        out.push(` ${D}└${sep}┘${R}`);
        out.push('');
        tableRows = [];
      }
      continue;
    }

    // ── 标题 ──
    if (/^#{1,4}\s/.test(raw)) {
      const level = raw.match(/^(#{1,4})/)![1].length;
      const content = raw.replace(/^#{1,4}\s*/, '');
      if (level === 1) out.push(`\n${B}${W}${content}${R}`);
      else if (level === 2) out.push(`\n${B}${content}${R}`);
      else out.push(`${B}${content}${R}`);
      continue;
    }

    // ── 普通段落 + 内联格式 ──
    let line = raw;
    // 粗体 **text**
    line = line.replace(/\*\*(.+?)\*\*/g, `${B}$1${R}`);
    // 内联代码 `code`
    line = line.replace(/`(.+?)`/g, `${C}$1${R}`);

    out.push(line);
  }

  return out.join('\n');
}

function truncate(s: string, max: number): string {
  const plain = stripAnsi(s);
  if (plain.length <= max) return s;
  return s.slice(0, max) + '…';
}

function displayWidth(s: string): number {
  return stripAnsi(s).length;
}

function padRight(s: string, width: number): string {
  const plain = stripAnsi(s);
  return s + ' '.repeat(Math.max(0, width - plain.length));
}

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}
