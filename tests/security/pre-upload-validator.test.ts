/**
 * tests/security/pre-upload-validator.test.ts — D42: PreUploadValidator 隐私预检测试
 *
 * 测试覆盖(>=6):
 * - S4级别PII → blocked=true
 * - S2-S3 PII → blocked=false, warnings含提示
 * - 含企业机密关键词 → blocked=true
 * - 干净内容 → ok=true
 * - 空内容 → 直接通过
 * - 验证异常 → 降级放行
 */
import { describe, it, expect } from 'vitest';
import { PreUploadValidator, getPreUploadValidator, loadKeywordsFromFile } from '../../src/security/pre-upload-validator';
import { PIIScrubber } from '../../src/security/pii-scrubber';

describe('PreUploadValidator — PII检测', () => {
  const scrubber = new PIIScrubber();
  const validator = new PreUploadValidator(scrubber, {
    blocked: ['商业机密', '未公开财务数据'],
    warn: ['内部会议纪要'],
  });

  it('Given S4 level PII (API key), When validate, Then blocked=true', () => {
    const result = validator.validate('My API key is sk-abc123def456ghi789jkl012mno345pqr678stu', 't1');
    expect(result.blocked).toBe(true);
    expect(result.ok).toBe(false);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('Given S3 PII (phone), When validate, Then blocked=false, warnings含提示', () => {
    const result = validator.validate('请联系 13812345678', 't1');
    expect(result.blocked).toBe(false);
    expect(result.ok).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('PII');
  });

  it('Given S2 PII (Chinese name), When validate, Then blocked=false, warnings含提示', () => {
    const result = validator.validate('欧阳修负责研发团队', 't1');
    expect(result.blocked).toBe(false);
    expect(result.ok).toBe(true);
  });
});

describe('PreUploadValidator — 企业机密关键词', () => {
  const scrubber = new PIIScrubber();
  const validator = new PreUploadValidator(scrubber, {
    blocked: ['商业机密', '未公开财务数据'],
    warn: ['内部会议纪要', '竞品分析草稿'],
  });

  it('Given enterprise keyword "商业机密", When validate, Then blocked=true', () => {
    const result = validator.validate('本文件包含商业机密，请勿外传', 't1');
    expect(result.blocked).toBe(true);
    expect(result.ok).toBe(false);
    expect(result.warnings[0]).toContain('商业机密');
  });

  it('Given warn-level keyword, When validate, Then blocked=false, warnings含提示', () => {
    const result = validator.validate('这是内部会议纪要，仅供参考', 't1');
    expect(result.blocked).toBe(false);
    expect(result.ok).toBe(true);
    expect(result.warnings.some(w => w.includes('内部会议纪要'))).toBe(true);
  });
});

describe('PreUploadValidator — 边界条件', () => {
  const scrubber = new PIIScrubber();
  const validator = new PreUploadValidator(scrubber, {
    blocked: ['商业机密'],
    warn: [],
  });

  it('Given clean content, When validate, Then ok=true, no warnings', () => {
    const result = validator.validate('今天天气不错，适合团队建设活动。', 't1');
    expect(result.ok).toBe(true);
    expect(result.blocked).toBe(false);
    expect(result.warnings).toHaveLength(0);
  });

  it('Given empty content, When validate, Then ok=true, no warnings', () => {
    const result = validator.validate('', 't1');
    expect(result.ok).toBe(true);
    expect(result.blocked).toBe(false);
    expect(result.warnings).toHaveLength(0);
  });

  it('Given whitespace content, When validate, Then ok=true, no warnings', () => {
    const result = validator.validate('   ', 't1');
    expect(result.ok).toBe(true);
    expect(result.blocked).toBe(false);
  });

  it('Given large text > 100KB, When validate, Then truncated and still works', () => {
    const large = 'A'.repeat(200000);
    const result = validator.validate(large, 't1');
    // Should not crash, should pass clean
    expect(result.ok).toBe(true);
    expect(result.blocked).toBe(false);
  });
});

describe('PreUploadValidator — 降级行为', () => {
  it('Given scrubber that throws, When validate, Then degraded but allowed', () => {
    // 注入一个会抛异常的 scrubber
    const brokenScrubber = {
      detectOnly: () => { throw new Error('scrubber crash'); },
    } as unknown as PIIScrubber;
    const validator = new PreUploadValidator(brokenScrubber, {
      blocked: ['商业机密'],
      warn: [],
    });
    const result = validator.validate('some content', 't1');
    expect(result.ok).toBe(true);
    expect(result.blocked).toBe(false);
    expect(result.warnings.some(w => w.includes('验证服务不可用'))).toBe(true);
  });
});

describe('loadKeywordsFromFile', () => {
  it('Given real file, When loadKeywordsFromFile, Then returns keywords', () => {
    const kw = loadKeywordsFromFile();
    expect(kw).not.toBeNull();
    expect(kw!.blocked.length).toBeGreaterThan(0);
    expect(kw!.warn.length).toBeGreaterThan(0);
  });
});

describe('getPreUploadValidator singleton', () => {
  it('Given getPreUploadValidator, When called, Then returns instance', () => {
    const v = getPreUploadValidator();
    expect(v).toBeInstanceOf(PreUploadValidator);
  });

  it('Given inject, When getPreUploadValidator with inject, Then returns injected', () => {
    const custom = new PreUploadValidator(new PIIScrubber(), { blocked: [], warn: [] });
    const v = getPreUploadValidator(custom);
    expect(v).toBe(custom);
  });
});
