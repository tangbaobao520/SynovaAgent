/**
 * tests/expert/analytical-lens.test.ts — D70 analytical_lens 完整性测试
 *
 * 覆盖:
 * - 9个专家 IDENTITY.md 均含 analytical_lens 章节
 * - 每个含 default_dimension + primary_edges + blind_spots
 * - primary_edges 格式正确（E-XX 逗号分隔）
 * - blind_spots 非空
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const EXPERTS = ['finance', 'strategy', 'org', 'marketing', 'tech', 'action', 'business_model', 'knowledge', 'host'];
const EXPECTED_FIELDS = ['default_dimension', 'primary_edges', 'blind_spots'];

describe('analytical_lens 完整性', () => {
  for (const expert of EXPERTS) {
    const filePath = join(process.cwd(), 'expert', expert, 'IDENTITY.md');

    it(`${expert} IDENTITY.md 存在`, () => {
      expect(existsSync(filePath)).toBe(true);
    });

    if (!existsSync(filePath)) continue;
    const content = readFileSync(filePath, 'utf-8');

    it(`${expert} 含 ## analytical_lens 章节`, () => {
      expect(content).toContain('## analytical_lens');
    });

    describe(`${expert} analytical_lens 字段`, () => {
      for (const field of EXPECTED_FIELDS) {
        it(`含 ${field}`, () => {
          expect(content).toContain(`${field}:`);
        });
      }

      it('primary_edges 格式正确（E-XX 模式）', () => {
        const match = content.match(/primary_edges:\s*(.+)/);
        expect(match).not.toBeNull();
        if (match) {
          expect(match[1].trim().length).toBeGreaterThan(0);
        }
      });

      it('blind_spots 非空', () => {
        const match = content.match(/blind_spots:\s*(.+)/);
        expect(match).not.toBeNull();
        if (match) {
          expect(match[1].trim().length).toBeGreaterThan(0);
        }
      });
    });
  }
});
