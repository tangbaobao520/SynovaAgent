/**
 * sog-certification.ts — SOG 认证工具链 (Task 4)
 *
 * 纯函数。不依赖数据库、网络。CI 可直接调用。
 * 只有通过认证的模板/适配器才可上架市场，获得 SOG-Certified 标签。
 */
import type { SOGTemplateManifest, SOGAdapterManifest, ValidationResult } from './sog-metadata';
import { validateTemplateManifest, validateAdapterManifest } from './sog-metadata';

export interface CertificationResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
}

/** 认证模板。纯函数，CI 可调用。 */
export function certifyTemplate(manifest: SOGTemplateManifest, _templateDir: string): CertificationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Manifest 格式校验
  const manifestResult = validateTemplateManifest(manifest);
  errors.push(...manifestResult.errors);
  warnings.push(...manifestResult.warnings);

  // 2. 节点/边类型冲突检测
  if (manifest.provides?.nodeTypes) {
    const typeNames = manifest.provides.nodeTypes.map(n => n.type);
    const duplicates = typeNames.filter((n, i) => typeNames.indexOf(n) !== i);
    if (duplicates.length > 0) {
      errors.push(`节点类型重复定义: ${duplicates.join(', ')}`);
    }
  }

  // 3. extends 引用的类型存在性检查（占位——完整实现需要加载 SOG 核心类型列表）
  if (manifest.extends.length === 0) {
    warnings.push('模板未声明 extends——可能未依赖任何 SOG 核心类型');
  }

  return {
    passed: errors.length === 0,
    errors,
    warnings,
  };
}

/** 认证适配器。纯函数，CI 可调用。 */
export function certifyAdapter(manifest: SOGAdapterManifest, _adapterModule: unknown): CertificationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const manifestResult = validateAdapterManifest(manifest);
  errors.push(...manifestResult.errors);
  warnings.push(...manifestResult.warnings);

  // 事件类型检查
  if (manifest.eventTypes.length === 0) {
    warnings.push('适配器未声明任何 eventTypes');
  }

  return {
    passed: errors.length === 0,
    errors,
    warnings,
  };
}
