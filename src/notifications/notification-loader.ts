/**
 * notification-loader.ts — 通知适配器文件驱动加载器 (V3.8)
 *
 * 扫描 extensions/notifications/* /manifest.json, 动态 import 适配器并注册。
 * 替代 file-driven-loaders.ts 中的硬编码 import。
 *
 * Iron law #24: catch + log + degraded.
 */
import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { createLogger } from '@synova/logger';
import { registerNotificationAdapter, listNotificationChannels } from './registry';
import type { NotificationAdapter } from './types';

const log = createLogger('notifications/loader');

const NOTIFICATIONS_DIR = join(process.cwd(), 'extensions', 'notifications');

export async function loadAndRegisterNotificationAdapters(): Promise<{ registered: number; errors: string[] }> {
  const errors: string[] = [];
  let registered = 0;

  try {
    if (!existsSync(NOTIFICATIONS_DIR)) {
      errors.push(`通知目录不存在: ${NOTIFICATIONS_DIR}`);
      return { registered: 0, errors };
    }

    const entries = readdirSync(NOTIFICATIONS_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('_')) continue;

      const manifestPath = join(NOTIFICATIONS_DIR, entry.name, 'manifest.json');
      if (!existsSync(manifestPath)) {
        errors.push(`通知 ${entry.name} 缺少 manifest.json`);
        continue;
      }

      try {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
        const entryPath = join(NOTIFICATIONS_DIR, entry.name, manifest.entryPoint || './adapter.ts');
        if (!existsSync(entryPath)) {
          errors.push(`通知 ${entry.name} entryPoint 不存在: ${entryPath}`);
          continue;
        }

        const mod = await import(pathToFileURL(entryPath).href);
        const adapter = mod[manifest.exportKey || 'default'] as NotificationAdapter;
        if (!adapter || typeof adapter.send !== 'function') {
          errors.push(`通知 ${entry.name} 缺少 send() 方法`);
          continue;
        }

        registerNotificationAdapter(adapter);
        registered++;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`通知 ${entry.name} 注册失败: ${msg}`);
      }
    }

    if (registered > 0) log.info({ registered }, '通知适配器已从文件加载');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn({ err: msg }, '通知加载失败 — degraded');
    errors.push(msg);
  }

  return { registered, errors };
}
