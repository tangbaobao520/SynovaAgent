/**
 * metrics.test.ts — 监控遥测测试 (Era 3.5, iron law 0-2 Step 2)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from '../src/server';
import { MetricsCollector } from '../src/monitoring/metrics';
import type { Server } from 'http';

let server: Server;
const PORT = 3097;
const BASE = `http://localhost:${PORT}`;

beforeAll(async () => {
  process.env.DEV_MODE = 'true';
  process.env.PORT = String(PORT);
  process.env.SYNOVA_DB_PATH = ':memory:';
  server = await createServer();
});

afterAll(() => { if (server) server.close(); });

describe('MetricsCollector', () => {
  it('increments and returns counters', () => {
    const m = new MetricsCollector();
    m.increment('test_total', 1);
    m.increment('test_total', 2);
    const metrics = m.getMetrics();
    expect(metrics).toContain('test_total 3');
  });

  it('tracks LLM call metrics', () => {
    const m = new MetricsCollector();
    m.recordLLMCall('deepseek', true);
    m.recordLLMCall('deepseek', false);
    const metrics = m.getMetrics();
    expect(metrics).toContain('success');
    expect(metrics).toContain('error');
    expect(metrics).toContain('deepseek');
  });

  it('returns Prometheus format', () => {
    const m = new MetricsCollector();
    m.increment('sessions_total', 5);
    const text = m.getMetrics();
    expect(text).toMatch(/^# HELP/m);
    expect(text).toMatch(/^# TYPE/m);
    expect(text).toContain('sessions_total 5');
  });
});

describe('Metrics API', () => {
  it('GET /api/metrics → 200 with Prometheus text', async () => {
    const res = await fetch(`${BASE}/api/metrics`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('synova_agent_uptime_seconds');
  });

  it('GET /health → includes db and llm status', async () => {
    const res = await fetch(`${BASE}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.name).toBe('Synova-Agent');
  });
});
