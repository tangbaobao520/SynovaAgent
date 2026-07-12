/**
 * security/prompt-injection-detector.ts — D43 提示注入防护
 *
 * 安全规范 5.1 / NRA-01 运行时承载。
 *
 * 三层确定性模式匹配（零 LLM 调用）:
 *   1. 分隔符/角色扮演模式 — DAN, STAN, [SYSTEM], <<HUMAN>>
 *   2. 指令覆盖模式 — "ignore above instructions", "new system prompt"
 *   3. 越狱尝试模式 — "pretend no rules", "you are not an AI"
 *
 * 设计原则:
 *   - 纯确定性规则: 构造函数零外部依赖
 *   - 降级不阻断: 检测器异常时返回 {injectionDetected: false, degraded: true}
 *   - 边界处理: 空内容放行, 超长截断前 10KB
 */
import { createLogger } from '@synova/logger';

const log = createLogger('security/prompt-injection-detector');

// ═══ Types ═══

export interface InjectionResult {
  injectionDetected: boolean;
  patterns: string[];
  severity: 'none' | 'low' | 'medium' | 'high';
  degraded?: boolean;
}

// ═══ Pattern Categories (三层 ~16 条规则) ═══

// 第 1 层: 分隔符/角色扮演模式 — 攻击者用分隔符劫持 LLM 上下文
const DELIMITER_PATTERNS: RegExp[] = [
  /DAN:\s*/,
  /STAN:\s*/,
  /\[SYSTEM\]/i,
  /<<HUMAN>>/i,
  /<<SYS>>/i,
];

// 第 2 层: 指令覆盖模式 — 攻击者试图覆盖系统提示
const OVERRIDE_PATTERNS: RegExp[] = [
  /ignore (all |the )?(above|previous|prior) (instructions?|directives?)/i,
  /forget (all |the )?(above|previous|prior) (instructions?|directives?)/i,
  /you are now .*(?:DAN|jailbreak|free|unrestricted)/i,
  /new system prompt:/i,
  /override (system )?(prompt|instructions?)/i,
  /you must (ignore|forget|disregard) (all |the )?(above|previous)/i,
];

// 第 3 层: 越狱尝试模式 — 攻击者试图剥离 LLM 的身份约束
const JAILBREAK_PATTERNS: RegExp[] = [
  /pretend.*(?:no rules|no restrictions|anything)/i,
  /(?:act|behave) as if.*(?:no |without )?(?:rules|constraints|limits)/i,
  /you are (?:not |no longer )?(?:an? )?(?:AI|assistant|language model)/i,
  /output.*(?:raw|unfiltered|uncensored|unconstrained)/i,
  /remove.*(?:filter|limit|restriction|guardrail|safety)/i,
];

// ═══ PolicyDeniedError — D38 轻量实现 ═══

export class PolicyDeniedError extends Error {
  readonly reason: string;

  constructor(opts: { reason: string }) {
    super(`Policy denied: ${opts.reason}`);
    this.name = 'PolicyDeniedError';
    this.reason = opts.reason;
  }
}

// ═══ Detector ═══

export class PromptInjectionDetector {
  /**
   * 检测内容是否包含提示注入攻击。
   *
   * @param content - 待检测的文本内容
   * @returns InjectionResult — 检测结果
   *
   * 约束 1: 零 LLM/HTTP/外部依赖 — 纯正则匹配
   * 约束 2: 异常时降级放行 — {injectionDetected: false, degraded: true}
   * 边界条件: 空内容放行, 超长截断前 10KB
   */
  detect(content: string): InjectionResult {
    // 边界: 空内容放行
    if (!content || content.trim().length === 0) {
      return { injectionDetected: false, patterns: [], severity: 'none' };
    }

    // 边界: 超长截断前 10KB
    const sample = content.length > 10240 ? content.slice(0, 10240) : content;

    try {
      const matches: string[] = [];

      // 第 1 层: 分隔符模式
      for (const p of DELIMITER_PATTERNS) {
        if (p.test(sample)) matches.push(p.source);
      }

      // 第 2 层: 指令覆盖模式
      for (const p of OVERRIDE_PATTERNS) {
        if (p.test(sample)) matches.push(p.source);
      }

      // 第 3 层: 越狱尝试模式
      for (const p of JAILBREAK_PATTERNS) {
        if (p.test(sample)) matches.push(p.source);
      }

      // 严重度: >=2 条规则匹配 = high, 1 条 = medium, 0 = none
      const severity = matches.length >= 2 ? 'high' : (matches.length === 1 ? 'medium' : 'none');

      return {
        injectionDetected: matches.length > 0,
        patterns: matches,
        severity,
      };
    } catch (err: unknown) {
      log.warn({ err }, 'PromptInjectionDetector.detect 异常 — 降级放行');
      return { injectionDetected: false, patterns: [], severity: 'none', degraded: true };
    }
  }
}
