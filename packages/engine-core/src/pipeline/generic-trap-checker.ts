/**
 * engine-server/pipeline/generic-trap-checker.ts — 通用模板退化检测
 *
 * 实现 AR-07 方案三：检查 LLM 输出的角色列表是否全部为通用角色，
 * 如果是且任务约束包含特殊需求，则标记退化并触发重推。
 *
 * 规则：
 * - 角色名匹配通用模式（纯技术缩写 / 无行业限定词）→ 可能退化
 * - 约束包含特殊关键词但无对应角色 → 退化
 * - 无特殊需求 + 通用角色 → 合理，不退化
 *
 * @packageDocumentation
 */

import type { TaskDefinitionDTO } from '../types';

// ================================================================
// 通用角色模式匹配（替换硬编码 ID 列表）
// ================================================================

/**
 * 判断一个角色 ID 或名称是否属于通用模板。
 * 基于模式匹配而非硬编码列表——适合任意行业。
 *
 * 通用角色的特征：
 * 1. 纯英文缩写（pm/dev/qa/ceo/cto 等≤5字符）
 * 2. 无行业限定词（不含 "跨境/供应链/门店/餐饮/..." 等具体业务领域词）
 */
function isGenericRole(roleId: string, roleName: string): boolean {
  const name = (roleId + roleName).toLowerCase();

  // 1. 行业限定词 — 如果有，说明是场景特定角色，不是通用模板
  const industryMarkers = [
    '跨境', '供应链', '物流', '仓储', '门店', '餐饮', '食品', '厨房',
    '电商', '平台', '店铺', '选品', '合规', '质检', '报关', '海关',
    '客服', '售后', '结算', '汇率', '本地', '区域', '加盟', '连锁',
    '冷链', '配送', '农场', '种植', '养殖', '加工', '包装', '零售',
    '批发', '经销商', '渠道', '推广', '投放', '品牌', '数据', '分析',
    '安全', '审计', '风控', '法务', '税务', '财务', '融资', '预算',
    '人力', '招聘', '培训', '医疗', '护理', '教育', '培训师',
  ];
  if (industryMarkers.some(m => name.includes(m))) return false;

  // 2. 纯英文缩写且≤5字符 → 通用（pm/dev/qa/cto/cfo/...）
  if (/^[a-z]{2,5}$/.test(roleId)) return true;

  // 3. 通用后缀 + 无行业限定词 → 通用
  const genericSuffixes = [
    '经理', '主管', '专员', '总监', '工程师', '设计师', '分析员', '管理员',
    'manager', 'lead', 'head', 'director', 'specialist', 'engineer', 'designer', 'analyst',
  ];
  const hasGenericSuffix = genericSuffixes.some(s => roleName.includes(s));

  if (hasGenericSuffix) {
    // 如果有通用后缀但带有"高级/资深/初级"等限定，仍是通用
    const qualifiers = ['高级', '资深', '初级', '助理', 'senior', 'junior', 'associate'];
    const cleanedName = qualifiers.reduce((n, q) => n.replace(q, ''), roleName);
    // 清除限定词后长度短 → 确实是通用角色
    if (cleanedName.length <= 4) return true;
    // 清除后名字中无行业关键词 → 通用
    if (!industryMarkers.some(m => cleanedName.includes(m))) return true;
  }

  return false;
}

/**
 * 同步生成特殊需求关键词。
 * 从阶段定义中动态提取，同时保留基础敏感词。
 */
function getSpecialNeedKeywords(constraints: string[]): string[] {
  // 基础敏感词 — 任何一个出现都说明场景有特殊需求
  const baseSensitiveWords = [
    '合规', '法规', '监管', '许可证', '认证', '资质', '牌照',
    '跨境', '海关', '报关', '税务', '支付', '结算',
    '门店', '供应链', '冷链', '质检',
  ];

  // 从用户约束中提取额外关键词（长度≥2的中文词）
  const constraintKeywords = constraints
    .flatMap(c => c.match(/[\u4e00-\u9fff]{2,}/g) || [])
    .filter(w => w.length >= 2 && w.length <= 6);

  return [...new Set([...baseSensitiveWords, ...constraintKeywords])];
}

// ================================================================
// 退化检测逻辑
// ================================================================

export interface TrapCheckResult {
  passes: boolean;
  reason?: string;
  specialConstraints?: string[];
}

/**
 * 检查 LLM 输出的角色是否全部为通用模板
 */
export function checkGenericTrap(
  roleIds: string[],
  roleNames: string[],
  constraints: string[],
): TrapCheckResult {
  if (!Array.isArray(roleIds) || roleIds.length === 0) {
    return { passes: true };
  }

  // 判断每个角色是否通用
  const genericFlags = roleIds.map((id, i) => isGenericRole(id, roleNames[i] || id));
  const allGeneric = genericFlags.every(f => f);

  if (!allGeneric) {
    return { passes: true }; // 至少有一个场景特定角色
  }

  // 获取动态关键词
  const specialKeywords = getSpecialNeedKeywords(constraints);
  const constraintsText = constraints.join(' ');
  const foundKeywords = specialKeywords.filter(kw => constraintsText.includes(kw));

  if (foundKeywords.length === 0) {
    return { passes: true }; // 无特殊需求 + 通用角色 → 合理
  }

  // 有特殊需求但全是通用角色 → 退化
  return {
    passes: false,
    reason: `所有角色均为通用角色，但约束中包含特殊需求: [${foundKeywords.join(', ')}]。LLM 可能走了默认路径。`,
    specialConstraints: foundKeywords,
  };
}

/**
 * 构建重推 prompt
 */
export function buildRetryPrompt(
  specialConstraints: string[],
  constraints: string[],
): string {
  const specialItems = specialConstraints
    .map(kw => {
      const matched = constraints.filter(c => c.includes(kw));
      return matched.length > 0 ? matched.map(c => `  - "${c}"`) : [`  - (涉及 "${kw}" 的约束)`];
    })
    .flat()
    .join('\n');

  return `
────────────────────────────────────────────────
【退化检测触发】

你刚才输出的角色全部是通用角色（产品经理、开发工程师等），
但任务约束中包含以下特殊需求：
${specialItems}

请按以下步骤重新推导：
1. 分析上述特殊需求对团队角色的具体要求
2. 推导有哪些非通用角色可以覆盖这些需求
3. 重新输出角色结构，确保至少有几个角色直接对应特殊需求
同时保留已经合理的通用角色。

请重新输出完整的 JSON 结构。
────────────────────────────────────────────────
`;
}
