/**
 * tests/services/stuck-session-detector.test.ts — Phase 2.2 卡住会话检测测试
 *
 * 铁律 33: *.test.ts 单元测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@synova/logger', () => {
  const m = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), fatal: vi.fn() };
  return { logger: m, createLogger: vi.fn(() => m) };
});

// Mock SessionStore
function createMockSessionStore(opts?: { activeSessions?: number; oldestMsgMinutes?: number }) {
  const minutes = opts?.oldestMsgMinutes ?? 1;
  const now = new Date();
  const oldTime = new Date(now.getTime() - minutes * 60_000).toISOString();

  return {
    listSessions: vi.fn(() => {
      const sessions: any[] = [];
      for (let i = 0; i < (opts?.activeSessions ?? 0); i++) {
        sessions.push({
          id: `sess_${String(i).padStart(3, '0')}`,
          orgId: 'org1',
          phase: 2,
          stateJson: JSON.stringify({ status: 'active' }),
          createdAt: oldTime,
          updatedAt: minutes > 5 ? oldTime : new Date().toISOString(),
        });
      }
      return sessions;
    }),
    addMessage: vi.fn(),
    saveState: vi.fn(),
  };
}

function createMockMemoryStore() {
  return {
    remember: vi.fn(),
  };
}

import { StuckSessionDetector } from '../../src/services/stuck-session-detector';
import { logger } from '@synova/logger';

describe('StuckSessionDetector — detect', () => {
  it('无活跃会话时返回空数组', async () => {
    const sessionStore = createMockSessionStore({ activeSessions: 0 });
    const memoryStore = createMockMemoryStore();
    const detector = new StuckSessionDetector(sessionStore as any, memoryStore as any);

    const result = await detector.detect();

    expect(result).toHaveLength(0);
  });

  it('会话最后更新在 5 分钟内不应判为卡住', async () => {
    const sessionStore = createMockSessionStore({ activeSessions: 2, oldestMsgMinutes: 2 });
    const memoryStore = createMockMemoryStore();
    const detector = new StuckSessionDetector(sessionStore as any, memoryStore as any);

    const result = await detector.detect();

    expect(result).toHaveLength(0);
  });

  it('会话超过 5 分钟无更新应判为卡住', async () => {
    const sessionStore = createMockSessionStore({ activeSessions: 1, oldestMsgMinutes: 10 });
    const memoryStore = createMockMemoryStore();
    const detector = new StuckSessionDetector(sessionStore as any, memoryStore as any);

    const result = await detector.detect();

    expect(result).toHaveLength(1);
    expect(result[0].sessionId).toBe('sess_000');
  });

  it('卡住会话应写入 AgentMemoryStore', async () => {
    const sessionStore = createMockSessionStore({ activeSessions: 1, oldestMsgMinutes: 10 });
    const memoryStore = createMockMemoryStore();
    const detector = new StuckSessionDetector(sessionStore as any, memoryStore as any);

    await detector.detect();

    expect(memoryStore.remember).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'stuck_session' }),
    );
  });

  it('卡住会话应注入系统消息通知用户', async () => {
    const sessionStore = createMockSessionStore({ activeSessions: 1, oldestMsgMinutes: 10 });
    const memoryStore = createMockMemoryStore();
    const detector = new StuckSessionDetector(sessionStore as any, memoryStore as any);

    await detector.detect();

    expect(sessionStore.addMessage).toHaveBeenCalledWith(
      'sess_000',
      'system',
      expect.stringContaining('超时'),
    );
  });

  it('sessionStore.listSessions 抛异常应降级', async () => {
    const sessionStore = createMockSessionStore();
    sessionStore.listSessions = vi.fn(() => { throw new Error('DB error'); });
    const memoryStore = createMockMemoryStore();
    const detector = new StuckSessionDetector(sessionStore as any, memoryStore as any);

    const result = await detector.detect();

    expect(result).toHaveLength(0);
    expect(logger.warn).toHaveBeenCalled();
  });
});
