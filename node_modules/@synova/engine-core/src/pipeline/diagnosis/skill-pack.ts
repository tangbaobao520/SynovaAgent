/**
 * skill-pack.ts — Skill 打包系统 (A7)
 *
 * 对标 Hermes Skill: 知识手艺人将方法论、本体模板、专家提示词、
 * 诊断模块、数据适配器打包为一个可发现、可加载、可发布的 Skill 包。
 *
 * Skill 包结构:
 *   skills/{skill-name}/
 *     SKILL.md              — 元数据 (name, version, author, description, dependencies)
 *     modules/              — 自定义诊断模块 (DiagnosticModule[])
 *     experts/              — 专家提示词 (ExpertDefinition[])
 *     templates/            — 本体模板 (OntologyTemplate[])
 *     adapters/             — 数据适配器 (OntologyAdapter[])
 *     knowledge/            — 专家知识 (ExpertKnowledgeEntry[])
 *     rules/                — 诊断规则 (DecisionRule[])
 */

import type { DiagnosticModule, OntologyRole } from './module-registry';
import type { ExpertKnowledgeEntry, ExpertType } from './types';
import type { OntologyTemplate } from './ontology-templates/index';
import type { DecisionRule } from './decision-engine';
import type { OntologyAdapter } from './ontology-adapter';
import { registerModule } from './module-registry';
import { addExpertKnowledge } from './expert-knowledge';
import { registerAdapter } from './ontology-adapter';
import { createLogger } from '../../infra/logger';

const log = createLogger('diagnosis/skill-pack');

// ═══ Types ═══

export interface SkillDefinition {
  name: string;
  version: string;
  author: string;
  description: string;
  /** 依赖的其他 Skill */
  dependencies?: string[];
  /** 内置模块 */
  modules?: Array<Omit<DiagnosticModule, 'ontologyRole'> & { ontologyRole?: OntologyRole }>;
  /** 专家提示词 */
  experts?: Array<{ type: ExpertType; systemPrompt: string; description: string }>;
  /** 本体模板 */
  templates?: OntologyTemplate[];
  /** 数据适配器 */
  adapters?: OntologyAdapter[];
  /** 专家知识 */
  knowledge?: ExpertKnowledgeEntry[];
  /** 诊断规则 */
  rules?: DecisionRule[];
}

export interface SkillManifest {
  name: string;
  version: string;
  author: string;
  installedAt: string;
  modulesCount: number;
  expertsCount: number;
  templatesCount: number;
  adaptersCount: number;
}

// ═══ Registry ═══

const installedSkills = new Map<string, SkillManifest>();

/** 安装 Skill 包: 扫描定义 → 注册模块/适配器/知识 */
export function installSkill(skill: SkillDefinition): SkillManifest {
  const now = new Date().toISOString();

  // 注册模块
  let modulesCount = 0;
  if (skill.modules) {
    for (const mod of skill.modules) {
      registerModule({ ...mod, ontologyRole: mod.ontologyRole || 'analyzer' } as DiagnosticModule);
      modulesCount++;
    }
  }

  // 注册知识
  let expertsCount = 0;
  if (skill.experts) {
    for (const exp of skill.experts) {
      // Expert prompts are injected via expert-prompts.ts — here we just track the count
      expertsCount++;
    }
  }

  // 注册本体模板
  let templatesCount = 0;
  if (skill.templates) {
    templatesCount = skill.templates.length;
    // Templates are added to ontology-templates/index.ts registry
  }

  // 注册适配器
  let adaptersCount = 0;
  if (skill.adapters) {
    for (const adapter of skill.adapters) {
      registerAdapter(adapter);
      adaptersCount++;
    }
  }

  // 注册知识条目
  if (skill.knowledge) {
    for (const entry of skill.knowledge) {
      addExpertKnowledge(entry.expertType, entry);
    }
  }

  const manifest: SkillManifest = {
    name: skill.name, version: skill.version, author: skill.author,
    installedAt: now, modulesCount, expertsCount, templatesCount, adaptersCount,
  };
  installedSkills.set(skill.name, manifest);

  log.info({ name: skill.name, version: skill.version, modules: modulesCount, adapters: adaptersCount }, '[skill-pack] Installed');
  return manifest;
}

/** 卸载 Skill (仅移除跟踪, 实际模块需重启生效) */
export function uninstallSkill(name: string): boolean {
  return installedSkills.delete(name);
}

/** 列出已安装的 Skill */
export function listInstalledSkills(): SkillManifest[] {
  return [...installedSkills.values()];
}

/** 获取已安装的 Skill */
export function getInstalledSkill(name: string): SkillManifest | undefined {
  return installedSkills.get(name);
}

/** 清空 (测试用) */
export function clearSkillRegistry(): void {
  installedSkills.clear();
}
