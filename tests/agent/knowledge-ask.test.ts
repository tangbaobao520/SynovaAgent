import { describe, it, expect } from 'vitest';
describe('knowledge-ask', () => { it('模块加载成功', async () => { const mod = await import('../../src/agent/knowledge-ask'); expect(mod).toBeDefined(); }); });
