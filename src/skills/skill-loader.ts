/**
 * skills/skill-loader.ts — 技能加载器 (Batch 2 #5)
 *
 * 扫描 skills/ 目录 → 解析 SKILL.md → 注入到 system prompt
 * 对标 Claude Code SKILL.md 模式
 */
import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '@synova/logger';

const log = createLogger('skills/loader');

export interface SkillDefinition {
  name: string;
  version: string;
  description: string;
  whenToUse: string;
  requiredTools: string[];
  allowedTools?: string[];
  dependsOn?: string[];
  steps: string[];
}

function parseSkillMd(content: string): SkillDefinition | null {
  const lines = content.split('\n');
  const meta: Record<string, string> = { requiredTools: '', allowedTools: '', dependsOn: '' };
  let inFrontmatter = false;
  let inSteps = false;
  const steps: string[] = [];

  for (const line of lines) {
    if (line.trim() === '---') { inFrontmatter = !inFrontmatter; continue; }
    if (inFrontmatter) {
      const m = line.match(/^(\w+):\s*(.+)$/);
      if (m) meta[m[1]] = m[2].trim();
    }
    if (line.startsWith('## 执行步骤')) { inSteps = true; continue; }
    if (inSteps && line.match(/^\d+\./)) steps.push(line.replace(/^\d+\.\s*/, '').trim());
  }

  if (!meta.name || !meta.version) return null;
  return {
    name: meta.name, version: meta.version,
    description: meta.description || '', whenToUse: meta.whenToUse || '',
    requiredTools: meta.requiredTools ? meta.requiredTools.replace(/[\[\]]/g, '').split(',').map(s => s.trim()) : [],
    allowedTools: meta.allowedTools ? meta.allowedTools.replace(/[\[\]]/g, '').split(',').map(s => s.trim()) : undefined,
    dependsOn: meta.dependsOn ? meta.dependsOn.replace(/[\[\]]/g, '').split(',').map(s => s.trim()) : undefined,
    steps,
  };
}

export function loadSkills(skillsDir: string): SkillDefinition[] {
  if (!fs.existsSync(skillsDir)) return [];
  const skills: SkillDefinition[] = [];
  for (const entry of fs.readdirSync(skillsDir)) {
    const skillPath = path.join(skillsDir, entry, 'SKILL.md');
    if (fs.existsSync(skillPath)) {
      try {
        const content = fs.readFileSync(skillPath, 'utf-8');
        const skill = parseSkillMd(content);
        if (skill) skills.push(skill);
      } catch (err) { log.debug({ err }, '技能加载跳过无效文件'); }
    }
  }
  return skills;
}

export function injectToSystemPrompt(skills: SkillDefinition[], basePrompt: string): string {
  if (skills.length === 0) return basePrompt;
  const skillSection = skills.map(s =>
    `## 技能: ${s.name}\n${s.description}\n触发: ${s.whenToUse}\n工具: ${s.requiredTools.join(', ')}\n${s.steps.map((st, i) => `${i + 1}. ${st}`).join('\n')}`
  ).join('\n\n');
  return `${basePrompt}\n\n---\n# 可用诊断技能\n${skillSection}\n\n强制规则: 生成发现前必须执行 cross_validate。未通过验证的发现标记为"待验证"。`;
}
