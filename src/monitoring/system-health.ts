/**
 * src/monitoring/system-health.ts — 系统健康审计 (L4)
 *
 * D49: 第9份权威文档 §3.5。
 * SystemHealthAudit 类收集 7 项系统健康指标。
 * 数据来源: log + 哨兵 runner + D48 版本记录 + 看门狗日志。
 *
 * 每次诊断报告强制插入"系统健康审计"章节。
 * 向老板客观汇报——用数据判断"数字员工有没有在偷懒"。
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createLogger } from '@synova/logger';
import { getDataDirectory } from '../deploy/data-directory';

const log = createLogger('monitoring/system-health');

/** 系统健康审计报告 */
export interface SystemHealthReport {
  /** 过去 30 天系统可用率 (0-100) */
  uptime30d: number | null;
  /** 上次备份信息（D50 后接入，当前返回 null） */
  lastBackup: BackupInfo | null;
  /** 数据延迟次数 (累计) */
  dataDelayCount: number;
  /** 活跃哨兵数量 / 总哨兵数 */
  activeSentinels: SentinelSummary;
  /** 看门狗重启次数 */
  watchdogRestartCount: number;
  /** Agent 版本号 */
  agentVersion: string;
  /** 累计诊断次数 */
  totalDiagnosisCount: number;
  /** 报告生成时间 */
  collectedAt: string;
}

/** 备份信息（D50 产出后接入） */
export interface BackupInfo {
  lastBackupAt: string;
  success: boolean;
  sizeBytes: number;
  detail?: string;
}

/** 哨兵摘要 */
export interface SentinelSummary {
  active: number;
  total: number;
}

/** 可用率区间 */
interface UptimeInterval {
  startTime: number;
  endTime: number;
  wasUp: boolean;
}

/**
 * 系统健康审计类。
 * 收集 7 项指标，数据来源均为日志和系统记录（非用户感知）。
 */
export class SystemHealthAudit {
  private dataDir: string;
  private logDir: string;

  constructor() {
    this.dataDir = getDataDirectory();
    this.logDir = path.join(this.dataDir, '..', 'logs');
  }

  /**
   * 执行全量审计，收集 7 项指标。
   * 每项独立 try-catch，单点失败不阻断其他。
   */
  async audit(): Promise<SystemHealthReport> {
    const [uptime30d, lastBackup, dataDelayCount, activeSentinels, watchdogRestartCount, agentVersion, totalDiagnosisCount] =
      await Promise.all([
        this.collectUptime30d().catch((err: unknown) => {
          log.warn({ err }, '可用率采集失败');
          return null;
        }),
        this.collectLastBackup().catch(() => null),
        this.collectDataDelayCount().catch(() => 0),
        this.collectActiveSentinels().catch(() => ({ active: 0, total: 0 })),
        this.collectWatchdogRestartCount().catch(() => 0),
        this.collectAgentVersion().catch(() => '0.0.0'),
        this.collectTotalDiagnosisCount().catch(() => 0),
      ]);

    const report: SystemHealthReport = {
      uptime30d,
      lastBackup,
      dataDelayCount,
      activeSentinels,
      watchdogRestartCount,
      agentVersion,
      totalDiagnosisCount,
      collectedAt: new Date().toISOString(),
    };

    log.info({ activeSentinels: report.activeSentinels, watchdogRestartCount: report.watchdogRestartCount }, '系统健康审计完成');
    return report;
  }

  // ─── 指标 1: 过去 30 天可用率 ───

  /**
   * 从看门狗日志分析过去 30 天系统可用率。
   * 统计日志中 OK 行 / (OK 行 + ERROR 行) 的比例。
   */
  private async collectUptime30d(): Promise<number | null> {
    const watchdogLog = path.join(os.homedir(), '.synova', 'logs', 'watchdog.log');
    if (!fs.existsSync(watchdogLog)) return null;

    const content = fs.readFileSync(watchdogLog, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());

    if (lines.length === 0) return null;

    // 只分析最近 30 天的日志
    const thirtyDaysAgo = Date.now() - 30 * 86400000;
    const recentLines = lines.filter(l => {
      const match = l.match(/\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/);
      if (!match) return true; // 无法解析日期的默认计入
      return new Date(match[1]).getTime() > thirtyDaysAgo;
    });

    if (recentLines.length === 0) return null;

    const okCount = recentLines.filter(l => l.includes('[INFO]') || l.includes('健康')).length;
    const errorCount = recentLines.filter(l => l.includes('[ERROR]') || l.includes('[WARN]')).length;
    const total = okCount + errorCount;

    if (total === 0) return null;
    return Math.round((okCount / total) * 100);
  }

  // ─── 指标 2: 上次备份（D50 待接入） ───

  /**
   * 获取上次备份信息。
   * 当前返回 null — D50 恢复包产出后接入。
   */
  private async collectLastBackup(): Promise<BackupInfo | null> {
    // D50 TODO: 接入备份记录
    return null;
  }

  // ─── 指标 3: 数据延迟次数 ───

  /**
   * 从 data-quality-gate 日志统计数据延迟次数。
   * 扫描 D47 数据目录中 quality gate 标记文件。
   */
  private async collectDataDelayCount(): Promise<number> {
    const qualityDir = path.join(this.logDir, 'quality');
    if (!fs.existsSync(qualityDir)) return 0;

    let delayCount = 0;
    try {
      const files = fs.readdirSync(qualityDir);
      for (const file of files) {
        if (file.includes('delay') || file.includes('stale')) {
          delayCount++;
        }
      }
    } catch {
      // 无 quality 目录时返回 0
    }
    return delayCount;
  }

  // ─── 指标 4: 活跃哨兵数量 ───

  /**
   * 统计活跃哨兵数量 / 总哨兵数。
   * 通过 sentinel-loader 获取（如果可用）或扫描目录。
   */
  private async collectActiveSentinels(): Promise<SentinelSummary> {
    try {
      // 尝试加载哨兵（可能失败 — 独立审计不应强依赖哨兵模块）
      const loader = await import('../sentinel/sentinel-loader');
      const { sentinels, degraded } = loader.loadSentinels();
      return {
        active: degraded ? 0 : sentinels.length,
        total: sentinels.length,
      };
    } catch {
      // 哨兵模块不可用 — 回退到目录扫描
      const sentinelDir = path.join(process.cwd(), 'extensions', 'sentinels');
      if (!fs.existsSync(sentinelDir)) {
        return { active: 0, total: 0 };
      }
      const dirs = fs.readdirSync(sentinelDir).filter(d => !d.startsWith('_'));
      return { active: dirs.length, total: dirs.length };
    }
  }

  // ─── 指标 5: 看门狗重启次数 ───

  /**
   * 从看门狗日志统计重启次数。
   */
  private async collectWatchdogRestartCount(): Promise<number> {
    const watchdogLog = path.join(os.homedir(), '.synova', 'logs', 'watchdog.log');
    if (!fs.existsSync(watchdogLog)) return 0;

    const content = fs.readFileSync(watchdogLog, 'utf-8');
    const restartMatches = content.match(/尝试重启主进程/g);
    return restartMatches ? restartMatches.length : 0;
  }

  // ─── 指标 6: Agent 版本号 ───

  /**
   * 获取 Agent 版本号。
   * 从 package.json 或版本记录文件读取。
   */
  private async collectAgentVersion(): Promise<string> {
    // 尝试从 D48 版本记录读取
    const versionFile = path.join(this.dataDir, '.synova-registry');
    if (fs.existsSync(versionFile)) {
      try {
        const content = fs.readFileSync(versionFile, 'utf-8');
        const versionMatch = content.match(/version:\s*([\d.]+)/);
        if (versionMatch) return versionMatch[1];
      } catch (err: unknown) {
        log.warn({ err }, '无法读取版本记录文件 — 降级');
      }
    }

    // 回退到 package.json
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8'));
      return pkg.version || '0.0.0';
    } catch (err: unknown) {
      log.warn({ err }, '无法读取 package.json 版本 — 返回 0.0.0');
      return '0.0.0';
    }
  }

  // ─── 指标 7: 累计诊断次数 ───

  /**
   * 统计累计诊断次数。
   * 从日志或诊断记录文件读取。
   */
  private async collectTotalDiagnosisCount(): Promise<number> {
    const diagnosisLog = path.join(this.logDir, 'diagnosis');
    if (!fs.existsSync(diagnosisLog)) {
      // 回退到哨兵 finding 计数
      try {
        const { loadSentinels } = await import('../sentinel/sentinel-loader');
        const { sentinels } = loadSentinels();
        const totalFindings = sentinels.reduce((sum: number, s) => {
          return sum + (s.manifest.computes?.length || 0);
        }, 0);
        return Math.min(totalFindings, 99999); // 防止溢出
      } catch (err: unknown) {
        log.warn({ err }, '哨兵加载失败 — 诊断计数返回 0');
        return 0;
      }
    }

    try {
      const files = fs.readdirSync(diagnosisLog).filter(f => f.endsWith('.json'));
      return files.length;
    } catch (err: unknown) {
      log.warn({ err }, '诊断日志目录读取失败 — 返回 0');
      return 0;
    }
  }
}
