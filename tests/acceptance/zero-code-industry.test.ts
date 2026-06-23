/**
 * zero-code-industry.test.ts — 文件驱动架构验收测试 (占位)
 *
 * TODO: 验证零代码接入新行业/新本体类型/新 LLM 的完整链路。
 * 包含: extensions/ontology/ + extensions/industries/ 的自动发现和加载。
 *
 * @owner file-driven-claude
 */
import { describe, it, expect } from 'vitest';

describe('零代码接入验收', () => {
  it('extensions/ 目录存在且包含子模块', async () => {
    const fs = await import('fs');
    const extDir = 'extensions';
    expect(fs.existsSync(extDir)).toBe(true);
    const dirs = fs.readdirSync(extDir, { withFileTypes: true })
      .filter((d: { isDirectory: () => boolean }) => d.isDirectory())
      .map((d: { name: string }) => d.name);
    expect(dirs.length).toBeGreaterThanOrEqual(1);
    expect(dirs).toContain('sentinels');
  });
});
