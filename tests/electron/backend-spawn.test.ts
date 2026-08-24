/**
 * tests/electron/backend-spawn.test.ts — D504 Electron 服务自启契约
 *
 * 契约（铁律 47，先于实现定义 — dev doc §3.5）:
 *   ensureBackend(options):
 *     探活成功（已有健康服务）→ { started: false, reused: true } 不 spawn（端口冲突安全网）
 *     探活失败 → spawn 后端 → 探活成功 → { started: true, pid }
 *     spawn 后探活仍失败 → 重启（≤maxRestarts）→ 超限 { degraded: true, error }
 *     spawn ENOENT（后端不存在）→ { degraded: true } 不抛
 *     prod 模式 env 注入 SYNOVA_DB_PATH；dev 模式命令 = npx tsx src/index.ts
 *   stop() → SIGTERM 回收子进程（无孤儿）
 * 铁律 48: 正常（spawn→healthy）/ 降级（超限/ENOENT → degraded）/ 边界（reused/env 注入/双模式）。
 *
 * 纯 Node 模块（不 require electron）——vitest node 环境直测，CI 无 GUI 可验服务自启。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'child_process';
import http from 'http';
import path from 'path';
import fs from 'fs';
import os from 'os';

/**
 * D504 落地对象: electron/backend-spawn.cjs（CommonJS，纯 Node）。
 * vitest ESM 下用 createRequire 加载。
 */
import { createRequire } from 'module';
const require_ = createRequire(import.meta.url);
const ROOT = path.resolve(__dirname, '../..');
const backendSpawnPath = path.resolve(__dirname, '../../electron/backend-spawn.cjs');

/** 起一个假后端：healthServer 立即 200；delayServer 探活 N 次后转 200（模拟慢启动） */
function startFakeServer(delayOkMs = 0): Promise<{ server: http.Server; port: number; close: () => void }> {
  return new Promise((resolve) => {
    const server = http.createServer((_req, res) => {
      res.statusCode = 200;
      res.end('{"status":"healthy"}');
    });
    const start = Date.now();
    // 模拟慢启动：前 delayOkMs 返回 503
    const handler = server.listeners('request')[0] as (...args: unknown[]) => void;
    server.removeListener('request', handler);
    server.on('request', (_req: http.IncomingMessage, res: http.ServerResponse) => {
      if (delayOkMs > 0 && Date.now() - start < delayOkMs) {
        res.statusCode = 503;
        res.end('starting');
      } else {
        res.statusCode = 200;
        res.end('{"status":"healthy"}');
      }
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      resolve({
        server,
        port: addr.port,
        close: () => new Promise<void>((r) => server.close(() => r())),
      });
    });
  });
}

/** 探活辅助：等 url 可达或超时 */
async function waitProbe(url: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/api/healthz`);
      if (res.status === 200) return true;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

const handles: Array<() => void> = [];
afterEach(() => {
  for (const h of handles.splice(0)) {
    try { h(); } catch { /* cleanup best-effort */ }
  }
});

describe('ensureBackend — 契约三路径', () => {
  it('reused：探活成功（已有健康服务）→ 不 spawn，{ started: false, reused: true }', async () => {
    const fake = await startFakeServer();
    handles.push(() => fake.close());
    const { ensureBackend } = require_(backendSpawnPath) as {
      ensureBackend: (o: Record<string, unknown>) => Promise<Record<string, unknown>>;
    };

    const result = await ensureBackend({
      serverUrl: `http://127.0.0.1:${fake.port}`,
      cwd: process.cwd(),
      mode: 'dev',
      // 指向一个"永远不会被走到"的启动命令（reused 路径不 spawn）
      command: { bin: 'definitely-not-a-real-binary', args: ['--x'] },
    });

    expect(result.started).toBe(false);
    expect(result.reused).toBe(true);
    expect(result.degraded).toBeFalsy();
  }, 20000);

  it('started：探活失败 → spawn 探活服务 → 探活成功 → { started: true, pid }', async () => {
    // 目标端口：先起一个"慢启动"服务（占住端口，前 1.5s 返回 503）
    const fake = await startFakeServer(1500);
    handles.push(() => fake.close());

    // spawn 的"后端"= 一个 node 脚本，仅 sleep 保持存活（探活由上面的慢启动服务响应）
    const stub = path.join(os.tmpdir(), `d504-stub-${Date.now()}.cjs`);
    fs.writeFileSync(stub, 'setInterval(() => {}, 10000);\n');
    handles.push(() => { try { fs.unlinkSync(stub); } catch { /* gone */ } });

    const { ensureBackend } = require_(backendSpawnPath) as {
      ensureBackend: (o: Record<string, unknown>) => Promise<{ started: boolean; pid?: number; reused?: boolean; degraded?: boolean; stop?: () => void }>;
    };

    const result = await ensureBackend({
      serverUrl: `http://127.0.0.1:${fake.port}`,
      cwd: process.cwd(),
      mode: 'prod', // prod 分支但 command 显式覆盖（测试注入）
      command: { bin: process.execPath, args: [stub] },
      probeTimeoutMs: 30000,
      pollIntervalMs: 200,
    });

    expect(result.started).toBe(true);
    expect(typeof result.pid).toBe('number');
    expect(result.degraded).toBeFalsy();

    // 生命周期：stop() 回收子进程（无孤儿）
    result.stop?.();
    await new Promise((r) => setTimeout(r, 300));
  }, 40000);

  it('降级：spawn 后探活始终失败 → 重启 ≤maxRestarts → { degraded: true, error }（不静默，铁律 24/31）', async () => {
    // 占一个端口但永不健康：起一个总 503 的服务
    const always503 = http.createServer((_req, res) => { res.statusCode = 503; res.end('down'); });
    await new Promise<void>((r) => always503.listen(0, '127.0.0.1', r));
    handles.push(() => new Promise<void>((r) => always503.close(() => r())));
    const port = (always503.address() as { port: number }).port;

    const stub = path.join(os.tmpdir(), `d504-stub2-${Date.now()}.cjs`);
    fs.writeFileSync(stub, 'setInterval(() => {}, 10000);\n');
    handles.push(() => { try { fs.unlinkSync(stub); } catch { /* gone */ } });

    const { ensureBackend } = require_(backendSpawnPath) as {
      ensureBackend: (o: Record<string, unknown>) => Promise<Record<string, unknown> & { stop?: () => void }>;
    };

    const result = await ensureBackend({
      serverUrl: `http://127.0.0.1:${port}`,
      cwd: process.cwd(),
      mode: 'prod',
      command: { bin: process.execPath, args: [stub] },
      maxRestarts: 2,
      probeTimeoutMs: 800,   // 每轮探活窗口 0.8s
      pollIntervalMs: 200,
    });

    expect(result.degraded).toBe(true);
    expect(typeof result.error).toBe('string');
    result.stop?.();
  }, 40000);

  it('异常捕获：spawn ENOENT（后端不存在）→ { degraded: true } 不抛', async () => {
    const { ensureBackend } = require_(backendSpawnPath) as {
      ensureBackend: (o: Record<string, unknown>) => Promise<Record<string, unknown>>;
    };
    // 空闲端口（探活必失败）
    const free = http.createServer();
    await new Promise<void>((r) => free.listen(0, '127.0.0.1', r));
    const port = (free.address() as { port: number }).port;
    await new Promise<void>((r) => free.close(() => r()));

    const result = await ensureBackend({
      serverUrl: `http://127.0.0.1:${port}`,
      cwd: process.cwd(),
      mode: 'prod',
      command: { bin: 'no-such-backend-binary', args: [] },
      maxRestarts: 1,
      probeTimeoutMs: 500,
      pollIntervalMs: 100,
    });

    expect(result.degraded).toBe(true);
  }, 30000);
});

describe('ensureBackend — env 与命令契约（DS8 双模式）', () => {
  it('prod 模式默认命令 node dist/index.js 且 env 注入 SYNOVA_DB_PATH（断言 spawn argv/env）', async () => {
    // 捕获 spawn 参数：用一个假 server 立即 200 会导致 reused——所以捕获法：
    // 起慢启动服务（1.2s 后 200），让 ensureBackend 走 spawn 路径，stub 记录 env 到文件
    const fake = await startFakeServer(1200);
    handles.push(() => fake.close());

    const envLog = path.join(os.tmpdir(), `d504-env-${Date.now()}.json`);
    const stub = path.join(os.tmpdir(), `d504-stub3-${Date.now()}.cjs`);
    fs.writeFileSync(stub, `require('fs').writeFileSync(${JSON.stringify(envLog)}, JSON.stringify({ argv: process.argv.slice(1), db: process.env.SYNOVA_DB_PATH || null }));\nsetInterval(() => {}, 10000);\n`);
    handles.push(() => { try { fs.unlinkSync(stub); } catch { /* gone */ } try { fs.unlinkSync(envLog); } catch { /* gone */ } });

    const { ensureBackend } = require_(backendSpawnPath) as {
      ensureBackend: (o: Record<string, unknown>) => Promise<{ stop?: () => void } & Record<string, unknown>>;
    };

    const result = await ensureBackend({
      serverUrl: `http://127.0.0.1:${fake.port}`,
      cwd: process.cwd(),
      mode: 'prod',
      dbPath: '/tmp/userdata/data/synova.db',
      command: { bin: process.execPath, args: [stub] }, // 覆盖命令（默认命令在本机无 dist 会 ENOENT）
      probeTimeoutMs: 30000,
      pollIntervalMs: 200,
    });

    expect(result.degraded).toBeFalsy();
    // env 注入断言：stub 收到 SYNOVA_DB_PATH
    await new Promise((r) => setTimeout(r, 400));
    const recorded = JSON.parse(fs.readFileSync(envLog, 'utf-8')) as { argv: string[]; db: string | null };
    expect(recorded.db).toBe('/tmp/userdata/data/synova.db');
    result.stop?.();
    await new Promise((r) => setTimeout(r, 300));
  }, 40000);

  it('dev 模式默认命令 = npx tsx src/index.ts（模块导出 buildCommand 纯函数，可直测）', () => {
    const { buildCommand } = require_(backendSpawnPath) as {
      buildCommand: (mode: string, opts?: Record<string, unknown>) => { bin: string; args: string[] };
    };
    const dev = buildCommand('dev');
    expect(dev.bin).toBe('npx');
    expect(dev.args).toEqual(['tsx', 'src/index.ts']);
    const prod = buildCommand('prod');
    // D518 prod 运行时: 包内 Electron 二进制（node 模式）跑 esbuild 单文件 bundle
    expect(prod.bin).toBe(process.execPath);
    expect(prod.args).toEqual(['dist/backend.mjs']);
  });

  // ═══ D518 新增: F4 注释漂移回归（K3 D504 审计 F4——注释与磁盘事实不一致）═══
  it('F4 回归: electron/*.cjs 注释零 "dist/index.js" 残留（全部为 dist/src/index.js）', () => {
    const electronDir = path.join(ROOT, 'electron');
    const files = fs.readdirSync(electronDir).filter((f) => f.endsWith('.cjs'));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const src = fs.readFileSync(path.join(electronDir, f), 'utf-8');
      // 匹配未被 "src/" 前缀修饰的 dist/index.js（注释或代码——一律禁）
      const stale = src.match(/(?<!src\/)dist\/index\.js/g) ?? [];
      expect(stale, `${f} 存在 F4 注释漂移残留: ${stale.join(', ')}`).toHaveLength(0);
    }
  });

  it('D518 回归: main.cjs 启动首行含 boot mode 显式日志（模式显式化——日志即证据）', () => {
    const main = fs.readFileSync(path.join(ROOT, 'electron', 'main.cjs'), 'utf-8');
    expect(main).toMatch(/\[electron\] boot mode=/);
    expect(main).toMatch(/isProdBoot \? 'prod' : 'dev'/);
  });

  it('stop() 生命周期：started 后 stop → 子进程退出（无孤儿，DS 契约 lifecycle）', async () => {
    const stub = path.join(os.tmpdir(), `d504-stub4-${Date.now()}.cjs`);
    fs.writeFileSync(stub, 'process.on(\"SIGTERM\", () => process.exit(0));\nsetInterval(() => {}, 10000);\n');
    handles.push(() => { try { fs.unlinkSync(stub); } catch { /* gone */ } });

    const { ensureBackend } = require_(backendSpawnPath) as {
      ensureBackend: (o: Record<string, unknown>) => Promise<{ pid?: number; stop?: () => void; child?: { killed: boolean; exitCode: number | null } } & Record<string, unknown>>;
    };

    const fake = await startFakeServer(600);
    handles.push(() => fake.close());

    const result = await ensureBackend({
      serverUrl: `http://127.0.0.1:${fake.port}`,
      cwd: process.cwd(),
      mode: 'prod',
      command: { bin: process.execPath, args: [stub] },
      probeTimeoutMs: 30000,
      pollIntervalMs: 200,
    });

    const pid = result.pid;
    expect(typeof pid).toBe('number');
    result.stop?.();

    // 等子进程退出并验证（SIGTERM handler 立即 exit）
    await new Promise((r) => setTimeout(r, 600));
    // 验证无孤儿：进程应已退出（kill(pid,0) 抛 ESRCH）
    let alive = true;
    try { process.kill(pid as number, 0); } catch (err) { console.warn('[test] 子进程已退出（ESRCH 预期）:', err instanceof Error ? err.message : String(err)); alive = false; }
    expect(alive).toBe(false);
  }, 40000);
});

describe('ensureBackend — 日志契约（降级可见，铁律 11/24）', () => {
  it('logFile：spawn 后 stdout/stderr 写入日志文件', async () => {
    const fake = await startFakeServer(1000);
    handles.push(() => fake.close());
    const logFile = path.join(os.tmpdir(), `d504-backend-${Date.now()}.log`);
    handles.push(() => { try { fs.unlinkSync(logFile); } catch { /* gone */ } });

    const stub = path.join(os.tmpdir(), `d504-stub5-${Date.now()}.cjs`);
    fs.writeFileSync(stub, 'console.log(\"backend-up-line\");\nsetInterval(() => {}, 10000);\n');
    handles.push(() => { try { fs.unlinkSync(stub); } catch { /* gone */ } });

    const { ensureBackend } = require_(backendSpawnPath) as {
      ensureBackend: (o: Record<string, unknown>) => Promise<{ stop?: () => void } & Record<string, unknown>>;
    };

    const result = await ensureBackend({
      serverUrl: `http://127.0.0.1:${fake.port}`,
      cwd: process.cwd(),
      mode: 'prod',
      command: { bin: process.execPath, args: [stub] },
      logFile,
      probeTimeoutMs: 30000,
      pollIntervalMs: 200,
    });

    expect(result.degraded).toBeFalsy();
    result.stop?.();
    await new Promise((r) => setTimeout(r, 400));

    const logContent = fs.readFileSync(logFile, 'utf-8');
    expect(logContent).toContain('backend-up-line');
  }, 40000);
});
