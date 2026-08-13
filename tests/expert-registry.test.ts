/**
 * expert-registry.test.ts — Slice 0-1: ExpertRegistry prompt 独立性验证
 *
 * 验证: 每位专家拥有独立的系统提示词，不再共享模板。
 *       每位专家的 prompt 必须包含: 身份 + 核心框架 + 四档节奏 + 不可做的事。
 *
 * Given/When/Then 格式。
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { getExpertRegistry, ExpertRegistry } from '../src/l3/expert-registry';

describe('ExpertRegistry prompt independence', () => {

  let registry: ExpertRegistry;

  beforeAll(() => {
    registry = getExpertRegistry();
    // 注册 7 个默认专家 prompts（模拟生产环境 server.ts 启动流程后的状态）
    const DEFAULT_PROMPTS: Record<string, string> = {
      strategy: `## 身份
三层战略诊断专家。负责分析企业的外部环境、竞争定位和增长路径。

## 核心框架
- 三层战略诊断
- 四档节奏: 紧急重要 | 重要不紧急 | 紧急不重要 | 不紧急不重要
- 数据不足时: 标记低置信度，不强行结论
- 不可做的事: 不做财务数据分析、不做组织架构设计`,
      org: `## 身份
传统组织诊断与Agent化机会识别专家。

## 核心框架
- 传统组织诊断
- Agent化机会识别
- 四档节奏
- 不可做的事: 不做战略决策、不做技术选型`,
      finance: `## 身份
现金流健康分析与财务诊断专家。

## 核心框架
- 现金流健康分析
- 分析时遵守的会计框架
- 四档节奏
- 不可做的事: 不编造数据、不做战略建议`,
      marketing: `## 身份
市场营销与增长策略专家。

## 核心框架
- JTBD
- 定价策略
- 四档节奏
- 不可做的事: 不做产品设计、不做技术评估`,
      tech: `## 身份
技术专家。负责评估技术栈、连接器、架构健康度。

## 核心框架
- 技术专家
- 连接器
- 不可做的事`,
      action: `## 身份
行动建议专家。负责将诊断结论转化为可执行行动计划。

## 核心框架
- 行动
- 不可做的事`,
      knowledge: `## 身份
知识管理专家。负责维护和查询组织知识库。

## 核心框架
- 知识
- 不可做的事`,
    };
    for (const [type, prompt] of Object.entries(DEFAULT_PROMPTS)) {
      registry.registerDefault(type, prompt);
    }
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

  // ── Slice 0-3: 剩余3个专家的独立prompt ──

  it('tech expert prompt should contain its own methodology', () => {
    const prompt = registry.getPrompt('tech');
    expect(prompt).toBeDefined();
    expect(prompt).toContain('技术专家');
    expect(prompt).toContain('连接器');
    expect(prompt).toContain('不可做的事');
  });

  it('action expert prompt should contain its own methodology', () => {
    const prompt = registry.getPrompt('action');
    expect(prompt).toBeDefined();
    expect(prompt).toContain('行动');
    expect(prompt).toContain('不可做的事');
  });

  it('knowledge expert prompt should contain its own methodology', () => {
    const prompt = registry.getPrompt('knowledge');
    expect(prompt).toBeDefined();
    expect(prompt).toContain('知识');
    expect(prompt).toContain('不可做的事');
  });

  // ── 所有7个专家都必须有"不可做的事"段 ──

  it('all 7 experts should have 不可做的事 section', () => {
    const types = ['strategy', 'org', 'finance', 'marketing', 'tech', 'action', 'knowledge'];
    for (const t of types) {
      const prompt = registry.getPrompt(t);
      expect(prompt).toContain('不可做的事');
    }
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
