/**
 * tests/l3/tone-enforcer.test.ts — D57 Tone后处理管线
 *
 * 覆盖: enforceReport / enforceConversation / enforceRoleConsistency
 * 约束: ≥12测试 / 零as any / 纯确定性(不依赖LLM)
 */
import { describe, it, expect } from 'vitest';
import {
  enforceReport,
  enforceConversation,
  enforceRoleConsistency,
} from '../../src/l3/tone-enforcer';

describe('D57 — enforceReport 散文化', () => {
  it('2个列表项 → 合并为散文', () => {
    const input = '- 现金流紧张\n- 毛利率下降';
    const result = enforceReport(input);
    expect(result.text).toContain('几个因素同时作用');
    expect(result.text).toContain('现金流紧张');
    expect(result.text).toContain('毛利率下降');
    expect(result.text).not.toContain('- ');
    expect(result.degraded).toBe(true);
  });

  it('3个列表项 → 合并为散文', () => {
    const input = '- 因素一\n- 因素二\n- 因素三';
    const result = enforceReport(input);
    expect(result.text).toContain('几个因素同时作用');
    expect(result.degraded).toBe(true);
  });

  it('4+个列表项 → 分段', () => {
    const input = '- A\n- B\n- C\n- D\n- E';
    const result = enforceReport(input);
    expect(result.text).toContain('多个因素共同影响');
    expect(result.text).toContain('此外');
    expect(result.text).not.toContain('- ');
    expect(result.degraded).toBe(true);
  });

  it('无列表 → 原文不变', () => {
    const input = '这是一段正常的散文内容，没有列表格式。';
    const result = enforceReport(input);
    expect(result.text).toBe(input);
    expect(result.degraded).toBe(false);
  });

  it('非列表Markdown内容不变', () => {
    const input = '# 标题\n\n这是一段正文。\n\n## 副标题';
    const result = enforceReport(input);
    expect(result.text).toBe(input);
    expect(result.degraded).toBe(false);
  });

  it('空输入 → degraded=true + 空字符串', () => {
    const result = enforceReport('');
    expect(result.text).toBe('');
    expect(result.degraded).toBe(true);
  });

  it('undefined输入 → degraded=true + 空字符串', () => {
    const result = enforceReport(undefined as unknown as string);
    expect(result.text).toBe('');
    expect(result.degraded).toBe(true);
  });

  it('数字编号列表 → 转换为散文', () => {
    const input = '1. 原因一\n2. 原因二';
    const result = enforceReport(input);
    expect(result.text).toContain('几个因素同时作用');
    expect(result.text).not.toContain('1. ');
    expect(result.degraded).toBe(true);
  });
});

describe('D57 — enforceConversation 多问号检测', () => {
  it('单问号 → multiQuestion=false', () => {
    const result = enforceConversation('这个数据可靠吗？');
    expect(result.multiQuestion).toBe(false);
    expect(result.text).toBe('这个数据可靠吗？');
  });

  it('连续两个问号 → multiQuestion=true', () => {
    const result = enforceConversation('你确定吗？？这个数据对吗？');
    expect(result.multiQuestion).toBe(true);
    expect(result.text).toBe('你确定吗？？这个数据对吗？'); // 不截断
  });

  it('中文问号连续 → multiQuestion=true', () => {
    const result = enforceConversation('你确定？？这个数据来源是什么？');
    expect(result.multiQuestion).toBe(true);
    expect(result.text).toContain('你确定？？');
  });

  it('空输入 → multiQuestion=false', () => {
    const result = enforceConversation('');
    expect(result.multiQuestion).toBe(false);
    expect(result.text).toBe('');
  });
});

describe('D57 — enforceRoleConsistency 角色一致性', () => {
  it('财务专家使用财务术语 → 无警告', () => {
    const result = enforceRoleConsistency(
      '现金流紧张，毛利率下降至38%。',
      'finance',
    );
    expect(result.warnings).toHaveLength(0);
  });

  it('财务专家使用战略术语 → 有警告', () => {
    const result = enforceRoleConsistency(
      '竞争壁垒正在减弱，市场定位模糊。',
      'finance',
    );
    expect(result.warnings.length).toBeGreaterThanOrEqual(1);
    expect(result.warnings[0]).toContain('strategy');
  });

  it('空输入 → 无警告', () => {
    const result = enforceRoleConsistency('', 'finance');
    expect(result.warnings).toHaveLength(0);
    expect(result.text).toBe('');
  });

  it('未知tone → 无警告', () => {
    const result = enforceRoleConsistency('一些通用文本。', 'generic-expert');
    expect(result.warnings).toHaveLength(0);
  });
});
