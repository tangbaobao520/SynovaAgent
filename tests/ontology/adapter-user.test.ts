/**
 * tests/ontology/adapter-user.test.ts — D107 本体适配器 User 节点
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

describe('D107 — SOGNodeType.RESOURCE_USER', () => {
  it('RESOURCE_USER 在枚举中定义', () => {
    const content = readFileSync('packages/sog-core/src/sog-core-schema.ts', 'utf-8');
    expect(content).toContain('RESOURCE_USER');
    expect(content).toContain("'resource/user'");
  });

  it('RESOURCE_USER 验证器存在', () => {
    const content = readFileSync('packages/sog-core/src/sog-core-schema.ts', 'utf-8');
    expect(content).toContain('RESOURCE_USER');
    expect(content).toContain('hasString(p,');
  });
});
