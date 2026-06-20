import { describe, it, expect } from 'vitest';
describe('department-workspace', () => { it('模块加载成功', async () => { const mod = await import('../../src/routes/department-workspace'); expect(mod).toBeDefined(); }); });
