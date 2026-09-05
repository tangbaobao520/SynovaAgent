/**
 * tests/llm-config-frontend.test.ts — D575 前端首启向导逻辑层 + UI 渲染测试
 *
 * 契约来源: SYNOVA-IMPL-DSH-D575-llm-first-run-config-20260904.md §4.4（契约 C 原文）+ §5.4 red→green 对照。
 * 覆盖:
 *   逻辑层（D556 ga-collab 同型纯函数，node 可测）— mapLlmTestError 七码+default 人话映射 /
 *   buildConfigPayload 客户端预校验（镜像服务端 A2 规则）/ maskedKeyOf 短 key 全掩 /
 *   fetchLlmConfigStatus·testLlmConnection·submitLlmConfig（getApiBase 包装 + 非正常 → null 显式降级，铁律 31）
 *   UI 渲染（renderToStaticMarkup 桥接复用 test-support/render.ts，D556 交付物零新依赖）—
 *   LlmSetupCard 五态（idle/testing/test-ok/test-fail/saving + save-error）+ WelcomePanel 两态
 *   （ready 无向导特征 / hasConfigNoData 原文案）。firstLaunch 分支 = LlmSetupCard 本体（WelcomeScreen
 *   为 hook 组件——桥接物理不支持 hook 树，三态拆为 LlmSetupCard 渲染 + WelcomePanel 纯面板渲染，见实现注释）。
 * 铁律 48: 全 expect 断言，非空壳。
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  PROVIDER_OPTIONS,
  mapLlmTestError,
  buildConfigPayload,
  maskedKeyOf,
  fetchLlmConfigStatus,
  testLlmConnection,
  submitLlmConfig,
  type LlmSetupForm,
} from '../electron-renderer/src/stores/llm-config';
import { LlmSetupCard } from '../electron-renderer/src/components/LlmSetupCard';
import { WelcomePanel } from '../electron-renderer/src/components/WelcomeScreen';
import { renderToStaticMarkup } from '../electron-renderer/src/test-support/render';

const FORM: LlmSetupForm = { provider: 'deepseek', model: 'deepseek-chat', baseUrl: '', apiKey: 'sk-test-1234567890' };

afterEach(() => {
  vi.unstubAllGlobals();
});

// ═══ 逻辑层 — mapLlmTestError（七码 + default 兜底）═══

describe('mapLlmTestError — 错误码 → 人话（零堆栈）', () => {
  it('七个已知错误码全部映射到人话文案', () => {
    const cases: Array<[string, string]> = [
      ['INVALID_CREDENTIAL', '密钥无效'],
      ['RATE_LIMIT', '额度'],
      ['SERVER', '不可用'],
      ['NETWORK', '无法连接'],
      ['TIMEOUT', '超时'],
      ['INVALID_REQUEST', '拒绝'],
      ['VALIDATION_ERROR', '输入'],
      ['INVALID_API_KEY', '重新粘贴'],
    ];
    for (const [code, fragment] of cases) {
      const text = mapLlmTestError(code);
      expect(text).toContain(fragment);
      expect(text).not.toMatch(/Error:|at \w+ \(/); // 人话非堆栈
    }
  });

  it('未知 code → default 兜底文案（不抛、不回显堆栈）', () => {
    const text = mapLlmTestError('SOMETHING_ELSE');
    expect(typeof text).toBe('string');
    expect(text.length).toBeGreaterThan(0);
    expect(text).not.toMatch(/Error:|at \w+ \(/);
  });
});

// ═══ 逻辑层 — buildConfigPayload（镜像服务端 A2 校验）═══

describe('buildConfigPayload — 客户端预校验', () => {
  it('合法 deepseek 表单 → payload（apiKey trim）', () => {
    const result = buildConfigPayload({ ...FORM, apiKey: '  sk-test-1234567890  ' });
    expect('payload' in result).toBe(true);
    if ('payload' in result) {
      expect(result.payload.provider).toBe('deepseek');
      expect(result.payload.model).toBe('deepseek-chat');
      expect(result.payload.apiKey).toBe('sk-test-1234567890');
    }
  });

  it('空 key → {error: INVALID_API_KEY}', () => {
    const result = buildConfigPayload({ ...FORM, apiKey: '   ' });
    expect('error' in result).toBe(true);
    if ('error' in result) expect(result.error.code).toBe('INVALID_API_KEY');
  });

  it('含空白字符的 key → {error: INVALID_API_KEY}（A2 词汇镜像）', () => {
    const result = buildConfigPayload({ ...FORM, apiKey: 'sk bad key' });
    expect('error' in result).toBe(true);
    if ('error' in result) expect(result.error.code).toBe('INVALID_API_KEY');
  });

  it('model 为空 → {error: VALIDATION_ERROR}', () => {
    const result = buildConfigPayload({ ...FORM, model: '' });
    expect('error' in result).toBe(true);
    if ('error' in result) expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('openai 兼容模式缺 baseUrl → {error: VALIDATION_ERROR}', () => {
    const result = buildConfigPayload({ ...FORM, provider: 'openai', baseUrl: '' });
    expect('error' in result).toBe(true);
    if ('error' in result) expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('baseUrl 非 http(s) → {error: VALIDATION_ERROR}', () => {
    const result = buildConfigPayload({ ...FORM, baseUrl: 'ftp://x.example.com' });
    expect('error' in result).toBe(true);
    if ('error' in result) expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('PROVIDER_OPTIONS 只露 deepseek + openai（派单 §三.5 范围）', () => {
    expect(PROVIDER_OPTIONS.map((p) => p.value)).toEqual(['deepseek', 'openai']);
  });
});

// ═══ 逻辑层 — maskedKeyOf ═══

describe('maskedKeyOf — 脱敏', () => {
  it('长度<8 → 全掩 ********', () => {
    expect(maskedKeyOf('sk1')).toBe('********');
    expect(maskedKeyOf('1234567')).toBe('********');
  });

  it('长度≥8 → ****+尾4', () => {
    expect(maskedKeyOf('sk-test-1234567890')).toBe('****7890');
    expect(maskedKeyOf('12345678')).toBe('****5678');
  });
});

// ═══ 逻辑层 — fetch 包装与降级（铁律 31：非正常 → null 显式降级）═══

describe('fetchLlmConfigStatus', () => {
  it('200 → 返回解析后的状态对象（请求 URL = /api/llm/config）', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (input: string | URL) => {
      calls.push(String(input));
      return new Response(JSON.stringify({ ok: true, configured: false, source: null, maskedKey: null }), { status: 200 });
    });
    const status = await fetchLlmConfigStatus();
    expect(calls).toEqual(['/api/llm/config']);
    expect(status).not.toBeNull();
    expect(status?.ok).toBe(true);
    expect(status?.configured).toBe(false);
  });

  it('非 2xx → console.warn + null（不静默）', async () => {
    const warn = vi.fn();
    vi.stubGlobal('fetch', async () => new Response('{}', { status: 500 }));
    vi.stubGlobal('console', { ...console, warn });
    const status = await fetchLlmConfigStatus();
    expect(status).toBeNull();
    expect(warn).toHaveBeenCalled();
  });

  it('fetch 抛异常（后端不可达）→ warn + null', async () => {
    const warn = vi.fn();
    vi.stubGlobal('fetch', async () => { throw new TypeError('connection refused'); });
    vi.stubGlobal('console', { ...console, warn });
    const status = await fetchLlmConfigStatus();
    expect(status).toBeNull();
    expect(warn).toHaveBeenCalled();
  });
});

describe('testLlmConnection', () => {
  it('客户端预校验失败 → 直接返回 error 结果，零网络请求', async () => {
    let called = false;
    vi.stubGlobal('fetch', async () => { called = true; return new Response('{}', { status: 200 }); });
    const result = await testLlmConnection({ ...FORM, apiKey: '' });
    expect(called).toBe(false);
    expect(result).not.toBeNull();
    expect(result?.ok).toBe(false);
    expect(result && 'code' in result && result.code).toBe('INVALID_API_KEY');
  });

  it('上游 200 {ok:true} → {ok:true, latencyMs, maskedKey}', async () => {
    vi.stubGlobal('fetch', async () => new Response(
      JSON.stringify({ ok: true, latencyMs: 42, maskedKey: '****7890' }), { status: 200 },
    ));
    const result = await testLlmConnection(FORM);
    expect(result?.ok).toBe(true);
    if (result?.ok) {
      expect(result.latencyMs).toBe(42);
      expect(result.maskedKey).toBe('****7890');
    }
  });

  it('上游 200 {ok:false, code} → 透传错误码结果', async () => {
    vi.stubGlobal('fetch', async () => new Response(
      JSON.stringify({ ok: false, code: 'INVALID_CREDENTIAL', message: '密钥无效，请重新粘贴' }), { status: 200 },
    ));
    const result = await testLlmConnection({ ...FORM, apiKey: 'sk-bad-12345678' });
    expect(result?.ok).toBe(false);
    if (!result?.ok) expect(result.code).toBe('INVALID_CREDENTIAL');
  });

  it('非 2xx → null（调用方显式降级）', async () => {
    vi.stubGlobal('fetch', async () => new Response('{}', { status: 503 }));
    expect(await testLlmConnection(FORM)).toBeNull();
  });
});

describe('submitLlmConfig', () => {
  it('400 校验失败 → 解析 body 返回 {ok:false, code, message}（供 UI 渲染人话）', async () => {
    vi.stubGlobal('fetch', async () => new Response(
      JSON.stringify({ ok: false, code: 'INVALID_API_KEY', error: 'API Key 含非法字符，请重新粘贴' }), { status: 400 },
    ));
    const result = await submitLlmConfig({ ...FORM, apiKey: 'bad key' });
    expect(result?.ok).toBe(false);
    if (!result?.ok) {
      expect(result.code).toBe('INVALID_API_KEY');
      expect(result.message).toContain('重新粘贴');
    }
  });

  it('200 → {ok:true, maskedKey}', async () => {
    vi.stubGlobal('fetch', async () => new Response(
      JSON.stringify({ ok: true, maskedKey: '****7890' }), { status: 200 },
    ));
    const result = await submitLlmConfig(FORM);
    expect(result?.ok).toBe(true);
    if (result?.ok) expect(result.maskedKey).toBe('****7890');
  });

  it('5xx/网络失败 → warn + null（显式降级，save-error 态由 UI 渲染）', async () => {
    const warn = vi.fn();
    vi.stubGlobal('fetch', async () => new Response('{}', { status: 500 }));
    vi.stubGlobal('console', { ...console, warn });
    expect(await submitLlmConfig(FORM)).toBeNull();

    vi.stubGlobal('fetch', async () => { throw new TypeError('refused'); });
    expect(await submitLlmConfig(FORM)).toBeNull();
    expect(warn).toHaveBeenCalled();
  });
});

// ═══ UI 渲染 — LlmSetupCard 五态（renderToStaticMarkup 桥接）═══

function cardProps(overrides?: Partial<Parameters<typeof LlmSetupCard>[0]>): Parameters<typeof LlmSetupCard>[0] {
  return {
    provider: 'deepseek',
    model: 'deepseek-chat',
    baseUrl: '',
    apiKey: '',
    phase: 'idle',
    testResult: null,
    saveErrorMessage: null,
    onProviderChange: () => {},
    onModelChange: () => {},
    onBaseUrlChange: () => {},
    onApiKeyChange: () => {},
    onTest: () => {},
    onSave: () => {},
    onSkip: () => {},
    ...overrides,
  };
}

describe('LlmSetupCard — 五态渲染', () => {
  it('idle: 表单 + 三按钮齐全（provider 下拉/model/key/测试连接/保存并进入/暂不配置）', () => {
    const html = renderToStaticMarkup(LlmSetupCard(cardProps()));
    expect(html).toContain('llm-setup-card');
    expect(html).toContain('测试连接');
    expect(html).toContain('保存并进入');
    expect(html).toContain('暂不配置');
    expect(html).toContain('name="provider"');
    expect(html).toContain('name="model"');
    expect(html).toContain('name="apiKey"');
    expect(html).toContain('DeepSeek');
    expect(html).not.toContain('name="baseUrl"'); // deepseek 模式无 baseUrl 输入
  });

  it('testing: 测试中提示，按钮禁用', () => {
    const html = renderToStaticMarkup(LlmSetupCard(cardProps({ phase: 'testing' })));
    expect(html).toContain('正在测试连接');
    expect(html).toContain('disabled');
  });

  it('test-ok: 绿勾 + maskedKey + latency（零 key 原文）', () => {
    const html = renderToStaticMarkup(LlmSetupCard(cardProps({
      phase: 'test-ok',
      testResult: { ok: true, latencyMs: 321, maskedKey: '****7890' },
    })));
    expect(html).toContain('连接成功');
    expect(html).toContain('****7890');
    expect(html).toContain('321');
  });

  it('test-fail: code → 人话（密钥无效），零堆栈零 key 原文', () => {
    const html = renderToStaticMarkup(LlmSetupCard(cardProps({
      phase: 'test-fail',
      testResult: { ok: false, code: 'INVALID_CREDENTIAL', message: '密钥无效，请重新粘贴' },
    })));
    expect(html).toContain('密钥无效，请重新粘贴');
    expect(html).not.toMatch(/Error:|at \w+ \(/);
  });

  it('saving: 保存中提示', () => {
    const html = renderToStaticMarkup(LlmSetupCard(cardProps({ phase: 'saving' })));
    expect(html).toContain('正在保存');
  });

  it('save-error: 保存失败 + 降级原因（铁律 31 显性化）', () => {
    const html = renderToStaticMarkup(LlmSetupCard(cardProps({
      phase: 'save-error',
      saveErrorMessage: '无法连接本地服务，请确认后端已启动',
    })));
    expect(html).toContain('保存失败');
    expect(html).toContain('无法连接本地服务');
  });

  it('openai 模式: baseUrl 输入出现', () => {
    const html = renderToStaticMarkup(LlmSetupCard(cardProps({ provider: 'openai', baseUrl: 'https://x.example.com/v1' })));
    expect(html).toContain('name="baseUrl"');
  });
});

// ═══ UI 渲染 — WelcomePanel 两态（firstLaunch 分支 = LlmSetupCard 本体，见文件头说明）═══

describe('WelcomePanel — 三态中的非向导两态', () => {
  it('ready: 原文案「一切就绪」，零向导特征', () => {
    const html = renderToStaticMarkup(WelcomePanel({
      welcomeState: 'ready',
      onStartDiagnosis: () => {},
      onEnterDemo: () => {},
    }));
    expect(html).toContain('一切就绪');
    expect(html).not.toContain('测试连接');
    expect(html).not.toContain('保存并进入');
  });

  it('hasConfigNoData: 原文案保留（上传数据 / 演示模式）', () => {
    const html = renderToStaticMarkup(WelcomePanel({
      welcomeState: 'hasConfigNoData',
      onStartDiagnosis: () => {},
      onEnterDemo: () => {},
    }));
    expect(html).toContain('欢迎回来');
    expect(html).toContain('上传数据');
    expect(html).toContain('进入演示模式');
  });

  it('WELCOME_COPY.firstLaunch 键已删除（铁律 37 死代码清理——类型面 Exclude 收窄）', async () => {
    const mod = await import('../electron-renderer/src/components/WelcomeScreen');
    // 模块级断言: 拷贝表只含 hasConfigNoData/ready 两键（WELCOME_COPY 导出供此断言）
    expect(Object.keys(mod.WELCOME_COPY).sort()).toEqual(['hasConfigNoData', 'ready']);
  });
});
