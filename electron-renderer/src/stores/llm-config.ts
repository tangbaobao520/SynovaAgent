/**
 * stores/llm-config — 首启向导纯逻辑数据层（D556 ga-collab 同型：node 可测）
 * 契约:
 *   @input  — 表单值 {provider, model, baseUrl?, apiKey}
 *   @output — mapLlmTestError(code): 人话文案（七码全覆盖 + default 兜底）；
 *             buildConfigPayload(form): {payload} | {error}（客户端预校验空/非法字符，
 *             镜像服务端 A2 规则）；maskedKeyOf(key): 长度<8 → '********' 否则 '****'+尾4；
 *             fetchLlmConfigStatus / testLlmConnection / submitLlmConfig（getApiBase 包装，
 *             非 2xx/网络失败 → null 由调用方显式降级，铁律 31）
 *   @degraded — fetch 异常 console.warn + 返回 null（不静默）；UI 侧 degraded 由
 *             LlmSetupCard save-error 态渲染
 *   @error  — 不抛（返回形态表达失败）
 *
 * D575（spec §4.4 契约 C 原文）——零 react/zustand import（node 可测，D556 同型）；
 * 服务端权威源: src/routes/llm-config.ts（值域/校验规则镜像，改动需同步——D551 镜像先例）。
 * submitLlmConfig 对 400 的处理: 400 是服务端结构化校验通道（code+error 可渲染人话），
 * 解析后以 {ok:false,...} 返回；其余非 2xx/网络失败 → null（调用方显式降级 save-error）。
 */
import { getApiBase } from '../lib/api';

// ═══ Provider 选项（派单 §三.5: 只露 DeepSeek 默认 / OpenAI 兼容自定义 baseUrl）═══

export const PROVIDER_OPTIONS = [
  { value: 'deepseek', label: 'DeepSeek（默认）' },
  { value: 'openai', label: 'OpenAI 兼容（自定义 baseUrl）' },
] as const;

export type WizardProvider = (typeof PROVIDER_OPTIONS)[number]['value'];

// ═══ 表单与载荷 ═══

export interface LlmSetupForm {
  provider: WizardProvider;
  model: string;
  baseUrl: string;
  apiKey: string;
}

export interface LlmConfigPayload {
  provider: string;
  model: string;
  baseUrl?: string;
  apiKey: string;
}

export type ConfigPayloadResult =
  | { payload: LlmConfigPayload }
  | { error: { code: 'INVALID_API_KEY' | 'VALIDATION_ERROR'; message: string } };

/** A2 词汇镜像（服务端 src/routes/llm-config.ts 同款）: 可打印 ASCII，禁空白/控制字符 */
const LEGAL_API_KEY = /^[\x21-\x7E]+$/;

/** 客户端预校验——镜像服务端 validateConfigBody 规则（改动需同步） */
export function buildConfigPayload(form: LlmSetupForm): ConfigPayloadResult {
  const apiKey = form.apiKey.trim();
  if (apiKey.length === 0) {
    return { error: { code: 'INVALID_API_KEY', message: '请粘贴 API Key' } };
  }
  if (!LEGAL_API_KEY.test(apiKey)) {
    return { error: { code: 'INVALID_API_KEY', message: 'API Key 含非法字符（空白/控制字符），请重新粘贴' } };
  }
  const model = form.model.trim();
  if (model.length === 0) {
    return { error: { code: 'VALIDATION_ERROR', message: '请填写模型名' } };
  }
  const baseUrl = form.baseUrl.trim();
  if (baseUrl.length > 0 && !/^https?:\/\//.test(baseUrl)) {
    return { error: { code: 'VALIDATION_ERROR', message: 'baseUrl 必须以 http:// 或 https:// 开头' } };
  }
  if (form.provider === 'openai' && baseUrl.length === 0) {
    return { error: { code: 'VALIDATION_ERROR', message: 'OpenAI 兼容模式需要填写 baseUrl' } };
  }
  return {
    payload: {
      provider: form.provider,
      model,
      baseUrl: baseUrl.length > 0 ? baseUrl : undefined,
      apiKey,
    },
  };
}

// ═══ 错误码 → 人话（渲染面镜像；服务端 message 权威）═══

/** 稳定错误码 → 人话文案（七码全覆盖 + default 兜底；零堆栈零原始 message——A2/B-01） */
export function mapLlmTestError(code: string): string {
  switch (code) {
    case 'INVALID_CREDENTIAL': return '密钥无效，请重新粘贴';
    case 'RATE_LIMIT': return '请求过于频繁或额度不足，请稍后重试';
    case 'SERVER': return '模型服务暂时不可用，请稍后重试';
    case 'NETWORK': return '无法连接到模型服务，请检查网络或 baseUrl';
    case 'TIMEOUT': return '连接超时，请检查网络或 baseUrl';
    case 'INVALID_REQUEST': return '请求被服务端拒绝（模型名或参数可能不正确）';
    case 'VALIDATION_ERROR': return '输入不完整或有误，请检查表单';
    case 'INVALID_API_KEY': return 'API Key 无效，请重新粘贴';
    default: return '操作失败，请稍后重试';
  }
}

// ═══ 脱敏（与服务端 maskLlmKey 语义一致；服务端响应已脱敏，此处兜底展示面）═══

export function maskedKeyOf(key: string): string {
  if (key.length < 8) return '********';
  return '****' + key.slice(-4);
}

// ═══ API 包装（getApiBase；形状守卫替代 as 断言——铁律 38）═══

export interface LlmConfigStatus {
  ok: boolean;
  configured: boolean;
  provider: string;
  model: string;
  baseUrl: string;
  maskedKey: string | null;
  source: 'stored' | 'env' | null;
}

export type LlmTestOutcome =
  | { ok: true; latencyMs: number; maskedKey: string }
  | { ok: false; code: string; message: string };

export type LlmSubmitOutcome =
  | { ok: true; maskedKey: string }
  | { ok: false; code: string; message: string };

/** unknown → 类型守卫（零 as 断言） */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function fetchJson(url: string, init?: RequestInit): Promise<{ status: number; body: unknown } | null> {
  try {
    const res = await fetch(url, init);
    let body: unknown = null;
    try {
      body = await res.json();
    } catch (err: unknown) {
      // 非 JSON 响应体（网关/代理错误页）——按 degraded 处理，不静默
      console.warn('[llm-config] 响应体非 JSON:', err instanceof Error ? err.message : String(err));
      return { status: res.status, body: null };
    }
    return { status: res.status, body };
  } catch (err: unknown) {
    console.warn('[llm-config] 请求失败 — 降级:', err instanceof Error ? err.message : String(err));
    return null;
  }
}

/** GET /api/llm/config — 状态拉取；非 2xx/网络失败/形状非法 → null（调用方显式降级） */
export async function fetchLlmConfigStatus(): Promise<LlmConfigStatus | null> {
  const result = await fetchJson(`${getApiBase()}/api/llm/config`);
  if (result === null || result.status < 200 || result.status >= 300) {
    if (result !== null) console.warn(`[llm-config] GET /api/llm/config 非 2xx: ${result.status}`);
    return null;
  }
  if (!isRecord(result.body)) return null;
  const body = result.body;
  if (
    typeof body['configured'] !== 'boolean'
    || (body['source'] !== null && body['source'] !== 'stored' && body['source'] !== 'env')
  ) {
    console.warn('[llm-config] GET /api/llm/config 响应形状非法 — 降级');
    return null;
  }
  return {
    ok: body['ok'] === true,
    configured: body['configured'],
    provider: typeof body['provider'] === 'string' ? body['provider'] : '',
    model: typeof body['model'] === 'string' ? body['model'] : '',
    baseUrl: typeof body['baseUrl'] === 'string' ? body['baseUrl'] : '',
    maskedKey: typeof body['maskedKey'] === 'string' ? body['maskedKey'] : null,
    source: body['source'],
  };
}

/** POST /api/llm/test — 用提交配置先测（未保存也可测）；预校验失败不发起网络请求 */
export async function testLlmConnection(form: LlmSetupForm): Promise<LlmTestOutcome | null> {
  const check = buildConfigPayload(form);
  if ('error' in check) {
    return { ok: false, code: check.error.code, message: check.error.message };
  }
  const result = await fetchJson(`${getApiBase()}/api/llm/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(check.payload),
  });
  if (result === null || result.status < 200 || result.status >= 300) {
    if (result !== null) console.warn(`[llm-config] POST /api/llm/test 非 2xx: ${result.status}`);
    return null;
  }
  if (!isRecord(result.body)) return null;
  const body = result.body;
  if (body['ok'] === true) {
    if (typeof body['latencyMs'] !== 'number' || typeof body['maskedKey'] !== 'string') return null;
    return { ok: true, latencyMs: body['latencyMs'], maskedKey: body['maskedKey'] };
  }
  if (typeof body['code'] !== 'string' || typeof body['message'] !== 'string') return null;
  return { ok: false, code: body['code'], message: body['message'] };
}

/** POST /api/llm/config — 保存；400=结构化校验失败（返回 code+message 渲染人话）；其余异常 → null */
export async function submitLlmConfig(form: LlmSetupForm): Promise<LlmSubmitOutcome | null> {
  const check = buildConfigPayload(form);
  if ('error' in check) {
    return { ok: false, code: check.error.code, message: check.error.message };
  }
  const result = await fetchJson(`${getApiBase()}/api/llm/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(check.payload),
  });
  if (result === null) return null;
  if (result.status === 400 && isRecord(result.body)) {
    const body = result.body;
    if (typeof body['code'] === 'string') {
      const message = typeof body['error'] === 'string' ? body['error'] : mapLlmTestError(body['code']);
      return { ok: false, code: body['code'], message };
    }
  }
  if (result.status < 200 || result.status >= 300) {
    console.warn(`[llm-config] POST /api/llm/config 非 2xx: ${result.status}`);
    return null;
  }
  if (isRecord(result.body) && result.body['ok'] === true && typeof result.body['maskedKey'] === 'string') {
    return { ok: true, maskedKey: result.body['maskedKey'] };
  }
  console.warn('[llm-config] POST /api/llm/config 响应形状非法 — 降级');
  return null;
}
