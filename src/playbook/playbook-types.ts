/**
 * src/playbook/playbook-types.ts — Playbook 类型定义
 *
 * 对标第12份权威文档第三章/第四章 Playbook YAML Schema。
 * 每个 Playbook 定义一套完整的触发→步骤→输出→降级流程。
 */

/** 触发条件 */
export interface PlaybookTrigger {
  /** 触发该剧本的哨兵名称列表 */
  sentinels?: string[];
  /** 是否支持手动触发 */
  manual?: boolean;
  /** Cron 调度表达式 */
  schedule?: string;
  /** 触发条件描述 */
  condition?: string;
}

/** 剧本步骤 */
export interface PlaybookStep {
  /** 步骤唯一标识 */
  id: string;
  /** 步骤名称 */
  name: string;
  /** 步骤详细描述 */
  description?: string;
  /** 该步骤调用的 Skill 名称 */
  skill?: string;
  /** 该步骤调用的工具名称列表 */
  tools?: string[];
  /** 步骤超时时间（秒） */
  timeout?: number;
  /** 步骤失败处理策略 */
  onFailure?: 'halt' | 'skip' | 'degrade' | 'retry' | 'notify';
}

/** Playbook 完整定义 */
export interface PlaybookDefinition {
  /** 剧本唯一 ID（如 PB-finance-cashflow-crisis） */
  id: string;
  /** 剧本名称 */
  name: string;
  /** 剧本描述 */
  description: string;
  /** 版本号 */
  version: string;
  /** 所属专家 */
  expert: string;
  /** 记录类型 */
  type: 'playbook';
  /** 触发条件 */
  trigger: PlaybookTrigger;
  /** 执行步骤序列 */
  steps: PlaybookStep[];
  /** 全局失败处理策略 */
  onFailure: 'halt' | 'continue' | 'degrade' | 'notify';
  /** 输出格式/报告类型 */
  output: string;
  /** 依赖声明 */
  dependencies?: {
    /** 依赖的 42 边 ID 列表 */
    edges?: string[];
    /** 依赖的 Skill 名称列表 */
    skills?: string[];
    /** 依赖的哨兵名称列表 */
    sentinels?: string[];
  };
  /** 是否跨专家协同 */
  crossExpert?: boolean;
}

// ═══ D80: PlaybookExecutionRecord ═══

/** 单步执行结果 */
export interface StepResult {
  stepId: string;
  stepIndex: number;
  expert: string;
  toolCalled: string;
  startTime: string;
  endTime: string;
  durationMs: number;
  status: 'success' | 'degraded' | 'skipped' | 'failed' | 'halted';
  output?: { evidenceRefs?: string[]; confidence?: number; summary?: string };
  error?: { code: string; message: string; retryable: boolean };
  retryCount: number;
}

/** 专家间交互记录 */
export interface CrossExpertInteraction {
  fromExpert: string;
  toExpert: string;
  interactionType: 'RequestValidation' | 'Endorse' | 'Challenge';
  timestamp: string;
  findingRef: string;
}

/** Playbook 执行记录（15字段 — 第12份权威文档 §5） */
export interface PlaybookExecutionRecord {
  executionId: string;
  playbookId: string;
  playbookVersion: string;
  enterpriseId: string;
  triggerType: 'sentinel' | 'cron' | 'manual' | 'event';
  triggerDetail: { sentinelId?: string; severity?: string; manualBy?: string };
  startTime: string;
  endTime: string;
  durationMs: number;
  appliedOverrides: Record<string, unknown>;
  stepResults: StepResult[];
  crossExpertInteractions: CrossExpertInteraction[];
  finalOutput: {
    reportRef: string;
    confidence: number;
    degradedSteps: number;
    failedSteps: number;
  };
  tokenUsage: { totalInput: number; totalOutput: number };
  costEstimate: number;
}
