/**
 * 决策提取器（Decision Extractor）
 *
 * S1: 从角色定义 + 约束条件中提取高频决策类型（双通道）
 *   通道1: extractDecisionsFromConstraints — 从 L0 constraints/failureModes 推导
 *   通道2: extractDecisionsFromRole — 从角色名称推导角色特有决策类型（修复点2）
 * S2: 从信源（JD/知乎/行业报告）中增强决策类型的细节
 *
 * @date 2026-05-08 (原始)
 * @date 2026-05-09 (扩展：AI安全/开源/Agent/基础设施等12个新决策类型)
 * @date 2026-05-09 (修复点2：双通道合并 — 角色名称→决策类型映射 + constraints→决策类型)
 */

export interface RoleDecisionProfile {
  roleName: string;
  roleDescription: string;
  constraints: string[];
  failureModes: string[];
  jdExcerpts: string[];
  communityPosts: string[];
}

export interface DecisionType {
  id: string;
  name: string;
  description: string;
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly';
  severity: 'low' | 'medium' | 'high' | 'critical';
  keyUncertainty: string;
  relatedFailureModes: string[];
}

/**
 * 从角色约束推导决策类型（第一性原理路径）
 * 不依赖外部信源，任何时候都能跑
 *
 * 覆盖域：
 *   - 电商/供应链（原始）
 *   - AI安全/对齐/红队/监控（2026-05-09 扩展）
 *   - 开源社区/治理（2026-05-09 扩展）
 *   - Agent运行时/沙箱/API（2026-05-09 扩展）
 *   - 基础设施/DevOps（2026-05-09 扩展）
 */
export function extractDecisionsFromConstraints(profile: RoleDecisionProfile): DecisionType[] {
  const decisions: DecisionType[] = [];

  // 把职责文本也纳入约束扫描范围
  const allText = [...profile.constraints, ...profile.failureModes, profile.roleDescription].join(' ');

  for (const constraint of profile.constraints) {
    // ── 电商/供应链域（保留原始逻辑）──
    if (constraint.includes('时间') || constraint.includes('周期') || constraint.includes('delay')) {
      decisions.push(makeDecision('trust_commitment', '供应商可信承诺判断',
        '在信息不对称下判断供应商是否能在承诺时间内交付',
        'weekly', 'high', '供应商的说辞是否可信',
        ['轻易相信口头承诺', '未能识别预警信号']));
    }
    if (constraint.includes('信息') || constraint.includes('不对称') || constraint.includes('remote')) {
      decisions.push(makeDecision('incomplete_info', '不完全信息下的采购决策',
        '无法实地考察时如何选择供应商', 'monthly', 'high',
        '未获取的信息是否会影响决策质量',
        ['信息不足时盲目下单', '过度验证导致错过窗口']));
    }
    if (constraint.includes('质量') || constraint.includes('质检') || constraint.includes('inspection')) {
      decisions.push(makeDecision('irreversible_quality', '不可逆质量缺陷的处置决策',
        '发现质量瑕疵后的处置：整批退 vs 让步接收', 'weekly', 'critical',
        '瑕疵是偶然还是系统性的',
        ['为保进度接受不合格品', '过度严苛导致供应商关系破裂']));
    }
    if (constraint.includes('关系') || constraint.includes('切换') || constraint.includes('switch')) {
      decisions.push(makeDecision('supplier_switch', '供应商更换决策',
        '在长期关系维护与短期成本之间权衡是否更换供应商', 'quarterly', 'high',
        '新供应商的真实表现是否优于现有供应商',
        ['为短期利益破坏长期关系', '为关系容忍持续低效']));
    }
    if (constraint.includes('资金') || constraint.includes('现金流') || constraint.includes('payment')) {
      decisions.push(makeDecision('cashflow_tradeoff', '账期谈判与现金流权衡',
        '在账期谈判中平衡现金折扣与资金压力', 'monthly', 'medium',
        '对方的真实资金状况',
        ['过度追求账期导致供应商加价', '忽略汇率风险']));
    }

    // ── AI 安全域（2026-05-09 扩展）──
    if (constraint.includes('安全') || constraint.includes('对齐') || constraint.includes('价值观') ||
        constraint.includes('constitutional') || constraint.includes('宪法')) {
      decisions.push(makeDecision('ai_safety_alignment', 'AI安全对齐决策',
        '在模型能力释放与安全边界之间选择对齐策略', 'weekly', 'critical',
        '安全措施对模型能力的真实压制程度',
        ['过度对齐导致能力退化', '对齐不足导致价值观偏离']));
    }

    // ── 红队/渗透测试（2026-05-09 扩展）──
    if (constraint.includes('红队') || constraint.includes('攻击') || constraint.includes('越狱') ||
        constraint.includes('漏洞') || constraint.includes('adversarial') || constraint.includes('提示注入')) {
      decisions.push(makeDecision('red_team_operation', '红队对抗测试决策',
        '判断测试覆盖范围、攻击面优先级与漏洞修复紧急性', 'weekly', 'critical',
        '未被发现的攻击面可能已被恶意利用',
        ['覆盖不足导致新攻击面未被探测', '过于温和的测试无法发现真实威胁']));
    }

    // ── 行为监控/熔断（2026-05-09 扩展）──
    if (constraint.includes('监控') || constraint.includes('monitor') || constraint.includes('熔断') ||
        constraint.includes('异常') || constraint.includes('行为') || constraint.includes('审计')) {
      decisions.push(makeDecision('behavior_monitoring', '行为监控与熔断决策',
        '检测到异常行为时的响应策略：告警 vs 限流 vs 熔断', 'daily', 'critical',
        '异常是真实威胁还是正常波动',
        ['过度敏感导致正常操作被阻断', '阈值过松导致攻击未被捕获']));
    }

    // ── 可解释性/审计（2026-05-09 扩展）──
    if (constraint.includes('可解释') || constraint.includes('审计') || constraint.includes('透明') ||
        constraint.includes('transparency') || constraint.includes('interpretability')) {
      decisions.push(makeDecision('interpretability_audit', '可解释性审计决策',
        '判断模型决策路径是否达到透明度标准', 'monthly', 'high',
        '解释的完整度与真实决策路径的差距',
        ['可解释性成为表面工程', '过度解释导致模型性能损耗']));
    }

    // ── 沙箱/隔离（2026-05-09 扩展）──
    if (constraint.includes('沙箱') || constraint.includes('sandbox') || constraint.includes('隔离') ||
        constraint.includes('isolation')) {
      decisions.push(makeDecision('sandbox_security', '沙箱安全审计决策',
        '技能插件沙箱的安全边界与权限模型设计', 'monthly', 'critical',
        '新类型攻击绕过沙箱可能性',
        ['沙箱配置过严阻碍正常功能', '逃逸漏洞导致系统级入侵']));
    }

    // ── 开源/社区（2026-05-09 扩展）──
    if (constraint.includes('开源') || constraint.includes('社区') || constraint.includes('治理') ||
        constraint.includes('open source') || constraint.includes('community') || constraint.includes('贡献')) {
      decisions.push(makeDecision('open_source_governance', '开源社区治理决策',
        '贡献流程设计、社区冲突仲裁、路线图公开度权衡', 'weekly', 'high',
        '社区分裂的风险与开放程度的平衡',
        ['核心维护者倦怠', '外部贡献者因流程摩擦流失', '路线图分歧导致fork']));
    }

    // ── API/协议设计（2026-05-09 扩展）──
    if (constraint.includes('API') || constraint.includes('接口') || constraint.includes('协议') ||
        constraint.includes('SDK') || constraint.includes('文档') || constraint.includes('protocol')) {
      decisions.push(makeDecision('api_protocol_design', 'API与协议设计决策',
        'API设计的易用性、安全护栏与向后兼容之间的平衡', 'monthly', 'high',
        '开发者真实使用模式和设计预期的差距',
        ['过度简化导致安全护栏被绕过', '过度复杂导致开发者流失']));
    }

    // ── 推理/基础设施性能（2026-05-09 扩展）──
    if (constraint.includes('推理') || constraint.includes('延迟') || constraint.includes('GPU') ||
        constraint.includes('训练') || constraint.includes('模型') || constraint.includes('inference') ||
        constraint.includes('infrastructure')) {
      decisions.push(makeDecision('infrastructure_performance', '基础设施性能决策',
        'GPU资源分配、推理延迟与成本的权衡', 'daily', 'high',
        '需求峰值的不确定性',
        ['GPU资源争抢导致延迟抖降', '过度保障导致资源浪费']));
    }

    // ── Agent 运行时架构（2026-05-09 扩展）──
    if (constraint.includes('Agent') || constraint.includes('agent') || constraint.includes('运行时') ||
        constraint.includes('runtime') || constraint.includes('调度') || constraint.includes('并发')) {
      decisions.push(makeDecision('runtime_architecture', 'Agent运行时架构决策',
        '任务调度的公平性、隔离度与性能的三角权衡', 'weekly', 'high',
        '不同Agent间资源争抢的实际模式',
        ['隔离不足导致连锁故障', '隔离过度导致资源碎片化']));
    }
  }

  // ── 从失败模式反推决策类型（没有约束命中时作为补充）──
  for (const fm of profile.failureModes) {
    if (fm.includes('安全') || fm.includes('攻击') || fm.includes('漏洞') || fm.includes('越狱')) {
      if (!decisions.find(d => d.id === 'red_team_operation')) {
        decisions.push(makeDecision('red_team_operation', '红队对抗测试决策',
          '判断测试覆盖范围、攻击面优先级与漏洞修复紧急性', 'weekly', 'critical',
          '未被发现的攻击面可能已被恶意利用', [fm]));
      }
    }
    if (fm.includes('对齐') || fm.includes('价值观') || fm.includes('漂移') || fm.includes('alignment')) {
      if (!decisions.find(d => d.id === 'ai_safety_alignment')) {
        decisions.push(makeDecision('ai_safety_alignment', 'AI安全对齐决策',
          '在模型能力释放与安全边界之间选择对齐策略', 'weekly', 'critical',
          '安全措施对模型能力的真实压制程度', [fm]));
      }
    }
    if (fm.includes('社区') || fm.includes('分裂') || fm.includes('fork') || fm.includes('贡献者') || fm.includes('倦怠')) {
      if (!decisions.find(d => d.id === 'open_source_governance')) {
        decisions.push(makeDecision('open_source_governance', '开源社区治理决策',
          '贡献流程设计、社区冲突仲裁、路线图公开度权衡', 'weekly', 'high',
          '社区分裂的风险与开放程度的平衡', [fm]));
      }
    }
    if (fm.includes('沙箱') || fm.includes('sandbox') || fm.includes('逃逸') || fm.includes('插件')) {
      if (!decisions.find(d => d.id === 'sandbox_security')) {
        decisions.push(makeDecision('sandbox_security', '沙箱安全审计决策',
          '技能插件沙箱的安全边界与权限模型设计', 'monthly', 'critical',
          '新类型攻击绕过沙箱可能性', [fm]));
      }
    }
    if (fm.includes('API') || fm.includes('接口') || fm.includes('协议') || fm.includes('protocol')) {
      if (!decisions.find(d => d.id === 'api_protocol_design')) {
        decisions.push(makeDecision('api_protocol_design', 'API与协议设计决策',
          'API设计的易用性、安全护栏与向后兼容之间的平衡', 'monthly', 'high',
          '开发者真实使用模式和设计预期的差距', [fm]));
      }
    }
    if (fm.includes('推理') || fm.includes('基础设施') || fm.includes('GPU') || fm.includes('训练') || fm.includes('延迟')) {
      if (!decisions.find(d => d.id === 'infrastructure_performance')) {
        decisions.push(makeDecision('infrastructure_performance', '基础设施性能决策',
          'GPU资源分配、推理延迟与成本的权衡', 'daily', 'high',
          '需求峰值的不确定性', [fm]));
      }
    }
    if (fm.includes('Agent') || fm.includes('运行时') || fm.includes('runtime') || fm.includes('调度')) {
      if (!decisions.find(d => d.id === 'runtime_architecture')) {
        decisions.push(makeDecision('runtime_architecture', 'Agent运行时架构决策',
          '任务调度的公平性、隔离度与性能的三角权衡', 'weekly', 'high',
          '不同Agent间资源争抢的实际模式', [fm]));
      }
    }
    if (fm.includes('监控') || fm.includes('monitor') || fm.includes('行为') || fm.includes('熔断')) {
      if (!decisions.find(d => d.id === 'behavior_monitoring')) {
        decisions.push(makeDecision('behavior_monitoring', '行为监控与熔断决策',
          '检测到异常行为时的响应策略：告警 vs 限流 vs 熔断', 'daily', 'critical',
          '异常是真实威胁还是正常波动', [fm]));
      }
    }
  }

  return decisions;
}

function makeDecision(
  id: string, name: string, description: string,
  frequency: DecisionType['frequency'], severity: DecisionType['severity'],
  keyUncertainty: string, relatedFailureModes: string[],
): DecisionType {
  return { id, name, description, frequency, severity, keyUncertainty, relatedFailureModes };
}

/**
 * 从外部信源（JD/社区帖子）增强决策类型的细节
 * 扩展了 AI安全/开源/Agent 领域
 */
export function enhanceDecisionsFromSources(
  baseDecisions: DecisionType[],
  profile: RoleDecisionProfile,
): DecisionType[] {
  const enhanced = [...baseDecisions.map(d => ({ ...d }))];

  // 从JD摘录中提取附加决策类型
  for (const jd of profile.jdExcerpts) {
    // ── 电商/供应链（原始）──
    if (jd.includes('谈判') || jd.includes('协商')) {
      if (!enhanced.find(d => d.id === 'negotiation')) {
        enhanced.push(makeDecision('negotiation', '采购谈判决策',
          '在价格、交期、付款条件之间做多维度权衡', 'monthly', 'high',
          '对方的底线和替代选项',
          ['暴露过多信息', '过早亮出底牌', '忽视非价格条款']));
      }
    }
    if (jd.includes('风险') || jd.includes('合规')) {
      if (!enhanced.find(d => d.id === 'compliance_risk')) {
        enhanced.push(makeDecision('compliance_risk', '合规风险判断',
          '跨境贸易中的法规、关税、制裁合规性判断', 'monthly', 'critical',
          '法规变化的速度和不可预测性',
          ['忽略合规导致货物被扣', '过度合规错失成本优势']));
      }
    }

    // ── AI安全/Agent（2026-05-09 扩展）──
    if (/安全|对齐|alignment|constitutional|red.?team|红队|越狱|jailbreak/i.test(jd)) {
      if (!enhanced.find(d => d.id === 'ai_safety_alignment')) {
        enhanced.push(makeDecision('ai_safety_alignment', 'AI安全对齐决策',
          '在模型能力释放与安全边界之间选择对齐策略', 'weekly', 'critical',
          '安全措施对模型能力的真实压制程度',
          ['过度对齐导致能力退化', '对齐不足导致价值观偏离']));
      }
    }
    if (/开源|社区|open.?source|community|治理|贡献者|contribut/i.test(jd)) {
      if (!enhanced.find(d => d.id === 'open_source_governance')) {
        enhanced.push(makeDecision('open_source_governance', '开源社区治理决策',
          '贡献流程设计、社区冲突仲裁、路线图公开度权衡', 'weekly', 'high',
          '社区分裂的风险与开放程度的平衡',
          ['核心维护者倦怠', '外部贡献者因流程摩擦流失']));
      }
    }
    if (/API|协议|protocol|SDK|接口设计|文档.*质量/i.test(jd)) {
      if (!enhanced.find(d => d.id === 'api_protocol_design')) {
        enhanced.push(makeDecision('api_protocol_design', 'API与协议设计决策',
          'API设计的易用性、安全护栏与向后兼容之间的平衡', 'monthly', 'high',
          '开发者真实使用模式和设计预期的差距',
          ['过度简化导致安全护栏被绕过', '过度复杂导致开发者流失']));
      }
    }
    if (/沙箱|sandbox|隔离|权限.*模型|capability|安全.*审计/i.test(jd)) {
      if (!enhanced.find(d => d.id === 'sandbox_security')) {
        enhanced.push(makeDecision('sandbox_security', '沙箱安全审计决策',
          '技能插件沙箱的安全边界与权限模型设计', 'monthly', 'critical',
          '新类型攻击绕过沙箱可能性',
          ['沙箱配置过严阻碍正常功能', '逃逸漏洞导致系统级入侵']));
      }
    }
  }

  // 从社区帖子中提取失败模式对应的决策类型
  for (const post of profile.communityPosts) {
    if (post.includes('被骗') || post.includes('造假') || post.includes('假货')) {
      if (!enhanced.find(d => d.id === 'fraud_detection')) {
        enhanced.push(makeDecision('fraud_detection', '供应商可信度验证决策',
          '在海量供应商中识别造假和不可信商家', 'daily', 'critical',
          '对方的造假能力和专业程度',
          ['被专业造假团队蒙蔽', '过度怀疑失去良机']));
      }
    }
  }

  return enhanced;
}

// ═══════════════════════════════════════════════════════
// S1 双通道合并（修复点2）
// ═══════════════════════════════════════════════════════

import { extractDecisionsFromRole } from './role-decision-registry.js';

/**
 * 双通道决策提取：通道1 (constraints) + 通道2 (角色名称)
 *
 * QA-07 修复：原 S1 只走 constraints 通道，当 L0 产出约束太少时（2-3条），
 * 所有角色的决策类型只有1-2个 → 心智模型稀疏且重叠。
 * 此函数合并双通道后去重，保证每个角色至少 2-4 个角色特有的决策类型。
 */
export function extractDecisionsDualChannel(profile: RoleDecisionProfile): DecisionType[] {
  // 通道1：从 constraints/failureModes 提取
  const channel1 = extractDecisionsFromConstraints(profile);

  // 通道2：从角色名称提取
  const channel2 = extractDecisionsFromRole(profile.roleName);

  // 按 id 去重，通道1优先（它的 relatedFailureModes 更精准）
  const seen = new Set<string>();
  const merged: DecisionType[] = [];

  for (const d of channel1) {
    if (!seen.has(d.id)) { seen.add(d.id); merged.push(d); }
  }
  for (const d of channel2) {
    if (!seen.has(d.id)) { seen.add(d.id); merged.push(d); }
  }

  return merged;
}
