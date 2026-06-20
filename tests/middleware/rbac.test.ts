import { describe, it, expect } from 'vitest';
describe('rbac', () => { it('模块加载成功', async () => { const mod = await import('../../src/middleware/rbac'); expect(mod).toBeDefined(); }); });
