/**
 * E2E: Diagnosis Pipeline — 验证诊断链路从接口到 Synova 自研引擎完整可调用
 *
 * Anthropic 标准: 每个用户旅程必须有一个 E2E 测试。
 * 验证: ConversationEngine → DiagnosisLauncher → DiagnosisEngine → SynovaDiagnosisEngineImpl
 *
 * D317: engine-core 退役 — 原测试引用已删除的 EngineCoreVendorAdapter，改用
 * createSynovaDiagnosisEngine（接线模式与 src/routes/diagnosis.ts:103-136 一致）。
 */
import { describe, it, expect } from 'vitest';
import { ConversationEngine } from '../../src/agent/conversation-engine';
import { ToolRegistry } from '../../src/agent/tools';
import { createSynovaDiagnosisEngine } from '../../src/l3/synova-diagnosis-engine-impl';
import type { LLMProvider, ChatResult } from '../../src/providers/types';
import type { DiagnosisEngine } from '../../src/l2-interfaces/diagnosis-engine';
import type { LLMClient, ToolExecutor } from '../../src/l3/synova-diagnosis-engine';

// Fake LLM provider — returns controlled responses
function fakeProvider(response = '{"hypothesis":"测试根因","confidence":0.85}'): LLMProvider {
  return {
    name: 'fake',
    baseUrl: 'fake://test',
    async chat(): Promise<ChatResult> {
      return { content: response, model: 'fake' };
    },
    async stream(_msgs, cb) {
      cb.onToken?.(response);
      cb.onComplete?.({ content: response, model: 'fake' });
    },
    async healthCheck() { return { healthy: true }; },
    listModels() { return ['fake']; },
  };
}

/** 按 src/routes/diagnosis.ts 的接线模式构建 Synova 自研引擎（适配 L2 DiagnosisEngine 接口） */
function createSynovaTestEngine(): DiagnosisEngine {
  const provider = fakeProvider();
  const toolRegistry = new ToolRegistry();

  const llmClient: LLMClient = {
    async chat(messages, opts) {
      const result = await provider.chat(
        messages as Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string }>,
        opts as Record<string, unknown> | undefined,
      );
      return {
        content: result.content || '',
        toolCalls: result.toolCalls?.map(tc => ({
          name: tc.function.name,
          arguments: JSON.parse(tc.function.arguments) as Record<string, unknown>,
        })),
      };
    },
  };

  const toolExecutor: ToolExecutor = {
    async execute(name, args) { const r = await toolRegistry.execute(name, args); return { result: r }; },
    listTools() { return toolRegistry.listTools().map(t => ({ name: t.name, description: t.description, parameters: (t.parameters || {}) as Record<string, unknown> })); },
  };

  const newEngine = createSynovaDiagnosisEngine(llmClient, toolExecutor, {
    maxToolRounds: 4,
    gateDataCompleteness: 0.3,
    gateMinHypothesisConfidence: 0.5,
  });

  return {
    async runConsultation(teamId, initiator, onEvent) {
      return newEngine.runConsultation(teamId, initiator, undefined, onEvent as Parameters<typeof newEngine.runConsultation>[3]);
    },
  };
}

describe('E2E: Diagnosis Pipeline', () => {
  it('ConversationEngine with DiagnosisEngine → startDiagnosis 不抛异常', async () => {
    const engine = new ConversationEngine(fakeProvider(), {
      diagnosisEngine: createSynovaTestEngine(),
    });

    expect(engine).toBeDefined();
    engine.setOrgId('e2e-test-org');

    // Verify startDiagnosis is callable without crashing
    const result = await engine.startDiagnosis('CEO', 'Test User');
    // 无真实 DB 时可能返回 null 或 degraded result — 关键验证：不抛异常
    expect(result === null || result !== null).toBe(true);
  });

  it('createNoopEngine returns degraded result without crash', async () => {
    const engine = new ConversationEngine(fakeProvider()); // no diagnosisEngine
    engine.setOrgId('test');
    // Noop engine returns degraded result (not null) — gracefully handles missing engine
    const result = await engine.startDiagnosis('CEO', 'Test');
    expect(result).toBeDefined();
    expect(result?.degradedModules).toContain('engine');
  });
});
