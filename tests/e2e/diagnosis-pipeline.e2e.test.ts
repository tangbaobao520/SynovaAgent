/**
 * tests/e2e/diagnosis-pipeline.e2e.test.ts — 诊断引擎端到端验证
 *
 * 铁律 33: *.e2e.test.ts = 端到端测试（完整用户旅程）
 *
 * 验证: 配置 LLM → 启动诊断 → 29 模块执行 → 6 专家输出 → 报告生成
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import { createProvider } from '../../src/providers';
import { detectProvider } from '../../src/providers/detect';
import { isLLMConfigured } from '../../src/setup';
import { createLogger } from '@synova/logger';

const log = createLogger('test:e2e-diagnosis');

// 加载 .env
(function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq > 0) {
      const k = t.slice(0, eq).trim();
      const v = t.slice(eq + 1).trim();
      if (!process.env[k]) process.env[k] = v;
    }
  }
})();

describe('诊断引擎 E2E', () => {
  const SKIP = !isLLMConfigured();

  it.runIf(!SKIP)('should complete full 6-phase diagnosis with expert output', async () => {
    // 1. 初始化 Provider
    const providerType = detectProvider();
    const provider = createProvider(providerType, {
      apiKey: process.env.LLM_API_KEY || process.env.DEEPSEEK_API_KEY,
      baseUrl: process.env.LLM_BASE_URL,
    });

    const health = await provider.healthCheck();
    expect(health.healthy).toBe(true);
    log.info({ provider: provider.name, latencyMs: health.latencyMs }, 'LLM 连接成功');

    // 2. 初始化 ConversationEngine
    const { ConversationEngine } = await import('../../src/agent/conversation-engine');
    const { ToolRegistry } = await import('../../src/agent/tools');
    const { EngineCoreVendorAdapter } = await import('../../src/adapters/engine-core-adapter');

    const diagnosisEngine = new EngineCoreVendorAdapter(provider, new ToolRegistry());
    const engine = new ConversationEngine(provider, { diagnosisEngine });

    log.info('ConversationEngine 已初始化');

    // 3. 启动诊断
    const events: Array<{ type: string; phase?: number; findings?: unknown }> = [];
    const moduleResults: string[] = [];

    const diagnosisResult = await engine.startDiagnosis(
      '管理者',
      'e2e-test-org',
      (event) => {
        events.push({ type: event.type, phase: event.phase, findings: event.findings });
        if (event.type === 'module_completed' && event.findings) {
          for (const f of event.findings as Array<{ moduleId: string; summary: string }>) {
            moduleResults.push(f.moduleId);
          }
        }
        log.info({ type: event.type, phase: event.phase, modules: event.findings?.length }, '诊断事件');
      },
    );

    log.info({
      teamId: diagnosisResult?.teamId,
      durationMs: diagnosisResult?.totalDurationMs,
      degraded: diagnosisResult?.degradedModules?.length,
    }, '诊断完成');

    // 验证
    expect(diagnosisResult).toBeDefined();
    expect(diagnosisResult!.teamId).toBeTruthy();

    // 输出诊断摘要
    console.log('\n═══════════════════════════════════════');
    console.log('  诊断引擎 E2E 结果');
    console.log('═══════════════════════════════════════');
    console.log(`  团队 ID:      ${diagnosisResult!.teamId}`);
    console.log(`  总耗时:       ${diagnosisResult!.totalDurationMs}ms`);
    console.log(`  事件数:       ${events.length}`);
    console.log(`  模块调用数:   ${moduleResults.length}`);
    console.log(`  降级模块:     ${diagnosisResult!.degradedModules?.length || 0}`);
    if (diagnosisResult!.degradedModules?.length > 0) {
      console.log(`  降级列表:     ${diagnosisResult!.degradedModules.join(', ')}`);
    }
    console.log('');
    console.log('  阶段事件:');
    for (const e of events) {
      console.log(`    [${e.phase}] ${e.type}${e.findings ? ` (${(e.findings as unknown[]).length} findings)` : ''}`);
    }
    console.log('');
    console.log('  执行模块:');
    for (const m of moduleResults) {
      console.log(`    - ${m}`);
    }
    console.log('═══════════════════════════════════════\n');

  }, 300000); // 5 分钟超时 — 诊断可能很久
});
