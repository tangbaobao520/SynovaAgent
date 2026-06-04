/**
 * mcp/skill-installer.ts — Skill 自动安装器 (Task 4)
 *
 * 安装流程:
 *   1. scan(skillDir) → 读取 manifest.json
 *   2. audit(skillDir) → 云鼎 7 步安全审计
 *   3. install(skillDir) → 注册到 ExtensionRegistry + ToolRegistry
 *
 * 用户只需在对话中说"安装 XXX"，系统自动完成安装。
 */
import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '../logger';
import { auditSkillDirectory } from './skill-audit-gate';
import type { SkillAuditReport } from './skill-audit-gate';

const log = createLogger('mcp/skill-installer');

// ═══ Types ═══

export interface SkillManifest {
  name: string;
  version: string;
  description: string;
  type: 'tool' | 'expert' | 'connector' | 'template';
  entryPoint?: string;
  tools?: Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    operationType?: 'read' | 'write' | 'admin';
  }>;
  expertType?: string;
  expertPrompt?: string;
  dependencies?: string[];
}

export interface InstallResult {
  success: boolean;
  auditReport: SkillAuditReport;
  installedTools: string[];
  error?: string;
}

// ═══ SkillInstaller ═══

export class SkillInstaller {
  private baseDir: string;

  constructor(baseDir = 'vendor/mcp-servers') {
    this.baseDir = baseDir;
  }

  /** Step 1: Scan a skill directory for manifest */
  scan(skillDir: string): SkillManifest | null {
    const manifestPath = path.join(skillDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      // Try SKILL.md as a minimal skill
      const skillMdPath = path.join(skillDir, 'SKILL.md');
      if (fs.existsSync(skillMdPath)) {
        const content = fs.readFileSync(skillMdPath, 'utf-8');
        const name = path.basename(skillDir);
        const titleMatch = content.match(/^#\s+(.+)/m);
        return {
          name,
          version: '0.1.0',
          description: titleMatch ? titleMatch[1] : name,
          type: 'tool',
        };
      }
      return null;
    }

    try {
      const raw = fs.readFileSync(manifestPath, 'utf-8');
      return JSON.parse(raw) as SkillManifest;
    } catch (err: any) {
      log.warn({ err: err.message, skillDir }, 'manifest.json 解析失败');
      return null;
    }
  }

  /** Step 2: Run security audit */
  audit(skillDir: string): SkillAuditReport {
    return auditSkillDirectory(skillDir);
  }

  /** Step 3: Install — audit pass → register to ToolRegistry + ExtensionRegistry */
  async install(
    skillDir: string,
    toolRegistry?: { register(tool: { name: string; description: string; parameters: Record<string, unknown>; handler: (p: Record<string, unknown>) => Promise<Record<string, unknown>> }): void },
    extensionRegistry?: { register<T>(manifest: { name: string; version: string; description: string; type: string; entryPoint?: string }, impl: T): unknown },
  ): Promise<InstallResult> {
    const manifest = this.scan(skillDir);
    if (!manifest) {
      return { success: false, auditReport: { skillName: path.basename(skillDir), score: 0, level: 'malicious', findings: [], installable: false }, installedTools: [], error: '无法读取 skill manifest' };
    }

    const auditReport = this.audit(skillDir);
    if (!auditReport.installable) {
      return { success: false, auditReport, installedTools: [], error: auditReport.blockReason || '安全审计未通过' };
    }

    const installedTools: string[] = [];

    // Register tools
    if (manifest.tools && toolRegistry) {
      for (const tool of manifest.tools) {
        toolRegistry.register({
          name: tool.name,
          description: `[${manifest.name}] ${tool.description}`,
          parameters: { type: 'object', properties: tool.parameters },
          handler: async (params) => {
            // Dynamic import of the tool implementation
            const impl = await import(path.resolve(skillDir, manifest.entryPoint || 'index.js'));
            return impl[tool.name] ? impl[tool.name](params) : { error: `工具 ${tool.name} 未在入口文件中导出` };
          },
        });
        installedTools.push(tool.name);
      }
    }

    // Register expert type
    if (manifest.expertType && manifest.expertPrompt) {
      try {
        const { getExpertRegistry } = await import('../l3/expert-registry');
        getExpertRegistry().register(manifest.expertType, manifest.expertPrompt);
        installedTools.push(`expert:${manifest.expertType}`);
      } catch { /* expert registry unavailable */ }
    }

    // Register to ExtensionRegistry
    if (extensionRegistry) {
      extensionRegistry.register(
        { name: manifest.name, version: manifest.version, description: manifest.description, type: manifest.type, entryPoint: manifest.entryPoint },
        { manifest, installedAt: new Date().toISOString() },
      );
    }

    log.info({ name: manifest.name, tools: installedTools }, 'Skill 安装完成');
    return { success: true, auditReport, installedTools };
  }

  /** Discover all skills in the base directory */
  discover(): SkillManifest[] {
    const manifests: SkillManifest[] = [];
    if (!fs.existsSync(this.baseDir)) return manifests;

    const entries = fs.readdirSync(this.baseDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const dir = path.join(this.baseDir, entry.name);
      const manifest = this.scan(dir);
      if (manifest) manifests.push(manifest);
    }
    return manifests;
  }
}

// ═══ Singleton ═══

let _instance: SkillInstaller | null = null;
export function getSkillInstaller(baseDir?: string): SkillInstaller {
  if (!_instance) _instance = new SkillInstaller(baseDir);
  return _instance;
}
