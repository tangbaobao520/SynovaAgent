/**
 * adapter-scanner.ts — 适配器文件系统扫描器 (L2)
 *
 * 从 extensions/ontology/field-mappings/ 目录扫描 *.json 文件，
 * 自动发现可用的适配器配置。
 *
 * 对标 sentinel-loader.ts 的文件驱动自发现模式。
 * 铁律24: catch + log + degraded。
 * 铁律31: 降级信号传播。
 */
import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createLogger } from '@synova/logger';

const log = createLogger('agent/adapter-scanner');
const DEFAULT_NODE_TYPE = 'Financial';

/** 获取 field-mappings 目录路径（运行时计算，支持测试 mock） */
function getFieldMappingsDir(): string {
  return join(process.cwd(), 'extensions', 'ontology', 'field-mappings');
}

export interface ScannedAdapter {
  name: string;
  label: string;
  targetNodeType: string;
}

export interface ScanResult {
  adapters: ScannedAdapter[];
  errors: string[];
  degraded: boolean;
}

/**
 * 扫描 field-mappings/ 目录，返回所有可用的适配器列表。
 *
 * @returns ScanResult — 适配器列表 + 扫描错误 + degraded 标记
 *
 * 降级路径: 目录不存在 → 返回空列表 + degraded
 *           某个 JSON 解析失败 → 跳过该文件 + log.warn + 记录错误
 */
export function scanFieldMappings(): ScanResult {
  const errors: string[] = [];

  try {
    const dir = getFieldMappingsDir();
    if (!existsSync(dir)) {
      log.warn({ dir }, 'field-mappings 目录不存在');
      return { adapters: [], errors: [`目录不存在: ${dir}`], degraded: true };
    }

    const entries = readdirSync(dir, { withFileTypes: true });
    const jsonFiles = entries.filter(e => e.isFile() && e.name.endsWith('.json'));
    const adapters: ScannedAdapter[] = [];

    for (const file of jsonFiles) {
      const filePath = join(dir, file.name);
      try {
        const raw = readFileSync(filePath, 'utf-8');
        const config = JSON.parse(raw) as { name?: string; label?: string; targetNodeType?: string; mappings?: unknown[] };
        if (!config.name || !config.mappings) {
          errors.push(`适配器 ${file.name} 缺少 name 或 mappings 字段`);
          log.warn({ file: file.name }, '适配器缺少必要字段 — 跳过');
          continue;
        }
        adapters.push({
          name: config.name,
          label: config.label || config.name,
          targetNodeType: config.targetNodeType || DEFAULT_NODE_TYPE,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`适配器 ${file.name} 解析失败: ${msg}`);
        log.warn({ err: msg, file: file.name }, '适配器 JSON 解析失败 — 跳过');
      }
    }

    log.info({ count: adapters.length, errors: errors.length }, 'field-mappings 扫描完成');
    return { adapters, errors, degraded: errors.length > 0 };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg }, 'field-mappings 扫描异常');
    // return degraded rather than throw
    return { adapters: [], errors: [`扫描异常: ${msg}`], degraded: true };
  }
}
