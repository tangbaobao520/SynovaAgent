/**
 * mcp/skill-audit-gate.ts — 云鼎审计门禁 (Task 5)
 *
 * 安装任何 Skill/MCP Server 前自动执行安全审计。
 * 基于腾讯云鼎实验室 7 步审计方法论。
 *
 * 门禁规则:
 *   - 评分 >= 70 → 允许安装
 *   - 评分 30-69 → 可疑，需人工确认
 *   - 评分 < 30 → 恶意，拒绝安装
 *
 * 参考: D:\novis-backup-20260526\Novis\server\src\services\skill-security-audit.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '../logger';

const log = createLogger('mcp/skill-audit');

// ═══ Audit Result ═══

export interface SkillAuditReport {
  skillName: string;
  score: number;
  level: 'malicious' | 'suspicious' | 'benign';
  findings: Array<{
    severity: 'critical' | 'high' | 'medium' | 'low';
    category: string;
    description: string;
    location?: string;
  }>;
  installable: boolean;
  blockReason?: string;
}

// ═══ 7 步静态审计 ═══

/**
 * Audit a skill directory before installation.
 * Pure static analysis — never executes skill code.
 */
export function auditSkillDirectory(skillDir: string): SkillAuditReport {
  const skillName = path.basename(skillDir);
  const findings: SkillAuditReport['findings'] = [];

  // Step 1: Read all files
  const files = readAllFiles(skillDir);
  const allContent = files.map(f => f.content).join('\n');
  const allContentLower = allContent.toLowerCase();

  // Step 2: Dangerous keyword scan
  const DANGER_KEYWORDS: Array<{ kw: string; severity: 'critical' | 'high' | 'medium'; cat: string }> = [
	    { kw: 'eval(', severity: 'critical', cat: 'code_execution' },
	    { kw: 'eval "', severity: 'critical', cat: 'code_execution' },
	    { kw: 'exec(', severity: 'critical', cat: 'code_execution' },
	    { kw: 'child_process', severity: 'critical', cat: 'process_spawn' },
	    { kw: 'spawn(', severity: 'critical', cat: 'process_spawn' },
	    { kw: 'rm -rf', severity: 'critical', cat: 'destructive' },
	    { kw: 'sudo', severity: 'critical', cat: 'privilege_escalation' },
	    { kw: 'chmod 777', severity: 'high', cat: 'permission_weakening' },
	    { kw: 'curl ', severity: 'critical', cat: 'remote_exec' },
	    { kw: '| bash', severity: 'critical', cat: 'remote_exec' },
	    { kw: '| sh', severity: 'critical', cat: 'remote_exec' },
	    { kw: '/etc/passwd', severity: 'critical', cat: 'credential_theft' },
	    { kw: '/etc/shadow', severity: 'critical', cat: 'credential_theft' },
	    { kw: '.ssh/', severity: 'high', cat: 'credential_theft' },
	    { kw: 'process.exit', severity: 'medium', cat: 'process_control' },
  ];

  for (const { kw, severity, cat } of DANGER_KEYWORDS) {
    if (allContentLower.includes(kw.toLowerCase())) {
      for (const f of files) {
        if (f.content.toLowerCase().includes(kw.toLowerCase())) {
          findings.push({
            severity, category: cat,
            description: `检测到危险模式: "${kw}"`,
            location: f.relativePath,
          });
        }
      }
    }
  }

  // Step 3: File operation analysis
  const FILE_OPS = ['writeFile', 'unlink', 'rmdir', 'mkdir', 'rename', 'chmod', 'chown'];
  for (const op of FILE_OPS) {
    if (allContentLower.includes(op.toLowerCase())) {
      findings.push({
        severity: 'high', category: 'file_operation',
        description: `文件操作: ${op}`,
      });
    }
  }

  // Step 4: Remote script detection
  const REMOTE_PATTERNS = ['https://', 'http://'];
  for (const p of REMOTE_PATTERNS) {
    if (allContentLower.includes(p.toLowerCase())) {
      findings.push({
        severity: 'high', category: 'remote_resource',
        description: `引用远程资源: ${p}`,
      });
    }
  }

  // Step 5: Dependency check
  const hasPackageJson = files.some(f => f.relativePath === 'package.json');
  if (hasPackageJson) {
    const pkgFile = files.find(f => f.relativePath === 'package.json');
    if (pkgFile) {
      try {
        const pkg = JSON.parse(pkgFile.content);
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        const depCount = Object.keys(deps).length;
        if (depCount > 10) {
          findings.push({
            severity: 'medium', category: 'supply_chain',
            description: `依赖数量较多 (${depCount})，扩大供应链攻击面`,
          });
        }
      } catch { /* invalid JSON */ }
    }
  }

  // Step 6: Score calculation
  const criticalCount = findings.filter(f => f.severity === 'critical').length;
  const highCount = findings.filter(f => f.severity === 'high').length;
  const mediumCount = findings.filter(f => f.severity === 'medium').length;
  const score = Math.max(0, 100 - criticalCount * 30 - highCount * 10 - mediumCount * 3);

  // Step 7: Risk level + install decision
  let level: SkillAuditReport['level'];
  let installable: boolean;
  let blockReason: string | undefined;

  if (score >= 70) {
    level = 'benign';
    installable = true;
  } else if (score >= 30) {
    level = 'suspicious';
    installable = false;
    blockReason = `安全评分 ${score}/100 (可疑)，需人工审查确认`;
  } else {
    level = 'malicious';
    installable = false;
    blockReason = `安全评分 ${score}/100 (恶意)，拒绝安装。包含 ${criticalCount} 个严重风险项。`;
  }

  log.info({ skillName, score, level, findings: findings.length },
    'Skill 安全审计完成');

  return { skillName, score, level, findings, installable, blockReason };
}

// ═══ Helpers ═══

function readAllFiles(dir: string): Array<{ relativePath: string; content: string }> {
  const results: Array<{ relativePath: string; content: string }> = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.git') {
      results.push(...readAllFiles(fullPath));
    } else if (entry.isFile()) {
      try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        results.push({ relativePath: entry.name, content });
      } catch { /* binary file */ }
    }
  }
  return results;
}
