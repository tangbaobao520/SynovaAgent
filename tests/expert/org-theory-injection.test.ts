/**
 * org-theory-injection.test.ts — 委托-代理注入验证测试
 *
 * T9 Part B3: org/THEORY.md 注入内容验证
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const theory = readFileSync(resolve(__dirname, '../../expert/org/THEORY.md'), 'utf-8');

describe('org/THEORY.md 注入验证', () => {
  it('包含"委托-代理操作分析框架"章节', () => {
    expect(theory).toContain('委托-代理操作分析框架（基于管理经济学）');
  });

  it('包含"代理问题的识别条件"子章节', () => {
    expect(theory).toContain('代理问题的识别条件');
    expect(theory).toContain('委托人和代理人的目标不一致');
    expect(theory).toContain('信息不对称——委托人无法完全观察代理人的行为');
  });

  it('旧内容完整保留（理论支柱表格仍在）', () => {
    expect(theory).toContain('演化经济学');
    expect(theory).toContain('Nelson & Winter (1982)');
    expect(theory).toContain('委托-代理理论');
    expect(theory).toContain('Jensen & Meckling (1976)');
    expect(theory).toContain('杨三角');
  });

  it('包含 Synova 定制增强标记', () => {
    expect(theory).toContain('Synova 定制增强');
    expect(theory).toContain('INCENTIVE_BINDS');
  });

  it('包含混合组织修正', () => {
    expect(theory).toContain('人+AI 混合组织');
    expect(theory).toContain('possible alignment drift');
  });
});
