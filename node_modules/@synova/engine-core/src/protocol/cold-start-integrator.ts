/**
 * CB-T12: Cold Start Integrator v0.2 — Variant 冷启动评估
 *
 * 7 天观察窗口策略：
 *   - Variant 上线后进入 7 天冷启动窗口
 *   - 窗口期内仅 accumulate 反馈，不做淘汰/晋升决策
 *   - severity='critical' 走紧急通道，直接 emergency_remove，不受窗口限制
 *   - 窗口期满后：曝光 >= 30 才做决策；< 30 继续 observe
 *   - 决策：replacement_rate >= 80% → eliminate；< 80% → promote_to_ab
 *
 * 对齐《开发档案》第六章 Variant 生命周期规范
 */

// =================================================================
// 常量定义
// =================================================================

/** Variant 冷启动观察窗口（天） */
export const VARIANT_OBSERVATION_DAYS = 7;

/** 最低曝光样本量，低于此值不做决策 */
export const VARIANT_MIN_SAMPLES = 30;

// =================================================================
// 类型定义
// =================================================================

/** 冷启动决策类型 */
export type VariantColdStartDecision =
  | 'observe'          // 继续观察（窗口期内 / 数据不足）
  | 'promote_to_ab'    // 晋升为 A/B 对照实验
  | 'eliminate'        // 淘汰下线
  | 'emergency_remove'; // 紧急移除（critical severity）

/** 冷启动状态输入 */
export interface VariantColdStartState {
  /** Variant 创建/上线时间（ISO 8601 或 Date） */
  created_at: string | Date;
  /** 当前时间（ISO 8601 或 Date），默认 now */
  now?: string | Date;
  /** 累计曝光次数 */
  total_exposure: number;
  /** 替换率（0-100），被新 variant 替换旧推荐的比例 */
  replacement_rate: number;
  /** 严重程度 */
  severity: 'normal' | 'warning' | 'critical';
  /** 窗口期内累计的用户反馈次数 */
  user_feedback_count: number;
}

// =================================================================
// 辅助函数
// =================================================================

/**
 * 将 ISO string 或 Date 转为 Date 对象
 */
function toDate(input: string | Date): Date {
  return typeof input === 'string' ? new Date(input) : input;
}

/**
 * 计算两个日期之间的天数差
 */
function daysBetween(a: Date, b: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return (b.getTime() - a.getTime()) / msPerDay;
}

// =================================================================
// 主评估函数（章节六）
// =================================================================

/**
 * 评估 Variant 冷启动状态，返回对应的决策
 *
 * 策略逻辑（按优先级）：
 * 1. severity='critical' → emergency_remove（不受窗口限制）
 * 2. 上线 < 7 天 → observe（窗口期内反馈累计到 user_feedback_count）
 * 3. 上线 >= 7 天 + 曝光 < 30 → observe（数据不足）
 * 4. 上线 >= 7 天 + 曝光 >= 30 + replacement_rate >= 80% → eliminate
 * 5. 上线 >= 7 天 + 曝光 >= 30 + replacement_rate < 80% → promote_to_ab
 */
export function evaluateVariantColdStart(
  state: VariantColdStartState,
): VariantColdStartDecision {
  const createdAt = toDate(state.created_at);
  const now = state.now ? toDate(state.now) : new Date();
  const daysSinceCreation = daysBetween(createdAt, now);

  // 紧急通道：critical severity 无论窗口期，直接移除
  if (state.severity === 'critical') {
    return 'emergency_remove';
  }

  // 窗口期内：上线不足 VARIANT_OBSERVATION_DAYS 天
  if (daysSinceCreation < VARIANT_OBSERVATION_DAYS) {
    return 'observe';
  }

  // 窗口期满，但数据不足（曝光 < VARIANT_MIN_SAMPLES）
  if (state.total_exposure < VARIANT_MIN_SAMPLES) {
    return 'observe';
  }

  // 窗口期满 + 数据充足：根据 replacement_rate 决策
  if (state.replacement_rate >= 80) {
    return 'eliminate';
  }

  return 'promote_to_ab';
}
