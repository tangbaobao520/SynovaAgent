/**
 * tui-v2/hooks/use-event-bus.ts — EventBus 订阅 Hook
 *
 * 订阅 orchestrator EventBus 事件，更新 TUI 状态。
 * 数据流: EventBus → Hook → Component → ink 渲染
 */

import { useState, useEffect } from 'react';
import type { EventBus } from '../../orchestrator/event-bus';
import type { OrchestrationEvent } from '../../orchestrator/types';
import type { ExpertStatus, GoalData, ObstacleItem, LegacyIssue } from '../types';

interface EventBusState {
  experts: ExpertStatus[];
  goals: GoalData[];
  obstacles: ObstacleItem[];
  legacyIssues: LegacyIssue[];
  phase: number;
}

export function useEventBus(eventBus: EventBus): EventBusState {
  const [state, setState] = useState<EventBusState>({
    experts: [],
    goals: [],
    obstacles: [],
    legacyIssues: [],
    phase: 0,
  });

  useEffect(() => {
    // 订阅专家状态变化
    const unsub1 = eventBus.on('expert.status_changed', (event: OrchestrationEvent) => {
      setState(prev => ({
        ...prev,
        experts: updateExperts(prev.experts, event.data),
      }));
    });

    // 订阅专家完成
    const unsub2 = eventBus.on('expert.completed', (event: OrchestrationEvent) => {
      setState(prev => ({
        ...prev,
        experts: updateExpertCompleted(prev.experts, event.data),
      }));
    });

    // 订阅阶段变化
    const unsub3 = eventBus.on('phase.started', (event: OrchestrationEvent) => {
      setState(prev => ({ ...prev, phase: (event.data as { phase: number }).phase }));
    });

    const unsub4 = eventBus.on('phase.completed', (event: OrchestrationEvent) => {
      setState(prev => ({ ...prev, phase: (event.data as { phase: number }).phase }));
    });

    // 订阅目标更新
    const unsub5 = eventBus.on('goal.updated', (event: OrchestrationEvent) => {
      setState(prev => ({
        ...prev,
        goals: updateGoals(prev.goals, event.data),
      }));
    });

    // 订阅障碍发现
    const unsub6 = eventBus.on('obstacle.found', (event: OrchestrationEvent) => {
      setState(prev => ({
        ...prev,
        obstacles: [...prev.obstacles, event.data as unknown as ObstacleItem],
      }));
    });

    // 订阅障碍解决
    const unsub7 = eventBus.on('obstacle.resolved', (event: OrchestrationEvent) => {
      setState(prev => ({
        ...prev,
        obstacles: prev.obstacles.map(o =>
          o.name === event.data.name ? { ...o, status: 'resolved' as const } : o
        ),
      }));
    });

    // 订阅遗留问题
    const unsub8 = eventBus.on('issue.found', (event: OrchestrationEvent) => {
      setState(prev => ({
        ...prev,
        legacyIssues: [...prev.legacyIssues, event.data as unknown as LegacyIssue],
      }));
    });

    return () => {
      unsub1();
      unsub2();
      unsub3();
      unsub4();
      unsub5();
      unsub6();
      unsub7();
      unsub8();
    };
  }, [eventBus]);

  return state;
}

// ── 辅助函数 ──

function updateExperts(experts: ExpertStatus[], data: unknown): ExpertStatus[] {
  const update = data as { name: string; status: string; elapsed?: string };
  const exists = experts.find(e => e.name === update.name);
  if (exists) {
    return experts.map(e =>
      e.name === update.name
        ? { ...e, status: update.status as ExpertStatus['status'], elapsed: update.elapsed }
        : e
    );
  }
  return [...experts, { name: update.name, status: update.status as ExpertStatus['status'], elapsed: update.elapsed }];
}

function updateExpertCompleted(experts: ExpertStatus[], data: unknown): ExpertStatus[] {
  const update = data as { name: string; result?: string };
  return experts.map(e =>
    e.name === update.name
      ? { ...e, status: 'done' as const, result: update.result }
      : e
  );
}

function updateGoals(goals: GoalData[], data: unknown): GoalData[] {
  const update = data as GoalData;
  const exists = goals.find(g => g.id === update.id);
  if (exists) {
    return goals.map(g => g.id === update.id ? { ...g, ...update } : g);
  }
  return [...goals, update];
}
