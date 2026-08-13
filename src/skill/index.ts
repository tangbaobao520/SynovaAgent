/**
 * src/skill/index.ts — Skill 子系统公共导出
 *
 * D65 Phase 1: 提供 SkillLoader + SkillRegistry 的统一入口。
 */
export { loadSkills, clearSkillCache, registerLoadedSkills } from './skill-loader';
export type { SkillManifest, LoadedSkill } from './skill-loader';
export { skillRegistry, SkillRegistry } from './skill-registry';
