/**
 * api-coverage/api-coverage.test.ts — T2 哨兵单元测试
 */
import { describe, it, expect } from 'vitest';
import { computeApiAvailability } from './computes/api-availability';
import { computeProtocolCoverage } from './computes/protocol-coverage';

describe('computeProtocolCoverage', () => {
  it('应返回标准协议覆盖率', () => {
    const result = computeProtocolCoverage([
      { id: '1', name: 'Tool A', protocol: 'REST' },
      { id: '2', name: 'Tool B', protocol: 'gRPC' },
    ]);
    expect(result.coverage).toBeGreaterThan(0);
    expect(result.coveredProtocols).toContain('REST');
    expect(result.totalTools).toBe(2);
    expect(result.degraded).toBe(false);
  });

  it('空列表应返回 degraded: true', () => {
    const result = computeProtocolCoverage([]);
    expect(result.degraded).toBe(true);
    expect(result.coverage).toBe(1);
  });

  it('应标记自定义协议', () => {
    const result = computeProtocolCoverage([
      { id: '1', name: 'Legacy', protocol: 'SOAP' },
    ]);
    expect(result.customOrUnlabeled.length).toBe(1);
    expect(result.customOrUnlabeled[0]).toContain('Legacy');
  });

  it('应标记未标注协议', () => {
    const result = computeProtocolCoverage([
      { id: '1', name: 'No Proto' },
    ]);
    expect(result.customOrUnlabeled.length).toBe(1);
    expect(result.customOrUnlabeled[0]).toContain('未标注协议');
  });

  it('部署率低时应返回低覆盖率', () => {
    const result = computeProtocolCoverage([
      { id: '1', name: 'Custom', protocol: 'CustomProto' },
    ]);
    expect(result.coverage).toBeLessThan(0.2);
  });
});
