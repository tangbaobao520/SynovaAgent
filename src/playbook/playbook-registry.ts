/**
 * src/playbook/playbook-registry.ts — Playbook 注册表单例
 *
 * 对标 D65 SkillRegistry 的单例 + 构造函数模式。
 * 管理所有已加载的 Playbook 定义。
 */
import type { PlaybookDefinition } from './playbook-types';

export class PlaybookRegistry {
  private playbooks = new Map<string, PlaybookDefinition>();

  /** 注册一个 Playbook。同名时覆盖。 */
  register(playbook: PlaybookDefinition): void {
    this.playbooks.set(playbook.id, playbook);
  }

  /** 按 ID 获取 Playbook。不存在时返回 undefined。 */
  get(id: string): PlaybookDefinition | undefined {
    return this.playbooks.get(id);
  }

  /** 注销一个 Playbook。返回 true 表示实际删除。 */
  unregister(id: string): boolean {
    return this.playbooks.delete(id);
  }

  /** 返回全部已注册 Playbook 的数组。 */
  list(): PlaybookDefinition[] {
    return [...this.playbooks.values()];
  }

  /** 清空注册表（主要用于测试）。 */
  clear(): void {
    this.playbooks.clear();
  }
}

/** 全局单例实例 */
export const playbookRegistry = new PlaybookRegistry();
