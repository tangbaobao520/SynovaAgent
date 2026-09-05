/**
 * tests/agent/expert-config-loader.test.ts — D490 parseSimpleYaml 契约测试
 *
 * 契约（铁律 47）：
 *   @input   expert/expert-registry.yaml v2.0（嵌套结构，专家键含连字符）
 *   @output  loadExpertConfig() → { version, experts: Record<key, {enabled, background, model, tools}> }
 *   @degraded yaml 缺失/解析失败 → fail-open 返回 { version: 1, experts: {} }（log.warn/error，
 *            消费方 expert-dispatcher.ts:527-529 回退 Registry 文件扫描全专家）
 *
 * 历史教训（D490 / D488 v2 上报）：parseSimpleYaml 专家键分支
 * `/^  [a-z_]+:$/.test(line) && !line.includes(':')` 自相矛盾恒假 → 恒解析 0 专家，
 * 消费方静默回退「全专家参与诊断」，yaml 声明式过滤失效。
 * RED 阶段（修复前）：用例 ①②⑤ 失败（0 专家）；用例 ③④ 通过（降级与缓存语义本就正确）。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  loadExpertConfig,
  clearExpertConfigCache,
  getEnabledDiagnosticExperts,
  getBackgroundExperts,
} from '../../src/agent/expert-config-loader';

/** yaml v2.0（D282 定稿）声明的专家集合 */
const DIAGNOSTIC_EXPERTS = ['competitive-strategy', 'finance-structure', 'host'].sort();
const BACKGROUND_EXPERTS = ['capital-cycle', 'customer-cycle', 'talent-cycle', 'tech'].sort();

beforeEach(() => clearExpertConfigCache());
afterEach(() => clearExpertConfigCache());

describe('expert-config-loader — parseSimpleYaml 契约（D490）', () => {
  it('① 真实 expert-registry.yaml v2.0：7 专家全解析（含 5 个连字符键）', () => {
    const config = loadExpertConfig();
    expect(Object.keys(config.experts).sort()).toEqual([...DIAGNOSTIC_EXPERTS, ...BACKGROUND_EXPERTS].sort());
    expect(config.version).toBe(2);
    // 连字符键缺陷 B 专项：修复前 [a-z_]+ 不匹配，5 键必漏
    for (const key of ['capital-cycle', 'finance-structure', 'competitive-strategy']) {
      expect(config.experts[key]).toBeDefined();
    }
  });

  it('② enabled/background 声明正确：3 诊断 + 4 后台（yaml 过滤真实生效）', () => {
    const config = loadExpertConfig();
    expect(getEnabledDiagnosticExperts(config).sort()).toEqual(DIAGNOSTIC_EXPERTS);
    expect([...getBackgroundExperts(config)].sort()).toEqual(BACKGROUND_EXPERTS);
  });

  it('③ yaml 缺失 → fail-open 返回空配置（消费方回退文件扫描）', () => {
    const missingPath = join(tmpdir(), `d490-nonexistent-${Date.now()}.yaml`);
    const config = loadExpertConfig(missingPath);
    expect(Object.keys(config.experts)).toEqual([]);
    expect(config.version).toBe(1);
  });

  it('④ 缓存语义：同对象复用 + clear 后重新加载', () => {
    const first = loadExpertConfig();
    expect(loadExpertConfig()).toBe(first);
    clearExpertConfigCache();
    expect(loadExpertConfig()).not.toBe(first);
  });

  it('⑤ 边界：连字符键 + enabled/background 组合在合成 yaml 上正确解析', () => {
    const dir = mkdtempSync(join(tmpdir(), 'd490-'));
    const yamlPath = join(dir, 'registry.yaml');
    writeFileSync(
      yamlPath,
      [
        'version: 2',
        '',
        'experts:',
        '  host:',
        '    enabled: true',
        '    background: false',
        '  edge-case-expert:',
        '    enabled: true',
        '    background: true',
        '  disabled-expert:',
        '    enabled: false',
        '    background: false',
        '',
      ].join('\n'),
    );
    try {
      const config = loadExpertConfig(yamlPath);
      expect(config.experts['edge-case-expert']).toEqual({
        enabled: true,
        background: true,
        model: 'default',
        tools: [],
      });
      expect(getEnabledDiagnosticExperts(config)).toEqual(['host']);
      expect([...getBackgroundExperts(config)]).toEqual(['edge-case-expert']);
      expect(getEnabledDiagnosticExperts(config).includes('disabled-expert')).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
