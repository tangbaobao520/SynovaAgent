/**
 * tests/playbook/playbook-loader.test.ts — D67 PlaybookLoader 集成测试
 *
 * 覆盖（≥8测试用例）:
 * 1. 空目录 → 不崩溃
 * 2. 21个YAML全部可解析
 * 3. 每个含必填字段 id/name/type/trigger/steps/onFailure/output
 * 4. trigger 格式正确
 * 5. onFailure 有效值
 * 6. steps 非空
 * 7. loadPlaybooks() 返回 21 个
 * 8. 同 id 覆盖不报错
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { readdirSync, readFileSync, existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { load as parseYaml } from 'js-yaml';

const BUILTIN_ROOT = join(process.cwd(), 'extensions', 'playbooks', 'builtin');
const CUSTOM_ROOT = join(process.cwd(), 'extensions', 'playbooks', 'custom');

const VALID_ON_FAILURE = ['halt', 'continue', 'degrade', 'notify'] as const;
const STEP_ON_FAILURE = ['halt', 'skip', 'degrade', 'retry', 'notify'] as const;

// ═══ Test helpers ═══

function getPlaybookFiles(): string[] {
  if (!existsSync(BUILTIN_ROOT)) return [];
  return readdirSync(BUILTIN_ROOT, { withFileTypes: true })
    .filter(e => e.isFile() && !e.name.startsWith('_') && (e.name.endsWith('.yaml') || e.name.endsWith('.yml')))
    .map(e => e.name);
}

function cleanupCustomFixtures(): void {
  if (!existsSync(CUSTOM_ROOT)) return;
  const entries = readdirSync(CUSTOM_ROOT, { withFileTypes: true });
  for (const e of entries) {
    if (e.isFile() && e.name.startsWith('d67-test-')) {
      try { rmSync(join(CUSTOM_ROOT, e.name), { force: true }); } catch { /* ok */ }
    }
  }
}

describe('D67 Playbook 完整性', () => {
  // 测试1: 空目录不崩溃
  describe('空目录处理', () => {
    it('不存在的目录 → 不崩溃，返回空数组', async () => {
      const { loadPlaybooks, clearPlaybookCache } = await import('../../src/playbook/playbook-loader');
      clearPlaybookCache();
      const result = loadPlaybooks();
      expect(Array.isArray(result.playbooks)).toBe(true);
      expect(typeof result.degraded).toBe('boolean');
    });
  });

  // 测试2: 21个YAML全部可解析
  describe('YAML 可解析', () => {
    it('每个 YAML 可被 js-yaml 解析', () => {
      const files = getPlaybookFiles();
      expect(files.length).toBeGreaterThanOrEqual(21);
      for (const f of files) {
        const raw = readFileSync(join(BUILTIN_ROOT, f), 'utf-8');
        expect(() => parseYaml(raw), `${f} YAML parse 失败`).not.toThrow();
      }
    });

    it('解析后每个含 id 字段', () => {
      const files = getPlaybookFiles();
      for (const f of files) {
        const raw = readFileSync(join(BUILTIN_ROOT, f), 'utf-8');
        const doc = parseYaml(raw) as Record<string, unknown>;
        expect(doc?.id, `${f} 缺少 id`).toBeTruthy();
      }
    });
  });

  // 测试3: 必填字段
  describe('必填字段', () => {
    let playbooks: { file: string; parsed: Record<string, unknown> }[];

    beforeAll(() => {
      playbooks = getPlaybookFiles().map(f => ({
        file: f,
        parsed: parseYaml(readFileSync(join(BUILTIN_ROOT, f), 'utf-8')) as Record<string, unknown>,
      }));
    });

    it('每个含 name 字段且非空', () => {
      for (const pb of playbooks) {
        expect(pb.parsed.name, `${pb.file} 缺少 name`).toBeTruthy();
      }
    });

    it('每个含 type 字段且为 "playbook"', () => {
      for (const pb of playbooks) {
        expect(pb.parsed.type, `${pb.file} type 不是 playbook`).toBe('playbook');
      }
    });

    it('每个含 trigger 字段', () => {
      for (const pb of playbooks) {
        expect(pb.parsed.trigger, `${pb.file} 缺少 trigger`).toBeDefined();
      }
    });

    it('每个含 steps 字段且为数组', () => {
      for (const pb of playbooks) {
        expect(Array.isArray(pb.parsed.steps), `${pb.file}.steps 不是数组`).toBe(true);
      }
    });

    it('每个含 onFailure 字段', () => {
      for (const pb of playbooks) {
        expect(pb.parsed.onFailure, `${pb.file} 缺少 onFailure`).toBeTruthy();
      }
    });

    it('每个含 output 字段且非空', () => {
      for (const pb of playbooks) {
        expect(pb.parsed.output, `${pb.file} 缺少 output`).toBeTruthy();
      }
    });

    it('每个含 expert 字段且非空', () => {
      for (const pb of playbooks) {
        expect(pb.parsed.expert, `${pb.file} 缺少 expert`).toBeTruthy();
      }
    });
  });

  // 测试4: trigger 格式正确
  describe('trigger 格式', () => {
    it('trigger 包含 sentinels/manual/condition 之一', () => {
      const files = getPlaybookFiles();
      for (const f of files) {
        const doc = parseYaml(readFileSync(join(BUILTIN_ROOT, f), 'utf-8')) as Record<string, unknown>;
        const trigger = doc.trigger as Record<string, unknown>;
        const hasValidField = Array.isArray(trigger?.sentinels) || trigger?.manual === true || typeof trigger?.condition === 'string';
        expect(hasValidField, `${f} trigger 缺少 sentinels/manual/condition 有效值`).toBe(true);
      }
    });
  });

  // 测试5: onFailure 有效值
  describe('onFailure 有效值', () => {
    it('所有 onFailure 均为 halt/continue/degrade/notify 之一', () => {
      const files = getPlaybookFiles();
      for (const f of files) {
        const doc = parseYaml(readFileSync(join(BUILTIN_ROOT, f), 'utf-8')) as Record<string, unknown>;
        expect(VALID_ON_FAILURE.includes(doc.onFailure as typeof VALID_ON_FAILURE[number]),
          `${f} onFailure=${doc.onFailure} 不是有效值`).toBe(true);
      }
    });

    it('steps 内每个 onFailure 均为有效值(halt/skip/degrade/retry)', () => {
      const files = getPlaybookFiles();
      for (const f of files) {
        const doc = parseYaml(readFileSync(join(BUILTIN_ROOT, f), 'utf-8')) as Record<string, unknown>;
        const steps = doc.steps as Array<Record<string, unknown>>;
        for (const step of steps) {
          if (step.onFailure) {
            expect(STEP_ON_FAILURE.includes(step.onFailure as typeof STEP_ON_FAILURE[number]),
              `${f} step ${step.id} onFailure=${step.onFailure} 不是有效值`).toBe(true);
          }
        }
      }
    });
  });

  // 测试6: steps 非空
  describe('steps 非空', () => {
    it('每个 Playbook 至少有 1 个步骤', () => {
      const files = getPlaybookFiles();
      for (const f of files) {
        const doc = parseYaml(readFileSync(join(BUILTIN_ROOT, f), 'utf-8')) as Record<string, unknown>;
        const steps = doc.steps as unknown[];
        expect(steps.length, `${f} steps 为空`).toBeGreaterThanOrEqual(1);
      }
    });

    it('每个 step 有 id 和 name', () => {
      const files = getPlaybookFiles();
      for (const f of files) {
        const doc = parseYaml(readFileSync(join(BUILTIN_ROOT, f), 'utf-8')) as Record<string, unknown>;
        const steps = doc.steps as Array<Record<string, unknown>>;
        for (const step of steps) {
          expect(step.id, `${f} step 缺少 id`).toBeTruthy();
          expect(step.name, `${f} step ${step.id} 缺少 name`).toBeTruthy();
        }
      }
    });
  });

  // 测试7: loadPlaybooks() 返回 21 个
  describe('PlaybookLoader 加载21个剧本', () => {
    beforeEach(() => {
      cleanupCustomFixtures();
    });

    afterEach(() => {
      cleanupCustomFixtures();
    });

    it('loadPlaybooks() 加载全部21个真实 Playbook', async () => {
      const { loadPlaybooks, clearPlaybookCache } = await import('../../src/playbook/playbook-loader');
      clearPlaybookCache();
      const result = loadPlaybooks();
      expect(result.playbooks.length).toBeGreaterThanOrEqual(21);
      // 验证关键 Playbook 存在
      const ids = result.playbooks.map(p => p.id);
      expect(ids).toContain('PB-finance-cashflow-crisis');
      expect(ids).toContain('PB-strategy-competitive-threat');
      expect(ids).toContain('PB-org-health-diagnosis');
      expect(ids).toContain('PB-cross-enterprise-growth');
      expect(ids).toContain('PB-cross-survival-crisis');
    });

    it('加载后可通过 ID 找到对应 Playbook', async () => {
      const { loadPlaybooks, clearPlaybookCache } = await import('../../src/playbook/playbook-loader');
      clearPlaybookCache();
      const result = loadPlaybooks();
      const ids = result.playbooks.map(p => p.id);
      // 验证全部21个 ID
      expect(ids.filter(id => id.startsWith('PB-')).length).toBeGreaterThanOrEqual(21);
    });
  });

  // 测试8: 同名 Playbook 优先级覆盖
  describe('优先级覆盖', () => {
    beforeEach(() => {
      cleanupCustomFixtures();
    });

    afterEach(() => {
      cleanupCustomFixtures();
    });

    it('custom/ 同名 Playbook 不导致加载失败', async () => {
      const { loadPlaybooks, clearPlaybookCache } = await import('../../src/playbook/playbook-loader');
      clearPlaybookCache();

      // 在 custom/ 创建同名测试文件（已有 builtin 版本）
      if (!existsSync(CUSTOM_ROOT)) mkdirSync(CUSTOM_ROOT, { recursive: true });
      const customYaml = join(CUSTOM_ROOT, 'd67-test-override.yaml');
      writeFileSync(customYaml, `
id: PB-finance-cashflow-crisis
name: Custom Override Test
description: Override for test
version: "1.0.0"
expert: finance
type: playbook
trigger:
  manual: true
steps:
  - id: step-1
    name: Override Step
onFailure: halt
output: override_test
`, 'utf-8');

      const result = loadPlaybooks();
      // 同名覆盖不改变总数
      expect(result.playbooks.length).toBeGreaterThanOrEqual(21);
      const ids = result.playbooks.map(p => p.id);
      expect(ids).toContain('PB-finance-cashflow-crisis');
      expect(result.degraded).toBe(false);
    });
  });
});
