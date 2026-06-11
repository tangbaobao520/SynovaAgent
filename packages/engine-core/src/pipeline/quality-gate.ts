/**
 * quality-gate.ts — S1 推理链质量检查
 *
 * M3 进化引擎 S1 信号层：在 Phase E 完成后、Blueprint 组装前运行。
 * 检查诊断报告 → 团队蓝图之间的推理一致性。
 *
 * 非阻塞：失败只记录信号，不中断 Pipeline 主流程。
 */

import type {
  DiagnosisReport,
  BlueprintDTO,
  InferenceQualityResult,
  KnowledgeGap,
  TaskDefinitionDTO,
} from '../types';
import { runEngineDerivation, type EngineDerivationResult } from './phase-a-derive-roles';
import type { ConstraintFrameworkMatch } from './phase-b/framework-matcher';
import type { AmmoEntry } from './phase-b/ammo-depot';
import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '../infra/logger';

const log = createLogger('engine-server/pipeline/quality-gate');

const ALL_FRAMEWORK_CATEGORIES = [
  'psychology', 'economics', 'math-engineering',
  'medicine', 'biology-physics', 'law-governance',
];

/**
 * 主入口：执行推理链质量检查
 *
 * 纯结构字段对照，不调用额外 LLM。
 * blueprint 在组装前为 null（只做知识缺口检查），
 * 组装后传入完整 BlueprintDTO 做风险覆盖检查。
 */
export function runInferenceQualityCheck(
  taskDef: TaskDefinitionDTO,
  diagnosisReport?: DiagnosisReport,
  blueprint?: BlueprintDTO,
): InferenceQualityResult {
  const result: InferenceQualityResult = {
    inferenceGaps: [],
    knowledgeGaps: [],
    qualityDegraded: false,
    frameworkBlindspot: { hasBlindspot: false, dominantCategory: '', missingCategories: [] },
    overallScore: 100,
  };

  // 重新运行引擎推导以获取约束匹配数据（纯函数，无副作用）
  let phaseADerivation: EngineDerivationResult | null = null;
  try {
    phaseADerivation = runEngineDerivation(taskDef);
  } catch {
    log.warn('[quality-gate] 引擎推导失败，降级处理');
    // 引擎推导失败 → 降级，总体评分-10
    result.qualityDegraded = true;
    result.overallScore -= 10;
  }

  // ── 检查1：诊断风险是否被 Blueprint 覆盖（仅在组装后执行）──
  if (blueprint && diagnosisReport?.risks?.topConcerns) {
    for (const risk of diagnosisReport.risks.topConcerns) {
      const matched = (blueprint.riskCoverage || []).filter(
        r => r.riskName.toLowerCase().includes(risk.toLowerCase()) ||
             risk.toLowerCase().includes(r.riskName.toLowerCase()),
      );
      const hasGap = matched.length === 0 || matched.every(r => r.coverageLevel === 'gap');
      if (hasGap) {
        result.inferenceGaps.push({
          riskName: risk,
          coverageLevel: 'gap',
          severity: 'critical' as const,
        });
        result.overallScore -= 25;
      }
    }
  }

  // ── 检查2：约束是否有未匹配到框架的 ──
  if (phaseADerivation) {
    const unmatched = phaseADerivation.unmatchedConstraints || [];
    for (const c of unmatched) {
      const gap: KnowledgeGap = {
        unmatchedConstraint: c,
        suggestedIndustry: inferIndustry(c),
        suggestedDimension: inferDimension(c),
        discoveredAt: new Date().toISOString(),
        priority: 'high',
        status: 'pending',
      };
      result.knowledgeGaps.push(gap);
      result.overallScore -= 10;
    }

    // ── 检查3：框架类别多样性 ──
    const categories = new Set<string>();
    const allMatches = phaseADerivation.constraintMatches || [];
    for (const m of allMatches) {
      if ((m as ConstraintFrameworkMatch).framework?.category) {
        categories.add((m as ConstraintFrameworkMatch).framework!.category);
      }
    }
    if (categories.size <= 1 && allMatches.length >= 3) {
      result.frameworkBlindspot = {
        hasBlindspot: true,
        dominantCategory: [...categories][0] || 'unknown',
        missingCategories: ALL_FRAMEWORK_CATEGORIES.filter(c => !categories.has(c)),
      };
      result.overallScore -= 10;
    }
  }

  result.overallScore = Math.max(0, result.overallScore);
  return result;
}

/**
 * 将 S1 知识缺口发布到弹药工厂的 missing/ 目录。
 * 供每日 09:00 弹药采集定时任务优先读取。
 */
export async function publishKnowledgeGaps(gaps: KnowledgeGap[]): Promise<void> {
  if (gaps.length === 0) return;

  const dir = path.resolve(process.cwd(), '..', 'research', 'ammo-factory', 'missing');
  try {
    await fs.promises.mkdir(dir, { recursive: true });
    for (const gap of gaps) {
      const filename = `gap-${sanitizeFilename(gap.suggestedIndustry)}-${sanitizeFilename(gap.suggestedDimension)}-${Date.now()}.json`;
      await fs.promises.writeFile(
        path.join(dir, filename),
        JSON.stringify(gap, null, 2),
      );
    }
    log.info(`[quality-gate] 发布 ${gaps.length} 个知识缺口到 ${dir}`);
  } catch (err) {
    log.warn(`[quality-gate] 写入 knowledge_gap 失败: ${(err as Error).message}`);
  }
}

// ── 辅助函数：从约束文本推断行业和维度 ──

function inferIndustry(constraint: string): string {
  const text = constraint.toLowerCase();
  if (/跨境|外贸|出口|进口|shopee|lazada|亚马逊|ebay/i.test(text)) return '跨境电商';
  if (/餐饮|食品|厨房|门店|加盟|连锁/i.test(text)) return '连锁餐饮';
  if (/saas|软件|订阅|api|云服务|平台/i.test(text)) return 'SaaS软件';
  if (/供应链|物流|仓储|配送|库存/i.test(text)) return '供应链管理';
  if (/医疗|医药|器械|临床|fda|药品/i.test(text)) return '医疗器械';
  if (/新能源|光伏|储能|电池|充电/i.test(text)) return '新能源';
  if (/教育|培训|课程|教学|学生/i.test(text)) return '教育科技';
  if (/金融|支付|借贷|保险|投资/i.test(text)) return '金融科技';
  if (/游戏|电竞|手游|主机/i.test(text)) return '游戏出海';
  return '通用跨行业';
}

function sanitizeFilename(str: string): string {
  return str.replace(/[<>:"/\\|?*]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function inferDimension(constraint: string): string {
  const text = constraint.toLowerCase();
  if (/合规|许可|证|注册|法规|监管|认证|标准|iso/i.test(text)) return '合规/监管';
  if (/支付|结算|汇率|货款|账期|佣金/i.test(text)) return '支付/结算';
  if (/物流|配送|仓储|运输|快递|库存/i.test(text)) return '物流/供应链';
  if (/平台|渠道|获客|流量|广告|推广|用户增长/i.test(text)) return '平台/渠道';
  if (/消费者|用户行为|购买|偏好|复购|留存/i.test(text)) return '消费者/用户行为';
  return '通用';
}

/**
 * 将 research/ammo-factory/missing/ 中的知识缺口草稿，
 * 转换为弹药草案（AmmoEntry JSON）发布到 entries/ 目录，
 * 供弹药采集定时任务（每日 09:00）优先读取和加工。
 *
 * 转换后删除对应的 gap 文件，避免重复处理。
 * @returns 本次转换的弹药草案数量
 */
export async function publishGapsAsAmmoDrafts(): Promise<number> {
  const missingDir = path.resolve(process.cwd(), '..', 'research', 'ammo-factory', 'missing');
  const entriesDir = path.resolve(process.cwd(), '..', 'research', 'ammo-factory', 'entries');
  let converted = 0;

  try {
    await fs.promises.mkdir(missingDir, { recursive: true });
    await fs.promises.mkdir(entriesDir, { recursive: true });

    const files = await fs.promises.readdir(missingDir);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const filePath = path.join(missingDir, file);
      try {
        const raw = await fs.promises.readFile(filePath, 'utf-8');
        const gap: KnowledgeGap = JSON.parse(raw);
        if (!gap.unmatchedConstraint) continue;

        const draftEntry: AmmoEntry = {
          id: `draft-${sanitizeFilename(gap.suggestedIndustry)}-${sanitizeFilename(gap.suggestedDimension)}-${Date.now()}`,          industry: gap.suggestedIndustry,
          keywords: gap.unmatchedConstraint.split(/\s+/).filter(w => w.length > 1),
          factText: `【知识缺口待填充】${gap.unmatchedConstraint}`,
          confidence: 'llm_generated',
          sources: [],
          updatedAt: new Date().toISOString().split('T')[0],
          matchType: 'industry',
        };

        await fs.promises.writeFile(
          path.join(entriesDir, `${draftEntry.id}.json`),
          JSON.stringify(draftEntry, null, 2),
        );

        // 删除已转换的缺口文件，避免重复处理
        await fs.promises.unlink(filePath);
        converted++;
      } catch (parseErr) {
        log.warn(`[quality-gate] 跳过无效缺口文件: ${file} — ${(parseErr as Error).message}`);
      }
    }

    if (converted > 0) {
      log.info(`[quality-gate] 已将 ${converted} 个知识缺口转换为弹药草案`);
    }
  } catch (err) {
    log.warn(`[quality-gate] 发布弹药草案失败: ${(err as Error).message}`);
  }
  return converted;
}
