/**
 * services/update-checker.ts — 版本更新检测 (借鉴 Hermes banner.py)
 *
 * 三层检测策略:
 *   1. Git fetch → 计算落后 origin/main 的 commit 数
 *   2. 本地缓存 (6h TTL) — 避免频繁 git fetch
 *   3. 离线降级 — 网络不可用时静默跳过
 *
 * Hermes 参考:
 *   - banner.py:220 check_for_updates() — 三层策略
 *   - banner.py:124 缓存 6 小时
 *   - banner.py:682-703 横幅显示 "N commits behind"
 *   - main.py:8720 cmd_update() — git pull / pip install
 *
 * Web 版本: 服务器重启即更新，不需要客户端检测。
 * TUI/CLI 版本: 启动时检查 + 用户手动 /update。
 */
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '../logger';

const log = createLogger('services/update-checker');

// ═══ Constants ═══

/** 缓存文件路径 */
const CACHE_FILE = path.join(
  process.env.HOME || process.env.USERPROFILE || '/tmp',
  '.synova', '.update_check',
);

/** 缓存 TTL (6小时, 同 Hermes) */
const CACHE_TTL_MS = 6 * 3600_000;

/** 远程仓库 URL */
const REMOTE_REPO_URL = 'https://github.com/ClawOrg-cn/ClawOrg.git';

// ═══ Types ═══

export interface UpdateCheckResult {
  /** 是否有更新 */
  hasUpdate: boolean;
  /** 当前本地版本 */
  currentVersion: string;
  /** 落后 origin/main 的 commit 数 */
  commitsBehind: number;
  /** 推荐更新命令 */
  recommendedCommand: string;
  /** 检测时间 */
  checkedAt: string;
  /** 检测方法 */
  method: 'git' | 'cache' | 'offline';
  /** 最新远程版本标签 (如果有) */
  latestTag?: string;
}

// ═══ Version ═══

/** 从 package.json 读取唯一版本源 (铁律 28) */
export function getCurrentVersion(): string {
  const candidates = [
    path.join(__dirname, '..', 'package.json'),
    path.join(process.cwd(), 'package.json'),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        return JSON.parse(fs.readFileSync(p, 'utf-8')).version || '0.0.0';
      }
    } catch { /* continue */ }
  }
  return '0.0.0';
}

// ═══ Cache ═══

interface CacheData {
  commitsBehind: number;
  checkedAt: string;
  latestTag?: string;
}

function readCache(): CacheData | null {
  try {
    if (!fs.existsSync(CACHE_FILE)) return null;
    const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8')) as CacheData;
    if (Date.now() - new Date(data.checkedAt).getTime() < CACHE_TTL_MS) {
      return data;
    }
  } catch { /* cache expired or corrupt */ }
  return null;
}

function writeCache(data: CacheData): void {
  try {
    const dir = path.dirname(CACHE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(data));
  } catch { /* non-critical */ }
}

// ═══ Detection ═══

/** 检测是否在 git 仓库中 */
function isGitRepo(): boolean {
  try {
    execSync('git rev-parse --git-dir', { stdio: 'ignore', timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

/** 检测安装方法 (借鉴 Hermes detect_install_method) */
export function detectInstallMethod(): 'git' | 'npm' | 'docker' | 'unknown' {
  try {
    if (fs.existsSync('/.dockerenv')) return 'docker';
    // Check for .git directory
    if (isGitRepo()) return 'git';
    // Check for npm global install
    const npmGlobal = execSync('npm list -g synova-agent 2>/dev/null', { timeout: 3000 }).toString();
    if (npmGlobal.includes('synova-agent')) return 'npm';
  } catch { /* fall through */ }
  return 'unknown';
}

/** 推荐更新命令 (借鉴 Hermes recommended_update_command) */
export function recommendedUpdateCommand(): string {
  const method = detectInstallMethod();
  switch (method) {
    case 'git': return 'git pull origin main && npm install';
    case 'npm': return 'npm install -g synova-agent@latest';
    case 'docker': return 'docker pull claworg/synova-agent:latest';
    default: return 'git pull origin main && npm install';
  }
}

// ═══ Main ═══

/**
 * 检查更新 (借鉴 Hermes check_for_updates + 缓存)
 *
 * 三层策略:
 *   1. 读取缓存 (6h TTL) → 快速返回
 *   2. Git fetch + rev-list → 计算落后 commit 数
 *   3. 网络不可用 → 静默降级
 */
export async function checkForUpdates(): Promise<UpdateCheckResult> {
  const currentVersion = getCurrentVersion();
  const baseResult: UpdateCheckResult = {
    hasUpdate: false, currentVersion,
    commitsBehind: 0,
    recommendedCommand: recommendedUpdateCommand(),
    checkedAt: new Date().toISOString(),
    method: 'offline',
  };

  // ═══ 第 1 层: 缓存 ═══
  const cached = readCache();
  if (cached) {
    return {
      ...baseResult,
      hasUpdate: cached.commitsBehind > 0,
      commitsBehind: cached.commitsBehind,
      checkedAt: cached.checkedAt,
      method: 'cache',
      latestTag: cached.latestTag,
    };
  }

  // ═══ 第 2 层: Git fetch (借鉴 Hermes git ls-remote / rev-list) ═══
  if (!isGitRepo()) {
    log.debug('非 git 仓库，跳过 git 更新检查');
    return baseResult;
  }

  try {
    // Fetch origin (quiet, timeout 15s)
    execSync('git fetch origin --quiet', {
      stdio: 'ignore', timeout: 15000,
    });

    // Count commits behind origin/main
    const countStr = execSync('git rev-list --count HEAD..origin/main', {
      timeout: 5000, encoding: 'utf-8',
    }).trim();
    const commitsBehind = parseInt(countStr) || 0;

    // Try to get latest tag
    let latestTag: string | undefined;
    try {
      latestTag = execSync('git describe --tags --abbrev=0 origin/main 2>/dev/null', {
        timeout: 3000, encoding: 'utf-8',
      }).trim();
    } catch { /* no tags */ }

    // Write cache
    writeCache({
      commitsBehind, latestTag,
      checkedAt: new Date().toISOString(),
    });

    return {
      ...baseResult,
      hasUpdate: commitsBehind > 0,
      commitsBehind,
      method: 'git',
      latestTag,
    };
  } catch (err: any) {
    log.debug({ err: err.message }, 'Git fetch 失败，降级为离线模式');
    return baseResult;
  }
}

/**
 * 格式化更新提示消息 (借鉴 Hermes banner)
 *
 * Hermes banner.py:682-703:
 *   "⚠ {N} commits behind — run '{recommended_update_command()}'"
 */
export function formatUpdateMessage(result: UpdateCheckResult): string | null {
  if (!result.hasUpdate) return null;

  if (result.commitsBehind > 0) {
    const tagInfo = result.latestTag ? ` (最新标签: ${result.latestTag})` : '';
    return [
      `⚠ 发现更新: 落后 ${result.commitsBehind} 个提交${tagInfo}`,
      `   执行更新: ${result.recommendedCommand}`,
      `   当前版本: ${result.currentVersion}`,
    ].join('\n');
  }

  return null;
}
