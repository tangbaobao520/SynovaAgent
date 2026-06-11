/**
 * engine-server/pipeline/ammo-refiner.ts — 弹药精炼接口
 *
 * 提供弹药库的过滤和统计查询功能，供外部模块（L0、前端等）消费。
 * 不直接修改弹药库数据，只做只读分析与聚合。
 *
 * 使用场景：
 * - L0 诊断时查询弹药覆盖度：当前弹药库的行业/组织知识分布
 * - 调试控制台查看弹药质量：草稿 vs 已验证的占比
 * - 管道阶段查询是否该注入弹药：draft 太多表示知识缺口
 *
 * @date 2026-05-19
 */

import { AMMO_DEPOT, type AmmoEntry } from './phase-b/ammo-depot';

// ================================================================
// 过滤函数
// ================================================================

/**
 * 获取所有草稿弹药（confidence === 'llm_generated'）。
 * 草稿弹药未经人工验证或公开信源支撑，使用需谨慎。
 */
export function getDraftAmmo(): AmmoEntry[] {
  return AMMO_DEPOT.filter(a => a.confidence === 'llm_generated');
}

/**
 * 获取所有已验证弹药（confidence === 'verified'）。
 * 已验证弹药有可靠信源或经过人工审核，可在管道中安全使用。
 */
export function getVerifiedAmmo(): AmmoEntry[] {
  return AMMO_DEPOT.filter(a => a.confidence === 'verified');
}

// ================================================================
// 计数函数
// ================================================================

/**
 * 获取草稿弹药总数。
 * 草稿占比过高说明弹药库质量需要人工审核。
 */
export function getDraftCount(): number {
  return getDraftAmmo().length;
}

// ================================================================
// 聚合摘要
// ================================================================

export interface AmmoSummary {
  total: number;
  verified: number;
  publicSource: number;
  llmGenerated: number;
  draftRatio: number;
  industryCount: number;
  organizationCount: number;
}

/**
 * 弹药库整体质量摘要。
 * 返回各级置信度的数量分布和类型分布。
 */
export function getAmmoSummary(): AmmoSummary {
  const total = AMMO_DEPOT.length;
  const verified = AMMO_DEPOT.filter(a => a.confidence === 'verified').length;
  const publicSource = AMMO_DEPOT.filter(a => a.confidence === 'public_source').length;
  const llmGenerated = AMMO_DEPOT.filter(a => a.confidence === 'llm_generated').length;

  return {
    total,
    verified,
    publicSource,
    llmGenerated,
    draftRatio: total > 0 ? Math.round((llmGenerated / total) * 10000) / 100 : 0,
    industryCount: AMMO_DEPOT.filter(a => a.matchType === 'industry').length,
    organizationCount: AMMO_DEPOT.filter(a => a.matchType === 'organization').length,
  };
}
