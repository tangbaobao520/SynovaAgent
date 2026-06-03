/**
 * skill-auditor.ts — L4 技能可执行性 + 安全审计
 *
 * 在 Phase D 之后、Phase E 之前运行。
 * 对生成的每个 SkillCard 执行可执行性检查和云鼎实验室安全审计。
 * 审计结果非阻塞：失败技能只记录到 notes，不中断管道。
 */

import type { SkillSetBlue, SkillCard } from '../types';
import { getEngineContext, type SecurityAuditReport } from '../engine-context';
import { createLogger } from '../infra/logger';

const log = createLogger('engine-server/pipeline/skill-auditor');

export interface SkillAuditEntry {
  skillId: string;
  skillName: string;
  roleId: string;
  executability: {
    hasScenarios: boolean;
    hasSteps: boolean;
    stepsSufficient: boolean;
    passed: boolean;
  };
  securityAudit: SecurityAuditReport | null;
  overall: 'pass' | 'warn' | 'fail';
}

export interface SkillAuditResult {
  entries: SkillAuditEntry[];
  passed: number;
  warned: number;
  failed: number;
  overallPass: boolean;
}

function auditExecutability(skill: SkillCard): SkillAuditEntry['executability'] {
  const hasScenarios = Array.isArray(skill.scenarios) && skill.scenarios.length >= 1;
  const hasSteps = Array.isArray(skill.steps) && skill.steps.length >= 2;
  const stepsSufficient = skill.steps.length >= 2;

  return {
    hasScenarios,
    hasSteps,
    stepsSufficient,
    passed: hasScenarios && stepsSufficient,
  };
}

function buildSkillAuditContent(skill: SkillCard): string {
  return [
    `# ${skill.name}`,
    skill.summary || '',
    skill.description || '',
    `## Scenarios`,
    ...(skill.scenarios || []).map(s => `- ${s}`),
    `## Steps`,
    ...(skill.steps || []).map(s => `- ${s}`),
  ].join('\n');
}

/** 对 Phase D 产出的所有技能执行可执行性+安全审计 */
export function auditSkills(skillSets: SkillSetBlue[]): SkillAuditResult {
  const entries: SkillAuditEntry[] = [];

  for (const ss of skillSets) {
    for (const skill of ss.skills) {
      const exec = auditExecutability(skill);

      let securityAudit: SecurityAuditReport | null = null;
      try {
        const content = buildSkillAuditContent(skill);
        securityAudit = getEngineContext().securityAudit.auditExtension('skill', content, skill.name);
        skill.securityScore = securityAudit.score;
      } catch (err) {
        log.warn(`[skill-auditor] 安全审计失败: ${skill.name} — ${(err as Error).message}`);
        skill.securityScore = null;
      }

      const overall: SkillAuditEntry['overall'] =
        !exec.passed ? 'fail' :
        securityAudit && securityAudit.level === 'danger' ? 'fail' :
        securityAudit && securityAudit.level === 'critical' ? 'fail' :
        securityAudit && securityAudit.level === 'warning' ? 'warn' :
        'pass';

      entries.push({
        skillId: skill.id,
        skillName: skill.name,
        roleId: ss.roleId,
        executability: exec,
        securityAudit,
        overall,
      });
    }
  }

  const passed = entries.filter(e => e.overall === 'pass').length;
  const warned = entries.filter(e => e.overall === 'warn').length;
  const failed = entries.filter(e => e.overall === 'fail').length;

  log.info(`[skill-auditor] 审计 ${entries.length} 技能: ${passed}通过 ${warned}警告 ${failed}不可执行`);

  return {
    entries,
    passed,
    warned,
    failed,
    overallPass: failed === 0,
  };
}
