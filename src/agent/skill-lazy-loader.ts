/**
 * agent/skill-lazy-loader.ts — 渐进式技能加载器 (Era C3)
 *
 * 技能注册时只注入 name + description (~100 chars)。
 * 专家 ReAct 循环中请求使用该技能时，再加载完整 prompt。
 * 对标: OpenClaw 三级 Skill 加载 (workspace > user-global > built-in)
 *
 * 铁律 39: L2 编排层 — 管理技能生命周期，不直接操作 L4/L5。
 */

import { createLogger } from '@synova/logger';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

const log = createLogger('agent/skill-lazy-loader');

// ═══ Types ═══

export interface SkillStub {
  name: string;
  description: string;         // ≤ 200 chars — 注入到上下文的摘要
  fullPrompt?: string;         // 完整 prompt — 按需加载
  /** 加载来源 */
  source: 'builtin' | 'workspace' | 'custom';
  /** 文件路径 (workspace 来源时) */
  filePath?: string;
  /** 激活条件 — 什么情况下这个 skill 应该被加载 */
  activationKeywords?: string[];
}

// ═══ SkillLazyLoader ═══

export class SkillLazyLoader {
  private stubs = new Map<string, SkillStub>();
  /** expertType → skill name[] 映射 */
  private expertIndex = new Map<string, string[]>();

  /**
   * 注册一个 skill (只存 stub)。
   * 来源: 扫描 expert/{name}/SKILLS.md 或 knowledge/ 目录
   */
  register(stub: SkillStub): void {
    if (this.stubs.has(stub.name)) {
      log.warn({ name: stub.name }, 'Skill 重复注册, 覆盖旧值');
    }
    // 截断 description 确保不超过 200 字符
    const truncated = { ...stub, description: stub.description.slice(0, 200) };
    this.stubs.set(stub.name, truncated);
    log.debug({ name: stub.name, source: stub.source }, 'Skill stub 已注册');
  }

  /**
   * 根据专家查询，返回匹配的 skill stub 列表 (不含 fullPrompt)。
   * 用于注入到专家的 system prompt 中作为"可用技能目录"。
   */
  listForExpert(expertType: string): SkillStub[] {
    const names = this.expertIndex.get(expertType);
    if (!names || names.length === 0) return [];
    return names
      .map(n => this.stubs.get(n))
      .filter((s): s is SkillStub => s !== undefined)
      .map(s => ({ name: s.name, description: s.description, source: s.source }));
  }

  /**
   * 按需加载完整 prompt — 专家 ReAct 循环中调用。
   * 命中则返回 fullPrompt, 未命中返回 null。
   */
  loadFull(name: string): string | null {
    const stub = this.stubs.get(name);
    if (!stub) return null;
    // 如果已有 fullPrompt 直接返回
    if (stub.fullPrompt) return stub.fullPrompt;
    // 尝试从文件系统加载
    if (stub.filePath) {
      try {
        if (existsSync(stub.filePath)) {
          const content = readFileSync(stub.filePath, 'utf-8');
          stub.fullPrompt = content;
          return content;
        }
      } catch (err: unknown) {
        log.warn({ err, name, filePath: stub.filePath }, 'Skill 文件加载失败');
      }
    }
    return null;
  }

  /**
   * 从文件系统扫描 skills (workspace > built-in 优先级)。
   * 扫描路径: skills/{category}/*.md  (v2.1: 多文件格式)
   *           skills/{category}/SKILLS.md  (兼容旧格式)
   *           skills/*.md  (知识文件)
   *
   * 自动从目录名提取 expert category → linkToExpert()
   */
  scanFromFiles(baseDir: string): number {
    let count = 0;
    try {
      if (!existsSync(baseDir)) {
        log.debug({ baseDir }, 'Skill 扫描目录不存在, 跳过');
        return 0;
      }
      const entries = readdirSync(baseDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) {
          // skills/*.md — 知识文件 (旧格式兼容)
          if (entry.name.endsWith('.md') && entry.name !== 'SKILLS.md') {
            const knowledgePath = join(baseDir, entry.name);
            const content = readFileSync(knowledgePath, 'utf-8');
            const name = entry.name.replace(/\.md$/, '');
            const firstLine = content.split('\n')[0] || '';
            const description = firstLine.replace(/^#\s*/, '').slice(0, 200) || name;
            this.register({
              name: `knowledge-${name}`,
              description,
              fullPrompt: content,
              source: 'workspace',
              filePath: knowledgePath,
            });
            count++;
          }
          continue;
        }

        // ═══ skills/{category}/ — 扫描目录下所有 .md 文件 ═══
        const categoryDir = join(baseDir, entry.name);
        const expertType = entry.name; // 目录名 = expert type (strategy/org/finance...)
        let categoryCount = 0;

        try {
          const skillFiles = readdirSync(categoryDir, { withFileTypes: true });
          for (const skillFile of skillFiles) {
            if (!skillFile.isFile() || !skillFile.name.endsWith('.md')) continue;

            const skillPath = join(categoryDir, skillFile.name);
            const skillName = skillFile.name.replace(/\.md$/, '');
            const content = readFileSync(skillPath, 'utf-8');

            // 提取 YAML front matter 中的 name + description
            const parts = content.split('---');
            let name = skillName;
            let description = '';
            if (parts.length >= 3) {
              const fm = parts[1];
              const nameMatch = fm.match(/^name:\s*(.+)$/m);
              if (nameMatch) name = nameMatch[1].trim().replace(/^"|"$/g, '');
              const descMatch = fm.match(/^description:\s*(.+)$/m);
              if (descMatch) description = descMatch[1].trim().replace(/^"|"$/g, '').slice(0, 200);
            }
            if (!description) {
              const firstLine = content.split('\n').filter(l => l.startsWith('#') && !l.startsWith('##'))[0] || '';
              description = firstLine.replace(/^#\s*/, '').slice(0, 200) || skillName;
            }

            const keywords = extractKeywords(content);
            this.register({
              name,
              description,
              fullPrompt: content,
              source: 'workspace',
              filePath: skillPath,
              activationKeywords: keywords,
            });

            // ═══ v2.1: 自动建立 skill→expert 映射 ═══
            this.linkToExpert(expertType, name);

            categoryCount++;
            count++;
          }
        } catch (err: unknown) {
          log.warn({ err, categoryDir }, `skills/${expertType}/ 扫描失败 — degraded`);
        }

        if (categoryCount > 0) {
          log.debug({ expertType, skills: categoryCount }, `Skills 已关联到专家`);
        }
      }
    } catch (err: unknown) {
      log.warn({ err, baseDir }, 'Skill 文件扫描失败 — degraded');
    }
    log.info({ count, baseDir }, 'Skill 文件扫描完成');
    return count;
  }

  /**
   * 获取可注入上下文的摘要文本 (用于拼接到 system prompt)。
   * 返回格式:
   *   ## Available Skills
   *   - name: description
   */
  buildCatalogText(expertType: string): string {
    const skills = this.listForExpert(expertType);
    if (skills.length === 0) return '';
    const lines = ['## Available Skills', ''];
    for (const s of skills) {
      lines.push(`- **${s.name}**: ${s.description}`);
    }
    return lines.join('\n');
  }

  /** 三级加载: workspace > user-global > built-in */
  resolveWithPriority(name: string): SkillStub | null {
    const stub = this.stubs.get(name);
    if (!stub) return null;

    // 检查是否有更高优先级的同名 skill
    const all = Array.from(this.stubs.values())
      .filter(s => s.name === name)
      .sort((a, b) => {
        const pri = (s: SkillStub): number =>
          s.source === 'workspace' ? 3 : s.source === 'custom' ? 2 : 1;
        return pri(b) - pri(a);
      });
    return all[0] || stub;
  }

  /** 将技能关联到专家类型 */
  linkToExpert(expertType: string, skillName: string): void {
    const existing = this.expertIndex.get(expertType) || [];
    if (!existing.includes(skillName)) {
      this.expertIndex.set(expertType, [...existing, skillName]);
    }
  }

  /** 获取所有已注册 skill 名称 */
  listNames(): string[] {
    return Array.from(this.stubs.keys());
  }
}

// ═══ Helpers ═══

/**
 * 从 Markdown 内容中提取关键词 (用于 activationKeywords)。
 * 取前 200 字符中的有意义的词汇。
 */
function extractKeywords(content: string): string[] {
  const head = content.slice(0, 500);
  const words = head
    .replace(/[#*`[\]()]/g, '')
    .split(/[\s\n,.;:!?]+/)
    .map(w => w.trim().toLowerCase())
    .filter(w => w.length > 2 && !['the', 'and', 'for', 'are', 'this', 'that', 'with', 'from'].includes(w));
  return [...new Set(words)].slice(0, 20);
}

// ═══ Singleton ═══

let _skillLoader: SkillLazyLoader | null = null;

export function getSkillLoader(): SkillLazyLoader {
  if (!_skillLoader) {
    _skillLoader = new SkillLazyLoader();
  }
  return _skillLoader;
}
