/**
 * tests/llm/tool-result-pruner.test.ts — D587 工具结果确定性修剪器
 *
 * 契约来源: docs/plans/codex/implementation/SYNOVA-IMPL-D587-tool-result-pruner-20260907.md §5
 * 借鉴语义: DSH compaction-tool-result-pruner/lib/index.js（head+marker+tail、码点计数、
 *          配置校验、replay-safe 幂等）——零 @deepseek-ai 依赖，纯函数自研。
 * 公共面最小化: 全部用例经由公共入口 pruneToolResult 验证；marker/缺省值在此用
 * 字面量钉住契约（修剪标记必须跨版本稳定，replay 依赖它可识别）。
 *
 * 铁律 48: 每用例 ≥3 expect（正常 + 降级 + 边界）。
 */
import { describe, it, expect } from 'vitest';
import {
  pruneToolResult,
  ToolResultPruneError,
} from '../../src/llm/tool-result-pruner';

/** DSH 同款固定修剪标记（逐字节 pin 契约——跨版本变更 = replay 破坏，必须显式改本文件） */
const MARKER = '\n\n[... tool result middle pruned ...]\n\n';
/** DSH DEFAULTS 同值缺省预算 */
const DEFAULTS = { thresholdChars: 8192, headChars: 4096, tailChars: 1024 } as const;

/** 生成确定性的超长 ASCII 文本（可预测头尾内容） */
function makeLongText(totalCodePoints: number): string {
  let s = '';
  for (let i = 0; i < totalCodePoints; i++) s += String.fromCharCode(97 + (i % 26)); // a-z 循环
  return s;
}

/** 提取字符串的码点数组（无 undefined 分支） */
function codePoints(text: string): number[] {
  return Array.from(text).map(ch => ch.codePointAt(0) ?? 0);
}

describe('D587 pruneToolResult — 正常路径', () => {
  it('超阈值文本 → head + marker + tail，总长 ≤ threshold，头尾内容精确保留', () => {
    const text = makeLongText(DEFAULTS.thresholdChars + 5000);
    const out = pruneToolResult(text);

    // 1. 长度上界：head + marker + tail ≤ threshold（marker 全 ASCII，码点数 === length）
    expect(Array.from(out).length).toBeLessThanOrEqual(DEFAULTS.thresholdChars);
    // 2. 固定 marker 恰好出现一次（DSH 语义：单 marker 替换中段）
    expect(out.split(MARKER).length - 1).toBe(1);
    // 3. 头部精确保留前 headChars 个码点
    const head = Array.from(text).slice(0, DEFAULTS.headChars).join('');
    expect(out.startsWith(head)).toBe(true);
    // 4. 尾部精确保留最后 tailChars 个码点
    const tail = Array.from(text).slice(-DEFAULTS.tailChars).join('');
    expect(out.endsWith(tail)).toBe(true);
    // 5. 确定性小于原文（修剪有实效）
    expect(Array.from(out).length).toBeLessThan(Array.from(text).length);
  });

  it('replay-safe：同输入同输出，且对已修剪输出再修剪不变（幂等）', () => {
    const text = makeLongText(20000);
    const once = pruneToolResult(text);
    const twice = pruneToolResult(text);

    // 1. 确定性：两次修剪结果逐字符相等
    expect(twice).toBe(once);
    // 2. 幂等：修剪输出已 ≤ threshold → 再次修剪原样返回
    expect(pruneToolResult(once)).toBe(once);
    // 3. marker 恰好一次（幂等副证：无 marker 叠加）
    expect(once.split(MARKER).length - 1).toBe(1);
  });
});

describe('D587 pruneToolResult — 边界条件', () => {
  it('阈值内文本原样返回（不修剪、无 marker）', () => {
    const text = '短文本 tool result：诊断完成，growth 信号正常。';
    const out = pruneToolResult(text);

    // 1. 原样返回
    expect(out).toBe(text);
    // 2. 无 marker
    expect(out.includes('pruned')).toBe(false);
    // 3. 恰好等于阈值也不修剪（≤ 语义，DSH 一致）
    const exact = makeLongText(DEFAULTS.thresholdChars);
    expect(pruneToolResult(exact)).toBe(exact);
  });

  it('中文 + emoji（代理对）不拆字：修剪边界落在码点上', () => {
    // 6000 个 emoji（每个 = 2 UTF-16 unit / 1 码点）→ 远超自定义阈值 100
    const emoji = '😀'.repeat(6000);
    const text = `结果😀中文${emoji}尾部中文😀完整`;
    const out = pruneToolResult(text, { thresholdChars: 100, headChars: 40, tailChars: 10 });

    // 1. 长度上界（码点计）
    expect(Array.from(out).length).toBeLessThanOrEqual(100);
    // 2. 头部 40 码点与输入逐码点一致（含完整 emoji，不被 UTF-16 slice 拆开）
    const expectedHead = Array.from(text).slice(0, 40).join('');
    expect(out.startsWith(expectedHead)).toBe(true);
    // 3. 输出无孤立代理对（每个码点都不落在 D800-DFFF）
    expect(codePoints(out).every(cp => cp < 0xd800 || cp > 0xdfff)).toBe(true);
    // 4. 尾部精确保留
    const expectedTail = Array.from(text).slice(-10).join('');
    expect(out.endsWith(expectedTail)).toBe(true);
  });
});

describe('D587 pruneToolResult — 配置校验（降级路径，错误经公共入口抛出）', () => {
  it('headChars + marker + tailChars > thresholdChars 抛稳定错误码', () => {
    // 1. 预算超限抛错（DSH resolveConfig 同语义；marker 42 码点 → 40+42+20=102 > 50）
    let caught: unknown;
    try {
      pruneToolResult('x', { thresholdChars: 50, headChars: 40, tailChars: 20 });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ToolResultPruneError);
    expect(caught).toHaveProperty('code', 'TOOL_RESULT_PRUNE_CONFIG');
    // 2. 恰好相等合法（≤ 语义）——用缺省预算构造 head+marker+tail == threshold
    const markerLen = Array.from(MARKER).length;
    const exactOk = `H${'x'.repeat(DEFAULTS.thresholdChars)}T`;
    const out = pruneToolResult(exactOk, {
      thresholdChars: DEFAULTS.headChars + markerLen + DEFAULTS.tailChars,
      headChars: DEFAULTS.headChars,
      tailChars: DEFAULTS.tailChars,
    });
    expect(Array.from(out).length).toBe(DEFAULTS.headChars + markerLen + DEFAULTS.tailChars);
    // 3. 预算校验错误带 message 语义（可定位字段名）
    expect(() => pruneToolResult('x', { thresholdChars: 1, headChars: 5, tailChars: 5 }))
      .toThrow(/headChars \+ marker \+ tailChars/);
  });

  it('未知 key 抛错 + 非法值抛错 + retryable=false（缺省值路径由正常用例覆盖）', () => {
    // 1. 未知 key 抛错（DSH CONFIG_KEYS 同语义——配置拼错必须显式失败）
    expect(() => pruneToolResult('x', { unknownKey: 1 })).toThrow(/unknown key/);
    // 2. 非正整数 thresholdChars / 负数 headChars 抛错
    expect(() => pruneToolResult('x', { thresholdChars: 0 })).toThrow(/must be a positive integer/);
    expect(() => pruneToolResult('x', { headChars: -1 })).toThrow(/must be a non-negative integer/);
    // 3. 错误对象带稳定三元组（铁律 32: code/phase/retryable）
    let caught: unknown;
    try {
      pruneToolResult('x', { tailChars: 1.5 });
    } catch (err) {
      caught = err;
    }
    expect(caught).toHaveProperty('code', 'TOOL_RESULT_PRUNE_CONFIG');
    expect(caught).toHaveProperty('phase', 'tool-result-prune');
    expect(caught).toHaveProperty('retryable', false);
  });
});
