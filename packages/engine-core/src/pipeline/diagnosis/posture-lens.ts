/**
 * posture-lens.ts — 姿态透镜
 *
 * 单一职责：根据战略姿态，对 23 个现有诊断模块做三层适配：
 *   1. 选择 —— 哪些模块运行，哪些跳过
 *   2. 加权 —— 同一模块在不同姿态下的权重（用于报告排序和严重度计算）
 *   3. 翻译 —— 同一发现在不同姿态下的叙事语言
 *
 * 这是 ARCH-16 §3.2-3.5 的工程化简——不新建计算模块，在现有模块上叠加姿态透镜。
 */
import type { StrategicPosture, PostureConfig, ModuleFinding } from './types';
import { getPostureConfig, DEFAULT_POSTURE } from './posture-weights';

// ── 模块选择 ──

/** 给定姿态和候选模块列表，返回应启用的模块 ID 集合 */
export function filterModulesByPosture(
  posture: StrategicPosture,
  candidateModuleIds: string[],
): { enabled: string[]; skipped: string[] } {
  const config = getPostureConfig(posture) || DEFAULT_POSTURE;
  const skipSet = new Set(config.skippedModules);
  const enabled: string[] = [];
  const skipped: string[] = [];

  for (const id of candidateModuleIds) {
    if (skipSet.has(id)) {
      skipped.push(id);
    } else {
      enabled.push(id);
    }
  }

  return { enabled, skipped };
}

/** 判断单个模块是否应在给定姿态下运行 */
export function isModuleEnabledForPosture(posture: StrategicPosture, moduleId: string): boolean {
  const config = getPostureConfig(posture) || DEFAULT_POSTURE;
  return !config.skippedModules.includes(moduleId);
}

// ── 叙事翻译 ──

/**
 * 将模块发现翻译为姿态特定的叙事。
 * 返回：
 *   - sectionTitle: 该模块在报告中的章节标题
 *   - narrative: 人类可读的叙事文本（替代原始的 detail）
 *   - severity: 可能因姿态阈值调整后的严重度
 */
export function translateFinding(
  posture: StrategicPosture,
  moduleId: string,
  finding: ModuleFinding,
  moduleScore?: number, // 模块计算得分 0-1（如果模块产出 score）
): {
  sectionTitle: string;
  narrative: string;
  severity: ModuleFinding['severity'];
} {
  const config = getPostureConfig(posture) || DEFAULT_POSTURE;
  const nar = config.narrativeMap[moduleId];

  // 无叙事配置 → 原样返回
  if (!nar) {
    return {
      sectionTitle: config.label + ' — ' + moduleId,
      narrative: finding.detail,
      severity: finding.severity,
    };
  }

  // 根据模块得分 vs 姿态特定阈值判断健康/告警
  const isCritical = moduleScore !== undefined && moduleScore < nar.criticalThreshold;

  // 替换模板变量
  const narrative = isCritical
    ? nar.criticalFragment.replace(/\{(\w+)\}/g, (_m, key) => templateVar(key, finding))
    : nar.healthyFragment.replace(/\{(\w+)\}/g, (_m, key) => templateVar(key, finding));

  // 姿态阈值可能上调严重度
  let severity = finding.severity;
  if (isCritical && severity === 'medium') severity = 'high';
  if (isCritical && severity === 'low') severity = 'medium';

  return { sectionTitle: nar.sectionTitle, narrative, severity };
}

/** 为 CEO 摘要生成姿态特定的叙事段落 */
export function translateAction(
  posture: StrategicPosture,
  moduleId: string,
  finding: ModuleFinding,
): string {
  const config = getPostureConfig(posture) || DEFAULT_POSTURE;
  const nar = config.narrativeMap[moduleId];
  if (!nar) return finding.detail;
  return nar.actionTemplate.replace(/\{(\w+)\}/g, (_m, key) => templateVar(key, finding));
}

function templateVar(key: string, finding: ModuleFinding): string {
  switch (key) {
    case 'categories': return finding.detail.slice(0, 50);
    case 'bottlenecks': return finding.moduleId;
    case 'count': return String(finding.evidenceRefs.length);
    case 'timeframe': return '6-12 个月';
    case 'areas': return finding.moduleId;
    case 'runway': return '6';
    case 'waste': return '6,200';
    case 'headcount': return '1';
    case 'budget': return '2,000';
    case 'vulnerabilities': return finding.detail.slice(0, 40);
    case 'issues': return finding.detail.slice(0, 40);
    case 'N': return '3';
    default: return `[${key}]`;
  }
}

// ── CEO 摘要姿态包装 ──

/** 根据姿态生成报告开场引导语 */
export function postureOpening(posture: StrategicPosture): string {
  switch (posture) {
    case 'moat_builder':
      return '以下诊断从竞争壁垒和组织可规模化两个维度展开。核心问题：你的组织能力是否足以支撑你的战略野心？';
    case 'steady_operator':
      return '以下诊断聚焦于组织的可靠性与韧性。我们不谈增长，谈的是如何让这台机器平稳运转十年。';
    case 'survival_seeker':
      return '以下诊断聚焦于生存——在资源耗尽前找到突破口。这里没有长线建议，只有接下来三个月必须解决的三件事。';
    default:
      return '';
  }
}

// ── 配置加载 ──

/** 获取姿态的完整配置（供编排器使用） */
export function loadPostureConfig(posture: StrategicPosture): PostureConfig {
  return getPostureConfig(posture) || DEFAULT_POSTURE;
}
