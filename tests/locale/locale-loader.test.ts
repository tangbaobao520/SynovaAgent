/**
 * tests/locale/locale-loader.test.ts
 * v3.6 Batch 1 — locale loader 单元测试
 */
import { describe, it, expect } from 'vitest';
import { loadLocale, t, reloadLocale } from '../../src/locale/locale-loader';

describe('loadLocale', () => {
  it('加载 zh-CN locale 返回非空 strings', () => {
    const { locale, degraded, errors } = loadLocale('zh-CN');
    expect(locale.language).toBe('zh-CN');
    expect(Object.keys(locale.ui).length).toBeGreaterThan(0);
    expect(degraded).toBe(false);
    expect(errors.length).toBe(0);
  });

  it('加载 en-US locale 返回非空 strings', () => {
    const { locale, degraded } = loadLocale('en-US');
    expect(locale.language).toBe('en-US');
    expect(Object.keys(locale.ui).length).toBeGreaterThan(0);
    expect(degraded).toBe(false);
  });

  it('不存在的语言 fallback 到 zh-CN', () => {
    const { locale } = loadLocale('fr-FR');
    expect(locale.language).toBe('zh-CN');
  });

  it('第二次调用返回缓存', () => {
    const r1 = loadLocale('zh-CN');
    const r2 = loadLocale('zh-CN');
    expect(r1.locale).toBe(r2.locale); // same object reference (cached)
  });
});

describe('t (translate)', () => {
  it('ui string 直接查找', () => {
    const { locale } = loadLocale('zh-CN');
    expect(t('report.title', locale)).toBe('Synova 组织诊断报告');
  });

  it('reportLabels 深层查找', () => {
    const { locale } = loadLocale('zh-CN');
    expect(t('sections.ceo_summary', locale)).toBe('CEO 摘要');
  });

  it('不存在的 key 返回 fallback', () => {
    const { locale } = loadLocale('zh-CN');
    expect(t('nonexistent.key', locale, 'fallback')).toBe('fallback');
  });

  it('不存在的 key 无 fallback 返回 key 本身', () => {
    const { locale } = loadLocale('zh-CN');
    expect(t('nonexistent', locale)).toBe('nonexistent');
  });
});
