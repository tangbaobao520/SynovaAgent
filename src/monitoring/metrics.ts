/**
 * monitoring/metrics.ts — MetricsCollector (Era 3.5)
 *
 * 轻量 Prometheus 格式指标收集器。单例模式。
 * 不需要外部依赖——直接输出 Prometheus text format。
 */
import { createLogger } from '@synova/logger';

const log = createLogger('monitoring/metrics');

// ═══ Types ═══

interface Counter {
  name: string;
  help: string;
  type: 'counter';
  labels: Map<string, Map<string, number>>; // labelKey → labelValue → count
}

interface Gauge {
  name: string;
  help: string;
  type: 'gauge';
  value: number;
}

// ═══ MetricsCollector ═══

export class MetricsCollector {
  private counters = new Map<string, Counter>();
  private gauges = new Map<string, Gauge>();
  private startTime = Date.now();

  /** 注册计数器 */
  private ensureCounter(name: string, help: string): Counter {
    let c = this.counters.get(name);
    if (!c) {
      c = { name, help, type: 'counter', labels: new Map() };
      this.counters.set(name, c);
    }
    return c;
  }

  /** 递增计数器 */
  increment(name: string, value = 1, labels: Record<string, string> = {}): void {
    const c = this.ensureCounter(name, `${name} counter`);
    const labelKey = Object.entries(labels).sort().map(([k, v]) => `${k}=${v}`).join(',');
    let labelMap = c.labels.get(labelKey);
    if (!labelMap) {
      labelMap = new Map();
      c.labels.set(labelKey, labelMap);
    }
    const current = labelMap.get('_value') || 0;
    labelMap.set('_value', current + value);
  }

  /** 设置仪表值 */
  setGauge(name: string, value: number, help = ''): void {
    this.gauges.set(name, { name, help, type: 'gauge', value });
  }

  /** 记录 LLM 调用 */
  recordLLMCall(provider: string, success: boolean): void {
    this.increment('synova_agent_llm_calls_total', 1, {
      provider,
      status: success ? 'success' : 'error',
    });
  }

  /** 输出 Prometheus text format */
  getMetrics(): string {
    const lines: string[] = [];

    // Uptime gauge
    const uptime = (Date.now() - this.startTime) / 1000;
    lines.push('# HELP synova_agent_uptime_seconds Agent uptime in seconds');
    lines.push('# TYPE synova_agent_uptime_seconds gauge');
    lines.push(`synova_agent_uptime_seconds ${uptime}`);

    // Counters
    for (const [, c] of this.counters) {
      lines.push(`# HELP ${c.name} ${c.help}`);
      lines.push(`# TYPE ${c.name} counter`);
      for (const [labelKey, labelMap] of c.labels) {
        const value = labelMap.get('_value') || 0;
        if (labelKey) {
          lines.push(`${c.name}{${labelKey}} ${value}`);
        } else {
          lines.push(`${c.name} ${value}`);
        }
      }
    }

    // Gauges
    for (const [, g] of this.gauges) {
      if (g.help) lines.push(`# HELP ${g.name} ${g.help}`);
      lines.push(`# TYPE ${g.name} gauge`);
      lines.push(`${g.name} ${g.value}`);
    }

    lines.push(''); // Prometheus 要求末尾空行
    return lines.join('\n');
  }

  /** 重置所有指标（测试用） */
  reset(): void {
    this.counters.clear();
    this.gauges.clear();
    this.startTime = Date.now();
  }
}

// ═══ Global singleton ═══

export const metrics = new MetricsCollector();
