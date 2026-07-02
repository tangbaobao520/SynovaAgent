/**
 * tests/services/restart-recovery.test.ts — Phase 1.1 启动恢复测试
 *
 * 测试 RestartRecovery.recoverInterruptedSessions() 的决策逻辑：
 *   - 查询 SessionStore 中有 state_json 的会话
 *   - 根据用户输入判断可恢复性
 *   - 注入系统消息或标记失败
 *
 * 铁律 0-2: spec → test → impl → wire → review → merge
 * 铁律 33: *.test.ts 单元测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@synova/logger', () => {
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
  };
  return {
    logger: mockLogger,
    createLogger: vi.fn(() => mockLogger),
  };
});

// ═══ Mock SessionStore 工厂 ═══

interface MockSession {
  id: string;
  orgId: string;
  phase: number;
  stateJson: string | null;
  createdAt: string;
  updatedAt: string;
  messages?: Array<{ role: string; content: string }>;
}

interface MockStore {
  listSessions: ReturnType<typeof vi.fn>;
  getMessages: ReturnType<typeof vi.fn>;
  saveState: ReturnType<typeof vi.fn>;
  addMessage: ReturnType<typeof vi.fn>;
}

function createMockSessionStore(opts?: {
  sessions?: MockSession[];
}): MockStore {
  const sessions = opts?.sessions || [];

  return {
    listSessions: vi.fn().mockReturnValue(sessions),
    getMessages: vi.fn().mockImplementation((sessionId: string) => {
      const session = sessions.find(s => s.id === sessionId);
      return session?.messages || [];
    }),
    saveState: vi.fn(),
    addMessage: vi.fn(),
  };
}

import { RestartRecovery } from '../../src/services/restart-recovery';
import { logger } from '@synova/logger';

describe('RestartRecovery — 无中断会话', () => {
  it('无会话时返回零恢复', async () => {
    const store = createMockSessionStore({ sessions: [] });
    const recovery = new RestartRecovery(store as any);

    const result = await recovery.recoverInterruptedSessions();

    expect(result.recovered).toBe(0);
    expect(result.failed).toBe(0);
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('无可恢复'),
    );
  });

  it('所有会话无 state_json 时跳过', async () => {
    const sessions: MockSession[] = [
      { id: 'sess_001', orgId: 'org1', phase: 0, stateJson: null, createdAt: '', updatedAt: '' },
    ];
    const store = createMockSessionStore({ sessions });
    const recovery = new RestartRecovery(store as any);

    const result = await recovery.recoverInterruptedSessions();

    expect(result.recovered).toBe(0);
    expect(result.failed).toBe(0);
  });
});

describe('RestartRecovery — 可恢复会话', () => {
  it('有用户输入的会话应标记为可恢复', async () => {
    const sessions: MockSession[] = [{
      id: 'sess_001', orgId: 'org1', phase: 2,
      stateJson: JSON.stringify({ phase: 2 }),
      createdAt: '', updatedAt: '',
      messages: [
        { role: 'user', content: '我们公司的增长瓶颈在哪？' },
        { role: 'assistant', content: '让我分析一下...' },
      ],
    }];
    const store = createMockSessionStore({ sessions });
    const recovery = new RestartRecovery(store as any);

    const result = await recovery.recoverInterruptedSessions();

    expect(result.recovered).toBe(1);
    expect(result.failed).toBe(0);
    // 应注入恢复消息 (pino: info(obj, msg) 双参数)
    expect(store.addMessage).toHaveBeenCalledWith(
      'sess_001',
      'system',
      expect.stringContaining('服务已恢复'),
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ recovered: 1 }),
      expect.stringContaining('恢复'),
    );
  });

  it('多个可恢复会话应全部恢复', async () => {
    const sessions: MockSession[] = [
      { id: 'sess_001', orgId: 'org1', phase: 1, stateJson: '{}', createdAt: '', updatedAt: '',
        messages: [{ role: 'user', content: '你好' }] },
      { id: 'sess_002', orgId: 'org2', phase: 2, stateJson: '{}', createdAt: '', updatedAt: '',
        messages: [{ role: 'user', content: '分析一下' }] },
    ];
    const store = createMockSessionStore({ sessions });
    const recovery = new RestartRecovery(store as any);

    const result = await recovery.recoverInterruptedSessions();

    expect(result.recovered).toBe(2);
    expect(result.failed).toBe(0);
    expect(store.addMessage).toHaveBeenCalledTimes(2);
  });
});

describe('RestartRecovery — 不可恢复会话', () => {
  it('只有 assistant 消息的会话应标记为失败', async () => {
    const sessions: MockSession[] = [{
      id: 'sess_001', orgId: 'org1', phase: 1,
      stateJson: JSON.stringify({ phase: 1 }),
      createdAt: '', updatedAt: '',
      messages: [
        { role: 'assistant', content: '请描述您的问题...' },
      ],
    }];
    const store = createMockSessionStore({ sessions });
    const recovery = new RestartRecovery(store as any);

    const result = await recovery.recoverInterruptedSessions();

    expect(result.recovered).toBe(0);
    expect(result.failed).toBe(1);
    // 应保存 failed 状态
    expect(store.saveState).toHaveBeenCalledWith(
      'sess_001',
      expect.objectContaining({ status: 'failed' }),
    );
  });

  it('空消息会话应标记为失败', async () => {
    const sessions: MockSession[] = [{
      id: 'sess_001', orgId: 'org1', phase: 0,
      stateJson: '{}', createdAt: '', updatedAt: '',
      messages: [],
    }];
    const store = createMockSessionStore({ sessions });
    const recovery = new RestartRecovery(store as any);

    const result = await recovery.recoverInterruptedSessions();

    expect(result.recovered).toBe(0);
    expect(result.failed).toBe(1);
  });
});

describe('RestartRecovery — 错误处理', () => {
  it('SessionStore.listSessions 抛异常应降级', async () => {
    const store = createMockSessionStore();
    store.listSessions = vi.fn(() => { throw new Error('DB connection lost'); });
    const recovery = new RestartRecovery(store as any);

    const result = await recovery.recoverInterruptedSessions();

    expect(result.recovered).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.degraded).toBe(true);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('单个会话恢复失败不应影响其他会话', async () => {
    const sessions: MockSession[] = [
      { id: 'sess_001', orgId: 'org1', phase: 1, stateJson: '{}', createdAt: '', updatedAt: '',
        messages: [{ role: 'user', content: '你好' }] },
      { id: 'sess_002', orgId: 'org2', phase: 1, stateJson: '{}', createdAt: '', updatedAt: '',
        messages: [{ role: 'user', content: '分析数据' }] },
    ];
    const store = createMockSessionStore({ sessions });
    // sess_002 的消息获取会抛异常
    store.getMessages = vi.fn().mockImplementation((id: string) => {
      if (id === 'sess_002') throw new Error('getMessages failed');
      return sessions.find(s => s.id === id)?.messages || [];
    }) as any;
    const recovery = new RestartRecovery(store as any);

    const result = await recovery.recoverInterruptedSessions();

    // sess_001 应恢复成功
    expect(result.recovered).toBe(1);
    expect(result.failed).toBe(0);
    // 整体 degraded
    expect(result.degraded).toBe(true);
  });
});
