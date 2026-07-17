/**
 * src/deploy/watchdog-entry.ts ? ????????? (D52-FIX)
 *
 * ?? docker-compose ?? watchdog sidecar ?????
 * ??????????????????????
 *
 * ??:
 *   @input  ? ????: WATCHDOG_MODE=true, PORT=3001
 *   @output ? ? 5min ???? + ???????? log.warn
 *   @degraded ? ???????????? log.warn + ??????
 *
 * ?? 24+31: catch + log.warn + degraded ??
 * ?? 38: ? as any
 */
import { createLogger } from '@synova/logger';
import { collectHealthSnapshot } from './system-self-ops';

const log = createLogger('watchdog');

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5min
const HEALTH_URL = process.env.WATCHDOG_TARGET_URL || 'http://localhost:3000/health';

interface HealthCheckResult {
  ok: boolean;
  statusCode: number;
  durationMs: number;
  error?: string;
}

async function checkMainProcess(): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    const res = await fetch(HEALTH_URL, {
      signal: AbortSignal.timeout(10000),
    });
    const durationMs = Date.now() - start;
    const ok = res.ok;
    if (!ok) {
      log.warn({ statusCode: res.status, durationMs }, '?????????');
    }
    return { ok, statusCode: res.status, durationMs };
  } catch (err) {
    const durationMs = Date.now() - start;
    log.error({ err, durationMs }, '??????????');
    return { ok: false, statusCode: 0, durationMs, error: String(err) };
  }
}

async function runWatchdog(): Promise<void> {
  log.info({ interval: '5min' }, '????????');

  async function tick(): Promise<void> {
    try {
      const health = await checkMainProcess();
      const snapshot = collectHealthSnapshot();

      if (health.ok) {
        log.info({ healthDurationMs: health.durationMs }, '?????????');
      } else {
        log.warn({
          healthOk: false,
          healthDurationMs: health.durationMs,
          snapshot,
        }, '???????? ? ??????????');
      }
    } catch (err) {
      log.error({ err }, '??? tick ?? ? ??????');
    }
  }

  // ?????????????
  const startupDelay = parseInt(process.env.WATCHDOG_STARTUP_DELAY_MS || '15000', 10);
  await new Promise((r) => setTimeout(r, startupDelay));

  // ?????????
  await tick();

  // ????
  const interval = setInterval(async () => {
    await tick();
  }, CHECK_INTERVAL_MS);

  // ????
  const shutdown = () => {
    log.info('??????????????');
    clearInterval(interval);
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

// ???
if (process.env.WATCHDOG_MODE === 'true') {
  runWatchdog().catch((err) => {
    log.error({ err }, '??? fatal ? ????');
    process.exit(1);
  });
}
