/**
 * tests/services/escalation-engine.test.ts — 升级链引擎单元测试 (Phase G3)
 *
 * 测试: 规则加载 / critical 忽略天数升级 / warning 累计忽略升级 /
 *       数据改善自动停止 / 跨组织隔离 / 多级升级
 * 铁律 33: *.test.ts (纯函数，依赖注入 mock)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EscalationEngine } from '../../src/services/escalation-engine';
import type { EscalationRule } from '../../src/services/escalation-engine';

// ═══ Mock Data ═══

const defaultRules: EscalationRule[] = [
  {
    severity: 'critical',
    ignoreDays: 3,
    escalateTo: 'owner',
    channels: ['electron', 'email'],
    description: 'critical 3天 → owner',
  },
  {
    severity: 'warning',
    cumulativeIgnores: 3,
    escalateTo: 'owner',
    channels: ['email'],
    description: 'warning 累计3次 → owner mail',
  },
  {
    severity: 'warning',
    ignoreDays: 7,
    escalateTo: 'department_head',
    channels: ['electron'],
    description: 'warning 7天 → 部门主管',
  },
  {
    severity: 'info',
    cumulativeIgnores: 5,
    escalateTo: 'liaison',
    channels: ['weekly_report'],
    description: 'info 累计5次 → 对接人周报',
  },
];

function makeEngine(opts?: {
  rules?: EscalationRule[];
  storage?: Map<string, unknown>;
}): EscalationEngine {
  return new EscalationEngine({
    rules: opts?.rules ?? defaultRules,
    storage: opts?.storage ?? new Map(),
    now: new Date('2026-07-05T00:00:00Z'),
  });
}

describe('EscalationEngine', () => {
  let engine: EscalationEngine;

  beforeEach(() => {
    engine = makeEngine();
  });

  // ═══ 规则加载 ═══

  describe('规则加载', () => {
    it('构造函数加载规则列表', () => {
      const loaded = engine.getRules();
      expect(loaded.length).toBe(4);
      expect(loaded[0].severity).toBe('critical');
      expect(loaded[0].escalateTo).toBe('owner');
    });

    it('空规则列表不阻塞', () => {
      const e = makeEngine({ rules: [] });
      expect(e.getRules().length).toBe(0);
    });
  });

  // ═══ evaluate: critical ═══

  describe('evaluate — critical', () => {
    it('critical 忽略 0 天 → 不升级', () => {
      const decision = engine.evaluate({
        alertId: 'alert-1',
        sentinelId: 'F1',
        severity: 'critical',
        firstIgnoredAt: new Date('2026-07-05T00:00:00Z'), // same as now → 0 days
        cumulativeIgnores: 1,
        dataImproved: false,
      });
      expect(decision).toBeNull();
    });

    it('critical 忽略 1 天 → 不升级', () => {
      const decision = engine.evaluate({
        alertId: 'alert-2',
        sentinelId: 'F1',
        severity: 'critical',
        firstIgnoredAt: new Date('2026-07-04T00:00:00Z'), // 1 day ago
        cumulativeIgnores: 1,
        dataImproved: false,
      });
      expect(decision).toBeNull();
    });

    it('critical 忽略 3 天 → 升级到 owner', () => {
      const decision = engine.evaluate({
        alertId: 'alert-3',
        sentinelId: 'F1',
        severity: 'critical',
        firstIgnoredAt: new Date('2026-07-02T00:00:00Z'), // 3 days ago
        cumulativeIgnores: 2,
        dataImproved: false,
      });
      expect(decision).not.toBeNull();
      expect(decision!.shouldEscalate).toBe(true);
      expect(decision!.escalateTo).toBe('owner');
      expect(decision!.channels).toContain('electron');
      expect(decision!.channels).toContain('email');
    });

    it('critical 忽略 5 天 → 升级到 owner', () => {
      const decision = engine.evaluate({
        alertId: 'alert-4',
        sentinelId: 'F1',
        severity: 'critical',
        firstIgnoredAt: new Date('2026-06-30T00:00:00Z'), // 5 days ago
        cumulativeIgnores: 1,
        dataImproved: false,
      });
      expect(decision).not.toBeNull();
      expect(decision!.shouldEscalate).toBe(true);
    });

    it('critical 数据已改善 → 不升级', () => {
      const decision = engine.evaluate({
        alertId: 'alert-5',
        sentinelId: 'F1',
        severity: 'critical',
        firstIgnoredAt: new Date('2026-06-20T00:00:00Z'), // 15 days ago
        cumulativeIgnores: 10,
        dataImproved: true, // 数据已改善 → 停止升级
      });
      expect(decision).toBeNull();
    });
  });

  // ═══ evaluate: warning ═══

  describe('evaluate — warning', () => {
    it('warning 累计 1 次忽略 → 不升级', () => {
      const decision = engine.evaluate({
        alertId: 'alert-6',
        sentinelId: 'O3',
        severity: 'warning',
        firstIgnoredAt: new Date('2026-07-02T00:00:00Z'),
        cumulativeIgnores: 1,
        dataImproved: false,
      });
      expect(decision).toBeNull();
    });

    it('warning 累计 3 次忽略 → 升级到 owner（邮件）', () => {
      const decision = engine.evaluate({
        alertId: 'alert-7',
        sentinelId: 'O3',
        severity: 'warning',
        firstIgnoredAt: new Date('2026-07-02T00:00:00Z'),
        cumulativeIgnores: 3,
        dataImproved: false,
      });
      expect(decision).not.toBeNull();
      expect(decision!.shouldEscalate).toBe(true);
      expect(decision!.escalateTo).toBe('owner');
      expect(decision!.channels).toEqual(['email']);
    });

    it('warning 忽略 7 天 → 升级到部门主管', () => {
      const decision = engine.evaluate({
        alertId: 'alert-8',
        sentinelId: 'T1',
        severity: 'warning',
        firstIgnoredAt: new Date('2026-06-28T00:00:00Z'), // 7 days ago
        cumulativeIgnores: 1,
        dataImproved: false,
      });
      expect(decision).not.toBeNull();
      expect(decision!.escalateTo).toBe('department_head');
      expect(decision!.channels).toContain('electron');
    });

    it('warning 累计 2 次 + 忽略 2 天 → 不升级（两项都未达阈值）', () => {
      const decision = engine.evaluate({
        alertId: 'alert-9',
        sentinelId: 'O3',
        severity: 'warning',
        firstIgnoredAt: new Date('2026-07-03T00:00:00Z'), // 2 days
        cumulativeIgnores: 2,
        dataImproved: false,
      });
      expect(decision).toBeNull();
    });
  });

  // ═══ evaluate: info ═══

  describe('evaluate — info', () => {
    it('info 累计 5 次忽略 → 升级到对接人（周报）', () => {
      const decision = engine.evaluate({
        alertId: 'alert-10',
        sentinelId: 'D1',
        severity: 'info',
        firstIgnoredAt: new Date('2026-07-01T00:00:00Z'),
        cumulativeIgnores: 5,
        dataImproved: false,
      });
      expect(decision).not.toBeNull();
      expect(decision!.escalateTo).toBe('liaison');
      expect(decision!.channels).toContain('weekly_report');
    });

    it('info 累计 2 次忽略 → 不升级', () => {
      const decision = engine.evaluate({
        alertId: 'alert-11',
        sentinelId: 'D1',
        severity: 'info',
        firstIgnoredAt: new Date('2026-07-01T00:00:00Z'),
        cumulativeIgnores: 2,
        dataImproved: false,
      });
      expect(decision).toBeNull();
    });
  });

  // ═══ recordIgnore / getEscalationHistory ═══

  describe('recordIgnore → 升级历史', () => {
    it('recordIgnore 记录忽略事件', () => {
      engine.recordIgnore('alert-1', 'org-1', 'liaison');
      const history = engine.getEscalationHistory('org-1');
      expect(history.length).toBe(1);
      expect(history[0].alertId).toBe('alert-1');
      expect(history[0].action).toBe('ignore');
      expect(history[0].actor).toBe('liaison');
    });

    it('cross-org 隔离：org-1 的记录不影响 org-2', () => {
      engine.recordIgnore('alert-1', 'org-1', 'liaison');
      engine.recordIgnore('alert-2', 'org-2', 'owner');
      const h1 = engine.getEscalationHistory('org-1');
      const h2 = engine.getEscalationHistory('org-2');
      expect(h1.length).toBe(1);
      expect(h2.length).toBe(1);
      expect(h1[0].alertId).toBe('alert-1');
      expect(h2[0].alertId).toBe('alert-2');
    });

    it('升级事件也记录到历史', () => {
      const decision = engine.evaluate({
        alertId: 'alert-3',
        sentinelId: 'F1',
        severity: 'critical',
        firstIgnoredAt: new Date('2026-07-02T00:00:00Z'),
        cumulativeIgnores: 2,
        dataImproved: false,
      });
      if (decision?.shouldEscalate) {
        engine.recordEscalation('alert-3', 'org-1', 'liaison', 'owner', '忽略3天');
      }
      const history = engine.getEscalationHistory('org-1');
      const escalationEvents = history.filter(h => h.action === 'escalate');
      expect(escalationEvents.length).toBe(1);
      expect(escalationEvents[0].from).toBe('liaison');
      expect(escalationEvents[0].to).toBe('owner');
    });
  });

  // ═══ 数据改善检测 ═══

  describe('数据改善自动停止', () => {
    it('checkDataImprovement 检测到改善返回 true', () => {
      const improved = engine.checkDataImprovement({
        sentinelId: 'F1',
        currentValue: 5,
        baselineValue: 10,
        threshold: 0.8, // 当前值 < 基线值 × 0.8 → 改善
      });
      expect(improved).toBe(true);
    });

    it('checkDataImprovement 未改善返回 false', () => {
      const improved = engine.checkDataImprovement({
        sentinelId: 'F1',
        currentValue: 9,
        baselineValue: 10,
        threshold: 0.8, // 9 > 10×0.8 → 未改善
      });
      expect(improved).toBe(false);
    });

    it('evaluate 中传入 dataImproved=true → 不触发升级', () => {
      const decision = engine.evaluate({
        alertId: 'alert-12',
        sentinelId: 'F1',
        severity: 'critical',
        firstIgnoredAt: new Date('2026-06-20T00:00:00Z'),
        cumulativeIgnores: 10,
        dataImproved: true,
      });
      expect(decision).toBeNull();
    });
  });

  // ═══ 文件扩展 ═══

  describe('文件驱动', () => {
    it('支持热加载新规则', () => {
      const newRules: EscalationRule[] = [
        {
          severity: 'critical',
          ignoreDays: 1,
          escalateTo: 'owner',
          channels: ['sms'],
          description: 'critical 1天 → owner SMS',
        },
      ];
      engine.loadRules(newRules);
      expect(engine.getRules().length).toBe(1);
      const d = engine.evaluate({
        alertId: 'alert-13',
        sentinelId: 'F1',
        severity: 'critical',
        firstIgnoredAt: new Date('2026-07-04T00:00:00Z'), // 1 day ago
        cumulativeIgnores: 1,
        dataImproved: false,
      });
      expect(d).not.toBeNull();
      expect(d!.channels).toContain('sms');
    });
  });

  // ═══ 统计 ═══

  describe('getStats', () => {
    it('统计追踪升级次数和忽略次数', () => {
      engine.recordIgnore('a1', 'org-1', 'liaison');
      engine.recordIgnore('a2', 'org-1', 'liaison');
      engine.recordEscalation('a3', 'org-1', 'liaison', 'owner', '3 days');

      const stats = engine.getStats();
      expect(stats.totalIgnores).toBe(2);
      expect(stats.totalEscalations).toBe(1);
    });
  });

  // ═══ 严重度无匹配规则 ═══

  describe('无匹配规则', () => {
    it('emergency 严重度无规则 → 不升级', () => {
      const decision = engine.evaluate({
        alertId: 'alert-14',
        sentinelId: 'S1',
        severity: 'emergency',
        firstIgnoredAt: new Date('2026-06-01T00:00:00Z'),
        cumulativeIgnores: 100,
        dataImproved: false,
      });
      expect(decision).toBeNull();
    });
  });
});
