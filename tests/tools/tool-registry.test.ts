/**
 * tests/tools/tool-registry.test.ts — D65 + D68 ToolRegistry 测试
 *
 * D65 覆盖:
 * - register + invoke → 调用注册的tool函数
 * - invoke未注册的tool → 返回null
 * - register同名 → 后者覆盖前者
 * - list → 返回全部已注册工具
 *
 * D68 覆盖:
 * - validateAtomicity 3项全通过 → atomic=true
 * - validateAtomicity 缺失contractId → 条件1拒绝
 * - validateAtomicity <2个skills → 条件3拒绝
 * - invoke + PolicyEngine 允许 → 返回正常结果
 * - invoke + PolicyEngine 拒绝 → 返回POLICY_DENIED
 * - invoke 无policyEngine → 向后兼容正常工作
 * - getToolsBySkill → 返回匹配工具
 * - getToolsBySkill 空skills → 返回空数组
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ToolRegistry } from '../../src/tools/tool-registry';
import type { ToolPolicyEngine } from '../../src/tools/tool-registry';

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  // ═══ D65 回归测试 ═══

  it('register + invoke → 调用注册的tool函数', () => {
    registry.register({
      name: 'double',
      version: '1.0.0',
      description: 'Doubles a number',
      fn: (params) => {
        const n = params.n as number;
        return { result: n * 2 };
      },
      inputSchema: { n: 'number' },
      outputType: '{ result: number }',
    });

    const result = registry.invoke('double', { n: 5 });
    expect(result).toEqual({ result: 10 });
  });

  it('invoke未注册的tool → 返回null', () => {
    const result = registry.invoke('does-not-exist', {});
    expect(result).toBeNull();
  });

  it('register同名 → 后者覆盖前者', () => {
    registry.register({
      name: 'greet',
      version: '1.0.0',
      description: 'Greet v1',
      fn: () => 'hello',
      inputSchema: {},
      outputType: 'string',
    });
    registry.register({
      name: 'greet',
      version: '2.0.0',
      description: 'Greet v2',
      fn: () => 'hi there',
      inputSchema: {},
      outputType: 'string',
    });

    const result = registry.invoke('greet', {});
    expect(result).toBe('hi there');
  });

  it('list → 返回全部已注册工具', () => {
    registry.register({
      name: 'a', version: '1.0.0', description: '', fn: () => 1,
      inputSchema: {}, outputType: 'number',
    });
    registry.register({
      name: 'b', version: '1.0.0', description: '', fn: () => 2,
      inputSchema: {}, outputType: 'number',
    });

    expect(registry.list().length).toBe(2);
  });

  // ═══ D68 原子性验证 ═══

  describe('validateAtomicity', () => {
    it('3项条件全通过 → atomic=true', () => {
      const result = ToolRegistry.validateAtomicity({
        name: 'compute-break-even',
        version: '1.0.0',
        description: '盈亏平衡计算',
        fn: () => ({ bep: 100 }),
        inputSchema: { fixedCost: 'number', price: 'number' },
        outputType: 'BreakEvenResult',
        contractId: 'COMPUTE-BREAK-EVEN-v1',
        hasTests: true,
        skills: ['analyze-break-even', 'diagnose-cashflow-health', 'diagnose-margin-erosion'],
      });

      expect(result.atomic).toBe(true);
      expect(result.checks.hasContract).toBe(true);
      expect(result.checks.hasTests).toBe(true);
      expect(result.checks.reusedByMultiple).toBe(true);
    });

    it('缺失 contractId → 条件1拒绝', () => {
      const result = ToolRegistry.validateAtomicity({
        name: 'compute-x',
        version: '1.0.0',
        description: '无契约ID',
        fn: () => null,
        inputSchema: {},
        outputType: 'void',
        hasTests: true,
        skills: ['skill-a', 'skill-b'],
      });

      expect(result.atomic).toBe(false);
      expect(result.checks.hasContract).toBe(false);
      expect(result.details.some(d => d.includes('contractId'))).toBe(true);
    });

    it('skills < 2 → 条件3拒绝', () => {
      const result = ToolRegistry.validateAtomicity({
        name: 'compute-y',
        version: '1.0.0',
        description: '复用不足',
        fn: () => null,
        inputSchema: {},
        outputType: 'void',
        contractId: 'COMPUTE-Y-v1',
        hasTests: true,
        skills: ['only-one-skill'],
      });

      expect(result.atomic).toBe(false);
      expect(result.checks.reusedByMultiple).toBe(false);
    });

    it('hasTests=false → 条件2拒绝', () => {
      const result = ToolRegistry.validateAtomicity({
        name: 'compute-z',
        version: '1.0.0',
        description: '无可测试',
        fn: () => null,
        inputSchema: {},
        outputType: 'void',
        contractId: 'COMPUTE-Z-v1',
        hasTests: false,
        skills: ['skill-a', 'skill-b'],
      });

      expect(result.atomic).toBe(false);
      expect(result.checks.hasTests).toBe(false);
    });
  });

  // ═══ D68 PolicyEngine 门禁 ═══

  describe('PolicyEngine 门禁', () => {
    it('PolicyEngine 允许 → 返回正常结果', () => {
      const mockEngine: ToolPolicyEngine = {
        evaluate: () => ({ allow: true }),
      };
      registry.setPolicyEngine(mockEngine);

      registry.register({
        name: 'safe-tool',
        version: '1.0.0',
        description: '安全的工具',
        fn: () => 'allowed-result',
        inputSchema: {},
        outputType: 'string',
      });

      const result = registry.invoke('safe-tool', {}, {
        role: 'manager',
        dataLevel: 'S1',
        soi: 'graph.traverse',
      });

      expect(result).toBe('allowed-result');
    });

    it('PolicyEngine 拒绝 → 返回 {error: POLICY_DENIED}', () => {
      const mockEngine: ToolPolicyEngine = {
        evaluate: () => ({ allow: false, denyReason: 'deny_default: 无权限' }),
      };
      registry.setPolicyEngine(mockEngine);

      registry.register({
        name: 'restricted-tool',
        version: '1.0.0',
        description: '受限的工具',
        fn: () => 'secret-data',
        inputSchema: {},
        outputType: 'string',
      });

      const result = registry.invoke('restricted-tool', {}, {
        role: 'staff',
        dataLevel: 'S4',
        soi: 'graph.traverse',
      }) as Record<string, unknown>;

      expect(result?.error).toBe('POLICY_DENIED');
      expect(result?.denyReason).toBe('deny_default: 无权限');
    });

    it('未设置 PolicyEngine → 跳过权限检查，向后兼容', () => {
      registry.register({
        name: 'legacy-tool',
        version: '1.0.0',
        description: '旧版工具',
        fn: () => 'works',
        inputSchema: {},
        outputType: 'string',
      });

      // 没有 setPolicyEngine，直接调用应正常工作
      const result = registry.invoke('legacy-tool', {}, {
        role: 'staff',
        dataLevel: 'S4',
        soi: 'graph.traverse',
      });

      expect(result).toBe('works');
    });

    it('拒绝时审计日志被写入', async () => {
      const auditEntries: Array<Record<string, unknown>> = [];
      const mockAuditStore = {
        write: async (entry: Record<string, unknown>): Promise<string> => {
          auditEntries.push(entry);
          return 'audit-id-1';
        },
      };

      const mockEngine: ToolPolicyEngine = {
        evaluate: () => ({ allow: false, denyReason: 'deny_ga_write: GA不可写操作' }),
      };

      registry.setPolicyEngine(mockEngine);
      registry.setAuditStore(mockAuditStore as unknown as { write(entry: import('../../src/l4/audit-store').AuditEntryInput): Promise<string> });

      registry.register({
        name: 'write-tool',
        version: '1.0.0',
        description: '写操作工具',
        fn: () => 'data',
        inputSchema: {},
        outputType: 'string',
      });

      registry.invoke('write-tool', {}, {
        role: 'ga',
        dataLevel: 'S1',
        soi: 'ontology.write',
      });

      // 等待审计日志异步写入完成
      await new Promise(r => setTimeout(r, 50));

      expect(auditEntries.length).toBe(1);
      expect(auditEntries[0].action).toBe('tool.invoke.deny');
      expect(auditEntries[0].actorRole).toBe('ga');
      expect(auditEntries[0].targetId).toBe('write-tool');
    });
  });

  // ═══ D68 getToolsBySkill ═══

  describe('getToolsBySkill', () => {
    it('按 Skill 名称返回被复用的工具', () => {
      registry.register({
        name: 'compute-dol',
        version: '1.0.0', description: '', fn: () => ({}),
        inputSchema: {}, outputType: 'DOLResult',
        skills: ['analyze-operating-leverage', 'diagnose-cashflow-health', 'diagnose-margin-erosion'],
      });
      registry.register({
        name: 'compute-break-even',
        version: '1.0.0', description: '', fn: () => ({}),
        inputSchema: {}, outputType: 'BreakEvenResult',
        skills: ['analyze-break-even', 'diagnose-cashflow-health'],
      });
      registry.register({
        name: 'some-other-tool',
        version: '1.0.0', description: '', fn: () => ({}),
        inputSchema: {}, outputType: 'void',
        skills: ['unrelated-skill'],
      });

      const tools = registry.getToolsBySkill('diagnose-cashflow-health');
      expect(tools.length).toBe(2);
      expect(tools.map(t => t.name).sort()).toEqual(['compute-break-even', 'compute-dol']);
    });

    it('无匹配 → 返回空数组', () => {
      registry.register({
        name: 'tool-a',
        version: '1.0.0', description: '', fn: () => ({}),
        inputSchema: {}, outputType: 'void',
        skills: ['skill-x'],
      });

      const tools = registry.getToolsBySkill('nonexistent-skill');
      expect(tools.length).toBe(0);
    });

    it('工具无 skills 字段 → 不匹配', () => {
      registry.register({
        name: 'no-skills-tool',
        version: '1.0.0', description: '', fn: () => ({}),
        inputSchema: {}, outputType: 'void',
        // 不设置 skills 字段
      });

      const tools = registry.getToolsBySkill('any-skill');
      expect(tools.length).toBe(0);
    });
  });
});
