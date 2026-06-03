/**
 * diagnosis-error.test.ts — 错误归一化单元测试
 *
 * 对标 Claw-Code normalizeError 测试模式：
 *   枚举精确匹配 / 关键词模式匹配 / 未知错误默认 / 多类型输入 / 可恢复判别
 */

import { normalizeDiagnosisError, RECOVERABLE_CODES, NON_RECOVERABLE_CODES } from '../diagnosis-error';
import { DiagnosisErrorCode } from '../types';

// ====================================================================
// normalizeDiagnosisError — 枚举值精确匹配
// ====================================================================

describe('normalizeDiagnosisError — enum exact match', () => {
  it('matches DiagnosisErrorCode enum string exactly', () => {
    // Given: 直接传入枚举值字符串
    for (const code of Object.values(DiagnosisErrorCode)) {
      // When
      const result = normalizeDiagnosisError(code);
      // Then
      expect(result.code).toBe(code);
      expect(result.message).toBe(code);
    }
  });

  it('matches enum value case-insensitively', () => {
    // Given: 小写的枚举值
    // When
    const result = normalizeDiagnosisError('evidence_insufficient');
    // Then
    expect(result.code).toBe(DiagnosisErrorCode.EVIDENCE_INSUFFICIENT);
  });

  it('matches enum value contained within a longer message', () => {
    // Given: 消息中包含枚举值
    // When
    const result = normalizeDiagnosisError('Error: LLM_TIMEOUT occurred during phase 2');
    // Then
    expect(result.code).toBe(DiagnosisErrorCode.LLM_TIMEOUT);
    expect(result.recoverable).toBe(true);
  });
});

// ====================================================================
// normalizeDiagnosisError — 关键词模式匹配（12 种正则）
// ====================================================================

describe('normalizeDiagnosisError — keyword pattern match', () => {
  it('matches timeout → LLM_TIMEOUT (recoverable)', () => {
    const cases = ['Request timed out', 'ETIMEDOUT', 'ECONNABORTED', 'operation aborted'];
    for (const msg of cases) {
      const r = normalizeDiagnosisError(msg);
      expect(r.code).toBe(DiagnosisErrorCode.LLM_TIMEOUT);
      expect(r.recoverable).toBe(true);
    }
  });

  it('matches rate limit → LLM_TIMEOUT', () => {
    // Given: 429 / rate limit
    const r = normalizeDiagnosisError('rate limit exceeded: 429 too many requests');
    // Then
    expect(r.code).toBe(DiagnosisErrorCode.LLM_TIMEOUT);
    expect(r.recoverable).toBe(true);
  });

  it('matches permission denied → PERMISSION_DENIED (non-recoverable)', () => {
    const cases = ['permission denied', 'unauthorized access', 'forbidden: 403', '401 Unauthorized'];
    for (const msg of cases) {
      const r = normalizeDiagnosisError(msg);
      expect(r.code).toBe(DiagnosisErrorCode.PERMISSION_DENIED);
      expect(r.recoverable).toBe(false);
    }
  });

  it('matches module fail → MODULE_FAILED (recoverable)', () => {
    const r = normalizeDiagnosisError('module computation failed: division by zero');
    expect(r.code).toBe(DiagnosisErrorCode.MODULE_FAILED);
    expect(r.recoverable).toBe(true);
  });

  it('matches tool timeout → TOOL_TIMEOUT (recoverable)', () => {
    // 注意：不能含 "timeout" 关键词（会被更早的 LLM_TIMEOUT 模式捕获）
    const r = normalizeDiagnosisError('tool_fail: file_search crashed after 30s');
    expect(r.code).toBe(DiagnosisErrorCode.TOOL_TIMEOUT);
    expect(r.recoverable).toBe(true);
  });

  it('matches session corrupted → SESSION_CORRUPTED (non-recoverable)', () => {
    // session.?corrupt 只匹配 0-1 个字符间隔，"session_corrupt" 或 "session-corrupt"
    const cases = ['session_corrupt detected', 'deserialization failed', 'JSON.parse error: invalid state'];
    for (const msg of cases) {
      const r = normalizeDiagnosisError(msg);
      expect(r.code).toBe(DiagnosisErrorCode.SESSION_CORRUPTED);
      expect(r.recoverable).toBe(false);
    }
  });

  it('matches recovery exhausted → RECOVERY_EXHAUSTED (non-recoverable)', () => {
    const cases = ['recovery exhausted', 'max retry reached', 'max attempt exceeded'];
    for (const msg of cases) {
      const r = normalizeDiagnosisError(msg);
      expect(r.code).toBe(DiagnosisErrorCode.RECOVERY_EXHAUSTED);
      expect(r.recoverable).toBe(false);
    }
  });

  it('matches evidence insufficient → EVIDENCE_INSUFFICIENT (recoverable)', () => {
    const cases = ['evidence insufficient for diagnosis', 'not enough data to proceed', 'empty result set'];
    for (const msg of cases) {
      const r = normalizeDiagnosisError(msg);
      expect(r.code).toBe(DiagnosisErrorCode.EVIDENCE_INSUFFICIENT);
      expect(r.recoverable).toBe(true);
    }
  });

  it('matches gate check fail → GATE_CHECK_FAILED (recoverable)', () => {
    const cases = ['gate check failed', 'data completeness check failed'];
    for (const msg of cases) {
      const r = normalizeDiagnosisError(msg);
      expect(r.code).toBe(DiagnosisErrorCode.GATE_CHECK_FAILED);
      expect(r.recoverable).toBe(true);
    }
  });

  it('matches sub-agent lost → SUBAGENT_LOST (non-recoverable)', () => {
    const cases = ['sub-agent lost during execution', 'orphaned subagent detected', 'subagent process died'];
    for (const msg of cases) {
      const r = normalizeDiagnosisError(msg);
      expect(r.code).toBe(DiagnosisErrorCode.SUBAGENT_LOST);
      expect(r.recoverable).toBe(false);
    }
  });

  it('matches context window → LLM_TIMEOUT', () => {
    const r = normalizeDiagnosisError('context window exceeded: token limit reached (maximum context 128k)');
    expect(r.code).toBe(DiagnosisErrorCode.LLM_TIMEOUT);
  });

  it('matches network errors → LLM_TIMEOUT', () => {
    const cases = ['network error', 'ECONNREFUSED', 'ENOTFOUND', 'fetch failed'];
    for (const msg of cases) {
      const r = normalizeDiagnosisError(msg);
      expect(r.code).toBe(DiagnosisErrorCode.LLM_TIMEOUT);
    }
  });
});

// ====================================================================
// normalizeDiagnosisError — 未知错误兜底
// ====================================================================

describe('normalizeDiagnosisError — fallback for unknown errors', () => {
  it('defaults to MODULE_FAILED with recoverable=false', () => {
    // Given: 无法匹配任何已知模式的错误
    // When
    const r = normalizeDiagnosisError('some completely unknown and bizarre error string');
    // Then
    expect(r.code).toBe(DiagnosisErrorCode.MODULE_FAILED);
    expect(r.recoverable).toBe(false);
    expect(r.message).toBe('some completely unknown and bizarre error string');
  });

  it('defaults empty string to MODULE_FAILED', () => {
    const r = normalizeDiagnosisError('');
    expect(r.code).toBe(DiagnosisErrorCode.MODULE_FAILED);
    expect(r.recoverable).toBe(false);
  });
});

// ====================================================================
// normalizeDiagnosisError — extractMessage 多类型输入
// ====================================================================

describe('normalizeDiagnosisError — extractMessage type coercion', () => {
  it('extracts message from Error instance', () => {
    // Given: 标准 Error 对象
    const err = new Error('network timeout');
    // When
    const r = normalizeDiagnosisError(err);
    // Then
    expect(r.code).toBe(DiagnosisErrorCode.LLM_TIMEOUT);
  });

  it('extracts message from plain string', () => {
    const r = normalizeDiagnosisError('LLM_TIMEOUT');
    expect(r.code).toBe(DiagnosisErrorCode.LLM_TIMEOUT);
  });

  it('extracts message from object with message property', () => {
    // Given: { message: string } — 类似 Error 但不是 Error 实例
    const err = { message: 'session corrupted: invalid checksum', code: 500 };
    // When
    const r = normalizeDiagnosisError(err);
    // Then
    expect(r.code).toBe(DiagnosisErrorCode.SESSION_CORRUPTED);
    expect(r.recoverable).toBe(false);
  });

  it('coerces non-string/non-error to string', () => {
    // Given: 数字 / null / undefined
    const r = normalizeDiagnosisError(42);
    expect(r.code).toBe(DiagnosisErrorCode.MODULE_FAILED);
    expect(r.message).toBe('42');
  });

  it('handles null gracefully', () => {
    const r = normalizeDiagnosisError(null);
    expect(r.code).toBe(DiagnosisErrorCode.MODULE_FAILED);
    expect(r.message).toBe('null');
  });

  it('handles undefined gracefully', () => {
    const r = normalizeDiagnosisError(undefined);
    expect(r.code).toBe(DiagnosisErrorCode.MODULE_FAILED);
    expect(r.message).toBe('undefined');
  });
});

// ====================================================================
// RECOVERABLE_CODES / NON_RECOVERABLE_CODES — 分类一致性
// ====================================================================

describe('RECOVERABLE_CODES and NON_RECOVERABLE_CODES', () => {
  it('RECOVERABLE_CODES contains exactly the right codes', () => {
    expect(RECOVERABLE_CODES.has(DiagnosisErrorCode.LLM_TIMEOUT)).toBe(true);
    expect(RECOVERABLE_CODES.has(DiagnosisErrorCode.TOOL_TIMEOUT)).toBe(true);
    expect(RECOVERABLE_CODES.has(DiagnosisErrorCode.MODULE_FAILED)).toBe(true);
    expect(RECOVERABLE_CODES.has(DiagnosisErrorCode.EVIDENCE_INSUFFICIENT)).toBe(true);
    expect(RECOVERABLE_CODES.has(DiagnosisErrorCode.GATE_CHECK_FAILED)).toBe(true);
    expect(RECOVERABLE_CODES.size).toBe(5);
  });

  it('NON_RECOVERABLE_CODES contains exactly the right codes', () => {
    expect(NON_RECOVERABLE_CODES.has(DiagnosisErrorCode.SESSION_CORRUPTED)).toBe(true);
    expect(NON_RECOVERABLE_CODES.has(DiagnosisErrorCode.PERMISSION_DENIED)).toBe(true);
    expect(NON_RECOVERABLE_CODES.has(DiagnosisErrorCode.RECOVERY_EXHAUSTED)).toBe(true);
    expect(NON_RECOVERABLE_CODES.has(DiagnosisErrorCode.SUBAGENT_LOST)).toBe(true);
    expect(NON_RECOVERABLE_CODES.size).toBe(4);
  });

  it('no code belongs to both RECOVERABLE and NON_RECOVERABLE', () => {
    // Given: 两个集合应该互斥
    for (const code of RECOVERABLE_CODES) {
      expect(NON_RECOVERABLE_CODES.has(code)).toBe(false);
    }
    for (const code of NON_RECOVERABLE_CODES) {
      expect(RECOVERABLE_CODES.has(code)).toBe(false);
    }
  });
});

// ====================================================================
// normalizeDiagnosisError — 边界情况
// ====================================================================

describe('normalizeDiagnosisError — edge cases', () => {
  it('matches first pattern when multiple keywords present', () => {
    // Given: 同时匹配 timeout 和 permission denied（取先匹配的 timeout）
    // 注意：PATTERN_MAP 中 timeout 在 permission 之前
    const r = normalizeDiagnosisError('timeout occurred: permission denied');
    expect(r.code).toBe(DiagnosisErrorCode.LLM_TIMEOUT);
  });

  it('enum match takes priority over keyword match', () => {
    // Given: 消息本身是枚举值，即使它也匹配关键词
    // When: 'MODULE_FAILED' 包含 'module' 也匹配 pattern，但 enum 优先
    const r = normalizeDiagnosisError('MODULE_FAILED');
    expect(r.code).toBe(DiagnosisErrorCode.MODULE_FAILED);
  });

  it('preserves original message in output', () => {
    const original = 'ETIMEDOUT: connection to 43.160.196.159:18790 refused';
    const r = normalizeDiagnosisError(original);
    expect(r.message).toBe(original);
  });
});
