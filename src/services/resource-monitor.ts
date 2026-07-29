/**
 * services/resource-monitor.ts — 资源监控模块 (D265)
 *
 * 权威17 §四.4: 通过 Python psutil 获取 CPU/内存/磁盘跨平台指标。
 * psutil 比 Node.js 的 os 模块提供更准确的 CPU 采样和磁盘使用率。
 *
 * 铁律 24+31: catch + log.warn + degraded
 * 铁律 38: 零 as any
 */
import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { mkdirSync, writeFileSync, unlinkSync } from 'fs';
import { createLogger } from '@synova/logger';

const log = createLogger('services/resource-monitor');

/** 资源快照 */
export interface ResourceSnapshot {
  cpuPercent: number;
  memPercent: number;
  diskPercent: number;
  timestamp: string;
}

const PYTHON_SCRIPT = `
import psutil, json
print(json.dumps({
  "cpuPercent": psutil.cpu_percent(interval=0.5),
  "memPercent": psutil.virtual_memory().percent,
  "diskPercent": psutil.disk_usage('/').percent,
}))
`;

/**
 * 获取当前服务器资源快照。
 *
 * 内部通过 Python psutil 获取跨平台指标。
 * psutil 不可用时降级返回全 0 + degraded 标记。
 *
 * @returns ResourceSnapshot
 */
export function getResourceSnapshot(): ResourceSnapshot {
  const ts = new Date().toISOString();
  try {
    const runner = join(__dirname, '../../.codex/tmp/resource-monitor-runner.py');
    mkdirSync(dirname(runner), { recursive: true });
    writeFileSync(runner, PYTHON_SCRIPT, 'utf-8');
    const result = execSync(`python3 "${runner}"`, {
      encoding: 'utf-8', timeout: 5000,
    }).trim();
    try { unlinkSync(runner); } catch { /* ignore */ }
    const data = JSON.parse(result) as { cpuPercent: number; memPercent: number; diskPercent: number };
    return {
      cpuPercent: Math.round(data.cpuPercent * 10) / 10,
      memPercent: Math.round(data.memPercent * 10) / 10,
      diskPercent: Math.round(data.diskPercent * 10) / 10,
      timestamp: ts,
    };
  } catch (err) {
    log.warn({ err }, '资源监控获取失败 — 降级返回空数据');
    return {
      cpuPercent: 0, memPercent: 0, diskPercent: 0,
      timestamp: ts,
      degraded: true,
    } as ResourceSnapshot & { degraded: boolean };
  }
}

/**
 * 获取资源健康状态。
 * healthy: 全部 < 80%
 * degraded: 任一 >= 80%
 * critical: 任一 >= 95%
 */
export function getResourceHealth(snapshot: ResourceSnapshot): 'healthy' | 'degraded' | 'critical' {
  const max = Math.max(snapshot.cpuPercent, snapshot.memPercent, snapshot.diskPercent);
  if (max >= 95) return 'critical';
  if (max >= 80) return 'degraded';
  return 'healthy';
}
