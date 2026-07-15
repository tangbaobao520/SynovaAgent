/**
 * tests/experts/d64-knowledge-files.test.ts — D64 专家知识文件
 *
 * 验证: 文件存在 + 有效Markdown + ≥3个##段落
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';

function countSections(content: string): number {
  return (content.match(/^## /gm) || []).length;
}

describe('D64 — marketing/TOOLS.md 追加', () => {
  it('文件存在', () => {
    expect(existsSync('expert/marketing/TOOLS.md')).toBe(true);
  });
  it('包含需求预测框架章节', () => {
    const content = readFileSync('expert/marketing/TOOLS.md', 'utf-8');
    expect(content).toContain('需求预测框架');
    expect(content).toContain('computeDemandForecast');
  });
  it('≥3个##段落', () => {
    const content = readFileSync('expert/marketing/TOOLS.md', 'utf-8');
    expect(countSections(content)).toBeGreaterThanOrEqual(3);
  });
});

describe('D64 — strategy/KNOWLEDGE.md 新建', () => {
  it('文件存在', () => {
    expect(existsSync('expert/strategy/KNOWLEDGE.md')).toBe(true);
  });
  it('包含市场结构四象限', () => {
    const content = readFileSync('expert/strategy/KNOWLEDGE.md', 'utf-8');
    expect(content).toContain('市场结构四象限');
    expect(content).toContain('HHI 阈值');
    expect(content).toContain('定价权评估');
  });
  it('≥3个##段落', () => {
    const content = readFileSync('expert/strategy/KNOWLEDGE.md', 'utf-8');
    expect(countSections(content)).toBeGreaterThanOrEqual(3);
  });
});

describe('D64 — finance/KNOWLEDGE.md 新建', () => {
  it('文件存在', () => {
    expect(existsSync('expert/finance/KNOWLEDGE.md')).toBe(true);
  });
  it('包含资本预算决策树', () => {
    const content = readFileSync('expert/finance/KNOWLEDGE.md', 'utf-8');
    expect(content).toContain('资本预算决策树');
    expect(content).toContain('NPV');
    expect(content).toContain('IRR');
  });
  it('≥2个##段落', () => {
    const content = readFileSync('expert/finance/KNOWLEDGE.md', 'utf-8');
    expect(countSections(content)).toBeGreaterThanOrEqual(2);
  });
});

describe('D64 — org/KNOWLEDGE.md 新建', () => {
  it('文件存在', () => {
    expect(existsSync('expert/org/KNOWLEDGE.md')).toBe(true);
  });
  it('包含代理成本理论', () => {
    const content = readFileSync('expert/org/KNOWLEDGE.md', 'utf-8');
    expect(content).toContain('代理成本');
    expect(content).toContain('治理机制');
  });
  it('≥3个##段落', () => {
    const content = readFileSync('expert/org/KNOWLEDGE.md', 'utf-8');
    expect(countSections(content)).toBeGreaterThanOrEqual(3);
  });
});
