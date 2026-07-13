/**
 * src/deploy/rollback.ts — 快照回滚机制
 *
 * D48: 第9份权威文档 第二章。基于 D47 数据目录的快照恢复。
 * 约束3: 快照不存在时警告不阻断 — {success:false, available:false, warnings:[]}。
 *
 * 接口:
 *   createSnapshot(path?): SnapshotResult — 创建当前数据快照
 *   rollbackToSnapshot(path?): RollbackResult — 从快照恢复
 *   listSnapshots(): string[] — 列出可用快照
 */
import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '@synova/logger';
import { getDataDirectory } from './data-directory';

const log = createLogger('deploy/rollback');

const SNAPSHOTS_DIR = '_snapshots';

/** 快照创建结果 */
export interface SnapshotResult {
  path: string;
  created: boolean;
  size: number;
  error?: string;
}

/** 回滚结果 */
export interface RollbackResult {
  success: boolean;
  /** 是否有快照可用 */
  available: boolean;
  warnings: string[];
  path?: string;
  error?: string;
}

/** 快照元数据 */
interface SnapshotMeta {
  createdAt: string;
  sourceDir: string;
  fileCount: number;
  totalBytes: number;
}

/**
 * 创建当前数据目录的快照。
 * 如果快照目录已存在同名快照，不会覆盖。
 *
 * @param snapshotName — 可选快照名称，默认使用时间戳
 * @returns SnapshotResult
 */
export function createSnapshot(snapshotName?: string): SnapshotResult {
  const dataDir = getDataDirectory();
  const snapshotsRoot = path.join(dataDir, SNAPSHOTS_DIR);
  const name = snapshotName || `snapshot-${Date.now()}`;
  const destDir = path.join(snapshotsRoot, name);

  try {
    // 确保快照根目录存在
    if (!fs.existsSync(snapshotsRoot)) {
      fs.mkdirSync(snapshotsRoot, { recursive: true });
    }

    // 如果快照已存在，不覆盖
    if (fs.existsSync(destDir)) {
      log.warn({ path: destDir }, '快照已存在，跳过创建');
      const size = getDirSize(destDir);
      return { path: destDir, created: false, size };
    }

    // 复制数据目录到快照
    copyDirSync(dataDir, destDir, [SNAPSHOTS_DIR]);
    const size = getDirSize(destDir);

    // 写入元数据
    const meta: SnapshotMeta = {
      createdAt: new Date().toISOString(),
      sourceDir: dataDir,
      fileCount: countFiles(destDir),
      totalBytes: size,
    };
    fs.writeFileSync(path.join(destDir, '.snapshot-meta.json'), JSON.stringify(meta, null, 2), 'utf-8');

    log.info({ path: destDir, size, name }, '快照创建完成');
    return { path: destDir, created: true, size };
  } catch (err: unknown) {
    const msg = `快照创建失败: ${(err as Error)?.message || String(err)}`;
    log.error({ err, destDir }, msg);
    return { path: destDir, created: false, size: 0, error: msg };
  }
}

/**
 * 从快照恢复数据。
 * 约束3: 快照不存在时降级 — 返回 {available:false, warnings:[]}。
 *
 * @param snapshotPath — 快照路径，不指定时使用最新快照
 * @returns RollbackResult
 */
export function rollbackToSnapshot(snapshotPath?: string): RollbackResult {
  const dataDir = getDataDirectory();
  let snapDir: string;

  if (snapshotPath) {
    snapDir = snapshotPath;
  } else {
    // 使用最新快照
    const snapshots = listSnapshots();
    if (snapshots.length === 0) {
      log.warn('无可用快照 — 降级');
      return { success: false, available: false, warnings: ['无可用快照，跳过回滚'], path: undefined };
    }
    snapDir = snapshots[snapshots.length - 1];
  }

  if (!fs.existsSync(snapDir)) {
    log.warn({ path: snapDir }, '快照路径不存在 — 降级');
    return { success: false, available: false, warnings: [`快照路径不存在: ${snapDir}`], path: snapDir };
  }

  try {
    // 验证快照元数据
    const metaFile = path.join(snapDir, '.snapshot-meta.json');
    if (!fs.existsSync(metaFile)) {
      log.warn({ path: snapDir }, '快照缺少 .snapshot-meta.json — 仍尝试恢复');
    }

    // 备份当前数据 (先重命名)
    const backupDir = path.join(dataDir, `_pre-rollback-${Date.now()}`);
    if (fs.existsSync(dataDir)) {
      // 排除快照目录和备份目录
      const entries = fs.readdirSync(dataDir).filter((e) => !e.startsWith('_'));
      if (entries.length > 0) {
        fs.mkdirSync(backupDir, { recursive: true });
        for (const entry of entries) {
          const src = path.join(dataDir, entry);
          const dest = path.join(backupDir, entry);
          fs.renameSync(src, dest);
        }
      }
    }

    // 从快照复制数据
    copyDirSync(snapDir, dataDir, ['.snapshot-meta.json']);

    log.info({ path: snapDir, backupPath: backupDir }, '回滚完成');
    return {
      success: true,
      available: true,
      warnings: [],
      path: snapDir,
    };
  } catch (err: unknown) {
    const msg = `回滚执行失败: ${(err as Error)?.message || String(err)}`;
    log.error({ err, snapDir }, msg);
    return { success: false, available: true, warnings: [msg], path: snapDir, error: msg };
  }
}

/**
 * 列出所有可用快照。
 *
 * @returns 快照目录路径列表 (按创建时间排序)
 */
export function listSnapshots(): string[] {
  const dataDir = getDataDirectory();
  const snapshotsRoot = path.join(dataDir, SNAPSHOTS_DIR);

  try {
    if (!fs.existsSync(snapshotsRoot)) {
      return [];
    }

    const entries = fs.readdirSync(snapshotsRoot, { withFileTypes: true });
    const dirs = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map((e) => path.join(snapshotsRoot, e.name))
      .sort((a, b) => {
        // 按 mtime 排序 (新的在后)
        return fs.statSync(a).mtimeMs - fs.statSync(b).mtimeMs;
      });

    return dirs;
  } catch (err: unknown) {
    log.error({ err }, '列出快照失败');
    return [];
  }
}

// ─── 工具函数 ───

/** 递归复制目录，忽略指定子目录 */
function copyDirSync(src: string, dest: string, ignoreDirs: string[] = []): void {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (ignoreDirs.includes(entry.name)) continue;

    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath, ignoreDirs);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/** 递归计算目录大小 */
function getDirSize(dir: string): number {
  let size = 0;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        size += getDirSize(fullPath);
      } else {
        size += fs.statSync(fullPath).size;
      }
    }
  } catch {
    // 忽略权限错误
  }
  return size;
}

/** 递归统计文件数 */
function countFiles(dir: string): number {
  let count = 0;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.name === '.snapshot-meta.json') continue;
      if (entry.isDirectory()) {
        count += countFiles(fullPath);
      } else {
        count++;
      }
    }
  } catch {
    // 忽略
  }
  return count;
}
