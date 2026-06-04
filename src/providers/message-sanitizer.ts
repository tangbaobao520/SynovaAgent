/**
 * providers/message-sanitizer.ts — LLM 消息清洗 (P2-5.4)
 *
 * 参考 Hermes agent/message_sanitization.py:
 *   _sanitize_surrogates() — UTF-16 代理项替换
 *   _repair_tool_call_arguments() — 截断 JSON 修复
 *   _strip_non_ascii() — 非 ASCII 恢复
 *
 * 用户从 CRM/Excel 复制的数据可能含不可见字符导致 LLM API 400。
 */
import { createLogger } from '../logger';

const log = createLogger('providers/message-sanitizer');

/**
 * Replace UTF-16 surrogate characters (U+D800-U+DFFF).
 * These cause JSON parse failures and HTTP 400 errors.
 */
function sanitizeSurrogates(text: string): string {
  return text.replace(/[\uD800-\uDFFF]/g, '�'); // REPLACEMENT CHARACTER
}

/**
 * Strip non-printable ASCII control characters (except \n, \r, \t).
 */
function sanitizeControlChars(text: string): string {
  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

/**
 * Normalize Unicode: replace common problematic characters.
 * - Full-width spaces → regular spaces
 * - Zero-width characters → removed
 * - BOM → removed
 */
function normalizeUnicode(text: string): string {
  return text
    .replace(/﻿/g, '')           // BOM
    .replace(/​/g, '')           // Zero-width space
    .replace(/‌/g, '')           // Zero-width non-joiner
    .replace(/‍/g, '')           // Zero-width joiner
    .replace(/　/g, ' ')          // Full-width space
    .replace(/！-～/g, (m) => // Full-width ASCII → half-width
      String.fromCharCode(m.charCodeAt(0) - 0xFEE0));
}

/**
 * Truncate overly long messages to prevent API rejection.
 * DeepSeek: 1M context max. Single message > 100K chars is unusual.
 */
function truncateIfNeeded(text: string, maxChars = 50_000): string {
  if (text.length <= maxChars) return text;
  log.warn({ originalLength: text.length, truncatedTo: maxChars }, '消息过长已截断');
  return text.slice(0, maxChars) + '\n...[truncated]';
}

/**
 * Attempt to repair truncated JSON in tool call arguments.
 * Common pattern: trailing comma, missing closing brace/bracket.
 */
function repairJSON(text: string): string {
  try {
    JSON.parse(text);
    return text; // Already valid
  } catch {
    // Try removing trailing comma
    const fixed = text.replace(/,\s*([}\]])/g, '$1');
    try {
      JSON.parse(fixed);
      return fixed;
    } catch {
      // Try adding missing closing brackets
      const withClose = text + '}]'.repeat(
        (text.match(/\{/g) || []).length - (text.match(/\}/g) || []).length +
        (text.match(/\[/g) || []).length - (text.match(/\]/g) || []).length
      );
      try {
        JSON.parse(withClose);
        return withClose;
      } catch {
        return text; // Can't repair — return original
      }
    }
  }
}

/**
 * Full sanitization pipeline for a single message.
 */
export function sanitizeMessage(content: string): string {
  let result = content;
  result = sanitizeSurrogates(result);
  result = sanitizeControlChars(result);
  result = normalizeUnicode(result);
  result = truncateIfNeeded(result);
  return result;
}

/**
 * Sanitize an array of LLM messages before sending to provider.
 */
export function sanitizeMessages(
  messages: Array<{ role: string; content: string; tool_calls?: unknown[] }>,
): Array<{ role: string; content: string; tool_calls?: unknown[] }> {
  return messages.map(m => ({
    ...m,
    content: sanitizeMessage(m.content || ''),
    // Repair tool call arguments if present
    tool_calls: m.tool_calls?.map((tc: any) => ({
      ...tc,
      function: tc.function ? {
        ...tc.function,
        arguments: repairJSON(typeof tc.function.arguments === 'string'
          ? tc.function.arguments
          : JSON.stringify(tc.function.arguments)),
      } : undefined,
    })),
  }));
}
