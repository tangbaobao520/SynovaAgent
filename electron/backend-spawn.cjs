/**
 * electron/backend-spawn.cjs — D504 Electron 服务自启核心
 *
 * 职责: 探活后端 → 不可达则 spawn 拉起 → 探活轮询 → 重启限次 → 退出回收。
 * 纯 Node 模块（不 require('electron')）——可在 CI 无头环境直接单测。
 *
 * 契约（铁律 47，dev doc §3.5）:
 *   ensureBackend(options)
 *     @input  options: {
 *       serverUrl: string;                  // 探活目标（GET /api/healthz）
 *       cwd: string;                        // spawn 工作目录
 *       mode: 'dev' | 'prod';               // dev: npx tsx src/index.ts; prod: node dist/src/index.js（F4 同步: tsc 磁盘事实）
 *       dbPath?: string;                    // prod: 注入 SYNOVA_DB_PATH（userData 数据目录，L1-7）
 *       logFile?: string;                   // 后端 stdout/stderr 落盘
 *       maxRestarts?: number;               // 默认 3（10min 窗口语义——计数器+时间戳）
 *       command?: { bin, args };            // 测试注入覆盖默认命令
 *       probeTimeoutMs?: number;            // 单轮探活窗口，默认 60000
 *       pollIntervalMs?: number;            // 探活轮询间隔，默认 1000
 *     }
 *     @output { started, pid?, reused?, degraded?, error?, stop }
 *       started=true  → 探活失败 → spawn → 探活成功
 *       reused=true   → 探活成功（已有服务在跑，不重复 spawn——端口冲突安全网）
 *       degraded=true → spawn 后探活仍失败 / 重启超限 / ENOENT（显式标记，铁律 24/31 不静默）
 *       stop()        → SIGTERM 回收子进程（before-quit 挂钩，孤儿保护）
 *     @error — 无（内部全捕获，返回对象；不抛）
 *
 * @state: real — D504 交付，main.cjs whenReady 集成
 */

const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

/** 单次探活: GET /api/healthz，statusCode 200 = 健康（healthz 200=healthy/degraded, 503=down） */
function probeOnce(url, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const req = http.get(`${url}/api/healthz`, { timeout: timeoutMs }, (res) => {
      resolve(res.statusCode === 200);
      res.resume();
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

/** 探活轮询: 窗口内每 pollIntervalMs 试一次 */
async function probeUntil(url, windowMs, pollIntervalMs) {
  const deadline = Date.now() + windowMs;
  while (Date.now() < deadline) {
    if (await probeOnce(url, Math.min(5000, pollIntervalMs * 2))) return true;
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
  return false;
}

/** 双模式默认命令（导出供测试直测） */
function buildCommand(mode) {
  // 注意: tsc 实际产物入口为 dist/src/index.js（package.json main 字段声明的旧入口路径为存量不一致，
  // 以磁盘事实为准——D504 实测 electron-builder --dir 产物 Resources/dist/src/index.js；
  // F5 纪律: electron/ 内禁止出现旧入口字面量，tests F4 回归用例零容忍）
  return mode === 'prod'
    ? { bin: 'node', args: ['dist/src/index.js'] }
    : { bin: 'npx', args: ['tsx', 'src/index.ts'] };
}

/** 日志流: 后端 stdout/stderr 追加写 logFile（degraded 可见，铁律 11/24） */
function attachLogStream(child, logFile) {
  if (!logFile) return;
  try {
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    const stream = fs.createWriteStream(logFile, { flags: 'a' });
    stream.write(`\n===== backend spawn ${new Date().toISOString()} pid=${child.pid} =====\n`);
    child.stdout?.on('data', (d) => stream.write(d));
    child.stderr?.on('data', (d) => stream.write(d));
    child.on('exit', () => stream.end(`===== backend exit ${new Date().toISOString()} =====\n`));
  } catch (err) {
    console.warn(`[backend-spawn] 日志文件打开失败 — 降级为无日志: ${err.message}`);
  }
}

/**
 * 确保后端服务在跑（探活 → spawn → 限次重启）。
 * 契约见文件头 JSDoc；任何异常路径返回 degraded（不抛、不静默）。
 */
async function ensureBackend(options) {
  const {
    serverUrl,
    cwd,
    mode = 'dev',
    dbPath,
    logFile,
    maxRestarts = 3,
    command,
    probeTimeoutMs = 60000,
    pollIntervalMs = 1000,
  } = options;

  // 1. 探活 — 已有健康服务 → reused（端口冲突安全网，不重复 spawn）
  if (await probeOnce(serverUrl)) {
    return { started: false, reused: true };
  }

  // 2. spawn + 探活轮询 + 重启限次
  const cmd = command || buildCommand(mode);
  const env = { ...process.env };
  if (mode === 'prod' && dbPath) {
    env.SYNOVA_DB_PATH = dbPath; // src/config.ts:90 只读消费（Win 领地零改动）
  }

  let child = null;
  let lastError = null;
  const startedAt = Date.now();
  const restartWindowMs = 10 * 60 * 1000; // maxRestarts 语义: 10min 窗口内
  const restarts = [];

  const spawnOnce = () => {
    // D518 修复: 无 logFile 时用 inherit 而非 pipe——pipe 无人读取会写满 64KB 缓冲导致子进程
    // 阻塞在 stdout 写、探活永不转健康（实测: dev 模式 spawn 后 60s 窗口 ×4 全超时，直跑 25s 即健康）。
    // inherit = 共享 Electron 进程 stdout（自动排空 + 后端日志直接可见=运行证据）。铁律 24: 不静默。
    const stdio = logFile ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'inherit', 'inherit'];
    const c = spawn(cmd.bin, cmd.args, { cwd, env, stdio });
    attachLogStream(c, logFile);
    c.on('error', (err) => {
      console.error(`[backend-spawn] spawn 失败: ${err.message}`);
      lastError = err.message;
    });
    return c;
  };

  child = spawnOnce();
  let attempt = 0;
  while (attempt < Math.max(1, maxRestarts) + 1) {
    const healthy = await probeUntil(serverUrl, probeTimeoutMs, pollIntervalMs);
    if (healthy) {
      const stop = () => {
        if (child && !child.killed) {
          try { child.kill('SIGTERM'); } catch (err) { console.warn(`[backend-spawn] stop 失败: ${err.message}`); }
        }
      };
      return { started: true, pid: child.pid, stop, child };
    }
    // 探活失败 — 记录重启（窗口外重置计数）
    const now = Date.now();
    restarts.push(now);
    while (restarts.length > 0 && now - restarts[0] > restartWindowMs) restarts.shift();
    lastError = lastError || `后端探活在 ${probeTimeoutMs}ms 内未转健康（mode=${mode}）`;
    attempt += 1;
    if (restarts.length > maxRestarts || attempt > maxRestarts + 1 || child.exitCode !== null) {
      // 超限 / 子进程已死且不可再拉 — degraded 显式（铁律 24/31：不静默）
      console.error(`[backend-spawn] 后端自启降级 — 重启 ${restarts.length} 次未恢复: ${lastError}`);
      try { if (child && !child.killed) child.kill('SIGTERM'); } catch { /* already gone */ }
      return { started: false, degraded: true, error: lastError };
    }
    child = spawnOnce();
  }

  return { started: false, degraded: true, error: lastError || 'unreachable' };
}

module.exports = { ensureBackend, buildCommand, probeOnce };
