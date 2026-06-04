/**
 * security/file-guard.ts — 文件安全拒绝列表 (Hermes #6: 三层文件安全防御)
 *
 * 参考 Hermes tool_executor.py 的 FILE_DENYLIST (精确路径 + 前缀匹配)
 * + 跨 profile 保护检测。
 *
 * Synova 的场景不同于 Hermes:
 *  - Hermes 执行任意 shell 命令 + 文件写入
 *  - Synova 主要风险在连接器子进程读取宿主文件
 *
 * 三层防御:
 *   1. 写入拒绝: 系统关键路径禁止写入
 *   2. 读取拒绝: 凭据文件禁止读取
 *   3. 跨边界保护: 检测访问是否越出工作目录
 */
import * as path from 'path';
import * as os from 'os';

// ═══ Layer 1: 写入拒绝列表 (Hermes FILE_DENYLIST) ═══

const WRITE_DENY_EXACT = new Set([
  // SSH / 密钥
  path.join(os.homedir(), '.ssh'),
  path.join(os.homedir(), '.ssh', 'authorized_keys'),
  path.join(os.homedir(), '.ssh', 'id_rsa'),
  path.join(os.homedir(), '.ssh', 'id_ed25519'),
  // AWS
  path.join(os.homedir(), '.aws'),
  path.join(os.homedir(), '.aws', 'credentials'),
  path.join(os.homedir(), '.aws', 'config'),
  // 系统
  '/etc/passwd', '/etc/shadow', '/etc/sudoers',
  '/etc/hosts', '/etc/resolv.conf',
  'C:\\Windows\\System32',
  'C:\\Windows\\System32\\drivers',
]);

const WRITE_DENY_PREFIXES = [
  path.join(os.homedir(), '.ssh'),
  path.join(os.homedir(), '.aws'),
  path.join(os.homedir(), '.gnupg'),
  '/etc/',
  '/boot/',
  'C:\\Windows\\',
  'C:\\Program Files\\',
  'C:\\Program Files (x86)\\',
];

// ═══ Layer 2: 读取拒绝列表 (凭据/敏感文件) ═══

const READ_DENY_PATTERNS = [
  /\.env$/,
  /\.env\.\w+$/,
  /credentials\.json$/,
  /auth\.json$/,
  /secret/i,
  /\.pem$/,
  /id_rsa/,
  /id_ed25519/,
  /known_hosts$/,
];

// ═══ File Guard ═══

export interface FileAccessDecision {
  allowed: boolean;
  reason?: string;
}

export class FileGuard {
  private workDir: string;

  constructor(workDir: string = process.cwd()) {
    this.workDir = path.resolve(workDir);
  }

  /** Check if a file can be written to */
  canWrite(filePath: string): FileAccessDecision {
    const resolved = path.resolve(filePath);

    // Layer 1: exact match
    if (WRITE_DENY_EXACT.has(resolved)) {
      return { allowed: false, reason: `写入被拒绝: ${resolved} 在系统保护列表中` };
    }

    // Layer 1: prefix match
    for (const prefix of WRITE_DENY_PREFIXES) {
      if (resolved.startsWith(prefix + path.sep) || resolved === prefix) {
        return { allowed: false, reason: `写入被拒绝: ${resolved} 在系统保护路径中 (${prefix})` };
      }
    }

    // Layer 3: cross-boundary check
    return this.checkBoundary(resolved, 'write');
  }

  /** Check if a file can be read */
  canRead(filePath: string): FileAccessDecision {
    const resolved = path.resolve(filePath);

    // Layer 2: credential file patterns
    const basename = path.basename(resolved);
    for (const pattern of READ_DENY_PATTERNS) {
      if (pattern.test(basename)) {
        return { allowed: false, reason: `读取被拒绝: ${basename} 匹配凭据文件模式 ${pattern}` };
      }
    }

    // Layer 3: cross-boundary check
    return this.checkBoundary(resolved, 'read');
  }

  /** Layer 3: 检测是否越出工作目录 */
  private checkBoundary(resolved: string, operation: string): FileAccessDecision {
    // 允许工作目录内的所有访问
    if (resolved.startsWith(this.workDir + path.sep) || resolved === this.workDir) {
      return { allowed: true };
    }

    // 允许临时目录
    const tmpDir = os.tmpdir();
    if (resolved.startsWith(tmpDir + path.sep) || resolved === tmpDir) {
      return { allowed: true };
    }

    // 允许用户目录下的应用数据 (synova 数据目录)
    const synovaData = path.join(os.homedir(), '.synova-agent');
    if (resolved.startsWith(synovaData + path.sep) || resolved === synovaData) {
      return { allowed: true };
    }

    // 其他路径: 只读允许, 写入拒绝
    if (operation === 'write') {
      return { allowed: false, reason: `写入被拒绝: ${resolved} 不在工作目录内` };
    }
    return { allowed: true };
  }

  /** Set a different work directory (e.g. for connector sandbox) */
  setWorkDir(dir: string): void {
    this.workDir = path.resolve(dir);
  }
}

// ═══ Singleton ═══

let _instance: FileGuard | null = null;

export function getFileGuard(workDir?: string): FileGuard {
  if (!_instance) _instance = new FileGuard(workDir);
  return _instance;
}
