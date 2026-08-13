/**
 * tests/tools/expert-tools-d234.test.ts — D234 专家工具补齐
 *
 * 验证 business_model + knowledge ToolDefinition 结构和 handler 调用
 */
import { describe, it, expect } from 'vitest';
import { BUSINESS_MODEL_EXPERT_TOOLS } from '../../src/tools/business_model-expert-tools';
import { KNOWLEDGE_EXPERT_TOOLS } from '../../src/tools/knowledge-expert-tools';

describe('D234 — BUSINESS_MODEL_EXPERT_TOOLS', () => {
  it('有 >=2 个工具', () => {
    expect(BUSINESS_MODEL_EXPERT_TOOLS.length).toBeGreaterThanOrEqual(2);
  });

  it('每个 ToolDefinition 结构完整', () => {
    for (const tool of BUSINESS_MODEL_EXPERT_TOOLS) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.parameters).toBeDefined();
      expect(typeof tool.handler).toBe('function');
    }
  });

  it('handler 基本调用返回非空', async () => {
    const result = await BUSINESS_MODEL_EXPERT_TOOLS[0].handler({ orgId: 'test-org' });
    expect(result).toBeDefined();
    expect(typeof result).toBe('object');
  });
});

describe('D234 — KNOWLEDGE_EXPERT_TOOLS', () => {
  it('有 >=2 个工具', () => {
    expect(KNOWLEDGE_EXPERT_TOOLS.length).toBeGreaterThanOrEqual(2);
  });

  it('每个 ToolDefinition 结构完整', () => {
    for (const tool of KNOWLEDGE_EXPERT_TOOLS) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.parameters).toBeDefined();
      expect(typeof tool.handler).toBe('function');
    }
  });

  it('handler 基本调用返回非空', async () => {
    const result = await KNOWLEDGE_EXPERT_TOOLS[0].handler({ sourceType: 'document' });
    expect(result).toBeDefined();
    expect(typeof result).toBe('object');
  });
});

describe('D234 — tools/index.ts 注册', () => {
  it('index.ts 导出 BUSINESS_MODEL', async () => {
    const idx = await import('../../src/tools/index');
    expect(idx.BUSINESS_MODEL_EXPERT_TOOLS).toBeDefined();
  });
  it('index.ts 导出 KNOWLEDGE', async () => {
    const idx = await import('../../src/tools/index');
    expect(idx.KNOWLEDGE_EXPERT_TOOLS).toBeDefined();
  });
});
