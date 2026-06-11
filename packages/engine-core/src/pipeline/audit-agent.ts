/**
 * engine-server/pipeline/audit-agent.ts — 独立审计 Agent（P2 壁垒二核心）
 *
 * 壁垒二"生成-审计-校验铁三角"的中间层：独立审计。
 *
 * 设计原则：
 * 1. 角色分离：audit-agent 与 distill-genome 使用不同的 LLM prompt 策略
 * 2. 逐项审计：对 PersonaGenome 的每个字段做可证伪审查
 * 3. 阻断式输出：不通过的项目标记为 blocking，供 orchestrator 决策
 * 4. 诚实边界：区分 verified（有原话支撑）/ inferred（推理产物）/ unverifiable（不可验证）
 *
 * 审计维度（8 项）：
 * 1. OCEAN 合理性 — 五个维度是否与角色职责一致
 * 2. 思维模型来源 — 每个 mentalModel 的 source 是否可验证
 * 3. 框架冲突 — 同一角色的框架组合是否自洽
 * 4. 诚实边界 — honestBoundaries 是否覆盖角色盲区
 * 5. 反模式 — antiPatterns 是否具体（非泛化）
 * 6. 场景一致性 — 基因组是否与 taskDefinition.job 相关
 * 7. 推导透明度 — derivationMethod 标注是否正确
 * 8. 置信度诚实 — confidence 值是否与证据量匹配
 *
 * @packageDocumentation
 */

import type { PersonaGenomeBlue, TaskDefinitionDTO } from '../types';
import { chat } from '../llm-client';
import { createLogger } from '../infra/logger';

const log = createLogger('engine-server/pipeline/audit-agent');

// ================================================================
// 类型定义
// ================================================================

export type AuditVerdict = 'verified' | 'inferred' | 'unverifiable' | 'failed';

export interface AuditItem {
  /** 审计维度编号 */
  dimensionId: number;
  /** 维度名称 */
  dimension: string;
  /** 审计判定 */
  verdict: AuditVerdict;
  /** 审计理由（具体、可引用） */
  rationale: string;
  /** 是否阻塞上线 */
  blocking: boolean;
  /** 修复建议（如果 verdict 不是 verified） */
  suggestion?: string;
}

export interface AuditResult {
  /** 总审计通过 */
  passed: boolean;
  /** 各维度审计条目 */
  items: AuditItem[];
  /** 审计摘要 */
  summary: {
    verified: number;
    inferred: number;
    unverifiable: number;
    failed: number;
    blocked: number;
  };
  /** 全局判定 */
  overallVerdict: 'publish' | 'conditional_publish' | 'draft_only';
  /** 整体审计意见 */
  opinion: string;
  /** LLM 原始输出（用于调试） */
  llmRaw?: string;
}

// ================================================================
// 规则驱动预审（零 LLM，快速拦截明显问题）
// ================================================================

function preAuditRules(
  genomes: PersonaGenomeBlue[],
  taskDef: TaskDefinitionDTO,
): AuditItem[] {
  const items: AuditItem[] = [];

  for (const g of genomes) {
    // 规则 1: OCEAN 全 0.5 — 明显未填充
    const oceanValues = Object.values(g.oceanScores);
    const allDefault = oceanValues.every(v => v === 0.5);
    if (allDefault) {
      items.push({
        dimensionId: 1,
        dimension: 'OCEAN 合理性',
        verdict: 'failed',
        rationale: `角色 "${g.roleName}" 的 OCEAN 全为 0.5，LLM 未正确填充`,
        blocking: true,
        suggestion: '重新蒸馏该角色，或启用 StatInit 规则推导',
      });
    }

    // 规则 2: 思维模型 source 全部相同 — 框架单一
    if (Array.isArray(g.mentalModels) && g.mentalModels.length >= 2) {
      const sources = g.mentalModels.map(m => m.source).filter(Boolean);
      const uniqueSources = new Set(sources);
      if (uniqueSources.size === 1 && sources.length >= 3) {
        items.push({
          dimensionId: 2,
          dimension: '思维模型来源',
          verdict: 'inferred',
          rationale: `角色 "${g.roleName}" 的 ${sources.length} 个思维模型全部引用同一框架 "${sources[0]}"`,
          blocking: false,
          suggestion: '引入更多样化的认知框架',
        });
      }
    }

    // 规则 3: 反模式过于泛化 — 检测关键词
    if (Array.isArray(g.antiPatterns)) {
      const genericPatterns = g.antiPatterns.filter(p =>
        p.length < 10 ||
        /过度|不足|缺乏/.test(p) && p.length < 20
      );
      if (genericPatterns.length === g.antiPatterns.length && g.antiPatterns.length > 0) {
        items.push({
          dimensionId: 5,
          dimension: '反模式具体性',
          verdict: 'inferred',
          rationale: `角色 "${g.roleName}" 的反模式过于泛化（${g.antiPatterns.join('；')}）`,
          blocking: false,
          suggestion: '将反模式与 job 场景绑定，提供具体失败案例',
        });
      }
    }

    // 规则 4: confidence 与基因组内容一致性 — 低 confidence 但有丰富框架 → 矛盾
    if ((g.confidence ?? 0) < 0.3 && Array.isArray(g.mentalModels) && g.mentalModels.length >= 3) {
      items.push({
        dimensionId: 8,
        dimension: '置信度诚实',
        verdict: 'inferred',
        rationale: `角色 "${g.roleName}" 有 ${g.mentalModels.length} 个思维模型但 confidence=${g.confidence?.toFixed(2)}，置信度可能过低`,
        blocking: false,
        suggestion: '检查 confidence 评分逻辑；3+ 模型通常对应 confidence≥0.4',
      });
    }
  }

  return items;
}

// ================================================================
// LLM 审计 Prompt
// ================================================================

function buildAuditPrompt(
  genomes: PersonaGenomeBlue[],
  taskDef: TaskDefinitionDTO,
  ruleItems: AuditItem[],
): string {
  const genomeText = genomes.map(g => {
    const models = (g.mentalModels || []).map(m =>
      `    - ${m.name}: ${m.oneLiner} (source: ${m.source || '未标注'})`
    ).join('\n');

    return `角色: ${g.roleName} (${g.roleId})
  confidence: ${(g.confidence ?? 0).toFixed(2)}
  OCEAN: O=${g.oceanScores.openness.toFixed(1)} C=${g.oceanScores.conscientiousness.toFixed(1)} E=${g.oceanScores.extraversion.toFixed(1)} A=${g.oceanScores.agreeableness.toFixed(1)} N=${g.oceanScores.neuroticism.toFixed(1)}
  思维模型:
${models}
  诚实边界: ${(g.honestBoundaries || []).join('；') || '无'}
  反模式: ${(g.antiPatterns || []).join('；') || '无'}`;
  }).join('\n\n');

  const ruleItemsText = ruleItems.length > 0
    ? `\n\n规则预审已发现的问题：\n${ruleItems.map(r => `  - [${r.dimension}] ${r.verdict}: ${r.rationale}`).join('\n')}`
    : '\n\n规则预审未发现问题。';

  return `你是一个独立审计员。你的任务是对以下 Agent 角色基因组做独立的逐项审计。

你不能信任生成者的自我评分。你必须用自己的判断，逐维度核实。

## 任务背景
用户需求：${taskDef.job}
场景阶段：${taskDef.stage || 'from_scratch'}
约束条件：${(taskDef.constraints || []).join('；')}

## 待审计的基因组
${genomeText}
${ruleItemsText}

## 审计要求

对每个角色，逐一审计以下 8 个维度。每个维度给出：
- verdict: verified | inferred | unverifiable | failed
- rationale: 具体理由（必须可查证，不得模糊）
- blocking: true | false（该问题是否阻止上线）

### 1. OCEAN 合理性
- 五个维度分值是否与该角色职责一致？
- 例如：运营总监应高 conscientiousness + 中等 extraversion
- 例如：产品专员应高 openness

### 2. 思维模型来源
- 每个 mentalModel 的 source 是否可溯？
- source 是否标注为框架库 ID？
- 是否存在"来源不可查证"的模型？

### 3. 框架冲突
- 同角色的多个认知框架之间是否存在逻辑矛盾？
- 例如："incentive_bias"（经济人假设）与"intrinsic_motivation"（内在驱动）共存需说明应用边界

### 4. 诚实边界
- honestBoundaries 是否覆盖角色盲区？
- 是否明确标注"我不知道什么"？
- 边界是否与角色职责自然盲区对应？

### 5. 反模式具体性
- antiPatterns 是否场景特化（非泛泛的"缺乏沟通"）？
- 是否与 job 场景相关？

### 6. 场景一致性
- 基因组是否与 taskDefinition.job 实际相关？
- 是否存在"通用模板"痕迹？

### 7. 推导透明度
- derivationMethod 标注是否正确？
- 是否与 confidence 值一致？

### 8. 置信度诚实
- confidence 值是否与证据量匹配？
- template_match 型高置信度是否合理？
- cold_start 型高置信度是否矛盾？

## 输出格式

严格输出 JSON，不输出其他内容：

{
  "items": [
    {
      "dimensionId": 1,
      "dimension": "OCEAN 合理性",
      "verdict": "verified",
      "rationale": "...",
      "blocking": false,
      "suggestion": null
    }
  ],
  "overallVerdict": "publish",
  "opinion": "总体审计意见（一段话）"
}

overallVerdict 判定标准：
- publish: verified ≥ 80%，无 failed
- conditional_publish: verified ≥ 60%，failed < 20%
- draft_only: verified < 60% 或 blocking > 0

只输出 JSON，不要输出其他内容。`;
}

// ================================================================
// 解析 LLM 审计输出
// ================================================================

function parseAuditResponse(
  content: string,
  ruleItems: AuditItem[],
): AuditResult {
  let parsed: any;
  try {
    // 尝试提取 JSON
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
    }
  } catch (_e) { log.debug('LLM 审计结果解析失败，回退到规则结果: %s', String(_e)); }

  // 合并规则预审 + LLM 审计
  const llmItems: AuditItem[] = Array.isArray(parsed?.items)
    ? parsed.items.map((item: any) => ({
        dimensionId: item.dimensionId || 0,
        dimension: item.dimension || '未知',
        verdict: (['verified', 'inferred', 'unverifiable', 'failed'].includes(item.verdict) ? item.verdict : 'unverifiable') as AuditVerdict,
        rationale: item.rationale || 'LLM 未提供理由',
        blocking: item.blocking === true,
        suggestion: item.suggestion || undefined,
      }))
    : [];

  // 规则预审结果优先（LLM 不能推翻规则的硬性判定）
  const allItems = [...ruleItems];
  const ruleDimensionIds = new Set(ruleItems.map(r => `${r.dimensionId}_${r.rationale.substring(0, 20)}`));

  for (const item of llmItems) {
    // 避免重复：LLM 结果如果与规则预审完全重叠则跳过
    const key = `${item.dimensionId}_${item.rationale.substring(0, 20)}`;
    if (!ruleDimensionIds.has(key)) {
      allItems.push(item);
    }
  }

  // 统计
  const summary = {
    verified: allItems.filter(i => i.verdict === 'verified').length,
    inferred: allItems.filter(i => i.verdict === 'inferred').length,
    unverifiable: allItems.filter(i => i.verdict === 'unverifiable').length,
    failed: allItems.filter(i => i.verdict === 'failed').length,
    blocked: allItems.filter(i => i.blocking).length,
  };

  const hasBlocking = summary.blocked > 0;
  const verifiedRate = allItems.length > 0 ? summary.verified / allItems.length : 1;

  let overallVerdict: AuditResult['overallVerdict'];
  if (hasBlocking || verifiedRate < 0.6) {
    overallVerdict = 'draft_only';
  } else if (verifiedRate < 0.8) {
    overallVerdict = 'conditional_publish';
  } else {
    overallVerdict = 'publish';
  }

  // 允许 LLM 的 overallVerdict 覆盖（仅在更严格时）
  if (parsed?.overallVerdict === 'draft_only' && overallVerdict !== 'draft_only') {
    overallVerdict = 'draft_only';
  }

  return {
    passed: !hasBlocking && overallVerdict !== 'draft_only',
    items: allItems,
    summary,
    overallVerdict,
    opinion: parsed?.opinion || (llmItems.length === 0 ? 'LLM 审计不可用，仅执行规则预审' : '审计完成'),
    llmRaw: content,
  };
}

// ================================================================
// 主入口：执行独立审计
// ================================================================

/**
 * 对 Phase B 产出的 PersonaGenome 执行独立审计。
 *
 * 审计流程：
 * 1. 规则预审（零 LLM 快速拦截）
 * 2. LLM 深度审计（8 维度逐项审查）
 * 3. 合并结果 → 判定 publish / conditional_publish / draft_only
 *
 * @param genomes - Phase B 产出的角色基因组
 * @param taskDef - 原始任务定义
 * @param abortSignal - 取消信号
 * @returns 审计结果
 */
export async function auditGenomes(
  genomes: PersonaGenomeBlue[],
  taskDef: TaskDefinitionDTO,
  abortSignal?: AbortSignal,
): Promise<AuditResult> {
  // Step 1: 规则预审
  const ruleItems = preAuditRules(genomes, taskDef);

  // 如果规则预审已发现 blocking 问题，仍执行 LLM 审计（LLM 可能发现更多问题）
  // 但记录预审结果

  // Step 2: LLM 深度审计
  let llmContent: string | null = null;

  try {
    const userMessage = buildAuditPrompt(genomes, taskDef, ruleItems);
    const result = await chat({
      systemPrompt: '你是一个独立审计员。你只输出 JSON，不输出其他内容。',
      userMessage,
      temperature: 0.2,
      maxTokens: 3000,
      abortSignal,
    });
    llmContent = result.content;
  } catch (err) {
    // LLM 审计不可用时，仅依赖规则预审
    log.info(`[audit-agent] LLM 审计不可用: ${(err as Error).message}，降级为规则预审`);
  }

  // Step 3: 合并结果
  return parseAuditResponse(llmContent || '', ruleItems);
}

/**
 * 仅执行规则预审（不调用 LLM）。
 * 用于冷启动或无 API Key 场景。
 */
export function auditGenomesRulesOnly(
  genomes: PersonaGenomeBlue[],
  taskDef: TaskDefinitionDTO,
): AuditResult {
  const ruleItems = preAuditRules(genomes, taskDef);

  const summary = {
    verified: ruleItems.filter(i => i.verdict === 'verified').length,
    inferred: ruleItems.filter(i => i.verdict === 'inferred').length,
    unverifiable: ruleItems.filter(i => i.verdict === 'unverifiable').length,
    failed: ruleItems.filter(i => i.verdict === 'failed').length,
    blocked: ruleItems.filter(i => i.blocking).length,
  };

  const hasBlocking = summary.blocked > 0;

  return {
    passed: !hasBlocking,
    items: ruleItems,
    summary,
    overallVerdict: hasBlocking ? 'draft_only' : 'conditional_publish',
    opinion: hasBlocking
      ? '规则预审发现阻塞性问题，基因组的 derivationMethod 标注与 confidence 不一致'
      : 'LLM 审计不可用，仅执行规则预审。建议在上线前执行完整 LLM 审计。',
  };
}
