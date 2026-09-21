/**
 * tests/invariants/health-route.test.ts — 运行期不变量探针镜像单测（D865 组2）
 *
 * 镜像: src/invariants/health-route.ts（路径严格镜像，pre-commit 组2 硬要求）
 * 定位: 探针**三态契约**（空表 503 / 部分注册 503 / 装齐 200）+ 声明面-运行面一致性
 * （D865 组4 真接线：expected 来自 RUNTIME_INVARIANT_COMPANIONS）。
 * 真实 express Router + 真实 TCP 监听 + 原生 fetch（不经被 wrap 的 globalThis.fetch）。
 * 深度链路（bootstrap 真装 + lastFailure 语义）留在 tests/sentinel/invariants.test.ts。
 *
 * 契约（铁律 47）:
 *   @input  — HTTP GET /api/healthz/invariants
 *   @output — registered === expected → 200（含 missing: [] 与 anomalies/stickyDegradedSessions）
 *             registered !== expected → 503（含 expected + missing 清单，fail-closed）
 *   @degraded — snapshot 抛错 → 503 {error, degraded:true}
 *   @error  — 探针不向客户端抛错
 */

import { describe, it, expect, afterEach } from 'vitest';
import express from 'express';
import {
  invariantRegistry,
  invariantHealthRoutes,
  RUNTIME_INVARIANT_COMPANIONS,
  onToolSchemaSent,
} from '../../src/invariants';

/** 原生 fetch（探针请求自身不穿检查缝；被 wrap 的是 globalThis.fetch） */
const nativeFetch = globalThis.fetch;
const originalGlobalFetch = globalThis.fetch;

interface ProbeBody {
  registered: number;
  expected: number;
  missing: string[];
  invariants: Array<{ code: string; owner: string; hitCount: number; lastFailure: string | null }>;
  stickyDegradedSessions?: number;
  anomalies?: string[];
  error?: string;
  degraded?: boolean;
}

/** 起真实 express 服务器（挂生产同款 Router）→ 真 HTTP GET 探针 */
async function probe(): Promise<{ status: number; body: ProbeBody }> {
  const app = express();
  app.use(invariantHealthRoutes);
  const server = app.listen(0);
  try {
    const addr = server.address();
    const port = typeof addr === 'object' && addr !== null ? addr.port : 0;
    const res = await nativeFetch(`http://127.0.0.1:${port}/api/healthz/invariants`);
    const body = JSON.parse(await res.text()) as ProbeBody;
    return { status: res.status, body };
  } finally {
    server.close();
  }
}

afterEach(() => {
  invariantRegistry.uninstallAll();
  globalThis.fetch = originalGlobalFetch;
});

describe('探针三态（声明面 vs 运行面）', () => {
  it('空注册表 → 503 + registered=0 + expected=清单数 + missing 全列 + error 含 fail-closed', async () => {
    const { status, body } = await probe();
    expect(status).toBe(503);
    expect(body.registered).toBe(0);
    expect(body.expected).toBe(RUNTIME_INVARIANT_COMPANIONS.length);
    expect(body.missing).toEqual(RUNTIME_INVARIANT_COMPANIONS.map((c) => c.code));
    expect(body.error).toContain('fail-closed');
    expect(body.invariants).toHaveLength(0);
  });

  it('部分注册（1/3）→ 503（假绿防线）+ missing 只列未装的 2 条 + 仍暴露已装那条可诊断', async () => {
    invariantRegistry.install(onToolSchemaSent);
    const { status, body } = await probe();
    expect(status).toBe(503);
    expect(body.registered).toBe(1);
    expect(body.expected).toBe(3);
    expect(body.missing).toEqual(['INV-TOOL-CALL-PAIRING', 'INV-DEGRADED-STICKY']);
    expect(body.invariants.map((i) => i.code)).toEqual(['INV-TOOL-SCHEMA-SENT']);
    expect(body.error).toContain('registered=1 != expected=3');
  });

  it('装齐（3/3）→ 200 + missing 空 + 每条含 hitCount/lastFailure + anomalies 视图在', async () => {
    invariantRegistry.installAll(RUNTIME_INVARIANT_COMPANIONS);
    const { status, body } = await probe();
    expect(status).toBe(200);
    expect(body.registered).toBe(3);
    expect(body.expected).toBe(3);
    expect(body.missing).toEqual([]);
    expect(body.invariants).toHaveLength(3);
    expect(body.invariants.map((i) => i.code)).toEqual(RUNTIME_INVARIANT_COMPANIONS.map((c) => c.code));
    for (const inv of body.invariants) {
      expect(typeof inv.hitCount).toBe('number');
      expect(inv.lastFailure).toBeNull();
    }
    expect(body.stickyDegradedSessions).toBe(0);
    expect(body.anomalies).toEqual([]);
  });

  it('状态随运行面变化：装齐 200 → 卸载一条又回 503（非一次性判定）', async () => {
    invariantRegistry.installAll(RUNTIME_INVARIANT_COMPANIONS);
    expect((await probe()).status).toBe(200);
    invariantRegistry.uninstall('INV-DEGRADED-STICKY');
    const after = await probe();
    expect(after.status).toBe(503);
    expect(after.body.registered).toBe(2);
    expect(after.body.missing).toEqual(['INV-DEGRADED-STICKY']);
  });
});
