/**
 * tests/connectors/csv-import.test.ts — D221 CSV 导入连接器
 *
 * 覆盖: 正常导入 / 空文件 / 编码 / GraphStore 验证
 * 约束: ≥4测试 / 零as any
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { CsvImportConnector, type GraphBridgeLike } from '../../src/connectors/csv-import';

class MockGraphBridge implements GraphBridgeLike {
  public nodes: Array<{ type: string; props: Record<string, unknown>; graph: string }> = [];
  createNode(type: string, props: Record<string, unknown>, graph: string): string {
    const id = 'node-' + (this.nodes.length + 1);
    this.nodes.push({ type, props, graph });
    return id;
  }
}

const CSV_SAMPLE = `date,amount,category,description
2026-01-15,150000,revenue,Q1 订阅收入
2026-01-20,85000,cogs,服务器托管费
2026-02-01,20000,salary,研发团队工资
2026-02-15,-5000,marketing,广告投放`;

describe('D221 — CsvImportConnector', () => {
  let bridge: MockGraphBridge;
  let connector: CsvImportConnector;

  beforeEach(() => {
    bridge = new MockGraphBridge();
    connector = new CsvImportConnector(bridge);
  });

  it('正常 CSV → 导入 N 行 = 创建 N 个节点', () => {
    const result = connector.importData(CSV_SAMPLE);
    expect(result.imported).toBe(4);
    expect(result.nodeIds).toHaveLength(4);
    expect(result.degraded).toBe(false);
  });

  it('空 CSV → imported=0 + degraded', () => {
    const result = connector.importData('');
    expect(result.imported).toBe(0);
    expect(result.degraded).toBe(true);
  });

  it('仅表头无数据 → imported=0 + degraded', () => {
    const result = connector.importData('date,amount,category\n');
    expect(result.imported).toBe(0);
    expect(result.degraded).toBe(true);
  });

  it('GraphStore 中节点属性正确', () => {
    connector.importData(CSV_SAMPLE);
    expect(bridge.nodes).toHaveLength(4);
    expect(bridge.nodes[0].type).toBe('resource/money');
    expect(bridge.nodes[0].props.amount).toBe(150000);
    expect(bridge.nodes[0].props.category).toBe('revenue');
    expect(bridge.nodes[0].props.source).toBe('csv-import');
  });

  it('中文列名 → 正确映射', () => {
    const csv = '日期,金额,分类,备注\n2026-03-01,300000,revenue,测试';
    const result = connector.importData(csv);
    expect(result.imported).toBe(1);
    expect(bridge.nodes[0].props.date).toBe('2026-03-01');
    expect(bridge.nodes[0].props.amount).toBe(300000);
    expect(bridge.nodes[0].props.category).toBe('revenue');
  });

  it('不存在的文件 → degraded=true + imported=0', () => {
    const result = connector.import('/nonexistent/file.csv');
    expect(result.imported).toBe(0);
    expect(result.degraded).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
