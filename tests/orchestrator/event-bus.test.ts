/**
 * orchestrator/event-bus.test.ts — Iter 1: EventBus + EventStore 测试
 *
 * 对标 Claw-Code: Given/When/Then + 手写 test data
 * 铁律 0-2: 每个 public 函数 >= 2 用例
 */
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { EventStore } from '../../src/orchestrator/event-store';
import { EventBus } from '../../src/orchestrator/event-bus';
import type { OrchestrationEvent } from '../../src/orchestrator/types';

function makeEvent(overrides: Partial<OrchestrationEvent> = {}): OrchestrationEvent {
  return {
    id: `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    type: 'phase.started',
    consultationId: 'consult-1',
    phase: 0,
    data: { label: '测试事件' },
    traceId: 'abcdef1234567890abcdef1234567890',
    spanId: '1234567890abcdef',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe('EventStore', () => {
  let db: Database.Database;
  let store: EventStore;

  beforeEach(() => {
    db = new Database(':memory:');
    store = new EventStore(db);
  });

  it('Given an event appended, When queried by consultationId, Then returns it', () => {
    const evt = makeEvent();
    store.append(evt);
    const events = store.query({ consultationId: 'consult-1' });
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('phase.started');
  });

  it('Given multiple events, When queried, Then ordered by timestamp', () => {
    store.append(makeEvent({ id: 'e1', timestamp: '2026-01-01T00:00:01Z', phase: 0 }));
    store.append(makeEvent({ id: 'e2', timestamp: '2026-01-01T00:00:02Z', phase: 1 }));
    const events = store.query({ consultationId: 'consult-1' });
    expect(events[0].id).toBe('e1');
    expect(events[1].id).toBe('e2');
  });

  it('Given events from different consultations, When queried by consultationId, Then only matching returned', () => {
    store.append(makeEvent({ consultationId: 'c1' }));
    store.append(makeEvent({ consultationId: 'c2' }));
    expect(store.query({ consultationId: 'c1' })).toHaveLength(1);
  });

  it('Given no events, When queried, Then returns empty', () => {
    expect(store.query({})).toHaveLength(0);
  });

  it('Given events, When queried by type, Then filters correctly', () => {
    store.append(makeEvent({ type: 'phase.started', phase: 0 }));
    store.append(makeEvent({ type: 'evidence.collected', phase: 0 }));
    expect(store.query({ type: 'evidence.collected' })).toHaveLength(1);
  });
});

describe('EventBus', () => {
  let db: Database.Database;
  let store: EventStore;
  let bus: EventBus;

  beforeEach(() => {
    db = new Database(':memory:');
    store = new EventStore(db);
    bus = new EventBus(store);
  });

  it('Given event emitted, When subscriber registered, Then receives event', async () => {
    const received: OrchestrationEvent[] = [];
    bus.on('phase.started', (e) => received.push(e));

    const evt = makeEvent({ type: 'phase.started' });
    bus.emit(evt);

    expect(received).toHaveLength(1);
    expect(received[0].type).toBe('phase.started');
  });

  it('Given event emitted, When no subscriber for that type, Then no error', () => {
    const evt = makeEvent({ type: 'unknown.event' });
    expect(() => bus.emit(evt)).not.toThrow();
  });

  it('Given once subscription, When event emitted twice, Then only triggers once', () => {
    const received: string[] = [];
    bus.once('phase.started', (e) => received.push(e.id));

    bus.emit(makeEvent({ id: 'e1', type: 'phase.started' }));
    bus.emit(makeEvent({ id: 'e2', type: 'phase.started' }));

    expect(received).toHaveLength(1);
    expect(received[0]).toBe('e1');
  });

  it('Given subscriber unsubscribed, When event emitted, Then not called', () => {
    const received: string[] = [];
    const unsub = bus.on('test.event', (e) => received.push(e.id));
    unsub();
    bus.emit(makeEvent({ type: 'test.event' }));
    expect(received).toHaveLength(0);
  });

  it('Given waitFor, When matching event emitted, Then resolves with event', async () => {
    const promise = bus.waitFor('evidence.collected', 1000);
    const evt = makeEvent({ type: 'evidence.collected' });
    bus.emit(evt);

    const result = await promise;
    expect(result).toBeDefined();
    expect(result!.type).toBe('evidence.collected');
  });

  it('Given waitFor with timeout, When no matching event, Then resolves null', async () => {
    const promise = bus.waitFor('never.happens', 50);
    const result = await promise;
    expect(result).toBeNull();
  });

  // ═══ Event Sourcing: Crash Recovery ═══

  it('Given events written to EventStore, When replay called, Then returns all events in order', () => {
    bus.emit(makeEvent({ id: 'e1', type: 'phase.started', phase: 0, timestamp: '2026-01-01T00:00:01Z' }));
    bus.emit(makeEvent({ id: 'e2', type: 'phase.started', phase: 1, timestamp: '2026-01-01T00:00:02Z' }));
    bus.emit(makeEvent({ id: 'e3', type: 'phase.completed', phase: 0, timestamp: '2026-01-01T00:00:03Z' }));

    const replayed = bus.replay('consult-1');
    expect(replayed).toHaveLength(3);
    expect(replayed[0].id).toBe('e1');
    expect(replayed[2].id).toBe('e3');
  });
});
