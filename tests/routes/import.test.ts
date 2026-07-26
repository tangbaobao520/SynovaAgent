/**
 * tests/routes/import.test.ts — D231 数据导入 API
 */
import { describe, it, expect } from 'vitest';
import { CsvImportConnector } from '../../src/connectors/csv-import';

describe('D231 — CsvImportConnector', () => {
  it('正常 CSV → 返回 imported>0', () => {
    const bridge = { createNode: () => 'node-1', nodes: [] as any[] };
    const c = new CsvImportConnector(bridge as any);
    const r = c.importData('date,amount\n2026-01-01,1000\n2026-01-15,2000');
    expect(r.imported).toBe(2);
    expect(r.nodeIds).toHaveLength(2);
    expect(r.degraded).toBe(false);
  });

  it('空内容 → imported=0 + degraded', () => {
    const bridge = { createNode: () => '', nodes: [] as any[] };
    const c = new CsvImportConnector(bridge as any);
    const r = c.importData('');
    expect(r.imported).toBe(0);
    expect(r.degraded).toBe(true);
  });

  it('路由文件导出 router', async () => {
    const mod = await import('../../src/routes/import');
    expect(mod.default).toBeDefined();
    expect(typeof mod.setGraphBridge).toBe('function');
  });
});
