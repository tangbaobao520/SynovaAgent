/**
 * src/skill/skill-registry.ts — D65 Skill 注册表单例
 *
 * SkillRegistry 管理所有已加载的 Skill 定义。
 * 单例模式，通过 export 实例供全局使用。
 *
 * 设计:
 *   - Map 存储，O(1) 查找
 *   - register 同名覆盖（priority: custom > industry > builtin）
 *   - unregister 返回 boolean 表示是否实际删除
 */
import type { LoadedSkill } from './skill-loader';

export class SkillRegistry {
  private skills = new Map<string, LoadedSkill>();

  /** 注册一个 Skill。同名时覆盖已有（priority 决定覆盖顺序）。 */
  register(skill: LoadedSkill): void {
    this.skills.set(skill.manifest.name, skill);
  }

  /** 按名称获取 Skill。不存在时返回 undefined。 */
  get(name: string): LoadedSkill | undefined {
    return this.skills.get(name);
  }

  /** 注销一个 Skill。返回 true 表示实际删除。 */
  unregister(name: string): boolean {
    return this.skills.delete(name);
  }

  /** 返回全部已注册 Skill 的数组（复制，非引用）。 */
  list(): LoadedSkill[] {
    return [...this.skills.values()];
  }

  /** 清空注册表（主要用于测试）。 */
  clear(): void {
    this.skills.clear();
  }
}

/** 全局单例实例 */
export const skillRegistry = new SkillRegistry();
