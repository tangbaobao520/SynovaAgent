/**
 * tests/e2e/pde-diagnosis.e2e.test.ts — PDE 工作流端到端验证
 *
 * 模拟真实 PDE 流程:
 *   1. PDE 访谈完成，整理数据
 *   2. PDE 将数据输入 Synova
 *   3. Synova 运行诊断 → 输出报告
 *
 * 铁律 33: *.e2e.test.ts = 端到端测试
 */
import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import { createProvider } from '../../src/providers';
import { detectProvider } from '../../src/providers/detect';
import { isLLMConfigured } from '../../src/setup';
import { createLogger } from '@synova/logger';

const log = createLogger('test:pde-e2e');

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

// ═══ PDE 模拟数据 — 访谈完成后整理 ═══
const PDE_INPUT = {
  orgName: '某科技公司',
  industry: 'SaaS/企业服务',
  size: 150,
  concerns: [
    '销售线索转化率持续下降，Q1 环比下降 15%',
    '核心技术人员离职率上升，近3个月走了4个高级工程师',
    '产品交付周期从 2 周拉长到 4 周',
    '大客户续费率下降，去年续费率 85% 今年掉到 70%',
    '新功能上线 delay，版本迭代节奏变慢',
  ],
  goals: [
    'Q3 营收增长 30%',
    '核心人才保留率提升到 90%',
  ],
  // 可选: 已上传的文档 ID
  docIds: [] as string[],
};

describe('PDE 工作流 E2E', () => {
  const SKIP = !isLLMConfigured();

  it.runIf(!SKIP)('PDE 输入 → 诊断引擎 → 输出报告', async () => {
    // 1. 初始化 Provider
    const providerType = detectProvider();
    const provider = createProvider(providerType, {
      apiKey: process.env.LLM_API_KEY || process.env.DEEPSEEK_API_KEY,
      baseUrl: process.env.LLM_BASE_URL,
    });
    const health = await provider.healthCheck();
    expect(health.healthy).toBe(true);
    log.info({ provider: provider.name }, 'LLM 连接成功');

    // 2. 初始化引擎 (D317: engine-core 退役 — 使用 Synova 自研引擎接线模式)
    const { ConversationEngine } = await import('../../src/agent/conversation-engine');
    const { ToolRegistry } = await import('../../src/agent/tools');
    const { createSynovaDiagnosisEngine } = await import('../../src/l3/synova-diagnosis-engine-impl');
    const llmClient = {
      async chat(messages: Array<{ role: string; content: string }>, opts?: Record<string, unknown>) {
        const r = await provider.chat(
          messages as Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string }>,
          opts as Record<string, unknown> | undefined,
        );
        return {
          content: r.content || '',
          toolCalls: r.toolCalls?.map(tc => ({
            name: tc.function.name,
            arguments: JSON.parse(tc.function.arguments) as Record<string, unknown>,
          })),
        };
      },
    };
    const toolRegistry = new ToolRegistry();
    const toolExecutor = {
      async execute(name: string, args: Record<string, unknown>) { const r = await toolRegistry.execute(name, args); return { result: r }; },
      listTools() { return toolRegistry.listTools().map(t => ({ name: t.name, description: t.description, parameters: (t.parameters || {}) as Record<string, unknown> })); },
    };
    const newEngine = createSynovaDiagnosisEngine(llmClient, toolExecutor, {
      maxToolRounds: 4,
      gateDataCompleteness: 0.3,
      gateMinHypothesisConfidence: 0.5,
    });
    const engine = new ConversationEngine(provider, {
      diagnosisEngine: {
        async runConsultation(teamId, initiator, onEvent) {
          return newEngine.runConsultation(teamId, initiator, undefined, onEvent as Parameters<typeof newEngine.runConsultation>[3]);
        },
      },
    });

    // 3. 注入 PDE 访谈后的真实数据（GraphStore 实体 + GapSnapshot）
    const { seedRealPdeData } = await import('./pde-seed-real-data');
    const orgId = await seedRealPdeData();

    // 4. 运行诊断 — PDE 的访谈结果作为 initiator
    const events: Array<{ type: string; phase?: number }> = [];
    const allFindings: string[] = [];

    const result = await engine.startDiagnosis(
      'PDE',
      orgId,
      (event) => {
        events.push({ type: event.type, phase: event.phase });
        if (event.findings) {
          for (const f of event.findings as Array<{ summary: string }>) {
            allFindings.push(f.summary);
          }
        }
      },
    );

    // 5. 输出结果
    console.log('\n═══════════════════════════════════════');
    console.log('  PDE 诊断结果');
    console.log('═══════════════════════════════════════');
    console.log(`  组织: ${PDE_INPUT.orgName}`);
    console.log(`  行业: ${PDE_INPUT.industry} (${PDE_INPUT.size}人)`);
    console.log(`  问题数: ${PDE_INPUT.concerns.length}`);
    console.log(`  总耗时: ${result?.totalDurationMs}ms`);
    console.log(`  事件数: ${events.length}`);
    console.log(`  Phase 事件:`);
    for (const e of events) {
      console.log(`    [${e.phase}] ${e.type}`);
    }
    console.log(`  Findings: ${allFindings.length} 条`);
    for (const f of allFindings.slice(0, 5)) {
      console.log(`    - ${f.slice(0, 80)}${f.length > 80 ? '...' : ''}`);
    }
    if (allFindings.length > 5) console.log(`    ... 还有 ${allFindings.length - 5} 条`);
    console.log(`  降级模块: ${result?.degradedModules?.length || 0}`);
    if (result?.degradedModules?.length) {
      console.log(`    ${result.degradedModules.join(', ')}`);
    }
    console.log('═══════════════════════════════════════\n');

    expect(result).toBeDefined();
    expect(result!.totalDurationMs).toBeGreaterThan(0);
  }, 300000);
});
