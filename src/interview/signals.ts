/**
 * interview/signals.ts — 访谈信号类型定义 (T11 无数据诊断)
 *
 * 契约ID: T11-SIGNALS-v1
 * 模块: interview (L2)
 * 消费方: signal-extractor.ts, gpi-estimator.ts, expert-dispatcher.ts
 *
 * CausalSignal 是从结构化访谈答案中提取的因果信号，
 * 作为无数据时代替哨兵Evidence的诊断输入。
 */

import type { Contradiction } from './engine';

/** 信号强度 */
export type SignalStrength = 'strong' | 'moderate' | 'weak';

/** 证据类型 */
export type EvidenceType = 'direct' | 'contradiction' | 'pattern';

/** 因果信号——从访谈文本中提取的最小诊断单元 */
export interface CausalSignal {
  /** 唯一标识 */
  id: string;
  /** 所属诊断维度（如 goal_alignment / strategy_clarity / resource_allocation） */
  dimension: string;
  /** 提供该信号的角色 ID */
  sourceRole: string;
  /** 原始回答截取（关键句，用于溯源） */
  sourceAnswer: string;
  /** 信号强度 */
  signalStrength: SignalStrength;
  /** 证据类型 */
  evidenceType: EvidenceType;
  /** 一句话总结该信号 */
  description: string;
  /** 可能对应的边名（可选，供专家系统消费） */
  suggestedEdge?: string;
}

/** 从单个角色访谈中提取的信号集 */
export interface RoleSignalSet {
  /** 角色 ID */
  roleId: string;
  /** 该角色提取出的所有信号 */
  signals: CausalSignal[];
}

/** 信号提取器的完整输出 */
export interface ExtractedSignals {
  /** 所有信号 */
  signals: CausalSignal[];
  /** 跨角色矛盾（来自 engine.ts 的 detectContradictions） */
  contradictions: Contradiction[];
  /** 7 个维度中哪些没有被任何角色覆盖到 */
  blindSpots: string[];
  /** 提取器是否降级运行 */
  degraded: boolean;
  /** 警告信息 */
  warnings: string[];
}
