/**
 * pipeline/dialogue-quality.ts — L0 对话质量与 IF 精度评估
 *
 * M3 进化引擎 S0 信号层：对话质量信号采集（困惑/确认/展开/重定向）。
 * V1.6 IF 精度评估：约束从"未表达→条件→已表达"的进展。
 *
 * 纯文本/结构模式匹配，不调用额外 LLM。
 * 宪法安全：只在对话文本层面采集，零 I/O 零网络。
 */

import type { DialogueQualityBrief } from '../types';

/**
 * S0: 生成 L0 对话质量简报
 *
 * 纯文本模式匹配，不调用额外 LLM。
 * 宪法安全：只在对话文本层面采集，零 I/O 零网络。
 */
export function generateDialogueQualityBrief(
  sessionId: string,
  conversationHistory: Array<{ role: string; content: string }>,
): DialogueQualityBrief {
  const userMessages = conversationHistory.filter(m => m.role === 'user').map(m => m.content);
  const allUserText = userMessages.join(' ');

  // 困惑信号检测
  const confusionPatterns = /听不懂|不是这个意思|不对|错了|算了|无语|\.\.\.|\.\.\.\.|你没理解/;
  const confusionCount = userMessages.filter(m => confusionPatterns.test(m)).length;

  // 确认信号检测
  const confirmationPatterns = /^(对|没错|就是这样|嗯嗯|是的|对的|好|OK|ok|可以|没问题)[\s。.。!！]*$/;
  const confirmationCount = userMessages.filter(m => confirmationPatterns.test(m.trim())).length;

  // 主动展开信号检测（用户输入长段结构化业务描述 ≥200字符）
  const elaborationCount = userMessages.filter(m => m.length >= 200).length;

  // 重定向信号检测
  const lastAssistantMsg = [...conversationHistory].reverse().find(m => m.role === 'assistant');
  const redirectCount = lastAssistantMsg && /我们可以继续|还有什么|聊聊|回到/.test(lastAssistantMsg.content) ? 1 : 0;

  // 整体质量判定
  const overallQuality: 'high' | 'medium' | 'low' =
    confusionCount >= 2 ? 'low' :
    elaborationCount >= 2 && confusionCount === 0 ? 'high' :
    'medium';

  // 改进提示
  const improvementHints: string[] = [];
  if (confusionCount >= 2) {
    improvementHints.push(`对话中出现 ${confusionCount} 次困惑信号，建议审查追问话术`);
  }
  if (confirmationCount === 0 && userMessages.length > 10) {
    improvementHints.push('用户未在任何轮次中发出确认信号，诊断假设可能未对齐');
  }

  return {
    sessionId,
    totalRounds: userMessages.length,
    signals: { confusionCount, confirmationCount, elaborationCount, redirectCount },
    overallQuality,
    improvementHints,
  };
}

// ====================================================================
// V1.6: 0·IF·1 精度评估
// ====================================================================

export interface IFPrecisionResult {
  overallLevel: number;
  precisionScore: number;
  fields: Record<string, { level: number; label: string; detail: string }>;
  unexpressedGaps: string[];
  suggestion: string;
}

/**
 * V1.6: 0·IF·1 精度评估
 *
 * 评估任务定义中约束从"未表达→条件→已表达"的进展，
 * 返回结构化精度分数和改进建议。
 */
export function assessIFPrecision(taskDef: {
  job: string;
  constraints: string[];
  domainKeywords?: string[] | null;
  teamSize?: number | null;
  budget?: string | null;
  marketGeography?: string | null;
  techStack?: string[] | null;
}): IFPrecisionResult {
  const evalField = (text: string | undefined | null, fieldType: string): number => {
    if (!text || text.length < 3) return 0;
    const hasNums = /\d+/.test(text);
    const hasPlatform = /Shopify|Amazon|淘宝|天猫|抖音|TikTok|Shopee|Lazada|独立站|小程序|APP\b|网站|SaaS|B2B|B2C|DTC/.test(text);
    const hasScale = /月|年|万|千|美金|美元|人民币|元|预算|成本/.test(text);
    const hasGeo = /东南亚|欧美|北美|拉美|中东|非洲|日本|韩国|印度|巴西|墨西哥|越南|国内|跨境|出海/.test(text);
    if (fieldType === 'job') return (hasNums || hasPlatform) && text.length > 15 ? 1 : text.length > 8 ? 0.5 : 0;
    let s = 0; if (hasNums) s++; if (hasPlatform) s++; if (hasScale) s++; if (hasGeo) s++;
    return s >= 2 ? 1 : s === 1 ? 0.5 : 0;
  };

  const fields: IFPrecisionResult['fields'] = {};
  fields.job = { level: evalField(taskDef.job, 'job'), label: '任务描述', detail: taskDef.job || '(空)' };
  fields.constraints = {
    level: taskDef.constraints.length >= 2 ? 1 : taskDef.constraints.length === 1 ? 0.5 : 0,
    label: '约束条件', detail: `${taskDef.constraints.length}条`,
  };
  fields.teamSize = { level: taskDef.teamSize ? 1 : 0, label: '团队规模', detail: taskDef.teamSize ? `${taskDef.teamSize}人` : '未提及' };
  fields.budget = { level: taskDef.budget ? 1 : 0, label: '预算', detail: taskDef.budget || '未提及' };
  fields.marketGeography = { level: taskDef.marketGeography ? 1 : 0, label: '目标市场', detail: taskDef.marketGeography || '未提及' };
  fields.domainKeywords = {
    level: (taskDef.domainKeywords?.length ?? 0) >= 2 ? 1 : (taskDef.domainKeywords?.length ?? 0) === 1 ? 0.5 : 0,
    label: '领域关键词', detail: taskDef.domainKeywords?.join(',') || '无',
  };
  fields.techStack = {
    level: (taskDef.techStack?.length ?? 0) > 0 ? 1 : 0,
    label: '技术栈', detail: taskDef.techStack?.join(',') || '未提及',
  };

  const levels = Object.values(fields).map(f => f.level);
  const avgLevel = levels.reduce((a, b) => a + b, 0) / levels.length;
  const expressedCount = levels.filter(l => l >= 0.5).length;
  const unexpressedGaps = Object.entries(fields).filter(([_, f]) => f.level === 0).map(([_, f]) => f.label);

  let suggestion: string;
  if (expressedCount <= 2) suggestion = '信息太少，建议追问: 行业/品类、团队规模或预算、目标市场';
  else if (unexpressedGaps.length > 0) suggestion = `仍需明确: ${unexpressedGaps.join('、')}`;
  else suggestion = '信息充足，可以进入孵化确认';

  return {
    overallLevel: Math.round(avgLevel * 10) / 10,
    precisionScore: Math.round((expressedCount / levels.length) * 100),
    fields,
    unexpressedGaps,
    suggestion,
  };
}
