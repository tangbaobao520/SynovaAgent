/**
 * fde-toolset.test.ts — FDE Agent 工具集测试
 */

import {
  FDE_TOOLS,
  getFdeTool,
  createFdeToolExecutor,
  listFdeToolDescriptions,
} from '../fde-toolset';
import type { FullDiagnosisV2 } from '../types';

function makeDiagnosis(overrides: Partial<FullDiagnosisV2> = {}): FullDiagnosisV2 {
  return {
    teamId: 'test-team',
    generatedAt: new Date().toISOString(),
    gaps: {
      gaps: {
        'information_flow': { engineScore: 0.3, confidence: 'high', mode: 'star' },
        'authority_governance': { engineScore: 0.4, confidence: 'medium', mode: 'lattice' },
        'trust_incentive': { engineScore: 0.5, confidence: 'high', mode: 'mesh' },
        'division_of_labor': { engineScore: 0.6, confidence: 'low', mode: 'adhoc' },
        'knowledge_sharing': { engineScore: 0.45, confidence: 'low', mode: 'broadcast' },
        'external_interface': { engineScore: 0.7, confidence: 'high', mode: 'hub' },
      },
    } as FullDiagnosisV2['gaps'],
    dynamics: {
      overallChangeRate: 0.15,
      stickyDimensions: [],
      phaseCoupling: [],
    } as FullDiagnosisV2['dynamics'],
    identity: {
      primaryAnchor: '协作创新',
      markers: ['创新', '开放', '扁平'],
    } as FullDiagnosisV2['identity'],
    selfAwareness: {
      overallGap: 0.2,
      interpretation: '轻微偏差',
      deltas: [{ dimension: 'information_flow', delta: 0.1, perception: '', reality: '' }],
      significantDimensions: [{ dimension: 'information_flow', delta: 0.1 }],
    } as unknown as FullDiagnosisV2['selfAwareness'],
    degradedModules: [],
    ...overrides,
  } as FullDiagnosisV2;
}

describe('fde-toolset', () => {
  describe('tool definitions', () => {
    it('has 3 tools registered', () => {
      expect(FDE_TOOLS).toHaveLength(3);
    });

    it('each tool has required fields', () => {
      for (const tool of FDE_TOOLS) {
        expect(tool.name).toBeTruthy();
        expect(tool.description).toBeTruthy();
        expect(tool.inputSchema).toBeTruthy();
        expect(typeof tool.execute).toBe('function');
      }
    });

    it('tool names match expected FDE modules', () => {
      const names = FDE_TOOLS.map(t => t.name);
      expect(names).toContain('generate_multi_role_narrative');
      expect(names).toContain('generate_action_plan');
      expect(names).toContain('push_action_items');
    });

    it('input schemas are valid JSON Schema objects', () => {
      for (const tool of FDE_TOOLS) {
        expect(tool.inputSchema.type).toBe('object');
        expect(tool.inputSchema.properties).toBeDefined();
      }
    });
  });

  describe('getFdeTool', () => {
    it('returns tool by name', () => {
      const tool = getFdeTool('generate_action_plan');
      expect(tool).toBeDefined();
      expect(tool!.name).toBe('generate_action_plan');
    });

    it('returns undefined for unknown tool', () => {
      expect(getFdeTool('nonexistent')).toBeUndefined();
    });
  });

  describe('listFdeToolDescriptions', () => {
    it('returns markdown list with all 3 tools', () => {
      const desc = listFdeToolDescriptions();
      expect(desc).toContain('generate_multi_role_narrative');
      expect(desc).toContain('generate_action_plan');
      expect(desc).toContain('push_action_items');
      expect(desc.split('\n').filter(l => l.startsWith('- '))).toHaveLength(3);
    });
  });

  describe('createFdeToolExecutor', () => {
    const diag = makeDiagnosis();

    it('returns an execute function', () => {
      const executor = createFdeToolExecutor(diag, 'test-team');
      expect(typeof executor.execute).toBe('function');
    });

    it('returns error for unknown tool name', async () => {
      const executor = createFdeToolExecutor(diag, 'test-team');
      const result = await executor.execute('unknown_tool', '{}');
      const parsed = JSON.parse(result.content);
      expect(parsed.error).toContain('未知工具');
      expect(parsed.availableTools).toHaveLength(3);
    });

    it('returns error for invalid JSON input', async () => {
      const executor = createFdeToolExecutor(diag, 'test-team');
      const result = await executor.execute('generate_action_plan', 'not valid json');
      const parsed = JSON.parse(result.content);
      expect(parsed.error).toContain('JSON');
    });

    it('executes generate_action_plan with rule-based items', async () => {
      // Given: diagnosis with star-mode information flow (triggers info-flow-star rule)
      const executor = createFdeToolExecutor(diag, 'test-team');
      const result = await executor.execute('generate_action_plan', '{"minPriority":"high"}');
      const parsed = JSON.parse(result.content);

      expect(parsed.itemCount).toBeGreaterThan(0);
      expect(parsed.items.every((i: { priority: string }) =>
        ['critical', 'high'].includes(i.priority),
      )).toBe(true);
      expect(parsed.teamId).toBe('test-team');
    });

    it('respects minPriority filter', async () => {
      const executor = createFdeToolExecutor(diag, 'test-team');
      const result = await executor.execute('generate_action_plan', '{"minPriority":"critical"}');
      const parsed = JSON.parse(result.content);

      expect(parsed.items.every((i: { priority: string }) =>
        i.priority === 'critical',
      )).toBe(true);
    });

    it('generate_action_plan includes includeNarrative option', async () => {
      const executor = createFdeToolExecutor(diag, 'test-team');
      // includeNarrative=true triggers extra LLM call; just verify it doesn't crash
      const result = await executor.execute('generate_action_plan', '{"includeNarrative":true,"minPriority":"critical"}');
      const parsed = JSON.parse(result.content);
      expect(parsed.itemCount).toBeGreaterThanOrEqual(0);
    }, 15000);

    it('generate_multi_role_narrative returns structured narrative', async () => {
      const executor = createFdeToolExecutor(diag, 'test-team');
      const result = await executor.execute('generate_multi_role_narrative', '{}');
      const parsed = JSON.parse(result.content);

      // Should have three roles (or fallback if LLM fails)
      expect(parsed.ceoSummary).toBeDefined();
      expect(parsed.teamLeadGuidance).toBeDefined();
      expect(parsed.hrBPActionItems).toBeDefined();
    }, 15000);

    it('push_action_items handles manual items gracefully', async () => {
      const executor = createFdeToolExecutor(diag, 'test-team');
      const result = await executor.execute('push_action_items', JSON.stringify({
        actionItems: [
          {
            title: '测试手动任务',
            priority: 'medium',
            targetSystem: 'manual',
            description: '手动执行的测试任务',
          },
        ],
      }));
      const parsed = JSON.parse(result.content);

      // manual items → all skipped
      expect(parsed.created).toHaveLength(0);
      expect(parsed.skipped.length).toBeGreaterThanOrEqual(1);
      expect(parsed.summary).toContain('跳过');
    });

    it('push_action_items skips jira items when not configured', async () => {
      const executor = createFdeToolExecutor(diag, 'test-team');
      const result = await executor.execute('push_action_items', JSON.stringify({
        actionItems: [
          {
            title: '需要推送到 Jira 的任务',
            priority: 'high',
            targetSystem: 'jira',
            description: '集成测试',
            suggestion: '请手动创建',
            sourceModule: 'test',
            sourceDimension: 'test',
          },
        ],
      }));
      const parsed = JSON.parse(result.content);
      // No Jira config → skipped
      expect(parsed.skipped.length).toBeGreaterThanOrEqual(1);
    });
  });
});
