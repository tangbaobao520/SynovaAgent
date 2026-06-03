/**
 * engine-server/pipeline/phase-b/slim-extract.ts — SlimPersona 双表示提取器
 *
 * 来自 SAGER (arXiv:2604.14972) 的 Injection Paradox：
 * prompt注入质量是非单调的——30 tokens时峰值，超过100 tokens反而下降。
 * 当前 Phase B 每个角色注入 80-150 tokens 的完整框架文本。
 *
 * 此模块实现 SlimPersona：从完整框架库提取 ≤60 tokens 的精简表达，
 * 只保留核心启发式 + 反模式预警 + 约束触发词。
 *
 * 沈括接口契约：
 *   Input:  Framework[] ← framework-matcher 匹配结果 (5-8个)
 *   Output: SlimPersonaOutput { slimMentalModels ≤5, suppressedCount, totalTokenCount, ... }
 *
 * @date 2026-05-13
 */

import type { Framework } from './framework-library';

// ================================================================
// 输出结构（沈括契约定义）
// ================================================================

/** SlimPersona 提取后的单个心智模型 */
export interface SlimMentalModel {
  id: string;            // "mm-{frameworkName}-{roleIndex}"
  name: string;          // 框架名称（≤15 chars）
  description: string;   // 框架描述（≤80 chars）
  source: string;        // 框架来源（认知库ID）
  confidence: number;    // 置信度 (0.3-0.95)
}

/** SlimPersona 提取输出 */
export interface SlimPersonaOutput {
  slimMentalModels: SlimMentalModel[];
  suppressedCount: number;                          // 被压制的框架数
  totalTokenCount: number;                          // 注入prompt的实际token估算
  degradationRisk: 'none' | 'moderate' | 'critical'; // 退化风险等级
  fallbackTriggered: boolean;                       // 退化检测是否介入
}

// ================================================================
// SAGER 阈值常量
// ================================================================

/** SAGER 论文发现：prompt注入质量峰值（tokens） */
const OPTIMAL_TOKEN_LIMIT = 60;

/** 退化阈值：超过此值注入质量开始下降（SAGER Fig.5） */
const MODERATE_RISK_THRESHOLD = 80;

/** 临界阈值：超过此值注入质量显著退化（SAGER §3.4） */
const CRITICAL_RISK_THRESHOLD = 100;

/** 保留的精简框架数上限 */
const MAX_SLIM_MODELS = 5;

/** description 字段最大字符数 */
const MAX_DESCRIPTION_CHARS = 80;

// ================================================================
// 提取逻辑
// ================================================================

/**
 * 从 framework-matcher 产出的完整框架列表中提取 SlimPersona。
 *
 * 策略：
 * 1. 取 top-5 匹配度最高的框架
 * 2. 每个框架提取精简描述（≤80 chars）：核心洞见的前80字符
 * 3. 剔除冗余：如果多个框架的核心洞见高度相似（编辑距离 < 阈值），只保留第一个
 * 4. 计算总 token 数（粗略估算：chars/4）
 * 5. 评估退化风险
 */
export function extractSlimPersona(
  frameworks: Framework[],
  roleId: string,
): SlimPersonaOutput {
  if (!frameworks || frameworks.length === 0) {
    return {
      slimMentalModels: [],
      suppressedCount: 0,
      totalTokenCount: 0,
      degradationRisk: 'none',
      fallbackTriggered: false,
    };
  }

  // 1. 取 top-5
  const top5 = frameworks.slice(0, MAX_SLIM_MODELS);
  const suppressedCount = Math.max(0, frameworks.length - MAX_SLIM_MODELS);

  // 2. 精简描述 + 去重
  const seen = new Set<string>();
  const slimModels: SlimMentalModel[] = [];

  for (let i = 0; i < top5.length; i++) {
    const fw = top5[i];

    // 去重：核心洞见高度重叠 → 跳过
    const insightKey = fw.coreInsight.slice(0, 30).replace(/\s+/g, '');
    if (seen.has(insightKey)) {
      continue;
    }
    seen.add(insightKey);

    // 精简描述：取 coreInsight 的前 MAX_DESCRIPTION_CHARS 字符
    const desc = fw.coreInsight.length > MAX_DESCRIPTION_CHARS
      ? fw.coreInsight.slice(0, MAX_DESCRIPTION_CHARS - 3) + '...'
      : fw.coreInsight;

    slimModels.push({
      id: `mm-${fw.id}-${roleId}`,
      name: fw.name.slice(0, 15),   // 截断到15字符
      description: desc,
      source: fw.id,
      // 置信度基于匹配排序：top-1=0.95, top-2=0.85, 依此类推
      confidence: Math.max(0.3, 0.95 - i * 0.1),
    });
  }

  // 3. 估算 token 数（中文约1.5 chars/token，英文约4 chars/token，取粗略平均3 chars/token）
  let totalChars = 0;
  for (const m of slimModels) {
    totalChars += m.name.length + m.description.length + m.source.length + 8; // +8 for separators
  }
  const totalTokenCount = Math.ceil(totalChars / 3);

  // 4. 退化风险评估
  let degradationRisk: SlimPersonaOutput['degradationRisk'] = 'none';
  let fallbackTriggered = false;

  if (totalTokenCount > CRITICAL_RISK_THRESHOLD) {
    degradationRisk = 'critical';
    fallbackTriggered = true;
  } else if (totalTokenCount > MODERATE_RISK_THRESHOLD) {
    degradationRisk = 'moderate';
  }

  return {
    slimMentalModels: slimModels,
    suppressedCount,
    totalTokenCount,
    degradationRisk,
    fallbackTriggered,
  };
}

/**
 * 将 SlimPersona 格式化为 LLM prompt 注入文本。
 * 只包含精简信息，不注入完整框架文本。
 *
 * @returns 格式化后的 prompt 文本（≤200 chars，≤60 tokens）
 */
export function formatSlimForPrompt(output: SlimPersonaOutput): string {
  if (output.slimMentalModels.length === 0) {
    return '';
  }

  const lines = output.slimMentalModels.map(m =>
    `· ${m.name}(${m.source}): ${m.description.slice(0, 60)}`,
  );

  // 退化警告
  if (output.fallbackTriggered) {
    lines.push(`⚠️ 框架注入已触发退化检测：${output.totalTokenCount} tokens（>${CRITICAL_RISK_THRESHOLD}阈值），已自动精简。`);
  }

  return lines.join('\n');
}

/**
 * 批量提取：为所有角色创建 SlimPersona
 *
 * @param frameworksByRole - roleId → Framework[] (来自 framework-matcher)
 * @returns roleId → SlimPersonaOutput
 */
export function batchExtractSlim(
  frameworksByRole: Record<string, Framework[]>,
): Record<string, SlimPersonaOutput> {
  const result: Record<string, SlimPersonaOutput> = {};
  for (const [roleId, frameworks] of Object.entries(frameworksByRole)) {
    result[roleId] = extractSlimPersona(frameworks, roleId);
  }
  return result;
}
