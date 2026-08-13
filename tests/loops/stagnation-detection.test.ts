/**
 * tests/loops/stagnation-detection.test.ts — D223 静默停滞检测测试
 *
 * 覆盖: 无停滞/单循环停滞/3周期停滞/心跳缺失 = 4 tests
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, rmSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { LoopScheduler } from '../../src/loops/loop-scheduler';
import type { HeartbeatRecord } from '../../src/loops/loop-scheduler';

const HB_FILE = join(process.cwd(), '.codex', 'heartbeat.json');

function cleanHb(): void {
  try { rmSync(HB_FILE, { force: true }); } catch { /* ok */ }
}

function writeHb(records: HeartbeatRecord[]): void {
  const dir = join(process.cwd(), '.codex');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(HB_FILE, JSON.stringify(records, null, 2), 'utf-8');
}

describe('Stagnation Detection', () => {
  let scheduler: LoopScheduler;

  beforeEach(() => { cleanHb(); scheduler = new LoopScheduler(); });
  afterEach(() => { cleanHb(); });

  it('心跳文件不存在 → unknown + degraded', async () => {
    cleanHb();
    // 注册 6 个循环
    const { LOOP_TRIGGER_MATRIX } = await import('../../src/loops/loop-trigger-config');
    for (const cfg of LOOP_TRIGGER_MATRIX) {
      scheduler.registerLoop(cfg);
    }
    const report = await scheduler.checkStagnation();
    // 无心跳记录 → 全部 unknown
    expect(report.unknown.length).toBeGreaterThanOrEqual(6);
    expect(report.degraded).toBe(true);
  });

  it('所有循环心跳正常 → stalled 为空', async () => {
    const now = new Date().toISOString();
    writeHb([
      { loopId: 'loop-1', loopName: 'Enterprise Diagnosis', lastOutputAt: now, cycleCount: 5 },
      { loopId: 'loop-2', loopName: 'Department Navigation', lastOutputAt: now, cycleCount: 3 },
    ]);
    const { LOOP_TRIGGER_MATRIX } = await import('../../src/loops/loop-trigger-config');
    for (const cfg of LOOP_TRIGGER_MATRIX) {
      scheduler.registerLoop(cfg);
    }
    const report = await scheduler.checkStagnation();
    expect(report.stalled).toEqual([]);
    expect(report.healthy.length).toBeGreaterThanOrEqual(2);
  });

  it('loop-1 超 3 周期 → stalled', async () => {
    const old = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(); // 4 天前
    const recent = new Date().toISOString();
    writeHb([
      { loopId: 'loop-1', loopName: 'Enterprise Diagnosis', lastOutputAt: old, cycleCount: 1 },
      { loopId: 'loop-2', loopName: 'Department Navigation', lastOutputAt: recent, cycleCount: 3 },
    ]);
    scheduler.registerLoop({
      loopId: 'loop-1', loopName: 'Enterprise Diagnosis',
      scales: [
        { name: 'fast', period: '0 9 * * *', triggerType: 'cron', coverage: '', condition: '' },
        { name: 'medium', period: '0 9 1 * *', triggerType: 'cron', coverage: '', condition: '' },
        { name: 'slow', period: '0 9 1 */3 *', triggerType: 'cron', coverage: '', condition: '' },
      ],
    });
    scheduler.registerLoop({
      loopId: 'loop-2', loopName: 'Department Navigation',
      scales: [
        { name: 'fast', period: '0 * * * *', triggerType: 'cron', coverage: '', condition: '' },
        { name: 'medium', period: '0 9 * * 1', triggerType: 'cron', coverage: '', condition: '' },
        { name: 'slow', period: '0 9 1 * *', triggerType: 'cron', coverage: '', condition: '' },
      ],
    });
    const report = await scheduler.checkStagnation();
    expect(report.stalled).toContain('loop-1');
    expect(report.healthy).toContain('loop-2');
  });

  it('recordHeartbeat → 写入心跳文件', async () => {
    scheduler.registerLoop({
      loopId: 'loop-test', loopName: 'Test',
      scales: [{ name: 'fast', period: '0 0 * * *', triggerType: 'cron', coverage: '', condition: '' }],
    });
    scheduler.recordHeartbeat('loop-test');
    expect(existsSync(HB_FILE)).toBe(true);
    const raw = JSON.parse(require('fs').readFileSync(HB_FILE, 'utf-8'));
    expect(raw.length).toBe(1);
    expect(raw[0].loopId).toBe('loop-test');
    expect(raw[0].cycleCount).toBe(1);
  });
});
