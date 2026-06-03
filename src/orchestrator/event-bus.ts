/**
 * orchestrator/event-bus.ts — 事件总线 (Iter 1)
 *
 * Event Sourcing: 所有状态变更经由事件。
 * - emit: 写入 EventStore (持久化) + 通知订阅者
 * - on/once: 订阅/一次性订阅
 * - waitFor: 等待特定事件 (用于测试/同步场景)
 * - replay: 崩溃恢复 (从 EventStore 重放)
 */
import type { OrchestrationEvent, EventFilter } from './types';
import { EventStore } from './event-store';
import { createLogger } from '../logger';

const log = createLogger('orchestrator/event-bus');

type EventHandler = (event: OrchestrationEvent) => void;

export class EventBus {
  private store: EventStore;
  private subscribers = new Map<string, Set<EventHandler>>();
  private onceSubscribers = new Map<string, Set<EventHandler>>();

  constructor(store: EventStore) {
    this.store = store;
  }

  /** Emit an event — persists to EventStore + notifies subscribers */
  emit(event: OrchestrationEvent): void {
    // 1. Persist (Event Sourcing — append-only)
    this.store.append(event);
    log.debug({ type: event.type, consultationId: event.consultationId }, '事件已发射');

    // 2. Notify regular subscribers
    const handlers = this.subscribers.get(event.type);
    if (handlers) {
      for (const handler of handlers) handler(event);
    }

    // 3. Notify once subscribers (then remove)
    const onceHandlers = this.onceSubscribers.get(event.type);
    if (onceHandlers) {
      for (const handler of onceHandlers) handler(event);
      this.onceSubscribers.delete(event.type);
    }

    // 4. Notify wildcard subscribers ('*' matches all events)
    const wildcardHandlers = this.subscribers.get('*');
    if (wildcardHandlers) {
      for (const handler of wildcardHandlers) handler(event);
    }
  }

  /** Subscribe to events of a specific type. Returns unsubscribe function. */
  on(type: string, handler: EventHandler): () => void {
    if (!this.subscribers.has(type)) this.subscribers.set(type, new Set());
    this.subscribers.get(type)!.add(handler);
    return () => this.subscribers.get(type)?.delete(handler);
  }

  /** One-time subscription. Handler is called once then removed. */
  once(type: string, handler: EventHandler): void {
    if (!this.onceSubscribers.has(type)) this.onceSubscribers.set(type, new Set());
    this.onceSubscribers.get(type)!.add(handler);
  }

  /** Wait for a specific event type (with timeout). Returns null if timeout. */
  waitFor(type: string, timeoutMs: number): Promise<OrchestrationEvent | null> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), timeoutMs);
      this.once(type, (event) => {
        clearTimeout(timer);
        resolve(event);
      });
    });
  }

  /** Query historical events */
  query(filter: EventFilter): OrchestrationEvent[] {
    return this.store.query(filter);
  }

  /** Replay all events for crash recovery */
  replay(consultationId: string): OrchestrationEvent[] {
    return this.store.replay(consultationId);
  }
}
