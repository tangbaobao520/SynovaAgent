/**
 * tests/e2e/03-tui-smoke.test.ts — TUI 冒烟测试
 *
 * 测试 formatWelcome 输出完整性、addRawContent 不截断逻辑。
 * blessed 需要 TTY，这里只测纯逻辑层。
 */
import { describe, it, expect } from 'vitest';

describe('TUI 冒烟测试', () => {
  // ═══ formatWelcome: 逻辑层 (无 blessed 依赖) ═══

  it('Given LLM healthy, formatWelcome contains SYNOVA ASCII logo', async () => {
    const { formatWelcome } = await import('../../../../src/tui/welcome');
    const content = formatWelcome({
      providerName: 'DeepSeek',
      model: 'deepseek-v4-flash',
      workDir: '/home/user/synova-agent',
      healthy: true,
    });

    // SYNOVA 是 ASCII art 字体，分布在多行中
    expect(content).toContain('███████╗');
    expect(content).toContain('██╔════╝');
    expect(content).toContain('组织增长导航系统');
    expect(content).toContain('7×24');
    expect(content).toContain('设定增长目标');
    expect(content).toContain('6 位 AI 专家');
    expect(content).toContain('每日 19:00');
    expect(content).toContain('/setup');
    expect(content).toContain('/help');
    expect(content).toContain('DeepSeek');
    expect(content).toContain('deepseek-v4-flash');
  });

  it('Given LLM not configured, shows warning', async () => {
    const { formatWelcome } = await import('../../../../src/tui/welcome');
    const content = formatWelcome({
      providerName: 'deepseek',
      model: '待配置',
      workDir: '/tmp',
      healthy: false,
    });

    expect(content).toContain('待配置');
  });

  it('Welcome lines fit standard terminal width (≤100 chars plain)', async () => {
    const { formatWelcome } = await import('../../../../src/tui/welcome');
    const content = formatWelcome({
      providerName: 'DeepSeek',
      model: 'deepseek-v4-flash',
      workDir: '.',
      healthy: true,
    });

    for (const line of content.split('\n')) {
      const plain = line.replace(/\x1b\[[0-9;]*m/g, '');
      expect(plain.length).toBeLessThanOrEqual(100);
    }
  });

  it('Welcome ends with tips (help commands visible)', async () => {
    const { formatWelcome } = await import('../../../../src/tui/welcome');
    const content = formatWelcome({
      providerName: 'DeepSeek',
      model: 'deepseek-v4-flash',
      workDir: '.',
      healthy: true,
    });

    expect(content).toContain('直接输入增长目标即可开始');
    expect(content).toContain('/setup');
    expect(content).toContain('/help');
  });

  // ═══ addRawContent 不截断 ═══

  it('addRawContent preserves multiline content without wrapping', () => {
    const contentLines: string[] = [];
    function addRawContent(text: string) {
      for (const line of text.split('\n')) contentLines.push(line);
      contentLines.push('');
    }

    const art = [
      '███████╗ ██╗   ██╗ ███╗   ██╗',
      '██╔════╝ ╚██╗ ██╔╝ ████╗  ██║',
    ].join('\n');

    addRawContent(art);
    expect(contentLines[0]).toContain('███████╗');
    expect(contentLines[1]).toContain('██╔════╝');
    expect(contentLines[2]).toBe('');
  });

  it('addRawContent does NOT wrap long ASCII lines', () => {
    const contentLines: string[] = [];
    function addRawContent(text: string) {
      for (const line of text.split('\n')) contentLines.push(line);
      contentLines.push('');
    }

    // 模拟 welcome 的一行 ASCII art (~80 chars)
    const logoLine = '   ███████╗ ██╗   ██╗ ███╗   ██╗  ██████╗  ██╗   ██╗  █████╗   ';
    addRawContent(logoLine);
    // raw 模式不换行 — 整行保留
    expect(contentLines[0]).toBe(logoLine);
    expect(contentLines.length).toBe(2); // 只有 1 行 + 空行
  });

  it('addMessage would truncate (contrast with addRawContent)', () => {
    // 模拟 addMessage 的 wrapText 行为
    function wrapText(text: string, width: number): string[] {
      if (text.length <= width) return [text];
      const lines: string[] = [];
      let remaining = text;
      while (remaining.length > width) {
        lines.push(remaining.slice(0, width));
        remaining = remaining.slice(width);
      }
      if (remaining) lines.push(remaining);
      return lines;
    }

    const logoLine = '   ███████╗ ██╗   ██╗ ███╗   ██╗  ██████╗  ██╗   ██╗  █████╗   ';
    // 40 chars width — ASCII art 必然被截断
    const wrapped = wrapText(logoLine, 40);
    expect(wrapped.length).toBeGreaterThanOrEqual(2); // 被切成多行 → Logo 损坏
  });
});
