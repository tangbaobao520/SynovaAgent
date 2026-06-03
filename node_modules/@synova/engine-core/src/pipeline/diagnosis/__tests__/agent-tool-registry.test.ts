/**
 * agent-tool-registry.test.ts — Agent 工具注册表单元测试
 */

import {
  registerTool,
  registerTools,
  getTool,
  listTools,
  listToolNames,
  toolCount,
  hasTool,
  executeTool,
} from '../agent-tool-registry';
import type { AgentTool, AgentToolContext } from '../agent-tool-registry';

const CTX: AgentToolContext = { teamId: 'test-team', phase: 2 };

function makeTool(overrides: Partial<AgentTool> = {}): AgentTool {
  return {
    name: overrides.name ?? 'test_tool',
    description: 'A test tool',
    inputSchema: { type: 'object', properties: {} },
    permission: 'read',
    allowedPhases: [2, 5],
    sourceModule: 'test',
    async execute(_input, _ctx) {
      return { content: JSON.stringify({ ok: true }) };
    },
    ...overrides,
  };
}

// Clear registry between tests — each test unregisters what it creates
afterEach(() => {
  // We can't easily clear the auto-registered tools without a clear() function,
  // so tests rely on unique names to avoid collisions
});

// ====================================================================
// Registration
// ====================================================================

describe('AgentToolRegistry — registration', () => {
  const UNIQUE = `test_reg_${Date.now()}`;

  it('registers a single tool and retrieves it', () => {
    registerTool(makeTool({ name: UNIQUE }));
    expect(hasTool(UNIQUE)).toBe(true);
    expect(getTool(UNIQUE)?.name).toBe(UNIQUE);
  });

  it('registerTools adds multiple tools', () => {
    const names = [`${UNIQUE}_a`, `${UNIQUE}_b`, `${UNIQUE}_c`];
    registerTools(names.map(n => makeTool({ name: n })));
    for (const n of names) expect(hasTool(n)).toBe(true);
    expect(hasTool(`${UNIQUE}_a`)).toBe(true);
  });

  it('registering with the same name replaces the old tool', () => {
    const name = `${UNIQUE}_replace`;
    registerTool(makeTool({ name, permission: 'read' }));
    registerTool(makeTool({ name, permission: 'admin' }));
    expect(getTool(name)?.permission).toBe('admin');
  });

  it('getTool returns undefined for unknown name', () => {
    expect(getTool(`nonexistent_${UNIQUE}`)).toBeUndefined();
  });

  it('hasTool returns false for unknown name', () => {
    expect(hasTool(`nonexistent_${UNIQUE}`)).toBe(false);
  });
});

// ====================================================================
// Listing & filtering
// ====================================================================

describe('AgentToolRegistry — listing & filtering', () => {
  const UNIQUE = `test_list_${Date.now()}`;

  beforeAll(() => {
    registerTools([
      makeTool({ name: `${UNIQUE}_p2`, allowedPhases: [2] }),
      makeTool({ name: `${UNIQUE}_p5`, allowedPhases: [5] }),
      makeTool({ name: `${UNIQUE}_p25`, allowedPhases: [2, 5] }),
      makeTool({ name: `${UNIQUE}_all`, allowedPhases: [] }),
    ]);
  });

  it('listTools without phase returns all tools', () => {
    const all = listTools();
    expect(all.length).toBeGreaterThanOrEqual(4);
    const ours = all.filter(t => t.name.startsWith(UNIQUE));
    expect(ours.length).toBe(4);
  });

  it('listTools with phase=2 filters correctly', () => {
    const tools = listTools(2);
    const ours = tools.filter(t => t.name.startsWith(UNIQUE));
    expect(ours.map(t => t.name).sort()).toEqual([
      `${UNIQUE}_all`,
      `${UNIQUE}_p2`,
      `${UNIQUE}_p25`,
    ].sort());
  });

  it('listTools with phase=5 filters correctly', () => {
    const tools = listTools(5);
    const ours = tools.filter(t => t.name.startsWith(UNIQUE));
    expect(ours.map(t => t.name).sort()).toEqual([
      `${UNIQUE}_all`,
      `${UNIQUE}_p25`,
      `${UNIQUE}_p5`,
    ].sort());
  });

  it('listToolNames returns string array', () => {
    const names = listToolNames();
    expect(Array.isArray(names)).toBe(true);
    expect(names.every(n => typeof n === 'string')).toBe(true);
  });

  it('tools with empty allowedPhases are available in all phases', () => {
    const tools = listTools(2);
    const allPhasesTool = tools.find(t => t.name === `${UNIQUE}_all`);
    expect(allPhasesTool).toBeDefined();
  });

  it('toolCount returns the total number of registered tools', () => {
    expect(toolCount()).toBeGreaterThanOrEqual(4);
  });
});

// ====================================================================
// Execution
// ====================================================================

describe('AgentToolRegistry — execution', () => {
  const UNIQUE = `test_exec_${Date.now()}`;

  beforeAll(() => {
    registerTool(makeTool({
      name: UNIQUE,
      async execute(_input, ctx) {
        return { content: JSON.stringify({ teamId: ctx.teamId, phase: ctx.phase }) };
      },
    }));
  });

  it('executeTool calls the tool and returns its output', async () => {
    const result = await executeTool(UNIQUE, {}, CTX);
    expect(result).toHaveProperty('content');
    const parsed = JSON.parse(result.content);
    expect(parsed.teamId).toBe('test-team');
    expect(parsed.phase).toBe(2);
  });

  it('executeTool returns error for unknown tool', async () => {
    const result = await executeTool(`unknown_${UNIQUE}`, {}, CTX);
    const parsed = JSON.parse(result.content);
    expect(parsed.error).toBeDefined();
  });

  it('executeTool catches tool execution errors and returns error content', async () => {
    const failName = `${UNIQUE}_fail`;
    registerTool(makeTool({
      name: failName,
      async execute() {
        throw new Error('boom');
      },
    }));
    const result = await executeTool(failName, {}, CTX);
    const parsed = JSON.parse(result.content);
    expect(parsed.error).toBeDefined();
    expect(parsed.error).toContain('boom');
  });
});

// ====================================================================
// Auto-registered built-in tools
// ====================================================================

describe('AgentToolRegistry — auto-registered tools', () => {
  it('all 22 diagnostic modules are registered as tools', () => {
    const all = listTools();
    const diagTools = all.filter(t => t.name.startsWith('diagnose_'));
    expect(diagTools.length).toBeGreaterThanOrEqual(22);
  });

  it('all 3 FDE tools are registered', () => {
    expect(hasTool('generate_multi_role_narrative')).toBe(true);
    expect(hasTool('generate_action_plan')).toBe(true);
    expect(hasTool('push_action_items')).toBe(true);
  });

  it('each diagnostic tool has expected metadata', () => {
    const tool = getTool('diagnose_gaps');
    expect(tool).toBeDefined();
    expect(tool!.permission).toBe(5); // P0 → DiagnosisPermissionLevel.ADMIN_ONLY
    expect(tool!.allowedPhases).toContain(2);
    expect(tool!.inputSchema).toHaveProperty('type', 'object');
  });

  it('P2 modules have read permission', () => {
    const tool = getTool('diagnose_benchmark');
    expect(tool).toBeDefined();
    expect(tool!.permission).toBe(0); // P2 → DiagnosisPermissionLevel.EVERYONE
  });

  it('push_action_items has execute permission', () => {
    const tool = getTool('push_action_items');
    expect(tool).toBeDefined();
    expect(tool!.permission).toBe(1); // push → DiagnosisPermissionLevel.ORG_MEMBER
  });

  it('FDE narrative tool has allowedPhases [2, 5]', () => {
    const tool = getTool('generate_multi_role_narrative');
    expect(tool!.allowedPhases).toEqual([2, 5]);
  });

  it('push_action_items is only available in phase 5', () => {
    const tool = getTool('push_action_items');
    expect(tool!.allowedPhases).toEqual([5]);
  });
});
