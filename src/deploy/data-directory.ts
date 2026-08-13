/**
 * src/deploy/data-directory.ts — 三平台数据目录注册
 *
 * D47: 首次启动检查所用。为 Synova 数据目录提供平台标准路径。
 *
 * 平台映射（约束2: 使用平台标准路径）:
 *   Windows → %LOCALAPPDATA%/Synova/data
 *   macOS   → ~/Library/Application Support/Synova/data
 *   Linux   → $XDG_DATA_HOME/Synova/data (fallback ~/.local/share/Synova/data)
 *
 * 接口:
 *   getDataDirectory(): string — 返回平台数据目录路径(不保证存在)
 *   registerDataDirectory(): { path: string; created: boolean } — 创建目录并返回结果
 */
import * as path from 'path';
import * as fs from 'fs';
import { createLogger } from '@synova/logger';

const log = createLogger('deploy/data-directory');

/**
 * 获取 Synova 数据目录的平台标准路径。
 * 不创建目录，不抛出异常。
 *
 * @returns 平台数据目录的绝对路径
 */
export function getDataDirectory(): string {
  const appName = 'Synova';

  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || 'C:\\', 'AppData', 'Local');
    return path.join(localAppData, appName, 'data');
  }

  if (process.platform === 'darwin') {
    const home = process.env.HOME || '/tmp';
    return path.join(home, 'Library', 'Application Support', appName, 'data');
  }

  // Linux / others
  const xdgDataHome = process.env.XDG_DATA_HOME || path.join(process.env.HOME || '/tmp', '.local', 'share');
  return path.join(xdgDataHome, appName, 'data');
}

/**
 * 注册(创建) Synova 数据目录。
 * 创建目录树 + 写入 .synova-registry 标记文件表示注册完成。
 *
 * @returns { path, created } — 目录路径 + 是否新建(true=刚创建, false=已存在)
 */
export function registerDataDirectory(): { path: string; created: boolean } {
  const dataDir = getDataDirectory();
  const markerFile = path.join(dataDir, '.synova-registry');

  try {
    if (fs.existsSync(dataDir)) {
      log.debug({ path: dataDir }, '数据目录已存在');
      return { path: dataDir, created: false };
    }

    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(markerFile, `registered: ${new Date().toISOString()}\n`, 'utf-8');
    log.info({ path: dataDir }, '数据目录已创建并注册');
    return { path: dataDir, created: true };
  } catch (err: unknown) {
    log.error({ err, path: dataDir }, '数据目录创建失败');
    // 降级: 失败时仍返回路径，启动检查会标记警告
    return { path: dataDir, created: false };
  }
}
