import { describe, it, expect } from 'vitest';
describe('boss-mailbox', () => { it('模块加载成功', async () => { const mod = await import('../../src/agent/boss-mailbox'); expect(mod).toBeDefined(); }); });
