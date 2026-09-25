/**
 * tests/store/measurements-append-only.test.ts — Done ②: measurements 表 append-only 的物理守卫
 *
 * 判据（可证伪）: `src/` 全目录内**不得**出现针对 `measurements` 表的 `UPDATE` / `DELETE` 语句。
 *   修正历史错误的唯一合法路径 = **追加**一条新记录（`run_id`/`computed_at` 提供追溯），
 *   而非改写旧行 —— 否则"上月 runway 3 个月"这类历史读数会被静默篡改，时序层失去意义。
 *
 * 本测试是**静态断言**（读源码文本），但它守的是一条**行为不变式**；
 * 与 `measurements.test.ts` 的运行时断言互补：
 *   - 运行时: API 只暴露 INSERT/SELECT（无 update/delete 导出）
 *   - 静态: 绕过 API 直接写 SQL 也会被本测试拦下
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const SRC = join(process.cwd(), 'src');

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...tsFiles(p));
    else if (p.endsWith('.ts') && !p.endsWith('.test.ts')) out.push(p);
  }
  return out;
}

/** 命中形如 `UPDATE measurements` / `DELETE FROM measurements` 的 SQL（容忍空白与换行） */
function findMutatingSql(src: string): string[] {
  const hits: string[] = [];
  const re = /\b(UPDATE\s+measurements|DELETE\s+FROM\s+measurements)\b/gi;
  for (const m of src.matchAll(re)) hits.push(m[0].replace(/\s+/g, ' '));
  return hits;
}

describe('measurements append-only（Done ②）', () => {
  it('src/ 内 UPDATE/DELETE measurements 计数 = 0', () => {
    const offenders: Array<{ file: string; hits: string[] }> = [];
    for (const f of tsFiles(SRC)) {
      const hits = findMutatingSql(readFileSync(f, 'utf-8'));
      if (hits.length > 0) offenders.push({ file: f.replace(process.cwd() + '/', ''), hits });
    }
    expect(offenders, `发现针对 measurements 的改写语句: ${JSON.stringify(offenders)}`).toEqual([]);
  });

  it('判别性: 守卫本身能识别改写语句（改坏即红——喂样例必须命中）', () => {
    expect(findMutatingSql('db.exec("UPDATE measurements SET value = 1")')).toContain('UPDATE measurements');
    expect(findMutatingSql('db.prepare("DELETE FROM measurements WHERE metric_id = ?")')).toContain('DELETE FROM measurements');
    expect(findMutatingSql('INSERT INTO measurements (metric_id) VALUES (?)')).toEqual([]);
    expect(findMutatingSql('SELECT * FROM measurements')).toEqual([]);
  });

  it('measurements store API 只导出读/写两类（无 update/delete 导出）', async () => {
    const mod = await import('../../src/store/measurements');
    const exported = Object.keys(mod);
    expect(exported.some((k) => /update|delete|remove|drop/i.test(k))).toBe(false);
    expect(exported).toEqual(
      expect.arrayContaining(['recordMeasurement', 'recordMeasurements', 'queryMeasurements', 'latestMeasurement', 'diffMeasurement']),
    );
  });
});
