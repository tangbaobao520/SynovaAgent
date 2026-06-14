/**
 * expert-registry.test.ts — Slice 0-1: ExpertRegistry prompt 独立性验证
 *
 * 验证: 每位专家拥有独立的系统提示词，不再共享模板。
 *       每位专家的 prompt 必须包含: 身份 + 核心框架 + 四档节奏 + 不可做的事。
 *
 * Given/When/Then 格式。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { getExpertRegistry, ExpertRegistry } from '../src/l3/expert-registry';

describe('ExpertRegistry prompt independence', () => {

  let registry: ExpertRegistry;

  beforeEach(() => {
    registry = getExpertRegistry();
  });

  // ── 每个专家必须有独立的 prompt ──

  it('strategy expert prompt should contain its own methodology', () => {
    const prompt = registry.getPrompt('strategy');
    expect(prompt).toBeDefined();
    expect(prompt).toContain('三层战略诊断');
    expect(prompt).toContain('四档节奏');
    expect(prompt).toContain('不可做的事');
  });

  it('org expert prompt should contain its own methodology', () => {
    const prompt = registry.getPrompt('org');
    expect(prompt).toBeDefined();
    expect(prompt).toContain('传统组织诊断');
    expect(prompt).toContain('Agent化机会识别');
    expect(prompt).toContain('四档节奏');
    expect(prompt).toContain('不可做的事');
  });

  it('finance expert prompt should contain its own methodology', () => {
    const prompt = registry.getPrompt('finance');
    expect(prompt).toBeDefined();
    expect(prompt).toContain('现金流健康分析');
    expect(prompt).toContain('分析时遵守的会计框架');
    expect(prompt).toContain('四档节奏');
    expect(prompt).toContain('不可做的事');
  });

  it('marketing expert prompt should contain its own methodology', () => {
    const prompt = registry.getPrompt('marketing');
    expect(prompt).toBeDefined();
    expect(prompt).toContain('JTBD');
    expect(prompt).toContain('定价策略');
    expect(prompt).toContain('四档节奏');
    expect(prompt).toContain('不可做的事');
  });

  // ── 每个专家的 prompt 不能是相同的模板 ──

  it('each expert prompt should be distinct from others', () => {
    const strategy = registry.getPrompt('strategy');
    const org = registry.getPrompt('org');
    const finance = registry.getPrompt('finance');
    const marketing = registry.getPrompt('marketing');

    // 每个 prompt 的身份声明行应该不同（第二行，第一行是"## 身份"）
    const identityLines = [strategy, org, finance, marketing]
      .map(p => p?.split('\n')[1]);
    const uniqueLines = new Set(identityLines);
    expect(uniqueLines.size).toBe(4);
  });

  // ── 降级处理 ──

  it('strategy expert prompt should include data insufficiency handling', () => {
    const prompt = registry.getPrompt('strategy');
    expect(prompt).toContain('数据不足');
  });

  it('finance expert prompt should forbid fabricating numbers', () => {
    const prompt = registry.getPrompt('finance');
    expect(prompt).toContain('不编造');
  });

  // ── 扩展性：运行时注册 ──

  it('should support runtime registration of new expert types', () => {
    registry.register('legal', '你是法律合规专家。');
    expect(registry.getPrompt('legal')).toBe('你是法律合规专家。');
    expect(registry.listTypes()).toContain('legal');
  });

  it('should not remove default expert types', () => {
    registry.unregister('strategy');
    expect(registry.getPrompt('strategy')).toBeDefined();
  });
});
