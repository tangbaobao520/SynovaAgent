/**
 * engine-server/pipeline/template-update-checker.ts — 模板版本管理 + 更新检测
 *
 * V1.2 发布配套：为 FE-33 版本更新推送功能提供引擎侧数据。
 *
 * 逻辑：
 * 1. 读取模板库中所有模板的 manifest.json
 * 2. 对比用户已安装模板版本
 * 3. 返回有更新的模板列表
 *
 * @packageDocumentation
 */

import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '../infra/logger';

const log = createLogger('pipeline/template-update-checker');

// ====================================================================
// 类型定义
// ====================================================================

export interface TemplateManifest {
  schemaVersion: string;
  id: string;
  name: string;
  version: string;
  description: string;
  category: string;
  tags: string[];
  icon: string;
  quality: string;
  engineVersion: string;
  distilledBy: string;
  distillDate: string;
  distillNotes?: string;
  agents: Array<{
    name: string;
    role: string;
    description: string;
    suggestedModel: string;
  }>;
  firstTaskPrompt?: string;
  teamWorkflow?: string;
  requiredSkills?: string[];
}

export interface TemplateUpdateInfo {
  /** 模板 ID */
  templateId: string;
  /** 模板名称 */
  templateName: string;
  /** 最新版本 */
  latestVersion: string;
  /** 用户已安装版本（null = 未安装） */
  installedVersion: string | null;
  /** 是否有更新 */
  hasUpdate: boolean;
  /** 更新内容 */
  changelog: string[];
  /** 是否为新增模板（之前未安装） */
  isNew: boolean;
}

export interface TemplateUpdateCheckResult {
  /** 全部模板最新版本列表 */
  allTemplates: TemplateUpdateInfo[];
  /** 有更新的模板 */
  updates: TemplateUpdateInfo[];
  /** 新增模板 */
  newTemplates: TemplateUpdateInfo[];
  /** 模板总数 */
  totalCount: number;
  /** 更新时间戳 */
  checkedAt: string;
}

// ====================================================================
// 模板库路径
// ====================================================================

const FLAGSHIP_DIRS: string[] = (() => {
  const candidates = [
    path.join(process.cwd(), 'src', 'template', 'presets', 'flagship'),
    path.join(__dirname, '..', '..', '..', 'template', 'presets', 'flagship'),
    path.join(__dirname, '..', '..', 'template', 'presets', 'flagship'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return [c];
  }

  // 开发模式：返回 src 下的路径
  return [path.join(process.cwd(), 'src', 'template', 'presets', 'flagship')];
})();

// ====================================================================
// 读取模板库
// ====================================================================

function loadTemplateManifest(templateDir: string): TemplateManifest | null {
  const manifestPath = path.join(templateDir, 'manifest.json');
  try {
    if (fs.existsSync(manifestPath)) {
      const raw = fs.readFileSync(manifestPath, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (_e) { log.debug('模板 manifest 解析失败: %s', String(_e)); }
  return null;
}

/**
 * 加载旗舰模板目录下的所有模板
 */
export function loadAllTemplates(): Map<string, TemplateManifest> {
  const templates = new Map<string, TemplateManifest>();

  for (const baseDir of FLAGSHIP_DIRS) {
    if (!fs.existsSync(baseDir)) continue;

    const entries = fs.readdirSync(baseDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const manifest = loadTemplateManifest(path.join(baseDir, entry.name));
      if (manifest && manifest.id) {
        templates.set(manifest.id, manifest);
      }
    }
  }

  return templates;
}

// ====================================================================
// 更新检测
// ====================================================================

/**
 * 对比已安装模板和最新模板，返回更新信息。
 *
 * @param installedVersions - 用户已安装模板版本映射 { templateId: version }
 * @returns 更新检测结果
 */
export function checkTemplateUpdates(
  installedVersions: Record<string, string> = {},
): TemplateUpdateCheckResult {
  const latestTemplates = loadAllTemplates();
  const allTemplates: TemplateUpdateInfo[] = [];
  const updates: TemplateUpdateInfo[] = [];
  const newTemplates: TemplateUpdateInfo[] = [];

  for (const [id, manifest] of latestTemplates) {
    const installed = installedVersions[id] || null;
    const hasUpdate = installed !== null && compareVersions(manifest.version, installed) > 0;
    const isNew = installed === null;

    const info: TemplateUpdateInfo = {
      templateId: id,
      templateName: manifest.name,
      latestVersion: manifest.version,
      installedVersion: installed,
      hasUpdate,
      isNew,
      changelog: hasUpdate
        ? [`从 ${installed} 升级到 ${manifest.version}`, manifest.distillNotes || '模板内容已更新']
        : [],
    };

    allTemplates.push(info);

    if (isNew) {
      newTemplates.push(info);
    } else if (hasUpdate) {
      updates.push(info);
    }
  }

  return {
    allTemplates,
    updates,
    newTemplates,
    totalCount: latestTemplates.size,
    checkedAt: new Date().toISOString(),
  };
}

// ====================================================================
// 版本比较
// ====================================================================

/**
 * 比较语义化版本号。
 * @returns > 0 if a > b, < 0 if a < b, 0 if equal
 */
function compareVersions(a: string, b: string): number {
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);
  const len = Math.max(partsA.length, partsB.length);

  for (let i = 0; i < len; i++) {
    const va = partsA[i] || 0;
    const vb = partsB[i] || 0;
    if (va !== vb) return va - vb;
  }

  return 0;
}

// ====================================================================
// 引擎版本
// ====================================================================

/**
 * 获取引擎当前版本（兼容墨翟 /api/update/check API）
 */
export function getEngineUpdateInfo(): {
  currentVersion: string;
  releaseDate: string;
  changelog: string[];
} {
  const pkgPath = path.join(process.cwd(), 'package.json');
  let version = '3.1.0';
  try {
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      version = pkg.version || version;
    }
  } catch (_e) { log.debug('package.json 读取失败，使用默认版本: %s', String(_e)); }

  return {
    currentVersion: version,
    releaseDate: '2026-05-14',
    changelog: [
      'V1.2 发布：运行时治理层激活',
      '新增独立审计 Agent（8维度审查）',
      '新增安全基线 6 条 SB 规则硬阻断',
      '新增 6缝隙协作事件采集',
      '新增 M3 进化闭环（信号→变体→overrides）',
      '新增壁垒四血缘追踪证据链导出',
      '新增弹药库注入（5行业领域事实）',
    ],
  };
}
