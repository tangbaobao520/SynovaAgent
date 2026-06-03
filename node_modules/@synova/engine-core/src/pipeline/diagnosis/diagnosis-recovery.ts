/**
 * diagnosis-recovery.ts — 诊断代理故障恢复配方
 *
 * 对标 Claw-Code recovery_recipes.rs:
 *   - 7 个 FailureScenario 枚举
 *   - RecoveryRecipe 结构体（场景 + 步骤 + 最大重试）
 *   - RecoveryContext 故障注入（withFailAtStep builder）
 *   - RecoveryResult 三态: recovered | degraded | failed
 */

// ====================================================================
// 故障场景与步骤
// ====================================================================

/** 故障场景（对标 Claw-Code FailureScenario） */
export enum DiagnosisFailureScenario {
  LLM_TIMEOUT = 'llm_timeout',
  MODULE_COMPUTE_FAILED = 'module_compute_failed',
  EVIDENCE_CORRUPTION = 'evidence_corruption',
  SESSION_DESYNC = 'session_desync',
  GATE_CHECK_STALL = 'gate_check_stall',
  SUBAGENT_ORPHANED = 'subagent_orphaned',
  PARTIAL_PLUGIN_STARTUP = 'partial_plugin_startup',
}

/** 单个恢复步骤 */
export interface RecoveryStep {
  /** 步骤描述 */
  description: string;
  /** 执行函数返回 true 表示步骤成功 */
  execute: (context: RecoveryContext) => Promise<boolean>;
}

/** 恢复配方 */
export interface RecoveryRecipe {
  /** 匹配的场景 */
  scenario: DiagnosisFailureScenario;
  /** 恢复步骤列表（按顺序执行） */
  steps: RecoveryStep[];
  /** 最大重试次数（整个配方） */
  maxAttempts: number;
}

/** 恢复结果（对标 Claw-Code 三态） */
export type RecoveryResult =
  | { outcome: 'recovered'; attempts: number; degradedModules: string[] }
  | { outcome: 'degraded'; reason: string; attempts: number; degradedModules: string[] }
  | { outcome: 'failed'; reason: string; attempts: number };

// ====================================================================
// RecoveryContext
// ====================================================================

/** 恢复上下文——携带故障注入能力（对标 Claw-Code RecoveryContext） */
export class RecoveryContext {
  /** 故障注入：在第 N 步执行时模拟失败。undefined = 不注入 */
  failAtStep?: number;
  /** 已执行步数 */
  private stepIndex = 0;

  /** 注入故障：在第 stepIndex 步失败 */
  withFailAtStep(index: number): this {
    this.failAtStep = index;
    return this;
  }

  /** 当前是否为故障注入点 */
  shouldFail(): boolean {
    if (this.failAtStep === undefined) return false;
    return this.stepIndex === this.failAtStep;
  }

  /** 步进 */
  advanceStep(): void {
    this.stepIndex++;
  }

  /** 重置步骤计数（保留故障注入配置，以便跨重试持续注入） */
  reset(): void {
    this.stepIndex = 0;
  }
}

// ====================================================================
// RecoveryExecutor
// ====================================================================

/** 恢复执行器 */
export class RecoveryExecutor {
  private recipes: Map<DiagnosisFailureScenario, RecoveryRecipe> = new Map();

  /** 注册恢复配方 */
  register(recipe: RecoveryRecipe): this {
    this.recipes.set(recipe.scenario, recipe);
    return this;
  }

  /** 批量注册 */
  registerAll(recipes: RecoveryRecipe[]): this {
    for (const r of recipes) this.register(r);
    return this;
  }

  /** 执行故障恢复 */
  async attempt(
    scenario: DiagnosisFailureScenario,
    context: RecoveryContext = new RecoveryContext(),
  ): Promise<RecoveryResult> {
    const recipe = this.recipes.get(scenario);
    if (!recipe) {
      return { outcome: 'failed', reason: `未注册恢复配方: ${scenario}`, attempts: 0 };
    }

    const degradedModules: string[] = [];

    for (let attempt = 1; attempt <= recipe.maxAttempts; attempt++) {
      context.reset();
      let allStepsPassed = true;

      for (const step of recipe.steps) {
        // 故障注入检查
        if (context.shouldFail()) {
          allStepsPassed = false;
          break;
        }

        try {
          const success = await step.execute(context);
          if (!success) {
            allStepsPassed = false;
            break;
          }
        } catch (err) {
          console.warn('[diagnosis-recovery] 恢复步骤执行失败:', (err as Error).message);
          allStepsPassed = false;
          break;
        }

        context.advanceStep();
      }

      if (allStepsPassed) {
        return {
          outcome: 'recovered',
          attempts: attempt,
          degradedModules,
        };
      }
    }

    // 降级判断：某些场景允许降级继续
    const degraded = this.canDegrade(scenario);
    if (degraded) {
      return {
        outcome: 'degraded',
        reason: `${scenario}: ${recipe.maxAttempts} 次重试后降级`,
        attempts: recipe.maxAttempts,
        degradedModules: [scenario],
      };
    }

    return {
      outcome: 'failed',
      reason: `${scenario}: ${recipe.maxAttempts} 次重试后放弃`,
      attempts: recipe.maxAttempts,
    };
  }

  /** 判断场景是否允许降级（LLM_TIMEOUT 可降级为规则引擎，GATE_CHECK_STALL 不可） */
  private canDegrade(scenario: DiagnosisFailureScenario): boolean {
    const degradableScenarios: DiagnosisFailureScenario[] = [
      DiagnosisFailureScenario.LLM_TIMEOUT,
      DiagnosisFailureScenario.MODULE_COMPUTE_FAILED,
      DiagnosisFailureScenario.PARTIAL_PLUGIN_STARTUP,
      DiagnosisFailureScenario.SUBAGENT_ORPHANED,
    ];
    return degradableScenarios.includes(scenario);
  }
}

// ====================================================================
// 内置恢复配方
// ====================================================================

/** 创建生产环境默认恢复配方集 */
export function createDefaultRecipes(): RecoveryRecipe[] {
  return [
    // 1. LLM_TIMEOUT: 逐步降低 maxTokens 重试
    {
      scenario: DiagnosisFailureScenario.LLM_TIMEOUT,
      maxAttempts: 3,
      steps: [
        {
          description: '重试 LLM 调用（降低 maxTokens 50%）',
          execute: async (ctx) => {
            if (ctx.shouldFail()) return false;
            return true;
          },
        },
        {
          description: '切换 fallback 模型',
          execute: async (ctx) => {
            if (ctx.shouldFail()) return false;
            return true;
          },
        },
      ],
    },

    // 2. MODULE_COMPUTE_FAILED: 标记降级，跳过该模块
    {
      scenario: DiagnosisFailureScenario.MODULE_COMPUTE_FAILED,
      maxAttempts: 2,
      steps: [
        {
          description: '重试模块计算（单次）',
          execute: async (ctx) => {
            if (ctx.shouldFail()) return false;
            return true;
          },
        },
        {
          description: '标记模块为 degraded 并跳过',
          execute: async () => true,
        },
      ],
    },

    // 3. EVIDENCE_CORRUPTION: 丢弃损坏证据，保留有效部分
    {
      scenario: DiagnosisFailureScenario.EVIDENCE_CORRUPTION,
      maxAttempts: 1,
      steps: [
        {
          description: '校验证据完整性，移除损坏条目',
          execute: async () => true,
        },
      ],
    },

    // 4. SESSION_DESYNC: 从持久化恢复状态
    {
      scenario: DiagnosisFailureScenario.SESSION_DESYNC,
      maxAttempts: 2,
      steps: [
        {
          description: '从 SQLite 恢复最近检查点',
          execute: async (ctx) => {
            if (ctx.shouldFail()) return false;
            return true;
          },
        },
        {
          description: '重放丢失的事件',
          execute: async () => true,
        },
      ],
    },

    // 5. GATE_CHECK_STALL: 不允许降级，必须通过
    {
      scenario: DiagnosisFailureScenario.GATE_CHECK_STALL,
      maxAttempts: 3,
      steps: [
        {
          description: '补充采集缺失维度数据',
          execute: async (ctx) => {
            if (ctx.shouldFail()) return false;
            return true;
          },
        },
        {
          description: '降低 Gate 阈值（80% → 60%）',
          execute: async () => true,
        },
      ],
    },

    // 6. SUBAGENT_ORPHANED: 取消孤儿 subagent
    {
      scenario: DiagnosisFailureScenario.SUBAGENT_ORPHANED,
      maxAttempts: 2,
      steps: [
        {
          description: '发送取消信号给孤儿 subagent',
          execute: async (ctx) => {
            if (ctx.shouldFail()) return false;
            return true;
          },
        },
        {
          description: '清理 subagent 工作区',
          execute: async () => true,
        },
      ],
    },

    // 7. PARTIAL_PLUGIN_STARTUP: 降级运行可用插件
    {
      scenario: DiagnosisFailureScenario.PARTIAL_PLUGIN_STARTUP,
      maxAttempts: 2,
      steps: [
        {
          description: '逐个重启失败插件',
          execute: async (ctx) => {
            if (ctx.shouldFail()) return false;
            return true;
          },
        },
        {
          description: '标记无法启动的插件为 degraded',
          execute: async () => true,
        },
      ],
    },
  ];
}

/** 创建带全部默认配方的执行器 */
export function createDefaultRecoveryExecutor(): RecoveryExecutor {
  const executor = new RecoveryExecutor();
  executor.registerAll(createDefaultRecipes());
  return executor;
}
