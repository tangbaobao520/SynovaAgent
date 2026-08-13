/**
 * tests/middleware/rate-limit.test.ts — Phase 3.1 三层速率限制测试
 *
 * 铁律 33: *.test.ts 单元测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@synova/logger', () => {
  const m = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), fatal: vi.fn() };
  return { logger: m, createLogger: vi.fn(() => m) };
});

import {
  createFixedWindowLimiter,
  createAuthRateLimiter,
  createLLMRateLimiter,
} from '../../src/middleware/rate-limit';

// ═══ Helper: 模拟 req/res/next ═══

function mockReqRes() {
  const req: any = { ip: '127.0.0.1', headers: {} };
  const res: any = {
    status: vi.fn(() => res),
    json: vi.fn(() => res),
    setHeader: vi.fn(() => res),
  };
  const next = vi.fn();
  return { req, res, next };
}

describe('FixedWindowLimiter', () => {
  it('前 2 次请求应通过（上限=2）', () => {
    const limiter = createFixedWindowLimiter(2, 60_000);
    const { req, res, next } = mockReqRes();

    limiter(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);

    limiter(req, res, next);
    expect(next).toHaveBeenCalledTimes(2);
  });

  it('第 3 次请求应返回 429', () => {
    const limiter = createFixedWindowLimiter(2, 60_000);
    const { req, res, next } = mockReqRes();

    limiter(req, res, next); // 1
    limiter(req, res, next); // 2
    limiter(req, res, next); // 3 → 429

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'RATE_LIMITED' }));
  });

  it('429 响应应包含 Retry-After 头', () => {
    const limiter = createFixedWindowLimiter(1, 60_000);
    const { req, res, next } = mockReqRes();

    limiter(req, res, next); // 1st: pass
    limiter(req, res, next); // 2nd: 429

    expect(res.setHeader).toHaveBeenCalledWith('Retry-After', expect.any(Number));
  });
});

describe('AuthRateLimiter', () => {
  it('127.0.0.1 应豁免', () => {
    const limiter = createAuthRateLimiter();
    const { req, res, next } = mockReqRes();
    req.ip = '127.0.0.1';

    for (let i = 0; i < 100; i++) limiter(req, res, next);
    expect(next).toHaveBeenCalledTimes(100);
  });

  it('超出限制应返回 429', () => {
    const limiter = createAuthRateLimiter();
    const { req, res, next } = mockReqRes();
    req.ip = '192.168.1.1';

    // 默认 20 次/分钟
    for (let i = 0; i < 20; i++) limiter(req, res, next);
    limiter(req, res, next); // 21st → 429

    expect(res.status).toHaveBeenCalledWith(429);
  });

  it('不同 IP 应独立计数', () => {
    const limiter = createAuthRateLimiter();

    const r1 = mockReqRes(); r1.req.ip = '10.0.0.1';
    const r2 = mockReqRes(); r2.req.ip = '10.0.0.2';

    for (let i = 0; i < 25; i++) limiter(r1.req, r1.res, r1.next);
    limiter(r2.req, r2.res, r2.next);

    expect(r1.res.status).toHaveBeenCalledWith(429);
    expect(r2.res.status).not.toHaveBeenCalled();
  });
});

describe('LLMRateLimiter', () => {
  it('orgId 在限制内应通过', () => {
    const limiter = createLLMRateLimiter();
    const { req, res, next } = mockReqRes();
    req.orgId = 'org1';

    for (let i = 0; i < 5; i++) limiter(req, res, next);
    expect(next).toHaveBeenCalledTimes(5);
  });

  it('超出限制应返回 429', () => {
    const limiter = createLLMRateLimiter();
    const { req, res, next } = mockReqRes();
    req.orgId = 'org1';

    for (let i = 0; i < 20; i++) limiter(req, res, next);
    limiter(req, res, next); // 21st → 429

    expect(res.status).toHaveBeenCalledWith(429);
  });
});
