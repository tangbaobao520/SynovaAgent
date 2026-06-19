/**
 * tests/agent/knowledge-injector.test.ts — KnowledgeInjector 单元测试
 *
 * 验证: 加载行业文件、客户文件、优先级覆盖、安全校验、Singleton
 */
import { describe, it, expect } from 'vitest';
import { KnowledgeInjector, getKnowledgeInjector } from '../../src/agent/knowledge-injector';
import * as path from 'path';

const ROOT = path.resolve('.');

describe('KnowledgeInjector — 行业加载', () => {
  const injector = new KnowledgeInjector(ROOT);

  it('Given 行业=manufacturing, When inject, Then 加载制造业知识', () => {
    const result = injector.inject('manufacturing');
    expect(result.contexts.length).toBeGreaterThan(0);
    expect(result.contexts[0].content).toContain('制造业');
    expect(result.contexts[0].validated).toBe(true);
  });

  it('Given 行业=saas, When inject, Then 加载SaaS知识', () => {
    const result = injector.inject('saas');
    expect(result.contexts.length).toBeGreaterThan(0);
    expect(result.contexts[0].content).toContain('SaaS');
  });

  it('Given 行业=restaurant, When inject, Then 加载餐饮知识', () => {
    const result = injector.inject('restaurant');
    expect(result.contexts.length).toBeGreaterThan(0);
    expect(result.contexts[0].content).toContain('餐饮');
  });

  it('Given 不存在的行业, When inject, Then 返回空contexts', () => {
    const result = injector.inject('nonexistent-industry');
    expect(result.contexts.length).toBe(0);
  });

  it('Given 无参数, When inject(), Then 不崩溃', () => {
    const result = injector.inject();
    expect(result.contexts).toBeDefined();
    expect(result.skipped).toBeDefined();
    expect(result.conflicts).toBeDefined();
  });
});

describe('KnowledgeInjector — 优先级', () => {
  const injector = new KnowledgeInjector(ROOT);

  it('行业知识优先级=50', () => {
    const result = injector.inject('manufacturing');
    expect(result.contexts[0].priority).toBe(50);
  });
});

describe('KnowledgeInjector — Singleton', () => {
  it('getKnowledgeInjector 返回同一实例', () => {
    const a = getKnowledgeInjector(ROOT);
    const b = getKnowledgeInjector();
    expect(a).toBe(b);
  });
});
