/**
 * bootstrap.ts — GSS 临时服务起停（黄金场景共享基建 4/4）
 *
 * 一句话: 在临时端口 + 临时数据目录上拉起 Synova 服务，等 healthz 就绪后交还控制权。
 *
 * 契约:
 *   @input  — --port <端口>（默认 0 = 自动取 3100-3199 空闲端口）
 *             --data-dir <临时数据目录>（fresh-db.ts 产物；强制要求，防误用真实库）
 *             [--entry <ts 入口>]（默认 src/index.ts；测试可注入假服务——铁律 12 不 mock 管线）
 *             [--healthz-path <路径>]（默认 /api/healthz）
 *             [--timeout <秒>]（就绪超时，默认 120）
 *   @output — stdout 单行 JSON { pid, port, dataDir, healthz, ready }
 *             同时写 <data-dir>/bootstrap-state.json（run.sh 持久读取）
 *   @degraded — 无 --data-dir → exit 2；healthz 超时/进程提前退出 → 杀子进程 + exit 2
 *               （fail-closed: 服务没起来绝不假装起来）
 *   @error  — BOOTSTRAP_TIMEOUT / BOOTSTRAP_EXIT_EARLY
 *
 * 红线: 必须配 fresh-db.ts 的临时目录；进程退出时清理子进程（不留孤儿服务）。
 *       Windows 兼容: npx.cmd / 相对路径 / spawn 不套 shell。
 */
import * as fs from 'fs';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import * as childProcess from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

export interface BootstrapResult {
  pid: number | undefined;
  port: number;
  dataDir: string;
  healthz: string;
  ready: boolean;
}

function pickFreePort(base: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(base, '127.0.0.1', () => {
      const addr = srv.address();
      srv.close(() => {
        if (addr && typeof addr === 'object') resolve(addr.port);
        else reject(new Error('端口分配失败'));
      });
    });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitHealthz(url: string, timeoutSec: number): Promise<boolean> {
  const deadline = Date.now() + timeoutSec * 1000;
  while (Date.now() < deadline) {
    const r = childProcess.spawnSync('curl', ['-sS', '-m', '5', url], { encoding: 'utf-8' });
    if (!r.error && r.status === 0) {
      try {
        const body = JSON.parse(r.stdout);
        if (body.status === 'healthy' || body.status === 'degraded') return true;
      } catch {
        // 非 JSON 响应 = 还没就绪，继续等
      }
    }
    await sleep(2000);
  }
  return false;
}

export async function bootstrap(opts: {
  port?: number;
  dataDir: string;
  entry?: string;
  healthzPath?: string;
  timeoutSec?: number;
}): Promise<BootstrapResult> {
  const dataDir = path.resolve(opts.dataDir);
  const tmpRoot = path.resolve(os.tmpdir());
  if (!dataDir.startsWith(tmpRoot + path.sep)) {
    console.error(
      `degraded: bootstrap 只接受系统临时区数据目录（fresh-db.ts 产物），得到 ${dataDir}\n` +
      `（铁律 0-4: 场景绝不使用真实数据目录）`,
    );
    process.exit(2);
  }
  if (!fs.existsSync(dataDir)) {
    console.error(`degraded: 数据目录不存在: ${dataDir}（先跑 fresh-db.ts）`);
    process.exit(2);
  }

  const port = opts.port && opts.port > 0 ? opts.port : await pickFreePort(3100);
  const healthzPath = opts.healthzPath || '/api/healthz';
  const entry = path.resolve(opts.entry || path.join(REPO_ROOT, 'src', 'index.ts'));
  if (!fs.existsSync(entry)) {
    console.error(`degraded: 服务入口不存在: ${entry}`);
    process.exit(2);
  }

  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const child = childProcess.spawn(npx, ['tsx', entry], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      SYNOVA_DATA_DIR: dataDir,
      DEV_MODE: 'false',
      PYTHONIOENCODING: 'utf-8',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let earlyLog = '';
  child.stdout?.on('data', (d: Buffer) => { earlyLog = (earlyLog + d.toString()).slice(-4000); });
  child.stderr?.on('data', (d: Buffer) => { earlyLog = (earlyLog + d.toString()).slice(-4000); });

  const exited = new Promise<boolean>((resolve) => {
    child.once('exit', (code) => resolve(code !== 0));
  });
  const healthzUrl = `http://127.0.0.1:${port}${healthzPath}`;
  const ready = await Promise.race([
    waitHealthz(healthzUrl, opts.timeoutSec || 120),
    exited.then((failed) => (failed ? false : waitHealthz(healthzUrl, (opts.timeoutSec || 120)))),
  ]);

  if (!ready) {
    child.kill();
    console.error(
      `degraded: BOOTSTRAP_TIMEOUT 服务 ${port} 就绪超时/提前退出。尾部日志:\n${earlyLog.slice(-1200)}`,
    );
    process.exit(2);
  }

  const result: BootstrapResult = {
    pid: child.pid,
    port,
    dataDir,
    healthz: healthzUrl,
    ready: true,
  };
  const statePath = path.join(dataDir, 'bootstrap-state.json');
  fs.writeFileSync(statePath, JSON.stringify(result, null, 2) + '\n', 'utf-8');
  return result;
}

export function stopBootstrap(result: BootstrapResult): void {
  if (result.pid) {
    try { process.kill(result.pid, 'SIGTERM'); } catch { /* 已退出 */ }
  }
}

if (isMain) {
  const args = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const dataDir = get('--data-dir');
  if (!dataDir) {
    console.error('用法: npx tsx bootstrap.ts --data-dir <fresh-db 目录> [--port N] [--entry x.ts] [--timeout 秒]');
    process.exit(2);
  }
  bootstrap({
    dataDir,
    port: get('--port') ? Number(get('--port')) : undefined,
    entry: get('--entry'),
    healthzPath: get('--healthz-path'),
    timeoutSec: get('--timeout') ? Number(get('--timeout')) : undefined,
  }).then((r) => {
    console.log(JSON.stringify(r));
  }).catch((e) => {
    console.error(`degraded: bootstrap 异常: ${e instanceof Error ? e.message : e}`);
    process.exit(2);
  });
}
