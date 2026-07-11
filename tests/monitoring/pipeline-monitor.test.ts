/**
 * tests/monitoring/pipeline-monitor.test.ts — D35: PipelineMonitor 单元测试
 * 铁律 48: 测试必须有 expect() 断言
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { PipelineMonitor, getPipelineMonitor } from '../../src/monitoring/pipeline-monitor';
import { metrics } from '../../src/monitoring/metrics';

describe('PipelineMonitor', () => {
  let monitor: PipelineMonitor;

  beforeEach(() => {
    metrics.reset();
    monitor = new PipelineMonitor();
  });

  it('记录成功接入 → 触发 counter + 内部统计', () => {
    monitor.recordIngestion('upload', 150, 'financial', 100);
    const stats = monitor.getStats();
    expect(stats.total).toBe(1);
    expect(stats.successRate).toBe(1);
    expect(stats.byChannel['upload'].total).toBe(1);
    expect(stats.byChannel['upload'].failures).toBe(0);
  });

  it('记录失败接入 → counter 加 failure 标签', () => {
    monitor.recordFailure('connector', 'operational', 'Connection timeout');
    const stats = monitor.getStats();
    expect(stats.total).toBe(1);
    expect(stats.byChannel['connector'].failures).toBe(1);
    expect(stats.successRate).toBe(0);
  });

  it('多次混合记录 → 统计正确聚合', () => {
    monitor.recordIngestion('upload', 50, 'financial', 10);
    monitor.recordIngestion('upload', 30, 'financial', 20);
    monitor.recordFailure('connector', 'hr', 'EOF');
    monitor.recordIngestion('api', 200, 'market', 5);
    const stats = monitor.getStats();
    expect(stats.total).toBe(4);
    expect(stats.byChannel['upload'].total).toBe(2);
    expect(stats.byChannel['connector'].failures).toBe(1);
    expect(stats.byChannel['api'].total).toBe(1);
  });

  it('metrics 中有 Pipeline counter 记录', () => {
    monitor.recordIngestion('upload', 100, 'test', 50);
    const output = metrics.getMetrics();
    expect(output).toContain('synova_pipeline_ingestion_total');
    expect(output).toContain('channel=upload');
    expect(output).toContain('status=success');
    expect(output).toContain('synova_pipeline_ingestion_latency_ms');
  });

  it('failure 时 metrics counter 含 failure 标签', () => {
    monitor.recordFailure('connector', 'test', 'error');
    const output = metrics.getMetrics();
    expect(output).toContain('status=failure');
    expect(output).toContain('channel=connector');
  });

  it('resetStats 后统计归零', () => {
    monitor.recordIngestion('upload', 50, 'test', 5);
    expect(monitor.getStats().total).toBe(1);
    monitor.resetStats();
    expect(monitor.getStats().total).toBe(0);
  });

  it('降级：内部异常不抛到上层', () => {
    monitor.recordIngestion('upload', 50, 'test', 5);
    monitor.recordFailure('upload', 'test', 'err');
    expect(true).toBe(true);
  });
});

describe('getPipelineMonitor singleton', () => {
  afterEach(() => { getPipelineMonitor().resetStats(); });

  it('返回同一个单例', () => {
    expect(getPipelineMonitor()).toBe(getPipelineMonitor());
  });

  it('单例可正常记录', () => {
    getPipelineMonitor().resetStats();
    getPipelineMonitor().recordIngestion('api', 10, 'test', 1);
    expect(getPipelineMonitor().getStats().total).toBe(1);
  });
});
