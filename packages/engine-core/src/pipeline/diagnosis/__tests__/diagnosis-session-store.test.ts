/**
 * diagnosis-session-store.test.ts — B2 会话持久化测试 (对标 Claw-Code)
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  initSessionStore,
  createSession,
  appendMessage,
  loadSessionMessages,
  searchSessions,
  compactSession,
  type SessionMessage,
} from '../diagnosis-session-store';

const tmpDir = path.join(os.tmpdir(), `synova-session-test-${Date.now()}`);

beforeAll(() => {
  fs.mkdirSync(tmpDir, { recursive: true });
  initSessionStore(tmpDir);
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('createSession', () => {
  it('creates session with unique ID and JSONL bootstrap', () => {
    const s = createSession('org-1', 'team-1');
    expect(s.sessionId).toMatch(/^diag_/);
    expect(s.status).toBe('active');
    expect(s.messageCount).toBe(0);

    const file = path.join(tmpDir, 'sessions', 'org-1', `${s.sessionId}.jsonl`);
    expect(fs.existsSync(file)).toBe(true);
    const content = fs.readFileSync(file, 'utf-8');
    expect(content).toContain('session_meta');
  });
});

describe('appendMessage', () => {
  it('appends message to JSONL file', () => {
    const s = createSession('org-1', 'team-1');
    appendMessage(s.sessionId, 'org-1', { role: 'user', content: '诊断范围确认', phase: 0 });
    appendMessage(s.sessionId, 'org-1', { role: 'assistant', content: '证据采集完成', phase: 1 });

    const messages = loadSessionMessages('org-1', s.sessionId);
    expect(messages.length).toBeGreaterThanOrEqual(1);
    expect(messages.some(m => m.role === 'user')).toBe(true);
  });

  it('redacts API keys before persistence (对标 Claw-Code)', () => {
    const s = createSession('org-1', 'team-1');
    appendMessage(s.sessionId, 'org-1', { role: 'user', content: 'my token is sk-12345678901234567890xxx' });

    const messages = loadSessionMessages('org-1', s.sessionId);
    const content = messages[0]?.content || '';
    // The sk- prefix + 20+ chars should be redacted
    expect(content).toContain('[REDACTED]');
  });

  it('truncates long content to 16KB (对标 Claw-Code)', () => {
    const s = createSession('org-1', 'team-1');
    const longText = 'x'.repeat(20_000);
    appendMessage(s.sessionId, 'org-1', { role: 'user', content: longText });

    const messages = loadSessionMessages('org-1', s.sessionId);
    expect(messages[0]?.content.length).toBeLessThanOrEqual(17_000); // 16KB + truncation marker
  });

  it('tracks token estimation', () => {
    const s = createSession('org-1', 'team-1');
    appendMessage(s.sessionId, 'org-1', { role: 'user', content: 'hello world' });
    const messages = loadSessionMessages('org-1', s.sessionId);
    expect(messages[0]?.tokens).toBeGreaterThan(0);
  });
});

describe('loadSessionMessages', () => {
  it('returns empty for non-existent session', () => {
    expect(loadSessionMessages('unknown', 'nonexistent')).toHaveLength(0);
  });

  it('skips corrupted JSONL lines', () => {
    const s = createSession('org-1', 'team-1');
    appendMessage(s.sessionId, 'org-1', { role: 'user', content: 'valid' });

    // Manually corrupt the file
    const file = path.join(tmpDir, 'sessions', 'org-1', `${s.sessionId}.jsonl`);
    fs.appendFileSync(file, 'this is not valid json\n', 'utf-8');

    const messages = loadSessionMessages('org-1', s.sessionId);
    // Should still load the valid message, skip corrupted line
    expect(messages.length).toBeGreaterThanOrEqual(1);
  });
});

describe('compactSession', () => {
  it('creates child session with compaction summary', () => {
    const parent = createSession('org-1', 'team-1');
    appendMessage(parent.sessionId, 'org-1', { role: 'user', content: 'msg1', phase: 0 });
    appendMessage(parent.sessionId, 'org-1', { role: 'user', content: 'msg2', phase: 1 });

    const childId = compactSession('org-1', parent.sessionId, '压缩摘要: 2条消息');
    expect(childId).toMatch(/^diag_/);
    expect(childId).not.toBe(parent.sessionId);

    const childMessages = loadSessionMessages('org-1', childId);
    expect(childMessages.length).toBeGreaterThan(0);
    expect(childMessages[0].content).toContain('压缩摘要');
  });
});
