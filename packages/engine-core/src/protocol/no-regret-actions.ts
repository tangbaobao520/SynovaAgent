/**
 * P0-3: No-Regret Actions — 冷启动无悔动作
 *
 * 源于 AR-08 / DHDNA "Robust Actions" 技术点迁移。
 *
 * 定义：在零用户阶段，无论后续收集到什么数据，
 * 执行这些动作都不会产生负收益的「无悔」操作。
 *
 * 约束：
 *   - 条数 ≤5，推荐 3 条起点
 *   - 对应 SOUL.md "窗口期判断优先于技术完美" 原则
 *   - 每个无悔动作必须标注 credible_harm: 'none' | 'low' | 'medium'
 *     （credible_harm='none' 表示即使判断错误也无实质损害）
 *
 * @packageDocumentation
 */

// =================================================================
// 类型定义
// =================================================================

/** 无悔动作优先级 */
export type NoRegretPriority = 'P0' | 'P1';

/**
 * 可信危害评估：
 * - 'none': 即使判断错误，也无实质损害
 * - 'low': 错误判断导致轻微噪音（如多了一个无用推荐），可被后续数据覆盖
 * - 'medium': 错误判断导致用户可见但可逆的影响（如错误模板启用）
 */
export type CredibleHarm = 'none' | 'low' | 'medium';

/** 无悔动作定义 */
export interface NoRegretAction {
  /** 唯一标识 */
  id: string;
  /** 可读名称 */
  name: string;
  /** 动作描述 */
  description: string;
  /** 优先级 */
  priority: NoRegretPriority;
  /**
   * 可信危害评估：
   * 如果这个动作判断错了，最坏情况下会造成什么影响？
   */
  credibleHarm: CredibleHarm;
  /**
   * 触发条件 — 在什么场景下自动执行？
   * 'always': 在所有场景下都可安全执行
   * 'on_constraint_match': 当特定约束条件满足时执行
   */
  trigger: 'always' | 'on_constraint_match';
  /** 约束条件（trigger='on_constraint_match' 时必填） */
  constraints?: string[];
  /** 执行函数签名描述 — 实际实现由 Hermes/开发团队填充 */
  executeSignature: string;
  /** 执行说明 */
  implementationNote: string;
}

// =================================================================
// 无悔动作注册表
// =================================================================

/**
 * 首批无悔动作（3 条）：
 *
 * 1. 安全基线约束注入 — 即使场景推算错了，安全约束也不应有负面影响
 * 2. 6 缝隙探针全覆盖 — 任何情况下都要采集 6 个维度，不过早收敛
 * 3. 诚实标记默认开启 — 所有输出都默认可追踪，即使后续发现信源错了
 *
 * 元规则：
 *   - 超过 5 条的无悔动作需要沈括独立裁定
 *   - credible_harm 必须基于第一性原理推演，不得是 "我觉得不会出问题"
 */
export const NO_REGRET_ACTIONS: NoRegretAction[] = [
  {
    id: 'NRA-01',
    name: '安全基线约束注入',
    description:
      '无论场景如何推算，安全约束（拒答清单、数据隔离、合规红线）必须在所有输出前预注入。' +
      '即使场景推算完全错误，安全约束的存在也不应有负面影响。',
    priority: 'P0',
    credibleHarm: 'none',
    trigger: 'always',
    executeSignature:
      'injectSafetyConstraints(taskDef: TaskDefinition): TaskDefinitionWithSafety',
    implementationNote:
      '在 Phase A Step 1 约束分解后、Step 2 框架匹配前执行。' +
      '将 safety/index.ts 的 forbidden_synonyms.yaml 和规则引擎的合规检查注入约束池。' +
      '参考 pipeline/safety-gate.ts 的实现。',
  },
  {
    id: 'NRA-02',
    name: '6 缝隙探针全覆盖保证',
    description:
      '任何探针流程必须确保 6 个缝隙维度全部覆盖，不允许在采集 5/8 或 6/8 时过早收敛。' +
      '即使某些缝隙在特定场景下看起来"不相关"，也必须显式探针并标记为 not_found。',
    priority: 'P0',
    credibleHarm: 'low',
    trigger: 'always',
    executeSignature:
      'ensureAllGapsCovered(probeResults: ProbeResult[]): void',
    implementationNote:
      '在诸葛探针执行后、L1 蒸馏前执行。扫描 GapDimension[] 检查是否 8/8 覆盖。' +
      '如有遗漏，触发补充探针（或标记为 explicit_skip + 理由）。' +
      '注意：补充探针不改变现有证据包结构，只追加 inferred 层。',
  },
  {
    id: 'NRA-03',
    name: '诚实标记默认开启',
    description:
      '所有输出的 claim 必须默认开启诚实标记（claim_type + confidence + source_reference）。' +
      '即使后续发现信源不可靠，诚实标记的存在使得追溯成为可能。' +
      '关闭诚实标记需要显式审批（魏征或沈括），不是默认状态。',
    priority: 'P0',
    credibleHarm: 'none',
    trigger: 'always',
    executeSignature:
      'attachHonestyBadge(output: EngineOutput): EngineOutputWithBadge',
    implementationNote:
      '在质量门禁（quality-gate.ts）输出前执行包装。' +
      "每个 claim 追加 { claim_type: 'verified'|'inferred'|'designed', confidence: number, source: SourceRef[] }。" +
      '参考 METHODOLOGY-LOG #43/#44 确定的诚实暴露规范。',
  },
];

// =================================================================
// 验证函数
// =================================================================

/**
 * 验证当前无悔动作注册表是否满足约束：
 * - max ≤ 5
 * - 所有动作的 credibleHarm 均已评估
 */
export function validateNoRegretActions(): {
  valid: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  if (NO_REGRET_ACTIONS.length > 5) {
    issues.push(
      `无悔动作超过上限（${NO_REGRET_ACTIONS.length}/5）。需要沈括裁定。`,
    );
  }

  for (const action of NO_REGRET_ACTIONS) {
    if (!['none', 'low', 'medium'].includes(action.credibleHarm)) {
      issues.push(`${action.id}: credibleHarm 未设置有效值（${action.credibleHarm}）`);
    }
    if (action.trigger === 'on_constraint_match' && !action.constraints?.length) {
      issues.push(`${action.id}: trigger=on_constraint_match 但 constraints 为空`);
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

// =================================================================
// 备选：后续可扩展的无悔动作（Phase 1+）
// =================================================================

/**
 * 以下动作在 Phase 1 达到以下条件后可升级为完整无悔动作：
 *   - 用户数 >= 10 后经验证
 *   - credible_harm 完成第一性原理推演
 *
 * - 日志结构化输出（credible_harm: none，但需要确定日志 Schema）
 * - 探针错误隔离（credible_harm: low，但需要熔断器 API 稳定）
 */
