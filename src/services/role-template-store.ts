/**
 * services/role-template-store.ts — 权限模板持久化存储 (D242)
 *
 * 模板存储为 .codex/settings/role-templates/{id}.json。
 * 内置模板 (isBuiltin=true) 不可删除。
 *
 * 铁律 24+31: catch + log.warn + degraded
 * 铁律 38: 零 as any
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { createLogger } from '@synova/logger';
import { BUILTIN_TEMPLATES, type RoleTemplate, type PermissionSet } from '../middleware/rbac';

const log = createLogger('services/role-template-store');

const TEMPLATES_DIR = join(process.cwd(), '.codex', 'settings', 'role-templates');

function ensureDir(): void {
  try { mkdirSync(TEMPLATES_DIR, { recursive: true }); } catch (err) {
    log.warn({ err }, '模板目录创建失败 — 降级');
  }
}

function filePath(id: string): string {
  return join(TEMPLATES_DIR, `${id}.json`);
}

/**
 * 列出所有模板（内置 + 自定义）。
 */
export function listTemplates(): RoleTemplate[] {
  const builtins = [...BUILTIN_TEMPLATES];
  const customs: RoleTemplate[] = [];
  ensureDir();
  try {
    if (existsSync(TEMPLATES_DIR)) {
      for (const f of readdirSync(TEMPLATES_DIR)) {
        if (!f.endsWith('.json')) continue;
        try {
          const data = readFileSync(join(TEMPLATES_DIR, f), 'utf-8');
          customs.push(JSON.parse(data) as RoleTemplate);
        } catch (err) {
          log.warn({ err, file: f }, '读取自定义模板失败 — 跳过');
        }
      }
    }
  } catch (err) {
    log.warn({ err }, '列出模板失败 — 降级');
  }
  return [...builtins, ...customs];
}

/**
 * 按 ID 获取模板（内置或自定义）。
 */
export function getTemplate(id: string): RoleTemplate | undefined {
  // 先查内置
  const builtin = BUILTIN_TEMPLATES.find(t => t.id === id);
  if (builtin) return builtin;
  // 再查自定义
  try {
    const path = filePath(id);
    if (!existsSync(path)) return undefined;
    return JSON.parse(readFileSync(path, 'utf-8')) as RoleTemplate;
  } catch (err) {
    log.warn({ err, id }, '读取模板失败 — 降级');
    return undefined;
  }
}

/**
 * 保存自定义模板（新建或更新）。
 * 内置模板不可通过此方法修改。
 */
export function saveTemplate(template: RoleTemplate): boolean {
  if (template.isBuiltin) {
    log.warn({ id: template.id }, '内置模板不可修改');
    return false;
  }
  ensureDir();
  try {
    writeFileSync(filePath(template.id), JSON.stringify(template, null, 2), 'utf-8');
    log.info({ id: template.id }, '自定义模板已保存');
    return true;
  } catch (err) {
    log.warn({ err, id: template.id }, '保存模板失败 — 降级');
    return false;
  }
}

/**
 * 删除自定义模板。内置模板不可删除。
 */
export function deleteTemplate(id: string): { ok: boolean; reason?: string } {
  const builtin = BUILTIN_TEMPLATES.find(t => t.id === id);
  if (builtin) {
    return { ok: false, reason: '内置模板不可删除' };
  }
  try {
    const path = filePath(id);
    if (!existsSync(path)) {
      return { ok: false, reason: '模板不存在' };
    }
    unlinkSync(path);
    log.info({ id }, '自定义模板已删除');
    return { ok: true };
  } catch (err) {
    log.warn({ err, id }, '删除模板失败 — 降级');
    return { ok: false, reason: '删除失败' };
  }
}
