import { describe, it, expect } from 'vitest';
describe('workspace-service', () => { it('模块加载成功', async () => { const mod = await import('../../src/agent/workspace-service'); expect(mod).toBeDefined(); }); });
