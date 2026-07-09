/**
 * tech-theory-injection.test.ts — 信息不对称注入验证测试
 *
 * T9 Part B3: tech/THEORY.md 注入内容验证
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const theory = readFileSync(resolve(__dirname, '../../expert/tech/THEORY.md'), 'utf-8');

describe('tech/THEORY.md 注入验证', () => {
  it('包含"信息不对称分析框架"章节', () => {
    expect(theory).toContain('信息不对称分析框架');
  });

  it('包含三种信息不对称来源', () => {
    expect(theory).toContain('柠檬市场（Akerlof, 1970）');
    expect(theory).toContain('信号发送（Spence, 1973）');
    expect(theory).toContain('逆向选择筛选（Rothschild-Stiglitz, 1976）');
  });

  it('包含混合组织修正', () => {
    expect(theory).toContain('Agent 可以大幅降低信息不对称');
    expect(theory).toContain('Agent 的诊断过程必须可审计');
  });

  it('旧内容完整保留', () => {
    expect(theory).toContain('信息不对称 + 柠檬市场');
    expect(theory).toContain('技术-经济范式');
    expect(theory).toContain('软件识别与生态扫描');
  });
});
