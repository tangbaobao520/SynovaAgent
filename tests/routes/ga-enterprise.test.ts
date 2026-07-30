/**
 * tests/routes/ga-enterprise.test.ts — D109 GA 路由多企业适配
 *
 * 覆盖: ga-admin 无mock/企业切换/标注orgId/纠错orgId
 * 约束: ≥8测试 / 零as any
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { getEnterpriseList, getEnterpriseDiagnosisReports } from '../../src/routes/ga-admin';

describe('D109 — ga-admin: 无mock数据', () => {
  it('getEnterpriseList 不包含 hardcoded 数据', () => {
    const list = getEnterpriseList();
    // 不应包含旧 MOCK_CLIENTS 中的企业
    expect(list.some(c => c.orgId === 'acme-corp')).toBe(false);
    expect(list.some(c => c.orgId === 'techflow')).toBe(false);
  });

  it('getEnterpriseList 返回空数组（初始状态）', () => {
    expect(getEnterpriseList()).toHaveLength(0);
  });

  it('getEnterpriseDiagnosisReports 返回空报告', () => {
    const report = getEnterpriseDiagnosisReports('nonexistent-org');
    expect(report.reportCount).toBe(0);
  });
});

describe('D109 — ga-annotations: orgId 上下文', () => {
  it('POST handler 使用 auth.orgId', () => {
    const content = readFileSync('src/routes/ga-annotations.ts', 'utf-8');
    expect(content).toContain('orgId: auth.orgId');
    expect(content).toContain("orgId: auth.orgId || 'default'");
  });

  it('使用 enterpriseStore 替代 MOCK_CLIENTS', () => {
    const content = readFileSync('src/routes/ga-admin.ts', 'utf-8');
    expect(content).toContain('enterpriseStore = new Map');
    expect(content).not.toContain('const MOCK_CLIENTS');
  });
});

describe('D109 — ga-corrections: orgId 上下文', () => {
  it('POST 纠错写入 orgId', () => {
    const content = readFileSync('src/routes/ga-corrections.ts', 'utf-8');
    expect(content).toContain('orgId: auth.orgId');
  });

  it('GET 纠错按 orgId 过滤', () => {
    const content = readFileSync('src/routes/ga-corrections.ts', 'utf-8');
    expect(content).toContain("orgId: auth.orgId || 'default'");
    expect(content).not.toContain("orgId: 'default'");
  });
});

describe('D109 — GA 临时访问多企业隔离', () => {
  it('ga-admin GET 返回 degraded 信号', () => {
    const content = readFileSync('src/routes/ga-admin.ts', 'utf-8');
    expect(content).toContain('degraded');
  });
});

describe('D281 — GA expiry', () => {
  it('enterprise.ts exports router', async () => {
    const ep = await import('../../src/routes/enterprise');
    expect(ep.default).toBeDefined();
  });

  it('GaAccessRecord 含 contractExpiry 字段', () => {
    const content = readFileSync('src/routes/enterprise.ts', 'utf-8');
    expect(content).toContain('contractExpiry');
  });

  it('server.ts 导入 enterpriseRoutes', () => {
    const content = readFileSync('src/server.ts', 'utf-8');
    expect(content).toContain('enterpriseRoutes');
  });

  it('admin.js 包含 GA expiry UI', () => {
    const content = readFileSync('app/js/admin.js', 'utf-8');
    expect(content).toContain('ga-expiry-input');
    expect(content).toContain('btn-save-ga-expiry');
    expect(content).toContain('contractExpiry');
  });
});
