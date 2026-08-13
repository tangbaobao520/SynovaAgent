/**
 * src/deploy/backup-scheduler.ts — 备份调度器 (D50)
 *
 * 第9份权威文档 §4.3 机会窗口备份策略。
 * 24小时间隔 + 启动时检测错过窗口 + 手动触发。
 *
 * 接口:
 *   BackupScheduler.schedule(): void
 *   BackupScheduler.checkMissedWindow(): void
 *   BackupScheduler.triggerManual(): BackupStatus
 *   BackupScheduler.getStatus(): BackupStatus
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createLogger } from '@synova/logger';
import { getDataDirectory } from './data-directory';
import { RecoveryPackBuilder } from './recovery-pack';

const log = createLogger('deploy/backup-scheduler');

/** 备份状态 */
export interface BackupStatus {
  lastBackupAt: string | null;
  lastBackupPath: string | null;
  lastBackupSize: number | null;
  nextScheduledAt: string | null;
  consecutiveFailures: number;
  missedWindows: number;
  isRunning: boolean;
  totalBackups: number;
}

/** 调度器状态记录 */
interface SchedulerState {
  lastBackupAt: string;
  lastBackupPath: string;
  lastBackupSize: number;
  consecutiveFailures: number;
  missedWindows: number;
  totalBackups: number;
  lastScheduledAt: string;
}

const INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 小时
const MAX_CONSECUTIVE_FAILURES = 3;
const STATE_FILE = 'scheduler-state.json';
const BACKUP_PASSWORD_ENV = 'SYNOVA_BACKUP_PASSWORD';

/**
 * 备份调度器。
 * 机会窗口备份策略: 错过窗口 → 立即补齐。
 */
export class BackupScheduler {
  private dataDir: string;
  private statePath: string;
  private state: SchedulerState;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor() {
    this.dataDir = getDataDirectory();
    this.statePath = path.join(this.dataDir, '_scheduler', STATE_FILE);
    this.state = this.loadState();
  }

  /**
   * 从磁盘加载调度器状态。
   */
  private loadState(): SchedulerState {
    try {
      if (fs.existsSync(this.statePath)) {
        const content = fs.readFileSync(this.statePath, 'utf-8');
        return JSON.parse(content);
      }
    } catch (err: unknown) {
      log.warn({ err }, '无法加载调度器状态 — 使用默认值');
    }

    return {
      lastBackupAt: '',
      lastBackupPath: '',
      lastBackupSize: 0,
      consecutiveFailures: 0,
      missedWindows: 0,
      totalBackups: 0,
      lastScheduledAt: '',
    };
  }

  /**
   * 保存调度器状态到磁盘。
   */
  private saveState(): void {
    try {
      const stateDir = path.dirname(this.statePath);
      if (!fs.existsSync(stateDir)) {
        fs.mkdirSync(stateDir, { recursive: true });
      }
      fs.writeFileSync(this.statePath, JSON.stringify(this.state, null, 2), 'utf-8');
    } catch (err: unknown) {
      log.warn({ err }, '保存调度器状态失败');
    }
  }

  /**
   * 执行一次备份。
   */
  private async performBackup(): Promise<boolean> {
    if (this.running) {
      log.debug('备份已在执行中');
      return false;
    }

    this.running = true;
    try {
      // 获取备份密码。未设置时跳过备份(不阻断启动)。
      const password = process.env[BACKUP_PASSWORD_ENV];
      if (!password) {
        log.warn('SYNOVA_BACKUP_PASSWORD 未设置 — 跳过自动备份');
        this.running = false;
        return false;
      }

      const builder = new RecoveryPackBuilder();
      const result = builder.createRecoveryPack(password);

      if (result.created) {
        this.state.lastBackupAt = result.meta.createdAt;
        this.state.lastBackupPath = result.path;
        this.state.lastBackupSize = result.size;
        this.state.consecutiveFailures = 0;
        this.state.totalBackups++;
        this.state.lastScheduledAt = new Date().toISOString();
        this.saveState();
        log.info({ path: result.path, size: result.size }, '定时备份完成');
        return true;
      }

      // 备份失败
      this.state.consecutiveFailures++;
      this.saveState();

      if (this.state.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        this.notifyBackupDelayed();
      }

      log.warn({ consecutiveFailures: this.state.consecutiveFailures, error: result.error }, '定时备份失败');
      return false;
    } catch (err: unknown) {
      log.warn({ err: err instanceof Error ? err.message : String(err) }, "定时备份执行异常");
      this.state.consecutiveFailures++;
      this.saveState();
      log.error({ err, consecutiveFailures: this.state.consecutiveFailures }, '定时备份异常');
      return false;
    } finally {
      this.running = false;
    }
  }

  /**
   * 推送"备份已延迟"通知。
   */
  private notifyBackupDelayed(): void {
    const daysSinceBackup = this.state.lastBackupAt
      ? Math.floor((Date.now() - new Date(this.state.lastBackupAt).getTime()) / 86400000)
      : 0;

    const message = `备份已延迟 ${daysSinceBackup} 天，建议手动触发备份。连续 ${this.state.consecutiveFailures} 次失败。`;

    // 通过 D6 通知 API 推送 (静默降级)
    log.warn({ message }, '备份连续失败通知');

    try {
      const http = require('http');
      const postData = JSON.stringify({
        title: 'Synova 备份延迟告警',
        body: message.substring(0, 200),
        priority: 'high',
      });
      const PORT = process.env.PORT || '3000';
      const req = http.request({
        hostname: 'localhost', port: parseInt(PORT, 10),
        path: '/api/notifications/send', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) },
        timeout: 5000,
      }, (res: { statusCode: number }) => {
        log.debug({ statusCode: res.statusCode }, '备份延迟通知已发送');
      });
      req.on('error', (err: Error) => {
        log.warn({ err }, '备份延迟通知发送失败(D6不可用)');
      });
      req.write(postData);
      req.end();
    } catch (err) {
      log.warn({ err: err instanceof Error ? err.message : String(err) }, "备份模块加载");
      // D6 不可用 — 预期降级
    }
  }

  /**
   * 注册 24 小时间隔定时器。
   */
  schedule(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }

    this.timer = setInterval(() => {
      this.performBackup().catch((err: unknown) => {
        log.error({ err }, '定时备份循环异常');
      });
    }, INTERVAL_MS);

    // 使定时器不阻止进程退出
    if (this.timer && typeof this.timer === 'object' && 'unref' in this.timer) {
      this.timer.unref();
    }

    const nextTime = new Date(Date.now() + INTERVAL_MS).toISOString();
    this.state.lastScheduledAt = nextTime;
    this.saveState();

    log.info({ nextBackup: nextTime, interval: '24h' }, '备份调度器已启动');
  }

  /**
   * 启动时检测是否错过了备份窗口。
   * 如果上次备份超过 24 小时，立即执行一次。
   */
  checkMissedWindow(): void {
    if (!this.state.lastBackupAt) {
      log.info('从未备份过 — 立即执行首次备份');
      this.performBackup().catch((err: unknown) => {
        log.error({ err }, '首次备份失败');
      });
      return;
    }

    const lastBackup = new Date(this.state.lastBackupAt).getTime();
    const elapsed = Date.now() - lastBackup;

    if (elapsed > INTERVAL_MS + 60000) { // 24小时 + 1分钟宽容
      const missedDays = Math.floor(elapsed / INTERVAL_MS);
      this.state.missedWindows += missedDays;
      this.saveState();
      log.warn({ missedWindows: this.state.missedWindows, hoursSinceBackup: Math.floor(elapsed / 3600000) }, '检测到错过备份窗口 — 立即补齐');

      this.performBackup().catch((err: unknown) => {
        log.error({ err }, '错过窗口补齐备份失败');
      });
    } else {
      log.debug({ hoursSinceBackup: Math.floor(elapsed / 3600000) }, '备份在窗口内');
    }
  }

  /**
   * 手动触发备份。
   *
   * @returns BackupStatus — 备份后的最新状态
   */
  triggerManual(): BackupStatus {
    log.info('手动触发备份');
    this.performBackup().catch((err: unknown) => {
      log.error({ err }, '手动备份失败');
    });
    return this.getStatus();
  }

  /**
   * 查询当前备份状态。
   *
   * @returns BackupStatus
   */
  getStatus(): BackupStatus {
    const lastTime = this.state.lastBackupAt ? new Date(this.state.lastBackupAt).getTime() : 0;
    const nextTime = lastTime > 0 ? new Date(lastTime + INTERVAL_MS).toISOString() : null;

    return {
      lastBackupAt: this.state.lastBackupAt || null,
      lastBackupPath: this.state.lastBackupPath || null,
      lastBackupSize: this.state.lastBackupSize || null,
      nextScheduledAt: nextTime,
      consecutiveFailures: this.state.consecutiveFailures,
      missedWindows: this.state.missedWindows,
      isRunning: this.running,
      totalBackups: this.state.totalBackups,
    };
  }

  /**
   * 停止定时器 (清理用)。
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
