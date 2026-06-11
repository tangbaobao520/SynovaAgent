/**
 * l1-interaction/tui-adapter-v2.ts — TUI ViewAdapter 实现 (ink 版本)
 */
import type { ViewAdapter } from './types';
import type { EventBus } from '../orchestrator/event-bus';
import type { OrchestrationEvent } from '../orchestrator/types';
import type { TuiState } from '../tui-v2/types';
import { createLogger } from '../logger';

const log = createLogger('l1-interaction/tui-adapter-v2');

export class TuiViewAdapter implements ViewAdapter {
  private setState: (updater: (prev: TuiState) => TuiState) => void;
  private eventBus: EventBus;
  private unsubscribers: (() => void)[] = [];
  private currentStreamingText = '';

  constructor(
    setState: (updater: (prev: TuiState) => TuiState) => void,
    eventBus: EventBus,
  ) {
    this.setState = setState;
    this.eventBus = eventBus;
    this.subscribeToEvents();
  }

  showAgentMessage(text: string): void {
    this.setState(prev => ({ ...prev, messages: [...prev.messages, { role: 'agent', text, streaming: false }], isStreaming: false }));
    this.currentStreamingText = '';
  }

  showUserMessage(text: string): void {
    this.setState(prev => ({ ...prev, messages: [...prev.messages, { role: 'user', text }] }));
  }

  appendToken(token: string): void {
    this.currentStreamingText += token;
    this.setState(prev => {
      const messages = [...prev.messages];
      const lastIdx = messages.length - 1;
      const last = messages[lastIdx];
      if (last && last.role === 'agent' && last.streaming) {
        messages[lastIdx] = { ...last, text: this.currentStreamingText };
      } else {
        messages.push({ role: 'agent', text: this.currentStreamingText, streaming: true });
      }
      return { ...prev, messages, isStreaming: true };
    });
  }

  showSystemMessage(text: string): void {
    this.setState(prev => ({ ...prev, messages: [...prev.messages, { role: 'system', text }] }));
  }

  showError(text: string): void {
    this.setState(prev => ({ ...prev, messages: [...prev.messages, { role: 'alert', text }] }));
  }

  setStatus(text: string): void {
    this.setState(prev => ({ ...prev, status: text }));
  }

  render(): void {}

  private subscribeToEvents(): void {
    this.unsubscribers.push(
      this.eventBus.on('expert.status_changed', (event: OrchestrationEvent) => {
        const data = event.data as { name: string; status: string; elapsed?: string };
        this.setState(prev => {
          const exists = prev.experts.find(e => e.name === data.name);
          const status = data.status as 'done' | 'running' | 'queued' | 'failed';
          const experts = exists
            ? prev.experts.map(e => e.name === data.name ? { ...e, status, elapsed: data.elapsed } : e)
            : [...prev.experts, { name: data.name, status, elapsed: data.elapsed }];
          return { ...prev, experts };
        });
      })
    );
    this.unsubscribers.push(
      this.eventBus.on('expert.completed', (event: OrchestrationEvent) => {
        const data = event.data as { name: string; result?: string };
        this.setState(prev => ({
          ...prev,
          experts: prev.experts.map(e => e.name === data.name ? { ...e, status: 'done' as const, result: data.result } : e),
        }));
      })
    );
    this.unsubscribers.push(
      this.eventBus.on('phase.started', (event: OrchestrationEvent) => {
        this.setState(prev => ({ ...prev, phase: event.data.phase as number }));
      })
    );
    this.unsubscribers.push(
      this.eventBus.on('phase.completed', (event: OrchestrationEvent) => {
        this.setState(prev => ({ ...prev, phase: event.data.phase as number }));
      })
    );
  }

  dispose(): void {
    for (const unsub of this.unsubscribers) unsub();
    this.unsubscribers = [];
  }
}
