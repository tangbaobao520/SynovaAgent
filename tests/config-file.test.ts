/**
 * tests/config-file.test.ts — C5 synova.json 配置加载器测试
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  loadFileConfig, saveFileConfig, rollbackConfig, validateConfig,
  DEFAULT_CONFIG, type SynovaFileConfig,
} from '../src/config-file';
import { writeFileSync, unlinkSync, existsSync, copyFileSync } from 'fs';

const TEST_CONFIG_PATH = '/tmp/synova-test-config.json';

function cleanTestFiles(): void {
  try { unlinkSync(TEST_CONFIG_PATH); } catch {/* ok */}
  try { unlinkSync(TEST_CONFIG_PATH + '.last-good'); } catch {/* ok */}
}

describe('config-file', () => {
  beforeEach(cleanTestFiles);
  afterEach(cleanTestFiles);

  describe('loadFileConfig()', () => {
    it('Given no config file, When loaded, Then returns default config', () => {
      const config = loadFileConfig(TEST_CONFIG_PATH);
      expect(config.version).toBe(1);
      expect(config.server.port).toBe(18790);    });

    it('Given valid config file, When loaded, Then returns parsed config', () => {
      const testConfig: SynovaFileConfig = {
        ...DEFAULT_CONFIG,
        server: { port: 3000 },
        context: { compressionStrategy: 'summary', maxMessagesBeforeCompression: 50, windowSize: 25 },
      };
      writeFileSync(TEST_CONFIG_PATH, JSON.stringify(testConfig));

      const config = loadFileConfig(TEST_CONFIG_PATH);
      expect(config.server.port).toBe(3000);
      expect(config.context.compressionStrategy).toBe('summary');
    });

    it('Given corrupted config, When loaded, Then falls back to last-good', () => {
      // First write a good config as last-good
      const goodConfig: SynovaFileConfig = { ...DEFAULT_CONFIG, server: { port: 4000 } };
      writeFileSync(TEST_CONFIG_PATH + '.last-good', JSON.stringify(goodConfig));
      // Then corrupt the main config
      writeFileSync(TEST_CONFIG_PATH, '{invalid json!!!}');

      const config = loadFileConfig(TEST_CONFIG_PATH);
      expect(config.server.port).toBe(4000);
    });

    it('Given all config files corrupted, When loaded, Then returns default', () => {
      writeFileSync(TEST_CONFIG_PATH, '{invalid}');
      writeFileSync(TEST_CONFIG_PATH + '.last-good', '{also invalid}');

      const config = loadFileConfig(TEST_CONFIG_PATH);
      expect(config.version).toBe(1);
    });
  });

  describe('saveFileConfig()', () => {
    it('Given config, When saved, Then file exists', () => {
      saveFileConfig(DEFAULT_CONFIG, TEST_CONFIG_PATH);
      expect(existsSync(TEST_CONFIG_PATH)).toBe(true);
    });

    it('Given existing config, When saved, Then creates last-good backup', () => {
      const v1: SynovaFileConfig = { ...DEFAULT_CONFIG, server: { port: 100 } };
      const v2: SynovaFileConfig = { ...DEFAULT_CONFIG, server: { port: 200 } };

      saveFileConfig(v1, TEST_CONFIG_PATH);
      saveFileConfig(v2, TEST_CONFIG_PATH);

      expect(existsSync(TEST_CONFIG_PATH + '.last-good')).toBe(true);
      // last-good should be v1
      const config = loadFileConfig(TEST_CONFIG_PATH);
      expect(config.server.port).toBe(200);
    });
  });

  describe('rollbackConfig()', () => {
    it('Given existing last-good, When rolled back, Then restores config', () => {
      const original: SynovaFileConfig = { ...DEFAULT_CONFIG, server: { port: 5000 } };
      writeFileSync(TEST_CONFIG_PATH, JSON.stringify({ ...DEFAULT_CONFIG, server: { port: 9999 } }));
      writeFileSync(TEST_CONFIG_PATH + '.last-good', JSON.stringify(original));

      const rolled = rollbackConfig(TEST_CONFIG_PATH);
      expect(rolled.server.port).toBe(5000);

      // Verify the config file was restored
      const loaded = loadFileConfig(TEST_CONFIG_PATH);
      expect(loaded.server.port).toBe(5000);
    });

    it('Given no last-good, When rolled back, Then throws', () => {
      expect(() => rollbackConfig(TEST_CONFIG_PATH)).toThrow();
    });
  });

  describe('validateConfig()', () => {
    it('Given valid config, When validated, Then returns empty errors', () => {
      const errors = validateConfig(DEFAULT_CONFIG);
      expect(errors).toHaveLength(0);
    });

    it('Given null config, When validated, Then returns error', () => {
      const errors = validateConfig(null);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('Given invalid port, When validated, Then returns error', () => {
      const errors = validateConfig({ ...DEFAULT_CONFIG, server: { port: 0 } });
      expect(errors.length).toBeGreaterThan(0);
    });

    it('Given invalid compression strategy, When validated, Then returns error', () => {
      const errors = validateConfig({
        ...DEFAULT_CONFIG,
        context: { ...DEFAULT_CONFIG.context, compressionStrategy: 'invalid' },
      });
      expect(errors.length).toBeGreaterThan(0);
    });

    it('Given negative maxToolRounds, When validated, Then returns error', () => {
      const errors = validateConfig({
        ...DEFAULT_CONFIG,
        diagnosis: { ...DEFAULT_CONFIG.diagnosis, maxToolRounds: 0 },
      });
      expect(errors.length).toBeGreaterThan(0);
    });
  });
});
