/**
 * security/connector-sandbox.ts — 连接器沙箱等级 + 安装门禁 + 安全审计 (P2-2.2/6.3/6.4)
 *
 * 参考 OpenClaw protocol-engine/mode-presets.ts + marketplace/skill-registry.ts
 *
 * 沙箱等级:
 *   full: 子进程 + 网络限制 + 无文件系统
 *   semi: 子进程 + 只读临时目录
 *   none: 同进程 (仅内部连接器)
 *
 * 安装门禁: 4 道安全检查
 *   1. 安全评分门禁 (>=70)
 *   2. 黑名单门禁
 *   3. 来源门禁 (非 speculative)
 *   4. 能力匹配门禁 (工具不超范围)
 *
 * 安全审计: 7 步静态分析
 */
import { createLogger } from '@synova/logger';

const log = createLogger('security/connector-sandbox');

// ═══ 2.2: 沙箱等级 ═══

export type SandboxLevel = 'full' | 'semi' | 'none';

export interface SandboxConfig {
  level: SandboxLevel;
  /** 允许的网络端点 (full 模式) */
  allowedEndpoints?: string[];
  /** 超时 ms */
  timeoutMs: number;
  /** 临时目录 (semi 模式, 用完即焚) */
  tempDir?: string;
}

export const DEFAULT_SANDBOX: Record<SandboxLevel, Omit<SandboxConfig, 'level'>> = {
  full: {
    allowedEndpoints: [],
    timeoutMs: 30_000,
  },
  semi: {
    timeoutMs: 60_000,
  },
  none: {
    timeoutMs: 300_000,
  },
};

/**
 * Determine sandbox level based on connector type and trust level.
 * - External connectors (feishu, crm, etc.): full
 * - Internal connectors (builtin tools): semi
 * - System connectors (logger, config): none
 */
export function determineSandboxLevel(connector: {
  name: string;
  isExternal: boolean;
  requiresNetwork: boolean;
  requiresFileSystem: boolean;
}): SandboxLevel {
  if (!connector.isExternal) {
    return connector.requiresFileSystem ? 'semi' : 'none';
  }
  if (connector.requiresNetwork && connector.requiresFileSystem) {
    return 'semi'; // Can't fully isolate if it needs both
  }
  return 'full';
}

// ═══ 6.3: 安装门禁 ═══

export interface InstallGateResult {
  passed: boolean;
  score: number;
  blockedReasons: string[];
  recommendedLevel: SandboxLevel;
}

const BLOCKLIST = [
  'rm -rf', 'sudo', 'chmod 777',
  'eval(', 'exec(',
  '/etc/passwd', '/etc/shadow',
];

const DANGEROUS_KEYWORDS = [
  'spawn', 'exec', 'child_process',
  'writeFile', 'unlink', 'rmdir',
  'http.get', 'https.request',
];

/**
 * 4 道安装门禁.
 */
export function securityGateCheck(connector: {
  name: string;
  source: string;
  code: string;
  requestedPermissions: string[];
}): InstallGateResult {
  const blockedReasons: string[] = [];

  // Gate 1: Blocklist check
  const codeLower = connector.code.toLowerCase();
  for (const item of BLOCKLIST) {
    if (codeLower.includes(item.toLowerCase())) {
      blockedReasons.push(`黑名单匹配: "${item}"`);
    }
  }

  // Gate 2: Source tier
  if (connector.source === 'speculative' || connector.source === 'unknown') {
    blockedReasons.push(`来源不可信: ${connector.source}`);
  }

  // Gate 3: Capability scope
  const dangerousPerms = connector.requestedPermissions.filter(p =>
    p.includes('file_write') || p.includes('network') || p.includes('process'));
  if (dangerousPerms.length > 0 && connector.source !== 'verified') {
    blockedReasons.push(`未验证来源请求高危权限: ${dangerousPerms.join(', ')}`);
  }

  // Gate 4: Security scoring (simplified heuristic)
  let score = 100;
  for (const kw of DANGEROUS_KEYWORDS) {
    if (codeLower.includes(kw.toLowerCase())) score -= 5;
  }
  if (connector.source !== 'verified') score -= 20;
  if (dangerousPerms.length > 2) score -= 15;

  const passed = blockedReasons.length === 0 && score >= 70;
  const recommendedLevel: SandboxLevel = score >= 85 ? 'semi' : 'full';

  log.info({ name: connector.name, score, passed, reasons: blockedReasons },
    '连接器安全门禁检查');

  return { passed, score, blockedReasons, recommendedLevel };
}

// ═══ 6.4: 安全审计 ═══

export interface AuditFinding {
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  description: string;
  location?: string;
}

export interface AuditReport {
  score: number;
  findings: AuditFinding[];
  passed: boolean;
}

/**
 * 7 步静态安全审计.
 * 参考 OpenClaw skill-security-audit.ts CloudTrip audit.
 */
export function auditConnectorCode(code: string, fileName: string): AuditReport {
  const findings: AuditFinding[] = [];
  const lines = code.split('\n');

  // Step 1: Dangerous keywords
  for (const kw of ['eval(', 'exec(', 'child_process', 'spawn(']) {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(kw)) {
        findings.push({
          severity: 'critical',
          category: 'dangerous_call',
          description: `检测到危险调用: ${kw}`,
          location: `${fileName}:${i + 1}`,
        });
      }
    }
  }

  // Step 2: File operations
  for (const kw of ['writeFile', 'unlink', 'rmdir', 'mkdir']) {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(kw)) {
        findings.push({
          severity: 'high',
          category: 'file_operation',
          description: `文件操作: ${kw}`,
          location: `${fileName}:${i + 1}`,
        });
      }
    }
  }

  // Step 3: Network calls
  for (const kw of ['http.get', 'https.request', 'fetch(']) {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(kw)) {
        findings.push({
          severity: 'medium',
          category: 'network_call',
          description: `网络调用: ${kw}`,
          location: `${fileName}:${i + 1}`,
        });
      }
    }
  }

  // Step 4: Hardcoded secrets
  for (const kw of ['sk-', 'ghp_', 'Bearer ', 'password', 'secret']) {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(kw) && !lines[i].includes('import') && !lines[i].includes('comment')) {
        findings.push({
          severity: 'critical',
          category: 'hardcoded_secret',
          description: `疑似硬编码凭据: ${kw}`,
          location: `${fileName}:${i + 1}`,
        });
      }
    }
  }

  // Step 5: Imports from remote
  for (const kw of ['https://', 'http://']) {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('import') && lines[i].includes(kw)) {
        findings.push({
          severity: 'high',
          category: 'remote_import',
          description: `远程导入: ${lines[i].trim().slice(0, 80)}`,
          location: `${fileName}:${i + 1}`,
        });
      }
    }
  }

  // Step 6: Process exit
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('process.exit')) {
      findings.push({
        severity: 'medium',
        category: 'process_control',
        description: '进程控制调用',
        location: `${fileName}:${i + 1}`,
      });
    }
  }

  // Step 7: Score calculation
  const criticalCount = findings.filter(f => f.severity === 'critical').length;
  const highCount = findings.filter(f => f.severity === 'high').length;
  const mediumCount = findings.filter(f => f.severity === 'medium').length;
  const score = Math.max(0, 100 - criticalCount * 20 - highCount * 10 - mediumCount * 3);

  return {
    score,
    findings,
    passed: score >= 70 && criticalCount === 0,
  };
}
