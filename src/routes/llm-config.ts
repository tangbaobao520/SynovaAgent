/**
 * routes/llm-config — LLM 配置 API（借鉴 A2 校验不回显 / A3 稳定错误码 / A5 词汇预留）
 * 契约:
 *   @input  — POST /api/llm/config {provider(10值枚举), model, baseUrl?, apiKey}
 *             body 白名单校验：白名单外未知字段 → 400；retryPolicy 字段收下不消费（B-02 预留）
 *             400 code ∈ {INVALID_API_KEY(key 空/非法字符), VALIDATION_ERROR(provider 非枚举/未知字段)}
 *   @output — GET  /api/llm/config → 200 {ok, configured, provider, model, baseUrl,
 *             maskedKey: '****'+尾4|null(长度<8 全掩), source: 'stored'|'env'|null}
 *             未配置 = 200 + configured:false（空值语义，不报错——A1）
 *             POST /api/llm/config → 200 {ok, maskedKey} | 400 {ok:false, code, error}
 *             POST /api/llm/test（用提交值，未保存可先测）→ 200 {ok:true, latencyMs, maskedKey}
 *             | 200 {ok:false, code, message}；code ∈ INVALID_CREDENTIAL(401/403) /
 *             RATE_LIMIT(429) / SERVER(≥500) / NETWORK(连接失败) / TIMEOUT(Abort 10s) /
 *             INVALID_REQUEST(其他 4xx)——route on code, never by parsing message（B-01）
 *   @degraded — 上游不可达/超时 → 200+ok:false+code（测试结果是数据非服务端错误）；
 *             凭证存储降级 → log.warn 继续走 env 链判定
 *   @error  — 400 响应体零 key 原文（A2：错误只提示重贴，绝不回显）；message 零上游
 *             body 透传（只透 code + status 数字——兼 SSRF 面收敛：baseUrl 用户可控，
 *             本地单用户场景自险，响应不放大）
 *
 * D575（spec §4.3 契约 B 原文）——架构定位: L1 交互层；provider 枚举对 src/providers
 * listProviderTypes() 只读消费（零改动）；热重载 = 按请求解析（spec §6 决策 3）。
 */
import { Router, type Request, type Response } from 'express';
import { createLogger } from '@synova/logger';
import { listProviderTypes } from '../providers';
import {
  setLlmCredential,
  resolveLlmApiKey,
  getStoredLlmRuntime,
  maskLlmKey,
  LlmCredentialError,
} from '../services/llm-credential-store';
import { loadFileConfig } from '../config-file';

const log = createLogger('routes/llm-config');
const router = Router();

/** 10 值 provider 枚举（只读消费 src/providers/index.ts L22，改动需同步） */
const PROVIDER_TYPES: ReadonlySet<string> = new Set(listProviderTypes().map((p) => p.type));

/** body 白名单（A5: retryPolicy 收下不消费——B-02 provider 重试策略卡预留词汇） */
const ALLOWED_BODY_KEYS: ReadonlySet<string> = new Set(['provider', 'model', 'baseUrl', 'apiKey', 'retryPolicy']);

/** deepseek 官方默认 baseUrl（UI 默认 provider 的缺省；其余 provider 必须显式提供 baseUrl） */
const DEEPSEEK_DEFAULT_BASE_URL = 'https://api.deepseek.com/v1';

/** /test 上游超时: 契约默认 10s（AbortController）；SYNOVA_LLM_TEST_TIMEOUT_MS 为测试注入缝（同 SYNOVA_DATA_DIR 模式） */
function testTimeoutMs(): number {
  const parsed = Number(process.env.SYNOVA_LLM_TEST_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 10_000;
}

interface ValidatedConfig {
  provider: string;
  model: string;
  baseUrl: string;
  apiKey: string;
}

/** 校验结果: 合法值 | 400 结构（code + error 文案；零 key 原文——A2） */
type ConfigValidation = { ok: true; value: ValidatedConfig } | { ok: false; code: 'INVALID_API_KEY' | 'VALIDATION_ERROR'; error: string };

/**
 * A2 校验链: 白名单 → provider 枚举 → model 非空 → baseUrl http(s) → apiKey trim + LEGAL_API_KEY。
 * 校验失败绝不回显 key 内容（错误文案零 key 引用）。
 */
function validateConfigBody(body: unknown): ConfigValidation {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, code: 'VALIDATION_ERROR', error: '请求体必须为 JSON 对象' };
  }
  const record = body as Record<string, unknown>;

  for (const key of Object.keys(record)) {
    if (!ALLOWED_BODY_KEYS.has(key)) {
      return { ok: false, code: 'VALIDATION_ERROR', error: `存在未知字段: ${key}` };
    }
  }

  const provider = typeof record['provider'] === 'string' ? record['provider'].trim() : '';
  if (!PROVIDER_TYPES.has(provider)) {
    return { ok: false, code: 'VALIDATION_ERROR', error: 'provider 必须是受支持的 10 值枚举之一' };
  }

  const model = typeof record['model'] === 'string' ? record['model'].trim() : '';
  if (model.length === 0) {
    return { ok: false, code: 'VALIDATION_ERROR', error: 'model 不能为空' };
  }

  const baseUrlRaw = typeof record['baseUrl'] === 'string' ? record['baseUrl'].trim() : '';
  if (baseUrlRaw.length > 0 && !/^https?:\/\//.test(baseUrlRaw)) {
    return { ok: false, code: 'VALIDATION_ERROR', error: 'baseUrl 必须以 http:// 或 https:// 开头' };
  }

  const apiKey = typeof record['apiKey'] === 'string' ? record['apiKey'].trim() : '';
  if (apiKey.length === 0) {
    return { ok: false, code: 'INVALID_API_KEY', error: '请粘贴 API Key' };
  }
  if (!/^[\x21-\x7E]+$/.test(apiKey)) {
    return { ok: false, code: 'INVALID_API_KEY', error: 'API Key 含非法字符（空白/控制字符），请重新粘贴' };
  }

  return { ok: true, value: { provider, model, baseUrl: baseUrlRaw, apiKey } };
}

/** 错误码 → 人话（route 侧 message 面契约；前端 mapLlmTestError 为渲染面镜像） */
function testFailureMessage(code: string): string {
  switch (code) {
    case 'INVALID_CREDENTIAL': return '密钥无效，请重新粘贴';
    case 'RATE_LIMIT': return '请求过于频繁或额度不足，请稍后重试';
    case 'SERVER': return '模型服务暂时不可用，请稍后重试';
    case 'NETWORK': return '无法连接到模型服务，请检查网络或 baseUrl';
    case 'TIMEOUT': return '连接超时，请检查网络或 baseUrl';
    case 'INVALID_REQUEST': return '请求被服务端拒绝（模型名或参数可能不正确）';
    default: return '测试失败，请稍后重试';
  }
}

/** A3 错误码分类（dsh-llm-deepseek httpErrorCode 同款词汇）: 401/403→AUTH 语义、429→RATE_LIMIT、≥500→SERVER、其余 4xx→INVALID_REQUEST */
function classifyHttpError(status: number): string {
  if (status === 401 || status === 403) return 'INVALID_CREDENTIAL';
  if (status === 429) return 'RATE_LIMIT';
  if (status >= 500) return 'SERVER';
  return 'INVALID_REQUEST';
}

/** GET /api/llm/config — 空值语义（未配置 = 200 + configured:false）+ 决策 4 预填（synova.json llm 段只读） */
router.get('/api/llm/config', (_req: Request, res: Response) => {
  const stored = getStoredLlmRuntime();
  const key = resolveLlmApiKey();
  // 预填源（决策 4）: 未配置/部分配置时回退 synova.json llm 段（config.ts L83-84 同款回退链）
  const fileLlm = loadFileConfig().llm;
  res.json({
    ok: true,
    configured: key.value !== null,
    provider: stored?.provider || fileLlm.provider,
    model: stored?.model || fileLlm.model,
    baseUrl: stored?.baseUrl || fileLlm.baseUrl,
    maskedKey: key.value !== null ? maskLlmKey(key.value) : null,
    source: key.source,
  });
});

/** POST /api/llm/config — A2 校验 → setLlmCredential（0600 原子写）→ onChanged fanOut → maskedKey */
router.post('/api/llm/config', (req: Request, res: Response) => {
  const validation = validateConfigBody(req.body);
  if (!validation.ok) {
    res.status(400).json({ ok: false, code: validation.code, error: validation.error });
    return;
  }
  const cfg = validation.value;
  try {
    setLlmCredential({ provider: cfg.provider, apiKey: cfg.apiKey, model: cfg.model, baseUrl: cfg.baseUrl });
  } catch (err: unknown) {
    if (err instanceof LlmCredentialError) {
      res.status(400).json({ ok: false, code: 'INVALID_API_KEY', error: 'API Key 校验失败，请重新粘贴' });
      return;
    }
    log.error({ err: err instanceof Error ? err.message : String(err) }, '凭证保存异常 — degraded');
    res.status(500).json({ ok: false, code: 'INTERNAL', error: '凭证保存失败，请重试' });
    return;
  }
  // onChanged fanOut 已由 store 触发（server.ts 订阅点打 config/llm-changed 日志）
  log.info({ provider: cfg.provider, maskedKey: maskLlmKey(cfg.apiKey) }, 'LLM 配置已保存 — 下一请求热生效');
  res.json({ ok: true, maskedKey: maskLlmKey(cfg.apiKey) });
});

/**
 * POST /api/llm/test — 用提交的配置发一次真实最小 chat 请求（A3）。
 * 失败归类为稳定错误码（route on code, never by parsing message）；上游 body 零透传；
 * 响应/日志零 key 原文。
 */
router.post('/api/llm/test', async (req: Request, res: Response) => {
  const validation = validateConfigBody(req.body);
  if (!validation.ok) {
    res.status(200).json({ ok: false, code: validation.code, message: validation.error });
    return;
  }
  const cfg = validation.value;
  const baseUrl = cfg.baseUrl.length > 0
    ? cfg.baseUrl
    : (cfg.provider === 'deepseek' ? DEEPSEEK_DEFAULT_BASE_URL : '');
  if (baseUrl.length === 0) {
    res.status(200).json({ ok: false, code: 'VALIDATION_ERROR', message: '该 provider 需要填写 baseUrl' });
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), testTimeoutMs());
  const startedAt = Date.now();
  try {
    const upstreamRes = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
        stream: false,
      }),
      signal: controller.signal,
    });
    const latencyMs = Date.now() - startedAt;
    if (upstreamRes.ok) {
      // 消费 body 释放连接；内容零透传（SSRF 面收敛——响应不放大上游 body）
      await upstreamRes.arrayBuffer();
      res.json({ ok: true, latencyMs, maskedKey: maskLlmKey(cfg.apiKey) });
      return;
    }
    await upstreamRes.arrayBuffer(); // 同上，释放连接
    const code = classifyHttpError(upstreamRes.status);
    log.warn({ provider: cfg.provider, status: upstreamRes.status, code }, 'LLM 连接测试失败（按状态码分类）');
    res.json({ ok: false, code, message: testFailureMessage(code) });
  } catch (err: unknown) {
    const latencyMs = Date.now() - startedAt;
    const aborted = err instanceof Error && err.name === 'AbortError';
    const code = aborted ? 'TIMEOUT' : 'NETWORK';
    log.warn(
      { provider: cfg.provider, code, latencyMs, err: err instanceof Error ? err.message : String(err) },
      'LLM 连接测试不可达 — 按网络类错误码返回',
    );
    res.json({ ok: false, code, message: testFailureMessage(code) });
  } finally {
    clearTimeout(timer);
  }
});

export const llmConfigRoutes = router;
