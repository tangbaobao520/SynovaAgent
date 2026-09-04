/**
 * llm-credential-store — LLM 凭证本地存储（借鉴 DSH credential seam A1，零依赖自研）
 * 契约:
 *   @input  — setLlmCredential({provider, apiKey, model?, baseUrl?})；apiKey 非
 *             空且须匹配 /^[\x21-\x7E]+$/（A2 词汇，防御性校验）
 *   @output — resolveLlmApiKey(): { value: string|null, source: 'stored'|'env'|null }
 *             分层解析 凭证文件 → process.env.LLM_API_KEY → null（空值=未配置，非错误）
 *             getStoredLlmRuntime(): { provider, model, baseUrl } | null（非敏感明文面）
 *   @degraded — 凭证文件存在但 JSON.parse 失败 → log.warn + degraded 标记 + 返回 null
 *             （区分 ENOENT=正常未配置不告警，铁律 24）；文件 I/O 异常同理降级不崩
 *   @error  — LLM_CREDENTIAL_ERROR: .code+.phase='credential'+.retryable（铁律 32）
 *   @side   — 写侧 tmp+rename 原子写 + POSIX chmod 0600（skipIf win32，NTFS 走用户目录 ACL）；
 *             日志零 key 片段；路径每次读 SYNOVA_DATA_DIR（测试注入缝）
 *
 * D575（spec §4.2 契约 A 原文）——架构定位: L5 邻接文件 I/O（config-file.ts 同型自标）。
 * 热重载机制: routes 每请求 loadConfig()（diagnosis-upload-v2.ts L245/L526 实测），
 * 本模块只提供"每次调用重读"的纯文件真相，零缓存零单例——保存后下一请求即生效。
 */
import { readFileSync, writeFileSync, renameSync, chmodSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { createLogger } from '@synova/logger';

const log = createLogger('services/llm-credential-store');

/** A2 词汇（DSH dsh-llm LEGAL_API_KEY 同款）: 可打印 ASCII，禁空白/控制字符 */
const LEGAL_API_KEY = /^[\x21-\x7E]+$/;

/** 铁律 32: 错误分类载体——.code + .phase + .retryable */
export class LlmCredentialError extends Error {
  readonly code: string;
  readonly phase: string;
  readonly retryable: boolean;

  constructor(message: string, opts: { retryable?: boolean } = {}) {
    super(message);
    this.name = 'LlmCredentialError';
    this.code = 'LLM_CREDENTIAL_ERROR';
    this.phase = 'credential';
    this.retryable = opts.retryable ?? false;
  }
}

export interface LlmCredentialInput {
  provider: string;
  apiKey: string;
  model?: string;
  baseUrl?: string;
}

export interface LlmKeyResolution {
  value: string | null;
  source: 'stored' | 'env' | null;
  /** 铁律 31: 凭证文件损坏（JSON.parse 失败）时为 true——降级信号传播给调用方 */
  degraded?: boolean;
}

export interface LlmRuntimeConfig {
  provider: string;
  model: string;
  baseUrl: string;
}

/** 凭证文件结构（单文件真相: spec §6 决策 2——synova.json 零写入） */
interface StoredLlmCredential {
  provider: string;
  apiKey: string;
  model?: string;
  baseUrl?: string;
  updatedAt: string;
}

/** 凭证文件路径——每次调用读 SYNOVA_DATA_DIR（测试注入缝；默认 data/，已被 .gitignore L3 覆盖） */
export function getLlmCredentialFilePath(): string {
  return join(process.env.SYNOVA_DATA_DIR || 'data', 'llm-credentials.json');
}

/** 脱敏: 长度<8 全掩（不泄露长度信息），否则 ****+尾4（credentials.ts L44 同款词汇） */
export function maskLlmKey(key: string): string {
  if (key.length < 8) return '********';
  return '****' + key.slice(-4);
}

type StoredRead =
  | { degraded: false; data: StoredLlmCredential | null }
  | { degraded: true; data: null };

/**
 * 读凭证文件。ENOENT = 正常未配置（静默返回 null，铁律 24）；
 * JSON.parse 失败 / I/O 异常 = 降级（log.warn + degraded 标记，不崩）。
 * 形状非法（解析成功但缺 provider/apiKey）按损坏处理。
 */
function readStoredCredential(): StoredRead {
  let raw: string;
  try {
    raw = readFileSync(getLlmCredentialFilePath(), 'utf-8');
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === 'ENOENT') {
      return { degraded: false, data: null }; // 正常默认: 未配置不告警
    }
    log.warn({ err: err instanceof Error ? err.message : String(err) }, '凭证文件读取失败 — degraded（继续走 env 链）');
    return { degraded: true, data: null };
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' && parsed !== null
      && typeof (parsed as { provider?: unknown }).provider === 'string'
      && typeof (parsed as { apiKey?: unknown }).apiKey === 'string'
      && ((parsed as { provider: string }).provider).length > 0
      && ((parsed as { apiKey: string }).apiKey).length > 0
    ) {
      return { degraded: false, data: parsed as StoredLlmCredential };
    }
    log.warn('凭证文件形状非法 — 按损坏处理，degraded（继续走 env 链）');
    return { degraded: true, data: null };
  } catch (err: unknown) {
    // 铁律 24: JSON.parse 失败 ≠ ENOENT——必须告警
    log.warn({ err: err instanceof Error ? err.message : String(err) }, '凭证文件 JSON 解析失败 — degraded（继续走 env 链）');
    return { degraded: true, data: null };
  }
}

/** setLlmCredential: 校验（A2 防御）→ tmp+rename 原子写 + 0600 → onChanged fanOut（A4） */
export function setLlmCredential(input: LlmCredentialInput): void {
  const apiKey = input.apiKey.trim();
  if (apiKey.length === 0) {
    throw new LlmCredentialError('apiKey 不能为空');
  }
  if (!LEGAL_API_KEY.test(apiKey)) {
    throw new LlmCredentialError('apiKey 含非法字符（空白/控制字符），请重新粘贴');
  }
  const provider = input.provider.trim();
  if (provider.length === 0) {
    throw new LlmCredentialError('provider 不能为空');
  }

  const record: StoredLlmCredential = {
    provider,
    apiKey,
    updatedAt: new Date().toISOString(),
  };
  if (input.model !== undefined && input.model.trim().length > 0) record.model = input.model.trim();
  if (input.baseUrl !== undefined && input.baseUrl.trim().length > 0) record.baseUrl = input.baseUrl.trim();

  const filePath = getLlmCredentialFilePath();
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  try {
    // 原子写: tmp → chmod 0600 → rename（中断不留半写文件）
    writeFileSync(tmpPath, JSON.stringify(record, null, 2), 'utf-8');
    if (process.platform !== 'win32') {
      chmodSync(tmpPath, 0o600);
    }
    renameSync(tmpPath, filePath);
  } catch (err: unknown) {
    // 清理半写 tmp（尽力而为，失败不掩盖原错误）
    try { unlinkSync(tmpPath); } catch { /* tmp 可能尚未创建 */ }
    log.error({ err: err instanceof Error ? err.message : String(err) }, '凭证文件写入失败');
    throw new LlmCredentialError('凭证文件写入失败', { retryable: true });
  }

  // A4: onChanged 事件（payload 零 key 原文——只带脱敏面）
  notifyChanged({ provider, maskedKey: maskLlmKey(apiKey) });
}

/**
 * resolveLlmApiKey — 分层解析（A1）: 凭证文件 → process.env.LLM_API_KEY → null。
 * 空值=未配置（非错误）；凭证文件损坏时降级继续走 env 链 + degraded 标记。
 */
export function resolveLlmApiKey(): LlmKeyResolution {
  const stored = readStoredCredential();
  if (stored.data !== null) {
    return { value: stored.data.apiKey, source: 'stored' };
  }
  const envKey = process.env.LLM_API_KEY;
  if (envKey !== undefined && envKey.trim().length > 0) {
    return stored.degraded
      ? { value: envKey, source: 'env', degraded: true }
      : { value: envKey, source: 'env' };
  }
  return stored.degraded
    ? { value: null, source: null, degraded: true }
    : { value: null, source: null };
}

/**
 * getStoredLlmRuntime — 非敏感明文面（provider/model/baseUrl），供 config.ts 激活
 * synova.json llm 段同语义的运行时回退链。缺字段返回空串（调用方按 falsy 继续回退）。
 */
export function getStoredLlmRuntime(): LlmRuntimeConfig | null {
  const stored = readStoredCredential();
  if (stored.data === null) return null;
  return {
    provider: stored.data.provider,
    model: stored.data.model ?? '',
    baseUrl: stored.data.baseUrl ?? '',
  };
}

// ═══ A4: onChanged 事件（server.ts 订阅点打 config/llm-changed 日志）═══

export interface LlmCredentialChangedInfo {
  provider: string;
  /** 已脱敏（****尾4），零 key 原文 */
  maskedKey: string;
}

type ChangedListener = (info: LlmCredentialChangedInfo) => void;

const changedListeners = new Set<ChangedListener>();

/** 订阅凭证变更；返回退订函数 */
export function onLlmCredentialChanged(cb: ChangedListener): () => void {
  changedListeners.add(cb);
  return () => { changedListeners.delete(cb); };
}

function notifyChanged(info: LlmCredentialChangedInfo): void {
  for (const cb of changedListeners) {
    try {
      cb(info);
    } catch (err: unknown) {
      // 订阅者异常不阻断保存链路（铁律 24: 记 warn 不空吞）
      log.warn({ err: err instanceof Error ? err.message : String(err) }, 'onLlmCredentialChanged 订阅者回调异常 — 已跳过');
    }
  }
}
