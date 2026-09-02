/**
 * tests/expert/expert-enum-propagation.test.ts — D567: 专家枚举唯一事实源回归锁（K3 15-1）
 *
 * 契约:
 *   @input  — expert/expert-registry.yaml（唯一事实源）+ K3 15-1 点名的 5 处曾硬编码旧专家枚举的源文件
 *   @output — 断言 ① 加载器返回 registry 全量专家（yaml 声明序，当前 7 位）
 *             ② 旧 6/8/9 位成员已全部退出注册表（D282 迁移语义锁定）
 *             ③ 5 处源文件零封闭枚举残留（EXPERT_NAMES / BUILTIN_EXPERTS / ALL_EXPERTS / 维度映射 / 类型 union）
 *   @degraded — yaml 缺失/解析失败时 getAllExpertIds() 返回 []（加载器 log.warn，调用方自行降级）；
 *               本测试在 yaml 缺失时直接失败暴露（测试环境必须能读到事实源）
 *
 * S-5 先红记录: main 现状（旧枚举硬编码）下 5 个内容断言 + 加载器断言红 → 实现后全绿。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { getAllExpertIds } from '../../src/agent/expert-config-loader';

const ROOT = join(import.meta.dirname, '..', '..');

/** registry 7 位（D282 v2.0）— 与 expert/expert-registry.yaml 声明序一致 */
const REGISTRY_SEVEN = [
  'host', 'capital-cycle', 'customer-cycle', 'talent-cycle', 'tech', 'finance-structure', 'competitive-strategy',
];

/** D282 迁移前的旧枚举成员（旧 6 位 + business_model/knowledge） */
const LEGACY_IDS = ['strategy', 'org', 'finance', 'marketing', 'action', 'business_model', 'knowledge'];

/** K3 15-1 点名的 5 处硬编码现场 — 各自的封闭枚举特征模式（修复后不得再命中） */
const SITES: Array<{ file: string; patterns: RegExp[] }> = [
  {
    file: 'src/tui-v2/chat.tsx',
    patterns: [/marketing:\s*'营销'/, /EXPERT_NAMES:\s*Record<string,\s*string>\s*=\s*\{/],
  },
  { file: 'src/cli/commands/expert.ts', patterns: [/const BUILTIN_EXPERTS\s*=\s*\[/] },
  { file: 'src/agent/cross-validator.ts', patterns: [/const ALL_EXPERTS\s*=\s*\[/] },
  { file: 'src/l3/synova-diagnosis-engine-impl.ts', patterns: [/D1:\s*'strategy'/] },
  {
    file: 'src/sentinel/runner.ts',
    patterns: [/environment:\s*\['strategy'\]/, /'strategy'\s*\|\s*'org'\s*\|\s*'finance'/],
  },
];

describe('D567: 专家枚举唯一事实源（expert-registry.yaml）', () => {
  it('加载器返回 registry 全量专家（yaml 声明序，当前 7 位）', () => {
    expect(getAllExpertIds()).toEqual(REGISTRY_SEVEN);
  });

  it('旧 6/8/9 位成员已全部退出注册表', () => {
    const ids = new Set(getAllExpertIds());
    for (const legacy of LEGACY_IDS) {
      expect(ids.has(legacy), `旧专家 "${legacy}" 不应出现在 expert-registry.yaml`).toBe(false);
    }
  });

  for (const site of SITES) {
    it(`${site.file} 零旧专家封闭枚举残留`, () => {
      const src = readFileSync(join(ROOT, site.file), 'utf-8');
      for (const p of site.patterns) {
        expect(src, `${site.file} 仍命中封闭枚举模式 ${p}`).not.toMatch(p);
      }
    });
  }
});
