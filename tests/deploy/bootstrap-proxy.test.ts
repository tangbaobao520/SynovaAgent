/**
 * tests/deploy/bootstrap-proxy.test.ts — D862/P-1 第 3 项启动期出口状态检查
 *
 * 契约（铁律 47/48）：
 * - 输入：无（proxyStartupStatus 内部读 getProxyStatus 快照，调用时读 env）。
 * - 输出：{ degraded, reason?, variables, kind }；variables 只含变量名，永不含 env 值。
 * - 降级：socks / 畸形代理值 → degraded=true（启动序列据此 addDegraded，禁静默）。
 * - 边界：未配置代理 → degraded=false（直连是合法形态，不算降级）。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { proxyStartupStatus } from '../../src/deploy/bootstrap';

const NAMES = ['http_proxy', 'HTTP_PROXY', 'https_proxy', 'HTTPS_PROXY', 'all_proxy', 'ALL_PROXY', 'no_proxy', 'NO_PROXY'];
const saved: Record<string, string | undefined> = {};

beforeEachCapture();
function beforeEachCapture(): void {
  for (const n of NAMES) saved[n] = process.env[n];
}
function restore(): void {
  for (const n of NAMES) {
    if (saved[n] === undefined) delete process.env[n];
    else process.env[n] = saved[n];
  }
}

afterEach(restore);

describe('proxyStartupStatus（D862 第 3 项）', () => {
  it('正常路径：未配置代理 → degraded=false，variables 不含值', () => {
    for (const n of NAMES) delete process.env[n];
    const s = proxyStartupStatus();
    expect(s.degraded).toBe(false);
    expect(s.variables).toEqual([]);
    expect(JSON.stringify(s)).not.toMatch(/127\.0\.0\.1:\d+|:8080/);
  });

  it('正常路径：http_proxy 可用 → degraded=false，variables 只有变量名', () => {
    for (const n of NAMES) delete process.env[n];
    process.env.http_proxy = 'http://127.0.0.1:18080';
    const s = proxyStartupStatus();
    expect(s.degraded).toBe(false);
    expect(s.variables).toContain('http_proxy');
    // 安全契约：输出里不得出现 env 值本体
    expect(JSON.stringify(s)).not.toContain('18080');
  });

  it('降级路径：socks 代理 → degraded=true + reason（禁静默）', () => {
    for (const n of NAMES) delete process.env[n];
    process.env.all_proxy = 'socks5://127.0.0.1:19090';
    const s = proxyStartupStatus();
    expect(s.degraded).toBe(true);
    expect(s.kind).toBe('socks');
    expect(s.reason).toBeTruthy();
  });

  it('边界：畸形代理 URL → degraded=true（kind=invalid）', () => {
    for (const n of NAMES) delete process.env[n];
    process.env.HTTP_PROXY = '::::not-a-url';
    const s = proxyStartupStatus();
    expect(s.degraded).toBe(true);
    expect(s.kind).toBe('invalid');
  });
});
