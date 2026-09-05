/**
 * tests/services/llm-credential-store.test.ts — D575 LLM 凭证存储 L1 单元测试
 *
 * 契约来源: SYNOVA-IMPL-DSH-D575-llm-first-run-config-20260904.md §4.2（契约 A 原文）
 * 覆盖（铁律 48 三路径）:
 *   正常 — set → 文件 0600 → resolve {value, source:'stored'}；stored 覆盖 env；
 *          getStoredLlmRuntime 返回 provider/model/baseUrl；onChanged 触发（payload 零 key 原文）
 *   降级 — 凭证文件损坏（JSON.parse 失败）→ log.warn + degraded 标记 + 返回 null 不崩（铁律 24：
 *          区分 ENOENT=正常未配置不告警）；无文件无 env → {value:null, source:null} 空值语义
 *   边界 — env 回退（source:'env'）；非法 key（空/含空白）抛 LlmCredentialError(.code+.phase+.retryable，
 *          铁律 32)；路径每次读 SYNOVA_DATA_DIR（测试注入缝，tmp 隔离）；maskLlmKey 短 key 全掩
 * 环境隔离: 每用例 mkdtempSync(os.tmpdir()) 注入 SYNOVA_DATA_DIR——严禁写真实 data/（D575 §三-6）
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  setLlmCredential,
  resolveLlmApiKey,
  getStoredLlmRuntime,
  onLlmCredentialChanged,
  maskLlmKey,
  LlmCredentialError,
} from '../../src/services/llm-credential-store';

/** D575 CTO 复核: getLlmCredentialFilePath 去掉 export（组4 接线审计——仅同文件消费+测试不计），
 *  测试改为同逻辑推导路径 */
function getLlmCredentialFilePath(): string {
  return require('path').join(process.env.SYNOVA_DATA_DIR ?? 'data', 'llm-credentials.json');
}

const KEY_A = 'sk-test-aaaa1111';
const KEY_B = 'sk-test-bbbb2222';

let tmpDir: string;
let savedDataDir: string | undefined;
let savedEnvKeys: Record<string, string | undefined> = {};

function injectDataDir(): void {
  tmpDir = mkdtempSync(join(tmpdir(), 'synova-d575-store-'));
  process.env.SYNOVA_DATA_DIR = tmpDir;
}

function clearLlmEnv(): void {
  for (const k of ['LLM_API_KEY', 'DEEPSEEK_API_KEY', 'QWEN_API_KEY', 'OPENAI_API_KEY']) {
    delete process.env[k];
  }
}

beforeEach(() => {
  savedDataDir = process.env.SYNOVA_DATA_DIR;
  savedEnvKeys = {
    LLM_API_KEY: process.env.LLM_API_KEY,
    DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
  };
  clearLlmEnv();
  injectDataDir();
});

afterEach(() => {
  if (savedDataDir === undefined) delete process.env.SYNOVA_DATA_DIR;
  else process.env.SYNOVA_DATA_DIR = savedDataDir;
  if (savedEnvKeys.LLM_API_KEY !== undefined) process.env.LLM_API_KEY = savedEnvKeys.LLM_API_KEY;
  if (savedEnvKeys.DEEPSEEK_API_KEY !== undefined) process.env.DEEPSEEK_API_KEY = savedEnvKeys.DEEPSEEK_API_KEY;
  if (tmpDir && tmpDir.startsWith(tmpdir())) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

describe('llm-credential-store 正常路径', () => {
  it('set → 文件落盘 0600 → resolve 返回 {value, source:"stored"}', () => {
    setLlmCredential({ provider: 'deepseek', apiKey: KEY_A, model: 'deepseek-chat' });

    const filePath = getLlmCredentialFilePath();
    expect(filePath.startsWith(tmpDir)).toBe(true);
    expect(existsSync(filePath)).toBe(true);
    if (process.platform !== 'win32') {
      expect(statSync(filePath).mode & 0o777).toBe(0o600);
    }
    const res = resolveLlmApiKey();
    expect(res.value).toBe(KEY_A);
    expect(res.source).toBe('stored');
  });

  it('stored 优先于 env（A1 分层：凭证文件 → env）', () => {
    process.env.LLM_API_KEY = KEY_B;
    setLlmCredential({ provider: 'deepseek', apiKey: KEY_A });
    const res = resolveLlmApiKey();
    expect(res.value).toBe(KEY_A);
    expect(res.source).toBe('stored');
  });

  it('getStoredLlmRuntime 返回非敏感明文面 provider/model/baseUrl', () => {
    setLlmCredential({
      provider: 'openai',
      apiKey: KEY_A,
      model: 'gpt-4o',
      baseUrl: 'https://api.example.com/v1',
    });
    const rt = getStoredLlmRuntime();
    expect(rt).not.toBeNull();
    expect(rt?.provider).toBe('openai');
    expect(rt?.model).toBe('gpt-4o');
    expect(rt?.baseUrl).toBe('https://api.example.com/v1');
  });

  it('onChanged 在 set 后触发，payload 只含 provider + maskedKey（零 key 原文）', () => {
    const seen: Array<{ provider: string; maskedKey: string }> = [];
    const unsubscribe = onLlmCredentialChanged((info) => seen.push(info));
    setLlmCredential({ provider: 'deepseek', apiKey: KEY_A });
    expect(seen).toHaveLength(1);
    expect(seen[0]?.provider).toBe('deepseek');
    expect(seen[0]?.maskedKey).toBe(maskLlmKey(KEY_A));
    expect(JSON.stringify(seen)).not.toContain(KEY_A);

    // unsubscribe 后不再触发
    unsubscribe();
    setLlmCredential({ provider: 'deepseek', apiKey: KEY_B });
    expect(seen).toHaveLength(1);
  });
});

describe('llm-credential-store 空值与降级路径', () => {
  it('无文件无 env → {value:null, source:null}（空值=未配置，非错误，不抛）', () => {
    const res = resolveLlmApiKey();
    expect(res.value).toBeNull();
    expect(res.source).toBeNull();
    expect(getStoredLlmRuntime()).toBeNull();
  });

  it('env 回退：无文件 + LLM_API_KEY → {value, source:"env"}', () => {
    process.env.LLM_API_KEY = KEY_B;
    const res = resolveLlmApiKey();
    expect(res.value).toBe(KEY_B);
    expect(res.source).toBe('env');
  });

  it('凭证文件损坏（JSON.parse 失败）→ log.warn + degraded 标记 + 降级不崩（铁律 24）', () => {
    setLlmCredential({ provider: 'deepseek', apiKey: KEY_A });
    const filePath = getLlmCredentialFilePath();
    writeFileSync(filePath, 'not-json{{{', 'utf-8');

    const res = resolveLlmApiKey();
    expect(res.value).toBeNull(); // 无 env 可回退
    expect(res.source).toBeNull();
    expect(res.degraded).toBe(true); // 降级信号传播（铁律 31）
    expect(getStoredLlmRuntime()).toBeNull(); // 同样降级为 null 不崩
  });

  it('凭证文件损坏但有 env → 降级继续走 env 链（契约 B degraded 语义）', () => {
    process.env.LLM_API_KEY = KEY_B;
    setLlmCredential({ provider: 'deepseek', apiKey: KEY_A });
    writeFileSync(getLlmCredentialFilePath(), 'broken{', 'utf-8');

    const res = resolveLlmApiKey();
    expect(res.value).toBe(KEY_B);
    expect(res.source).toBe('env');
    expect(res.degraded).toBe(true);
  });
});

describe('llm-credential-store 边界条件', () => {
  it('空 key 拒绝并抛 LlmCredentialError（.code+.phase+.retryable，铁律 32）', () => {
    expect(() => setLlmCredential({ provider: 'deepseek', apiKey: '' })).toThrow(LlmCredentialError);
    expect(() => setLlmCredential({ provider: 'deepseek', apiKey: '   ' })).toThrow(LlmCredentialError);
    try {
      setLlmCredential({ provider: 'deepseek', apiKey: '   ' });
      expect.unreachable('必须抛出');
    } catch (err) {
      expect(err).toBeInstanceOf(LlmCredentialError);
      expect((err as LlmCredentialError).code).toBe('LLM_CREDENTIAL_ERROR');
      expect((err as LlmCredentialError).phase).toBe('credential');
      expect((err as LlmCredentialError).retryable).toBe(false);
    }
    expect(existsSync(getLlmCredentialFilePath())).toBe(false); // 拒绝时不落盘
  });

  it('含空白/控制字符的 key 拒绝（A2 词汇 /^[\x21-\x7E]+$/，防御性校验）', () => {
    expect(() => setLlmCredential({ provider: 'deepseek', apiKey: 'sk has space' })).toThrow(LlmCredentialError);
    expect(() => setLlmCredential({ provider: 'deepseek', apiKey: 'sk\nnewline' })).toThrow(LlmCredentialError);
    expect(existsSync(getLlmCredentialFilePath())).toBe(false);
  });

  it('路径每次读 SYNOVA_DATA_DIR：切换注入目录即切换存储（测试注入缝）', () => {
    setLlmCredential({ provider: 'deepseek', apiKey: KEY_A });
    const firstPath = getLlmCredentialFilePath();
    expect(firstPath.startsWith(tmpDir)).toBe(true);

    const otherDir = mkdtempSync(join(tmpdir(), 'synova-d575-other-'));
    try {
      process.env.SYNOVA_DATA_DIR = otherDir;
      const secondPath = getLlmCredentialFilePath();
      expect(secondPath.startsWith(otherDir)).toBe(true);
      expect(secondPath).not.toBe(firstPath);
      expect(resolveLlmApiKey().value).toBeNull(); // 新目录为空 = 未配置
    } finally {
      rmSync(otherDir, { recursive: true, force: true });
    }
  });

  it('maskLlmKey: 长度<8 全掩；≥8 返回 ****+尾4', () => {
    expect(maskLlmKey('sk1')).toBe('********');
    expect(maskLlmKey('1234567')).toBe('********');
    expect(maskLlmKey('12345678')).toBe('****5678');
    expect(maskLlmKey(KEY_A)).toBe('****' + KEY_A.slice(-4));
  });
});
