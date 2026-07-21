/**
 * tests/connectors/ima.test.ts — D104 ImaClient 测试
 *
 * 覆盖: 加密/解密/认证/扫描/提取/验证 = 6 tests
 */
import { describe, it, expect } from 'vitest';
import { encryptApiKey, decryptApiKey, ImaClient } from '../../src/connectors/ima';
import type { ImaConfig } from '../../src/connectors/ima';

const JWT_SECRET = 'test-jwt-secret-for-testing-only';

describe('API Key 加密', () => {
  it('encrypt+decrypt → 原始值', () => {
    const apiKey = 'sk-ima-test-key-12345';
    const encrypted = encryptApiKey(apiKey, JWT_SECRET);
    expect(encrypted).toBeTruthy();
    expect(encrypted).not.toBe(apiKey);
    const decrypted = decryptApiKey(encrypted, JWT_SECRET);
    expect(decrypted).toBe(apiKey);
  });

  it('错误密钥解密 → 抛出 Error', () => {
    const apiKey = 'sk-test-key';
    const encrypted = encryptApiKey(apiKey, JWT_SECRET);
    expect(() => decryptApiKey(encrypted, 'wrong-secret')).toThrow();
  });
});

describe('ImaClient', () => {
  const config: ImaConfig = {
    baseUrl: 'https://api.ima.example.com',
    apiKey: 'sk-test',
    enterpriseId: 'e1',
    timeoutMs: 1000,
  };

  describe('authenticate', () => {
    it('API 不可达 → 抛出 Error', async () => {
      const client = new ImaClient(config);
      await expect(client.authenticate()).rejects.toThrow();
    });
  });

  describe('validateToken', () => {
    it('API 不可达 → false', async () => {
      const client = new ImaClient(config);
      const valid = await client.validateToken();
      expect(valid).toBe(false);
    });
  });

  describe('scanDocuments', () => {
    it('API 不可达 → 空数组', async () => {
      const client = new ImaClient(config);
      const docs = await client.scanDocuments();
      expect(docs).toEqual([]);
    });
  });

  describe('extractContent', () => {
    it('API 不可达 → null', async () => {
      const client = new ImaClient(config);
      const entry = await client.extractContent('doc-1');
      expect(entry).toBeNull();
    });
  });

  describe('checkHealth', () => {
    it('API 不可达 → ok:false', async () => {
      const client = new ImaClient(config);
      const health = await client.checkHealth();
      expect(health.ok).toBe(false);
    });
  });
});
