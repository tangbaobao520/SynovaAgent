/**
 * engine-server/qa/types.ts — 质量评估体系类型定义
 *
 * 5 维度评分，每维度 0-100，含分类评分明细。
 */
import type { GenerateBlueprintRequest, DiagnosisReport } from '../types';

// ================================================================
// 测试用例
// ================================================================

export interface QATestCase {
  id: string;
  name: string;
  description: string;
  /** 完整的引擎请求 */
  request: GenerateBlueprintRequest;
  /** 可选：嵌入预期验证条件（用作评分辅助） */
  expectations?: {
    /** 预期角色类型 */
    expectedRoles?: string[];
    /** 预期团队规模范围 */
    teamSizeRange?: [number, number];
    /** 预期协作模式偏好 */
    preferredModes?: string[];
    /** 不应出现的模式 */
    forbiddenModes?: string[];
    /** 必须包含的技能关键词 */
    requiredSkillKeywords?: string[];
    /** 行业/领域标签 */
    domain: string;
  };
}

// ================================================================
// 5 维度评分结果
// ================================================================

export interface DimensionScore {
  /** 维度名称 */
  dimension: string;
  /** 0-100 总评分 */
  score: number;
  /** 该维度的分项评分 */
  subScores: SubScore[];
  /** LLM Judge 的评语 */
  judgeComment: string;
  /** 是否通过（score >= passThreshold） */
  passed: boolean;
  /** Judge 调用降级标记 */
  degraded?: boolean;
}

export interface SubScore {
  label: string;
  score: number;       // 0-100
  maxScore: number;
  comment: string;
}

export interface QAResult {
  testCaseId: string;
  testCaseName: string;
  timestamp: string;
  engineVersion: string;
  blueprintId: string;
  pipelineDurationMs: number;
  dimensions: DimensionScore[];
  overallScore: number;    // 5 维度平均
  overallPassed: boolean;
  /** 与上次评分的对比 */
  regression?: RegressionCheck;
}

export interface RegressionCheck {
  previousScore: number;
  currentScore: number;
  delta: number;
  degraded: boolean;
  /** 退化超过阈值的维度 */
  degradedDimensions: string[];
}

// ================================================================
// QA 运行配置
// ================================================================

export interface QARunConfig {
  /** 评分用 LLM（建议与 Pipeline 不同的模型） */
  judgeModel: string;
  judgeBaseUrl: string;
  judgeApiKey: string;
  /** 每维度通过阈值 */
  passThreshold: number;
  /** 退化告警阈值（delta < -此值则告警） */
  regressionThreshold: number;
  /** 基线文件路径 */
  baselinePath: string;
  /** 报告输出路径 */
  reportPath: string;
  /** 只运行匹配的用例 ID（可选，用于 --case 模式） */
  testCaseFilter?: (id: string) => boolean;
}

// ================================================================
// QA 套件结果
// ================================================================

export interface QASuiteResult {
  runAt: string;
  engineVersion: string;
  config: Pick<QARunConfig, 'judgeModel' | 'passThreshold' | 'regressionThreshold'>;
  results: QAResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    degraded: number;
    averageScore: number;
    dimensionAverages: Record<string, number>;
  };
}
