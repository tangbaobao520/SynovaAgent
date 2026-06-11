/**
 * engine-server/pipeline/orchestrator.ts — LLM 管道编排主入口
 *
 * 编排 L1-L5 五个阶段的顺序执行：
 *   L1_derive_roles   → Phase A
 *   L2_distill_genome  → Phase B
 *   L3_select_mode     → Phase C
 *   L4_match_skills    → Phase D
 *   L5_assemble_blueprint → Phase E
 *
 * 每个阶段：
 *   1. 调用 LLM (Gateway /v1/chat/completions)
 *   2. 解析 LLM 输出为结构化数据
 *   3. 生成 IncubationFrame 供前端轮询消费
 *   4. 更新 task-store 中的进度
 *
 * @packageDocumentation
 */

import type {
  GenerateBlueprintRequest,
  BlueprintDTO,
  IncubationFrame,
  DiagnosisReport,
  TaskDefinitionDTO,
  RoleBlue,
  SkillSetBlue,
  CollaborationModeBlue,
} from '../types';
import fs from 'fs';
import path from 'path';
import { validateBlueprint } from './rule-checker';
import { PIPELINE_PHASES, PHASE_LABELS } from '../types';
import { updateTaskProgress, markCompleted, markFailed } from '../task-store';
import { ENGINE_VERSION, PIPELINE_VERSION, BLUEPRINT_SCHEMA_VERSION } from '../pipeline-config';
import { runPhaseA } from './phase-a-derive-roles';
import { runPhaseB } from './phase-b-distill-genome';
import { injectOrgAmmo } from './phase-b/ammo-injector';
import { runPhaseC } from './phase-c-select-mode';
import { runPhaseD } from './phase-d-match-skills';
import { auditSkills } from './skill-auditor';
import { runPhaseE } from './phase-e-assemble-blueprint';
import { convertBlueprintToTeamTemplate } from './blueprint-converter';
import { toSynovaYml, toSynovaYmlString } from './synova-yml-serializer';
import type { PhaseAResult, PhaseBResult, PhaseCResult, PhaseDResult, PhaseEResult } from '../types';
import type { PipelineSeeds } from './template-seeder';
import { shouldUseStatInit, runStatInit } from './phase-b/stat-init';
import { auditGenomes, auditGenomesRulesOnly } from './audit-agent';
import { runSafetyGates } from './safety-gate';
import { buildGapSnapshot, recordGapSnapshot } from './diagnosis/gap-recorder';
import { runEvolutionLoop, injectEvolutionNotes, applyOverridesToMode } from './evolution-loop';
import { buildEvidenceChain, summarizeEvidenceChain } from './evidence-chain';
import { assessFeasibility } from './feasibility-check';
import { recordPhase } from './metrics';
import { runInferenceQualityCheck, publishKnowledgeGaps, publishGapsAsAmmoDrafts } from './quality-gate';
import { recordKnowledgeInjection } from '../observer/team-observer';
import { writeSkillsToRegistry, publishNewSkillsToCloud } from './skill-registry-writer';
import { aggregateAndProcessFeedback, getPendingSignalCount } from './phase-b/skill-signal-collector';
import type { InferenceQualityResult } from '../types';
import { createLogger } from '../infra/logger';

const log = createLogger('engine-server/pipeline/orchestrator');

// ================================================================
// 编排主函数
// ================================================================

/**
 * 根据推导方法和管道备注推导覆盖等级
 */
function deriveCoverageLevel(
  derivationMethod: string,
  notes: string[],
): 'high' | 'medium' | 'low' | 'cold_start' {
  if (derivationMethod === 'template_match') return 'high';
  if (derivationMethod === 'keyword_inference') return 'medium';
  // cold_start 或 minimal_default
  const hadRetry = notes.some(n => n.includes('退化检测重推'));
  if (hadRetry) {
    // 重推过说明 LLM 在挣扎 → 比普通 cold_start 更不确定
    return 'cold_start';
  }
  return 'low';
}

/**
 * 将 DiagnosisReport 转为自然语言段落（~3-5 句，~200 tokens）
 * 供 Phase A/B 的 system prompt 末尾注入。
 * 如果 report 为 null/undefined，返回空字符串。
 */
function buildDiagnosisContext(report?: DiagnosisReport): string {
  if (!report) return '';

  const parts: string[] = [];

  if (report.mission?.longTermVision) {
    parts.push(`长期愿景：${report.mission.longTermVision}`);
  }
  if (report.mission?.shortTermGoals?.length > 0) {
    parts.push(`短期目标：${report.mission.shortTermGoals.join('、')}`);
  }
  if (report.businessModel?.primaryBusiness) {
    parts.push(`主营业务：${report.businessModel.primaryBusiness}（价值主张：${report.businessModel.valueProposition || '未明确'}）`);
  }
  if (report.currentState?.stage) {
    parts.push(`当前阶段：${report.currentState.stage}，现有资产：${report.currentState.existingAssets?.join('、') || '未明确'}，团队规模：${report.currentState.teamScale || '未明确'}`);
  }
  if (report.resources) {
    const r = report.resources;
    const resParts: string[] = [];
    if (r.budget) resParts.push(`预算：${r.budget}`);
    if (r.founderTime) resParts.push(`创始人投入：${r.founderTime}`);
    if (r.keyPartnerships?.length > 0) resParts.push(`关键合作：${r.keyPartnerships.join('、')}`);
    if (resParts.length > 0) parts.push(`资源约束：${resParts.join('；')}`);
  }
  if (report.risks?.topConcerns?.length > 0) {
    parts.push(`核心风险：${report.risks.topConcerns.join('、')}`);
  }
  if (report.risks?.pastFailures?.length > 0) {
    parts.push(`历史踩坑：${report.risks.pastFailures.join('、')}`);
  }
  if (report.successCriteria?.northStar) {
    parts.push(`北极星指标：${report.successCriteria.northStar}`);
  }
  if (report.coreInsight) {
    parts.push(`核心洞察：${report.coreInsight}`);
  }
  if (report.suggestedPriority) {
    parts.push(`优先建议：${report.suggestedPriority}`);
  }

  // 来源标注（confirmed vs inferred）
  if (report.evidenceMap) {
    const confirmed = Object.entries(report.evidenceMap)
      .filter(([, v]) => v === 'confirmed')
      .map(([k]) => k);
    const inferred = Object.entries(report.evidenceMap)
      .filter(([, v]) => v === 'inferred')
      .map(([k]) => k);
    const srcParts: string[] = [];
    if (confirmed.length > 0) srcParts.push(`用户确认：${confirmed.join('、')}`);
    if (inferred.length > 0) srcParts.push(`引擎推断：${inferred.join('、')}`);
    if (srcParts.length > 0) parts.push(`[来源标注] ${srcParts.join(' | ')}`);
  }

  if (parts.length === 0) return '';
  return `\n\n## 诊断报告（L0 对话归纳）\n${parts.join('\n')}`;
}

/**
 * 执行完整 L1-L5 管道
 *
 * @param taskRequestId - 任务标识
 * @param request - 原始请求
 * @param abortSignal - 取消信号
 * @returns 组装好的 BlueprintDTO
 */
export async function runPipeline(
  taskRequestId: string,
  request: GenerateBlueprintRequest,
  abortSignal: AbortSignal,
  seeds?: PipelineSeeds,
): Promise<BlueprintDTO> {
  const { taskDefinition, diagnosisReport, options } = request;
  const locale = options?.locale || 'zh-CN';

  // 将诊断报告转为自然语言段落（供 Phase A/B system prompt 注入）
  const diagnosisContext = buildDiagnosisContext(diagnosisReport);

  log.info(`[engine-server] 管道启动: ${taskRequestId} (${taskDefinition.stage})${seeds ? ' [种子注入模式]' : ''}${diagnosisContext ? ' [诊断注入]' : ''}`);

  const blueprintId = `bpid_${taskRequestId.replace('trq_', '')}`;
  const notes: string[] = [];

  if (diagnosisContext) {
    notes.push(`诊断报告注入: ${diagnosisReport?.evidenceMap ? Object.keys(diagnosisReport.evidenceMap).length : 0} 个字段标注来源`);
  }

  try {
    // ── Feasibility pre-check（沈括 Ginkgo 框架）──
    const feasibility = await assessFeasibility(taskDefinition, abortSignal);
    taskDefinition.feasibility = feasibility.status;
    if (feasibility.warnings) notes.push(...feasibility.warnings);
    if (feasibility.status === 'infeasible') {
      log.warn(`[orchestrator] 任务不可行: ${feasibility.bottleneck}`);
    }

    // ── Phase A (L1): 推导团队角色（种子优先，否则 LLM 推导）──
    let phaseA: PhaseAResult;
    if (seeds?.teamStructure && seeds.teamStructure.roles.length > 0) {
      // 种子模式：直接使用模板提供的团队结构
      phaseA = {
        teamStructure: seeds.teamStructure,
        incubationFrame: {
          phaseId: 'L1_derive_roles',
          phaseLabel: PHASE_LABELS.L1_derive_roles,
          progress: 100,
          statusLine: `种子注入: 从模板加载 ${seeds.teamStructure.roles.length} 个角色`,
          detail: `模板: ${seeds.templateDescription}`,
        },
        designRationale: [{
          dimension: '团队结构',
          choice: `模板种子提供 ${seeds.teamStructure.roles.length} 个角色`,
          alternatives: [],
          reason: '预设模板作为 strong prior，引擎在此基础上个性化蒸馏',
          sourceGap: '模板种子注入',
        }],
      };
      notes.push(`Phase A 种子模式: 直接加载模板 ${seeds.teamStructure.roles.length} 个角色 (derivationMethod=template_match)`);
    } else {
      const _tA = Date.now();
    phaseA = await runPhaseA(taskDefinition, locale, abortSignal, notes, diagnosisContext);
    recordPhase('phaseA', Date.now() - _tA, true);
    }
    updatePhaseProgress(taskRequestId, 'L1_derive_roles', 20, phaseA.incubationFrame);

    // ── 弹药注入 Round 2：组织事实弹药（Phase A 产出结构后、Phase B 前）──
    const orgAmmoText = injectOrgAmmo(phaseA.teamStructure, taskDefinition);
    if (orgAmmoText) {
      notes.push('组织弹药注入: Phase A 产出结构匹配组织事实');
    }

    // ── Phase B (L2): 蒸馏角色认知基因（含框架库+冲突检测+质量检查+StatInit降级）──
    const _tB2 = Date.now();
    let phaseB: PhaseBResult;
    const useStatInit = shouldUseStatInit(phaseA.teamStructure);
    if (useStatInit) {
      // 冷启动/低置信度场景 → 规则驱动降级
      const roleNames = (phaseA.teamStructure.roles || []).map(r => r.name || '?').join(', ');
      phaseB = {
        personaGenomes: runStatInit(phaseA.teamStructure, taskDefinition.job),
        incubationFrame: {
          phaseId: 'L2_distill_genome',
          phaseLabel: PHASE_LABELS.L2_distill_genome,
          progress: 40,
          statusLine: 'StatInit 规则推导（无 LLM）',
          detail: 'StatInit | roles: ' + roleNames,
        },
      };
      notes.push('StatInit 降级: 规则驱动替代 LLM (derivationMethod=' + phaseA.teamStructure.derivationMethod + ')');
    } else {
      phaseB = await runPhaseB(taskDefinition, phaseA, locale, abortSignal, orgAmmoText, diagnosisContext);
    }
    updatePhaseProgress(taskRequestId, 'L2_distill_genome', 40, phaseB.incubationFrame);
    recordPhase('phaseB', Date.now() - _tB2, true);
        // 从 incubationFrame 提取质量信息
    if (phaseB.incubationFrame.detail?.includes('critical')) {
      notes.push(`Phase B: ${phaseB.incubationFrame.detail}`);
    }

    // ── 独立审计（壁垒二：生成-审计-校验铁三角的审计层）──
    let auditResult: Awaited<ReturnType<typeof auditGenomes>> | null = null;
    try {
      auditResult = await auditGenomes(phaseB.personaGenomes, taskDefinition, abortSignal);
      notes.push(`独立审计: ${auditResult.overallVerdict} (verified=${auditResult.summary.verified}, failed=${auditResult.summary.failed}, blocked=${auditResult.summary.blocked})`);
      if (auditResult.overallVerdict === 'draft_only') {
        notes.push(`⚠️ 独立审计判定 draft_only — 基因组质量不满足发布标准`);
      }
    } catch (auditErr) {
      log.info(`[engine-server] 独立审计降级: ${(auditErr as Error).message}`);
      auditResult = auditGenomesRulesOnly(phaseB.personaGenomes, taskDefinition);
      notes.push(`独立审计(降级): ${auditResult.overallVerdict} — LLM不可用，仅规则预审`);
    }

    // ── Phase C (L3): 选择协作模式 ──
    const _tC = Date.now();
    const phaseC = await runPhaseC(taskDefinition, phaseA, phaseB, locale, abortSignal);
    recordPhase('phaseC', Date.now() - _tC, true);
    notes.push(`Phase C 引擎选模: ${phaseC.collaborationMode.selectionReason}`);

    // Record gap snapshot for diagnosis engine (ARCH-04)
    if (request.options?.teamId) {
      const snapshot = buildGapSnapshot(request.options.teamId, taskDefinition, phaseA, phaseB, phaseC);
      recordGapSnapshot(snapshot);
    }

    // ── 应用 evolution-overrides.json 覆盖层到协作模式 ──
    const originalMode = phaseC.collaborationMode.mode;
    phaseC.collaborationMode = applyOverridesToMode(phaseC.collaborationMode);
    if (phaseC.collaborationMode.mode !== originalMode) {
      notes.push(`Evolution 覆盖层生效: ${originalMode} → ${phaseC.collaborationMode.mode}`);
    }

    updatePhaseProgress(taskRequestId, 'L3_select_mode', 60, phaseC.incubationFrame);

    // ── Phase D (L4): 匹配技能集 ──
    const _tD = Date.now();
    const phaseD = await runPhaseD(taskDefinition, phaseA, phaseB, phaseC, locale, abortSignal);
    recordPhase('phaseD', Date.now() - _tD, true);
    updatePhaseProgress(taskRequestId, 'L4_match_skills', 80, phaseD.incubationFrame);

    // ── Phase D.5 (L4 技能审计): 可执行性 + 安全审计 ──
    try {
      const auditResult = auditSkills(phaseD.skillSets);
      notes.push(`技能审计: ${auditResult.passed}通过 ${auditResult.failed}不可执行 ${auditResult.warned}警告`);
      if (auditResult.failed > 0) {
        const failedNames = auditResult.entries
          .filter(e => e.overall === 'fail')
          .map(e => `${e.skillName}[${e.roleId}]`)
          .join(', ');
        notes.push(`⚠️ 不可执行技能: ${failedNames}`);
      }

      // 安全审计汇总（securityScore 已在 mergeToSkillCards 中填充）
      const allSkills = phaseD.skillSets.flatMap(ss => ss.skills);
      const scoredSkills = allSkills.filter(s => s.securityScore != null);
      if (scoredSkills.length > 0) {
        const avgScore = Math.round(scoredSkills.reduce((sum, s) => sum + (s.securityScore ?? 0), 0) / scoredSkills.length);
        const blockedCount = scoredSkills.filter(s => (s.securityScore ?? 0) < 70).length;
        notes.push(`安全审计: ${scoredSkills.length}技能 均分${avgScore}/100${blockedCount > 0 ? ` ${blockedCount}低于阈值` : ' 全通过'}`);
      }
    } catch (auditErr) {
      notes.push(`技能审计降级: ${(auditErr as Error).message}`);
    }

    // ── Phase D.7 (技能飞轮回写): 引擎生成技能 → 本地注册表 ──
    try {
      const writeResult = writeSkillsToRegistry(phaseD.skillSets, true);
      if (writeResult.written > 0) {
        const autoSyncCount = writeResult.entries.filter(e => e.securityScore != null && e.securityScore >= 70).length;
        notes.push(`技能注册表: 新增 ${writeResult.written} 技能（${autoSyncCount} 可上架）`);
      }

      // ── Phase D.8 (千面市场上云): 可上架技能 → 云端发布 ──
      if (writeResult.entries.length > 0) {
        publishNewSkillsToCloud(writeResult.entries).then(cloudPublished => {
          if (cloudPublished > 0) {
            log.info(`[orchestrator] 千面市场云端发布: ${cloudPublished} 技能`);
          }
        }).catch(err => {
          log.error({err}, '云端发布技能失败');
          notes.push('技能云端发布降级: 部分技能未同步到千面市场');
        });
      }

      // ── Phase D.9 (M3 反馈闭环): 技能安装信号 → 框架权重更新 ──
      const pendingCount = getPendingSignalCount();
      if (pendingCount > 0) {
        try {
          const batch = aggregateAndProcessFeedback();
          notes.push(`M3反馈闭环: ${batch.signals.length} 信号 → ${batch.aggregated.length} 技能权重更新`);
        } catch (fbErr) {
          notes.push(`M3反馈闭环降级: ${(fbErr as Error).message}`);
        }
      }
    } catch (writeErr) {
      notes.push(`技能注册表写入降级: ${(writeErr as Error).message}`);
    }

    // ── Phase E (L5): 组装最终蓝图 ──
    const _tE = Date.now();
    const phaseE = await runPhaseE(
      taskDefinition,
      phaseA,
      phaseB,
      phaseC,
      phaseD,
      locale,
      abortSignal,
    );
    updatePhaseProgress(taskRequestId, 'L5_assemble_blueprint', 95, phaseE.incubationFrame);
    recordPhase('phaseE', Date.now() - _tE, true);

    // ── 规则校验引擎（全部 Phase 完成后）──
    const validation = validateBlueprint(
      phaseA.teamStructure,
      phaseB.personaGenomes,
      { mode: phaseC.collaborationMode?.mode },
      { checkProtocol: true, checkConsistency: true },
    );

    if (!validation.passed) {
      const fg = validation.failedGates || [];
      log.info(`[engine-server] 规则校验: ${validation.overallSeverity} — 失败门: ${fg.join(', ')}`);
      notes.push(`规则校验: ${fg.length} 门未通过 (${fg.join(', ')})`);
      if (validation.correctionLog) {
        notes.push(...validation.correctionLog);
      }
    } else if (validation.overallSeverity === 'warning') {
      notes.push('规则校验: 通过但有警告');
    }

    // 独立审计结果注入 Blueprint (壁垒三：诚实边界代码化)
    if (auditResult) {
      notes.push(`审计摘要: ${auditResult.opinion}`);
    }

    // Gate #7 置信度独立性元数据日志
    if (phaseB.personaGenomes && phaseB.personaGenomes.length > 0) {
      const lowConf = phaseB.personaGenomes.filter(g => (g.confidence ?? 0) < 0.4);
      if (lowConf.length > 0) {
        notes.push(`置信度降级: ${lowConf.length}/${phaseB.personaGenomes.length} 角色基因组置信度<0.4`);
      }
    }

    // ── 证据链（壁垒四：一句一源的代码化追溯）──
    const matchedAmmoIds = new Set<string>();
    for (const pg of phaseB.personaGenomes) {
      for (const mm of pg.mentalModels) {
        if (mm.source) matchedAmmoIds.add(mm.source);
      }
    }
    const evidenceChain = buildEvidenceChain(phaseB.personaGenomes, matchedAmmoIds);
    const evidenceSummary = summarizeEvidenceChain(evidenceChain);
    notes.push(`证据链: ${evidenceSummary.full}/${evidenceSummary.totalLinks} 条完整追溯 (full=${evidenceSummary.full}, partial=${evidenceSummary.partial}, none=${evidenceSummary.none})`);

    // ── S1 推理链质量检查（M3 进化引擎 · 组装前）──
    let inferenceQuality: InferenceQualityResult | null = null;
    try {
      inferenceQuality = runInferenceQualityCheck(taskDefinition, diagnosisReport);
      if (inferenceQuality.knowledgeGaps.length > 0) {
        notes.push(`S1推理链: ${inferenceQuality.knowledgeGaps.length} 个知识缺口已发布到弹药工厂`);
        publishKnowledgeGaps(inferenceQuality.knowledgeGaps).catch(err => {
          log.error({err}, '知识缺口发布失败');
          notes.push('S1推理链降级: 知识缺口未同步到弹药工厂');
        });
        // Line A: 将缺口自动转换为弹药草案，供采集定时任务加工
        publishGapsAsAmmoDrafts().catch(err => {
          log.error({err}, '知识缺口转弹药草案失败');
          notes.push('弹药工厂降级: 缺口转弹药草案未完成');
        });
      }
      if (inferenceQuality.frameworkBlindspot.hasBlindspot) {
        notes.push(`S1框架盲区: 匹配到的框架全部属于"${inferenceQuality.frameworkBlindspot.dominantCategory}"类别，缺少: ${inferenceQuality.frameworkBlindspot.missingCategories.join(', ')}`);
      }
    } catch (err) {
      log.warn(`[orchestrator] S1推理质量检查失败: ${(err as Error).message}`);
    }

    // ── 组装 BlueprintDTO ──
    const blueprint: BlueprintDTO = {
      blueprintSchemaVersion: BLUEPRINT_SCHEMA_VERSION,
      blueprintId,
      generatedAt: new Date().toISOString(),
      engineVersion: ENGINE_VERSION,
      pipelineVersion: PIPELINE_VERSION,
      taskDef: {
        job: taskDefinition.job,
        constraints: taskDefinition.constraints,
        successMetrics: taskDefinition.successMetrics,
        stage: taskDefinition.stage,
        confidence: taskDefinition.confidence,
      },
      teamStructure: phaseA.teamStructure,
      personaGenomes: phaseB.personaGenomes,
      collaborationMode: phaseC.collaborationMode,
      skillSets: phaseD.skillSets,
      fiveFormats: phaseE.fiveFormats,
      // 冷启动：追加引擎知识覆盖度警告
      riskCoverage: (phaseA.teamStructure.derivationMethod === 'cold_start' || phaseA.teamStructure.derivationMethod === 'minimal_default')
        ? [...phaseE.riskCoverage, {
            riskName: '引擎知识覆盖度',
            coveredByRoles: [],
            defenseMechanism: `该场景超出引擎当前知识库范围（推导方法: ${phaseA.teamStructure.derivationMethod}）。团队结构基于通用推理生成，建议人工审核后使用。`,
            coverageLevel: 'gap' as const,
          }]
        : phaseE.riskCoverage,
      designRationale: [
        ...(phaseA.designRationale || []),
        ...phaseE.designRationale,
      ],
      coverageLevel: deriveCoverageLevel(phaseA.teamStructure.derivationMethod, notes),
      auditResult: auditResult ? {
        passed: auditResult.passed,
        overallVerdict: auditResult.overallVerdict,
        summary: auditResult.summary,
        opinion: auditResult.opinion,
      } : undefined,
      notes,
      evidenceChain,
    };

    // ── 安全基线门控（壁垒二：6 条 SB 规则硬阻断）──

    // ── 转换：引擎蓝图 → OpenClaw 可安装模板 ──
    try {
      blueprint.deployableTemplate = convertBlueprintToTeamTemplate(blueprint);
      notes.push('蓝图已转换为 OpenClaw 可部署模板');
    } catch (convErr) {
      const msg = (convErr as Error).message;
      log.error(`[engine-server] 蓝图→模板转换失败: ${msg} — 工作台安装将跳过`);
      notes.push(`蓝图转换失败: ${msg} — Gateway 安装将跳过`);
    }

    // ── Synova.yml 序列化（AR-16 落地）──
    try {
      const synovaObj = toSynovaYml(taskDefinition, phaseA, phaseB, phaseC, phaseD);
      blueprint.synovaYml = toSynovaYmlString(synovaObj);
      notes.push('Synova.yml 序列化完成');
    } catch (synovaErr) {
      notes.push(`Synova.yml 生成失败: ${(synovaErr as Error).message}`);
    }

    const safetyResult = runSafetyGates(blueprint);
    if (safetyResult.blocked) {
      notes.push(`⚠️ 安全基线阻断: ${safetyResult.summary}`);
    } else {
      notes.push(`安全基线: ${safetyResult.summary}`);
    }
    // 注入审计条目到 notes
    if (safetyResult.auditEntries.length > 0) {
      notes.push(...safetyResult.auditEntries.map(e => `[SafetyGate] ${e}`));
    }

    // ── S1 二次检查：在完整 Blueprint 上做风险覆盖检查 ──
    if (inferenceQuality) {
      // 用完整 blueprint 重新运行，补充 risk coverage 检查
      const postAssemblyQuality = runInferenceQualityCheck(taskDefinition, diagnosisReport, blueprint);
      if (postAssemblyQuality.inferenceGaps.length > 0) {
        notes.push(`⚠️ S1推理断层: ${postAssemblyQuality.inferenceGaps.length} 个风险未被任何角色覆盖: ${
          postAssemblyQuality.inferenceGaps.map(g => g.riskName).join(', ')
        }`);
      }
      notes.push(`M3/S1推理质量评分: ${postAssemblyQuality.overallScore}/100`);
    }

    // ── M3 进化闭环（协作事件采集 → 进化信号 → 变体 → evolution-overrides.json）──
    const evoResult = runEvolutionLoop(blueprint.collaborationMode.mode, blueprintId);
    injectEvolutionNotes(evoResult, notes);

    // ── LLM Judge 质量评估（每次蓝图生成后自动运行）──
    try {
      const { evaluateBlueprint } = await import('../qa/qa-runner');
      const qaResult = await evaluateBlueprint(blueprint);
      blueprint.qaResult = qaResult;
      notes.push(`QA评分: ${qaResult.overallScore}/100 ${qaResult.overallPassed ? '通过' : '未通过'}`);

      if (!qaResult.overallPassed || qaResult.overallScore < 60) {
        notes.push(`⚠️ 质量警告: 综合评分 ${qaResult.overallScore}，建议人工审核`);
      }
    } catch (qaErr) {
      notes.push(`QA评估降级: ${(qaErr as Error).message}`);
    }

    // 标记完成
    markCompleted(taskRequestId, {
      status: 'completed',
      taskRequestId,
      blueprintId,
      blueprint,
    });

    // ── 自动知识注入记录（管道完成后自动触发）──
    try {
      recordKnowledgeInjection({
        blueprintId,
        timestamp: new Date().toISOString(),
        totalEntries: 1,
        entriesWithImplication: 0,
        avgDeviation: 0,
        agentCount: blueprint.teamStructure?.roles?.length || 0,
        sharedCount: 0,
      });
    } catch (kiErr) {
      log.warn('管道完成知识注入记录失败（不阻塞管道）: %s', (kiErr as Error).message);
    }

    log.info(`[engine-server] 管道完成: ${taskRequestId} → ${blueprintId}`);
    return blueprint;
  } catch (err) {
    const msg = (err as Error).message || 'Unknown error';
    log.error(`[engine-server] 管道失败: ${taskRequestId} — ${msg}`);
    notes.push(`Pipeline failed at: ${msg}`);

    // 判断错误类型
    const isTimeout = msg.includes('timeout') || msg.includes('aborted');

    markFailed(taskRequestId, {
      status: 'failed',
      taskRequestId,
      error: {
        code: isTimeout ? 'TIMEOUT' : 'ENGINE_ERROR',
        message: msg,
        retryable: isTimeout,
      },
    });

    throw err;
  }
}

/**
 * 更新阶段进度到 task-store
 */
function updatePhaseProgress(
  taskRequestId: string,
  phase: typeof PIPELINE_PHASES[number],
  progress: number,
  incubationFrame: IncubationFrame,
): void {
  updateTaskProgress(taskRequestId, {
    phase,
    progress,
    estimatedRemainingSeconds: estimateRemaining(progress),
    incubationFrame,
  });
}

/**
 * 估算剩余时间
 */
function estimateRemaining(progress: number): number {
  if (progress >= 95) return 3;
  if (progress >= 80) return 10;
  if (progress >= 60) return 20;
  if (progress >= 40) return 30;
  if (progress >= 20) return 35;
  return 45;
}

// ================================================================
// 增量更新：部分管道执行
// ================================================================

import { distillSingleRole, buildFallbackGenomes, mapToPersonaGenomes } from './phase-b-distill-genome';
import { mapSkillsForRole, buildSkillCardsFromCores } from './skill-mapper';
import { MODE_SIZE_THRESHOLDS } from '../pipeline/config-guardian';

/** 增量更新操作类型 */
export type PartialPipelineAction =
  | { type: 'add_role'; name: string; responsibilities: string[]; job?: string; celebrityId?: string }
  | { type: 'remove_role'; roleId: string }
  | { type: 'split_role'; roleId: string; splitInto: Array<{ name: string; responsibilities: string[] }> }
  | { type: 'merge_roles'; roleIds: string[]; newName: string }
  | { type: 'change_layer'; roleId: string; newLayer: string }
  | { type: 'recalculate_protocol' };

/** 变更摘要 */
export interface ChangeSummary {
  action: string;
  details: string[];
  protocolWarning?: string;
}

/** runPipelinePartial 返回值 */
export interface PartialPipelineResult {
  blueprint: BlueprintDTO;
  changes: ChangeSummary;
  protocolWarning?: string;
}

/**
 * 从现有 PersonaGenomes 构建团队上下文描述（供蒸馏注入）。
 */
function buildTeamContext(
  personaGenomes: BlueprintDTO['personaGenomes'],
  excludeRoleId?: string,
): string {
  const genomes = excludeRoleId
    ? personaGenomes.filter(g => g.roleId !== excludeRoleId)
    : personaGenomes;

  if (genomes.length === 0) return '（尚无其他团队成员）';

  return genomes.map(g => {
    const ocean = g.oceanScores;
    const oceanSummary = `O=${ocean.openness.toFixed(2)} C=${ocean.conscientiousness.toFixed(2)} E=${ocean.extraversion.toFixed(2)} A=${ocean.agreeableness.toFixed(2)} N=${ocean.neuroticism.toFixed(2)}`;
    const models = g.mentalModels.slice(0, 2).map(m => m.name).join('、');
    const boundaries = g.honestBoundaries.slice(0, 2).join('；');
    return `- ${g.roleName} (${g.roleId}): ${oceanSummary}, 核心思维: ${models || '无'}, 边界: ${boundaries || '未定义'}`;
  }).join('\n');
}

/**
 * 生成新角色 ID（role_序号）。
 */
function generateRoleId(existingRoles: Array<{ id: string }>): string {
  let maxIdx = 0;
  for (const r of existingRoles) {
    const match = r.id?.match(/role_(\d+)/);
    if (match) maxIdx = Math.max(maxIdx, parseInt(match[1], 10));
  }
  return `role_${maxIdx + 1}`;
}

/**
 * 协议重算：基于当前团队结构重新评估协作模式。
 */
function assessProtocol(
  mode: string,
  teamSize: number,
  l2Count: number,
  l3Count: number,
): string | undefined {
  const threshold = MODE_SIZE_THRESHOLDS[mode];
  if (!threshold) return undefined;

  const warnings: string[] = [];

  if (mode === 'iron_captain' && threshold.maxTotal && teamSize > threshold.maxTotal) {
    warnings.push(`铁腕船长模式适合 ≤${threshold.maxTotal} 人，当前 ${teamSize} 人。建议切换到民主议会或交叉制衡。`);
  }
  if (mode === 'democratic_council' && teamSize < threshold.minTotal) {
    warnings.push(`民主议会模式要求 ≥${threshold.minTotal} 人，当前 ${teamSize} 人。建议切换回铁腕船长。`);
  }
  if (mode === 'iron_captain' && l3Count > 1) {
    warnings.push(`铁腕船长模式有 ${l3Count} 个 L3 角色，多个 L3 可能产生决策冲突。`);
  }
  if (teamSize > (threshold.maxTotal ?? 999) * 1.5) {
    warnings.push(`团队规模超过推荐上限 150%，强烈建议切换协作模式。`);
  }

  return warnings.length > 0 ? warnings.join('\n') : undefined;
}

/**
 * 执行增量管道操作。在现有 Blueprint 上执行增/删/改/协议重算。
 *
 * @param existingBlueprint - 当前团队蓝图
 * @param action - 增量操作
 * @param locale - 语言
 * @param abortSignal - 取消信号
 * @returns 更新后的蓝图 + 变更摘要
 */
export async function runPipelinePartial(
  existingBlueprint: BlueprintDTO,
  action: PartialPipelineAction,
  locale: string,
  abortSignal: AbortSignal,
): Promise<PartialPipelineResult> {
  const changes: ChangeSummary = { action: action.type, details: [] };
  const blueprint = JSON.parse(JSON.stringify(existingBlueprint)) as BlueprintDTO; // deep clone

  const taskDef: TaskDefinitionDTO = {
    job: blueprint.taskDef.job,
    constraints: blueprint.taskDef.constraints,
    successMetrics: blueprint.taskDef.successMetrics || [],
    stage: (blueprint.taskDef.stage as 'from_scratch' | 'expansion' | 'optimization') || 'expansion',
    confidence: blueprint.taskDef.confidence,
    feasibility: 'feasible' as const,
    failureModes: [],
    sanitizationLevel: 'standard' as const,
  };

  switch (action.type) {
    // ── 新增角色 ──
    case 'add_role': {
      const newRoleId = generateRoleId(blueprint.teamStructure.roles);
      const governanceLayer = action.job?.includes('管理') || action.job?.includes('经理') || action.job?.includes('总监')
        ? 'L3_governance' : 'L2_execution';

      if (!action.job) {
        log.warn('[partial] add_role 未提供 job 字段，默认分配 L2_execution');
      }

      const newRole: RoleBlue = {
        id: newRoleId,
        name: action.name,
        responsibilities: action.responsibilities,
        skillsRequired: [],
        collaboratesWith: [],
        governanceLayer,
      };

      // 团队上下文（现有角色 SOUL 摘要，保留用于日志）
      const teamContext = buildTeamContext(blueprint.personaGenomes);

      // 单角色规则推导（毫秒级）
      const fallbackResult = buildFallbackGenomes([newRole], taskDef.job);
      const newGenome = mapToPersonaGenomes(fallbackResult)[0];
      changes.details.push(`新增角色 ${action.name} (${newRoleId})，置信度: ${newGenome.confidence} (规则推导)`);

      // 单角色技能匹配
      const mappedSkills = mapSkillsForRole(newRole, taskDef.constraints);
      // 回填 skillsRequired
      newRole.skillsRequired = mappedSkills.slice(0, 5).map(ms => ms.name);

      // 组装 skillSet（使用标准 SkillSetBlue 结构）
      const newSkillSet: SkillSetBlue = {
        roleId: newRoleId,
        roleName: action.name,
        skills: buildSkillCardsFromCores(mappedSkills, newRoleId),
      };

      // 注入 Blueprint
      blueprint.teamStructure.roles.push(newRole);
      blueprint.teamStructure.totalRoles = blueprint.teamStructure.roles.length;
      blueprint.teamStructure.recommendedTeamSize = blueprint.teamStructure.roles.length;
      blueprint.personaGenomes.push(newGenome);
      blueprint.skillSets.push(newSkillSet);
      blueprint.notes.push(`[增量更新] 新增角色: ${action.name} (${newRoleId})`);

      // 协议重算检查
      const l2Count = blueprint.teamStructure.roles.filter(r => r.governanceLayer === 'L2_execution').length;
      const l3Count = blueprint.teamStructure.roles.filter(r => r.governanceLayer === 'L3_governance').length;
      const protocolWarning = assessProtocol(
        blueprint.collaborationMode.mode, blueprint.teamStructure.roles.length, l2Count, l3Count,
      );
      if (protocolWarning) {
        changes.protocolWarning = protocolWarning;
        changes.details.push(`协议警告: ${protocolWarning}`);
      }

      break;
    }

    // ── 删除角色（软删除）──
    case 'remove_role': {
      const roleId = action.roleId;
      const role = blueprint.teamStructure.roles.find(r => r.id === roleId);
      if (!role) {
        changes.details.push(`角色 ${roleId} 不存在，跳过删除`);
        break;
      }

      // 软删除：标记而非物理删除
      blueprint.teamStructure.roles = blueprint.teamStructure.roles.filter(r => r.id !== roleId);
      blueprint.teamStructure.totalRoles = blueprint.teamStructure.roles.length;
      blueprint.teamStructure.recommendedTeamSize = blueprint.teamStructure.roles.length;
      blueprint.personaGenomes = blueprint.personaGenomes.filter(g => g.roleId !== roleId);
      blueprint.skillSets = blueprint.skillSets.filter(s => s.roleId !== roleId);
      blueprint.notes.push(`[增量更新] 软删除角色: ${role.name} (${roleId})，已归档`);
      changes.details.push(`已删除角色 ${role.name} (${roleId})`);
      break;
    }

    // ── 拆分角色 ──
    case 'split_role': {
      const original = blueprint.teamStructure.roles.find(r => r.id === action.roleId);
      if (!original) {
        changes.details.push(`角色 ${action.roleId} 不存在，跳过拆分`);
        break;
      }

      // 删除原角色
      blueprint.teamStructure.roles = blueprint.teamStructure.roles.filter(r => r.id !== action.roleId);
      blueprint.personaGenomes = blueprint.personaGenomes.filter(g => g.roleId !== action.roleId);
      blueprint.skillSets = blueprint.skillSets.filter(s => s.roleId !== action.roleId);

      // 创建拆分角色
      for (const splitDef of action.splitInto) {
        const splitRoleId = generateRoleId(blueprint.teamStructure.roles);
        const splitRole: RoleBlue = {
          id: splitRoleId,
          name: splitDef.name,
          responsibilities: splitDef.responsibilities,
          skillsRequired: [],
          collaboratesWith: [],
          governanceLayer: original.governanceLayer,
        };

        const fallbackResult = buildFallbackGenomes([splitRole], taskDef.job);
        const splitGenome = mapToPersonaGenomes(fallbackResult)[0];
        const splitSkills = mapSkillsForRole(splitRole, taskDef.constraints);
        splitRole.skillsRequired = splitSkills.slice(0, 5).map(ms => ms.name);

        blueprint.teamStructure.roles.push(splitRole);
        blueprint.personaGenomes.push(splitGenome);
        blueprint.skillSets.push({
          roleId: splitRoleId,
          roleName: splitDef.name,
          skills: buildSkillCardsFromCores(splitSkills, splitRoleId),
        });

        changes.details.push(`拆分出: ${splitDef.name} (${splitRoleId})`);
      }

      blueprint.teamStructure.totalRoles = blueprint.teamStructure.roles.length;
      blueprint.teamStructure.recommendedTeamSize = blueprint.teamStructure.roles.length;
      blueprint.notes.push(`[增量更新] 拆分角色 ${original.name} → ${action.splitInto.map(s => s.name).join(', ')}`);
      break;
    }

    // ── 合并角色 ──
    case 'merge_roles': {
      const toMerge = blueprint.teamStructure.roles.filter(r => action.roleIds.includes(r.id));
      if (toMerge.length < 2) {
        changes.details.push('待合并角色不足 2 个，跳过');
        break;
      }

      // 合并职责
      const mergedResponsibilities = [...new Set(toMerge.flatMap(r => r.responsibilities))];
      const highestLayer = toMerge.some(r => r.governanceLayer === 'L3_governance') ? 'L3_governance' : 'L2_execution';

      // 删除旧角色
      for (const rid of action.roleIds) {
        blueprint.teamStructure.roles = blueprint.teamStructure.roles.filter(r => r.id !== rid);
        blueprint.personaGenomes = blueprint.personaGenomes.filter(g => g.roleId !== rid);
        blueprint.skillSets = blueprint.skillSets.filter(s => s.roleId !== rid);
      }

      // 创建合并角色
      const mergedRoleId = generateRoleId(blueprint.teamStructure.roles);
      const mergedRole: RoleBlue = {
        id: mergedRoleId,
        name: action.newName,
        responsibilities: mergedResponsibilities,
        skillsRequired: [],
        collaboratesWith: [],
        governanceLayer: highestLayer,
      };

      const fallbackResult = buildFallbackGenomes([mergedRole], taskDef.job);
      const mergedGenome = mapToPersonaGenomes(fallbackResult)[0];
      const mergedSkills = mapSkillsForRole(mergedRole, taskDef.constraints);
      mergedRole.skillsRequired = mergedSkills.slice(0, 5).map(ms => ms.name);

      blueprint.teamStructure.roles.push(mergedRole);
      blueprint.personaGenomes.push(mergedGenome);
      blueprint.skillSets.push({
        roleId: mergedRoleId,
        roleName: action.newName,
        skills: buildSkillCardsFromCores(mergedSkills, mergedRoleId),
      });

      blueprint.teamStructure.totalRoles = blueprint.teamStructure.roles.length;
      blueprint.teamStructure.recommendedTeamSize = blueprint.teamStructure.roles.length;
      blueprint.notes.push(`[增量更新] 合并角色 ${toMerge.map(r => r.name).join(', ')} → ${action.newName} (${mergedRoleId})`);
      changes.details.push(`合并 ${toMerge.length} 个角色 → ${action.newName}`);
      break;
    }

    // ── 层级调整 ──
    case 'change_layer': {
      const role = blueprint.teamStructure.roles.find(r => r.id === action.roleId);
      if (!role) {
        changes.details.push(`角色 ${action.roleId} 不存在，跳过层级调整`);
        break;
      }
      const oldLayer = role.governanceLayer;
      const validLayers = ['L1_understanding', 'L2_execution', 'L3_governance'] as const;
      role.governanceLayer = validLayers.includes(action.newLayer as typeof validLayers[number])
        ? (action.newLayer as typeof validLayers[number])
        : 'L2_execution'; // 默认 L2

      // 同步 personaGenome 中的 roleName（如果有的话）
      const pg = blueprint.personaGenomes.find(g => g.roleId === action.roleId);
      if (pg) {
        pg.confidence *= 0.95; // 层级变更略微降低置信度
      }

      blueprint.notes.push(`[增量更新] 层级调整: ${role.name} (${action.roleId}) ${oldLayer} → ${action.newLayer}`);
      changes.details.push(`${role.name} 层级: ${oldLayer} → ${action.newLayer}`);
      break;
    }

    // ── 协议重算 ──
    case 'recalculate_protocol': {
      const mode = blueprint.collaborationMode.mode;
      const teamSize = blueprint.teamStructure.roles.length;
      const l2Count = blueprint.teamStructure.roles.filter(r => r.governanceLayer === 'L2_execution').length;
      const l3Count = blueprint.teamStructure.roles.filter(r => r.governanceLayer === 'L3_governance').length;

      const warning = assessProtocol(mode, teamSize, l2Count, l3Count);
      if (warning) {
        changes.protocolWarning = warning;
        changes.details.push(`协议重算: ${warning}`);
      } else {
        changes.details.push(`协议重算: 当前 ${mode} 模式适配团队规模 (${teamSize}人, L2=${l2Count}, L3=${l3Count})，无需切换。`);
      }

      blueprint.notes.push(`[增量更新] 协议重算: mode=${mode}, size=${teamSize}, l2=${l2Count}, l3=${l3Count}`);
      break;
    }
  }

  return { blueprint, changes, protocolWarning: changes.protocolWarning };
}

// ================================================================
// 总管家孵化管线
// ================================================================

/** 组织上下文（供总管家种子构建） */
export interface OrgContext {
  orgId: string;
  teams: Array<{ name: string; blueprintId: string; roleCount: number }>;
}

/**
 * 构建总管家种子数据（预设 TaskDefinition → PipelineSeeds）。
 * 总管家是一个单角色团队，负责跨团队协调。
 */
/**
 * 加载总管家 AGENTS.md 模板（含 Standing Orders、5步巡检流程、日报格式）。
 * 模板文件: server/presets/coordinator-AGENTS.md
 * 变量替换: {{teamList}} → 团队列表
 */
function loadCoordinatorAgentsMd(orgCtx: OrgContext): string {
  const templatePath = path.resolve(__dirname, '..', '..', '..', 'presets', 'coordinator-AGENTS.md');
  try {
    if (fs.existsSync(templatePath)) {
      const template = fs.readFileSync(templatePath, 'utf-8');
      // 去掉 HTML 注释行 (<!-- ... -->)
      const cleaned = template.replace(/^<!--.*-->\s*$/gm, '').trim();
      return cleaned
        .replace(/\{\{teamCount\}\}/g, String(orgCtx.teams.length))
        .replace(/\{\{teamList\}\}/g, orgCtx.teams.map(t => `${t.name}(${t.roleCount}人)`).join('、'));
    }
  } catch { log.debug('[orchestrator] coordinator AGENTS.md template not found, using fallback'); /* fallback to inline template */ }

  // Fallback: 精简版模板
  const teamList = orgCtx.teams.map(t => `${t.name}(${t.roleCount}人)`).join('、');
  return [
    `# 总管家 Standing Orders`,
    ``,
    `你是该组织的总管家（Coordinator）。你负责统筹所有团队的健康状况、分发跨团队任务、生成日报。`,
    ``,
    `## 常态化巡检指令`,
    ``,
    `每天 9:00 自动执行：`,
    `1. 检查 ${orgCtx.teams.length} 个团队健康度（调 team-diagnose）`,
    `2. 检查知识缺口（调 knowledge-gap-detect）`,
    `3. 查询 M3 进化建议`,
    `4. 检查未完成指令`,
    `5. 生成日报 → memory/YYYY-MM-DD-report.md`,
    ``,
    `## 团队列表`,
    teamList,
    ``,
    `## 禁止行为`,
    `- 不替用户做决策`,
    `- 不修改任何 Agent 文件`,
    `- 不同时向多个团队下达冲突指令`,
  ].join('\n');
}

export function buildCoordinatorSeeds(orgCtx: OrgContext): {
  taskDefinition: TaskDefinitionDTO;
  seeds: PipelineSeeds;
  diagnosisReport: DiagnosisReport;
} {
  const teamList = orgCtx.teams.map(t => `${t.name}(${t.roleCount}人)`).join('、');

  const taskDefinition: TaskDefinitionDTO = {
    job: `协调和管理 ${orgCtx.teams.length} 个团队：${teamList}`,
    constraints: [
      '跨团队信息路由',
      '团队健康监控',
      '任务优先级协调',
      '知识共享促进',
      '冲突预警与调解',
      '不替代各团队内部决策',
    ],
    successMetrics: [
      '跨团队消息送达率 > 95%',
      '团队健康评分稳定或上升',
      '知识条目跨团队引用数增长',
    ],
    failureModes: [
      '单点故障导致跨团队通信中断',
      '过度干预团队内部决策',
      '信息泄露到无权限团队',
    ],
    stage: 'expansion',
    confidence: 0.75,
    sanitizationLevel: 'standard',
  };

  const coordinatorRole: RoleBlue = {
    id: 'org-coordinator',
    name: '总管家',
    responsibilities: [
      `协调 ${orgCtx.teams.length} 个团队：${teamList}`,
      '接收用户跨团队指令，分解并路由到目标团队',
      '监控各团队健康评分，发现异常主动预警',
      '促进团队间知识共享和产物复用',
      '定期生成组织整体运行报告',
    ],
    skillsRequired: [],
    collaboratesWith: orgCtx.teams.map(t => t.blueprintId),
    governanceLayer: 'L3_governance',
    specialPrivileges: [
      '跨团队消息路由',
      '读取所有团队健康数据',
      '组织级知识库读写',
    ],
  };

  const seeds: PipelineSeeds = {
    teamStructure: {
      totalRoles: 1,
      recommendedTeamSize: 1,
      derivationMethod: 'template_match',
      roles: [coordinatorRole],
    },
    personaSeeds: [{
      roleId: 'org-coordinator',
      roleName: '总管家',
      role: `组织协调者，负责 ${orgCtx.teams.length} 个团队的跨团队协调`,
      description: `中立全局视角，沟通能力强，系统性思维。协调 ${teamList}。`,
    }],
    collaborationModeHint: 'iron_captain',
    skillSeeds: [{
      roleId: 'org-coordinator',
      roleName: '总管家',
      skillNames: ['跨团队消息路由', '团队健康监控', '知识共享管理', '任务优先级协调', '冲突检测'],
    }],
    templateDescription: `总管家（${orgCtx.teams.length} 团队组织协调者）`,
    agentsMdSeed: loadCoordinatorAgentsMd(orgCtx),
  };

  const diagnosisReport: DiagnosisReport = {
    mission: {
      longTermVision: `构建 ${orgCtx.teams.length} 个团队的高效协作组织`,
      shortTermGoals: ['建立跨团队通信通道', '初始化组织健康监控', '导入现有团队知识'],
    },
    businessModel: {
      primaryBusiness: `${orgCtx.teams.length} 团队组织管理`,
      valueProposition: '一站式跨团队协调',
      revenueModel: 'N/A',
    },
    currentState: {
      stage: 'expansion',
      existingAssets: orgCtx.teams.map(t => `团队:${t.name}`),
      teamScale: `${orgCtx.teams.length} 个团队`,
    },
    resources: { budget: 'N/A', founderTime: 'N/A', keyPartnerships: [] },
    risks: {
      topConcerns: ['跨团队通信延迟', '信息孤岛'],
      pastFailures: [],
      industryPitfalls: ['多团队组织常见问题：各自为政、重复造轮子'],
    },
    successCriteria: {
      northStar: '跨团队协作效率提升 30%',
      keyIndicators: ['消息路由延迟 < 2s', '团队健康评分均值 > 70'],
    },
    coreInsight: `当前 ${orgCtx.teams.length} 个团队独立运行，需要统一协调层`,
    suggestedPriority: '立即创建总管家，建立跨团队通信基础设施',
    evidenceMap: {
      mission: 'confirmed',
      businessModel: 'inferred',
      currentState: 'confirmed',
      resources: 'inferred',
      risks: 'inferred',
      successCriteria: 'inferred',
    },
  };

  return { taskDefinition, seeds, diagnosisReport };
}

/**
 * 孵化总管家：完整走 L0→Pipeline→Blueprint→Template→安装。
 *
 * @param orgCtx 组织上下文
 * @param abortSignal 取消信号
 * @returns 总管家的 BlueprintDTO（含 deployableTemplate）
 */
export async function incubateCoordinator(
  orgCtx: OrgContext,
  abortSignal: AbortSignal,
): Promise<BlueprintDTO> {
  const { taskDefinition, seeds, diagnosisReport } = buildCoordinatorSeeds(orgCtx);
  const taskRequestId = `trq_coordinator_${orgCtx.orgId}_${Date.now()}`;

  const request: GenerateBlueprintRequest = {
    taskDefSchemaVersion: '1.0',
    taskDefinition,
    diagnosisReport,
    options: { locale: 'zh-CN' },
  };

  log.info(`[orchestrator] 总管家孵化启动: ${taskRequestId} for org ${orgCtx.orgId} (${orgCtx.teams.length} teams)`);

  return runPipeline(taskRequestId, request, abortSignal, seeds);
}
