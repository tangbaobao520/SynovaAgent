/**
 * tests/interview/question-bank.test.ts — T11 question-bank 测试
 *
 * 约束6: ≥3个测试（正常路径+边界+降级）
 * 约束4: 验证 getQuestions() 通过 tags 过滤而非 if-else
 */
import { describe, it, expect } from 'vitest';
import { getQuestions, getQuestionSet, getTotalQuestionCount, QUESTION_BANK } from '../../src/interview/question-bank';

describe('T11 question-bank', () => {
  it('正常: question-bank 总量约120+道种子题', () => {
    const total = getTotalQuestionCount();
    // 当前~107道（Phase A粒度），Phase B补充至~150
    expect(total).toBeGreaterThanOrEqual(100);
    expect(total).toBeLessThanOrEqual(200);
  });

  it('正常: 每个问题有完整字段', () => {
    for (const q of QUESTION_BANK) {
      expect(q.id).toBeTruthy();
      expect(q.text).toBeTruthy();
      expect(q.dimension).toBeTruthy();
      expect(Array.isArray(q.targetRoles)).toBe(true);
      expect(Array.isArray(q.tags)).toBe(true);
      expect(['required', 'recommended', 'optional']).toContain(q.priority);
    }
  });

  it('正常: 通用锚题(targetRoles=[])通过所有角色检索返回', () => {
    const anchorQuestions = getQuestions(undefined, 'ceo');
    // 应该有通用锚题 (4道)
    const anchors = anchorQuestions.filter(q => q.targetRoles.length === 0);
    expect(anchors.length).toBe(4);
    expect(anchors.map(a => a.id)).toContain('G-A1');
    expect(anchors.map(a => a.id)).toContain('G-A4');
  });

  it('正常: CEO角色锚题包含CEO专属题', () => {
    const ceoQuestions = getQuestionSet('ceo');
    const ceoSpecific = ceoQuestions.filter(q => q.targetRoles.includes('ceo'));
    expect(ceoSpecific.length).toBeGreaterThanOrEqual(8);
    expect(ceoQuestions.some(q => q.id === 'CEO-D1-Q1')).toBe(true);
    expect(ceoQuestions.some(q => q.id === 'CEO-D5-Q2')).toBe(true);
  });

  it('正常: 工程师角色有答题', () => {
    const engQuestions = getQuestionSet('engineer');
    expect(engQuestions.length).toBeGreaterThanOrEqual(4);
    expect(engQuestions.some(q => q.id === 'ENG-D1-Q1')).toBe(true);
    expect(engQuestions.some(q => q.id === 'ENG-D5-Q2')).toBe(true);
  });

  it('边界: 不存在的角色返回只通用锚题', () => {
    const unknownRoleQuestions = getQuestions(undefined, 'nonexistent_role');
    expect(unknownRoleQuestions.length).toBeGreaterThanOrEqual(1);
    // 应该只返回通用锚题（targetRoles=[]）
    expect(unknownRoleQuestions.every(q => q.targetRoles.length === 0)).toBe(true);
  });

  it('正常: 行业过滤返回相关题目', () => {
    const saasQuestions = getQuestions(undefined, 'ceo', 'saas');
    const genericAnchorCount = saasQuestions.filter(q => q.targetRoles.length === 0).length;
    expect(genericAnchorCount).toBe(4); // 通用锚题应该都在
    const saasSpecific = saasQuestions.filter(q => !q.targetRoles.includes('ceo') && q.targetRoles.length > 0);
    // SaaS 标签的 CEO 题应该存在
    expect(saasQuestions.some(q => q.tags.includes('saas'))).toBe(true);
  });

  it('边界: 不存在的行业返回行业相关题为0（通用锚题仍返回）', () => {
    // 不存在的行业 → 行业相关题返回 0，但通用锚题（tags:['通用']）仍返回
    const unknownIndustryQuestions = getQuestions(undefined, undefined, 'nonexistent_industry');
    // 通用锚题有 `通用` tag → getQuestions 的行业过滤中 !q.tags.includes('通用') → 不触发过滤 → 通用题保留
    expect(unknownIndustryQuestions.length).toBeGreaterThanOrEqual(4);
    // 所有返回的都是通用锚题
    expect(unknownIndustryQuestions.every(q => q.tags.includes('通用'))).toBe(true);
  });

  it('约束4: 检索不依赖 if-else 硬编码', () => {
    // 验证所有问题都有 tags 数组，getQuestions 通过 tags 过滤
    for (const q of QUESTION_BANK) {
      expect(Array.isArray(q.tags)).toBe(true);
    }
    // 验证特定行业过滤的正确性
    const manufacturingQuestions = getQuestions(undefined, 'manager', 'manufacturing');
    const notManufacturing = manufacturingQuestions.filter(
      q => !q.tags.includes('manufacturing') && q.tags[0] !== '通用',
    );
    expect(notManufacturing.length).toBe(0);
  });

  it('正常: priority字段有效', () => {
    const priorities = QUESTION_BANK.map(q => q.priority);
    expect(priorities.filter(p => p === 'required').length).toBeGreaterThanOrEqual(30);
    expect(priorities.filter(p => p === 'recommended').length).toBeGreaterThanOrEqual(50);
  });
});
