/**
 * diagnosis-event-stream.test.ts — SSE 事件流封装单元测试
 *
 * 对标 Claw-Code EventStream 测试模式：
 *   write/close/error/interrupt 四 API / closed 状态保护 / 重复 close 幂等 / SSE 格式
 */

import { DiagnosisEventStream } from '../diagnosis-event-stream';
import type { DiagnosisEvent, ConsultationResult } from '../types';

// ====================================================================
// Helpers
// ====================================================================

type WrittenChunk = string;
type EndCall = { closed: boolean };

/** 模拟 Express Response，只捕获 write/end 调用 */
function mockResponse(): {
  res: any;
  chunks: WrittenChunk[];
  endState: EndCall;
} {
  const chunks: WrittenChunk[] = [];
  const endState: EndCall = { closed: false };
  const res = {
    writableEnded: false,
    write(chunk: string): boolean {
      chunks.push(chunk);
      return true;
    },
    end(): void {
      endState.closed = true;
      res.writableEnded = true;
    },
  };
  return { res, chunks, endState };
}

function makeEvent(overrides: Partial<DiagnosisEvent> = {}): DiagnosisEvent {
  return {
    type: 'phase_started',
    phase: 0,
    timestamp: new Date().toISOString(),
    ...overrides,
  } as DiagnosisEvent;
}

function makeResult(overrides: Partial<ConsultationResult> = {}): ConsultationResult {
  return {
    teamId: 'test-team',
    report: {
      ceoSummary: 'summary',
      gapRadar: {},
      keyFindings: [],
      evidenceChain: [],
      rootCauseTree: { rootCauses: [], contradictions: [], generatedAt: '' },
      actionRecommendations: [],
      generatedAt: new Date().toISOString(),
      durationMs: 1000,
      degradedModules: [],
      posture: 'steady_operator',
      postureLabel: '稳健经营型',
    },
    events: [],
    totalDurationMs: 1000,
    degradedModules: [],
    ...overrides,
  };
}

// ====================================================================
// DiagnosisEventStream — write
// ====================================================================

describe('DiagnosisEventStream — write', () => {
  it('writes a single event as SSE JSON line', () => {
    // Given: 新创建的 stream
    const { res, chunks } = mockResponse();
    const stream = new DiagnosisEventStream(res);
    const event = makeEvent({ type: 'phase_started', phase: 1 });

    // When
    stream.write(event);

    // Then: SSE 格式 — "data: <JSON>\n\n"
    expect(chunks.length).toBe(1);
    expect(chunks[0]).toBe(`data: ${JSON.stringify(event)}\n\n`);
  });

  it('writes multiple events sequentially', () => {
    // Given
    const { res, chunks } = mockResponse();
    const stream = new DiagnosisEventStream(res);

    // When
    stream.write(makeEvent({ type: 'phase_started', phase: 0 }));
    stream.write(makeEvent({ type: 'phase_completed', phase: 0 }));
    stream.write(makeEvent({ type: 'phase_started', phase: 1 }));

    // Then
    expect(chunks.length).toBe(3);
  });

  it('skips write when already closed', () => {
    // Given: 已关闭的 stream
    const { res, chunks } = mockResponse();
    const stream = new DiagnosisEventStream(res);
    stream.close(makeResult());

    const beforeCount = chunks.length;

    // When: 关闭后继续 write
    stream.write(makeEvent());

    // Then: 没有新内容写入
    expect(chunks.length).toBe(beforeCount);
  });

  it('skips write when underlying response socket is gone', () => {
    // Given: response 已经 writableEnded
    const { res, chunks } = mockResponse();
    res.writableEnded = true; // 模拟客户端断开
    const stream = new DiagnosisEventStream(res);

    // When
    stream.write(makeEvent());

    // Then
    expect(chunks.length).toBe(0);
  });
});

// ====================================================================
// DiagnosisEventStream — close
// ====================================================================

describe('DiagnosisEventStream — close', () => {
  it('writes complete event and ends response', () => {
    // Given
    const { res, chunks, endState } = mockResponse();
    const stream = new DiagnosisEventStream(res);
    const result = makeResult({ teamId: 'team-1', totalDurationMs: 5000 });

    // When
    stream.close(result);

    // Then
    expect(chunks.length).toBe(1);
    const parsed = JSON.parse(chunks[0].replace('data: ', ''));
    expect(parsed.type).toBe('complete');
    expect(parsed.result.teamId).toBe('team-1');
    expect(endState.closed).toBe(true);
    expect(res.writableEnded).toBe(true);
  });

  it('sets closed to true after close', () => {
    // Given
    const { res } = mockResponse();
    const stream = new DiagnosisEventStream(res);

    // When
    stream.close(makeResult());

    // Then
    expect(stream.closed).toBe(true);
  });

  it('double close is idempotent', () => {
    // Given
    const { res, chunks, endState } = mockResponse();
    const stream = new DiagnosisEventStream(res);
    stream.close(makeResult({ teamId: 'first' }));

    const chunkCountAfterFirst = chunks.length;
    const endStateAfterFirst = endState.closed;

    // When: 第二次 close
    stream.close(makeResult({ teamId: 'second' }));

    // Then: 没有新写入，没有重复 end
    expect(chunks.length).toBe(chunkCountAfterFirst);
    expect(endState.closed).toBe(endStateAfterFirst);
    // 确认第一个结果未被覆盖
    const firstChunk = JSON.parse(chunks[0].replace('data: ', ''));
    expect(firstChunk.result.teamId).toBe('first');
  });

  it('close after error is no-op', () => {
    // Given: 已经通过 error() 关闭
    const { res, chunks } = mockResponse();
    const stream = new DiagnosisEventStream(res);
    stream.error('TEST_ERR', 'test error');

    const beforeCount = chunks.length;

    // When
    stream.close(makeResult());

    // Then
    expect(chunks.length).toBe(beforeCount);
  });
});

// ====================================================================
// DiagnosisEventStream — error
// ====================================================================

describe('DiagnosisEventStream — error', () => {
  it('writes error event with code and message', () => {
    // Given
    const { res, chunks, endState } = mockResponse();
    const stream = new DiagnosisEventStream(res);

    // When
    stream.error('ORCHESTRATOR_FAILED', 'Phase 2 crashed unexpectedly');

    // Then
    expect(chunks.length).toBe(1);
    const parsed = JSON.parse(chunks[0].replace('data: ', ''));
    expect(parsed.type).toBe('error');
    expect(parsed.code).toBe('ORCHESTRATOR_FAILED');
    expect(parsed.message).toBe('Phase 2 crashed unexpectedly');
    expect(endState.closed).toBe(true);
    expect(stream.closed).toBe(true);
  });

  it('double error is idempotent', () => {
    // Given
    const { res, chunks } = mockResponse();
    const stream = new DiagnosisEventStream(res);
    stream.error('FIRST', 'first error');

    const count = chunks.length;

    // When
    stream.error('SECOND', 'second error');

    // Then
    expect(chunks.length).toBe(count);
    const parsed = JSON.parse(chunks[0].replace('data: ', ''));
    expect(parsed.code).toBe('FIRST');
  });
});

// ====================================================================
// DiagnosisEventStream — interrupt
// ====================================================================

describe('DiagnosisEventStream — interrupt', () => {
  it('writes interrupted event with consultId', () => {
    // Given
    const { res, chunks, endState } = mockResponse();
    const stream = new DiagnosisEventStream(res);

    // When
    stream.interrupt('consult-abc-123');

    // Then
    expect(chunks.length).toBe(1);
    const parsed = JSON.parse(chunks[0].replace('data: ', ''));
    expect(parsed.type).toBe('interrupted');
    expect(parsed.consultId).toBe('consult-abc-123');
    expect(endState.closed).toBe(true);
    expect(stream.closed).toBe(true);
  });

  it('interrupt after close is no-op', () => {
    // Given
    const { res, chunks } = mockResponse();
    const stream = new DiagnosisEventStream(res);
    stream.close(makeResult());

    const count = chunks.length;

    // When
    stream.interrupt('xyz');

    // Then
    expect(chunks.length).toBe(count);
  });
});

// ====================================================================
// DiagnosisEventStream — closed flag lifecycle
// ====================================================================

describe('DiagnosisEventStream — closed lifecycle', () => {
  it('starts with closed === false', () => {
    // Given
    const { res } = mockResponse();
    const stream = new DiagnosisEventStream(res);

    // Then
    expect(stream.closed).toBe(false);
  });

  it('write does not set closed', () => {
    // Given
    const { res } = mockResponse();
    const stream = new DiagnosisEventStream(res);

    // When
    stream.write(makeEvent());

    // Then
    expect(stream.closed).toBe(false);
  });

  it('closed is true after close', () => {
    const { res } = mockResponse();
    const stream = new DiagnosisEventStream(res);
    stream.close(makeResult());
    expect(stream.closed).toBe(true);
  });

  it('closed is true after error', () => {
    const { res } = mockResponse();
    const stream = new DiagnosisEventStream(res);
    stream.error('X', 'msg');
    expect(stream.closed).toBe(true);
  });

  it('closed is true after interrupt', () => {
    const { res } = mockResponse();
    const stream = new DiagnosisEventStream(res);
    stream.interrupt('id');
    expect(stream.closed).toBe(true);
  });
});

// ====================================================================
// DiagnosisEventStream — SSE format correctness
// ====================================================================

describe('DiagnosisEventStream — SSE format', () => {
  it('each event ends with double newline', () => {
    // Given
    const { res, chunks } = mockResponse();
    const stream = new DiagnosisEventStream(res);

    // When: 写入多个不同类型事件
    stream.write(makeEvent({ type: 'phase_started', phase: 0 }));
    stream.write(makeEvent({ type: 'evidence_collected', evidenceCount: 5 } as any));
    stream.write(makeEvent({ type: 'hypothesis_generated', hypothesisCount: 3 } as any));

    // Then: 每个都以 \n\n 结尾
    for (const chunk of chunks) {
      expect(chunk.endsWith('\n\n')).toBe(true);
      expect(chunk.startsWith('data: ')).toBe(true);
    }
  });

  it('complete event follows SSE data: prefix', () => {
    const { res, chunks } = mockResponse();
    const stream = new DiagnosisEventStream(res);

    stream.close(makeResult({ teamId: 'sse-test' }));

    expect(chunks[0].startsWith('data: ')).toBe(true);
    expect(chunks[0].endsWith('\n\n')).toBe(true);
  });
});
