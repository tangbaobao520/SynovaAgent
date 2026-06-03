/**
 * session-transcript.test.ts — JSONL 会话转录单元测试
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SessionTranscriptor } from '../session-transcript';
import type { DiagnosisEvent } from '../types';

const TEST_DIR = path.join(os.tmpdir(), 'synova-test-sessions-' + Date.now());

function makeEvent(overrides: Partial<DiagnosisEvent> = {}): DiagnosisEvent {
  return {
    type: 'phase_started',
    phase: 0,
    timestamp: new Date().toISOString(),
    ...overrides,
  } as DiagnosisEvent;
}

beforeEach(() => {
  // Clean test directory before each test
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
});

afterAll(() => {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
});

// ====================================================================
// SessionTranscriptor — append
// ====================================================================

describe('SessionTranscriptor — append', () => {
  it('creates the sessions directory on construction', () => {
    new SessionTranscriptor('test-session', TEST_DIR);
    expect(fs.existsSync(TEST_DIR)).toBe(true);
  });

  it('appends one event and the file exists', () => {
    const t = new SessionTranscriptor('append-1', TEST_DIR);
    t.append(makeEvent({ phase: 0 }));
    expect(t.exists()).toBe(true);
    expect(t.count()).toBe(1);
  });

  it('appendAll writes multiple events', () => {
    const t = new SessionTranscriptor('append-all', TEST_DIR);
    t.appendAll([
      makeEvent({ phase: 0 }),
      makeEvent({ phase: 1 }),
      makeEvent({ phase: 2 }),
    ]);
    expect(t.count()).toBe(3);
  });

  it('each event is written as one JSON line', () => {
    const t = new SessionTranscriptor('jsonl-test', TEST_DIR);
    t.append(makeEvent({ phase: 0 }));
    t.append(makeEvent({ phase: 1 }));

    const content = fs.readFileSync(t.filePath_, 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines.length).toBe(2);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });
});

// ====================================================================
// SessionTranscriptor — reply
// ====================================================================

describe('SessionTranscriptor — replay', () => {
  it('replays all events in order', () => {
    const t = new SessionTranscriptor('replay-seq', TEST_DIR);
    t.append(makeEvent({ phase: 0 }));
    t.append(makeEvent({ phase: 1 }));
    t.append(makeEvent({ phase: 2 }));

    const events = t.replay();
    expect(events.length).toBe(3);
    expect(events[0].type).toBe('phase_started');
    expect(events[1].type).toBe('phase_started');
    expect(events[2].type).toBe('phase_started');
  });

  it('returns empty array for nonexistent file', () => {
    const t = new SessionTranscriptor('nonexistent', TEST_DIR);
    expect(t.replay()).toEqual([]);
  });

  it('replayN returns first N events', () => {
    const t = new SessionTranscriptor('replay-n', TEST_DIR);
    t.appendAll([makeEvent({ phase: 0 }), makeEvent({ phase: 1 }), makeEvent({ phase: 2 })]);
    expect(t.replayN(2).length).toBe(2);
  });

  it('replayN with N > total returns all events', () => {
    const t = new SessionTranscriptor('replay-over', TEST_DIR);
    t.append(makeEvent({ phase: 0 }));
    expect(t.replayN(10).length).toBe(1);
  });
});

// ====================================================================
// SessionTranscriptor — fork
// ====================================================================

describe('SessionTranscriptor — fork', () => {
  it('creates a child transcriptor with a different sessionId', () => {
    const parent = new SessionTranscriptor('parent', TEST_DIR);
    const child = parent.fork('child-1');

    expect(child.sessionId_).toBe('child-1');
    expect(child.filePath_).toContain('child-1.jsonl');
  });

  it('writes a session_forked event in parent', () => {
    const parent = new SessionTranscriptor('parent-fork', TEST_DIR);
    parent.append(makeEvent({ phase: 0 }));
    parent.fork('child-2');

    const events = parent.replay();
    expect(events.length).toBe(2);
    expect(events[1].type).toBe('session_forked');
  });

  it('child is a separate file from parent', () => {
    const parent = new SessionTranscriptor('parent-sep', TEST_DIR);
    const child = parent.fork('child-sep');

    child.append(makeEvent({ phase: 3 }));
    expect(parent.count()).toBe(1); // only fork event
    expect(child.count()).toBe(1);
  });
});

// ====================================================================
// SessionTranscriptor — count & management
// ====================================================================

describe('SessionTranscriptor — count & management', () => {
  it('count returns 0 for nonexistent file', () => {
    const t = new SessionTranscriptor('no-file', TEST_DIR);
    expect(t.count()).toBe(0);
  });

  it('count returns correct count after appends', () => {
    const t = new SessionTranscriptor('count-test', TEST_DIR);
    t.appendAll(Array.from({ length: 5 }, (_, i) => makeEvent({ phase: i })));
    expect(t.count()).toBe(5);
  });

  it('delete removes the file and returns true', () => {
    const t = new SessionTranscriptor('delete-me', TEST_DIR);
    t.append(makeEvent({ phase: 0 }));
    expect(t.exists()).toBe(true);

    const deleted = t.delete();
    expect(deleted).toBe(true);
    expect(t.exists()).toBe(false);
  });

  it('delete returns false for nonexistent file', () => {
    const t = new SessionTranscriptor('no-delete', TEST_DIR);
    expect(t.delete()).toBe(false);
  });

  it('sessionId_ and filePath_ return correct values', () => {
    const t = new SessionTranscriptor('my-id', '/custom/dir');
    expect(t.sessionId_).toBe('my-id');
    expect(t.filePath_).toContain('my-id.jsonl');
  });
});
