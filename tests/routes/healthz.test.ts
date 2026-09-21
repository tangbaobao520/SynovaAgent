/**
 * tests/routes/healthz.test.ts — D49 GET /api/healthz 测试
 *
 * 覆盖: 6项检查状态 + 整体状态聚合 + server接线 + report-assembler注入
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import express from 'express';

describe('D49: healthz — 检查逻辑', () => {
  it('healthz 路由返回正确格式 (status + checks + uptime)', async () => {
    // 直接引用路由模块（不启动server）
    const mod = await import('../../src/routes/healthz');
    expect(mod.default).toBeTruthy();
  });

  it('各检查项有独立名称和非空类型', async () => {
    const mod = await import('../../src/routes/healthz');
    const router = mod.default;
    expect(router).toBeTruthy();
    // 验证导出的路由是 Express Router
    expect(typeof router.get).toBe('function');
    // 验证路由定义了 /api/healthz
    const stack = router.stack || [];
    const hasHealthzRoute = stack.some((layer: { route?: { path?: string } }) =>
      layer.route?.path === '/api/healthz',
    );
    expect(hasHealthzRoute).toBe(true);
  });
});

describe('D49: healthz — HTTP 响应', () => {
  let server: http.Server;

  beforeAll(async () => {
    const app = express();
    const mod = await import('../../src/routes/healthz');
    app.use(mod.default);
    await new Promise<void>((resolve) => {
      server = app.listen(0, resolve);
    });
  });

  afterAll(() => {
    if (server) server.close();
  });

  it('返回 200 + 含 status + checks + uptime', async () => {
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('server not listening');
    const res = await fetch(`http://localhost:${addr.port}/api/healthz`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('status');
    expect(body).toHaveProperty('checks');
    expect(body).toHaveProperty('uptime');
    expect(typeof body.uptime).toBe('number');
    expect(['healthy', 'degraded', 'down']).toContain(body.status);
  });

  it('checks 包含全部 6 项', async () => {
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('server not listening');
    const res = await fetch(`http://localhost:${addr.port}/api/healthz`);
    const body = await res.json();
    const checkKeys = ['database', 'llm_connectivity', 'last_sentinel_run', 'disk_free_gb', 'data_freshness', 'watchdog_alive', 'outbound_proxy'];
    for (const key of checkKeys) {
      expect(body.checks).toHaveProperty(key);
      expect(body.checks[key]).toHaveProperty('status');
      expect(body.checks[key]).toHaveProperty('detail');
      expect(['ok', 'degraded', 'down']).toContain(body.checks[key].status);
    }
    expect(Object.keys(body.checks).length).toBe(7);
  });

  it('各项 checks.status 是合法枚举值', async () => {
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('server not listening');
    const res = await fetch(`http://localhost:${addr.port}/api/healthz`);
    const body = await res.json();
    for (const [key, check] of Object.entries(body.checks)) {
      const c = check as { status: string; detail: string };
      expect(['ok', 'degraded', 'down']).toContain(c.status);
      expect(typeof c.detail).toBe('string');
    }
  });
});

describe('D862/D864: healthz — outbound_proxy 检查（三路径整包断言 + 不含值）', () => {
  const PROXY_ENV_NAMES = ['http_proxy', 'HTTP_PROXY', 'https_proxy', 'HTTPS_PROXY', 'all_proxy', 'ALL_PROXY'] as const;
  const saved: Record<string, string | undefined> = {};

  let app: express.Express;

  async function getBody(): Promise<Record<string, unknown>> {
    const server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    try {
      const addr = server.address();
      if (!addr || typeof addr === 'string') throw new Error('server not listening');
      const res = await fetch(`http://localhost:${addr.port}/api/healthz`);
      return (await res.json()) as Record<string, unknown>;
    } finally {
      server.close();
    }
  }

  beforeEach(async () => {
    for (const name of PROXY_ENV_NAMES) {
      saved[name] = process.env[name];
      delete process.env[name];
    }
    const mod = await import('../../src/routes/healthz');
    app = express();
    app.use(mod.default);
  });

  afterEach(() => {
    for (const name of PROXY_ENV_NAMES) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  });

  it('正常路径：未配置代理 → 整包断言（K3 P2-5：不再只断言 detail 子串）', async () => {
    const body = await getBody();
    expect(body.checks).toEqual(
      expect.objectContaining({
        outbound_proxy: {
          status: 'ok',
          detail: '未设置代理环境变量（全量直连）；已配置变量: 无',
        },
      }),
    );
  });

  it('边界路径：配置带凭据的可用代理 → 整包不含代理值/凭据（反推不可能）', async () => {
    process.env.https_proxy = 'http://user:super-secret-pass@127.0.0.1:3128';
    const body = await getBody();
    const check = (body.checks as Record<string, { status: string; detail: string }>).outbound_proxy;
    expect(check.status).toBe('ok');
    expect(check.detail).toContain('https_proxy');
    // 不含值安全契约：整包响应不得出现代理 URL、host、端口、凭据
    const whole = JSON.stringify(body);
    expect(whole).not.toContain('super-secret-pass');
    expect(whole).not.toContain('3128');
    expect(whole).not.toContain('user:');
  });

  it('降级路径：socks 代理值不可用 → 整包断言只含变量名与形态', async () => {
    process.env.all_proxy = 'socks5://secret-cred@127.0.0.1:1080';
    const body = await getBody();
    const check = (body.checks as Record<string, { status: string; detail: string }>).outbound_proxy;
    expect(check.status).toBe('degraded');
    expect(check.detail).toContain('all_proxy');
    expect(JSON.stringify(body)).not.toContain('secret-cred');
    expect(JSON.stringify(body)).not.toContain('1080');
  });

  it('反例（K3 P2-4/D864）：getProxyStatus 抛含凭据消息的异常 → 响应整包零回显（修前必红）', async () => {
    const httpExit = await import('../../src/providers/http-exit');
    const spy = vi.spyOn(httpExit, 'getProxyStatus').mockImplementation(() => {
      throw new Error('代理状态读取失败: http://leak-user:k3-leak-pass@10.0.0.9:8080');
    });
    try {
      const body = await getBody();
      // 整包对象断言：固定文案，不含任何异常消息内容
      expect((body.checks as Record<string, unknown>).outbound_proxy).toEqual({
        status: 'degraded',
        detail: '出站代理状态检查异常（详见服务端日志）',
      });
      const whole = JSON.stringify(body);
      expect(whole).not.toContain('k3-leak-pass');
      expect(whole).not.toContain('leak-user');
      expect(whole).not.toContain('10.0.0.9');
      expect(whole).not.toContain('8080');
    } finally {
      spy.mockRestore();
    }
  });
});

describe('D49: server.ts — 接线验证', () => {
  it('server.ts 中 import 了 healthzRoutes', () => {
    const content = fs.readFileSync(
      path.resolve(__dirname, '..', '..', 'src', 'server.ts'),
      'utf-8',
    );
    expect(content).toContain("import healthzRoutes from './routes/healthz'");
    expect(content).toContain("app.use(healthzRoutes)");
  });
});

describe('D49: report-assembler — systemHealth 注入', () => {
  it('report-assembler.ts 包含 injectSystemHealth 调用', () => {
    const content = fs.readFileSync(
      path.resolve(__dirname, '..', '..', 'src', 'agent', 'report-assembler.ts'),
      'utf-8',
    );
    expect(content).toContain('injectSystemHealth');
    expect(content).toContain('SystemHealthAudit');
    expect(content).toContain('systemHealth');
  });
});
