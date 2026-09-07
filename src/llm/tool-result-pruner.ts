/**
 * llm/tool-result-pruner.ts — 工具结果确定性修剪器（D587，DSH 借鉴卡 B-04）
 *
 * 职责: 工具结果/证据文本进入 LLM 提示词前的确定性修剪——超阈值时保留
 *       head + 固定 marker + tail，中段替换为固定标记。
 *
 * 范式来源（读源码自研，零 DSH 包依赖，G1/G4）:
 *   D:/deepseek-harness/packages/compaction/compaction-tool-result-pruner/lib/index.js (0.1.1-rc.2)
 *   - PRUNE_MARKER / DEFAULTS 常量语义一致
 *   - 码点计数: Array.from（不拆 UTF-16 代理对，中文/emoji 友好）
 *   - 配置校验: 未知 key 抛错 + 正/非负整数断言 + head+marker+tail≤threshold + 冻结
 *   - 核心语义: 确定性、replay-safe——同输入同输出；已修剪输出再修剪不变（幂等）
 *
 * 公共面最小化: 仅导出 pruneToolResult（生产入口）与 ToolResultPruneError
 * （调用方降级 catch 中识别稳定错误码）。配置解析/码点计数均为模块内部实现，
 * 其契约经由公共入口全覆盖测试（tests/llm/tool-result-pruner.test.ts）。
 *
 * Iron law #47: 契约优先——每个导出函数 JSDoc 声明输入/输出/降级。
 * Iron law #32: 错误分类——抛错携带 .code / .phase / .retryable。
 */

/** 固定修剪标记：被移除中段的唯一替代物（与 DSH 逐字节一致，replay 可识别）。 */
const PRUNE_MARKER = '\n\n[... tool result middle pruned ...]\n\n';

/** 修剪预算（字符单位 = Unicode 码点，非 UTF-16 code unit）。 */
export interface ToolResultPruneConfig {
  /** 触发修剪的码点总长上界（正整数）。≤ 该值不修剪。 */
  thresholdChars: number;
  /** 保留头部的码点数（非负整数）。 */
  headChars: number;
  /** 保留尾部的码点数（非负整数）。 */
  tailChars: number;
}

/** 缺省预算（DSH DEFAULTS 同值）：8192 阈值 / 4096 头 / 1024 尾。 */
const DEFAULTS: Readonly<ToolResultPruneConfig> = Object.freeze({
  thresholdChars: 8192,
  headChars: 4096,
  tailChars: 1024,
});

/** 合法配置键（未知 key 一律抛错——配置拼错必须显式失败，禁止静默忽略）。 */
const CONFIG_KEYS: ReadonlySet<string> = new Set(['thresholdChars', 'headChars', 'tailChars']);

/** 修剪器配置输入：索引签名 unknown，运行时校验收窄（铁律 38——零逃逸类型断言）。 */
export type ToolResultPruneConfigInput = { readonly [key: string]: unknown };

/** 修剪层稳定错误（铁律 32：code + phase + retryable）。fail-fast，不可重试。 */
export class ToolResultPruneError extends Error {
  readonly code: string;
  readonly phase = 'tool-result-prune';
  readonly retryable = false;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'ToolResultPruneError';
    this.code = code;
  }
}

/**
 * 统计文本的 Unicode 码点数（不拆代理对）。
 */
function codePointLength(text: string): number {
  return Array.from(text).length;
}

/**
 * 校验单个预算字段：缺省回退 fallback；非整数或 < min 抛 ToolResultPruneError。
 */
function assertBudget(name: string, value: unknown, min: number, fallback: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min) {
    const kind = min === 1 ? 'a positive integer' : 'a non-negative integer';
    throw new ToolResultPruneError(
      'TOOL_RESULT_PRUNE_CONFIG',
      `ToolResultPruneConfig: ${name} (${String(value)}) must be ${kind}`,
    );
  }
  return value;
}

/**
 * 解析并校验修剪预算。任何非法输入抛 ToolResultPruneError(code=TOOL_RESULT_PRUNE_CONFIG)。
 */
function resolveConfig(config: ToolResultPruneConfigInput): Readonly<ToolResultPruneConfig> {
  for (const key of Object.keys(config)) {
    if (!CONFIG_KEYS.has(key)) {
      throw new ToolResultPruneError(
        'TOOL_RESULT_PRUNE_CONFIG',
        `ToolResultPruneConfig: unknown key "${key}" (allowed: thresholdChars, headChars, tailChars)`,
      );
    }
  }

  const resolved = {
    thresholdChars: assertBudget('thresholdChars', config.thresholdChars, 1, DEFAULTS.thresholdChars),
    headChars: assertBudget('headChars', config.headChars, 0, DEFAULTS.headChars),
    tailChars: assertBudget('tailChars', config.tailChars, 0, DEFAULTS.tailChars),
  };

  const emittedChars = resolved.headChars + codePointLength(PRUNE_MARKER) + resolved.tailChars;
  if (emittedChars > resolved.thresholdChars) {
    throw new ToolResultPruneError(
      'TOOL_RESULT_PRUNE_CONFIG',
      `ToolResultPruneConfig: headChars + marker + tailChars (${emittedChars}) must be at most thresholdChars (${resolved.thresholdChars})`,
    );
  }

  return Object.freeze(resolved);
}

/**
 * 工具结果确定性修剪（本模块主入口）。
 *
 * 契约:
 * - 输入: text — 工具结果文本（如 JSON.stringify 后的工具输出）;
 *         config — 可选预算（每次调用校验，非法即抛错）。
 * - 输出: 码点数 ≤ threshold 的文本。未超阈值原样返回（同引用）；
 *         超阈值返回 `head(前 headChars 码点) + PRUNE_MARKER + tail(末 tailChars 码点)`，
 *         边界按码点切割（不拆代理对；grapheme 簇仍可能拆分，与 DSH 一致）。
 * - 降级: 配置非法 / 不变量被破坏 → ToolResultPruneError
 *         （code: TOOL_RESULT_PRUNE_CONFIG | TOOL_RESULT_PRUNE_INVARIANT；
 *         调用方决定降级策略，推荐捕获后 log.warn 并降级为原文）。
 * - replay-safe: 纯函数、无状态、同输入同输出；输出 ≤ threshold → 幂等。
 */
export function pruneToolResult(text: string, config: ToolResultPruneConfigInput = {}): string {
  const cfg = resolveConfig(config);
  const total = codePointLength(text);

  // replay-safe 关键：未超阈值原样返回 → 已修剪输出（≤ threshold）再修剪不变
  if (total <= cfg.thresholdChars) return text;

  const points = Array.from(text);
  const head = points.slice(0, cfg.headChars).join('');
  const tail = points.slice(Math.max(0, points.length - cfg.tailChars)).join('');
  const pruned = head + PRUNE_MARKER + tail;

  // 防御性后置条件（DSH 同款）：合法预算下数学上恒成立，违反即实现 bug
  const outLen = codePointLength(pruned);
  if (outLen > cfg.thresholdChars || outLen >= total) {
    throw new ToolResultPruneError(
      'TOOL_RESULT_PRUNE_INVARIANT',
      'tool-result prune: replacement must be smaller and within threshold',
    );
  }

  return pruned;
}
