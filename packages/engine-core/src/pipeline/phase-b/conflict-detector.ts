/**
 * S4: 冲突检测器（Conflict Detector）
 *
 * 检测已匹配框架之间的冲突，移除不兼容的框架，确保角色的认知模型内部自洽。
 *
 * 三类冲突：
 *   1. contradictory_recommendation — 矛盾建议：两个框架在重叠决策场景下给出相反建议
 *   2. overlapping_coverage         — 覆盖重叠：两个框架覆盖几乎相同的决策类型，保留高分
 *   3. incompatible_category        — 不兼容类别：框架类别与角色治理层级冲突（仅 warning）
 *
 * 设计原则：
 *   - 矛盾建议 → 移除低分框架
 *   - 覆盖重叠 → 移除低分框架
 *   - 不兼容类别 → 不删除，仅标记（让角色定制者自己决定）
 *
 * @author 墨子（ClawOrg-架构师墨子）
 * @date   2026-05-09
 */

import type { MatchedFramework } from './framework-matcher.js';
import type { Framework } from './framework-library.js';

// ─── 接口定义 ──────────────────────────────────────────────

export interface ConflictDetectorResult {
  /** 经过冲突检测保留的框架 */
  validated: MatchedFramework[];
  /** 因冲突被移除的框架（供用户审查） */
  rejected: MatchedFramework[];
  /** 检测到的所有冲突详情 */
  conflicts: FrameworkConflict[];
}

export interface FrameworkConflict {
  /** 冲突方 A 的框架 id */
  frameworkA: string;
  /** 冲突方 B 的框架 id */
  frameworkB: string;
  /** 冲突类型 */
  type: 'contradictory_recommendation' | 'overlapping_coverage' | 'incompatible_category';
  /** 冲突原因说明 */
  description: string;
}

// ─── 矛盾关键词对 ──────────────────────────────────────────

/**
 * 矛盾关键词对定义
 *
 * 当两个框架的 name + coreInsight 中分别包含对立关键词时，
 * 且它们的 applicableDecisionTypes 有至少 1 个重叠 → contradictory_recommendation
 *
 * 每组 [保守端, 激进端] 对应一对矛盾方向。
 */
const CONTRADICTORY_KEYWORD_PAIRS: [string[], string[]][] = [
  // 安全 vs 冒险
  [['保守', '安全', '留余量', '不伤害', '避免', '慎', '缓冲', '备选', '冗余', '余量', '止损', '预防'], ['激进', '冒险', '快跑', '实验', '试错', '突破', '颠覆', '快速', '敏捷']],
  // 慢 vs 快
  [['慢', '逐步', '渐进', '耐心', '持久', '长期', '长时'], ['快', '加速', '快速', '迭代', '试错', '敏捷', '敏捷']],
  // 集中 vs 分散
  [['集中', '聚焦', '少数', '二八', '帕累托', '减法', '关键', '重点', '唯一', '20%'], ['分散', '多元', '多个', '备用', '冗余', '选项', '可选性', '多个方案', '多样化']],
  // 简约 vs 复杂
  [['简单', '剃刀', '最少', '简化', '奥卡姆', '最简'], ['复杂', '多层次', '二阶', 'N阶', '深层', '二阶思考', '系统']],
  // 信任直觉 vs 验证
  [['直觉', '经验', '能力圈', '专长', '圈内', '熟悉', '自信'], ['验证', '证据', '举证', '制衡', '检查', '确认偏误', '审视']],
  // 避免行动 vs 积极行动
  [['不伤害', '不行动', '克制', '静观', '观察', '等待', '避免', '不伤害', '保守治疗'], ['行动', '干预', '试错', '迭代', '积极', '快速迭代']],
  // 内驱 vs 外驱
  [['内在动机', '内驱', '自驱', '自主'], ['激励', '外驱', '奖惩', '代理', '绩效', 'KPI']],
  // 竞速 vs 稳态
  [['网络效应', '先发', '加速', '指数', '增长', '临界', '爆发'], ['稳定', '制衡', '秩序', '负反馈', '平衡', '稳态']],
];

/**
 * 提取框架文本中的矛盾匹配向量
 * 返回一个分数向量，每个维度表示文本在该矛盾对的「保守端」方向得分
 */
function extractContradictionVector(text: string, pair: [string[], string[]]): { conservative: number; aggressive: number } {
  const lower = text.toLowerCase();
  let conservative = 0;
  let aggressive = 0;

  for (const kw of pair[0]) {
    if (lower.includes(kw.toLowerCase())) conservative++;
  }
  for (const kw of pair[1]) {
    if (lower.includes(kw.toLowerCase())) aggressive++;
  }

  return { conservative, aggressive };
}

/**
 * 构建框架的完整文本（name + coreInsight + applicableDecisionTypes）
 */
function frameworkFullText(fw: Framework): string {
  return [fw.name, fw.coreInsight, ...fw.applicableDecisionTypes].join(' ');
}

// ─── 重叠检测 ──────────────────────────────────────────────

/**
 * 计算两个数组的集合重叠数量
 */
function intersectionSize(a: string[], b: string[]): number {
  const setB = new Set(b.map(s => s.toLowerCase()));
  let count = 0;
  for (const item of a) {
    if (setB.has(item.toLowerCase())) count++;
  }
  return count;
}

// ─── 主检测逻辑 ─────────────────────────────────────────────

/**
 * 对已匹配框架执行冲突检测
 *
 * @param frameworks - matchFrameworks() 输出的 MatchedFramework[]
 * @returns ConflictDetectorResult
 */
export function detectConflicts(frameworks: MatchedFramework[]): ConflictDetectorResult {
  const conflicts: FrameworkConflict[] = [];
  const rejectedIds = new Set<string>(); // 存储被拒绝的 MatchedFramework 的唯一标识

  // 为每个 MatchedFramework 生成唯一标识（framework.id + decisionTypeId = 精确匹配项）
  function mfKey(mf: MatchedFramework): string {
    return `${mf.framework.id}::${mf.decisionTypeId}`;
  }

  // 需要去重：同一框架可能匹配多个决策类型，每个都是独立 MatchedFramework
  // 冲突检测在框架级别进行（按 framework.id 去重），但移除时移除匹配到某决策的具体条目
  const frameworkMap = new Map<string, MatchedFramework[]>(); // framework.id → MatchedFramework[]
  for (const mf of frameworks) {
    const list = frameworkMap.get(mf.framework.id) || [];
    list.push(mf);
    frameworkMap.set(mf.framework.id, list);
  }

  const uniqueFrameworks = Array.from(frameworkMap.values()).map(list => list[0].framework);
  const uniqueIds = uniqueFrameworks.map(f => f.id);

  // ── 第一遍：contradictory_recommendation ─────────────────
  const processedPairs = new Set<string>();

  for (let i = 0; i < uniqueIds.length; i++) {
    for (let j = i + 1; j < uniqueIds.length; j++) {
      const fwA = uniqueFrameworks[i];
      const fwB = uniqueFrameworks[j];

      // 必须有 at least 1 个重叠的 applicableDecisionTypes
      const overlapCount = intersectionSize(fwA.applicableDecisionTypes, fwB.applicableDecisionTypes);
      if (overlapCount < 1) continue;

      // 检测矛盾关键词对
      const textA = frameworkFullText(fwA);
      const textB = frameworkFullText(fwB);

      for (const pair of CONTRADICTORY_KEYWORD_PAIRS) {
        const vecA = extractContradictionVector(textA, pair);
        const vecB = extractContradictionVector(textB, pair);

        // A 偏保守方向，B 偏激进方向 → 矛盾
        if (vecA.conservative > 0 && vecB.aggressive > 0) {
          if (processedPairs.has(`${fwA.id}::${fwB.id}`)) continue;
          processedPairs.add(`${fwA.id}::${fwB.id}`);

          conflicts.push({
            frameworkA: fwA.id,
            frameworkB: fwB.id,
            type: 'contradictory_recommendation',
            description: `"${fwA.name}"偏保守（${pair[0].filter(kw => textA.toLowerCase().includes(kw.toLowerCase())).slice(0, 2).join('、')}），而"${fwB.name}"偏激进（${pair[1].filter(kw => textB.toLowerCase().includes(kw.toLowerCase())).slice(0, 2).join('、')}），在重叠决策场景"${fwA.applicableDecisionTypes.filter(t => fwB.applicableDecisionTypes.some(bt => bt.toLowerCase() === t.toLowerCase()))[0]}"下给出相反建议。`,
          });

          // 移除 matchScore 较低的那个框架（保留高分）
          // 注意：框架可能匹配多个决策类型，我们移除该框架的所有条目
          const scoreA = Math.max(...(frameworkMap.get(fwA.id) || []).map(m => m.matchScore));
          const scoreB = Math.max(...(frameworkMap.get(fwB.id) || []).map(m => m.matchScore));

          if (scoreA <= scoreB) {
            for (const mf of frameworkMap.get(fwA.id) || []) rejectedIds.add(mfKey(mf));
          } else {
            for (const mf of frameworkMap.get(fwB.id) || []) rejectedIds.add(mfKey(mf));
          }
        }

        // 反向：A 偏激进方向，B 偏保守方向 → 矛盾
        if (vecA.aggressive > 0 && vecB.conservative > 0) {
          if (processedPairs.has(`${fwA.id}::${fwB.id}`)) continue;
          processedPairs.add(`${fwA.id}::${fwB.id}`);

          conflicts.push({
            frameworkA: fwA.id,
            frameworkB: fwB.id,
            type: 'contradictory_recommendation',
            description: `"${fwA.name}"偏激进（${pair[1].filter(kw => textA.toLowerCase().includes(kw.toLowerCase())).slice(0, 2).join('、')}），而"${fwB.name}"偏保守（${pair[0].filter(kw => textB.toLowerCase().includes(kw.toLowerCase())).slice(0, 2).join('、')}），在重叠决策场景"${fwA.applicableDecisionTypes.filter(t => fwB.applicableDecisionTypes.some(bt => bt.toLowerCase() === t.toLowerCase()))[0]}"下给出相反建议。`,
          });

          const scoreA = Math.max(...(frameworkMap.get(fwA.id) || []).map(m => m.matchScore));
          const scoreB = Math.max(...(frameworkMap.get(fwB.id) || []).map(m => m.matchScore));

          if (scoreA <= scoreB) {
            for (const mf of frameworkMap.get(fwA.id) || []) rejectedIds.add(mfKey(mf));
          } else {
            for (const mf of frameworkMap.get(fwB.id) || []) rejectedIds.add(mfKey(mf));
          }
        }
      }
    }
  }

  // ── 第二遍：overlapping_coverage ─────────────────────────
  const processedOverlapPairs = new Set<string>();

  for (let i = 0; i < uniqueIds.length; i++) {
    for (let j = i + 1; j < uniqueIds.length; j++) {
      const fwA = uniqueFrameworks[i];
      const fwB = uniqueFrameworks[j];

      // 跳过已在矛盾检测中处理的配对
      if (processedPairs.has(`${fwA.id}::${fwB.id}`) || processedPairs.has(`${fwB.id}::${fwA.id}`)) continue;
      // 跳过已因第一遍被拒绝的框架
      const mfListA = frameworkMap.get(fwA.id) || [];
      const mfListB = frameworkMap.get(fwB.id) || [];
      if (mfListA.every(m => rejectedIds.has(mfKey(m)))) continue;
      if (mfListB.every(m => rejectedIds.has(mfKey(m)))) continue;

      // 规则：appliedDecisionTypes 重叠 ≥ 2，且 category 相同
      const overlapCount = intersectionSize(fwA.applicableDecisionTypes, fwB.applicableDecisionTypes);
      if (overlapCount >= 2 && fwA.category === fwB.category) {
        if (processedOverlapPairs.has(`${fwA.id}::${fwB.id}`)) continue;
        processedOverlapPairs.add(`${fwA.id}::${fwB.id}`);

        const overlapTypes = fwA.applicableDecisionTypes.filter(t =>
          fwB.applicableDecisionTypes.some(bt => bt.toLowerCase() === t.toLowerCase()),
        );

        conflicts.push({
          frameworkA: fwA.id,
          frameworkB: fwB.id,
          type: 'overlapping_coverage',
          description: `"${fwA.name}"和"${fwB.name}"同属${fwA.category}类，在"${overlapTypes.slice(0, 2).join('、')}"等≥2个决策类型上重叠覆盖，保留更高的匹配分框架。`,
        });

        // 保留 matchScore 较高的那个
        const scoreA = Math.max(...mfListA.map(m => m.matchScore));
        const scoreB = Math.max(...mfListB.map(m => m.matchScore));

        if (scoreA <= scoreB) {
          for (const mf of mfListA) rejectedIds.add(mfKey(mf));
        } else {
          for (const mf of mfListB) rejectedIds.add(mfKey(mf));
        }
      }
    }
  }

  // ── 第三遍：incompatible_category（仅 warning，不删除）──
  // 当前实现：对学术/哲学类别的框架标记 warning
  // 如果 framework.category 是 'psychology'/'medicine' 等偏学术类别
  // 但 applicableDecisionTypes 完全偏运营执行（如'质检标准'、'库存缓冲'等）
  // 这种不兼容标记为 warning，不实际删除
  const ACADEMIC_CATEGORIES = new Set(['psychology', 'medicine', 'biology-physics']);
  const OPERATIONAL_KEYWORDS = ['质检', '库存', '交付', '物流', '审批', '合规', '排期', '排班'];
  const NON_ACADEMIC_CATEGORIES = new Set(['math-engineering', 'law-governance', 'economics']);

  for (const fw of uniqueFrameworks) {
    // 如果框架已被打叉，跳过
    const mfList = frameworkMap.get(fw.id) || [];
    if (mfList.every(m => rejectedIds.has(mfKey(m)))) continue;

    // 检测：学术类别框架被用到了纯执行决策场景
    if (ACADEMIC_CATEGORIES.has(fw.category)) {
      const operationalOverlap = fw.applicableDecisionTypes.filter(t =>
        OPERATIONAL_KEYWORDS.some(kw => t.toLowerCase().includes(kw.toLowerCase())),
      );
      if (operationalOverlap.length > 0) {
        conflicts.push({
          frameworkA: fw.id,
          frameworkB: '', // 不与特定框架冲突，而是与环境冲突
          type: 'incompatible_category',
          description: `框架"${fw.name}"属于${fw.category}学术类别，但被应用到"${operationalOverlap.join('、')}"等执行层决策。建议角色定制者确认该框架在当前治理层级中是否适用。`,
        });
      }
    }

    // 反过来：工程/法律类别框架被用到学术/策略场景
    if (NON_ACADEMIC_CATEGORIES.has(fw.category)) {
      const strategicOverlap = fw.applicableDecisionTypes.filter(t =>
        ['战略', '架构', '组织设计', '文化建设', '品牌', '市场教育'].some(kw => t.toLowerCase().includes(kw.toLowerCase())),
      );
      if (strategicOverlap.length > 0 && fw.category === 'math-engineering') {
        // 数学/工程类别框架用于战略决策，标记
        conflicts.push({
          frameworkA: fw.id,
          frameworkB: '',
          type: 'incompatible_category',
          description: `框架"${fw.name}"属于${fw.category}工程类，但被应用到"${strategicOverlap.join('、')}"等战略决策。如果该角色是 L1/L2 层策略制定者，建议确认该框架的适用性。`,
        });
      }
    }
  }

  // ── 结果整理 ─────────────────────────────────────────────
  const validated: MatchedFramework[] = [];
  const rejected: MatchedFramework[] = [];

  for (const mf of frameworks) {
    if (rejectedIds.has(mfKey(mf))) {
      rejected.push(mf);
    } else {
      validated.push(mf);
    }
  }

  return { validated, rejected, conflicts };
}

/** 旧 API 兼容: 格式化为日志文本 */
export function formatConflictsForLog(result: ConflictDetectorResult): string {
  if (result.conflicts.length === 0) return '无框架冲突';
  return result.conflicts
    .map(c => `[${c.type}] ${c.frameworkA} ↔ ${c.frameworkB}: ${c.description}`)
    .join('\n');
}
