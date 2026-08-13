/**
 * tests/growth/skill-knowledge.test.ts — D63 SKILL pull-mode 测试
 */
import { describe, it, expect, vi } from 'vitest';

describe('SKILL_ENTRIES — 4个SKILL知识条目', () => {
  it('有4个SKILL条目', async () => {
    const { SKILL_ENTRIES } = await import('../../src/growth/skill-knowledge');
    expect(SKILL_ENTRIES).toHaveLength(4);
    const names = SKILL_ENTRIES.map((e) => e.name);
    expect(names).toContain('me_pricing_strategy');
    expect(names).toContain('me_cost_structure');
    expect(names).toContain('me_market_power');
    expect(names).toContain('me_investment_decision');
  });

  it('每个SKILL有内容+触发条件+目标专家', async () => {
    const { SKILL_ENTRIES } = await import('../../src/growth/skill-knowledge');
    for (const entry of SKILL_ENTRIES) {
      expect(entry.content.length).toBeGreaterThan(50);
      expect(entry.triggerConditions.length).toBeGreaterThan(0);
      expect(entry.targetExpert).toBeTruthy();
      expect(['P0', 'P1', 'P2']).toContain(entry.priority);
    }
  });
});

describe('seedSkillKnowledge — SKILL播种', () => {
  it('成功写入4个SKILL条目', async () => {
    const { seedSkillKnowledge } = await import('../../src/growth/skill-knowledge');
    const mockStore = {
      insert: vi.fn().mockReturnValue('id_1'),
      db: {
        prepare: vi.fn().mockReturnValue({ run: vi.fn() }),
      },
    };
    const count = seedSkillKnowledge(mockStore as never);
    expect(count).toBe(4);
    expect(mockStore.insert).toHaveBeenCalledTimes(4);
  });

  it('写入失败时降级返回部分计数', async () => {
    const { seedSkillKnowledge } = await import('../../src/growth/skill-knowledge');
    let callCount = 0;
    const mockStore = {
      insert: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 2) throw new Error('DB error');
        return `id_${callCount}`;
      }),
      db: {
        prepare: vi.fn().mockReturnValue({ run: vi.fn() }),
      },
    };
    const count = seedSkillKnowledge(mockStore as never);
    expect(count).toBe(3); // 4 total, 1 fails → 3 succeed
  });
});

describe('registerToolQueryKnowledge — 工具注册', () => {
  it('注册tool_query_knowledge', async () => {
    const { registerToolQueryKnowledge } = await import('../../src/growth/skill-knowledge');
    const registry = { register: vi.fn() };
    const store = { getBySkill: vi.fn().mockReturnValue([]) };
    registerToolQueryKnowledge(registry as never, store as never);
    expect(registry.register).toHaveBeenCalledOnce();
    const toolDef = registry.register.mock.calls[0][0];
    expect(toolDef.name).toBe('tool_query_knowledge');
    expect(toolDef.parameters.properties.skill_name.enum).toHaveLength(4);
  });

  it('handler 返回知识内容', async () => {
    const { registerToolQueryKnowledge } = await import('../../src/growth/skill-knowledge');
    const registry = { register: vi.fn() };
    const mockFragments = [{ text: '定价策略知识', sourceType: 'skill_knowledge' }];
    const store = { getBySkill: vi.fn().mockReturnValue(mockFragments) };
    registerToolQueryKnowledge(registry as never, store as never);
    const handler = registry.register.mock.calls[0][0].handler;
    const result = await handler({ skill_name: 'me_pricing_strategy' });
    expect(result.ok).toBe(true);
    expect(result.results).toHaveLength(1);
  });
});

describe('KnowledgeStore.getBySkill — PKB查询', () => {
  it('getBySkill 在 prototype 上存在', async () => {
    const { KnowledgeStore } = await import('../../src/l4/knowledge-store');
    // 不实例化（需要 DB），只验证原型方法存在
    const proto = Object.getOwnPropertyDescriptor(KnowledgeStore.prototype, 'getBySkill');
    expect(proto).toBeDefined();
    expect(typeof proto!.value).toBe('function');
  });
});
