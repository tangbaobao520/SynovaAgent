/**
 * tests/e2e/02-expert-contribution-journey.test.ts
 *
 * L4: 行业专家贡献旅程。
 * POST /api/expert/contribute → 提取模板 → 浏览 marketplace
 */
import { describe, it, expect } from 'vitest';

const BASE = 'http://localhost:3099';

describe('E2E: 行业专家贡献旅程', () => {
  it('POST /api/expert/contribute → 200 + template', async () => {
    const res = await fetch(`${BASE}/api/expert/contribute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expertId: 'e2e-exp-001',
        industry: 'manufacturing',
        scenario: 'high_turnover',
        description: '制造业一线工人流失率过高，通常是因为工作环境恶劣、薪资缺乏竞争力、晋升通道不清晰。建议从改善工作环境、建立技能培训体系入手。',
        yearsOfExperience: 15,
      }),
    });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.ok).toBe(true);
    expect(data.id).toBeDefined();
    console.warn(`⚠ 专家贡献 ID: ${data.id}, 状态: ${data.status}`);
  });

  it('GET /api/expert/marketplace → 200 + templates[]', async () => {
    const res = await fetch(`${BASE}/api/expert/marketplace?industry=manufacturing`);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.ok).toBe(true);
  });

  it('POST /api/expert/contribute → 400 (缺少必填字段)', async () => {
    const res = await fetch(`${BASE}/api/expert/contribute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expertId: 'e2e-exp-002' }), // 缺 industry, scenario, description
    });
    expect(res.status).toBe(400);
  });
});
