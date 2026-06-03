/**
 * sog-metadata.ts — SOG 模板和适配器元数据标准 (Task 3)
 *
 * 任何模板或适配器必须包含符合规范的 manifest，否则引擎拒绝加载。
 */
import { SOG_CORE_VERSION } from './sog-core-schema';
import type { SOGNodeType, SOGEdgeType } from './sog-core-schema';

// ═══ Types ═══

export interface NodeTypeDefinition {
  type: string;
  properties: Record<string, { type: string; required: boolean; description?: string }>;
}

export interface EdgeTypeDefinition {
  type: string;
  fromTypes: string[];
  toTypes: string[];
  properties: Record<string, { type: string; required: boolean; description?: string }>;
}

export interface SOGTemplateManifest {
  sogVersion: string;
  templateId: string;
  templateName: string;
  version: string;
  author: string;
  extends: string[];
  provides: {
    nodeTypes?: NodeTypeDefinition[];
    edgeTypes?: EdgeTypeDefinition[];
    diagnosticRules?: string[];
  };
}

export interface SOGAdapterManifest {
  sogVersion: string;
  adapterId: string;
  adapterName: string;
  version: string;
  author: string;
  dataSource: string;
  eventTypes: string[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ═══ Validation ═══

/** 校验模板 manifest。纯函数，不依赖数据库或网络。 */
export function validateTemplateManifest(manifest: SOGTemplateManifest): ValidationResult {
  const result: ValidationResult = { valid: true, errors: [], warnings: [] };

  // sogVersion 主版本兼容
  const [coreMajor] = SOG_CORE_VERSION.split('.');
  const [manifestMajor] = manifest.sogVersion.split('.');
  if (coreMajor !== manifestMajor) {
    result.errors.push(`sogVersion 不兼容: manifest=${manifest.sogVersion}, core=${SOG_CORE_VERSION}`);
    result.valid = false;
  }

  // 必填字段检查
  if (!manifest.templateId) { result.errors.push('缺少 templateId'); result.valid = false; }
  if (!manifest.templateName) { result.errors.push('缺少 templateName'); result.valid = false; }
  if (!manifest.version) { result.errors.push('缺少 version'); result.valid = false; }

  return result;
}

/** 校验适配器 manifest。纯函数，不依赖数据库或网络。 */
export function validateAdapterManifest(manifest: SOGAdapterManifest): ValidationResult {
  const result: ValidationResult = { valid: true, errors: [], warnings: [] };

  const [coreMajor] = SOG_CORE_VERSION.split('.');
  const [manifestMajor] = manifest.sogVersion.split('.');
  if (coreMajor !== manifestMajor) {
    result.errors.push(`sogVersion 不兼容: manifest=${manifest.sogVersion}, core=${SOG_CORE_VERSION}`);
    result.valid = false;
  }

  if (!manifest.adapterId) { result.errors.push('缺少 adapterId'); result.valid = false; }
  if (!manifest.adapterName) { result.errors.push('缺少 adapterName'); result.valid = false; }
  if (!manifest.dataSource) { result.errors.push('缺少 dataSource'); result.valid = false; }

  return result;
}
