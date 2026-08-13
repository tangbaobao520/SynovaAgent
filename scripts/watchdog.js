#!/usr/bin/env node
/**
 * scripts/watchdog.js — 独立看门狗进程 (D49)
 *
 * 第9份权威文档 §3.1 独立看门狗进程。
 * 纯 Node.js 脚本，<500行，零外部依赖（仅用内置 http/fs/child_process）。
 *
 * 用法: node scripts/watchdog.js [--port=3000]
 *
 * 行为:
 *   - 每 5 分钟探测 GET /api/healthz（超时 10s）
 *   - 连续 3 次失败 → 触发告警
 *   - 10 分钟内连续 3 次重启失败 → 停止 + 最终告警
 *
 * 自愈边界: 不自愈 — 明确报告"需要人工介入"
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ═══ 配置 ═══

const PORT = parseInt(process.argv.find(a => a.startsWith('--port='))?.split('=')[1] || '3000', 10);
const HEALTHZ_URL = `http://localhost:${PORT}/api/healthz`;

const INTERVAL_MS = 5 * 60 * 1000;       // 5 分钟
const TIMEOUT_MS = 10 * 1000;             // 10 秒
const MAX_FAILURES = 3;                   // 连续失败次数
const RESTART_WINDOW_MS = 10 * 60 * 1000; // 10 分钟
const MAX_RESTARTS = 3;                   // 窗口内最大重启次数

// ═══ 状态 ═══

let consecutiveFailures = 0;
let restartsInWindow = 0;
let windowStartTime = Date.now();
let isRunning = true;
let startTime = Date.now();

// ═══ 日志 ═══

const LOG_DIR = path.join(os.homedir(), '.synova', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'watchdog.log');

function ensureLogDir() {
  try {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }
  } catch {
    // 日志目录不可用时降级
  }
}

function log(level, message, data) {
  const timestamp = new Date().toISOString();
  const dataStr = data ? ' ' + JSON.stringify(data) : '';
  const line = `[${timestamp}] [${level.toUpperCase()}] [watchdog] ${message}${dataStr}`;

  // stdout (Linux 友好)
  if (level === 'error') {
    console.error(line);
  } else {
    console.log(line);
  }

  // 写入日志文件
  ensureLogDir();
  try {
    fs.appendFileSync(LOG_FILE, line + '\n', 'utf-8');
  } catch {
    // 写日志失败不阻断看门狗
  }
}

// ═══ 健康探测 ═══

function probeHealth() {
  return new Promise((resolve, reject) => {
    const req = http.get(HEALTHZ_URL, { timeout: TIMEOUT_MS }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve({ ok: true, statusCode: res.statusCode, body });
        } else {
          resolve({ ok: false, statusCode: res.statusCode, body });
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });

    req.on('error', (err) => {
      reject(err);
    });
  });
}

// ═══ 告警与重启 ═══

function sendAlert(message) {
  log('error', '看门狗告警', { message });

  // D6 推送通知 API (静默降级 — 不可用时不崩溃)
  const postData = JSON.stringify({
    title: 'Synova 看门狗告警',
    body: message.substring(0, 200),
    priority: 'high',
  });

  const req = http.request({
    hostname: 'localhost',
    port: PORT,
    path: '/api/notifications/send',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) },
    timeout: 5000,
  }, (res) => {
    log('info', '告警已发送', { statusCode: res.statusCode });
  });

  req.on('error', (err) => {
    // D6 通知 API 不可用是预期的降级场景 — 日志中已有告警记录
    log('warn', '告警发送失败(D6通知API不可用)', { error: err.message });
  });

  req.write(postData);
  req.end();
}

function attemptRestart() {
  const now = Date.now();

  // 检查时间窗口
  if (now - windowStartTime > RESTART_WINDOW_MS) {
    restartsInWindow = 0;
    windowStartTime = now;
  }

  restartsInWindow++;
  log('warn', '尝试重启主进程', { attempt: restartsInWindow, maxRestarts: MAX_RESTARTS });

  if (restartsInWindow > MAX_RESTARTS) {
    // 自愈失败 — 停止重启，最终告警
    const msg = `系统连续${MAX_RESTARTS}次启动失败。最后一次错误日志路径: ${LOG_FILE}。可能需要人工介入恢复。请运行恢复包或联系GA。`;
    log('error', '看门狗已停止 — 超出最大重启次数', { message: msg });

    // 最终告警
    sendAlert(msg);

    // 写入最终标记文件
    ensureLogDir();
    try {
      fs.writeFileSync(path.join(LOG_DIR, 'watchdog.critical'), msg, 'utf-8');
    } catch {
      // 忽略
    }

    isRunning = false;
    return false;
  }

  // 执行重启 — 假设主进程入口是 src/index.ts (通过 tsx)
  try {
    const { spawn } = require('child_process');
    const proc = spawn('node', ['--require', 'tsx/cjs', path.join(__dirname, '..', 'src', 'index.ts')], {
      cwd: path.join(__dirname, '..'),
      stdio: 'ignore',
      detached: true,
    });
    proc.unref();
    log('info', '主进程重启命令已发送', { pid: proc.pid });
    return true;
  } catch (err) {
    log('error', '重启命令执行失败', { error: err.message });
    return false;
  }
}

// ═══ 主循环 ═══

async function check() {
  if (!isRunning) return;

  log('info', '探测健康...', { url: HEALTHZ_URL });

  try {
    const result = await probeHealth();
    log('info', '探测完成', { ok: result.ok, statusCode: result.statusCode });

    if (result.ok) {
      // 成功 — 重置失败计数
      consecutiveFailures = 0;
      log('info', '系统健康', { consecutiveFailures: 0 });
    } else {
      consecutiveFailures++;
      log('warn', '探测异常', { consecutiveFailures, statusCode: result.statusCode });

      if (consecutiveFailures >= MAX_FAILURES) {
        log('error', '连续失败阈值到达', { failures: consecutiveFailures, threshold: MAX_FAILURES });
        sendAlert(`看门狗连续 ${MAX_FAILURES} 次探测失败。系统可能已不可用。`);
        attemptRestart();
        consecutiveFailures = 0;
      }
    }
  } catch (err) {
    consecutiveFailures++;
    log('error', '探测失败(网络错误)', { consecutiveFailures, error: err.message });

    if (consecutiveFailures >= MAX_FAILURES) {
      log('error', '连续网络错误阈值到达', { failures: consecutiveFailures, threshold: MAX_FAILURES });
      sendAlert(`看门狗连续 ${MAX_FAILURES} 次无法连接系统。系统可能已宕机。`);
      attemptRestart();
      consecutiveFailures = 0;
    }
  }

  const uptime = Math.floor((Date.now() - startTime) / 1000);
  log('info', '下次探测在 5 分钟后', { uptimeSeconds: uptime });
}

// ═══ 进程信号 ═══

process.on('SIGTERM', () => {
  log('info', '收到 SIGTERM，看门狗停止');
  isRunning = false;
  process.exit(0);
});

process.on('SIGINT', () => {
  log('info', '收到 SIGINT，看门狗停止');
  isRunning = false;
  process.exit(0);
});

// ═══ 启动 ═══

log('info', '看门狗启动', { port: PORT, interval: `${INTERVAL_MS / 1000}s`, timeout: `${TIMEOUT_MS / 1000}s` });

// 立即执行第一次探测
check().catch(err => {
  log('error', '首次探测异常', { error: err.message });
});

// 按间隔循环探测
const timer = setInterval(() => {
  check().catch(err => {
    log('error', '探测循环异常', { error: err.message });
  });
}, INTERVAL_MS);

timer.unref();
